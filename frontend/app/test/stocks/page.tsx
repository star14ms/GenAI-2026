"use client";

import { useState, useEffect } from "react";
import StockChart, { RANGES } from "@/components/StockChart";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

type HistoryPoint = {
  date: string;
  close: number | null;
};

type PointsByRange = Partial<Record<(typeof RANGES)[number], HistoryPoint[]>>;

export default function TestStocksPage() {
  const [symbol, setSymbol] = useState("AAPL");
  const [years, setYears] = useState<(typeof RANGES)[number]>(1);
  const [pointsByRange, setPointsByRange] = useState<PointsByRange>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const points = pointsByRange[years] ?? [];

  useEffect(() => {
    setPointsByRange({});
  }, [symbol]);

  const loadAllHistory = async (selectYears?: (typeof RANGES)[number]) => {
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
    if (selectYears) setYears(selectYears);

    try {
      const results = await Promise.all(
        RANGES.map(async (y) => {
          try {
            const res = await fetch(
              `${base}/api/stocks/history/${encodeURIComponent(cleanSymbol)}?years=${y}`
            );
            const data = await res.json();
            if (!res.ok) throw new Error(data.detail || "Failed to load stock history");
            return { years: y, points: (data.points || []).filter((p: HistoryPoint) => p.close !== null) };
          } catch {
            return { years: y, points: [] as HistoryPoint[] };
          }
        })
      );
      const byRange: PointsByRange = {};
      for (const { years: y, points: pts } of results) {
        byRange[y] = pts;
      }
      setPointsByRange(byRange);
      if (results.every((r) => r.points.length === 0)) {
        setError(
          "Stocks API is not available in the deployed backend. Run the backend locally with full dependencies (pip install -r requirements-full.txt) for stocks support."
        );
      }
    } catch (err) {
      setPointsByRange({});
      setError(err instanceof Error ? err.message : "Failed to load stock history");
    } finally {
      setLoading(false);
    }
  };

  const handleVisualize = () => {
    loadAllHistory(years);
  };

  const handleRangeClick = (range: (typeof RANGES)[number]) => {
    if (pointsByRange[range]?.length) {
      setYears(range);
    } else {
      loadAllHistory(range);
    }
  };

  return (
    <main style={{ maxWidth: "64rem", margin: "0 auto", padding: "1rem" }}>
      <header style={{ marginBottom: "1rem" }}>
        <h1 style={{ fontSize: "1.5rem", marginBottom: "0.5rem" }}>
          Stock History
        </h1>
        <p style={{ color: "#555", marginBottom: "0.75rem" }}>
          Visualize historical close price for 1, 3, 5, or 10 years.
        </p>
        <a href="/test" style={{ color: "#666", textDecoration: "none" }}>
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
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              handleVisualize();
            }
          }}
          placeholder="e.g. AAPL"
          style={{
            padding: "0.5rem 0.75rem",
            border: "1px solid #ccc",
            borderRadius: "8px",
            minWidth: "10rem",
          }}
        />

        <button
          onClick={handleVisualize}
          disabled={loading}
          style={{
            padding: "0.5rem 0.75rem",
            borderRadius: "8px",
            border: "1px solid #ccc",
            background: "#111827",
            color: "#fff",
            cursor: loading ? "not-allowed" : "pointer",
          }}
        >
          Visualize
        </button>

        {RANGES.map((range) => (
          <button
            key={range}
            onClick={() => handleRangeClick(range)}
            disabled={loading}
            style={{
              padding: "0.5rem 0.75rem",
              borderRadius: "8px",
              border: "1px solid #ccc",
              background: years === range ? "var(--color-primary)" : "#fff",
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

      {!loading && points.length > 0 && (
        <section>
          <StockChart points={points} years={years} height="18rem" />
        </section>
      )}
    </main>
  );
}
