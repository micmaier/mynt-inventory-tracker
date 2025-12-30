import { NextResponse } from "next/server";
import { prisma } from "@/src/lib/db";
import { fetchPaidOrders } from "@/src/lib/shopify";
import { classifyLineItem } from "@/src/lib/inventory";

function parseFromParam(req: Request): Date | null {
  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from");
  if (!from) return null;

  const d = new Date(`${from}T00:00:00.000Z`);
  return Number.isFinite(d.getTime()) ? d : null;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const secret = searchParams.get("secret");

  if (!process.env.SCAN_SECRET) {
    return NextResponse.json({ ok: false, error: "SCAN_SECRET missing" }, { status: 500 });
  }
  if (secret !== process.env.SCAN_SECRET) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  if (!process.env.SHOPIFY_STORE_DOMAIN || !process.env.SHOPIFY_ACCESS_TOKEN) {
    return NextResponse.json({ ok: false, error: "Missing Shopify env vars" }, { status: 500 });
  }

  // ✅ NEU: wenn kein from Param → serverseitiges DefaultFrom nutzen
  const fromParam = parseFromParam(req);
  const settings = await prisma.inventorySettings.findUnique({ where: { id: "default" } });
  const fromDate = fromParam ?? settings?.defaultFrom ?? null;

  const createdAtMin = fromDate ? `${fromDate.toISOString().slice(0, 10)}T00:00:00+00:00` : undefined;

  try {
    // ✅ Punkt 3: alles außerhalb Zeitraum entfernen
    // Wenn ein Zeitraum gewählt ist: diesen Zeitraum immer frisch aufbauen
    if (fromDate) {
      await prisma.inventoryMovement.deleteMany({
        where: { orderCreatedAt: { gte: fromDate } },
      });
      await prisma.processedOrder.deleteMany({
        where: { orderCreatedAt: { gte: fromDate } },
      });
    }

    const orders = await fetchPaidOrders(createdAtMin ? { createdAtMin } : undefined);

    let processed = 0;
    let skipped = 0;
    let movementsCreated = 0;
    let ignoredLineItems = 0;

    for (const o of orders) {
      const orderId = String(o.id);

      const already = await prisma.processedOrder.findUnique({ where: { orderId } });
      if (already) {
        skipped++;
        continue;
      }

      const bucket = new Map<
        string,
        { baseType: string; category: string; size: string; qty: number }
      >();

      for (const li of o.line_items || []) {
        const cls = await classifyLineItem(li);
        if (!cls) {
          ignoredLineItems++;
          continue;
        }
        const key = `${cls.baseType}|${cls.category}|${cls.size}`;
        bucket.set(key, {
          baseType: cls.baseType,
          category: cls.category,
          size: cls.size,
          qty: (bucket.get(key)?.qty ?? 0) + (li.quantity ?? 0),
        });
      }

      const createdAt = new Date(o.created_at);
      const orderName = (o as any).name ?? null;

      await prisma.$transaction(async (tx) => {
        await tx.processedOrder.create({
          data: {
            orderId,
            orderName,
            orderCreatedAt: createdAt,
          },
        });

        for (const m of bucket.values()) {
          if (m.qty <= 0) continue;
          await tx.inventoryMovement.create({
            data: {
              orderId,
              orderCreatedAt: createdAt,
              baseType: m.baseType,
              category: m.category,
              size: m.size,
              qtyUsed: m.qty,
            },
          });
          movementsCreated++;
        }
      });

      processed++;
    }

    return NextResponse.json({
      ok: true,
      processed,
      skipped,
      movementsCreated,
      ignoredLineItems,
      ordersFetched: orders.length,
      from: fromDate ? fromDate.toISOString().slice(0, 10) : null,
    });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
