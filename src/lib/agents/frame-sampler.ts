import { z } from "zod";
import ffmpeg from "fluent-ffmpeg";
import { promises as fs } from "fs";
import path from "path";
import os from "os";
import { execFile as execFileCb } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFileCb);

// --- Legacy types (kept for backward compat) ---
export const FrameSampleSchema = z.object({
  path: z.string(),
  timestamp_s: z.number(),
  is_scene_change: z.boolean(),
});

export const FrameSamplerResultSchema = z.object({
  frames: z.array(FrameSampleSchema),
  video_duration_s: z.number(),
  output_dir: z.string(),
});

export type FrameSample = z.infer<typeof FrameSampleSchema>;
export type FrameSamplerResult = z.infer<typeof FrameSamplerResultSchema>;

// --- New dense sampling types ---

export interface FrameWindow {
  windowIndex: number;
  startS: number;
  endS: number;
  frameCount: number;
  framePaths: string[];
  // Per-window metrics (filled by analyzeWindows)
  dominantColors?: string[];      // top 3 hex colors
  avgBrightness?: number;         // 0-255
  sceneChangeCount?: number;      // cuts in this window
  faceLikelihood?: number;        // 0-1 (skin-tone heuristic)
}

export interface DenseFrameResult {
  frames: FrameSample[];
  windows: FrameWindow[];
  video_duration_s: number;
  output_dir: string;
}

/**
 * Extract frames at 1fps from a video (dense sampling).
 * Returns array of file paths in order.
 */
export async function sampleFrames(
  videoPath: string,
  outputDir?: string,
  fps: number = 1
): Promise<DenseFrameResult> {
  const outDir = outputDir || path.join(os.tmpdir(), `clipmind-frames-${Date.now()}`);
  await fs.mkdir(outDir, { recursive: true });

  const duration = await getVideoDuration(videoPath);

  // Extract at 1fps (or custom fps)
  await extractAtFps(videoPath, outDir, fps);

  // Read generated files
  const files = await fs.readdir(outDir);
  const frameFiles = files
    .filter((f) => f.startsWith("frame-") && f.endsWith(".jpg"))
    .sort();

  const frames: FrameSample[] = frameFiles.map((file, i) => ({
    path: path.join(outDir, file),
    timestamp_s: i / fps,
    is_scene_change: false,
  }));

  // Group into 10-second windows
  const windows = groupIntoWindows(frames, 10);

  return {
    frames,
    windows,
    video_duration_s: duration,
    output_dir: outDir,
  };
}

/**
 * Extract frames at given fps using FFmpeg.
 */
function extractAtFps(
  videoPath: string,
  outputDir: string,
  fps: number
): Promise<void> {
  return new Promise((resolve, reject) => {
    ffmpeg(videoPath)
      .outputOptions([
        "-vf", `fps=${fps}`,
        "-q:v", "2",
      ])
      .output(path.join(outputDir, "frame-%05d.jpg"))
      .on("end", () => resolve())
      .on("error", (err) => reject(new Error(`Frame extraction failed: ${err.message}`)))
      .run();
  });
}

/**
 * Group frames into time-based windows.
 */
export function groupIntoWindows(
  frames: FrameSample[],
  windowSizeS: number = 10
): FrameWindow[] {
  if (frames.length === 0) return [];

  const maxTime = frames[frames.length - 1].timestamp_s;
  const windowCount = Math.ceil((maxTime + 1) / windowSizeS);
  const windows: FrameWindow[] = [];

  for (let i = 0; i < windowCount; i++) {
    const startS = i * windowSizeS;
    const endS = (i + 1) * windowSizeS;
    const windowFrames = frames.filter(
      (f) => f.timestamp_s >= startS && f.timestamp_s < endS
    );

    windows.push({
      windowIndex: i,
      startS,
      endS,
      frameCount: windowFrames.length,
      framePaths: windowFrames.map((f) => f.path),
    });
  }

  return windows;
}

/**
 * Analyze each window for color, brightness, and scene changes.
 * Mutates the windows in place and returns them.
 */
