import { NextResponse } from "next/server";
import { prisma } from "@/src/lib/db";

/**
 * Calls the existing /api/inventory/scan using:
 * - defaultFrom from InventorySettings (id="default")
 * - SCAN_SECRET for the scan route
 * Guarded by CRON_SECRET for external scheduler calls.
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

    return NextResponse.json({
      ok: true,
      ranAt: new Date().toISOString(),
      defaultFrom,
      scan: data, // includes processed/skipped/movementsCreated etc.
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Cron scan error" }, { status: 500 });
  }
}
