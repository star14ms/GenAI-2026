"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { searchStocks } from "@/lib/stocks";

export default function Home() {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<{ symbol: string; name: string }[]>([]);
  const [highlighted, setHighlighted] = useState(-1);
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    const matches = searchStocks(query);
    setSuggestions(matches);
    setHighlighted(-1);
    setShowDropdown(query.trim().length > 0 && matches.length > 0);
  }, [query]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const navigateToStock = (symbol: string) => {
    router.push(`/search/${encodeURIComponent(symbol)}`);
    setQuery("");
    setShowDropdown(false);
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    const match = suggestions.find(
      (s) => s.symbol.toUpperCase() === q.toUpperCase() || s.name.toLowerCase().includes(q.toLowerCase())
    );
    if (match) {
      navigateToStock(match.symbol);
    } else if (suggestions.length > 0) {
      navigateToStock(suggestions[0].symbol);
    } else {
      router.push(`/search/${encodeURIComponent(q.toUpperCase())}`);
      setQuery("");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showDropdown || suggestions.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlighted((h) => (h < suggestions.length - 1 ? h + 1 : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlighted((h) => (h > 0 ? h - 1 : suggestions.length - 1));
    } else if (e.key === "Enter" && highlighted >= 0) {
      e.preventDefault();
      navigateToStock(suggestions[highlighted].symbol);
    }
  };

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "2rem",
        background: "linear-gradient(180deg, #f8fafc 0%, #e2e8f0 100%)",
      }}
    >
      <div
        style={{
          textAlign: "center",
          maxWidth: "32rem",
          width: "100%",
        }}
      >
        <h1
          style={{
            fontSize: "2.5rem",
            fontWeight: 700,
            marginBottom: "0.5rem",
            color: "#0f172a",
            letterSpacing: "-0.025em",
          }}
        >
          Stock Search
        </h1>
        <p
          style={{
            fontSize: "1rem",
            color: "#64748b",
            marginBottom: "2.5rem",
          }}
        >
          Search by company name or symbol (e.g. Apple, AAPL, Microsoft)
        </p>

        <form onSubmit={handleSearch} style={{ width: "100%" }}>
          <div
            style={{
              display: "flex",
              gap: "0.75rem",
              maxWidth: "28rem",
              margin: "0 auto",
              flexDirection: "column",
              alignItems: "stretch",
            }}
          >
            <div
              ref={dropdownRef}
              style={{ position: "relative" }}
            >
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Enter company name or symbol..."
                autoFocus
                autoComplete="off"
                style={{
                  width: "100%",
                  padding: "1rem 1.25rem",
                  fontSize: "1.125rem",
                  border: "2px solid #e2e8f0",
                  borderRadius: "12px",
                  outline: "none",
                  transition: "border-color 0.2s, box-shadow 0.2s",
                }}
                onFocus={() => query.trim().length > 0 && suggestions.length > 0 && setShowDropdown(true)}
              />
              {showDropdown && suggestions.length > 0 && (
                <ul
                  style={{
                    position: "absolute",
                    top: "100%",
                    left: 0,
                    right: 0,
                    margin: 0,
                    marginTop: "4px",
                    padding: 0,
                    listStyle: "none",
                    background: "#fff",
                    border: "1px solid #e2e8f0",
                    borderRadius: "8px",
                    boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                    maxHeight: "16rem",
                    overflowY: "auto",
                    zIndex: 10,
                    textAlign: "left",
                  }}
                >
                  {suggestions.map((s, i) => (
                    <li
                      key={s.symbol}
                      onClick={() => navigateToStock(s.symbol)}
                      onMouseEnter={() => setHighlighted(i)}
                      style={{
                        padding: "0.75rem 1rem",
                        cursor: "pointer",
                        fontSize: "0.9375rem",
                        background: highlighted === i ? "#f1f5f9" : "transparent",
                        color: "#334155",
                        borderBottom: i < suggestions.length - 1 ? "1px solid #f1f5f9" : "none",
                        textAlign: "left",
                      }}
                    >
                      {s.name} ({s.symbol})
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <button
              type="submit"
              disabled={!query.trim()}
              style={{
                padding: "1rem 1.5rem",
                fontSize: "1rem",
                fontWeight: 600,
                borderRadius: "12px",
                border: "none",
                background: query.trim() ? "#2563eb" : "#94a3b8",
                color: "white",
                cursor: query.trim() ? "pointer" : "not-allowed",
                transition: "background 0.2s",
              }}
            >
              Search
            </button>
          </div>
        </form>

        <p
          style={{
            marginTop: "2rem",
            fontSize: "0.875rem",
            color: "#94a3b8",
          }}
        >
          <a href="/test" style={{ color: "#64748b", textDecoration: "none" }}>
            Developer test page →
          </a>
        </p>
      </div>
    </main>
  );
}
