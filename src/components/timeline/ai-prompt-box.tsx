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

  return (
    <div
      style={{
        background: "#111",
        borderBottom: "1px solid #1a1a1a",
        padding: "6px 12px",
        display: "flex",
        alignItems: "center",
        gap: "8px",
      }}
    >
      {/* Sparkle indicator */}
      <svg
        viewBox="0 0 24 24"
        style={{
          width: "14px",
          height: "14px",
          fill: "#E8620E",
          flexShrink: 0,
        }}
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
            ? 'Make this cinematic... / Speed up 1.5x / Add zoom effect'
            : "Select a segment first"
        }
        disabled={loading || !selectedSegment}
        style={{
          flex: 1,
          background: "transparent",
          border: "none",
          outline: "none",
          color: "#e5e5e5",
          fontSize: "12px",
          fontFamily: "'JetBrains Mono', monospace",
          letterSpacing: "0.02em",
        }}
      />

      {/* Error message */}
      {error && (
        <span
          style={{
            fontSize: "10px",
            color: "#ef4444",
            fontFamily: "'JetBrains Mono', monospace",
            flexShrink: 0,
            maxWidth: "200px",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {error}
        </span>
      )}

      {/* Loading spinner */}
      {loading && (
        <div
          style={{
            width: "14px",
            height: "14px",
            border: "2px solid #333",
            borderTopColor: "#E8620E",
            borderRadius: "50%",
            animation: "ai-spin 600ms linear infinite",
            flexShrink: 0,
          }}
        />
      )}

      {/* Apply button */}
      <button
        onClick={handleSubmit}
        disabled={loading || !prompt.trim() || !selectedSegment}
        style={{
          padding: "4px 12px",
          fontSize: "11px",
          fontFamily: "system-ui",
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color:
            loading || !prompt.trim() || !selectedSegment ? "#333" : "#fff",
          background:
            loading || !prompt.trim() || !selectedSegment
              ? "#1a1a1a"
              : "#E8620E",
          border: "none",
          borderRadius: "4px",
          cursor:
            loading || !prompt.trim() || !selectedSegment
              ? "not-allowed"
              : "pointer",
          transition: "all 150ms",
          flexShrink: 0,
        }}
      >
        Apply
      </button>

      {/* Close button */}
      <button
        onClick={onClose}
        style={{
          width: "20px",
          height: "20px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "transparent",
          border: "none",
          color: "#555",
          cursor: "pointer",
          borderRadius: "3px",
          fontSize: "14px",
          flexShrink: 0,
          transition: "color 100ms",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.color = "#999";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color = "#555";
        }}
      >
        &times;
      </button>

      <style>{`
        @keyframes ai-spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
