"use client";

import { useState, useRef, useEffect, type RefObject } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import { useRevealedText } from "@/hooks/useRevealedText";
import MermaidCodeBlock from "@/components/MermaidCodeBlock";

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

const FAQ_PROMPTS = [
  "What's the overall sentiment?",
  "Key risks to consider?",
  "How does recent news affect this?",
  "Summarize the key metrics",
  "Is this a good time to buy?",
];

function getStockFaqPrompt(symbol: string, companyName: string): string {
  const name = companyName || symbol;
  return `What should I know about ${name}?`;
}

const CHATBOT_SYSTEM_PROMPT = `You are a helpful stock analysis assistant. The user is viewing a stock detail page and may ask questions about the data shown. Use the provided context (full page output) to answer accurately. If the context doesn't contain the answer, say so. Keep responses concise and beginner-friendly. Not financial advice.

For "what should I know" or summary-style answers, use markdown tables with columns like "Item" and "What to know". Example:
| Item | What to know |
|------|--------------|
| Ticker / Exchange | TSLA – listed on the Nasdaq |
| Current price | $417.41 |

When comparing data, showing proportions, or illustrating relationships, you may use Mermaid charts. Wrap Mermaid syntax in fenced code blocks with \`\`\`mermaid. Supported types: pie (pie charts), flowchart (flowcharts), xychart (line/bar charts). Example:
\`\`\`mermaid
pie title Revenue by Segment
  "Product A" : 45
  "Product B" : 30
  "Product C" : 25
\`\`\``;

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

  const lastMsg = messages[messages.length - 1];
  const lastAssistantContent = lastMsg?.role === "assistant" ? lastMsg.content : "";
  const lastRevealed = useRevealedText(lastAssistantContent, 25, 18);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, lastRevealed]);

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

  const sendMessage = async (textToSend?: string) => {
    const text = (textToSend ?? input).trim();
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
      <style>{`
        @keyframes detail-chatbox-appear {
          from {
            opacity: 0;
            transform: translateY(12px) scale(0.96);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
      `}</style>
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
          background: "var(--color-primary)",
          color: "#fff",
          cursor: "pointer",
          boxShadow: "0 4px 12px rgba(249, 115, 22, 0.4)",
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
            animation: "detail-chatbox-appear 0.25s ease-out forwards",
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
            {messages.map((m, i) => {
              const isLastAssistant = m.role === "assistant" && i === messages.length - 1;
              const displayContent = isLastAssistant ? lastRevealed : m.content;
              return (
                <div
                  key={i}
                  data-assistant-message={m.role === "assistant" ? true : undefined}
                  style={{
                    alignSelf: m.role === "user" ? "flex-end" : "flex-start",
                    maxWidth: "90%",
                    padding: "0.5rem 0.75rem",
                    borderRadius: "8px",
                    fontSize: "0.875rem",
                    background: m.role === "user" ? "var(--color-primary)" : "#f1f5f9",
                    color: m.role === "user" ? "#fff" : "#334155",
                    wordBreak: "break-word",
                    ...(m.role === "user" && { whiteSpace: "pre-wrap" }),
                  }}
                >
                  {m.role === "assistant" ? (
                    <div className="markdown-content" style={{ lineHeight: 1.6 }}>
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        rehypePlugins={[rehypeRaw]}
                        components={{
                          pre({ children, ...props }) {
                            const child = Array.isArray(children) ? children[0] : children;
                            const isMermaid =
                              child &&
                              typeof child === "object" &&
                              "props" in child &&
                              (child.props as { className?: string })?.className?.includes?.("language-mermaid");
                            if (isMermaid) return <>{children}</>;
                            return <pre {...props}>{children}</pre>;
                          },
                          code(props) {
                            const { className, children, ...rest } = props;
                            const inline = "inline" in props && props.inline;
                            if (!inline && className?.includes("mermaid")) {
                              const code = String(children).replace(/\n$/, "");
                              return <MermaidCodeBlock code={code} className={className} />;
                            }
                            return (
                              <code className={className} {...rest}>
                                {children}
                              </code>
                            );
                          },
                        }}
                      >
                        {displayContent}
                      </ReactMarkdown>
                    </div>
                  ) : (
                    m.content
                  )}
                </div>
              );
            })}
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
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "0.375rem",
                marginBottom: "0.5rem",
              }}
            >
              <button
                type="button"
                onClick={() => sendMessage(getStockFaqPrompt(symbol, companyName))}
                disabled={loading}
                style={{
                  padding: "0.25rem 0.5rem",
                  fontSize: "0.75rem",
                  borderRadius: "6px",
                  border: "1px solid var(--color-primary-muted)",
                  background: "var(--color-primary-light)",
                  color: "var(--color-primary-hover)",
                  cursor: loading ? "not-allowed" : "pointer",
                  transition: "background 0.15s ease, border-color 0.15s ease, color 0.15s ease",
                }}
                onMouseEnter={(e) => {
                  if (!loading) {
                    e.currentTarget.style.background = "var(--color-primary)";
                    e.currentTarget.style.borderColor = "var(--color-primary)";
                    e.currentTarget.style.color = "#fff";
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "var(--color-primary-light)";
                  e.currentTarget.style.borderColor = "var(--color-primary-muted)";
                  e.currentTarget.style.color = "var(--color-primary-hover)";
                }}
              >
                {getStockFaqPrompt(symbol, companyName)}
              </button>
              {FAQ_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => sendMessage(prompt)}
                  disabled={loading}
                  style={{
                    padding: "0.25rem 0.5rem",
                    fontSize: "0.75rem",
                    borderRadius: "6px",
                    border: "1px solid var(--color-primary-muted)",
                    background: "var(--color-primary-light)",
                    color: "var(--color-primary-hover)",
                    cursor: loading ? "not-allowed" : "pointer",
                    transition: "background 0.15s ease, border-color 0.15s ease, color 0.15s ease",
                  }}
                  onMouseEnter={(e) => {
                    if (!loading) {
                      e.currentTarget.style.background = "var(--color-primary)";
                      e.currentTarget.style.borderColor = "var(--color-primary)";
                      e.currentTarget.style.color = "#fff";
                    }
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "var(--color-primary-light)";
                    e.currentTarget.style.borderColor = "var(--color-primary-muted)";
                    e.currentTarget.style.color = "var(--color-primary-hover)";
                  }}
                >
                  {prompt}
                </button>
              ))}
            </div>
            {reference && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  marginBottom: "0.5rem",
                  padding: "0.375rem 0.5rem",
                  background: "var(--color-primary-light)",
                  borderRadius: "6px",
                  border: "1px solid var(--color-primary-muted)",
                  fontSize: "0.8125rem",
                  color: "var(--color-primary-hover)",
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
                onClick={() => sendMessage()}
                disabled={loading || !input.trim()}
                style={{
                  padding: "0.5rem 1rem",
                  borderRadius: "8px",
                  border: "none",
                  background: loading || !input.trim() ? "#94a3b8" : "var(--color-primary)",
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
