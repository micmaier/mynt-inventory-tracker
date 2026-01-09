"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type Row = {
  baseType: string;
  category: string;
  size: string;
  startQty: number;
  minQty: number; // ✅ NEU
  usedQty: number;
  remainingQty: number;
};

type Props = {
  rows: Row[];
  initialFrom: string; // YYYY-MM-DD
};

type Filter = "Alle" | "Farbe" | "Pigmente" | "Versandmaterial" | "Etiketten";

export default function InventoryClient({ rows, initialFrom }: Props) {
  const router = useRouter();

  const [secret, setSecret] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    return window.localStorage.getItem("SCAN_SECRET") || "";
  });

  // ✅ neues Date-State (default: heute bzw. URL-param)
  const [from, setFrom] = useState<string>(initialFrom || "");

  // ✅ NEU: Filter-State (ändert nur die Anzeige)
  const [filter, setFilter] = useState<Filter>("Alle");

  const [draftStarts, setDraftStarts] = useState<Record<string, number>>(() => {
    const init: Record<string, number> = {};
    for (const r of rows) init[key(r)] = r.startQty ?? 0;
    return init;
  });

  const [draftMins, setDraftMins] = useState<Record<string, number>>(() => {
    const init: Record<string, number> = {};
    for (const r of rows) init[key(r)] = r.minQty ?? 0;
    return init;
  });

  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string>("");

  const byKey = useMemo(() => {
    const m = new Map<string, Row>();
    for (const r of rows) m.set(key(r), r);
    return m;
  }, [rows]);

  function persistSecret(next: string) {
    setSecret(next);
    try {
      window.localStorage.setItem("SCAN_SECRET", next);
    } catch {}
  }

  function key(r: { baseType: string; category: string; size: string }) {
    return `${r.baseType}|${r.category}|${r.size}`;
  }

  async function persistDefaultFrom(nextFrom: string) {
    if (!secret) return;
    await fetch("/api/inventory/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        secret,
        defaultFrom: nextFrom || null,
      }),
    });
  }

  // ✅ NEU: Datum serverseitig als Default speichern (für Auto-Scan / Default-View)
  async function applyFrom() {
    // best effort: Speichern darf Navigation nicht blockieren
    if (secret) {
      try {
        await persistDefaultFrom(from);
      } catch {}
    }

    // ✅ hält /inventory und Server-Filter synchron
    const qp = from ? `?from=${encodeURIComponent(from)}` : "";
    router.push(`/inventory${qp}`);
    router.refresh();
  }

  async function saveOne(k: string) {
    const r = byKey.get(k);
    if (!r) return;

    if (!secret) {
      setMsg("Bitte SCAN_SECRET eingeben (oben).");
      return;
    }

    setBusy(true);
    setMsg("");

    try {
      const res = await fetch("/api/inventory/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          secret,
          baseType: r.baseType,
          category: r.category,
          size: r.size,
          startQty: Number(draftStarts[k] ?? 0),
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Startwert speichern fehlgeschlagen.");

      setMsg("Startwert gespeichert.");
      router.refresh();
    } catch (e: any) {
      setMsg(e?.message || "Fehler beim Speichern.");
    } finally {
      setBusy(false);
    }
  }

  async function saveMin(k: string) {
    const r = byKey.get(k);
    if (!r) return;

    if (!secret) {
      setMsg("Bitte SCAN_SECRET eingeben (oben).");
      return;
    }

    setBusy(true);
    setMsg("");

    try {
      const res = await fetch("/api/inventory/min", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          secret,
          baseType: r.baseType,
          category: r.category,
          size: r.size,
          minQty: Number(draftMins[k] ?? 0),
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Mindestbestand speichern fehlgeschlagen.");

      setMsg("Mindestbestand gespeichert.");
      router.refresh();
    } catch (e: any) {
      setMsg(e?.message || "Fehler beim Speichern.");
    } finally {
      setBusy(false);
    }
  }

  async function saveAll() {
    if (!secret) {
      setMsg("Bitte SCAN_SECRET eingeben (oben).");
      return;
    }

    setBusy(true);
    setMsg("");

    try {
      for (const r of rows) {
        const k = key(r);
        await fetch("/api/inventory/start", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            secret,
            baseType: r.baseType,
            category: r.category,
            size: r.size,
            startQty: Number(draftStarts[k] ?? 0),
          }),
        });
      }

      setMsg("Alle Startwerte gespeichert.");
      router.refresh();
    } catch {
      setMsg("Fehler beim Speichern aller Startwerte.");
    } finally {
      setBusy(false);
    }
  }

  async function runScan() {
    if (!secret) {
      setMsg("Bitte SCAN_SECRET eingeben (oben).");
      return;
    }

    setBusy(true);
    setMsg("");

    try {
      // ✅ best effort: sorgt dafür, dass "Scan now" das Datum ebenfalls dauerhaft setzt
      try {
        await persistDefaultFrom(from);
      } catch {}

      const q = new URLSearchParams();
      q.set("secret", secret);
      if (from) q.set("from", from);

      const res = await fetch(`/api/inventory/scan?${q.toString()}`, {
        method: "GET",
        cache: "no-store",
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Scan fehlgeschlagen.");

      setMsg(
        `Scan OK. processed=${data.processed ?? "?"}, skipped=${data.skipped ?? "?"}, movements=${data.movementsCreated ?? "?"}`
      );
      router.refresh();
    } catch (e: any) {
      setMsg(e?.message || "Fehler beim Scan.");
    } finally {
      setBusy(false);
    }
  }

  // ✅ NEU: nur Anzeige filtern (keine Funktion ändert Verhalten)
  const visibleRows = useMemo(() => {
    const isColor = (r: Row) => r.category === "Wandfarbe" || r.category === "Lack";
    const isPigment = (r: Row) => r.category === "Pigmente";
    const isLabel = (r: Row) => r.category === "Etikett";
    const isShipping = (r: Row) => !isColor(r) && !isPigment(r) && !isLabel(r);

    if (filter === "Alle") return rows;
    if (filter === "Farbe") return rows.filter(isColor);
    if (filter === "Pigmente") return rows.filter(isPigment);
    if (filter === "Etiketten") return rows.filter(isLabel);
    if (filter === "Versandmaterial") return rows.filter(isShipping);
    return rows;
  }, [rows, filter]);

  return (
    <>
      <div style={{ padding: 12, border: "1px solid #ddd", borderRadius: 10, marginBottom: 16 }}>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>Quick actions</div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span style={{ fontSize: 13, color: "#666" }}>SCAN_SECRET</span>
            <input
              value={secret}
              onChange={(e) => persistSecret(e.target.value)}
              placeholder="change-me-to-a-random-long-string"
              style={{
                padding: "8px 10px",
                borderRadius: 8,
                border: "1px solid #ccc",
                minWidth: 320,
              }}
            />
          </label>

          {/* ✅ neuer Zeitraum-Filter */}
          <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span style={{ fontSize: 13, color: "#666" }}>Ab Datum</span>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #ccc" }}
            />
          </label>

          {/* ✅ NEU: Filter */}
          <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span style={{ fontSize: 13, color: "#666" }}>Filter</span>
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value as Filter)}
              style={{
                padding: "8px 10px",
                borderRadius: 8,
                border: "1px solid #ccc",
                backgroundColor: "#fff",
                color: "#111",
              }}
            >
              <option value="Alle" style={{ color: "#111" }}>
                Alle
              </option>
              <option value="Farbe" style={{ color: "#111" }}>
                Farbe
              </option>
              <option value="Pigmente" style={{ color: "#111" }}>
                Pigmente
              </option>
              <option value="Versandmaterial" style={{ color: "#111" }}>
                Versandmaterial
              </option>
              <option value="Etiketten" style={{ color: "#111" }}>
                Etiketten
              </option>
            </select>

          </label>

          <button
            onClick={applyFrom}
            disabled={busy}
            style={{
              padding: "8px 12px",
              borderRadius: 8,
              border: "1px solid #ccc",
              cursor: busy ? "not-allowed" : "pointer",
            }}
          >
            Apply
          </button>

          <button
            onClick={runScan}
            disabled={busy}
            style={{
              padding: "8px 12px",
              borderRadius: 8,
              border: "1px solid #ccc",
              cursor: busy ? "not-allowed" : "pointer",
            }}
          >
            {busy ? "…" : "Scan now"}
          </button>

          <button
            onClick={saveAll}
            disabled={busy}
            style={{
              padding: "8px 12px",
              borderRadius: 8,
              border: "1px solid #ccc",
              cursor: busy ? "not-allowed" : "pointer",
            }}
          >
            {busy ? "…" : "Save all start values"}
          </button>

          {/* ✅ Button zu scanned orders (mit gleichem from) */}
          <Link
            href={from ? `/scanned-orders?from=${encodeURIComponent(from)}` : "/scanned-orders"}
            style={{
              padding: "8px 12px",
              borderRadius: 8,
              border: "1px solid #ccc",
              textDecoration: "none",
              display: "inline-flex",
              alignItems: "center",
            }}
          >
            View scanned orders
          </Link>
        </div>

        <div style={{ marginTop: 10, fontSize: 13, color: msg.includes("Fehler") ? "crimson" : "#666" }}>
          {msg || "Remaining = Start − Used. Scan liest bezahlte Shopify Orders (ab Datum) und schreibt Movements."}
        </div>
      </div>

      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            {["Base", "Kategorie", "Größe", "Start", "Min", "Used", "Remaining", "Set Start", "Set Min"].map((h) => (
              <th key={h} style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 10 }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {visibleRows.map((r, i) => {
            const k = key(r);
            const draft = draftStarts[k] ?? 0;
            const draftMin = draftMins[k] ?? 0;

            return (
              <tr key={i} style={{ borderBottom: "1px solid #f0f0f0" }}>
                <td style={{ padding: 10 }}>{r.baseType}</td>
                <td style={{ padding: 10 }}>{r.category}</td>
                <td style={{ padding: 10 }}>{r.size}</td>
                <td style={{ padding: 10 }}>{r.startQty}</td>
                <td style={{ padding: 10 }}>{r.minQty}</td>
                <td style={{ padding: 10 }}>{r.usedQty}</td>
                <td
                  style={{
                    padding: 10,
                    fontWeight: 700,
                    color: r.remainingQty < r.minQty ? "crimson" : "inherit",
                  }}
                >
                  {r.remainingQty}
                </td>

                <td style={{ padding: 10 }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <input
                      type="number"
                      value={Number.isFinite(draft) ? draft : 0}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        setDraftStarts((prev) => ({ ...prev, [k]: Number.isFinite(v) ? v : 0 }));
                      }}
                      style={{
                        width: 110,
                        padding: "8px 10px",
                        borderRadius: 8,
                        border: "1px solid #ccc",
                      }}
                    />
                    <button
                      onClick={() => saveOne(k)}
                      disabled={busy}
                      style={{
                        padding: "8px 10px",
                        borderRadius: 8,
                        border: "1px solid #ccc",
                        cursor: busy ? "not-allowed" : "pointer",
                      }}
                    >
                      Save
                    </button>
                  </div>
                </td>

                <td style={{ padding: 10 }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <input
                      type="number"
                      value={Number.isFinite(draftMin) ? draftMin : 0}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        setDraftMins((prev) => ({ ...prev, [k]: Number.isFinite(v) ? v : 0 }));
                      }}
                      style={{
                        width: 110,
                        padding: "8px 10px",
                        borderRadius: 8,
                        border: "1px solid #ccc",
                      }}
                    />
                    <button
                      onClick={() => saveMin(k)}
                      disabled={busy}
                      style={{
                        padding: "8px 10px",
                        borderRadius: 8,
                        border: "1px solid #ccc",
                        cursor: busy ? "not-allowed" : "pointer",
                      }}
                    >
                      Save
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </>
  );
}
