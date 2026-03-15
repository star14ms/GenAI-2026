"use client";

import { useState, useRef, useEffect, type RefObject } from "react";
import ReactMarkdown from "react-markdown";
import rehypeRaw from "rehype-raw";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface DetailChatbotProps {
  symbol: string;
  companyName: string;
  /** Full page content (summaries, analysis, news) to include as context for the LLM */
  fullPageContext: string;
  /** Optional ref to a container (e.g. search result) from which text can be selected as reference */
  selectableRef?: RefObject<HTMLElement | null>;
}

const CHATBOT_SYSTEM_PROMPT = `You are a helpful stock analysis assistant. The user is viewing a stock detail page and may ask questions about the data shown. Use the provided context (full page output) to answer accurately. If the context doesn't contain the answer, say so. Keep responses concise and beginner-friendly. Not financial advice.`;

export default function DetailChatbot({ symbol, companyName, fullPageContext, selectableRef }: DetailChatbotProps) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reference, setReference] = useState<string | null>(null);
  const [quoteButtonPos, setQuoteButtonPos] = useState<{ top: number; left: number } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const quoteButtonRef = useRef<HTMLButtonElement>(null);
  const inputAreaRef = useRef<HTMLDivElement>(null);
  const clearClickTimesRef = useRef<number[]>([]);
  const clearTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const hideQuoteOnClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        quoteButtonPos &&
        !quoteButtonRef.current?.contains(target) &&
        !messagesContainerRef.current?.contains(target) &&
        !selectableRef?.current?.contains(target) &&
        !inputAreaRef.current?.contains(target)
      ) {
        setQuoteButtonPos(null);
      }
    };
    document.addEventListener("mousedown", hideQuoteOnClickOutside);
    return () => document.removeEventListener("mousedown", hideQuoteOnClickOutside);
  }, [quoteButtonPos, selectableRef]);

  useEffect(() => {
    const onMouseUp = () => handleSelection();
    document.addEventListener("mouseup", onMouseUp);
    return () => document.removeEventListener("mouseup", onMouseUp);
  }, [open, selectableRef]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    return () => {
      if (clearTimeoutRef.current) clearTimeout(clearTimeoutRef.current);
    };
  }, []);

  const handleSelection = () => {
    const sel = window.getSelection();
    const text = sel?.toString().trim();
    if (!text) {
      setQuoteButtonPos(null);
      return;
    }
    const range = sel?.rangeCount ? sel.getRangeAt(0) : null;
    if (!range) {
      setQuoteButtonPos(null);
      return;
    }
    const anchor = range.commonAncestorContainer;

    const inAssistant =
      messagesContainerRef.current &&
      anchor instanceof Node &&
      Array.from(messagesContainerRef.current.querySelectorAll("[data-assistant-message]")).some((el) =>
        el.contains(anchor)
      );
    const inSearchResult = selectableRef?.current && anchor instanceof Node && selectableRef.current.contains(anchor);

    if (!inAssistant && !inSearchResult) {
      setQuoteButtonPos(null);
      return;
    }
    const rect = range.getBoundingClientRect();
    setQuoteButtonPos({ top: rect.top - 40, left: rect.left });
  };

  const handleClearReference = () => {
    const now = Date.now();
    const times = clearClickTimesRef.current;
    times.push(now);
    if (times.length > 3) times.shift();

    const isTripleClick =
      times.length === 3 &&
      times[2] - times[1] < 400 &&
      times[1] - times[0] < 400;

    if (isTripleClick) {
      clearClickTimesRef.current = [];
      if (clearTimeoutRef.current) {
        clearTimeout(clearTimeoutRef.current);
        clearTimeoutRef.current = null;
      }
      return;
    }

    if (clearTimeoutRef.current) clearTimeout(clearTimeoutRef.current);
    clearTimeoutRef.current = setTimeout(() => {
      setReference(null);
      clearClickTimesRef.current = [];
      clearTimeoutRef.current = null;
    }, 200);
  };

  const handleAddReference = () => {
    const sel = window.getSelection();
    const text = sel?.toString().trim();
    if (text) {
      setReference(text);
      if (!open) setOpen(true);
    }
    window.getSelection()?.removeAllRanges();
    setQuoteButtonPos(null);
  };

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || loading) return;

    const base = API_URL.replace(/\/$/, "");
    if (!base || base === "undefined") {
      setError("API not configured");
      return;
    }

    const refToSend = reference;
    const contentWithRef = refToSend
      ? `User reference: "${refToSend}"\n\n${text}`
      : text;
    const userMessage: Message = { role: "user", content: contentWithRef };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setReference(null);
    if (clearTimeoutRef.current) {
      clearTimeout(clearTimeoutRef.current);
      clearTimeoutRef.current = null;
    }
    setLoading(true);
    setError(null);

    try {
      const systemPrompt = `${CHATBOT_SYSTEM_PROMPT}\n\n---\nContext for ${companyName} (${symbol}):\n\n${fullPageContext}`;

      const response = await fetch(`${base}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: "chatgpt",
          messages: [...messages, userMessage].map((m) => ({ role: m.role, content: m.content })),
          system_prompt: systemPrompt,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail || "Failed to get reply");
      }
      setMessages((prev) => [...prev, { role: "assistant", content: data.reply || "" }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setMessages((prev) => prev.slice(0, -1));
      setInput(text);
      setReference(refToSend);
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
    <>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? "Close chatbot" : "Open chatbot"}
        style={{
          position: "fixed",
          bottom: "1.5rem",
          right: "1.5rem",
          width: "3.5rem",
          height: "3.5rem",
          borderRadius: "50%",
          border: "none",
          background: "#2563eb",
          color: "#fff",
          cursor: "pointer",
          boxShadow: "0 4px 12px rgba(37, 99, 235, 0.4)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: "1.25rem",
          zIndex: 9998,
        }}
      >
        {open ? "✕" : "💬"}
      </button>

      {quoteButtonPos && (
        <button
          ref={quoteButtonRef}
          onClick={handleAddReference}
          aria-label="Add as reference"
          style={{
            position: "fixed",
            top: quoteButtonPos.top,
            left: quoteButtonPos.left,
            padding: "0.375rem 0.625rem",
            borderRadius: "6px",
            border: "1px solid #e2e8f0",
            background: "#fff",
            boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
            cursor: "pointer",
            fontSize: "0.875rem",
            color: "#334155",
            zIndex: 10000,
            display: "flex",
            alignItems: "center",
            gap: "0.25rem",
          }}
        >
          <span aria-hidden style={{ fontSize: "1rem" }}>{"\u201C\u201D"}</span>
          Add reference
        </button>
      )}

      {open && (
        <div
          style={{
            position: "fixed",
            bottom: "5.5rem",
            right: "1.5rem",
            width: "min(32rem, calc(100vw - 3rem))",
            maxHeight: "56rem",
            background: "#fff",
            borderRadius: "12px",
            boxShadow: "0 8px 32px rgba(0,0,0,0.12)",
            border: "1px solid #e2e8f0",
            display: "flex",
            flexDirection: "column",
            zIndex: 9999,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              padding: "0.75rem 1rem",
              background: "#f8fafc",
              borderBottom: "1px solid #e2e8f0",
              fontSize: "0.875rem",
              fontWeight: 600,
              color: "#334155",
            }}
          >
            Chat about {companyName || symbol}
          </div>

          <div
            ref={messagesContainerRef}
            onMouseUp={handleSelection}
            style={{
              flex: 1,
              overflowY: "auto",
              padding: "0.75rem",
              minHeight: "24rem",
              maxHeight: "42rem",
              display: "flex",
              flexDirection: "column",
              gap: "0.5rem",
            }}
          >
            {messages.length === 0 && (
              <p style={{ fontSize: "0.8125rem", color: "#94a3b8", margin: 0 }}>
                Ask anything about this stock&apos;s data, summaries, or news.
              </p>
            )}
            {messages.map((m, i) => (
              <div
                key={i}
                data-assistant-message={m.role === "assistant" ? true : undefined}
                style={{
                  alignSelf: m.role === "user" ? "flex-end" : "flex-start",
                  maxWidth: "90%",
                  padding: "0.5rem 0.75rem",
                  borderRadius: "8px",
                  fontSize: "0.875rem",
                  background: m.role === "user" ? "#2563eb" : "#f1f5f9",
                  color: m.role === "user" ? "#fff" : "#334155",
                  wordBreak: "break-word",
                  ...(m.role === "user" && { whiteSpace: "pre-wrap" }),
                }}
              >
                {m.role === "assistant" ? (
                  <div className="markdown-content" style={{ lineHeight: 1.6 }}>
                    <ReactMarkdown rehypePlugins={[rehypeRaw]}>{m.content}</ReactMarkdown>
                  </div>
                ) : (
                  m.content
                )}
              </div>
            ))}
            {loading && (
              <div
                style={{
                  alignSelf: "flex-start",
                  padding: "0.5rem 0.75rem",
                  borderRadius: "8px",
                  background: "#f1f5f9",
                  fontSize: "0.875rem",
                  color: "#64748b",
                }}
              >
                Thinking…
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {error && (
            <div
              style={{
                padding: "0.5rem 1rem",
                background: "#fee2e2",
                color: "#991b1b",
                fontSize: "0.8125rem",
              }}
            >
              {error}
            </div>
          )}

          <div ref={inputAreaRef} style={{ padding: "0.75rem", borderTop: "1px solid #e2e8f0" }}>
            {reference && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  marginBottom: "0.5rem",
                  padding: "0.375rem 0.5rem",
                  background: "#eff6ff",
                  borderRadius: "6px",
                  border: "1px solid #bfdbfe",
                  fontSize: "0.8125rem",
                  color: "#1e40af",
                }}
              >
                <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  User reference: {reference.length > 60 ? `${reference.slice(0, 60)}…` : reference}
                </span>
                <button
                  onClick={handleClearReference}
                  aria-label="Remove reference"
                  style={{
                    padding: "0.125rem 0.25rem",
                    border: "none",
                    background: "transparent",
                    color: "#64748b",
                    cursor: "pointer",
                    fontSize: "1rem",
                    lineHeight: 1,
                  }}
                >
                  ✕
                </button>
              </div>
            )}
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask about this stock…"
                disabled={loading}
                style={{
                  flex: 1,
                  padding: "0.5rem 0.75rem",
                  borderRadius: "8px",
                  border: "1px solid #e2e8f0",
                  fontSize: "0.875rem",
                  outline: "none",
                }}
              />
              <button
                onClick={sendMessage}
                disabled={loading || !input.trim()}
                style={{
                  padding: "0.5rem 1rem",
                  borderRadius: "8px",
                  border: "none",
                  background: loading || !input.trim() ? "#94a3b8" : "#2563eb",
                  color: "#fff",
                  cursor: loading || !input.trim() ? "not-allowed" : "pointer",
                  fontSize: "0.875rem",
                }}
              >
                Send
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
