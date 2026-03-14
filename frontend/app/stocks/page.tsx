"use client";

import { useMemo, useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

type HistoryPoint = {
  date: string;
  close: number | null;
};

const RANGES = [1, 3, 5, 10] as const;

export default function StocksPage() {
  const [symbol, setSymbol] = useState("AAPL");
  const [years, setYears] = useState<(typeof RANGES)[number]>(1);
  const [points, setPoints] = useState<HistoryPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadHistory = async (nextYears: (typeof RANGES)[number]) => {
    const cleanSymbol = symbol.trim().toUpperCase();
    if (!cleanSymbol) {
      setError("Please enter a stock symbol.");
      return;
    }

    const base = API_URL.replace(/\/$/, "");
    if (!base || base === "undefined") {
      setError("NEXT_PUBLIC_API_URL is not set");
      return;
    }

    setLoading(true);
    setError(null);
    setYears(nextYears);

    try {
      const res = await fetch(
        `${base}/api/stocks/history/${encodeURIComponent(cleanSymbol)}?years=${nextYears}`
      );
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || "Failed to load stock history");
      }

      setPoints((data.points || []).filter((p: HistoryPoint) => p.close !== null));
    } catch (err) {
      setPoints([]);
      setError(err instanceof Error ? err.message : "Failed to load stock history");
    } finally {
      setLoading(false);
    }
  };

  const chart = useMemo(() => {
    if (!points.length) return null;

    const width = 900;
    const height = 300;
    const values = points.map((p) => p.close ?? 0);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = Math.max(max - min, 1);

    const polyline = points
      .map((p, index) => {
        const x = (index / Math.max(points.length - 1, 1)) * width;
        const y = height - (((p.close ?? min) - min) / range) * height;
        return `${x},${y}`;
      })
      .join(" ");

    return { width, height, min, max, polyline };
  }, [points]);

  return (
    <main style={{ maxWidth: "64rem", margin: "0 auto", padding: "1rem" }}>
      <header style={{ marginBottom: "1rem" }}>
        <h1 style={{ fontSize: "1.5rem", marginBottom: "0.5rem" }}>
          Stock History
        </h1>
        <p style={{ color: "#555", marginBottom: "0.75rem" }}>
          Visualize historical close price for 1, 3, 5, or 10 years.
        </p>
        <a href="/" style={{ color: "#666", textDecoration: "none" }}>
          ← Back
        </a>
      </header>

      <section
        style={{
          display: "flex",
          gap: "0.5rem",
          alignItems: "center",
          flexWrap: "wrap",
          marginBottom: "1rem",
        }}
      >
        <input
          value={symbol}
          onChange={(e) => setSymbol(e.target.value.toUpperCase())}
          placeholder="e.g. AAPL"
          style={{
            padding: "0.5rem 0.75rem",
            border: "1px solid #ccc",
            borderRadius: "8px",
            minWidth: "10rem",
          }}
        />

        {RANGES.map((range) => (
          <button
            key={range}
            onClick={() => loadHistory(range)}
            disabled={loading}
            style={{
              padding: "0.5rem 0.75rem",
              borderRadius: "8px",
              border: "1px solid #ccc",
              background: years === range ? "#2563eb" : "#fff",
              color: years === range ? "#fff" : "#111",
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            {range}Y
          </button>
        ))}
      </section>

      {error && (
        <div
          style={{
            background: "#fee2e2",
            color: "#991b1b",
            borderRadius: "8px",
            padding: "0.75rem",
            marginBottom: "1rem",
          }}
        >
          {error}
        </div>
      )}

      {loading && <p>Loading historical prices...</p>}

      {!loading && chart && (
        <section>
          <div
            style={{
              border: "1px solid #ddd",
              borderRadius: "10px",
              padding: "0.75rem",
              background: "#fff",
            }}
          >
            <svg
              viewBox={`0 0 ${chart.width} ${chart.height}`}
              style={{ width: "100%", height: "18rem", display: "block" }}
              role="img"
              aria-label="Historical stock close price chart"
            >
              <polyline
                fill="none"
                stroke="#2563eb"
                strokeWidth="2"
                points={chart.polyline}
              />
            </svg>
          </div>

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginTop: "0.5rem",
              fontSize: "0.875rem",
              color: "#555",
            }}
          >
            <span>Min: {chart.min.toFixed(2)}</span>
            <span>Max: {chart.max.toFixed(2)}</span>
            <span>Last: {(points[points.length - 1]?.close ?? 0).toFixed(2)}</span>
          </div>
        </section>
      )}
    </main>
  );
}
