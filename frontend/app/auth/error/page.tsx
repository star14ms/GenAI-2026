"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

function AuthErrorContent() {
  const searchParams = useSearchParams();
  const message = searchParams.get("message") || "Authentication failed";
  const showRedirectHelp = message.includes("Redirect URLs") || message.includes("No auth code");

  return (
    <main style={{ padding: "2rem", maxWidth: "32rem", margin: "0 auto", textAlign: "center" }}>
      <h1 style={{ marginBottom: "1rem", color: "#c00" }}>Auth Error</h1>
      <p style={{ marginBottom: "1.5rem", color: "#666", whiteSpace: "pre-wrap" }}>{message}</p>
      {showRedirectHelp && (
        <details style={{ marginBottom: "1.5rem", textAlign: "left", fontSize: "0.875rem", color: "#333" }}>
          <summary style={{ cursor: "pointer", marginBottom: "0.5rem" }}>Fix: Add redirect URL</summary>
          <ol style={{ paddingLeft: "1.25rem", margin: 0 }}>
            <li>Open Supabase Dashboard → your project</li>
            <li>Authentication → URL Configuration</li>
            <li>Add <code style={{ background: "#f0f0f0", padding: "0.125rem 0.25rem", borderRadius: "4px" }}>http://localhost:3000/auth/callback</code> to Redirect URLs</li>
            <li>If that still fails, try <code style={{ background: "#f0f0f0", padding: "0.125rem 0.25rem", borderRadius: "4px" }}>http://localhost:3000/**</code></li>
            <li>Save and try again</li>
          </ol>
        </details>
      )}
      <Link
        href="/"
        style={{
          padding: "0.5rem 1rem",
          background: "var(--color-primary)",
          color: "white",
          borderRadius: "6px",
          textDecoration: "none",
          fontSize: "0.875rem",
        }}
      >
        Back to Home
      </Link>
    </main>
  );
}

export default function AuthErrorPage() {
  return (
    <Suspense fallback={<main style={{ padding: "2rem", textAlign: "center" }}>Loading...</main>}>
      <AuthErrorContent />
    </Suspense>
  );
}
