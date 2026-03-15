"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

interface ApiState {
  health: { status?: string } | null;
  hello: { message?: string } | null;
  healthUrl: string | null;
  helloUrl: string | null;
  items: { id: string; title: string; created_at: string }[] | null;
  itemsError: string | null;
  error: string | null;
}

export default function TestHome() {
  const { user, loading: authLoading, signingIn, signInWithGoogle, signOut } = useAuth();
  const [state, setState] = useState<ApiState>({
    health: null,
    hello: null,
    healthUrl: null,
    helloUrl: null,
    items: null,
    itemsError: null,
    error: null,
  });

  useEffect(() => {
    const base = API_URL.replace(/\/$/, "");
    const hasApi = base && base !== "undefined";
    const hasSupabase =
      process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    const apiPromise = hasApi
      ? Promise.all([
        fetch(`${base}/health`).then(async (r) => {
          if (!r.ok) throw new Error(`API ${r.status} at ${base}/health — check NEXT_PUBLIC_API_URL (no /Prod stage)`);
          return r.json();
        }),
        fetch(`${base}/api/hello`).then(async (r) => {
          if (!r.ok) throw new Error(`API ${r.status} at ${base}/api/hello — check NEXT_PUBLIC_API_URL`);
          return r.json();
        }),
      ]).then(([health, hello]) => ({ health, hello }))
      : Promise.resolve({ health: null, hello: null });

    const fetchItems = () =>
      hasSupabase && supabase
        ? supabase
          .from("items")
          .select("id, title, created_at")
          .order("created_at", { ascending: false })
          .then(({ data, error }) => {
            if (error) throw error;
            return data;
          })
        : Promise.resolve(null);

    const supabasePromise = Promise.resolve(fetchItems()).catch((err) => {
      if (err?.name === "AbortError" || err?.message?.includes("Lock broken")) {
        return new Promise((resolve, reject) =>
          setTimeout(
            () =>
              Promise.resolve(fetchItems())
                .then(resolve)
                .catch((retryErr) => reject(retryErr)),
            500
          )
        );
      }
      throw err;
    });

    Promise.allSettled([apiPromise, supabasePromise]).then(([apiResult, itemsResult]) => {
      const health =
        apiResult.status === "fulfilled" ? apiResult.value.health : null;
      const hello =
        apiResult.status === "fulfilled" ? apiResult.value.hello : null;
      const items =
        itemsResult.status === "fulfilled"
          ? (itemsResult.value as { id: string; title: string; created_at: string }[] | null)
          : null;
      const itemsError =
        itemsResult.status === "rejected"
          ? itemsResult.reason?.name === "AbortError" ||
            itemsResult.reason?.message?.includes("Lock broken")
            ? "Storage conflict — refresh the page to retry"
            : itemsResult.reason?.message?.includes("items") ||
              itemsResult.reason?.code === "42P01"
            ? "Create an 'items' table in Supabase (see README)"
            : itemsResult.reason?.message || "Failed to fetch items"
          : null;

      const apiError =
        apiResult.status === "rejected"
          ? apiResult.reason?.message || "API request failed"
          : null;

      setState({
        health,
        hello,
        healthUrl: hasApi ? `${base}/health` : null,
        helloUrl: hasApi ? `${base}/api/hello` : null,
        items,
        itemsError,
        error: hasApi ? apiError : "NEXT_PUBLIC_API_URL is not set",
      });
    });
  }, []);

  return (
    <main style={{ padding: "2rem", maxWidth: "40rem", margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem", flexWrap: "wrap", gap: "0.5rem" }}>
        <h1 style={{ margin: 0 }}>CommonCents (Test)</h1>
        {supabase && (
          authLoading ? (
            <span style={{ fontSize: "0.875rem", color: "#666" }}>Loading auth…</span>
          ) : user ? (
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                {user.user_metadata?.avatar_url && (
                  <img
                    src={String(user.user_metadata.avatar_url)}
                    alt=""
                    width={32}
                    height={32}
                    style={{ borderRadius: "50%" }}
                  />
                )}
                <span style={{ fontSize: "0.875rem", color: "#333" }}>
                  {String(user.user_metadata?.full_name || user.user_metadata?.name || user.email || "")}
                </span>
                <button
                  onClick={() => signOut()}
                  style={{
                    padding: "0.375rem 0.75rem",
                    fontSize: "0.875rem",
                    borderRadius: "6px",
                    border: "1px solid #ccc",
                    background: "white",
                    cursor: "pointer",
                  }}
                >
                  Sign out
                </button>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "0.5rem" }}>
                <button
                  onClick={() => signInWithGoogle()}
                  disabled={signingIn}
                  style={{
                    padding: "0.5rem 1rem",
                    fontSize: "0.875rem",
                    borderRadius: "6px",
                    border: "none",
                    background: signingIn ? "#9ca3af" : "#4285f4",
                    color: "white",
                    cursor: signingIn ? "not-allowed" : "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                  }}
                >
                  {signingIn ? (
                    <span>Redirecting to Google…</span>
                  ) : (
                    <>
                  <svg width="18" height="18" viewBox="0 0 18 18">
                    <path fill="#fff" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"/>
                    <path fill="#fff" d="M9 18c2.43 0 4.467-.806 6.168-2.172l-2.908-2.258c-.806.54-1.837.86-3.26.86-2.513 0-4.646-1.697-5.41-4.043H.957v2.332C2.438 15.983 5.482 18 9 18z"/>
                    <path fill="#fff" d="M3.59 10.387c-.18-.54-.282-1.117-.282-1.71 0-.593.102-1.17.282-1.71V4.645H.957C.347 5.863 0 7.167 0 8.5c0 1.333.348 2.637.957 3.855l2.633-1.968z"/>
                    <path fill="#fff" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.645L3.59 6.977C4.354 4.633 6.487 2.936 9 2.936z"/>
                  </svg>
                  Sign in with Google
                    </>
                  )}
                </button>
                <details style={{ fontSize: "0.75rem", color: "#666", textAlign: "right" }}>
                  <summary style={{ cursor: "pointer" }}>redirect_uri_mismatch? Add this URL</summary>
                  <code
                    style={{
                      display: "block",
                      marginTop: "0.25rem",
                      padding: "0.25rem",
                      background: "#f5f5f5",
                      borderRadius: "4px",
                      wordBreak: "break-all",
                    }}
                  >
                    {process.env.NEXT_PUBLIC_SUPABASE_URL
                      ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/callback`
                      : "(set NEXT_PUBLIC_SUPABASE_URL)"}
                  </code>
                  <span style={{ display: "block", marginTop: "0.25rem" }}>
                    → Google Cloud Console → Credentials → OAuth client → Authorized redirect URIs
                  </span>
                </details>
              </div>
            )
        )}
      </div>
      <p style={{ marginBottom: "1.5rem" }}>
        <a href="/test/chat" style={{ color: "var(--color-primary)", textDecoration: "none" }}>
          → Chatbot (Gemini, Claude, ChatGPT)
        </a>
      </p>
      <p style={{ marginBottom: "1.5rem" }}>
        <a href="/test/stocks" style={{ color: "var(--color-primary)", textDecoration: "none" }}>
          → Stock History (1Y / 3Y / 5Y / 10Y)
        </a>
      </p>
      <p style={{ marginBottom: "1.5rem" }}>
        <a href="/" style={{ color: "#666", textDecoration: "none" }}>
          ← Back to main app
        </a>
      </p>

      {state.error && (
        <div style={{ color: "#c00", marginBottom: "1rem", padding: "0.75rem", background: "#fee2e2", borderRadius: "8px" }}>
          <p style={{ margin: 0 }}>{state.error}</p>
          {state.error.includes("NEXT_PUBLIC_API_URL") && (
            <p style={{ margin: "0.5rem 0 0", fontSize: "0.875rem" }}>
              Vercel: Project → Settings → Environment Variables → add{" "}
              <code>NEXT_PUBLIC_API_URL</code> ={" "}
              <code>https://28gra3tzo6.execute-api.ca-central-1.amazonaws.com</code>
            </p>
          )}
        </div>
      )}

      <section style={{ marginBottom: "1.5rem" }}>
        <h2 style={{ fontSize: "1rem", marginBottom: "0.5rem" }}>Health</h2>
        {state.healthUrl && (
          <p
            style={{
              fontSize: "0.75rem",
              color: "#666",
              marginBottom: "0.5rem",
              wordBreak: "break-all",
            }}
          >
            GET {state.healthUrl}
          </p>
        )}
        <pre
          style={{
            background: "#f5f5f5",
            padding: "1rem",
            borderRadius: "4px",
            overflow: "auto",
          }}
        >
          {state.health ? JSON.stringify(state.health, null, 2) : "Loading..."}
        </pre>
      </section>

      <section style={{ marginBottom: "1.5rem" }}>
        <h2 style={{ fontSize: "1rem", marginBottom: "0.5rem" }}>Hello</h2>
        {state.helloUrl && (
          <p
            style={{
              fontSize: "0.75rem",
              color: "#666",
              marginBottom: "0.5rem",
              wordBreak: "break-all",
            }}
          >
            GET {state.helloUrl}
          </p>
        )}
        <pre
          style={{
            background: "#f5f5f5",
            padding: "1rem",
            borderRadius: "4px",
            overflow: "auto",
          }}
        >
          {state.hello ? JSON.stringify(state.hello, null, 2) : "Loading..."}
        </pre>
      </section>

      <section>
        <h2 style={{ fontSize: "1rem", marginBottom: "0.5rem" }}>
          Supabase (items)
        </h2>
        {state.itemsError && (
          <p style={{ color: "#c00", marginBottom: "0.5rem" }}>
            {state.itemsError}
          </p>
        )}
        <pre
          style={{
            background: "#f5f5f5",
            padding: "1rem",
            borderRadius: "4px",
            overflow: "auto",
          }}
        >
          {state.items !== null
            ? state.items.length === 0
              ? "[] (empty - add rows in Supabase Table Editor)"
              : JSON.stringify(state.items, null, 2)
            : "Loading..."}
        </pre>
      </section>
    </main>
  );
}
