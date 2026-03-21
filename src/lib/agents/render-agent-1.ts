import ffmpeg from "fluent-ffmpeg";
import path from "path";
import os from "os";
import { promises as fs } from "fs";
import type { SelectedClip } from "./clip-selector";
import { buildColorFilterChain, type ColorProfile } from "./color-correction";
import { buildAudioFilterChain, type AudioProfile } from "./audio-mastering";
import type { ZoomEvent } from "./zoom-planner";

interface RenderSegment {
  start_s: number;
  end_s: number;
  sourceIndex: number;        // 0 or 1 for multi-cam
  zoom?: { crop: string; scale: string };
}

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
  crf: 18,
};

/**
 * Build and execute the FFmpeg filter_complex for Skill 1.
 * Compiles all operations (trim, zoom, color, audio) into one render pass.
 */
export async function renderSkill1(
  inputPaths: string[],
  segments: RenderSegment[],
  outputDir?: string,
  config: Partial<RenderConfig> = {}
): Promise<string> {
  const cfg = { ...DEFAULT_RENDER_CONFIG, ...config };
  const dir = outputDir || path.join(os.tmpdir(), `clipmind-render-${Date.now()}`);
  await fs.mkdir(dir, { recursive: true });
  const outputPath = path.join(dir, "edited-video.mp4");

  const colorFilter = buildColorFilterChain(cfg.colorProfile);
  const audioFilter = buildAudioFilterChain({ style: cfg.audioProfile });

  // Build filter_complex
  const filterParts: string[] = [];
  const videoLabels: string[] = [];
  const audioLabels: string[] = [];

  segments.forEach((seg, i) => {
    const src = seg.sourceIndex;
    const trim = `trim=start=${seg.start_s.toFixed(3)}:end=${seg.end_s.toFixed(3)},setpts=PTS-STARTPTS`;
    const atrim = `atrim=start=${seg.start_s.toFixed(3)}:end=${seg.end_s.toFixed(3)},asetpts=PTS-STARTPTS`;

    // Video: trim → zoom/crop → color → scale → fps
    let videoChain = `[${src}:v]${trim}`;
    if (seg.zoom) {
      videoChain += `,${seg.zoom.crop},${seg.zoom.scale}`;
    }
    if (colorFilter !== "null") {
      videoChain += `,${colorFilter}`;
    }
    videoChain += `,fps=${cfg.fps},setsar=1:1[v${i}]`;
    filterParts.push(videoChain);

    // Audio: trim → master
    filterParts.push(`[${src}:a]${atrim},${audioFilter}[a${i}]`);

    videoLabels.push(`[v${i}]`);
    audioLabels.push(`[a${i}]`);
  });

  // Concat
  if (segments.length > 0) {
    filterParts.push(
      `${videoLabels.join("")}concat=n=${segments.length}:v=1:a=0[vout]`
    );
    filterParts.push(
      `${audioLabels.join("")}concat=n=${segments.length}:v=0:a=1[aout]`
    );
  }

  const filterComplex = filterParts.join(";\n");

  // Execute FFmpeg
  return new Promise((resolve, reject) => {
    let cmd = ffmpeg();

    // Add all inputs
    for (const inputPath of inputPaths) {
      cmd = cmd.input(inputPath);
    }

    cmd
      .complexFilter(filterComplex)
      .outputOptions([
        "-map", "[vout]",
        "-map", "[aout]",
        "-c:v", "libx264",
        "-crf", String(cfg.crf),
        "-preset", "medium",
        "-c:a", "aac",
        "-b:a", "320k",
        "-movflags", "+faststart",
      ])
      .output(outputPath)
      .on("end", () => resolve(outputPath))
      .on("error", (err) => reject(new Error(`Render failed: ${err.message}`)))
      .run();
  });
}

/**
 * Build render segments from selected clips + zoom events.
 * Maps each clip's time range to segments with zoom crop data.
 */
export function buildRenderSegments(
  clips: SelectedClip[],
  zoomCrops: { start_s: number; end_s: number; crop: string; scale: string }[],
  sourceIndex: number = 0
): RenderSegment[] {
  const segments: RenderSegment[] = [];

  for (const clip of clips) {
    // Find zoom crops that overlap with this clip
    const overlapping = zoomCrops.filter(
      (z) => z.start_s < clip.end_s && z.end_s > clip.start_s
    );

    if (overlapping.length === 0) {
      // No zoom data — render as single segment
      segments.push({
        start_s: clip.start_s,
        end_s: clip.end_s,
        sourceIndex,
      });
    } else {
      // Split clip into zoom segments
      for (const zoom of overlapping) {
        const segStart = Math.max(clip.start_s, zoom.start_s);
        const segEnd = Math.min(clip.end_s, zoom.end_s);
        if (segEnd > segStart) {
          segments.push({
            start_s: segStart,
            end_s: segEnd,
            sourceIndex,
            zoom: { crop: zoom.crop, scale: zoom.scale },
          });
        }
      }
    }
  }

  return segments.sort((a, b) => a.start_s - b.start_s);
}
