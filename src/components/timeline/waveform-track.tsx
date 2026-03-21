"use client";

import { useEffect, useRef, useCallback } from "react";

interface WaveformTrackProps {
  clipId: string;
  durationS: number;
  currentTime: number;
  onSeek: (time: number) => void;
  cutPoints: Array<{ start_s: number; end_s: number }>;
}

export function WaveformTrack({ clipId, durationS, currentTime, onSeek, cutPoints }: WaveformTrackProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioDataRef = useRef<Float32Array | null>(null);

  // Load and decode audio for waveform
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Set canvas size
    const rect = canvas.parentElement?.getBoundingClientRect();
    if (rect) {
      canvas.width = rect.width * 2; // 2x for retina
      canvas.height = rect.height * 2;
    }

    fetch(`/api/clips/${clipId}/audio`)
      .then((r) => r.arrayBuffer())
      .then((buffer) => {
        const audioCtx = new AudioContext();
        return audioCtx.decodeAudioData(buffer);
      })
      .then((audioBuffer) => {
        const data = audioBuffer.getChannelData(0);
        audioDataRef.current = data;
        drawWaveform(ctx, data, canvas.width, canvas.height, cutPoints, durationS);
      })
      .catch(() => {
        // Draw empty waveform
        if (ctx) {
          ctx.fillStyle = "#333";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.fillStyle = "#666";
          ctx.font = "24px sans-serif";
          ctx.textAlign = "center";
          ctx.fillText("No audio data", canvas.width / 2, canvas.height / 2);
        }
      });
  }, [clipId, cutPoints, durationS]);

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const pct = (e.clientX - rect.left) / rect.width;
      onSeek(pct * durationS);
    },
    [durationS, onSeek]
  );

  const playheadPct = durationS > 0 ? (currentTime / durationS) * 100 : 0;

  return (
    <div ref={containerRef} className="relative h-20 bg-black/40 rounded cursor-pointer" onClick={handleClick}>
      <canvas ref={canvasRef} className="w-full h-full rounded" />

      {/* Cut point markers */}
      {cutPoints.map((cp, i) => {
        const startPct = (cp.start_s / durationS) * 100;
        const widthPct = ((cp.end_s - cp.start_s) / durationS) * 100;
        return (
          <div
            key={i}
            className="absolute top-0 h-full border-x border-primary/40 bg-primary/5"
            style={{ left: `${startPct}%`, width: `${widthPct}%` }}
          />
        );
      })}

      {/* Playhead */}
      <div
        className="absolute top-0 w-0.5 h-full bg-white z-10 pointer-events-none"
        style={{ left: `${playheadPct}%` }}
      >
        <div className="w-2 h-2 bg-white rounded-full -ml-[3px] -mt-1" />
      </div>
    </div>
  );
}

function drawWaveform(
  ctx: CanvasRenderingContext2D,
  data: Float32Array,
  width: number,
  height: number,
  cutPoints: Array<{ start_s: number; end_s: number }>,
  durationS: number
) {
  ctx.clearRect(0, 0, width, height);

  const samplesPerPixel = Math.floor(data.length / width);
  const mid = height / 2;

  // Draw waveform bars
  for (let x = 0; x < width; x++) {
    const start = x * samplesPerPixel;
    const end = Math.min(start + samplesPerPixel, data.length);

    let max = 0;
    for (let j = start; j < end; j++) {
      const abs = Math.abs(data[j]);
      if (abs > max) max = abs;
    }

    const barHeight = max * mid * 0.9;

    // Color based on whether this pixel is in a cut point
    const timePct = x / width;
    const timeS = timePct * durationS;
    const inCut = cutPoints.some((cp) => timeS >= cp.start_s && timeS <= cp.end_s);

    ctx.fillStyle = inCut ? "#3b82f6" : "#475569";

    // Draw symmetric bar
    ctx.fillRect(x, mid - barHeight, 1, barHeight * 2);
  }
}
