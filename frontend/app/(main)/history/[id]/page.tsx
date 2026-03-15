"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import StockChart, { RANGES } from "@/components/StockChart";
import { useAuth } from "@/contexts/AuthContext";
import { getSearchHistoryEntry, type SearchHistoryEntry } from "@/lib/searchHistory";

function getStarRatingColor(filledCount: number): string {
  if (filledCount <= 0) return "#cbd5e1";
  if (filledCount <= 1) return "#f87171";
  if (filledCount <= 2) return "#fb923c";
  if (filledCount <= 3) return "#facc15";
  if (filledCount <= 4) return "#a3e635";
  return "#4ade80";
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

export default function HistoryViewPage() {
  const params = useParams();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const id = params?.id as string;
  const [entry, setEntry] = useState<SearchHistoryEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [years, setYears] = useState<(typeof RANGES)[number]>(1);

  useEffect(() => {
    if (authLoading) return;
    if (!user?.id) {
      router.replace("/");
      return;
    }
    if (!id) {
      setError("Invalid history ID");
      setLoading(false);
      return;
    }

    getSearchHistoryEntry(user.id, id).then(({ data, error: err }) => {
      setLoading(false);
      if (err || !data) {
        setError(err?.message || "Not found");
        return;
      }
      setEntry(data);
      const rd = data.result_data;
      const availableYears = rd?.pointsByRange
        ? (Object.keys(rd.pointsByRange)
            .map(Number)
            .filter((y) => RANGES.includes(y as (typeof RANGES)[number])) as (typeof RANGES)[number][])
        : [];
      if (availableYears.length > 0 && !availableYears.includes(years)) {
        setYears(availableYears[0]);
      }
    });
  }, [user?.id, id, authLoading, router]);

  if (authLoading || loading) {
    return (
      <main
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#ffedd5",
        }}
      >
        <p style={{ color: "#64748b" }}>Loading…</p>
      </main>
    );
  }

  if (!user || error || !entry) {
    return (
      <main
        style={{
          minHeight: "100vh",
          padding: "2rem",
          textAlign: "center",
          background: "#ffedd5",
        }}
      >
        <p style={{ color: "#991b1b", marginBottom: "1rem" }}>
          {error || "You must be signed in to view search history."}
        </p>
        <Link href="/" style={{ color: "var(--color-primary)", textDecoration: "none" }}>
          ← Back to search
        </Link>
      </main>
    );
  }

  const { symbol, mode, company_name, result_data } = entry;
  const rd = result_data;
  const pointsByRange = rd?.pointsByRange ?? {};
  const points = (pointsByRange[years] ?? []) as HistoryPoint[];
  const analysis = rd?.analysis ?? null;
  const qualitative = rd?.qualitative ?? null;
  const quantitative = rd?.quantitative ?? null;
  const rating = rd?.rating ?? null;

  return (
    <main
      style={{
        background: "#ffedd5",
        width: "100%",
        margin: 0,
        padding: "1.5rem 1.5rem 3rem",
        boxSizing: "border-box",
      }}
    >
      <div style={{ maxWidth: "64rem", margin: "0 auto" }}>
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
          <p style={{ fontSize: "0.75rem", color: "#94a3b8", marginBottom: "0.25rem" }}>
            Saved result
          </p>
          <h1 style={{ fontSize: "1.75rem", marginBottom: "0.25rem" }}>
            {company_name ? `${company_name} (${symbol})` : symbol}
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

        {/* Chart */}
        <section style={{ marginBottom: "2rem", minHeight: "22rem" }}>
          {points.length > 0 ? (
            <>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "1rem",
                  flexWrap: "wrap",
                  gap: "0.5rem",
                }}
              >
                <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
                  <span style={{ fontSize: "0.875rem", color: "#64748b" }}>Price history:</span>
                  {RANGES.filter((r) => pointsByRange[r]?.length).map((range) => (
                    <button
                      key={range}
                      onClick={() => setYears(range)}
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
                {rating?.score != null && (
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
                    <span style={{ fontSize: "1.875rem" }} aria-label={`${rating.score} out of 10`}>
                      {[1, 2, 3, 4, 5].map((i) => {
                        const filledCount = Math.round((rating.score / 10) * 5);
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
                  </div>
                )}
              </div>
              <StockChart points={points} years={years} height="20rem" />
            </>
          ) : (
            <div
              style={{
                padding: "2rem",
                textAlign: "center",
                color: "#64748b",
                background: "#f8fafc",
                borderRadius: "12px",
                border: "1px solid #e2e8f0",
              }}
            >
              No price history in saved result
            </div>
          )}
        </section>

        {/* Quantitative + Qualitative */}
        <section style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          <div style={{ display: "flex", flexDirection: "row", gap: "1.5rem", flexWrap: "wrap" }}>
            <div style={{ flex: "1 1 300px", minWidth: 0, display: "flex", flexDirection: "column" }}>
              {quantitative?.quantitative_summary ? (
                <div
                  style={{
                    padding: "1rem",
                    background: "#f8fafc",
                    borderRadius: "12px",
                    border: "1px solid #e2e8f0",
                    flex: 1,
                    minHeight: 0,
                    overflow: "auto",
                  }}
                >
                  <h2 style={{ fontSize: "1rem", marginBottom: "0.5rem", color: "#334155" }}>
                    Quantitative Summary
                  </h2>
                  <div
                    className="markdown-content"
                    style={{ fontSize: "0.9375rem", lineHeight: 1.6, color: "#475569" }}
                  >
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{quantitative.quantitative_summary}</ReactMarkdown>
                  </div>
                </div>
              ) : (
                <div
                  style={{
                    padding: "1rem",
                    background: "#f8fafc",
                    borderRadius: "12px",
                    border: "1px solid #e2e8f0",
                    color: "#94a3b8",
                    fontSize: "0.875rem",
                    flex: 1,
                  }}
                >
                  Quantitative summary unavailable
                </div>
              )}
            </div>

            <div style={{ flex: "1 1 300px", minWidth: 0, display: "flex", flexDirection: "column" }}>
              {qualitative?.qualitative_summary ? (
                <div
                  style={{
                    padding: "1rem",
                    background: "#f8fafc",
                    borderRadius: "12px",
                    border: "1px solid #e2e8f0",
                    flex: 1,
                    minHeight: 0,
                    overflow: "auto",
                  }}
                >
                  <h2 style={{ fontSize: "1rem", marginBottom: "0.5rem", color: "#334155" }}>
                    Qualitative Summary
                  </h2>
                  <div
                    className="markdown-content"
                    style={{ fontSize: "0.9375rem", lineHeight: 1.6, color: "#475569" }}
                  >
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{qualitative.qualitative_summary}</ReactMarkdown>
                  </div>
                </div>
              ) : (
                <div
                  style={{
                    padding: "1rem",
                    background: "#f8fafc",
                    borderRadius: "12px",
                    border: "1px solid #e2e8f0",
                    color: "#94a3b8",
                    fontSize: "0.875rem",
                    flex: 1,
                  }}
                >
                  Qualitative summary unavailable
                </div>
              )}
            </div>
          </div>

          {/* News */}
          <div style={{ minHeight: "6rem" }}>
            {qualitative?.headlines && qualitative.headlines.length > 0 ? (
              <div
                style={{
                  padding: "1rem",
                  background: "#f8fafc",
                  borderRadius: "12px",
                  border: "1px solid #e2e8f0",
                }}
              >
                <h2 style={{ fontSize: "1rem", marginBottom: "0.75rem", color: "#334155" }}>
                  Recent news
                </h2>
                <ul
                  style={{
                    margin: 0,
                    padding: 0,
                    listStyle: "none",
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.5rem",
                  }}
                >
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
                            <span
                              style={{
                                color: "#94a3b8",
                                fontWeight: 400,
                                marginLeft: "0.25rem",
                              }}
                            >
                              ({formatDateOnly(n.published_at)})
                            </span>
                          )}
                        </a>
                      ) : (
                        <span style={{ fontSize: "0.875rem", color: "#64748b" }}>
                          {n.title || "Article"}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <div
                style={{
                  padding: "1rem",
                  background: "#f8fafc",
                  borderRadius: "12px",
                  border: "1px solid #e2e8f0",
                  color: "#94a3b8",
                  fontSize: "0.875rem",
                }}
              >
                No recent news available
              </div>
            )}
          </div>
        </section>

        <p style={{ marginTop: "1.5rem", fontSize: "0.875rem", color: "#94a3b8" }}>
          <Link
            href={`/search/${encodeURIComponent(symbol)}?mode=${mode}`}
            style={{ color: "var(--color-primary)", textDecoration: "none" }}
          >
            View latest data →
          </Link>
        </p>
      </div>
    </main>
  );
}
