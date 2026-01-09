import { prisma } from "@/src/lib/db";
import { ALLOWED_SIZES } from "@/src/lib/inventory";
import InventoryClient from "./InventoryClient";

export const dynamic = "force-dynamic";

function k(baseType: string, category: string, size: string) {
  return `${baseType}|${category}|${size}`;
}

// ✅ Next 16 / Turbopack: searchParams kann Promise sein → wir geben hier nur Parsing für ein "plain object"
// Wir geben absichtlich string|null zurück, damit wir später sauber die Priorität setzen können:
// 1) ?from=  2) settings.defaultFrom  3) heute
function parseFromISO(searchParams: Record<string, string | string[] | undefined>): string | null {
  const raw = searchParams.from;
  const v = Array.isArray(raw) ? raw[0] : raw;
  if (!v) return null;

  // nur YYYY-MM-DD akzeptieren
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  return v;
}

function todayISO_UTC(): string {
  const today = new Date();
  const y = today.getUTCFullYear();
  const m = String(today.getUTCMonth() + 1).padStart(2, "0");
  const d = String(today.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function isoToDateUTC(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
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

  // ✅ 1) URL Query holen
  const qpFromISO = parseFromISO(sp);

  // ✅ 2) serverseitig gespeichertes DefaultFrom holen
  const settings = await prisma.inventorySettings.findUnique({ where: { id: "default" } });
  const settingsFromISO = settings?.defaultFrom ? settings.defaultFrom.toISOString().slice(0, 10) : null;

  // ✅ 3) Fallback: heute
  const fallbackISO = todayISO_UTC();

  // ✅ Priorität: Query → Settings → Today
  const fromISO = qpFromISO ?? settingsFromISO ?? fallbackISO;
  const fromDate = isoToDateUTC(fromISO);
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

  // ✅ Helper: Legacy-Records (alte Struktur) → neue Struktur zusätzlich befüllen (rückwärtskompatibel)
  function isLegacyNonColorStart(s: { baseType: string; category: string; size: string }) {
    return s.size === "-" && (s.baseType === "Hilfsmittel" || s.baseType === "Ware" || s.baseType === "Verpackung");
  }

  function legacyToNewCategory(legacyBaseType: string, legacyItemName: string) {
    // Pasten sind Pigmente, alles andere Versandmaterial
    if (legacyBaseType === "Hilfsmittel" && legacyItemName.startsWith("Paste ")) return "Pigmente";
    return "Versandmaterial";
  }

  for (const s of starts) {
    // Original-Key immer befüllen
    startMap.set(k(s.baseType, s.category, s.size), {
      startQty: s.startQty ?? 0,
      minQty: s.minQty ?? 0,
    });

    // Zusätzlich: wenn es ein altes Non-Color-Item ist, auch den neuen Key befüllen
    if (isLegacyNonColorStart(s)) {
      const newBase = s.category; // Artikelname wird Base
      const newCategory = legacyToNewCategory(s.baseType, s.category);
      const newKey = k(newBase, newCategory, s.size);

      // Nur setzen, wenn neuer Key noch nicht existiert (neue Einträge sollen Vorrang haben)
      if (!startMap.has(newKey)) {
        startMap.set(newKey, {
          startQty: s.startQty ?? 0,
          minQty: s.minQty ?? 0,
        });
      }
    }
  }

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

  // ✅ Nicht-Farbprodukte: Neue Struktur
  // Base = Artikelname, Category = Pigmente / Versandmaterial / Etikett, Size = "-"
  const pigmentItems: Array<{ baseType: string; category: string; size: string }> = [
    { baseType: "Paste 557.05", category: "Pigmente", size: "-" },
    { baseType: "Paste 557.15", category: "Pigmente", size: "-" },
    { baseType: "Paste 557.18", category: "Pigmente", size: "-" },
    { baseType: "Paste 557.26", category: "Pigmente", size: "-" },
    { baseType: "Paste 557.33", category: "Pigmente", size: "-" },
    { baseType: "Paste 557.35", category: "Pigmente", size: "-" },
    { baseType: "Paste 557.40", category: "Pigmente", size: "-" },
    { baseType: "Paste 557.50", category: "Pigmente", size: "-" },
    { baseType: "Paste 557.52", category: "Pigmente", size: "-" },
    { baseType: "Paste 557.55", category: "Pigmente", size: "-" },
    { baseType: "Paste 557.60", category: "Pigmente", size: "-" },
    { baseType: "Paste 557.90", category: "Pigmente", size: "-" },
    { baseType: "Paste 557.99", category: "Pigmente", size: "-" },
  ];

  const shippingItems: Array<{ baseType: string; category: string; size: string }> = [
    // Ware
    { baseType: "Große Walze Coat alt", category: "Versandmaterial", size: "-" },
    { baseType: "Großer Stoff", category: "Versandmaterial", size: "-" },
    { baseType: "Kleine Walze", category: "Versandmaterial", size: "-" },
    { baseType: "Kleiner Stoff Lack", category: "Versandmaterial", size: "-" },
    { baseType: "Kleiner Stoff Farbe", category: "Versandmaterial", size: "-" },
    { baseType: "Wanne", category: "Versandmaterial", size: "-" },
    { baseType: "Folie", category: "Versandmaterial", size: "-" },
    { baseType: "Tape", category: "Versandmaterial", size: "-" },
    { baseType: "Farbmuster Schupp", category: "Versandmaterial", size: "-" },
    { baseType: "Farbmuster CC", category: "Versandmaterial", size: "-" },

    // Verpackung
    { baseType: "Kartonage S", category: "Versandmaterial", size: "-" },
    { baseType: "Kartonage M", category: "Versandmaterial", size: "-" },
    { baseType: "Kartonage XL", category: "Versandmaterial", size: "-" },
    { baseType: "Lückenfüller", category: "Versandmaterial", size: "-" },
    { baseType: "Divider", category: "Versandmaterial", size: "-" },
    { baseType: "Sandwich 10 Liter", category: "Versandmaterial", size: "-" },
    { baseType: "Sandwich 2.5 Liter", category: "Versandmaterial", size: "-" },
    { baseType: "Kartonage 10 Liter", category: "Versandmaterial", size: "-" },
    { baseType: "Kartonage Farbmuster", category: "Versandmaterial", size: "-" },
    { baseType: "Klebeband", category: "Versandmaterial", size: "-" },
    { baseType: "Polster für Lack (# Kartons)", category: "Versandmaterial", size: "-" },
    { baseType: "Aufkleber Wandfarbe", category: "Versandmaterial", size: "-" },
    { baseType: "Aufkleber Lack", category: "Versandmaterial", size: "-" },
  ];

  const labelNames: string[] = [
    "Bali Blue",
    "Blue Ivy",
    "Ceramic Studio",
    "Champagne",
    "Cloud Nine",
    "Coffee Date",
    "Cosmopolitan",
    "Cosy Cashmere",
    "Creamy Silk",
    "Daily Detox",
    "Don't Send Nudes",
    "Fashion Week",
    "Glory Wall",
    "Golden Hour",
    "Hakuna Matata",
    "Heartless",
    "Holly Wood",
    "Honeymoon",
    "Hotline Pink",
    "Hygge",
    "Innocent Wife",
    "Juicy Orange",
    "Kiss Me Now",
    "Light Venus",
    "Mister Gray",
    "Morning Sun",
    "No Brainer",
    "Number 69",
    "Olive Garden",
    "Pool Party",
    "Powder Skin",
    "Power Nap",
    "Purple Rain",
    "Run Forest",
    "Saint-Tropez",
    "Salted Caramel",
    "Skinny Jeans",
    "Smokey Eyes",
    "Soft Avocado",
    "Space Cake",
    "Summer Mint",
    "Sushi Lover",
    "Talk Dirty",
    "Tea Room",
    "The Grey Gatsby",
    "The Rock",
    "Tree House",
    "True Emotions",
    "Wabi-Sabi",
    "Yoga Class",
    "Myx + Match",
    "Wall Primer",
    "Pure White",
    "Ultra White",
    "Love me Lavender",
    "Soft Sakura",
    "Neutral Nude",
    "Mintfulness",
    "give warmth!",
    "live simple!",
    "come closer!",
    "feel jade!",
    "dive deep!",
    "pay Attention!",
    "stay together!",
    "be rooted!",
    "taste south!",
  ];

  const labelItems: Array<{ baseType: string; category: string; size: string }> = labelNames.map((name) => ({
    baseType: name,
    category: "Etikett",
    size: "-",
  }));

  const manualItems = [...pigmentItems, ...shippingItems, ...labelItems];

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

  // ✅ Dashboard Werte (reine Anzeige, keine Logikänderung)
  const low = rows.filter((r) => (r.remainingQty ?? 0) < (r.minQty ?? 0));
  const ok = rows.length - low.length;

  return (
    <main style={{ padding: 24, fontFamily: "system-ui, -apple-system, Segoe UI, Roboto" }}>
      <h1 style={{ fontSize: 22, marginBottom: 10 }}>Mynt Inventory Tracker</h1>

      {/* ✅ Mini-Dashboard (nur Anzeige) */}
      <div
        style={{
          padding: 12,
          border: "1px solid #ddd",
          borderRadius: 10,
          marginBottom: 16,
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 12,
        }}
      >
        <div style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
          <div style={{ fontWeight: 700 }}>Status</div>
          <div style={{ color: "#666", fontSize: 13 }}>Genug = Remaining ≥ Min</div>
          <div style={{ width: "100%" }} />
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <div style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #ccc" }}>
              <div style={{ fontSize: 12, color: "#666" }}>Genug Bestand</div>
              <div style={{ fontSize: 20, fontWeight: 800 }}>{ok}</div>
            </div>
            <div style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #ccc" }}>
              <div style={{ fontSize: 12, color: "#666" }}>Nicht genug</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: "crimson" }}>{low.length}</div>
            </div>
          </div>
        </div>

        <div>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Nicht genug Bestand</div>
          <div
            style={{
              border: "1px solid #eee",
              borderRadius: 8,
              padding: 10,
              maxHeight: 170, // ~5 Items sichtbar
              overflowY: "auto",
              background: "#fafafa",
              color: "#111",
            }}
          >
            {low.length === 0 ? (
              <div style={{ color: "#666", fontSize: 13 }}>Alles im grünen Bereich ✅</div>
            ) : (
              <ul style={{ margin: 0, paddingLeft: 16 }}>
                {low
                  .slice()
                  .sort((a, b) => (a.remainingQty - a.minQty) - (b.remainingQty - b.minQty))
                  .map((r, idx) => (
                    <li key={`${r.baseType}|${r.category}|${r.size}|${idx}`} style={{ marginBottom: 6, fontSize: 13 }}>
                      <span style={{ fontWeight: 600 }}>
                        {r.baseType} / {r.category} {r.size !== "-" ? `(${r.size})` : ""}
                      </span>{" "}
                      – Remaining {r.remainingQty} / Min {r.minQty}
                    </li>
                  ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      {/* ✅ Rest bleibt unverändert */}
      <InventoryClient rows={rows} initialFrom={fromISO} />
    </main>
  );
}
