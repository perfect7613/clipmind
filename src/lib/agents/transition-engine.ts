/**
 * Transition Engine — Inserts smooth transitions (xfade) between cut segments.
 *
 * After silence removal produces a set of trim regions (kept segments),
 * this engine joins them with FFmpeg xfade/acrossfade filters instead of
 * hard-cutting via concat.
 *
 * Supported video transitions map to FFmpeg xfade transition names:
 *   crossfade  → fade
 *   dip-to-black → fadeblack
 *   wipe-left  → wipeleft
 *   wipe-right → wiperight
 *   fade       → dissolve
 */

import ffmpeg from "fluent-ffmpeg";
import path from "path";
import os from "os";
import { promises as fs } from "fs";

// ── Types ────────────────────────────────────────────────────────────────────

export type TransitionType =
  | "crossfade"
  | "dip-to-black"
  | "wipe-left"
  | "wipe-right"
  | "fade";

export interface CutSegment {
  start_s: number;
  end_s: number;
  path?: string; // for multi-segment joins (pre-split files)
}

export interface TransitionConfig {
  type: TransitionType;
  durationS: number;
}

// Map our friendly names to FFmpeg xfade transition values
const XFADE_TRANSITION_MAP: Record<TransitionType, string> = {
  crossfade: "fade",
  "dip-to-black": "fadeblack",
  "wipe-left": "wipeleft",
  "wipe-right": "wiperight",
  fade: "dissolve",
};

const DEFAULT_TRANSITION: TransitionConfig = {
  type: "crossfade",
  durationS: 0.5,
};

// ── DNA Extraction ───────────────────────────────────────────────────────────

/**
 * Extract transition preference from DNA content.
 * Looks for a `## Transitions` section with Type and Duration fields.
 * Falls back to crossfade 0.5s if not specified.
 */
export function getDefaultTransition(dnaContent?: string): TransitionConfig {
  if (!dnaContent) return { ...DEFAULT_TRANSITION };

  const config: TransitionConfig = { ...DEFAULT_TRANSITION };

  // Match transition type
  const typeMatch = dnaContent.match(
    /(?:transition.*?type|between\s+clips)[:\s]*([\w-]+)/i
  );
  if (typeMatch) {
    const raw = typeMatch[1].toLowerCase().replace(/\s+/g, "-");
    const mapped = normalizeTransitionType(raw);
    if (mapped) config.type = mapped;
  }

  // Match duration
  const durationMatch = dnaContent.match(
    /(?:transition.*?duration|duration)[:\s]*([\d.]+)\s*s?/i
  );
  if (durationMatch) {
    const dur = parseFloat(durationMatch[1]);
    if (dur > 0 && dur <= 3) {
      config.durationS = dur;
    }
  }

  return config;
}

/**
 * Normalize various transition name strings to our TransitionType union.
 */
function normalizeTransitionType(raw: string): TransitionType | null {
  const map: Record<string, TransitionType> = {
    crossfade: "crossfade",
    "cross-fade": "crossfade",
    "cross-dissolve": "crossfade",
    crossdissolve: "crossfade",
    dissolve: "fade",
    fade: "fade",
    "dip-to-black": "dip-to-black",
    diptoblack: "dip-to-black",
    fadeblack: "dip-to-black",
    "wipe-left": "wipe-left",
    wipeleft: "wipe-left",
    "wipe-right": "wipe-right",
    wiperight: "wipe-right",
  };
  return map[raw] ?? null;
}

// ── Filter Builder ───────────────────────────────────────────────────────────

/**
 * Build FFmpeg xfade + acrossfade filter_complex string for joining N segments
 * with smooth transitions.
 *
 * For N segments we need N-1 xfade filters chained together.
 *
 * Xfade offset = cumulative duration of all preceding segments minus
 *                cumulative transition durations already consumed,
 *                minus the current transition duration.
 *
 * Example for 3 segments (durations d0, d1, d2) with transition T:
 *   offset0 = d0 - T
 *   offset1 = (d0 + d1 - T) - T = d0 + d1 - 2T
 *
 * Video:
 *   [0:v][1:v]xfade=transition=fade:duration=T:offset=O0[vx0];
 *   [vx0][2:v]xfade=transition=fade:duration=T:offset=O1[vout]
 *
 * Audio:
 *   [0:a][1:a]acrossfade=d=T:c1=tri:c2=tri[ax0];
 *   [ax0][2:a]acrossfade=d=T:c1=tri:c2=tri[aout]
 */
/**
 * Build xfade filter with per-segment transition types.
 * @param segments - Cut segments
 * @param config - Default transition config (used when segment doesn't specify one)
 * @param perSegmentTransitions - Optional array of transition types, one per segment boundary
 *                                 (length = segments.length - 1)
 */
export function buildXfadeFilter(
  segments: CutSegment[],
  config: TransitionConfig,
  perSegmentTransitions?: string[]
): string {
  if (segments.length < 2) return "";

  const T = config.durationS;
  const videoFilters: string[] = [];
  const audioFilters: string[] = [];

  // Compute segment durations
  const durations = segments.map((s) =>
    Math.round((s.end_s - s.start_s) * 1000) / 1000
  );

  // Running offset tracks the timeline position where the next transition starts
  let cumulativeDuration = durations[0];

  for (let i = 1; i < segments.length; i++) {
    const isLast = i === segments.length - 1;

    // Use per-segment transition if provided, otherwise default
    const transType = perSegmentTransitions?.[i - 1] || config.type;
    const ffmpegTransition = XFADE_TRANSITION_MAP[transType] ?? "fade";

    // Offset = point in the output timeline where this xfade begins
    const offset = Math.max(0, cumulativeDuration - T);

    // Video xfade
    const vIn = i === 1 ? "[0:v]" : `[vx${i - 2}]`;
    const vOut = isLast ? "[vout]" : `[vx${i - 1}]`;
    videoFilters.push(
      `${vIn}[${i}:v]xfade=transition=${ffmpegTransition}:duration=${T}:offset=${offset.toFixed(3)}${vOut}`
    );

    // Audio acrossfade
    const aIn = i === 1 ? "[0:a]" : `[ax${i - 2}]`;
    const aOut = isLast ? "[aout]" : `[ax${i - 1}]`;
    audioFilters.push(
      `${aIn}[${i}:a]acrossfade=d=${T}:c1=tri:c2=tri${aOut}`
    );

    // Advance cumulative: add next segment duration, minus the overlap we just consumed
    cumulativeDuration = offset + durations[i];
  }

  return [...videoFilters, ...audioFilters].join(";\n");
}

