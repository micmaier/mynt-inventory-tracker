import { prisma } from "@/src/lib/db";
import ScannedOrdersClient from "./ScannedOrdersClient";

export const dynamic = "force-dynamic";

function parseFrom(searchParams: Record<string, string | string[] | undefined>): Date | null {
  const raw = searchParams.from;
  const v = Array.isArray(raw) ? raw[0] : raw;
  if (!v) return null;
  // erwartet YYYY-MM-DD
  const d = new Date(`${v}T00:00:00.000Z`);
  return Number.isFinite(d.getTime()) ? d : null;
}

export default async function ScannedOrdersPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const fromDate = parseFrom(searchParams);

  const processedOrders = await prisma.processedOrder.findMany({
    where: fromDate ? { orderCreatedAt: { gte: fromDate } } : undefined,
    orderBy: [{ orderCreatedAt: "desc" }, { processedAt: "desc" }],
    take: 500, // Safety
    select: {
      orderId: true,
      orderName: true,
      orderCreatedAt: true,
      processedAt: true,
    },
  });

  const orderIds = processedOrders.map((o) => o.orderId);

  const movements = orderIds.length
    ? await prisma.inventoryMovement.findMany({
        where: { orderId: { in: orderIds } },
        orderBy: [{ orderCreatedAt: "desc" }],
        select: {
          orderId: true,
          baseType: true,
          category: true,
          size: true,
          qtyUsed: true,
        },
      })
    : [];

  const movByOrder = new Map<string, Array<{ baseType: string; category: string; size: string; qtyUsed: number }>>();
  for (const m of movements) {
    if (!movByOrder.has(m.orderId)) movByOrder.set(m.orderId, []);
    movByOrder.get(m.orderId)!.push({
      baseType: m.baseType,
      category: m.category,
      size: m.size,
      qtyUsed: m.qtyUsed,
    });
  }

  const rows = processedOrders.map((o) => ({
    orderId: o.orderId,
    orderName: o.orderName,
    orderCreatedAt: o.orderCreatedAt ? o.orderCreatedAt.toISOString() : null,
    processedAt: o.processedAt.toISOString(),
    movements: movByOrder.get(o.orderId) ?? [],
  }));

  return (
    <main style={{ padding: 24, fontFamily: "system-ui, -apple-system, Segoe UI, Roboto" }}>
      <h1 style={{ fontSize: 22, marginBottom: 6 }}>Scanned Orders</h1>
      <div style={{ color: "#666", fontSize: 13, marginBottom: 14 }}>
        Zeigt alle Orders, die beim Scan berücksichtigt wurden – inkl. “betroffene Produkte” (Inventory-Buckets).
      </div>

      <ScannedOrdersClient initialFrom={fromDate ? fromDate.toISOString().slice(0, 10) : ""} rows={rows} />
    </main>
  );
}
