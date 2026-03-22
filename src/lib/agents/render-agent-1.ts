import ffmpeg from "fluent-ffmpeg";
import path from "path";
import os from "os";
import { promises as fs } from "fs";
import type { SelectedClip } from "./clip-selector";
import { buildAudioFilterChain, type AudioProfile } from "./audio-mastering";
import { buildVideoFilterChain, extractEffectsFromDna, type EffectsConfig } from "./ffmpeg-effects";
import { planZoomEvents, type ZoomEvent, type ZoomPlan } from "./zoom-planner";
import { detectResolution } from "./smooth-zoom";
import type { WordTimestamp } from "@/types";

interface RenderConfig {
  colorProfile: string;
  audioProfile: AudioProfile;
  crf: number;
  dnaContent?: string;
  clipWords?: WordTimestamp[];
}

const DEFAULT_RENDER_CONFIG: RenderConfig = {
  colorProfile: "neutral",
  audioProfile: "youtube_standard",
  crf: 22,
};

/**
 * Render a single clip with the full FFmpeg effects pipeline.
 *
 * This is where ALL real video editing happens:
 * - Trim to clip boundaries
 * - AI-planned zoom events (Ken Burns, punch-in, tight)
 * - Color grading (warm/cool/cinematic) from DNA
 * - Vignette, film grain, bleach bypass from DNA
 * - Fade in/out
 * - Audio mastering (-16 LUFS)
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

  const clipDurationS = clip.end_s - clip.start_s;
  if (clipDurationS < 0.5) {
    throw new Error(`Clip duration too short (${clipDurationS.toFixed(4)}s) — minimum 0.5s`);
  }

  // ── Plan zoom events ONLY if DNA requests zoom ──
  let zoomPlan: ZoomPlan | null = null;
  const zoomAggressiveness = extractDnaFloat(cfg.dnaContent, "Aggressiveness", 0);

  // Only plan zoom if DNA aggressiveness > 0.1 (i.e., creator actually wants zoom)
  if (cfg.clipWords && cfg.clipWords.length > 0 && zoomAggressiveness > 0.1) {
    try {
      const maxZoomLevel = extractDnaFloat(cfg.dnaContent, "Max zoom level", 1.15);

      zoomPlan = await planZoomEvents(cfg.clipWords, clipDurationS, {
        aggressiveness: zoomAggressiveness,
        maxZoomLevel: maxZoomLevel,
      });
      console.log(`[Render] Planned ${zoomPlan.events.length} zoom events for clip ${clipIndex + 1} (aggressiveness=${zoomAggressiveness})`);
    } catch (err) {
      console.error(`[Render] Zoom planning failed for clip ${clipIndex + 1}, skipping:`, err);
    }
  } else {
    console.log(`[Render] Zoom disabled for clip ${clipIndex + 1} (aggressiveness=${zoomAggressiveness})`);
  }

  // ── Detect video resolution for zoompan ──
  const [videoWidth, videoHeight] = await detectResolution(inputPath);
  console.log(`[Render] Input resolution: ${videoWidth}x${videoHeight}`);

  // ── Extract effects config from DNA ──
  const dnaEffects = cfg.dnaContent ? extractEffectsFromDna(cfg.dnaContent) : {};

  // ── Build video filter chain with all effects ──
  const effectsConfig: Partial<EffectsConfig> = {
    ...dnaEffects,
    colorProfile: (cfg.colorProfile as EffectsConfig["colorProfile"]) || dnaEffects.colorProfile || "neutral",
    clipDurationS,
    zoomEvents: zoomPlan?.events || [],
    videoWidth,
    videoHeight,
  };

  const videoFilter = buildVideoFilterChain(effectsConfig);
  const audioFilter = buildAudioFilterChain({ style: cfg.audioProfile });

  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .setStartTime(clip.start_s)
      .duration(clipDurationS)
      // Use outputOptions for filters to prevent fluent-ffmpeg from
      // splitting on commas (breaks zoompan's between() expressions)
      .outputOptions([
        "-filter:v", videoFilter,
        "-filter:a", audioFilter,
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
        console.log(`[Render] Effects: color=${effectsConfig.colorProfile}, vignette=${effectsConfig.vignette}, grain=${effectsConfig.filmGrain}, zooms=${zoomPlan?.events.length || 0}`);
        console.log(`[Render] Command: ${cmd}`);
      })
      .on("end", () => {
        console.log(`[Render] Clip ${clipIndex + 1} done: ${outputPath}`);
        resolve(outputPath);
      })
      .on("error", (err, stdout, stderr) => {
        console.error(`[Render] Clip ${clipIndex + 1} failed:`, err.message);
        console.error(`[Render] stderr:`, stderr);

        // Fallback: try without zoom (most likely cause of failure)
        if (zoomPlan && zoomPlan.events.length > 0) {
          console.log(`[Render] Retrying clip ${clipIndex + 1} without zoom...`);
          const simpleFilter = buildVideoFilterChain({
            ...effectsConfig,
            zoomEvents: [],
          });
          ffmpeg(inputPath)
            .setStartTime(clip.start_s)
            .duration(clipDurationS)
            .outputOptions([
              "-filter:v", simpleFilter,
              "-filter:a", audioFilter,
              "-c:v", "libx264",
              "-crf", String(cfg.crf),
              "-preset", "fast",
              "-c:a", "aac",
              "-b:a", "192k",
              "-movflags", "+faststart",
              "-pix_fmt", "yuv420p",
            ])
            .output(outputPath)
            .on("end", () => {
              console.log(`[Render] Clip ${clipIndex + 1} done (no zoom fallback): ${outputPath}`);
              resolve(outputPath);
            })
            .on("error", (err2) => {
              reject(new Error(`Render failed for clip ${clipIndex + 1}: ${err2.message}`));
            })
            .run();
        } else {
          reject(new Error(`Render failed for clip ${clipIndex + 1}: ${err.message}`));
        }
      })
      .run();
  });
}

function extractDnaFloat(dnaContent: string | undefined, key: string, defaultValue: number): number {
  if (!dnaContent) return defaultValue;
  const match = dnaContent.match(new RegExp(`${key}[:\\s]*([\\d.]+)`, "i"));
  return match ? parseFloat(match[1]) : defaultValue;
}
