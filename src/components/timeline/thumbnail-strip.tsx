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
        className="relative h-14 bg-[#09090b] rounded-t-lg"
        style={{ width: `${totalWidth}%` }}
        onClick={handleClick}
      >
        {/* Thumbnail images */}
        <div className="flex h-full overflow-hidden rounded-t-lg">
          {thumbnails.length > 0 ? (
            thumbnails.map((thumb) => (
              <img
                key={thumb.index}
                src={thumb.url}
                alt=""
                className="h-full object-cover flex-shrink-0 opacity-70"
                style={{ width: `${100 / thumbnails.length}%` }}
                draggable={false}
              />
            ))
          ) : (
            <div
              className="flex items-center justify-center w-full text-xs uppercase tracking-wider text-zinc-600"
              style={{ fontFamily: "'Geist Sans', sans-serif" }}
            >
              Loading frames...
            </div>
          )}
        </div>

        {/* Segment boundaries — cut marks */}
        {segments.map((seg, i) => {
          if (i === 0) return null;
          const leftPct = (seg.start_s / durationS) * 100;
          return (
            <div
              key={`cut-${seg.id}`}
              className="absolute top-0 h-full pointer-events-none"
              style={{
                left: `${leftPct}%`,
                width: "1px",
                background: "#09090b",
                boxShadow: "-1px 0 3px rgba(0,0,0,0.8), 1px 0 3px rgba(0,0,0,0.8)",
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
              className="absolute top-0 h-full pointer-events-none ring-2 ring-orange-500/50"
              style={{
                left: `${leftPct}%`,
                width: `${widthPct}%`,
                boxShadow: "inset 0 0 12px rgba(249, 115, 22, 0.15), 0 0 8px rgba(249, 115, 22, 0.2)",
                zIndex: 6,
              }}
            />
          );
        })}

        {/* Playhead */}
        <div
          className="absolute top-0 h-full pointer-events-none z-10"
          style={{
            left: `${playheadPct}%`,
            width: "2px",
            background: "#fff",
            transition: "left 50ms linear",
          }}
        >
          <div className="w-2 h-2 bg-white rounded-full absolute -top-1 -left-[3px]" />
        </div>
      </div>
    </div>
  );
}
