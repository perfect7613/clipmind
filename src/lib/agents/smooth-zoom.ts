/**
 * Smooth Zoom Engine
 *
 * Applies a subtle centered crop+scale zoom effect based on zoom planner events.
 * Uses FFmpeg crop/scale filters with iw/ih expressions — works at ANY resolution.
 *
 * The zoom is subtle (max 15% crop) so the subject always stays visible.
 * For the prototype, applies the dominant zoom level as a static crop.
 * Dynamic per-segment zoompan would require ffprobe for resolution detection
 * and segment-based rendering — planned for v3.
 */

import type { ZoomEvent } from "./zoom-planner";

const ZOOM_FACTORS: Record<string, number> = {
  normal: 1.0,
  punched_in: 1.1,   // 10% crop
  tight: 1.15,        // 15% crop
};

/**
 * Build a centered crop+scale zoom filter from zoom events.
 * Returns a filter string for -filter:v, or null if no zoom needed.
 *
 * Uses iw/ih expressions — works at ANY input resolution (720p, 1080p, 4K).
 */
export function buildSmoothZoomFilter(
  events: ZoomEvent[],
  _fps: number = 30,
): string | null {
  if (events.length === 0) return null;
  if (events.every((e) => e.zoom_level === "normal")) return null;

  // Find the dominant non-normal zoom level (by total duration)
  const zoomDurations: Record<string, number> = {};
  for (const event of events) {
    const dur = event.end_s - event.start_s;
    zoomDurations[event.zoom_level] = (zoomDurations[event.zoom_level] || 0) + dur;
  }

  let bestZoom = "punched_in";
  if ((zoomDurations["tight"] || 0) > (zoomDurations["punched_in"] || 0)) {
    bestZoom = "tight";
  }

  const zoom = ZOOM_FACTORS[bestZoom] || 1.0;
  if (zoom <= 1.0) return null;

  // Crop centered portion, then scale back to original dimensions
  // cropPct = fraction of frame to keep (0.9091 at 1.1x, 0.8696 at 1.15x)
  const cropPct = (1 / zoom).toFixed(4);
  const zoomStr = zoom.toFixed(4);

  // After crop, iw/ih are the cropped dimensions
  // Multiply by zoom to get back to approximately original size
  return [
    `crop=trunc(iw*${cropPct}/2)*2:trunc(ih*${cropPct}/2)*2:(iw-trunc(iw*${cropPct}/2)*2)/2:(ih-trunc(ih*${cropPct}/2)*2)/2`,
    `scale=trunc(iw*${zoomStr}/2)*2:trunc(ih*${zoomStr}/2)*2:flags=lanczos`,
  ].join(",");
}
