"use client";

import React, { useEffect, useRef, useCallback } from "react";
import type { Segment, BeatMarker } from "./timeline-store";

interface WaveformTrackProps {
  clipId: string;
  durationS: number;
  currentTime: number;
  onSeek: (time: number) => void;
  segments: Segment[];
  selectedSegmentId: string | null;
  onSelectSegment: (id: string) => void;
  timelineZoom: number;
  onZoomChange: (zoom: number) => void;
  cutPoints: Array<{ start_s: number; end_s: number }>;
  beatMarkers?: BeatMarker[];
  beatsVisible?: boolean;
}

export function WaveformTrack({
  clipId,
  durationS,
  currentTime,
  onSeek,
  segments,
  selectedSegmentId,
  onSelectSegment,
  timelineZoom,
  onZoomChange,
  cutPoints,
  beatMarkers = [],
  beatsVisible = false,
}: WaveformTrackProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioDataRef = useRef<Float32Array | null>(null);

  // Redraw on data changes
  const drawRef = useRef<() => void>(() => {});

  // Load and decode audio
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    fetch(`/api/clips/${clipId}/audio`)
      .then((r) => r.arrayBuffer())
      .then((buffer) => {
        const audioCtx = new AudioContext();
        return audioCtx.decodeAudioData(buffer);
      })
      .then((audioBuffer) => {
        audioDataRef.current = audioBuffer.getChannelData(0);
        drawRef.current();
      })
      .catch(() => {
        const ctx = canvas.getContext("2d");
        if (ctx) {
          const rect = canvas.parentElement?.getBoundingClientRect();
          if (rect) {
            canvas.width = rect.width * 2;
            canvas.height = rect.height * 2;
          }
          ctx.fillStyle = "#111";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.fillStyle = "#333";
          ctx.font = "20px system-ui";
          ctx.textAlign = "center";
          ctx.fillText("No audio data", canvas.width / 2, canvas.height / 2);
        }
      });
  }, [clipId]);

  // Redraw waveform when segments/selection change
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const draw = () => {
      const rect = canvas.parentElement?.getBoundingClientRect();
      if (rect) {
        canvas.width = rect.width * 2;
        canvas.height = rect.height * 2;
      }

      const data = audioDataRef.current;
      if (!data) return;

      drawSegmentWaveform(ctx, data, canvas.width, canvas.height, segments, selectedSegmentId, durationS);
    };

    drawRef.current = draw;
    draw();
  }, [segments, selectedSegmentId, durationS, timelineZoom]);

  // Click to seek + select segment
  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const scrollLeft = e.currentTarget.scrollLeft || 0;
      const pct = (e.clientX - rect.left + scrollLeft) / e.currentTarget.scrollWidth;
      const time = pct * durationS;

      const seg = segments.find((s) => time >= s.start_s && time <= s.end_s);
      if (seg) onSelectSegment(seg.id);

      onSeek(Math.max(0, Math.min(durationS, time)));
    },
    [durationS, onSeek, segments, onSelectSegment]
  );

  // Ctrl+scroll for zoom
  const handleWheel = useCallback(
    (e: React.WheelEvent<HTMLDivElement>) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const delta = e.deltaY > 0 ? -0.5 : 0.5;
        onZoomChange(timelineZoom + delta);
      }
    },
    [timelineZoom, onZoomChange]
  );

  const playheadPct = durationS > 0 ? (currentTime / durationS) * 100 : 0;
  const totalWidth = 100 * timelineZoom;

  return (
    <div
      ref={containerRef}
      className="relative overflow-x-auto cursor-crosshair"
      style={{ scrollBehavior: "smooth" }}
      onWheel={handleWheel}
    >
      <div
        className="relative h-24"
        style={{
          width: `${totalWidth}%`,
          background: "#0a0a0a",
        }}
        onClick={handleClick}
      >
        <canvas ref={canvasRef} className="w-full h-full" style={{ display: "block" }} />

        {/* Segment boundary lines */}
        {segments.map((seg, i) => {
          if (i === 0) return null;
          const leftPct = (seg.start_s / durationS) * 100;
          return (
            <div
              key={`boundary-${seg.id}`}
              className="absolute top-0 h-full pointer-events-none"
              style={{
                left: `${leftPct}%`,
                width: "1px",
                background: "rgba(232, 98, 14, 0.5)",
                zIndex: 5,
              }}
            />
          );
        })}

        {/* Segment colored bands (odd/even alternating) */}
        {segments.map((seg, i) => {
          const leftPct = (seg.start_s / durationS) * 100;
          const widthPct = ((seg.end_s - seg.start_s) / durationS) * 100;
          const isSelected = seg.id === selectedSegmentId;
          const isOdd = i % 2 === 1;
          const bg = isSelected
            ? "rgba(255,255,255,0.10)"
            : isOdd
              ? "rgba(255,255,255,0.03)"
              : "rgba(255,255,255,0.05)";

          return (
            <div
              key={`band-${seg.id}`}
              className="absolute top-0 h-full pointer-events-none"
              style={{
                left: `${leftPct}%`,
                width: `${widthPct}%`,
                background: bg,
                borderLeft: i > 0 ? "1px solid rgba(232, 98, 14, 0.3)" : undefined,
                zIndex: 2,
              }}
            />
          );
        })}

        {/* Beat markers */}
        {beatsVisible && beatMarkers.map((beat, i) => {
          const leftPct = durationS > 0 ? (beat.timeS / durationS) * 100 : 0;
          const opacity = 0.3 + beat.energy * 0.7;
          return (
            <div
              key={`beat-${i}`}
              className="absolute top-0 h-full pointer-events-none"
              style={{
                left: `${leftPct}%`,
                width: "1px",
                background: `rgba(255, 180, 0, ${opacity})`,
                zIndex: 4,
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
            background: "#ffffff",
            zIndex: 15,
            transition: "left 50ms linear",
            boxShadow: "0 0 6px rgba(255,255,255,0.4)",
          }}
        >
          {/* Grabber dot */}
          <div
            style={{
              width: "10px",
              height: "10px",
              background: "#fff",
              borderRadius: "50%",
              position: "absolute",
              top: "-5px",
              left: "-4px",
              boxShadow: "0 0 8px rgba(255,255,255,0.6)",
            }}
          />
        </div>
      </div>
    </div>
  );
}

function drawSegmentWaveform(
  ctx: CanvasRenderingContext2D,
  data: Float32Array,
  width: number,
  height: number,
  segments: Segment[],
  selectedSegmentId: string | null,
  durationS: number
) {
  ctx.clearRect(0, 0, width, height);

  // Dark background
  ctx.fillStyle = "#0a0a0a";
  ctx.fillRect(0, 0, width, height);

  const samplesPerPixel = Math.max(1, Math.floor(data.length / width));
  const mid = height / 2;

  for (let x = 0; x < width; x++) {
    const start = x * samplesPerPixel;
    const end = Math.min(start + samplesPerPixel, data.length);

    let max = 0;
    for (let j = start; j < end; j++) {
      const abs = Math.abs(data[j]);
      if (abs > max) max = abs;
    }

    const barHeight = max * mid * 0.85;
    const timePct = x / width;
    const timeS = timePct * durationS;

    // Determine which segment this pixel belongs to
    const seg = segments.find((s) => timeS >= s.start_s && timeS <= s.end_s);
    const isSelected = seg?.id === selectedSegmentId;

    if (isSelected) {
      // Bright orange for selected segment
      ctx.fillStyle = "#E8620E";
    } else if (seg) {
      // Dim grey for unselected
      ctx.fillStyle = "#3a3a3a";
    } else {
      // Very dim for gaps
      ctx.fillStyle = "#1a1a1a";
    }

    ctx.fillRect(x, mid - barHeight, 1, barHeight * 2);
  }

  // Center line
  ctx.fillStyle = "rgba(255,255,255,0.05)";
  ctx.fillRect(0, mid, width, 1);
}
