import { prisma } from "@/src/lib/db";
import { ALLOWED_SIZES } from "@/src/lib/inventory";

export const dynamic = "force-dynamic";

function k(baseType: string, category: string, size: string) {
  return `${baseType}|${category}|${size}`;
}

export default async function InventoryPage() {
  const starts = await prisma.inventoryStart.findMany();
  const moves = await prisma.inventoryMovement.findMany();

  const startMap = new Map<string, number>();
  for (const s of starts) startMap.set(k(s.baseType, s.category, s.size), s.startQty);

  const usedMap = new Map<string, number>();
  for (const m of moves) {
    const key = k(m.baseType, m.category, m.size);
    usedMap.set(key, (usedMap.get(key) ?? 0) + m.qtyUsed);
  }

  const baseTypes = ["P", "U"];
  const categories = ["Wandfarbe", "Lack"];

  const rows = [];
  for (const bt of baseTypes) {
    for (const cat of categories) {
      for (const size of ALLOWED_SIZES) {
        const key = k(bt, cat, size);
        const startQty = startMap.get(key) ?? 0;
        const usedQty = usedMap.get(key) ?? 0;
        rows.push({
          baseType: bt,
          category: cat,
          size,
          startQty,
          usedQty,
          remainingQty: startQty - usedQty,
        });
      }
    }
  }

  return (
    <main style={{ padding: 24, fontFamily: "system-ui, -apple-system, Segoe UI, Roboto" }}>
      <h1 style={{ fontSize: 22, marginBottom: 6 }}>Inventory Tracking – Base P/U</h1>
      <p style={{ marginTop: 0, color: "#666" }}>
        Remaining = Start − Used. Scan reads paid Shopify orders and writes movements.
      </p>

      <div style={{ padding: 12, border: "1px solid #ddd", borderRadius: 10, marginBottom: 16 }}>
        <div style={{ fontWeight: 600, marginBottom: 6 }}>Quick actions</div>
        <div>
          Scan endpoint: <code>/api/inventory/scan?secret=SCAN_SECRET</code>
        </div>
        <div style={{ marginTop: 6 }}>
          Set start inventory via POST: <code>/api/inventory/start</code>
        </div>
      </div>

      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            {["Base", "Kategorie", "Größe", "Start", "Used", "Remaining"].map((h) => (
              <th key={h} style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 10 }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} style={{ borderBottom: "1px solid #f0f0f0" }}>
              <td style={{ padding: 10 }}>{r.baseType}</td>
              <td style={{ padding: 10 }}>{r.category}</td>
              <td style={{ padding: 10 }}>{r.size}</td>
              <td style={{ padding: 10 }}>{r.startQty}</td>
              <td style={{ padding: 10 }}>{r.usedQty}</td>
              <td style={{ padding: 10, fontWeight: 700, color: r.remainingQty < 0 ? "crimson" : "inherit" }}>
                {r.remainingQty}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
