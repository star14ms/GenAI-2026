"use client";

import { useEffect, useState, useId } from "react";

const MERMAID_CDN = "https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.esm.min.mjs";

interface MermaidAPI {
  initialize: (config: { startOnLoad: boolean; securityLevel: string }) => void;
  render: (id: string, code: string) => Promise<{ svg: string }>;
}

let mermaidPromise: Promise<MermaidAPI> | null = null;
function getMermaid() {
  if (!mermaidPromise) {
    mermaidPromise = import(/* webpackIgnore: true */ MERMAID_CDN) as Promise<MermaidAPI>;
  }
  return mermaidPromise;
}

interface MermaidCodeBlockProps {
  code: string;
  className?: string;
}

export default function MermaidCodeBlock({ code, className }: MermaidCodeBlockProps) {
  const id = useId().replace(/:/g, "-");
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getMermaid()
      .then((mermaid) => {
        if (cancelled) return;
        mermaid.initialize({ startOnLoad: false, securityLevel: "loose" });
        const uniqueId = `mermaid-${id}-${Date.now()}`;
        return mermaid.render(uniqueId, code.trim());
      })
      .then((result) => {
        if (cancelled || !result) return;
        setSvg(result.svg);
        setError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err?.message || "Failed to render diagram");
        setSvg(null);
      });
    return () => {
      cancelled = true;
    };
  }, [code, id]);


  if (error) {
    return (
      <pre
        className={className}
        style={{
          padding: "0.75rem",
          borderRadius: "8px",
          background: "#fef2f2",
          color: "#991b1b",
          fontSize: "0.8125rem",
          overflow: "auto",
        }}
      >
        <code>{error}</code>
      </pre>
    );
  }

  if (!svg) {
    return (
      <div
        style={{
          padding: "1.5rem",
          background: "#f8fafc",
          borderRadius: "8px",
          color: "#64748b",
          fontSize: "0.8125rem",
        }}
      >
        Rendering chart…
      </div>
    );
  }

  return (
    <div
      className="mermaid-container"
      style={{
        display: "flex",
        justifyContent: "center",
        margin: "0.5rem 0",
        overflow: "auto",
      }}
      dangerouslySetInnerHTML={{
        __html: svg.replace(/<svg/, '<svg style="max-width:100%;height:auto"'),
      }}
    />
  );
}
