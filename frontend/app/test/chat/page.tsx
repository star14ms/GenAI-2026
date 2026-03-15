"use client";

import { useState, useRef, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import Link from "next/link";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface Session {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

interface Provider {
  id: string;
  name: string;
  model?: string;
}

interface Tool {
  id: string;
  name: string;
  description: string;
}

export default function TestChatPage() {
  const { user, loading: authLoading, signInWithGoogle } = useAuth();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [provider, setProvider] = useState<string>("chatgpt");
  const [providers, setProviders] = useState<Provider[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [selectedTools, setSelectedTools] = useState<Set<string>>(new Set());
  const [tools, setTools] = useState<Tool[]>([]);
  const [loading, setLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const skipNextLoadRef = useRef(false);

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
    fetch(`${base}/api/chat/system-prompt`)
      .then((r) => r.json())
      .then((data) => setSystemPrompt(data.system_prompt || ""))
      .catch(() => {});
    fetch(`${base}/api/chat/tools`)
      .then((r) => r.json())
      .then((data) => setTools(data.tools || []))
      .catch(() => setTools([]));
  }, []);

  const loadSessions = async () => {
    if (!user?.id || !supabase) return;
    const { data, error } = await supabase
      .from("chat_sessions")
      .select("id, title, created_at, updated_at")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false });
    setSessionsLoading(false);
    if (!error && data) {
      setSessions(data as Session[]);
      if (data.length > 0 && !currentSessionId) {
        setCurrentSessionId(data[0].id);
      }
    }
  };

  useEffect(() => {
    if (!user?.id || !supabase) {
      setSessionsLoading(false);
      setHistoryLoading(false);
      return;
    }
    loadSessions();
  }, [user?.id]);

  useEffect(() => {
    if (!currentSessionId || !user?.id || !supabase) {
      setHistoryLoading(false);
      return;
    }
    if (skipNextLoadRef.current) {
      skipNextLoadRef.current = false;
      setHistoryLoading(false);
      return;
    }
    setHistoryError(null);
    setHistoryLoading(true);
    Promise.resolve(
      supabase
        .from("chat_messages")
        .select("role, content")
        .eq("session_id", currentSessionId)
        .order("created_at", { ascending: true })
    )
      .then(({ data, error }) => {
        setHistoryLoading(false);
        if (error) {
          if (error.code === "42703" || error.message?.includes("session_id")) {
            setHistoryError("Run supabase/migrations/20250316000000_add_chat_sessions.sql first.");
          } else {
            setHistoryError(error.message);
          }
          return;
        }
        setMessages((data as Message[]) || []);
      })
      .catch(() => {
        setHistoryLoading(false);
        setHistoryError("Could not load chat history.");
      });
  }, [currentSessionId, user?.id]);

  const createNewSession = async () => {
    if (!user?.id || !supabase) return;
    const { data, error } = await supabase
      .from("chat_sessions")
      .insert({ user_id: user.id, title: "New chat" })
      .select("id, title, created_at, updated_at")
      .single();
    if (!error && data) {
      setSessions((prev) => [data as Session, ...prev]);
      setCurrentSessionId(data.id);
      setMessages([]);
    }
  };

  const deleteSession = async (sessionId: string) => {
    if (!supabase) return;
    if (!confirm("Delete this chat?")) return;
    await supabase.from("chat_sessions").delete().eq("id", sessionId);
    setSessions((prev) => prev.filter((s) => s.id !== sessionId));
    if (currentSessionId === sessionId) {
      const remaining = sessions.filter((s) => s.id !== sessionId);
      setCurrentSessionId(remaining[0]?.id ?? null);
      setMessages(remaining[0] ? [] : []);
    }
  };

  const updateSessionTitle = async (sessionId: string, title: string) => {
    if (!supabase) return;
    await supabase.from("chat_sessions").update({ title, updated_at: new Date().toISOString() }).eq("id", sessionId);
    setSessions((prev) => prev.map((s) => (s.id === sessionId ? { ...s, title } : s)));
  };

  const saveMessage = async (sessionIdToUse: string, role: "user" | "assistant", content: string): Promise<string | null> => {
    if (!user?.id || !supabase) return null;
    const { error } = await supabase.from("chat_messages").insert({
      session_id: sessionIdToUse,
      user_id: user.id,
      role,
      content,
    });
    if (error) {
      console.error("Failed to save message:", error);
      return error.message;
    }
    return null;
  };

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || loading) return;
    if (!user) {
      setError("Please sign in to chat");
      return;
    }

    let sessionId = currentSessionId;
    if (!sessionId) {
      if (!supabase) return;
      const { data, error } = await supabase
        .from("chat_sessions")
        .insert({ user_id: user.id, title: "New chat" })
        .select("id")
        .single();
      if (error || !data) return;
      sessionId = data.id;
      setSessions((prev) => [{ id: data.id, title: "New chat", created_at: new Date().toISOString(), updated_at: new Date().toISOString() }, ...prev]);
    }

    const base = API_URL.replace(/\/$/, "");
    if (!base || base === "undefined") {
      setError("NEXT_PUBLIC_API_URL is not set");
      return;
    }

    const userMessage: Message = { role: "user", content: text };
    if (!currentSessionId) {
      skipNextLoadRef.current = true;
      setCurrentSessionId(sessionId);
      setMessages([userMessage]);
    } else {
      setMessages((prev) => [...prev, userMessage]);
    }
    setInput("");
    setLoading(true);
    setError(null);

    const sid = sessionId as string;
    try {
      const saveUserErr = await saveMessage(sid, "user", text);
      if (saveUserErr) {
        setError(`Could not save message: ${saveUserErr}`);
      }

      const currentSession = sessions.find((s) => s.id === sid) ?? { title: "New chat" };
      if (currentSession.title === "New chat") {
        updateSessionTitle(sid, text.slice(0, 50) + (text.length > 50 ? "…" : ""));
      }

      const response = await fetch(`${base}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
          messages: [...messages, userMessage].map((m) => ({
            role: m.role,
            content: m.content,
          })),
          system_prompt: systemPrompt.trim() || undefined,
          tools: selectedTools.size > 0 ? Array.from(selectedTools) : undefined,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "Failed to get reply");
      }

      const assistantContent = data.reply || "";
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: assistantContent },
      ]);
      const saveAsstErr = await saveMessage(sid, "assistant", assistantContent);
      if (saveAsstErr) {
        setError(`Could not save reply: ${saveAsstErr}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setMessages((prev) => prev.slice(0, -1));
      setInput(text);
    } finally {
      setLoading(false);
    }
  };

  const toggleTool = (id: string) => {
    setSelectedTools((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  if (!authLoading && !user) {
    return (
      <main
        style={{
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          maxWidth: "48rem",
          margin: "0 auto",
          padding: "2rem",
          textAlign: "center",
        }}
      >
        <h1 style={{ fontSize: "1.5rem", marginBottom: "0.5rem" }}>Chatbot</h1>
        <p style={{ color: "#666", marginBottom: "1.5rem" }}>
          Sign in to chat and save your conversation history.
        </p>
        <button
          onClick={() => signInWithGoogle()}
          style={{
            padding: "0.5rem 1rem",
            fontSize: "0.875rem",
            borderRadius: "6px",
            border: "none",
            background: "#4285f4",
            color: "white",
            cursor: "pointer",
          }}
        >
          Sign in with Google
        </button>
        <Link
          href="/test"
          style={{
            marginTop: "1rem",
            fontSize: "0.875rem",
            color: "#666",
            textDecoration: "none",
          }}
        >
          ← Back to Test
        </Link>
      </main>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        minHeight: "100vh",
        width: "100%",
      }}
    >
      <aside
        style={{
          width: "240px",
          minWidth: "240px",
          borderRight: "1px solid #e5e7eb",
          display: "flex",
          flexDirection: "column",
          background: "#fafafa",
        }}
      >
        <div style={{ padding: "1rem", borderBottom: "1px solid #e5e7eb" }}>
          <button
            onClick={createNewSession}
            disabled={sessionsLoading}
            style={{
              width: "100%",
              padding: "0.5rem 0.75rem",
              fontSize: "0.875rem",
              borderRadius: "6px",
              border: "1px dashed #9ca3af",
              background: "white",
              color: "#6b7280",
              cursor: sessionsLoading ? "not-allowed" : "pointer",
            }}
          >
            + New chat
          </button>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "0.5rem" }}>
          {sessionsLoading && (
            <p style={{ fontSize: "0.75rem", color: "#9ca3af", padding: "0.5rem" }}>Loading…</p>
          )}
          {!sessionsLoading && sessions.length === 0 && (
            <p style={{ fontSize: "0.75rem", color: "#9ca3af", padding: "0.5rem" }}>
              No chats yet. Start a new one.
            </p>
          )}
          {sessions.map((s) => (
            <div
              key={s.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.25rem",
                padding: "0.5rem 0.75rem",
                borderRadius: "6px",
                marginBottom: "0.25rem",
                background: currentSessionId === s.id ? "#e5e7eb" : "transparent",
                cursor: "pointer",
              }}
            >
              <button
                onClick={() => setCurrentSessionId(s.id)}
                style={{
                  flex: 1,
                  textAlign: "left",
                  border: "none",
                  background: "none",
                  fontSize: "0.8125rem",
                  color: "#374151",
                  cursor: "pointer",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {s.title}
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  deleteSession(s.id);
                }}
                title="Delete chat"
                style={{
                  border: "none",
                  background: "none",
                  color: "#9ca3af",
                  cursor: "pointer",
                  fontSize: "0.75rem",
                  padding: "0.25rem",
                }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      </aside>

      <main
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          maxWidth: "48rem",
          margin: "0 auto",
          padding: "1rem",
          width: "100%",
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
            <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "0.5rem" }}>
              {user && (
                <span style={{ fontSize: "0.75rem", color: "#666" }}>
                  {String(user.user_metadata?.full_name || user.user_metadata?.name || user.email || "")}
                </span>
              )}
              <a
                href="/test"
                style={{
                  fontSize: "0.875rem",
                  color: "#666",
                  textDecoration: "none",
                }}
              >
                ← Back
              </a>
            </div>
          </div>
          {tools.length > 0 && provider === "chatgpt" && (
            <div style={{ marginTop: "0.5rem" }}>
              <span style={{ fontSize: "0.875rem", color: "#666", display: "block", marginBottom: "0.25rem" }}>
                Tools:
              </span>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem 1rem" }}>
                {tools.map((t) => (
                  <label
                    key={t.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.375rem",
                      fontSize: "0.875rem",
                      cursor: "pointer",
                    }}
                    title={t.description}
                  >
                    <input
                      type="checkbox"
                      checked={selectedTools.has(t.id)}
                      onChange={() => toggleTool(t.id)}
                      disabled={loading}
                    />
                    {t.name}
                  </label>
                ))}
              </div>
              <a
                href="https://developers.openai.com/api/docs/guides/tools/"
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  fontSize: "0.75rem",
                  color: "#6b7280",
                  marginTop: "0.25rem",
                  display: "inline-block",
                }}
              >
                All options: OpenAI tools documentation →
              </a>
            </div>
          )}
          <div style={{ marginTop: "0.5rem" }}>
            <label htmlFor="system-prompt" style={{ fontSize: "0.875rem", color: "#666" }}>
              System prompt (editable):
            </label>
            <textarea
              id="system-prompt"
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              placeholder="Current system prompt (editable)"
              rows={2}
              disabled={loading}
              style={{
                width: "100%",
                marginTop: "0.25rem",
                padding: "0.5rem 0.75rem",
                borderRadius: "6px",
                border: "1px solid #ccc",
                fontSize: "0.875rem",
                resize: "vertical",
                fontFamily: "inherit",
              }}
            />
          </div>
        </header>

        {(error || historyError) && (
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
            {error || historyError}
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
          {!currentSessionId && !sessionsLoading && (
            <p
              style={{
                color: "#888",
                fontSize: "0.875rem",
                textAlign: "center",
                marginTop: "2rem",
              }}
            >
              Click &quot;New chat&quot; to start, or select a chat from the list.
            </p>
          )}
          {currentSessionId && historyLoading && (
            <p
              style={{
                color: "#888",
                fontSize: "0.875rem",
                textAlign: "center",
                marginTop: "2rem",
              }}
            >
              Loading chat history…
            </p>
          )}
          {currentSessionId && !historyLoading && messages.length === 0 && (
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
                  background: msg.role === "user" ? "var(--color-primary)" : "#e5e7eb",
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
            disabled={loading || historyLoading}
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
            disabled={loading || historyLoading || !input.trim()}
            style={{
              padding: "0.75rem 1.25rem",
              borderRadius: "8px",
              border: "none",
              background: loading || historyLoading || !input.trim() ? "#ccc" : "var(--color-primary)",
              color: "white",
              fontSize: "0.9375rem",
              fontWeight: 500,
              cursor: loading || historyLoading || !input.trim() ? "not-allowed" : "pointer",
              alignSelf: "flex-end",
            }}
          >
            Send
          </button>
        </div>
      </main>
    </div>
  );
}
