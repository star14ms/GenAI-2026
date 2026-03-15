"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { useSidebar } from "@/contexts/SidebarContext";
import { getSearchHistory, deleteSearchHistoryEntry, type SearchHistoryEntry } from "@/lib/searchHistory";

function formatHistoryDate(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function SidebarLayout({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading, signingIn, signInWithGoogle, signOut } = useAuth();
  const { sidebarOpen, setSidebarOpen, historyRefreshKey } = useSidebar();
  const pathname = usePathname();
  const [history, setHistory] = useState<SearchHistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  useEffect(() => {
    if (!user?.id) {
      setHistory([]);
      return;
    }
    setHistoryLoading(true);
    getSearchHistory(user.id).then(({ data, error }) => {
      setHistoryLoading(false);
      if (!error && data) setHistory(data);
    });
  }, [user?.id, pathname, sidebarOpen, historyRefreshKey]);

  const handleDeleteHistory = async (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (!user?.id) return;
    const { error } = await deleteSearchHistoryEntry(user.id, id);
    if (!error) setHistory((prev) => prev.filter((h) => h.id !== id));
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "row",
        minHeight: "100vh",
        width: "100%",
        background: "linear-gradient(180deg, #ffedd5 0%, rgb(255, 200, 142) 50%, #e2e8f0 100%)",
      }}
    >
      {/* Sidebar - full height from top, animated */}
      {user && (
        <aside
          style={{
            width: sidebarOpen ? "16rem" : "0",
            minWidth: sidebarOpen ? "16rem" : "0",
            flexShrink: 0,
            display: "flex",
            flexDirection: "column",
            borderRight: sidebarOpen ? "1px solid rgba(0,0,0,0.08)" : "none",
            background: "rgba(255,255,255,0.6)",
            backdropFilter: "blur(8px)",
            WebkitBackdropFilter: "blur(8px)",
            overflow: "hidden",
            transition: "width 0.25s ease-out, min-width 0.25s ease-out, border-color 0.25s ease-out",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "0.75rem 1rem",
              borderBottom: "1px solid #e2e8f0",
              flexShrink: 0,
            }}
          >
            <h2 style={{ fontSize: "0.9375rem", fontWeight: 600, color: "#334155", margin: 0 }}>
              Search history
            </h2>
            <button
              type="button"
              onClick={() => setSidebarOpen(false)}
              aria-label="Hide sidebar"
              style={{
                width: "1.75rem",
                height: "1.75rem",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: 0,
                border: "none",
                background: "transparent",
                color: "#64748b",
                cursor: "pointer",
                borderRadius: "4px",
                fontSize: "1.25rem",
                lineHeight: 1,
                transition: "background 0.2s ease, color 0.2s ease",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "#f1f5f9";
                e.currentTarget.style.color = "#334155";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
                e.currentTarget.style.color = "#64748b";
              }}
            >
              ←
            </button>
          </div>
          <div style={{ flex: 1, overflowY: "auto", padding: "0.75rem" }}>
            {historyLoading ? (
              <p style={{ fontSize: "0.8125rem", color: "#94a3b8" }}>Loading…</p>
            ) : history.length === 0 ? (
              <p style={{ fontSize: "0.8125rem", color: "#94a3b8" }}>
                Your past searches will appear here.
              </p>
            ) : (
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
                {history.map((entry) => (
                  <li key={entry.id}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.375rem",
                        padding: "0.5rem 0.75rem",
                        background: "#fff",
                        borderRadius: "8px",
                        border: "1px solid #e2e8f0",
                        transition: "border-color 0.2s, box-shadow 0.2s",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = "var(--color-primary)";
                        e.currentTarget.style.boxShadow = "0 0 0 2px rgba(234, 88, 12, 0.2)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = "#e2e8f0";
                        e.currentTarget.style.boxShadow = "none";
                      }}
                    >
                      <a
                        href={`/history/${entry.id}`}
                        style={{
                          flex: 1,
                          display: "flex",
                          flexDirection: "column",
                          gap: "0.125rem",
                          textDecoration: "none",
                          color: "#334155",
                          fontSize: "0.8125rem",
                          minWidth: 0,
                          overflow: "hidden",
                        }}
                      >
                        <span
                          style={{
                            fontWeight: 500,
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {entry.company_name || entry.symbol} ({entry.symbol})
                        </span>
                        <span style={{ fontSize: "0.75rem", color: "#94a3b8" }}>
                          {formatHistoryDate(entry.created_at)}
                        </span>
                      </a>
                      <button
                        type="button"
                        onClick={(e) => handleDeleteHistory(e, entry.id)}
                        aria-label="Remove from history"
                        style={{
                          flexShrink: 0,
                          width: "1.5rem",
                          height: "1.5rem",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          padding: 0,
                          border: "none",
                          background: "transparent",
                          color: "#94a3b8",
                          cursor: "pointer",
                          borderRadius: "4px",
                          fontSize: "1rem",
                          lineHeight: 1,
                          transition: "background 0.2s ease, color 0.2s ease",
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = "#fee2e2";
                          e.currentTarget.style.color = "#dc2626";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = "transparent";
                          e.currentTarget.style.color = "#94a3b8";
                        }}
                      >
                        ×
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>
      )}

      {/* Main content area */}
      <div
        style={{
          flex: 1,
          position: "relative",
          display: "flex",
          flexDirection: "column",
          minWidth: 0,
          minHeight: 0,
          overflow: "auto",
        }}
      >
        {/* Auth + sidebar button on background, same margin from edges */}
        <div
          style={{
            position: "absolute",
            top: "1rem",
            left: "1rem",
            right: "1rem",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            pointerEvents: "none",
            zIndex: 10,
          }}
        >
          <div
            style={{
              pointerEvents: "auto",
              opacity: user && !sidebarOpen ? 1 : 0,
              visibility: user && !sidebarOpen ? "visible" : "hidden",
              transition: "opacity 0.2s ease-out, visibility 0.2s ease-out",
            }}
          >
            {user && !sidebarOpen && (
              <button
                type="button"
                onClick={() => setSidebarOpen(true)}
                aria-label="Show search history"
                title="Show search history"
                style={{
                  width: "2.75rem",
                  height: "2.75rem",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: 0,
                  border: "none",
                  background: "transparent",
                  color: "#64748b",
                  cursor: "pointer",
                  borderRadius: "8px",
                  transition: "background 0.2s ease, color 0.2s ease",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "#f1f5f9";
                  e.currentTarget.style.color = "#334155";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent";
                  e.currentTarget.style.color = "#64748b";
                }}
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <circle cx="4" cy="6" r="1.5" fill="currentColor" />
                  <line x1="9" y1="6" x2="20" y2="6" />
                  <circle cx="4" cy="12" r="1.5" fill="currentColor" />
                  <line x1="9" y1="12" x2="20" y2="12" />
                  <circle cx="4" cy="18" r="1.5" fill="currentColor" />
                  <line x1="9" y1="18" x2="20" y2="18" />
                </svg>
              </button>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", pointerEvents: "auto" }}>
            {authLoading ? (
              <span style={{ fontSize: "1rem", color: "#64748b" }}>Loading…</span>
            ) : user ? (
              <>
                {user.user_metadata?.avatar_url && (
                  <img
                    src={String(user.user_metadata.avatar_url)}
                    alt=""
                    width={32}
                    height={32}
                    style={{ borderRadius: "50%" }}
                  />
                )}
                <span style={{ fontSize: "1rem", color: "#475569" }}>
                  {String(user.user_metadata?.full_name || user.user_metadata?.name || user.email || "")}
                </span>
                <button
                  onClick={() => signOut()}
                  style={{
                    padding: "0.5rem 1rem",
                    fontSize: "1rem",
                    borderRadius: "8px",
                    border: "1px solid #e2e8f0",
                    background: "#fff",
                    color: "#475569",
                    cursor: "pointer",
                    transition: "background 0.2s ease, color 0.2s ease, border-color 0.2s ease",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "#f8fafc";
                    e.currentTarget.style.borderColor = "#cbd5e1";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "#fff";
                    e.currentTarget.style.borderColor = "#e2e8f0";
                  }}
                >
                  Sign out
                </button>
              </>
            ) : (
              <button
                onClick={() => signInWithGoogle()}
                disabled={signingIn}
                style={{
                  padding: "0.5rem 1rem",
                  fontSize: "1.0625rem",
                  borderRadius: "8px",
                  border: "none",
                  background: "transparent",
                  color: signingIn ? "#94a3b8" : "#334155",
                  cursor: signingIn ? "not-allowed" : "pointer",
                  transition: "background 0.2s ease, color 0.2s ease",
                }}
                onMouseEnter={(e) => {
                  if (!signingIn) {
                    e.currentTarget.style.background = "rgba(0,0,0,0.04)";
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent";
                }}
              >
                {signingIn ? "Signing in…" : "Sign in with Google"}
              </button>
            )}
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}
