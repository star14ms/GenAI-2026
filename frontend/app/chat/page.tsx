"use client";

import { useState, useRef, useEffect } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface Provider {
  id: string;
  name: string;
  model?: string;
}

export default function ChatPage() {
  const [provider, setProvider] = useState<string>("chatgpt");
  const [providers, setProviders] = useState<Provider[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    const base = API_URL.replace(/\/$/, "");
    if (!base || base === "undefined") return;
    fetch(`${base}/api/chat/providers`)
      .then((r) => r.json())
      .then((data) => setProviders(data.providers || []))
      .catch(() => setProviders([]));
  }, []);

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || loading) return;

    const base = API_URL.replace(/\/$/, "");
    if (!base || base === "undefined") {
      setError("NEXT_PUBLIC_API_URL is not set");
      return;
    }

    const userMessage: Message = { role: "user", content: text };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${base}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
          messages: [...messages, userMessage].map((m) => ({
            role: m.role,
            content: m.content,
          })),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "Failed to get reply");
      }

      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: data.reply || "" },
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setMessages((prev) => prev.slice(0, -1));
      setInput(text);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        maxWidth: "48rem",
        margin: "0 auto",
        padding: "1rem",
      }}
    >
      <header style={{ marginBottom: "1rem" }}>
        <h1 style={{ fontSize: "1.5rem", marginBottom: "0.5rem" }}>
          Chatbot
        </h1>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
          <label htmlFor="provider" style={{ fontSize: "0.875rem" }}>
            LLM:
          </label>
          <select
            id="provider"
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
            disabled={loading}
            style={{
              padding: "0.375rem 0.75rem",
              borderRadius: "6px",
              border: "1px solid #ccc",
              fontSize: "0.875rem",
              background: "white",
            }}
          >
            {providers.length > 0 ? (
              providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}{p.model ? ` (${p.model})` : ""}
                </option>
              ))
            ) : (
              <>
                <option value="chatgpt">ChatGPT</option>
                <option value="gemini">Gemini</option>
                <option value="claude">Claude</option>
              </>
            )}
          </select>
          <a
            href="/"
            style={{
              marginLeft: "auto",
              fontSize: "0.875rem",
              color: "#666",
              textDecoration: "none",
            }}
          >
            ← Back
          </a>
        </div>
      </header>

      {error && (
        <div
          style={{
            padding: "0.75rem",
            background: "#fee",
            color: "#c00",
            borderRadius: "6px",
            marginBottom: "1rem",
            fontSize: "0.875rem",
          }}
        >
          {error}
        </div>
      )}

      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "1rem",
          background: "#f9f9f9",
          borderRadius: "8px",
          minHeight: "20rem",
          marginBottom: "1rem",
        }}
      >
        {messages.length === 0 && (
          <p
            style={{
              color: "#888",
              fontSize: "0.875rem",
              textAlign: "center",
              marginTop: "2rem",
            }}
          >
            Send a message to start the conversation.
          </p>
        )}
        {messages.map((msg, i) => (
          <div
            key={i}
            style={{
              marginBottom: "1rem",
              display: "flex",
              justifyContent: msg.role === "user" ? "flex-end" : "flex-start",
            }}
          >
            <div
              style={{
                maxWidth: "85%",
                padding: "0.75rem 1rem",
                borderRadius: "12px",
                background: msg.role === "user" ? "#2563eb" : "#e5e7eb",
                color: msg.role === "user" ? "white" : "#111",
                fontSize: "0.9375rem",
                lineHeight: 1.5,
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}
            >
              <span
                style={{
                  fontSize: "0.75rem",
                  opacity: 0.8,
                  marginBottom: "0.25rem",
                  display: "block",
                }}
              >
                {msg.role === "user" ? "You" : "Assistant"}
              </span>
              {msg.content}
            </div>
          </div>
        ))}
        {loading && (
          <div
            style={{
              display: "flex",
              justifyContent: "flex-start",
              marginBottom: "1rem",
            }}
          >
            <div
              style={{
                padding: "0.75rem 1rem",
                borderRadius: "12px",
                background: "#e5e7eb",
                color: "#666",
                fontSize: "0.875rem",
              }}
            >
              Thinking...
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div style={{ display: "flex", gap: "0.5rem" }}>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message..."
          disabled={loading}
          rows={2}
          style={{
            flex: 1,
            padding: "0.75rem 1rem",
            borderRadius: "8px",
            border: "1px solid #ccc",
            fontSize: "0.9375rem",
            resize: "none",
            fontFamily: "inherit",
          }}
        />
        <button
          onClick={sendMessage}
          disabled={loading || !input.trim()}
          style={{
            padding: "0.75rem 1.25rem",
            borderRadius: "8px",
            border: "none",
            background: loading || !input.trim() ? "#ccc" : "#2563eb",
            color: "white",
            fontSize: "0.9375rem",
            fontWeight: 500,
            cursor: loading || !input.trim() ? "not-allowed" : "pointer",
            alignSelf: "flex-end",
          }}
        >
          Send
        </button>
      </div>
    </main>
  );
}
