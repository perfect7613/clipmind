/**
 * Zoom Engine
 *
 * Applies a centered crop+scale zoom effect based on zoom planner events.
 * Uses FFmpeg crop/scale with iw/ih expressions — works at ANY resolution
 * without stretching or aspect ratio issues.
 *
 * No zoompan — it causes stretching and aspect ratio problems.
 * Clean crop+scale is reliable and visually correct.
 */

import type { ZoomEvent } from "./zoom-planner";
import { exec } from "child_process";

const ZOOM_FACTORS: Record<string, number> = {
  normal: 1.0,
  punched_in: 1.1,
  tight: 1.15,
};

/**
 * Detect video resolution via ffprobe.
 */
export function detectResolution(videoPath: string): Promise<[number, number]> {
  return new Promise((resolve) => {
    exec(
      `ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0 "${videoPath}"`,
      (err, stdout) => {
        if (err || !stdout.trim()) return resolve([1280, 720]);
        const parts = stdout.trim().split(",");
        const w = parseInt(parts[0], 10);
        const h = parseInt(parts[1], 10);
        if (isNaN(w) || isNaN(h)) return resolve([1280, 720]);
        resolve([w, h]);
      }
    );
  });
}

/**
 * Build a centered crop+scale zoom filter from zoom events.
 * Uses iw/ih — works at any resolution without stretching.
 * Returns null if no zoom needed.
 */
export function buildSmoothZoomFilter(
  events: ZoomEvent[],
  _fps: number = 30,
  _width?: number,
  _height?: number,
): string | null {
  if (events.length === 0) return null;
  if (events.every((e) => e.zoom_level === "normal")) return null;

  // Find the dominant non-normal zoom level
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

  // Centered crop then scale back — preserves aspect ratio perfectly
  const cropPct = (1 / zoom).toFixed(4);
  const zoomStr = zoom.toFixed(4);

  return [
    `crop=trunc(iw*${cropPct}/2)*2:trunc(ih*${cropPct}/2)*2:(iw-trunc(iw*${cropPct}/2)*2)/2:(ih-trunc(ih*${cropPct}/2)*2)/2`,
    `scale=trunc(iw*${zoomStr}/2)*2:trunc(ih*${zoomStr}/2)*2:flags=lanczos`,
  ].join(",");
}