export async function analyzeWindows(
  windows: FrameWindow[],
  videoPath: string
): Promise<FrameWindow[]> {
  for (const win of windows) {
    if (win.framePaths.length === 0) continue;

    // Pick a representative frame (middle of window)
    const midFrame = win.framePaths[Math.floor(win.framePaths.length / 2)];

    // Dominant colors: downscale to 4x4, read 16 pixels, pick top 3
    try {
      win.dominantColors = await extractDominantColors(midFrame);
    } catch {
      win.dominantColors = [];
    }

    // Brightness: average pixel value from a 1x1 downscale
    try {
      win.avgBrightness = await extractBrightness(midFrame);
    } catch {
      win.avgBrightness = 128;
    }

    // Scene changes: count cuts in this window's time range
    try {
      win.sceneChangeCount = await countSceneChanges(
        videoPath,
        win.startS,
        win.endS
      );
    } catch {
      win.sceneChangeCount = 0;
    }

    // TODO: face detection via skin-tone heuristic
    win.faceLikelihood = undefined;
  }

  return windows;
}

/**
 * Extract top 3 dominant colors by downscaling frame to 4x4
 * and reading the raw RGB pixels.
 */
async function extractDominantColors(framePath: string): Promise<string[]> {
  const { stdout } = await execFileAsync("ffmpeg", [
    "-i", framePath,
    "-vf", "scale=4:4",
    "-f", "rawvideo",
    "-pix_fmt", "rgb24",
    "-v", "quiet",
    "pipe:1",
  ], { encoding: "buffer" as any, maxBuffer: 1024 });

  const buf = stdout as unknown as Buffer;
  if (!buf || buf.length < 3) return [];

  // Read 16 pixels (4x4), count color occurrences
  const colorCounts = new Map<string, number>();
  const pixelCount = Math.floor(buf.length / 3);

  for (let i = 0; i < pixelCount; i++) {
    const r = buf[i * 3];
    const g = buf[i * 3 + 1];
    const b = buf[i * 3 + 2];
    // Quantize to reduce noise (round to nearest 16)
    const qr = Math.round(r / 16) * 16;
    const qg = Math.round(g / 16) * 16;
    const qb = Math.round(b / 16) * 16;
    const hex = `#${clampHex(qr)}${clampHex(qg)}${clampHex(qb)}`;
    colorCounts.set(hex, (colorCounts.get(hex) || 0) + 1);
  }

  // Sort by frequency, return top 3
  const sorted = [...colorCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([hex]) => hex);

  return sorted;
}

function clampHex(n: number): string {
  return Math.min(255, Math.max(0, n)).toString(16).padStart(2, "0");
}

/**
 * Get average brightness from a single-pixel downscale.
 */
async function extractBrightness(framePath: string): Promise<number> {
  const { stdout } = await execFileAsync("ffmpeg", [
    "-i", framePath,
    "-vf", "scale=1:1",
    "-f", "rawvideo",
    "-pix_fmt", "gray",
    "-v", "quiet",
    "pipe:1",
  ], { encoding: "buffer" as any, maxBuffer: 64 });

  const buf = stdout as unknown as Buffer;
  if (!buf || buf.length < 1) return 128;
  return buf[0];
}

/**
 * Count scene changes in a time range using FFmpeg scene detection.
 */
async function countSceneChanges(
  videoPath: string,
  startS: number,
  endS: number
): Promise<number> {
  const duration = endS - startS;

  try {
    const { stderr } = await execFileAsync("ffmpeg", [
      "-ss", String(startS),
      "-t", String(duration),
      "-i", videoPath,
      "-vf", "select='gt(scene,0.3)',showinfo",
      "-vsync", "vfr",
      "-f", "null",
      "-",
    ], { maxBuffer: 1024 * 1024 });

    // Count "pts_time:" occurrences in stderr (each = 1 scene change)
    const matches = stderr.match(/pts_time:/g);
    return matches ? matches.length : 0;
  } catch {
    return 0;
  }
}

function getVideoDuration(videoPath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(videoPath, (err, metadata) => {
      if (err) return reject(new Error(`ffprobe failed: ${err.message}`));
      resolve(metadata.format.duration || 0);
    });
  });
}

/**
 * Clean up extracted frames.
 */
export async function cleanupFrames(outputDir: string): Promise<void> {
  try {
    await fs.rm(outputDir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
}
