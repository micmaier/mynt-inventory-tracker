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

  const startMap = new Map<string, { startQty: number; minQty: number }>();
  for (const s of starts) startMap.set(k(s.baseType, s.category, s.size), { startQty: s.startQty ?? 0, minQty: s.minQty ?? 0 });

  const usedMap = new Map<string, number>();
  for (const m of moves) {
    const ms = toMs(m.orderCreatedAt);
    if (ms < fromMs) continue;

    const key = k(m.baseType, m.category, m.size);
    usedMap.set(key, (usedMap.get(key) ?? 0) + (m.qtyUsed ?? 0));
  }

  // ✅ Entferne nicht-existente Produkte:
  // - Wandfarbe 0.75L (P & U)
  // - Lack 10L und 1L (P & U)
  const sizesWandfarbePU = ALLOWED_SIZES.filter((s) => s !== "0.75 Liter");
  const sizesLackPU = ALLOWED_SIZES.filter((s) => s !== "10 Liter" && s !== "1 Liter");

  // Tracking-Liste (wie du sie willst)
  const tracked: Array<{ baseType: string; category: string; sizes: readonly string[] }> = [
    { baseType: "P", category: "Wandfarbe", sizes: sizesWandfarbePU },
    { baseType: "P", category: "Lack", sizes: sizesLackPU },
    { baseType: "U", category: "Wandfarbe", sizes: sizesWandfarbePU },
    { baseType: "U", category: "Lack", sizes: sizesLackPU },

    // Special products (unverändert)
    { baseType: "Pure White", category: "Wandfarbe", sizes: ["1 Liter", "2.5 Liter", "10 Liter"] },
    { baseType: "Ultra White", category: "Wandfarbe", sizes: ["1 Liter", "2.5 Liter", "10 Liter"] },
    { baseType: "Wall Primer", category: "Wandfarbe", sizes: ["2.5 Liter", "10 Liter"] },

    { baseType: "Pure White", category: "Lack", sizes: ["0.75 Liter"] },
    { baseType: "Lack Primer", category: "Lack", sizes: ["0.75 Liter"] },
    { baseType: "Klarlack", category: "Lack", sizes: ["0.75 Liter"] },
    { baseType: "Wandschutz", category: "Lack", sizes: ["0.75 Liter", "2.5 Liter"] },
  ];

  // ✅ Manuelle Artikel: Base = Hilfsmittel/Ware/Verpackung, Category = Artikelname, Size = "-"
  const manualItems: Array<{ baseType: string; category: string; size: string }> = [
    // Hilfsmittel
    { baseType: "Hilfsmittel", category: "Paste 557.05", size: "-" },
    { baseType: "Hilfsmittel", category: "Paste 557.15", size: "-" },
    { baseType: "Hilfsmittel", category: "Paste 557.18", size: "-" },
    { baseType: "Hilfsmittel", category: "Paste 557.26", size: "-" },
    { baseType: "Hilfsmittel", category: "Paste 557.33", size: "-" },
    { baseType: "Hilfsmittel", category: "Paste 557.35", size: "-" },
    { baseType: "Hilfsmittel", category: "Paste 557.40", size: "-" },
    { baseType: "Hilfsmittel", category: "Paste 557.50", size: "-" },
    { baseType: "Hilfsmittel", category: "Paste 557.52", size: "-" },
    { baseType: "Hilfsmittel", category: "Paste 557.55", size: "-" },
    { baseType: "Hilfsmittel", category: "Paste 557.60", size: "-" },
    { baseType: "Hilfsmittel", category: "Paste 557.90", size: "-" },
    { baseType: "Hilfsmittel", category: "Paste 557.99", size: "-" },

    // Ware
    { baseType: "Ware", category: "Große Walze Coat alt", size: "-" },
    { baseType: "Ware", category: "Großer Stoff", size: "-" },
    { baseType: "Ware", category: "Kleine Walze", size: "-" },
    { baseType: "Ware", category: "Kleiner Stoff Lack", size: "-" },
    { baseType: "Ware", category: "Kleiner Stoff Farbe", size: "-" },
    { baseType: "Ware", category: "Wanne", size: "-" },
    { baseType: "Ware", category: "Folie", size: "-" },
    { baseType: "Ware", category: "Tape", size: "-" },
    { baseType: "Ware", category: "Farbmuster Schupp", size: "-" },
    { baseType: "Ware", category: "Farbmuster CC", size: "-" },

    // Verpackung
    { baseType: "Verpackung", category: "Kartonage S", size: "-" },
    { baseType: "Verpackung", category: "Kartonage M", size: "-" },
    { baseType: "Verpackung", category: "Kartonage XL", size: "-" },
    { baseType: "Verpackung", category: "Lückenfüller", size: "-" },
    { baseType: "Verpackung", category: "Divider", size: "-" },
    { baseType: "Verpackung", category: "Sandwich 10 Liter", size: "-" },
    { baseType: "Verpackung", category: "Sandwich 2.5 Liter", size: "-" },
    { baseType: "Verpackung", category: "Kartonage 10 Liter", size: "-" },
    { baseType: "Verpackung", category: "Kartonage Farbmuster", size: "-" },
    { baseType: "Verpackung", category: "Klebeband", size: "-" },
    { baseType: "Verpackung", category: "Polster für Lack (# Kartons)", size: "-" },
    { baseType: "Verpackung", category: "Aufkleber Wandfarbe", size: "-" },
    { baseType: "Verpackung", category: "Aufkleber Lack", size: "-" },
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

  // ✅ normale getrackte Produkte (wie vorher, nur mit Größen-Filtern)
  for (const t of tracked) {
    for (const size of t.sizes) {
      const key = k(t.baseType, t.category, size);
      const start = startMap.get(key)?.startQty ?? 0;
      const min = startMap.get(key)?.minQty ?? 0;
      const used = usedMap.get(key) ?? 0;

      rows.push({
        baseType: t.baseType,
        category: t.category,
        size,
        startQty: start,
        minQty: min,
        usedQty: used,
        remainingQty: start - used,
      });
    }
  }

  // ✅ manuelle Artikel (nicht aktiv getrackt → used immer 0)
  for (const it of manualItems) {
    const key = k(it.baseType, it.category, it.size);
    const start = startMap.get(key)?.startQty ?? 0;
    const min = startMap.get(key)?.minQty ?? 0;

    rows.push({
      baseType: it.baseType,
      category: it.category,
      size: it.size,
      startQty: start,
      minQty: min,
      usedQty: 0,
      remainingQty: start,
    });
  }

  return (
    <main style={{ padding: 24, fontFamily: "system-ui, -apple-system, Segoe UI, Roboto" }}>
      <h1 style={{ fontSize: 22, marginBottom: 6 }}>Inventory Tracking – Base P/U</h1>
      <InventoryClient rows={rows} initialFrom={fromISO} />
    </main>
  );
}
