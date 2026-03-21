/**
 * Smooth Zoom Engine — ScreenStudio-style zoompan filter builder.
 *
 * Replaces the old static crop+scale approach with FFmpeg's zoompan filter
 * for buttery-smooth zoom transitions using cosine ease-in-out.
 *
 * Key design choices:
 * - Uses zoompan filter with per-frame z/x/y expressions
 * - Cosine ease-in-out: (1 - cos(progress * PI)) / 2
 * - Always centered: x = iw/2 - (iw/zoom/2), y = ih/2 - (ih/zoom/2)
 * - Resolution-independent logic (uses iw/ih), but zoompan needs explicit s=WxH
 * - d=1 means 1 output frame per input frame (no interpolation, preserves fps)
 */

import type { ZoomEvent } from "./zoom-planner";

/** Zoom factor mapping — subtle, subject always stays visible */
const ZOOM_FACTORS: Record<string, number> = {
  normal: 1.0,
  punched_in: 1.1,
  tight: 1.15,
};

/** Duration in seconds for each zoom transition (ease-in-out window) */
const TRANSITION_DURATION_S = 0.6;

/**
 * Build a smooth zoompan filter string from zoom events.
 *
 * The returned string is a single zoompan filter ready for -filter:v or filter_complex.
 * Example output:
 *   zoompan=z='...':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=1920x1080:fps=30
 *
 * @param events  - Array of ZoomEvent from the zoom planner
 * @param fps     - Output frame rate (must match the pipeline fps)
 * @param inputWidth  - Output/input width for zoompan s= parameter (default 1920)
 * @param inputHeight - Output/input height for zoompan s= parameter (default 1080)
 * @returns The zoompan filter string, or null if no meaningful zoom is needed
 */
export function buildSmoothZoomFilter(
  events: ZoomEvent[],
  fps: number = 30,
  inputWidth: number = 1920,
  inputHeight: number = 1080,
): string | null {
  if (events.length === 0) return null;
  if (events.every((e) => e.zoom_level === "normal")) return null;

  const zExpr = buildZoomExpression(events, fps);

  // Always center the zoom on the frame
  const xExpr = "iw/2-(iw/zoom/2)";
  const yExpr = "ih/2-(ih/zoom/2)";

  return `zoompan=z='${zExpr}':x='${xExpr}':y='${yExpr}':d=1:s=${inputWidth}x${inputHeight}:fps=${fps}`;
}

/**
 * Build the z= expression for zoompan.
 *
 * Strategy: for each transition between two zoom levels, emit an
 * `if(between(t, T_START, T_END), ...)` clause with cosine easing.
 * Between transitions, hold at the current zoom level.
 *
 * The expression is a nested chain of if() calls that FFmpeg evaluates
 * left-to-right per frame. The final fallback is the last event's zoom level.
 */
function buildZoomExpression(events: ZoomEvent[], fps: number): string {
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

    if (fromZoom === toZoom) continue; // no transition needed

    // Transition starts at the boundary between events
    const tStart = next.start_s;
    const tEnd = tStart + TRANSITION_DURATION_S;
    const delta = toZoom - fromZoom;

    // Cosine ease-in-out: base + delta * (1 - cos((t - tStart) / dur * PI)) / 2
    // Using between(t, T1, T2) to scope the expression to the transition window
    parts.push(
      `if(between(t\\,${fmtNum(tStart)}\\,${fmtNum(tEnd)})\\,` +
      `${fmtNum(fromZoom)}+${fmtNum(delta)}*((1-cos((t-${fmtNum(tStart)})/${fmtNum(TRANSITION_DURATION_S)}*PI))/2)`,
    );
  }

  if (parts.length === 0) {
    // All events have the same zoom level
    return String(ZOOM_FACTORS[events[0].zoom_level] ?? 1.0);
  }

  // Build hold segments (between transitions, hold at current zoom)
  // We need to cover all time ranges not covered by transitions
  const holdParts: string[] = [];

  for (const event of events) {
    const zoom = ZOOM_FACTORS[event.zoom_level] ?? 1.0;
    holdParts.push(
      `if(between(t\\,${fmtNum(event.start_s)}\\,${fmtNum(event.end_s)})\\,${fmtNum(zoom)}`,
    );
  }

  // Combine: transitions take priority over holds, final fallback is 1.0
  // Order: transitions first (they override hold during the easing window),
  // then holds, then fallback
  const allParts = [...parts, ...holdParts];

  // Build nested if chain: if(cond1, val1, if(cond2, val2, ... fallback))
  // Each part already has the opening `if(...)` — we need to close them
  let expr = "1.0"; // final fallback
  for (let i = allParts.length - 1; i >= 0; i--) {
    expr = `${allParts[i]}\\,${expr})`;
  }

  return expr;
}

/** Format a number to 4 decimal places, trimming trailing zeros */
function fmtNum(n: number): string {
  return parseFloat(n.toFixed(4)).toString();
}
