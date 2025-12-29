import { prisma } from "@/src/lib/db";
import { ALLOWED_SIZES } from "@/src/lib/inventory";
import InventoryClient from "./InventoryClient";

export const dynamic = "force-dynamic";

function k(baseType: string, category: string, size: string) {
  return `${baseType}|${category}|${size}`;
}

// ✅ Next 16 / Turbopack: searchParams kann Promise sein → wir geben hier nur Parsing für ein "plain object"
function parseFrom(searchParams: Record<string, string | string[] | undefined>): Date {
  const raw = searchParams.from;
  const v = Array.isArray(raw) ? raw[0] : raw;

  // default: heute (UTC 00:00)
  const today = new Date();
  const y = today.getUTCFullYear();
  const m = String(today.getUTCMonth() + 1).padStart(2, "0");
  const d = String(today.getUTCDate()).padStart(2, "0");
  const fallback = new Date(`${y}-${m}-${d}T00:00:00.000Z`);

  if (!v) return fallback;

  const parsed = new Date(`${v}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) ? parsed : fallback;
}

function toMs(v: any): number {
  if (v instanceof Date) return v.getTime();
  if (typeof v === "number") return v;
  const d = new Date(v);
  return Number.isFinite(d.getTime()) ? d.getTime() : 0;
}

// ✅ WICHTIG: searchParams als Promise typisieren und awaiten
export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;

  const fromDate = parseFrom(sp);
  const fromISO = fromDate.toISOString().slice(0, 10);
  const fromMs = fromDate.getTime();

  const starts = await prisma.inventoryStart.findMany();

  // ✅ Robust: alle Movements holen (kleiner select) und in JS filtern
  const moves = await prisma.inventoryMovement.findMany({
    select: {
      baseType: true,
      category: true,
      size: true,
      qtyUsed: true,
      orderCreatedAt: true,
    },
  });

  const startMap = new Map<string, number>();
  for (const s of starts) startMap.set(k(s.baseType, s.category, s.size), s.startQty);

  const usedMap = new Map<string, number>();
  for (const m of moves) {
    const ms = toMs(m.orderCreatedAt);
    if (ms < fromMs) continue;

    const key = k(m.baseType, m.category, m.size);
    usedMap.set(key, (usedMap.get(key) ?? 0) + (m.qtyUsed ?? 0));
  }

  // Tracking-Liste (wie du sie willst)
  const tracked: Array<{ baseType: string; category: string; sizes: readonly string[] }> = [
    { baseType: "P", category: "Wandfarbe", sizes: ALLOWED_SIZES },
    { baseType: "P", category: "Lack", sizes: ALLOWED_SIZES },
    { baseType: "U", category: "Wandfarbe", sizes: ALLOWED_SIZES },
    { baseType: "U", category: "Lack", sizes: ALLOWED_SIZES },

    // Special products
    { baseType: "Pure White", category: "Wandfarbe", sizes: ["1 Liter", "2.5 Liter", "10 Liter"] },
    { baseType: "Ultra White", category: "Wandfarbe", sizes: ["1 Liter", "2.5 Liter", "10 Liter"] },
    { baseType: "Wall Primer", category: "Wandfarbe", sizes: ["2.5 Liter", "10 Liter"] },

    { baseType: "Pure White", category: "Lack", sizes: ["0.75 Liter"] },
    { baseType: "Lack Primer", category: "Lack", sizes: ["0.75 Liter"] },
    { baseType: "Klarlack", category: "Lack", sizes: ["0.75 Liter"] },
    { baseType: "Wandschutz", category: "Lack", sizes: ["0.75 Liter", "2.5 Liter"] },
  ];

  const rows: Array<{
    baseType: string;
    category: string;
    size: string;
    startQty: number;
    usedQty: number;
    remainingQty: number;
  }> = [];

  for (const t of tracked) {
    for (const size of t.sizes) {
      const key = k(t.baseType, t.category, size);
      const startQty = startMap.get(key) ?? 0;
      const usedQty = usedMap.get(key) ?? 0;

      rows.push({
        baseType: t.baseType,
        category: t.category,
        size,
        startQty,
        usedQty,
        remainingQty: startQty - usedQty,
      });
    }
  }


  return (
    <main style={{ padding: 24, fontFamily: "system-ui, -apple-system, Segoe UI, Roboto" }}>
      <h1 style={{ fontSize: 22, marginBottom: 6 }}>Inventory Tracking – Base P/U</h1>
      <InventoryClient rows={rows} initialFrom={fromISO} />
    </main>
  );
}
