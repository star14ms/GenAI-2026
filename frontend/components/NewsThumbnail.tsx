"use client";

import { useState, useEffect } from "react";

interface NewsThumbnailProps {
  url: string;
  alt?: string;
  width?: number;
  height?: number;
  className?: string;
}

/**
 * Fetches and displays a thumbnail for a news article URL.
 * Uses Microlink API for og:image, falls back to favicon.
 */
export default function NewsThumbnail({
  url,
  alt = "Article thumbnail",
  width = 96,
  height = 64,
  className,
}: NewsThumbnailProps) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!url) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    const fetchThumbnail = async () => {
      try {
        const res = await fetch(
          `https://api.microlink.io?url=${encodeURIComponent(url)}&screenshot=false&meta=false`
        );
        if (cancelled) return;

        const data = await res.json();
        const img =
          data?.data?.image?.url ??
          data?.data?.logo?.url ??
          data?.data?.favicon?.url;

        if (cancelled) return;
        if (img) {
          setImageUrl(img);
        } else {
          setError(true);
        }
      } catch {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchThumbnail();
    return () => {
      cancelled = true;
    };
  }, [url]);

  const getFaviconUrl = () => {
    try {
      const hostname = new URL(url).hostname;
      return `https://www.google.com/s2/favicons?domain=${hostname}&sz=64`;
    } catch {
      return null;
    }
  };

  if (loading) {
    return (
      <div
        className={className}
        style={{
          width,
          height,
          borderRadius: "6px",
          background: "linear-gradient(90deg, #e2e8f0 25%, #f1f5f9 50%, #e2e8f0 75%)",
          backgroundSize: "200% 100%",
          animation: "news-thumbnail-shimmer 1.5s ease-in-out infinite",
          flexShrink: 0,
        }}
      />
    );
  }

  const fallbackUrl = error ? getFaviconUrl() : imageUrl;
  if (!fallbackUrl) {
    return (
      <div
        className={className}
        style={{
          width,
          height,
          borderRadius: "6px",
          background: "#e2e8f0",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <span style={{ fontSize: "1.5rem", color: "#94a3b8" }}>📰</span>
      </div>
    );
  }

  return (
    <img
      src={fallbackUrl}
      alt={alt}
      width={width}
      height={height}
      className={className}
      style={{
        width,
        height,
        objectFit: "cover",
        borderRadius: "6px",
        flexShrink: 0,
      }}
      loading="lazy"
    />
  );
}
