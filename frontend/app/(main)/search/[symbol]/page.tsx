"use client";

import { useState, useEffect, useRef } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import StockChart, { RANGES } from "@/components/StockChart";
import DetailChatbot from "@/components/DetailChatbot";
import { getCompanyName } from "@/lib/stocks";
import { useAuth } from "@/contexts/AuthContext";
import { useSidebar } from "@/contexts/SidebarContext";
import { saveSearchHistory } from "@/lib/searchHistory";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

function getStarRatingColor(filledCount: number): string {
  if (filledCount <= 0) return "#cbd5e1";
  if (filledCount <= 1) return "#f87171"; // red-400
  if (filledCount <= 2) return "#fb923c"; // orange-400
  if (filledCount <= 3) return "#facc15"; // amber-300
  if (filledCount <= 4) return "#a3e635"; // lime-400
  return "#4ade80"; // green-400
}

function formatDateOnly(dateStr: string): string {
  if (!dateStr?.trim()) return "";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

type HistoryPoint = {
  date: string;
  close: number | null;
};

interface AnalysisData {
  data?: Record<string, unknown>[];
  signal?: string;
  latest_price?: number;
  score?: number | null;
}

interface QualitativeSummary {
  qualitative_summary?: string;
  headlines?: { title?: string; link?: string; published_at?: string; image_url?: string }[];
}

interface QuantitativeSummary {
  quantitative_summary?: string;
  latest_metrics?: Record<string, unknown>;
}

type PointsByRange = Partial<Record<(typeof RANGES)[number], HistoryPoint[]>>;

export default function SearchPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const { refreshHistory } = useSidebar();
  const symbol = (params?.symbol as string)?.toUpperCase() || "";
  const mode = (searchParams?.get("mode") || "beginner").toLowerCase() === "expert" ? "expert" : "beginner";
  const [years, setYears] = useState<(typeof RANGES)[number]>(1);
  const [pointsByRange, setPointsByRange] = useState<PointsByRange>({});
  const [analysis, setAnalysis] = useState<AnalysisData | null>(null);
  const [qualitative, setQualitative] = useState<QualitativeSummary | null>(null);
  const [quantitative, setQuantitative] = useState<QuantitativeSummary | null>(null);
  const [loadingChart, setLoadingChart] = useState(true);
  const [loadingQualitative, setLoadingQualitative] = useState(true);
  const [loadingQuantitative, setLoadingQuantitative] = useState(true);
  const [qualStreamComplete, setQualStreamComplete] = useState(false);
  const [quantStreamComplete, setQuantStreamComplete] = useState(false);
  const [loadingRating, setLoadingRating] = useState(false);
  const [rating, setRating] = useState<{ score: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const base = API_URL.replace(/\/$/, "");
  const points = pointsByRange[years] ?? [];
  const companyName = getCompanyName(symbol);
  const searchResultRef = useRef<HTMLDivElement>(null);

  const fullPageContext = [
    `Symbol: ${symbol}`,
    companyName ? `Company: ${companyName}` : "",
    analysis?.latest_price != null ? `Latest price: $${analysis.latest_price.toFixed(2)}` : "",
    analysis?.signal ? `Analysis signal: ${analysis.signal}` : "",
    rating?.score != null ? `Stock rating: ${rating.score}/10` : "",
    quantitative?.quantitative_summary
      ? `\n## Quantitative Summary\n${quantitative.quantitative_summary}`
      : "",
    qualitative?.qualitative_summary
      ? `\n## Qualitative Summary\n${qualitative.qualitative_summary}`
      : "",
    qualitative?.headlines && qualitative.headlines.length > 0
      ? `\n## Recent News\n${qualitative.headlines.map((n) => `- ${n.title || "Article"}${n.published_at ? ` (${formatDateOnly(n.published_at)})` : ""}`).join("\n")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

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
    setQualStreamComplete(false);
    setQuantStreamComplete(false);
    setRating(null);
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
        setError("No result found");
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
          `${base}/api/stocks/qualitative-summary/${encodeURIComponent(symbol)}/stream?news_limit=5&mode=${mode}`,
          { signal: qualAbort.signal }
        );
        if (qualCancelled) return;
        if (!res.ok || !res.body) {
          setQualitative(null);
          setLoadingQualitative(false);
          setQualStreamComplete(true);
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
          if (done) {
            setQualStreamComplete(true);
            break;
          }
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
        setQualStreamComplete(true);
        sync.qualReady = true;
        releaseBoth();
      } finally {
        if (!qualCancelled) setLoadingQualitative(false);
      }
    };

    const loadQuantitativeStream = async () => {
      try {
        const res = await fetch(
          `${base}/api/stocks/quantitative-summary/${encodeURIComponent(symbol)}/stream?days=252&mode=${mode}`,
          { signal: quantAbort.signal }
        );
        if (quantCancelled) return;
        if (!res.ok || !res.body) {
          setQuantitative(null);
          setLoadingQuantitative(false);
          setQuantStreamComplete(true);
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
          if (done) {
            setQuantStreamComplete(true);
            break;
          }
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
        setQuantStreamComplete(true);
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
  }, [symbol, base, mode]);

  // Request rating ONLY after both qualitative and quantitative streams have completed
  const ratingRequestedRef = useRef(false);
  useEffect(() => {
    ratingRequestedRef.current = false;
  }, [symbol]);

  useEffect(() => {
    if (
      !base ||
      base === "undefined" ||
      loadingQualitative ||
      loadingQuantitative ||
      !qualitative?.qualitative_summary ||
      !quantitative?.quantitative_summary ||
      ratingRequestedRef.current
    ) {
      return;
    }
    ratingRequestedRef.current = true;
    setLoadingRating(true);
    fetch(
      `${base}/api/stocks/rating/${encodeURIComponent(symbol)}?provider=chatgpt&mode=${mode}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          qualitative_summary: qualitative.qualitative_summary,
          quantitative_summary: quantitative.quantitative_summary,
          headlines: qualitative.headlines || [],
          latest_price: analysis?.latest_price ?? undefined,
        }),
      }
    )
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (res.ok && data?.score != null) {
          setRating({ score: data.score });
        } else if (!res.ok && data?.detail) {
          console.warn("Rating request failed:", data.detail);
        }
        return null;
      })
      .finally(() => setLoadingRating(false));
  }, [
    symbol,
    base,
    mode,
    loadingQualitative,
    loadingQuantitative,
    qualitative?.qualitative_summary,
    qualitative?.headlines,
    quantitative?.quantitative_summary,
    analysis?.latest_price,
  ]);

  // Save search history for signed-in users when streams and rating are complete
  const savedToHistoryRef = useRef(false);
  useEffect(() => {
    if (
      !user?.id ||
      savedToHistoryRef.current ||
      loadingChart ||
      !qualStreamComplete ||
      !quantStreamComplete ||
      loadingRating
    )
      return;
    const hasData =
      Object.keys(pointsByRange).length > 0 ||
      qualitative?.qualitative_summary ||
      quantitative?.quantitative_summary;
    if (!hasData) return;

    savedToHistoryRef.current = true;
    saveSearchHistory(user.id, symbol, mode, companyName || null, {
      pointsByRange: pointsByRange as Record<number, { date: string; close: number | null }[]>,
      analysis,
      qualitative,
      quantitative,
      rating,
    })
      .then(() => refreshHistory())
      .catch(() => {});
  }, [
    user?.id,
    symbol,
    mode,
    companyName,
    loadingChart,
    qualStreamComplete,
    quantStreamComplete,
    loadingRating,
    pointsByRange,
    analysis,
    qualitative,
    quantitative,
    rating,
    refreshHistory,
  ]);

  const handleRangeChange = (range: (typeof RANGES)[number]) => {
    setYears(range);
  };

  if (!symbol) {
    return (
      <main style={{ padding: "2rem", textAlign: "center", minHeight: "100vh", background: "#ffedd5" }}>
        <p>No symbol provided.</p>
        <Link href="/" className="link-hover-underline" style={{ color: "var(--color-primary)" }}>
          ← Back to search
        </Link>
      </main>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "#ffedd5", width: "100%" }}>
      <main
        style={{
          maxWidth: "64rem",
          margin: "0 auto",
          padding: "1.5rem",
          paddingBottom: "3rem",
        }}
      >
      <header style={{ marginBottom: "1.5rem" }}>
        <Link
          href="/"
          className="link-hover-underline"
          style={{
            fontSize: "0.875rem",
            color: "var(--color-primary)",
            marginBottom: "0.5rem",
            display: "inline-block",
          }}
        >
          ← Back to search
        </Link>
        <h1 style={{ fontSize: "1.75rem", marginBottom: "0.25rem" }}>
          {companyName ? `${companyName} (${symbol})` : symbol}
        </h1>
        <p style={{ fontSize: "0.875rem", color: "#64748b", marginBottom: "0.25rem" }}>
          Summary mode: {mode === "expert" ? "Expert" : "Beginner"}
        </p>
        {analysis?.latest_price != null && (
          <p style={{ fontSize: "1.25rem", color: "#334155", fontWeight: 600, margin: 0 }}>
            ${analysis.latest_price.toFixed(2)}
          </p>
        )}
      </header>

      {error && !loadingChart && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            minHeight: "24rem",
            padding: "3rem 2rem",
            background: "#f8fafc",
            borderRadius: "12px",
            border: "1px solid #e2e8f0",
            textAlign: "center",
          }}
        >
          <p style={{ fontSize: "1.25rem", color: "#64748b", margin: "0 0 0.5rem 0", fontWeight: 500 }}>
            No result found for &quot;{symbol}&quot;
          </p>
          <p style={{ fontSize: "0.9375rem", color: "#94a3b8", margin: "0 0 1.5rem 0" }}>
            This symbol may not exist or data is unavailable. Try another search.
          </p>
          <Link
            href="/"
            className="link-hover-underline"
            style={{
              padding: "0.5rem 1rem",
              borderRadius: "8px",
              background: "var(--color-primary)",
              color: "#fff",
              fontSize: "0.9375rem",
              textDecoration: "none",
            }}
          >
            ← Back to search
          </Link>
        </div>
      )}

      {!error && (
      <>
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
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem", flexWrap: "wrap", gap: "0.5rem" }}>
              <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
                <span style={{ fontSize: "0.875rem", color: "#64748b" }}>Price history:</span>
                {RANGES.map((range) => (
                <button
                  key={range}
                  onClick={() => handleRangeChange(range)}
                  style={{
                    padding: "0.375rem 0.75rem",
                    borderRadius: "8px",
                    border: "1px solid #e2e8f0",
                    background: years === range ? "var(--color-primary)" : "#fff",
                    color: years === range ? "#fff" : "#334155",
                    cursor: "pointer",
                    fontSize: "0.875rem",
                  }}
                >
                  {range}Y
                </button>
              ))}
              </div>
              {(loadingRating || rating?.score != null) && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    padding: "0.375rem 0.75rem",
                    background: "rgba(255,255,255,0.9)",
                    borderRadius: "999px",
                    border: "1px solid rgba(0,0,0,0.08)",
                    boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
                  }}
                >
                  {loadingRating ? (
                    <span style={{ fontSize: "0.875rem", color: "#64748b" }}>Rating…</span>
                  ) : rating?.score != null ? (
                    <>
                      <span style={{ fontSize: "1.875rem" }} aria-label={`${rating.score} out of 10`}>
                        {[1, 2, 3, 4, 5].map((i) => {
                          const filledCount = Math.round((rating!.score! / 10) * 5);
                          const isFilled = i <= filledCount;
                          return (
                            <span
                              key={i}
                              style={{
                                color: isFilled ? getStarRatingColor(filledCount) : "#94a3b8",
                              }}
                            >
                              ★
                            </span>
                          );
                        })}
                      </span>
                      <span style={{ fontSize: "0.875rem", color: "#475569", fontWeight: 500 }}>
                        {rating.score}/10
                      </span>
                    </>
                  ) : null}
                </div>
              )}
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
      <section ref={searchResultRef} style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
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
              <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                {qualitative.headlines.slice(0, 5).map((n, i) => (
                  <li key={i}>
                    {n.link ? (
                      <a
                        href={n.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="link-hover-underline"
                        style={{
                          display: "block",
                          color: "var(--color-primary)",
                          fontSize: "0.875rem",
                          textDecoration: "none",
                        }}
                      >
                        {n.title || "Article"}
                        {n.published_at && (
                          <span style={{ color: "#94a3b8", fontWeight: 400, marginLeft: "0.25rem" }}>
                            ({formatDateOnly(n.published_at)})
                          </span>
                        )}
                      </a>
                    ) : (
                      <span style={{ fontSize: "0.875rem", color: "#64748b" }}>{n.title || "Article"}</span>
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
      `}</style>

      <DetailChatbot
        symbol={symbol}
        companyName={companyName || symbol}
        fullPageContext={fullPageContext}
        selectableRef={searchResultRef}
      />
      </>
      )}
    </main>
    </div>
  );
}
