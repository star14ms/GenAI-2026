"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

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

export default function Home() {
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
          fetch(`${base}/health`).then((r) => r.json()),
          fetch(`${base}/api/hello`).then((r) => r.json()),
        ]).then(([health, hello]) => ({ health, hello }))
      : Promise.resolve({ health: null, hello: null });

    const supabasePromise =
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

    Promise.allSettled([apiPromise, supabasePromise]).then(([apiResult, itemsResult]) => {
      const health =
        apiResult.status === "fulfilled" ? apiResult.value.health : null;
      const hello =
        apiResult.status === "fulfilled" ? apiResult.value.hello : null;
      const items =
        itemsResult.status === "fulfilled" ? itemsResult.value : null;
      const itemsError =
        itemsResult.status === "rejected"
          ? itemsResult.reason?.message?.includes("items") ||
            itemsResult.reason?.code === "42P01"
            ? "Create an 'items' table in Supabase (see README)"
            : itemsResult.reason?.message || "Failed to fetch items"
          : null;

      setState({
        health,
        hello,
        healthUrl: hasApi ? `${base}/health` : null,
        helloUrl: hasApi ? `${base}/api/hello` : null,
        items,
        itemsError,
        error: hasApi ? null : "NEXT_PUBLIC_API_URL is not set",
      });
    });
  }, []);

  return (
    <main style={{ padding: "2rem", maxWidth: "40rem", margin: "0 auto" }}>
      <h1 style={{ marginBottom: "1rem" }}>Web Service</h1>
      <p style={{ marginBottom: "1.5rem" }}>
        <a href="/chat" style={{ color: "#2563eb", textDecoration: "none" }}>
          → Chatbot (Gemini, Claude, ChatGPT)
        </a>
      </p>

      {state.error && (
        <p style={{ color: "#c00", marginBottom: "1rem" }}>{state.error}</p>
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
