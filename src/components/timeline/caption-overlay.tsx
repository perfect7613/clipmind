"use client";

import React, { useState, useCallback, useRef, useEffect } from "react";
import type { CaptionStyle } from "./timeline-store";

export interface CaptionData {
  text: string;
  start_s: number;
  end_s: number;
}

interface CaptionOverlayProps {
  captions: CaptionData[];
  currentTime: number;
  style: CaptionStyle;
  onStyleChange: (style: Partial<CaptionStyle>) => void;
  containerRef: React.RefObject<HTMLDivElement | null>;
}

export function CaptionOverlay({
  captions,
  currentTime,
  style,
  onStyleChange,
  containerRef,
}: CaptionOverlayProps) {
  // ALL hooks must be called unconditionally — before any returns
  const [isDragging, setIsDragging] = useState(false);
  const [customPosition, setCustomPosition] = useState<{ x: number; y: number } | null>(null);
  const captionRef = useRef<HTMLDivElement>(null);

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isDragging || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 100;
      const y = ((e.clientY - rect.top) / rect.height) * 100;
      setCustomPosition({
        x: Math.max(10, Math.min(90, x)),
        y: Math.max(5, Math.min(95, y)),
      });
    },
    [isDragging, containerRef]
  );

  const handleMouseUp = useCallback(() => {
    if (!isDragging) return;
    setIsDragging(false);
    if (customPosition) {
      if (customPosition.y < 25) {
        onStyleChange({ position: "top" });
      } else if (customPosition.y > 65) {
        onStyleChange({ position: "bottom" });
      } else {
        onStyleChange({ position: "center" });
      }
      setCustomPosition(null);
    }
  }, [isDragging, customPosition, onStyleChange]);

  useEffect(() => {
    if (isDragging) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
      return () => {
        window.removeEventListener("mousemove", handleMouseMove);
        window.removeEventListener("mouseup", handleMouseUp);
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);

  // Now safe to do conditional rendering
  if (style.enabled === false) return null;

  const activeCaption = captions.find(
    (c) => currentTime >= c.start_s && currentTime < c.end_s
  );
  if (!activeCaption) return null;

  // Position
  const positionStyle: React.CSSProperties = {};
  if (customPosition) {
    positionStyle.left = `${customPosition.x}%`;
    positionStyle.top = `${customPosition.y}%`;
    positionStyle.transform = "translate(-50%, -50%)";
  } else {
    positionStyle.left = "50%";
    positionStyle.transform = "translateX(-50%)";
    if (style.position === "top") {
      positionStyle.top = "8%";
    } else if (style.position === "center") {
      positionStyle.top = "50%";
      positionStyle.transform = "translate(-50%, -50%)";
    } else {
      positionStyle.bottom = "8%";
    }
  }

  const fontSizeMap = { small: "clamp(12px, 2.5vw, 18px)", medium: "clamp(16px, 3.5vw, 28px)", large: "clamp(22px, 5vw, 42px)" };
  const fontSize = fontSizeMap[style.fontSize] || fontSizeMap.medium;

  const bgMap: Record<string, string> = {
    none: "transparent",
    "dark-bar": "rgba(0,0,0,0.7)",
    pill: "rgba(0,0,0,0.6)",
    "full-width": "rgba(0,0,0,0.75)",
  };
  const bg = bgMap[style.background] || bgMap["dark-bar"];

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!containerRef.current) return;
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  return (
    <div
      ref={captionRef}
      onMouseDown={handleMouseDown}
      className="absolute pointer-events-auto"
      style={{
        ...positionStyle,
        zIndex: 25,
        cursor: isDragging ? "grabbing" : "grab",
        userSelect: "none",
        maxWidth: style.background === "full-width" ? "100%" : "80%",
        width: style.background === "full-width" ? "100%" : undefined,
        textAlign: "center",
        transition: isDragging ? "none" : "all 0.15s ease",
      }}
    >
      <span
        style={{
          display: "inline-block",
          fontSize,
          fontWeight: 700,
          color: style.color || "#FFFFFF",
          textTransform: style.casing === "upper" ? "uppercase" : style.casing === "lower" ? "lowercase" : style.casing === "title" ? "capitalize" : undefined,
          padding: style.background === "full-width" ? "8px 24px" : "6px 18px",
          borderRadius: style.background === "pill" ? "999px" : style.background === "full-width" ? "0" : "6px",
          background: bg,
          textShadow: "0 2px 8px rgba(0,0,0,0.9), 0 0 2px rgba(0,0,0,0.5)",
          fontFamily: "system-ui, -apple-system, sans-serif",
          letterSpacing: style.casing === "upper" ? "0.06em" : "0",
          lineHeight: 1.3,
        }}
      >
        {activeCaption.text}
      </span>
    </div>
  );
}
