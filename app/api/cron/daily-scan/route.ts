import { NextResponse } from "next/server";
import { prisma } from "@/src/lib/db";
import { getResendClient, getEmailConfig } from "@/src/lib/email";

/**
 * Calls the existing /api/inventory/scan using:
 * - defaultFrom from InventorySettings (id="default")
 * - SCAN_SECRET for the scan route
 * Guarded by CRON_SECRET for external scheduler calls.
 *
 * Additionally (Option B):
 * - Sends 1 daily email (max once per UTC day) listing all products below min.
 * - Uses InventoryEmailLog(kind="daily", forDate=UTC day 00:00) as de-dup guard.
 */
export async function GET(req: Request) {
  const { searchParams, origin } = new URL(req.url);
  const secret = searchParams.get("secret");

  if (!process.env.CRON_SECRET) {
    return NextResponse.json({ ok: false, error: "CRON_SECRET missing" }, { status: 500 });
  }
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  if (!process.env.SCAN_SECRET) {
    return NextResponse.json({ ok: false, error: "SCAN_SECRET missing" }, { status: 500 });
  }

  // Read stored defaultFrom (YYYY-MM-DD)
  const settings = await prisma.inventorySettings.findUnique({ where: { id: "default" } });
  const defaultFrom = settings?.defaultFrom ? settings.defaultFrom.toISOString().slice(0, 10) : null;

  // Build scan URL (same origin) and call existing endpoint
  const q = new URLSearchParams();
  q.set("secret", process.env.SCAN_SECRET);
  if (defaultFrom) q.set("from", defaultFrom);

  const scanUrl = `${origin}/api/inventory/scan?${q.toString()}`;

  try {
    const res = await fetch(scanUrl, { method: "GET", cache: "no-store" });
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: data?.error || "Scan failed",
          status: res.status,
          defaultFrom,
        },
        { status: 500 }
      );
    }

    // -------------------------
    // ✅ Daily email reporting (Option B) – guarded by InventoryEmailLog (1x/day)
    // -------------------------
    let email: any = { sent: false, skipped: null as string | null };

    try {
      const { from, to, appUrl } = getEmailConfig();
      const resend = getResendClient();

      // "Today" in UTC (00:00)
      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);

      // Already sent today?
      const already = await prisma.inventoryEmailLog.findUnique({
        where: { kind_forDate: { kind: "daily", forDate: today } },
      });

      if (already) {
        email = { sent: false, skipped: "already_sent_today", criticalCnt: already.criticalCnt };
      } else {
        // Recompute low-stock list using DB basis (Start - Used since defaultFrom)
        const starts = await prisma.inventoryStart.findMany();

        const fromISO = defaultFrom; // can be null
        const fromDate = fromISO ? new Date(`${fromISO}T00:00:00.000Z`) : null;
        const fromMs = fromDate ? fromDate.getTime() : null;

        const moves = await prisma.inventoryMovement.findMany({
          select: { baseType: true, category: true, size: true, qtyUsed: true, orderCreatedAt: true },
        });

        const key = (baseType: string, category: string, size: string) => `${baseType}|${category}|${size}`;
        const toMs = (v: any) => {
          if (v instanceof Date) return v.getTime();
          const d = new Date(v);
          return Number.isFinite(d.getTime()) ? d.getTime() : 0;
        };

        const usedMap = new Map<string, number>();
        for (const m of moves) {
          const ms = toMs(m.orderCreatedAt);
          if (fromMs != null && ms < fromMs) continue;
          const k = key(m.baseType, m.category, m.size);
          usedMap.set(k, (usedMap.get(k) ?? 0) + (m.qtyUsed ?? 0));
        }

        // legacy compatibility (same intent as your page.tsx)
        function isLegacyNonColorStart(s: { baseType: string; category: string; size: string }) {
          return s.size === "-" && (s.baseType === "Hilfsmittel" || s.baseType === "Ware" || s.baseType === "Verpackung");
        }
        function legacyToNewCategory(legacyBaseType: string, legacyItemName: string) {
          if (legacyBaseType === "Hilfsmittel" && legacyItemName.startsWith("Paste ")) return "Pigmente";
          return "Versandmaterial";
        }

        const startRows: Array<{
          baseType: string;
          category: string;
          size: string;
          startQty: number;
          minQty: number;
        }> = [];

        const exists = new Set<string>();
        for (const s of starts) {
          const row = {
            baseType: s.baseType,
            category: s.category,
            size: s.size,
            startQty: s.startQty ?? 0,
            minQty: s.minQty ?? 0,
          };
          startRows.push(row);
          exists.add(key(row.baseType, row.category, row.size));

          if (isLegacyNonColorStart(s)) {
            const newBase = s.category;
            const newCategory = legacyToNewCategory(s.baseType, s.category);
            const nk = key(newBase, newCategory, s.size);

            if (!exists.has(nk)) {
              startRows.push({
                baseType: newBase,
                category: newCategory,
                size: s.size,
                startQty: s.startQty ?? 0,
                minQty: s.minQty ?? 0,
              });
              exists.add(nk);
            }
          }
        }

        const low = startRows
          .map((r) => {
            const used = usedMap.get(key(r.baseType, r.category, r.size)) ?? 0;
            const remaining = (r.startQty ?? 0) - used;
            return { ...r, usedQty: used, remainingQty: remaining };
          })
          .filter((r) => (r.remainingQty ?? 0) < (r.minQty ?? 0))
          .sort((a, b) => a.remainingQty - a.minQty - (b.remainingQty - b.minQty));

        if (low.length === 0) {
          email = { sent: false, skipped: "no_low_stock" };
        } else {
          const yyyyMmDd = today.toISOString().slice(0, 10);
          const subject = `Mynt Inventory – ${low.length} unter Minimum (${yyyyMmDd})`;

          const baseUrl = appUrl.replace(/\/$/, "");
          const urlWithFrom = fromISO
            ? `${baseUrl}/inventory?from=${encodeURIComponent(fromISO)}`
            : `${baseUrl}/inventory`;

          const itemsHtml = low
            .map(
              (r) =>
                `<li style="margin:0 0 6px 0;">
                  <b>${escapeHtml(r.baseType)}</b> / ${escapeHtml(r.category)} ${
                  r.size !== "-" ? `(${escapeHtml(r.size)})` : ""
                }
                  – Remaining <b style="color:#b00020;">${r.remainingQty}</b> / Min ${r.minQty}
                </li>`
            )
            .join("");

          const html = `
            <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif; line-height:1.45; color:#111;">
              <h2 style="margin:0 0 10px 0;">Inventory Alert</h2>
              <div style="color:#555; margin:0 0 14px 0;">
                ${low.length} Produkte sind aktuell <b>unter dem Mindestbestand</b>.
                ${fromISO ? `Zeitraum ab: <b>${escapeHtml(fromISO)}</b>.` : ""}
              </div>

              <div style="padding:12px; border:1px solid #eee; border-radius:10px; background:#fafafa;">
                <ul style="margin:0; padding-left:18px;">
                  ${itemsHtml}
                </ul>
              </div>

              <div style="margin-top:16px;">
                <a href="${urlWithFrom}" style="display:inline-block; padding:10px 14px; border-radius:10px; border:1px solid #111; color:#111; text-decoration:none;">
                  Inventory öffnen
                </a>
              </div>

              <div style="margin-top:14px; color:#777; font-size:12px;">
                Diese E-Mail wurde automatisch versendet.
              </div>
            </div>
          `;

          await resend.emails.send({
            from,
            to,
            subject,
            html,
          });

          await prisma.inventoryEmailLog.create({
            data: {
              kind: "daily",
              forDate: today,
              criticalCnt: low.length,
            },
          });

          email = { sent: true, criticalCnt: low.length, to, subject, url: urlWithFrom };
        }
      }
    } catch (e: any) {
      // don't fail cron scan if mail fails
      email = { sent: false, skipped: "email_error", error: e?.message || String(e) };
    }

    return NextResponse.json({
      ok: true,
      ranAt: new Date().toISOString(),
      defaultFrom,
      scan: data, // includes processed/skipped/movementsCreated etc.
      email, // ✅ new
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Cron scan error" }, { status: 500 });
  }
}

function escapeHtml(s: any) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
