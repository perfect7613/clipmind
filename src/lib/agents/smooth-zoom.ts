/**
 * Smooth Zoom Engine
 *
 * Two zoom approaches:
 * 1. SLOW KEN BURNS — gradual zoom-in from 1.0x to 1.1x over the clip duration
 *    Uses FFmpeg zoompan with a SIMPLE expression (no nested if/between)
 * 2. STATIC CROP — centered crop at 1.1x for the whole clip
 *    Fallback if zoompan fails
 *
 * The zoompan approach creates a cinematic slow push-in effect.
 * The expression is kept deliberately simple to avoid FFmpeg parser issues.
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
 * Returns [width, height] or [1280, 720] as fallback.
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
 * Build a smooth zoom filter.
 *
 * If we have the video resolution, uses zoompan for a cinematic slow push-in.
 * Otherwise falls back to static crop+scale.
 *
 * @param events - Zoom events from the planner
 * @param fps - Output framerate
 * @param width - Video width (from ffprobe)
 * @param height - Video height (from ffprobe)
 */
export function buildSmoothZoomFilter(
  events: ZoomEvent[],
  fps: number = 30,
  width?: number,
  height?: number,
): string | null {
  if (events.length === 0) return null;
  if (events.every((e) => e.zoom_level === "normal")) return null;

  // Find the target zoom level
  const zoomDurations: Record<string, number> = {};
  for (const event of events) {
    const dur = event.end_s - event.start_s;
    zoomDurations[event.zoom_level] = (zoomDurations[event.zoom_level] || 0) + dur;
  }

  let bestZoom = "punched_in";
  if ((zoomDurations["tight"] || 0) > (zoomDurations["punched_in"] || 0)) {
    bestZoom = "tight";
  }

  const targetZoom = ZOOM_FACTORS[bestZoom] || 1.0;
  if (targetZoom <= 1.0) return null;

  // If we know the resolution, use zoompan for smooth Ken Burns
  if (width && height) {
    return buildZoompanFilter(targetZoom, fps, width, height);
  }

  // Fallback: static crop+scale (works at any resolution via iw/ih)
  return buildStaticCropFilter(targetZoom);
}

/**
 * Zoompan filter for smooth Ken Burns push-in.
 * Simple expression: zoom from 1.0 to targetZoom linearly over the clip.
 * Centered on frame. Explicit resolution.
 */
function buildZoompanFilter(targetZoom: number, fps: number, w: number, h: number): string {
  const delta = (targetZoom - 1).toFixed(4);
  // Total frames isn't known here, but zoompan's 'on' variable counts output frames
  // Use a slow ramp: z = 1 + delta * (on / (on + 300))  -- asymptotic approach
  // This zooms smoothly and never exceeds targetZoom
  return `zoompan=z='1+${delta}*(on/(on+${fps * 10}))':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=${w}x${h}:fps=${fps}`;
}

/**
 * Static centered crop+scale fallback.
 */
function buildStaticCropFilter(targetZoom: number): string {
  const cropPct = (1 / targetZoom).toFixed(4);
  const zoomStr = targetZoom.toFixed(4);
  return [
    `crop=trunc(iw*${cropPct}/2)*2:trunc(ih*${cropPct}/2)*2:(iw-trunc(iw*${cropPct}/2)*2)/2:(ih-trunc(ih*${cropPct}/2)*2)/2`,
    `scale=trunc(iw*${zoomStr}/2)*2:trunc(ih*${zoomStr}/2)*2:flags=lanczos`,
  ].join(",");
}
