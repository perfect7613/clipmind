import ffmpeg from "fluent-ffmpeg";
import path from "path";
import os from "os";
import { promises as fs } from "fs";
import type { SelectedClip } from "./clip-selector";
import { buildColorFilterChain, type ColorProfile } from "./color-correction";
import { buildAudioFilterChain, type AudioProfile } from "./audio-mastering";

interface RenderConfig {
  colorProfile: ColorProfile;
  audioProfile: AudioProfile;
  outputWidth: number;
  outputHeight: number;
  fps: number;
  crf: number;
}

const DEFAULT_RENDER_CONFIG: RenderConfig = {
  colorProfile: "neutral",
  audioProfile: "youtube_standard",
  outputWidth: 1920,
  outputHeight: 1080,
  fps: 30,
  crf: 22,
};

/**
 * Render a single clip from the source video.
 * Uses -ss/-to for reliable seeking, then applies color + audio filters.
 * This is the simple, robust approach — one clip at a time.
 */
export async function renderClip(
  inputPath: string,
  clip: SelectedClip,
  outputDir: string,
  clipIndex: number,
  config: Partial<RenderConfig> = {}
): Promise<string> {
  const cfg = { ...DEFAULT_RENDER_CONFIG, ...config };
  await fs.mkdir(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, `edited-clip-${clipIndex + 1}.mp4`);

  const colorFilter = buildColorFilterChain(cfg.colorProfile);
  const audioFilter = buildAudioFilterChain({ style: cfg.audioProfile });

  // Build video filter chain: scale to even dims → color correction → fps
  const videoFilters: string[] = [
    // Ensure even dimensions (required for libx264)
    `scale=trunc(iw/2)*2:trunc(ih/2)*2`,
  ];
  if (colorFilter !== "null") {
    videoFilters.push(colorFilter);
  }
  videoFilters.push(`fps=${cfg.fps}`);
  videoFilters.push("setsar=1:1");

  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      // Seek to clip start (input seeking — fast and keyframe-accurate)
      .setStartTime(clip.start_s)
      .duration(clip.end_s - clip.start_s)
      // Video filters: scale + color + fps
      .videoFilters(videoFilters.join(","))
      // Audio filters: mastering chain
      .audioFilters(audioFilter)
      // Encoding
      .outputOptions([
        "-c:v", "libx264",
        "-crf", String(cfg.crf),
        "-preset", "fast",
        "-c:a", "aac",
        "-b:a", "192k",
        "-movflags", "+faststart",
        "-pix_fmt", "yuv420p",
      ])
      .output(outputPath)
      .on("start", (cmd) => {
        console.log(`[Render] Clip ${clipIndex + 1}: ${clip.start_s}s → ${clip.end_s}s`);
        console.log(`[Render] Command: ${cmd}`);
      })
      .on("end", () => {
        console.log(`[Render] Clip ${clipIndex + 1} done: ${outputPath}`);
        resolve(outputPath);
      })
      .on("error", (err, stdout, stderr) => {
        console.error(`[Render] Clip ${clipIndex + 1} failed:`, err.message);
        console.error(`[Render] stderr:`, stderr);
        reject(new Error(`Render failed for clip ${clipIndex + 1}: ${err.message}`));
      })
      .run();
  });
}

/**
 * Render all selected clips from the source video.
 * Each clip is rendered independently — simpler and more reliable than
 * a single filter_complex with 50+ segments.
 */
export async function renderSkill1(
  inputPaths: string[],
  clips: SelectedClip[],
  outputDir?: string,
  config: Partial<RenderConfig> = {}
): Promise<string[]> {
  const dir = outputDir || path.join(os.tmpdir(), `clipmind-render-${Date.now()}`);
  await fs.mkdir(dir, { recursive: true });

  const inputPath = inputPaths[0]; // Primary camera
  const results: string[] = [];

  for (let i = 0; i < clips.length; i++) {
    try {
      const outputPath = await renderClip(inputPath, clips[i], dir, i, config);
      results.push(outputPath);
    } catch (err) {
      console.error(`Skipping clip ${i + 1} due to render error:`, err);
      // Continue with other clips — don't fail the whole batch
    }
  }

  if (results.length === 0) {
    throw new Error("All clip renders failed");
  }

  return results;
}

// Keep for backwards compat but simplified
export function buildRenderSegments(
  clips: SelectedClip[],
  _zoomCrops: any[] = [],
  _sourceIndex: number = 0
) {
  // Zoom is now handled separately, not in render segments
  return clips.map((clip) => ({
    start_s: clip.start_s,
    end_s: clip.end_s,
    sourceIndex: _sourceIndex,
  }));
}
