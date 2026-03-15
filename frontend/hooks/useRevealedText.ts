"use client";

import { useState, useEffect, useRef } from "react";

/** Progressively reveals text when receiving large chunks (simulates streaming when backend buffers). */
export function useRevealedText(fullText: string, chunkSize = 20, intervalMs = 20): string {
  const [displayed, setDisplayed] = useState("");
  const positionRef = useRef(0);
  const prevFullRef = useRef("");
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (fullText === prevFullRef.current) return;
    const prev = prevFullRef.current;
    prevFullRef.current = fullText;

    if (fullText.length <= prev.length) {
      setDisplayed(fullText);
      positionRef.current = fullText.length;
      return;
    }
    const added = fullText.length - prev.length;
    if (added <= chunkSize) {
      setDisplayed(fullText);
      positionRef.current = fullText.length;
      return;
    }
    positionRef.current = prev.length;
    let pos = positionRef.current;
    const target = fullText.length;

    const tick = () => {
      pos += chunkSize;
      if (pos >= target) {
        setDisplayed(fullText);
        positionRef.current = target;
        return;
      }
      setDisplayed(fullText.slice(0, pos));
      positionRef.current = pos;
      timeoutRef.current = setTimeout(tick, intervalMs);
    };
    timeoutRef.current = setTimeout(tick, intervalMs);
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [fullText, chunkSize, intervalMs]);

  return displayed || fullText;
}
