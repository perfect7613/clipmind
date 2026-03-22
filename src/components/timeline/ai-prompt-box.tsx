"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { useTimelineStore, SegmentEffects } from "./timeline-store";

interface AiPromptBoxProps {
  clipId: string;
  visible: boolean;
  onClose: () => void;
}

export function AiPromptBox({ clipId, visible, onClose }: AiPromptBoxProps) {
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { selectedSegmentId, segments, updateEffects } = useTimelineStore();

  const selectedSegment = segments.find((s) => s.id === selectedSegmentId);

  // Focus input when visible
  useEffect(() => {
    if (visible && inputRef.current) {
      inputRef.current.focus();
    }
  }, [visible]);

  // Reset state when closing
  useEffect(() => {
    if (!visible) {
      setPrompt("");
      setError(null);
      setLoading(false);
    }
  }, [visible]);

  const handleSubmit = useCallback(async () => {
    if (!prompt.trim() || loading || !selectedSegment) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/clips/${clipId}/ai-edit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: prompt.trim(),
          segmentId: selectedSegment.id,
          timeRange: {
            start_s: selectedSegment.start_s,
            end_s: selectedSegment.end_s,
          },
          currentEffects: selectedSegment.effects,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to apply AI edit");
      }

      const data = await response.json();
      updateEffects(data.effects as Partial<SegmentEffects>);
      setPrompt("");
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }, [prompt, loading, selectedSegment, clipId, updateEffects, onClose]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      } else if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    },
    [handleSubmit, onClose]
  );

  if (!visible) return null;

  const isDisabled = loading || !prompt.trim() || !selectedSegment;

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 bg-zinc-900 border-b border-zinc-700">
      {/* Sparkle indicator */}
      <svg
        viewBox="0 0 24 24"
        className="w-3.5 h-3.5 fill-orange-500 flex-shrink-0"
      >
        <path d="M12 0L14.59 8.41L23 12L14.59 15.59L12 24L9.41 15.59L1 12L9.41 8.41Z" />
      </svg>

      {/* Prompt input */}
      <input
        ref={inputRef}
        type="text"
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={
          selectedSegment
            ? "Make this cinematic... / Speed up 1.5x / Add zoom effect"
            : "Select a segment first"
        }
        disabled={loading || !selectedSegment}
        className="flex-1 bg-zinc-800 border border-zinc-700 rounded-md px-3 py-1 text-xs text-zinc-200 placeholder:text-zinc-600 outline-none focus:ring-1 focus:ring-orange-500 focus:border-orange-500 transition-all duration-150 disabled:opacity-50"
        style={{ fontFamily: "'Geist Mono', monospace", letterSpacing: "0.02em" }}
      />

      {/* Error message */}
      {error && (
        <span
          className="text-[10px] text-red-500 flex-shrink-0 max-w-[200px] overflow-hidden text-ellipsis whitespace-nowrap"
          style={{ fontFamily: "'Geist Mono', monospace" }}
        >
          {error}
        </span>
      )}

      {/* Loading spinner */}
      {loading && (
        <div className="w-3.5 h-3.5 border-2 border-zinc-700 border-t-orange-500 rounded-full animate-spin flex-shrink-0" />
      )}

      {/* Apply button */}
      <button
        onClick={handleSubmit}
        disabled={isDisabled}
        className={`px-3 py-1 text-[11px] font-semibold uppercase tracking-wider rounded-md border-none flex-shrink-0 transition-all duration-150 ${
          isDisabled
            ? "bg-zinc-800 text-zinc-600 cursor-not-allowed"
            : "bg-orange-500 hover:bg-orange-600 text-white cursor-pointer hover:scale-105 active:scale-95"
        }`}
        style={{ fontFamily: "'Geist Sans', sans-serif" }}
      >
        Apply
      </button>

      {/* Close button */}
      <button
        onClick={onClose}
        className="w-5 h-5 flex items-center justify-center bg-transparent border-none text-zinc-600 cursor-pointer rounded hover:text-zinc-400 transition-colors duration-100 flex-shrink-0 text-sm"
      >
        &times;
      </button>
    </div>
  );
}
