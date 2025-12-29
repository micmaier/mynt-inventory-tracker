"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Movement = { baseType: string; category: string; size: string; qtyUsed: number };

type Row = {
  orderId: string;
  orderName?: string | null;
  orderCreatedAt?: string | null;
  processedAt: string;
  movements: Movement[];
};

export default function ScannedOrdersClient({
  rows,
  initialFrom,
}: {
  rows: Row[];
  initialFrom: string;
}) {
  const router = useRouter();
  const [from, setFrom] = useState(initialFrom || "");
  const [open, setOpen] = useState<Record<string, boolean>>({});

  const countBuckets = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) m.set(r.orderId, r.movements.length);
    return m;
  }, [rows]);

  function toggle(id: string) {
    setOpen((p) => ({ ...p, [id]: !p[id] }));
  }

  function applyFilter() {
    const qs = new URLSearchParams();
    if (from) qs.set("from", from);
    router.push(`/scanned-orders?${qs.toString()}`);
  }

  function formatDate(iso: string | null | undefined) {
    if (!iso) return "—";
    const d = new Date(iso);
    if (!Number.isFinite(d.getTime())) return "—";
    // YYYY-MM-DD
    return d.toISOString().slice(0, 10);
  }

  return (
    <>
      <div style={{ padding: 12, border: "1px solid #ddd", borderRadius: 10, marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span style={{ fontSize: 13, color: "#666" }}>Ab Datum</span>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #ccc" }}
            />
          </label>

          <button
            onClick={applyFilter}
            style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #ccc", cursor: "pointer" }}
          >
            Filter anwenden
          </button>

          <div style={{ fontSize: 13, color: "#666" }}>Anzeigen: {rows.length} Orders</div>
        </div>
      </div>

      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            {["Order", "Datum", "Betroffene Produkte", ""].map((h) => (
              <th key={h} style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 10 }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {rows.map((r) => {
            const label = r.orderName || r.orderId;
            const isOpen = !!open[r.orderId];
            const buckets = countBuckets.get(r.orderId) ?? 0;

            return (
              <tr key={r.orderId} style={{ borderBottom: "1px solid #f0f0f0" }}>
                <td style={{ padding: 10, fontWeight: 600 }}>{label}</td>
                <td style={{ padding: 10 }}>{formatDate(r.orderCreatedAt)}</td>
                <td style={{ padding: 10 }}>{buckets}</td>
                <td style={{ padding: 10 }}>
                  <button
                    onClick={() => toggle(r.orderId)}
                    style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #ccc", cursor: "pointer" }}
                  >
                    {isOpen ? "Hide" : "View"}
                  </button>
                </td>

                {isOpen && (
                  <td colSpan={4} style={{ padding: 10, background: "rgba(255,255,255,0.02)" }}>
                    <div style={{ fontSize: 13, color: "#666", marginBottom: 8 }}>
                      “Betroffene Produkte” = welche Inventory-Buckets aus dieser Order abgezogen wurden:
                    </div>

                    {r.movements.length ? (
                      <ul style={{ margin: 0, paddingLeft: 18 }}>
                        {r.movements.map((m, idx) => (
                          <li key={idx} style={{ padding: "2px 0" }}>
                            <strong>{m.baseType}</strong> — {m.category} — {m.size} → <strong>{m.qtyUsed}</strong>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <div style={{ color: "#666" }}>Keine Movements (alle Line Items wurden ignoriert).</div>
                    )}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </>
  );
}
