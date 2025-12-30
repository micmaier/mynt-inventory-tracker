import { prisma } from "@/src/lib/db";
import { ALLOWED_SIZES } from "@/src/lib/inventory";
import InventoryClient from "./InventoryClient";

export const dynamic = "force-dynamic";

function k(baseType: string, category: string, size: string) {
  return `${baseType}|${category}|${size}`;
}

// ✅ Next 16 / Turbopack: searchParams kann Promise sein → wir geben hier nur Parsing für ein "plain object"
function parseFrom(searchParams: Record<string, string | string[] | undefined>): string | null {
  const raw = searchParams.from;
  const v = Array.isArray(raw) ? raw[0] : raw;
  if (!v) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
}

function toDateUTC(yyyyMmDd: string): Date {
  return new Date(`${yyyyMmDd}T00:00:00.000Z`);
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

  // ✅ NEU: wenn kein ?from= gesetzt ist → serverseitig gespeichertes DefaultFrom nutzen
  const qpFrom = parseFrom(sp);

  const settings = await prisma.inventorySettings.findUnique({ where: { id: "default" } });
  const settingsFromISO = settings?.defaultFrom ? settings.defaultFrom.toISOString().slice(0, 10) : null;

  // default: settingsFrom (wenn vorhanden), sonst heute (UTC 00:00)
  const today = new Date();
  const y = today.getUTCFullYear();
  const m = String(today.getUTCMonth() + 1).padStart(2, "0");
  const d = String(today.getUTCDate()).padStart(2, "0");
  const todayISO = `${y}-${m}-${d}`;

  const fromISO = qpFrom ?? settingsFromISO ?? todayISO;
  const fromDate = toDateUTC(fromISO);
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
  const minMap = new Map<string, number>();
  for (const s of starts) {
    const key = k(s.baseType, s.category, s.size);
    startMap.set(key, s.startQty);
    minMap.set(key, s.minQty ?? 0);
  }

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
    minQty: number;
    usedQty: number;
    remainingQty: number;
  }> = [];

  for (const t of tracked) {
    for (const size of t.sizes) {
      const key = k(t.baseType, t.category, size);
      const startQty = startMap.get(key) ?? 0;
      const minQty = minMap.get(key) ?? 0;
      const usedQty = usedMap.get(key) ?? 0;

      rows.push({
        baseType: t.baseType,
        category: t.category,
        size,
        startQty,
        minQty,
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
