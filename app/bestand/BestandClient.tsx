"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Row = {
  baseType: string;
  category: string;
  size: string;
  startQty: number;
  minQty: number;
  usedQty: number;
  remainingQty: number;
};

type Props = {
  rows: Row[];
  initialFrom: string; // YYYY-MM-DD (the current defaultFrom)
  lastUpdatedAt: string | null; // ISO timestamp of last settings save
};

type Filter = "Alle" | "Farbe" | "Pigmente" | "Versandmaterial" | "Etiketten";

function rowKey(r: { baseType: string; category: string; size: string }) {
  return `${r.baseType}|${r.category}|${r.size}`;
}

function todayISO(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())} Uhr`;
}

const btnStyle: React.CSSProperties = {
  padding: "6px 12px",
  borderRadius: 8,
  border: "1px solid #ccc",
  cursor: "pointer",
  fontSize: 13,
  background: "#fff",
  color: "#111",
};

const btnPrimaryStyle: React.CSSProperties = {
  padding: "6px 14px",
  borderRadius: 8,
  border: "1px solid #111",
  cursor: "pointer",
  fontSize: 13,
  background: "#111",
  color: "#fff",
  fontWeight: 600,
};

const btnDangerStyle: React.CSSProperties = {
  padding: "6px 12px",
  borderRadius: 8,
  border: "1px solid #e0e0e0",
  cursor: "pointer",
  fontSize: 13,
  background: "#fafafa",
  color: "#555",
};

export default function BestandClient({ rows, initialFrom, lastUpdatedAt }: Props) {
  const router = useRouter();

  const [editAll, setEditAll] = useState(false);
  const [editingRows, setEditingRows] = useState<Set<string>>(new Set());
  const [drafts, setDrafts] = useState<Record<string, number>>({});
  const [letzteAenderung, setLetzteAenderung] = useState<string>(initialFrom || todayISO());
  const [filter, setFilter] = useState<Filter>("Alle");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  // ── filtered rows ──────────────────────────────────────────────
  const visibleRows = useMemo(() => {
    const isColor = (r: Row) => r.category === "Wandfarbe" || r.category === "Lack";
    const isPigment = (r: Row) => r.category === "Pigmente";
    const isLabel = (r: Row) =>
      r.category === "Etikett Wandfarbe" || r.category === "Etikett Lack";
    const isShipping = (r: Row) => !isColor(r) && !isPigment(r) && !isLabel(r);

    if (filter === "Alle") return rows;
    if (filter === "Farbe") return rows.filter(isColor);
    if (filter === "Pigmente") return rows.filter(isPigment);
    if (filter === "Etiketten") return rows.filter(isLabel);
    if (filter === "Versandmaterial") return rows.filter(isShipping);
    return rows;
  }, [rows, filter]);

  // ── Apply date only ────────────────────────────────────────────
  async function handleApplyDate() {
    if (!letzteAenderung) return;
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch("/api/bestand/date", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: letzteAenderung }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Datum speichern fehlgeschlagen.");
      setMsg("✅ Datum aktualisiert.");
      router.refresh();
    } catch (e: any) {
      setMsg(`❌ ${e?.message || "Fehler beim Speichern."}`);
    } finally {
      setBusy(false);
    }
  }

  // ── Edit all ───────────────────────────────────────────────────
  function handleEditAll() {
    const next: Record<string, number> = {};
    for (const r of rows) next[rowKey(r)] = r.remainingQty;
    setDrafts(next);
    setEditAll(true);
    setLetzteAenderung(todayISO());
  }

  function handleCancelAll() {
    setEditAll(false);
    setDrafts({});
    setMsg("");
  }

  async function handleSaveAll() {
    setBusy(true);
    setMsg("");
    try {
      const items = rows.map((r) => ({
        baseType: r.baseType,
        category: r.category,
        size: r.size,
        startQty: Number(drafts[rowKey(r)] ?? r.remainingQty),
      }));

      const res = await fetch("/api/bestand/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items, date: letzteAenderung, updateDate: true }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Speichern fehlgeschlagen.");

      setMsg(`✅ ${data.savedCount ?? items.length} Bestände gespeichert.`);
      setEditAll(false);
      setDrafts({});
      router.refresh();
    } catch (e: any) {
      setMsg(`❌ ${e?.message || "Fehler beim Speichern."}`);
    } finally {
      setBusy(false);
    }
  }

  // ── Per-row edit ───────────────────────────────────────────────
  function handleEditRow(r: Row) {
    const k = rowKey(r);
    setDrafts((prev) => ({ ...prev, [k]: r.remainingQty }));
    setEditingRows((prev) => new Set([...prev, k]));
  }

  function handleCancelRow(r: Row) {
    const k = rowKey(r);
    setEditingRows((prev) => {
      const next = new Set(prev);
      next.delete(k);
      return next;
    });
  }

  async function handleSaveRow(r: Row) {
    const k = rowKey(r);
    setBusy(true);
    setMsg("");
    try {
      // Only update this one item's startQty — do NOT touch defaultFrom.
      // Moving the tracking date is only valid on a full "Alle speichern".
      const res = await fetch("/api/bestand/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: [
            {
              baseType: r.baseType,
              category: r.category,
              size: r.size,
              startQty: Number(drafts[k] ?? r.remainingQty),
            },
          ],
          updateDate: false,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Speichern fehlgeschlagen.");

      setMsg("✅ Bestand gespeichert.");
      handleCancelRow(r);
      router.refresh();
    } catch (e: any) {
      setMsg(`❌ ${e?.message || "Fehler beim Speichern."}`);
    } finally {
      setBusy(false);
    }
  }

  // ── render ─────────────────────────────────────────────────────
  return (
    <>
      {/* ── Controls bar ── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
          padding: "10px 14px",
          border: "1px solid #ddd",
          borderRadius: 10,
          marginBottom: 14,
          background: "#fafafa",
        }}
      >
        {/* Letzte Änderung */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontWeight: 600, fontSize: 14, whiteSpace: "nowrap", color: "#111" }}>
            Letzte Änderung:
          </span>
          <input
            type="date"
            value={letzteAenderung}
            onChange={(e) => setLetzteAenderung(e.target.value)}
            style={{
              padding: "6px 10px",
              borderRadius: 8,
              border: "1px solid #ccc",
              fontSize: 14,
              background: "#fff",
              color: "#111",
            }}
          />
          <button
            onClick={handleApplyDate}
            disabled={busy}
            style={{ ...btnStyle, whiteSpace: "nowrap" }}
          >
            Anwenden
          </button>
          {lastUpdatedAt && (
            <span style={{ fontSize: 12, color: "#555", whiteSpace: "nowrap" }}>
              gespeichert: {formatDateTime(lastUpdatedAt)}
            </span>
          )}
        </div>

        <div style={{ flex: 1 }} />

        {/* Filter */}
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "#666" }}>
          Filter
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as Filter)}
            style={{
              padding: "6px 10px",
              borderRadius: 8,
              border: "1px solid #ccc",
              background: "#fff",
              color: "#111",
              fontSize: 13,
            }}
          >
            <option value="Alle">Alle</option>
            <option value="Farbe">Farbe</option>
            <option value="Pigmente">Pigmente</option>
            <option value="Versandmaterial">Versandmaterial</option>
            <option value="Etiketten">Etiketten</option>
          </select>
        </label>

        {/* Edit all / Save all / Cancel */}
        {editAll ? (
          <>
            <button onClick={handleCancelAll} disabled={busy} style={btnDangerStyle}>
              Abbrechen
            </button>
            <button onClick={handleSaveAll} disabled={busy} style={btnPrimaryStyle}>
              {busy ? "Speichern…" : "Alle speichern"}
            </button>
          </>
        ) : (
          <button onClick={handleEditAll} style={btnStyle}>
            Alle bearbeiten
          </button>
        )}
      </div>

      {/* ── Status message ── */}
      {msg && (
        <div
          style={{
            marginBottom: 10,
            fontSize: 13,
            color: msg.startsWith("❌") ? "crimson" : "#166534",
            padding: "6px 12px",
            borderRadius: 8,
            background: msg.startsWith("❌") ? "#fff5f5" : "#f0fdf4",
            border: `1px solid ${msg.startsWith("❌") ? "#fecaca" : "#bbf7d0"}`,
          }}
        >
          {msg}
        </div>
      )}

      {/* ── Table ── */}
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ background: "#f8f8f8" }}>
            {["Base", "Kategorie", "Größe", "Bestand", "Min", "Status", ""].map((h) => (
              <th
                key={h}
                style={{
                  textAlign: "left",
                  borderBottom: "2px solid #e5e5e5",
                  padding: "10px 10px",
                  fontSize: 13,
                  fontWeight: 600,
                  color: "#444",
                }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {visibleRows.map((r, i) => {
            const k = rowKey(r);
            const isEditingThisRow = editAll || editingRows.has(k);
            const draftVal = drafts[k] ?? r.remainingQty;
            const isLow = r.remainingQty < r.minQty;

            return (
              <tr
                key={i}
                style={{
                  borderBottom: "1px solid #f0f0f0",
                  background: isLow ? "rgba(180, 30, 30, 0.12)" : undefined,
                }}
              >
                <td style={{ padding: 10 }}>{r.baseType}</td>
                <td style={{ padding: 10 }}>{r.category}</td>
                <td style={{ padding: 10 }}>{r.size !== "-" ? r.size : "—"}</td>

                {/* Bestand – editable in edit mode */}
                <td style={{ padding: 10 }}>
                  {isEditingThisRow ? (
                    <input
                      type="number"
                      min={0}
                      value={Number.isFinite(draftVal) ? draftVal : 0}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        setDrafts((prev) => ({
                          ...prev,
                          [k]: Number.isFinite(v) ? v : 0,
                        }));
                      }}
                      style={{
                        width: 90,
                        padding: "6px 8px",
                        borderRadius: 6,
                        border: "1px solid #aaa",
                        fontSize: 14,
                        fontWeight: 600,
                      }}
                    />
                  ) : (
                    <span
                      style={{
                        fontWeight: 600,
                        color: isLow ? "crimson" : "inherit",
                        fontSize: 14,
                      }}
                    >
                      {r.remainingQty}
                    </span>
                  )}
                </td>

                {/* Min – always read-only */}
                <td style={{ padding: 10, color: "#888", fontSize: 13 }}>
                  {r.minQty}
                </td>

                {/* Status */}
                <td style={{ padding: 10, fontSize: 16 }}>
                  {isLow ? "⚠️" : "✅"}
                </td>

                {/* Per-row actions – hidden in editAll mode */}
                <td style={{ padding: 10 }}>
                  {!editAll && (
                    editingRows.has(k) ? (
                      <div style={{ display: "flex", gap: 6 }}>
                        <button
                          onClick={() => handleSaveRow(r)}
                          disabled={busy}
                          style={btnPrimaryStyle}
                        >
                          {busy ? "…" : "Speichern"}
                        </button>
                        <button
                          onClick={() => handleCancelRow(r)}
                          disabled={busy}
                          style={btnDangerStyle}
                        >
                          ✕
                        </button>
                      </div>
                    ) : (
                      <button onClick={() => handleEditRow(r)} style={btnStyle}>
                        Bearbeiten
                      </button>
                    )
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </>
  );
}
