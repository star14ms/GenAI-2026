"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import StockChart, { RANGES } from "@/components/StockChart";
import NewsThumbnail from "@/components/NewsThumbnail";
import { getCompanyName } from "@/lib/stocks";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

type HistoryPoint = {
  date: string;
  close: number | null;
};

interface AnalysisData {
  data?: Record<string, unknown>[];
  signal?: string;
  latest_price?: number;
}

interface QualitativeSummary {
  qualitative_summary?: string;
  headlines?: { title?: string; link?: string; published_at?: string }[];
}

interface QuantitativeSummary {
  quantitative_summary?: string;
  latest_metrics?: Record<string, unknown>;
}

type PointsByRange = Partial<Record<(typeof RANGES)[number], HistoryPoint[]>>;

export default function SearchPage() {
  const params = useParams();
  const symbol = (params?.symbol as string)?.toUpperCase() || "";
  const [years, setYears] = useState<(typeof RANGES)[number]>(1);
  const [pointsByRange, setPointsByRange] = useState<PointsByRange>({});
  const [analysis, setAnalysis] = useState<AnalysisData | null>(null);
  const [qualitative, setQualitative] = useState<QualitativeSummary | null>(null);
  const [quantitative, setQuantitative] = useState<QuantitativeSummary | null>(null);
  const [loadingChart, setLoadingChart] = useState(true);
  const [loadingQualitative, setLoadingQualitative] = useState(true);
  const [loadingQuantitative, setLoadingQuantitative] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const base = API_URL.replace(/\/$/, "");
  const points = pointsByRange[years] ?? [];
  const companyName = getCompanyName(symbol);

  useEffect(() => {
    if (!symbol || !base || base === "undefined") {
      setLoadingChart(false);
      setLoadingQualitative(false);
      setLoadingQuantitative(false);
      setError("Invalid symbol or API not configured");
      return;
    }

    setLoadingChart(true);
    setLoadingQualitative(true);
    setLoadingQuantitative(true);
    setError(null);

    const loadAllHistory = async () => {
      const results = await Promise.all(
        RANGES.map(async (y) => {
          try {
            const res = await fetch(
              `${base}/api/stocks/history/${encodeURIComponent(symbol)}?years=${y}`
            );
            const data = await res.json();
            if (!res.ok) throw new Error(data.detail || "Failed to load history");
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
        setError("Failed to load stock data");
      }
    };
    loadAllHistory().finally(() => setLoadingChart(false));

    const loadAnalysis = async () => {
      try {
        const res = await fetch(`${base}/analysis/${encodeURIComponent(symbol)}?days=30`);
        if (res.ok) {
          const data = await res.json();
          setAnalysis(data);
        }
      } catch {
        setAnalysis(null);
      }
    };
    loadAnalysis();

    const qualAbort = new AbortController();
    const quantAbort = new AbortController();
    let qualCancelled = false;
    let quantCancelled = false;

    const sync = { qualReady: false, quantReady: false };
    const releaseBoth = () => {
      if (sync.qualReady && sync.quantReady) {
        setLoadingQualitative(false);
        setLoadingQuantitative(false);
      }
    };

    const loadQualitativeStream = async () => {
      try {
        const res = await fetch(
          `${base}/api/stocks/qualitative-summary/${encodeURIComponent(symbol)}/stream?news_limit=5`,
          { signal: qualAbort.signal }
        );
        if (qualCancelled) return;
        if (!res.ok || !res.body) {
          setQualitative(null);
          setLoadingQualitative(false);
          sync.qualReady = true;
          releaseBoth();
          return;
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let headlines: { title?: string; link?: string; published_at?: string }[] = [];
        let summary = "";
        let metaParsed = false;

        while (true) {
          const { done, value } = await reader.read();
          if (qualCancelled) return;
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          if (!metaParsed && buffer.includes("\n")) {
            const idx = buffer.indexOf("\n");
            const firstLine = buffer.slice(0, idx);
            buffer = buffer.slice(idx + 1);
            metaParsed = true;
            sync.qualReady = true;
            releaseBoth();
            try {
              const meta = JSON.parse(firstLine) as { headlines?: typeof headlines };
              if (meta.headlines) headlines = meta.headlines;
              setQualitative({ qualitative_summary: "", headlines });
            } catch {
              summary += firstLine + "\n";
            }
          }

          if (metaParsed) {
            summary += buffer;
            buffer = "";
            setQualitative((prev) => ({
              ...prev,
              qualitative_summary: summary,
              headlines: headlines.length ? headlines : prev?.headlines,
            }));
          }
        }
        if (qualCancelled) return;
        if (buffer) {
          summary += buffer;
          setQualitative((prev) => ({
            ...prev,
            qualitative_summary: summary,
            headlines: headlines.length ? headlines : prev?.headlines,
          }));
        }
      } catch (e) {
        if ((e as Error).name === "AbortError" || qualCancelled) return;
        setQualitative(null);
        sync.qualReady = true;
        releaseBoth();
      } finally {
        if (!qualCancelled) setLoadingQualitative(false);
      }
    };

    const loadQuantitativeStream = async () => {
      try {
        const res = await fetch(
          `${base}/api/stocks/quantitative-summary/${encodeURIComponent(symbol)}/stream?days=252`,
          { signal: quantAbort.signal }
        );
        if (quantCancelled) return;
        if (!res.ok || !res.body) {
          setQuantitative(null);
          setLoadingQuantitative(false);
          sync.quantReady = true;
          releaseBoth();
          return;
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let summary = "";

        while (true) {
          const { done, value } = await reader.read();
          if (quantCancelled) return;
          if (done) break;
          summary += decoder.decode(value, { stream: true });
          if (!sync.quantReady) {
            sync.quantReady = true;
            releaseBoth();
          }
          setQuantitative((prev) => ({
            ...prev,
            quantitative_summary: summary,
          }));
        }
      } catch (e) {
        if ((e as Error).name === "AbortError" || quantCancelled) return;
        setQuantitative(null);
        sync.quantReady = true;
        releaseBoth();
      } finally {
        if (!quantCancelled) setLoadingQuantitative(false);
      }
    };

    void Promise.all([loadQualitativeStream(), loadQuantitativeStream()]);

    return () => {
      qualCancelled = true;
      quantCancelled = true;
      qualAbort.abort();
      quantAbort.abort();
    };
  }, [symbol, base]);

  const handleRangeChange = (range: (typeof RANGES)[number]) => {
    setYears(range);
  };

  if (!symbol) {
    return (
      <main style={{ padding: "2rem", textAlign: "center" }}>
        <p>No symbol provided.</p>
        <Link href="/" className="link-hover-underline" style={{ color: "#2563eb" }}>
          ← Back to search
        </Link>
      </main>
    );
  }

  return (
    <main
      style={{
        maxWidth: "64rem",
        margin: "0 auto",
        padding: "1.5rem",
        minHeight: "100vh",
      }}
    >
      <header style={{ marginBottom: "1.5rem" }}>
        <Link
          href="/"
          className="link-hover-underline"
          style={{
            fontSize: "0.875rem",
            color: "#64748b",
            marginBottom: "0.5rem",
            display: "inline-block",
          }}
        >
          ← Back to search
        </Link>
        <h1 style={{ fontSize: "1.75rem", marginBottom: "0.25rem" }}>
          {companyName ? `${companyName} (${symbol})` : symbol}
        </h1>
        {analysis?.latest_price != null && (
          <p style={{ fontSize: "1.25rem", color: "#334155", fontWeight: 600 }}>
            ${analysis.latest_price.toFixed(2)}
          </p>
        )}
      </header>

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

      {/* Section 1: Chart - fixed position */}
      <section style={{ marginBottom: "2rem", minHeight: "22rem" }}>
        {loadingChart ? (
          <div className="search-detail-skeleton" style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
              <div className="skeleton-block" style={{ width: "6rem", height: "1.25rem", borderRadius: "4px" }} />
              {RANGES.map((r) => (
                <div key={r} className="skeleton-block" style={{ width: "2.5rem", height: "1.75rem", borderRadius: "8px" }} />
              ))}
            </div>
            <div className="skeleton-block" style={{ height: "20rem", borderRadius: "12px" }} />
          </div>
        ) : points.length > 0 ? (
          <>
            <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginBottom: "1rem", flexWrap: "wrap" }}>
              <span style={{ fontSize: "0.875rem", color: "#64748b" }}>Price history:</span>
              {RANGES.map((range) => (
                <button
                  key={range}
                  onClick={() => handleRangeChange(range)}
                  style={{
                    padding: "0.375rem 0.75rem",
                    borderRadius: "8px",
                    border: "1px solid #e2e8f0",
                    background: years === range ? "#2563eb" : "#fff",
                    color: years === range ? "#fff" : "#334155",
                    cursor: "pointer",
                    fontSize: "0.875rem",
                  }}
                >
                  {range}Y
                </button>
              ))}
            </div>
            <StockChart points={points} years={years} height="20rem" />
          </>
        ) : (
          <div style={{ padding: "2rem", textAlign: "center", color: "#64748b", background: "#f8fafc", borderRadius: "12px", border: "1px solid #e2e8f0" }}>
            No price history available
          </div>
        )}
      </section>

      {/* Section 2: Quantitative + Qualitative - side by side, 50% width each */}
      <section style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
        <div style={{ display: "flex", flexDirection: "row", gap: "1.5rem", flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 300px", minWidth: 0, display: "flex", flexDirection: "column" }}>
            {loadingQuantitative ? (
              <div className="search-detail-skeleton" style={{ padding: "1rem", background: "#f8fafc", borderRadius: "12px", border: "1px solid #e2e8f0", flex: 1, minHeight: 0 }}>
                <div className="skeleton-block" style={{ width: "8rem", height: "1rem", marginBottom: "0.75rem", borderRadius: "4px" }} />
                <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                  {[1, 2, 3, 4].map((j) => (
                    <div key={j} className="skeleton-block" style={{ width: j === 4 ? "60%" : "100%", height: "0.875rem", borderRadius: "4px" }} />
                  ))}
                </div>
              </div>
            ) : quantitative?.quantitative_summary ? (
              <div style={{ padding: "1rem", background: "#f8fafc", borderRadius: "12px", border: "1px solid #e2e8f0", flex: 1, minHeight: 0, overflow: "auto" }}>
                <h2 style={{ fontSize: "1rem", marginBottom: "0.5rem", color: "#334155" }}>Quantitative Summary</h2>
                <div className="markdown-content" style={{ fontSize: "0.9375rem", lineHeight: 1.6, color: "#475569" }}>
                  <ReactMarkdown>{quantitative.quantitative_summary}</ReactMarkdown>
                </div>
              </div>
            ) : (
              <div style={{ padding: "1rem", background: "#f8fafc", borderRadius: "12px", border: "1px solid #e2e8f0", color: "#94a3b8", fontSize: "0.875rem", flex: 1 }}>
                Quantitative summary unavailable
              </div>
            )}
          </div>

          <div style={{ flex: "1 1 300px", minWidth: 0, display: "flex", flexDirection: "column" }}>
            {loadingQualitative ? (
              <div className="search-detail-skeleton" style={{ padding: "1rem", background: "#f8fafc", borderRadius: "12px", border: "1px solid #e2e8f0", flex: 1, minHeight: 0 }}>
                <div className="skeleton-block" style={{ width: "8rem", height: "1rem", marginBottom: "0.75rem", borderRadius: "4px" }} />
                <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                  {[1, 2, 3, 4].map((j) => (
                    <div key={j} className="skeleton-block" style={{ width: j === 4 ? "60%" : "100%", height: "0.875rem", borderRadius: "4px" }} />
                  ))}
                </div>
              </div>
            ) : qualitative?.qualitative_summary ? (
              <div style={{ padding: "1rem", background: "#f8fafc", borderRadius: "12px", border: "1px solid #e2e8f0", flex: 1, minHeight: 0, overflow: "auto" }}>
                <h2 style={{ fontSize: "1rem", marginBottom: "0.5rem", color: "#334155" }}>Qualitative Summary</h2>
                <div className="markdown-content" style={{ fontSize: "0.9375rem", lineHeight: 1.6, color: "#475569" }}>
                  <ReactMarkdown>{qualitative.qualitative_summary}</ReactMarkdown>
                </div>
              </div>
            ) : (
              <div style={{ padding: "1rem", background: "#f8fafc", borderRadius: "12px", border: "1px solid #e2e8f0", color: "#94a3b8", fontSize: "0.875rem", flex: 1 }}>
                Qualitative summary unavailable
              </div>
            )}
          </div>
        </div>

        {/* Section 3: News - fixed position */}
        <div style={{ minHeight: "6rem" }}>
          {loadingQualitative ? (
            <div className="search-detail-skeleton" style={{ padding: "1rem", background: "#f8fafc", borderRadius: "12px", border: "1px solid #e2e8f0" }}>
              <div className="skeleton-block" style={{ width: "6rem", height: "1rem", marginBottom: "0.75rem", borderRadius: "4px" }} />
              <ul style={{ margin: 0, paddingLeft: "1.25rem", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                {[1, 2, 3, 4, 5].map((i) => (
                  <li key={i} style={{ listStyle: "none", paddingLeft: 0 }}>
                    <div className="skeleton-block" style={{ width: `${70 + (i % 3) * 10}%`, height: "0.875rem", borderRadius: "4px" }} />
                  </li>
                ))}
              </ul>
            </div>
          ) : qualitative?.headlines && qualitative.headlines.length > 0 ? (
            <div style={{ padding: "1rem", background: "#f8fafc", borderRadius: "12px", border: "1px solid #e2e8f0" }}>
              <h2 style={{ fontSize: "1rem", marginBottom: "0.75rem", color: "#334155" }}>Recent news</h2>
              <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                {qualitative.headlines.slice(0, 5).map((n, i) => (
                  <li key={i}>
                    {n.link ? (
                      <a
                        href={n.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="link-hover-underline"
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "0.75rem",
                          color: "#334155",
                          textDecoration: "none",
                        }}
                      >
                        <NewsThumbnail
                          url={n.link}
                          alt={n.title || "Article"}
                          width={96}
                          height={64}
                        />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <span style={{ color: "#2563eb", fontSize: "0.875rem", fontWeight: 500 }}>
                            {n.title || "Article"}
                          </span>
                          {n.published_at && (
                            <div style={{ fontSize: "0.75rem", color: "#94a3b8", marginTop: "0.125rem" }}>
                              {n.published_at}
                            </div>
                          )}
                        </div>
                      </a>
                    ) : (
                      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                        <div
                          style={{
                            width: 96,
                            height: 64,
                            borderRadius: "6px",
                            background: "#e2e8f0",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            flexShrink: 0,
                          }}
                        >
                          <span style={{ fontSize: "1.5rem", color: "#94a3b8" }}>📰</span>
                        </div>
                        <span style={{ fontSize: "0.875rem", color: "#64748b" }}>{n.title || "Article"}</span>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <div style={{ padding: "1rem", background: "#f8fafc", borderRadius: "12px", border: "1px solid #e2e8f0", color: "#94a3b8", fontSize: "0.875rem" }}>
              No recent news available
            </div>
          )}
        </div>
      </section>

      <style>{`
        .search-detail-skeleton .skeleton-block {
          background: linear-gradient(90deg, #e2e8f0 25%, #f1f5f9 50%, #e2e8f0 75%);
          background-size: 200% 100%;
          animation: search-skeleton-shimmer 1.5s ease-in-out infinite;
        }
        @keyframes search-skeleton-shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
        @keyframes news-thumbnail-shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
    </main>
  );
}
