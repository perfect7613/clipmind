/**
 * Smooth Zoom Engine — ScreenStudio-style zoompan filter builder.
 *
 * Uses FFmpeg zoompan with cosine ease-in-out transitions.
 * Always centered, resolution-independent logic.
 */

import type { ZoomEvent } from "./zoom-planner";

const ZOOM_FACTORS: Record<string, number> = {
  normal: 1.0,
  punched_in: 1.1,
  tight: 1.15,
};

const TRANSITION_DURATION_S = 0.6;

/**
 * Build a smooth zoompan filter string from zoom events.
 * Returns the FULL filter string including zoompan=... ready for -filter:v.
 *
 * IMPORTANT: commas inside the expression are NOT escaped here.
 * The caller MUST pass this through outputOptions(["-filter:v", ...]),
 * NOT through fluent-ffmpeg's .videoFilters() which splits on commas.
 */
export function buildSmoothZoomFilter(
  events: ZoomEvent[],
  fps: number = 30,
  inputWidth: number = 1920,
  inputHeight: number = 1080,
): string | null {
  if (events.length === 0) return null;
  if (events.every((e) => e.zoom_level === "normal")) return null;

  const zExpr = buildZoomExpression(events);

  return `zoompan=z='${zExpr}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=${inputWidth}x${inputHeight}:fps=${fps}`;
}

function buildZoomExpression(events: ZoomEvent[]): string {
  if (events.length === 0) return "1.0";
  if (events.length === 1) {
    return String(ZOOM_FACTORS[events[0].zoom_level] ?? 1.0);
  }

  // Build transition segments between consecutive events with different zoom levels
  const parts: string[] = [];

  for (let i = 0; i < events.length - 1; i++) {
    const current = events[i];
    const next = events[i + 1];
    const fromZoom = ZOOM_FACTORS[current.zoom_level] ?? 1.0;
    const toZoom = ZOOM_FACTORS[next.zoom_level] ?? 1.0;

    if (fromZoom === toZoom) continue;

    const tStart = next.start_s;
    const tEnd = tStart + TRANSITION_DURATION_S;
    const delta = toZoom - fromZoom;

    // Cosine ease-in-out: base + delta * (1 - cos((t - tStart) / dur * PI)) / 2
    parts.push(
      `if(between(t,${fmt(tStart)},${fmt(tEnd)}),` +
      `${fmt(fromZoom)}+${fmt(delta)}*((1-cos((t-${fmt(tStart)})/${fmt(TRANSITION_DURATION_S)}*PI))/2)`
    );
  }

  if (parts.length === 0) {
    return String(ZOOM_FACTORS[events[0].zoom_level] ?? 1.0);
  }

  // Hold segments — between transitions, hold at current zoom
  const holdParts: string[] = [];
  for (const event of events) {
    const zoom = ZOOM_FACTORS[event.zoom_level] ?? 1.0;
    holdParts.push(`if(between(t,${fmt(event.start_s)},${fmt(event.end_s)}),${fmt(zoom)}`);
  }

  // Build nested if chain: transitions first (priority), then holds, then fallback 1.0
  const allParts = [...parts, ...holdParts];
  let expr = "1.0";
  for (let i = allParts.length - 1; i >= 0; i--) {
    expr = `${allParts[i]},${expr})`;
  }

  return expr;
}

function fmt(n: number): string {
  return parseFloat(n.toFixed(4)).toString();
}