// ── Full FFmpeg Execution ────────────────────────────────────────────────────

/**
 * Split a video into the given segments, then join them with xfade transitions.
 *
 * Steps:
 * 1. Extract each segment to a temporary file (re-encoded to ensure consistent params).
 * 2. Build a multi-input ffmpeg command with xfade filter_complex.
 * 3. Output the final joined video.
 *
 * @returns Path to the output video with transitions applied.
 */
export async function applyTransitionsBetweenSegments(
  inputPath: string,
  segments: CutSegment[],
  config: TransitionConfig,
  outputPath: string,
  perSegmentTransitions?: string[]
): Promise<string> {
  if (segments.length === 0) {
    throw new Error("No segments provided for transition engine");
  }

  // Single segment — no transitions needed, just trim and copy
  if (segments.length === 1) {
    await trimSegment(inputPath, segments[0], outputPath);
    return outputPath;
  }

  // Ensure transition duration doesn't exceed shortest segment
  const minSegDuration = Math.min(
    ...segments.map((s) => s.end_s - s.start_s)
  );
  const safeDuration = Math.min(config.durationS, minSegDuration * 0.4);
  const safeConfig: TransitionConfig = { ...config, durationS: safeDuration };

  // Step 1: Extract each segment to a temp file
  const tmpDir = path.join(
    os.tmpdir(),
    `clipmind-xfade-${Date.now()}`
  );
  await fs.mkdir(tmpDir, { recursive: true });

  const segmentPaths: string[] = [];
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const segPath = seg.path ?? path.join(tmpDir, `seg-${i}.mp4`);
    if (!seg.path) {
      await trimSegment(inputPath, seg, segPath);
    }
    segmentPaths.push(seg.path ?? segPath);
  }

  // Step 2: Build xfade filter and run
  const filter = buildXfadeFilter(
    segments.map((s, i) => ({
      ...s,
      // Segments are now individual files starting at 0
      start_s: 0,
      end_s: s.end_s - s.start_s,
      path: segmentPaths[i],
    })),
    safeConfig,
    perSegmentTransitions
  );

  await runXfadeCommand(segmentPaths, filter, outputPath);

  // Cleanup temp segments
  for (const p of segmentPaths) {
    if (p.startsWith(tmpDir)) {
      await fs.unlink(p).catch(() => {});
    }
  }
  await fs.rmdir(tmpDir).catch(() => {});

  return outputPath;
}

// ── Internal Helpers ─────────────────────────────────────────────────────────

/**
 * Trim a single segment from input to output using FFmpeg.
 */
function trimSegment(
  inputPath: string,
  segment: CutSegment,
  outputPath: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    const duration = segment.end_s - segment.start_s;
    ffmpeg(inputPath)
      .setStartTime(segment.start_s)
      .setDuration(duration)
      .outputOptions([
        "-c:v", "libx264",
        "-crf", "18",
        "-preset", "fast",
        "-c:a", "aac",
        "-b:a", "192k",
        "-pix_fmt", "yuv420p",
        "-movflags", "+faststart",
      ])
      .output(outputPath)
      .on("start", (cmdLine) => {
        console.log("[TransitionEngine] Trim:", cmdLine);
      })
      .on("end", () => {
        console.log("[TransitionEngine] Trimmed segment:", outputPath);
        resolve();
      })
      .on("error", (err, _stdout, stderr) => {
        console.error("[TransitionEngine] Trim failed:", err.message);
        console.error("[TransitionEngine] stderr:", stderr);
        reject(new Error(`Segment trim failed: ${err.message}`));
      })
      .run();
  });
}

/**
 * Run the multi-input xfade FFmpeg command.
 */
function runXfadeCommand(
  inputPaths: string[],
  filterComplex: string,
  outputPath: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    const cmd = ffmpeg();

    // Add each segment as an input
    for (const p of inputPaths) {
      cmd.input(p);
    }

    cmd
      .outputOptions([
        "-filter_complex", filterComplex,
        "-map", "[vout]",
        "-map", "[aout]",
        "-c:v", "libx264",
        "-crf", "18",
        "-preset", "fast",
        "-c:a", "aac",
        "-b:a", "192k",
        "-pix_fmt", "yuv420p",
        "-movflags", "+faststart",
      ])
      .output(outputPath)
      .on("start", (cmdLine) => {
        console.log("[TransitionEngine] Xfade command:", cmdLine);
      })
      .on("end", () => {
        console.log("[TransitionEngine] Xfade done:", outputPath);
        resolve();
      })
      .on("error", (err, _stdout, stderr) => {
        console.error("[TransitionEngine] Xfade failed:", err.message);
        console.error("[TransitionEngine] stderr:", stderr);
        reject(new Error(`Xfade render failed: ${err.message}`));
      })
      .run();
  });
}
