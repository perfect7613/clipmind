"use client";

import React, { useEffect, useState, useCallback } from "react";
import type { Segment } from "./timeline-store";

interface ThumbnailStripProps {
  clipId: string;
  durationS: number;
  currentTime: number;
  onSeek: (time: number) => void;
  segments: Segment[];
  selectedSegmentId: string | null;
  onSelectSegment: (id: string) => void;
  timelineZoom: number;
}

interface Thumbnail {
  index: number;
  url: string;
}

export function ThumbnailStrip({
  clipId,
  durationS,
  currentTime,
  onSeek,
  segments,
  selectedSegmentId,
  onSelectSegment,
  timelineZoom,
}: ThumbnailStripProps) {
  const [thumbnails, setThumbnails] = useState<Thumbnail[]>([]);

  useEffect(() => {
    fetch(`/api/clips/${clipId}/thumbnails`)
      .then((r) => r.json())
      .then((data: { thumbnails?: Thumbnail[] }) => {
        if (data.thumbnails) setThumbnails(data.thumbnails);
      })
      .catch(() => {});
  }, [clipId]);

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const pct = (e.clientX - rect.left) / rect.width;
      const time = pct * durationS;

      // Also select the segment under the click
      const seg = segments.find((s) => time >= s.start_s && time <= s.end_s);
      if (seg) onSelectSegment(seg.id);

      onSeek(Math.max(0, Math.min(durationS, time)));
    },
    [durationS, onSeek, segments, onSelectSegment]
  );

  const playheadPct = durationS > 0 ? (currentTime / durationS) * 100 : 0;
  const totalWidth = 100 * timelineZoom;

  return (
    <div className="relative overflow-x-auto scrollbar-thin" style={{ scrollBehavior: "smooth" }}>
      <div
        className="relative h-14"
        style={{
          width: `${totalWidth}%`,
          background: "#0d0d0d",
        }}
        onClick={handleClick}
      >
        {/* Thumbnail images */}
        <div className="flex h-full">
          {thumbnails.length > 0 ? (
            thumbnails.map((thumb) => (
              <img
                key={thumb.index}
                src={thumb.url}
                alt=""
                className="h-full object-cover flex-shrink-0"
                style={{
                  width: `${100 / thumbnails.length}%`,
                  opacity: 0.7,
                }}
                draggable={false}
              />
            ))
          ) : (
            <div
              className="flex items-center justify-center w-full text-xs tracking-wider uppercase"
              style={{ color: "#555", fontFamily: "system-ui" }}
            >
              Loading frames...
            </div>
          )}
        </div>

        {/* Segment boundaries — thin gaps as "cuts" */}
        {segments.map((seg, i) => {
          if (i === 0) return null;
          const leftPct = (seg.start_s / durationS) * 100;
          return (
            <div
              key={`cut-${seg.id}`}
              className="absolute top-0 h-full pointer-events-none"
              style={{
                left: `${leftPct}%`,
                width: "2px",
                background: "#0a0a0a",
                boxShadow: "0 0 4px rgba(0,0,0,0.8)",
                zIndex: 5,
              }}
            />
          );
        })}

        {/* Selected segment highlight */}
        {segments.map((seg) => {
          if (seg.id !== selectedSegmentId) return null;
          const leftPct = (seg.start_s / durationS) * 100;
          const widthPct = ((seg.end_s - seg.start_s) / durationS) * 100;
          return (
            <div
              key={`sel-${seg.id}`}
              className="absolute top-0 h-full pointer-events-none"
              style={{
                left: `${leftPct}%`,
                width: `${widthPct}%`,
                border: "1px solid rgba(232, 98, 14, 0.6)",
                boxShadow: "inset 0 0 12px rgba(232, 98, 14, 0.15), 0 0 8px rgba(232, 98, 14, 0.2)",
                zIndex: 6,
              }}
            />
          );
        })}

        {/* Playhead */}
        <div
          className="absolute top-0 h-full pointer-events-none"
          style={{
            left: `${playheadPct}%`,
            width: "2px",
            background: "#fff",
            zIndex: 10,
            transition: "left 50ms linear",
          }}
        >
          <div
            style={{
              width: "8px",
              height: "8px",
              background: "#fff",
              borderRadius: "50%",
              position: "absolute",
              top: "-4px",
              left: "-3px",
            }}
          />
        </div>
      </div>
    </div>
  );
}
