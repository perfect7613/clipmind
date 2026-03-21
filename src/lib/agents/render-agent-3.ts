import ffmpeg from "fluent-ffmpeg";
import path from "path";
import os from "os";
import { promises as fs } from "fs";
import type { RenderedAnimation } from "./remotion-renderer";
import type { BrollInsertion } from "./broll-matcher";

interface RenderFinalConfig {
  crf: number;
  audioBitrate: string;
}

const DEFAULT_CONFIG: RenderFinalConfig = { crf: 22, audioBitrate: "192k" };

/**
 * Render Agent 3: Composite the final video.
 * - Overlays transparent Remotion animation clips at their timestamps
 * - Burns in ASS captions
 * - Preserves original audio from the edited clip
 */
export async function renderFinal(
  editedVideoPath: string,
  captionAssPath: string | null,
  animations: RenderedAnimation[],
  brollInsertions: BrollInsertion[],
  outputDir?: string,
  config: Partial<RenderFinalConfig> = {}
): Promise<string> {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const dir = outputDir || path.join(os.tmpdir(), `clipmind-final-${Date.now()}`);
  await fs.mkdir(dir, { recursive: true });
  const outputPath = path.join(dir, `final-${Date.now()}.mp4`);

  // If nothing to overlay, just copy
  if (!captionAssPath && animations.length === 0 && brollInsertions.length === 0) {
    await fs.copyFile(editedVideoPath, outputPath);
    return outputPath;
  }

  // For the prototype: captions only (animations overlay is complex filter_complex)
  // If we have animations, overlay them first, then burn captions
  if (animations.length > 0) {
    // Step 1: Overlay animations using filter_complex
    const animOverlayPath = path.join(dir, `with-animations-${Date.now()}.mp4`);
    await overlayAnimations(editedVideoPath, animations, animOverlayPath, cfg);

    // Step 2: Burn captions on top if present
    if (captionAssPath) {
      await burnCaptions(animOverlayPath, captionAssPath, outputPath, cfg);
    } else {
      await fs.rename(animOverlayPath, outputPath);
    }
  } else if (captionAssPath) {
    // Only captions, no animations
    await burnCaptions(editedVideoPath, captionAssPath, outputPath, cfg);
  }

  return outputPath;
}

/**
 * Overlay transparent WebM animation clips onto the video at their timestamps.
 */
function overlayAnimations(
  videoPath: string,
  animations: RenderedAnimation[],
  outputPath: string,
  cfg: RenderFinalConfig
): Promise<void> {
  return new Promise((resolve, reject) => {
    const cmd = ffmpeg(videoPath);

    // Add each animation as an input
    for (const anim of animations) {
      cmd.input(anim.filePath);
    }

    // Build filter_complex chain
    // Each animation overlays on top of the previous result at its timestamp
    const filters: string[] = [];
    let currentLabel = "[0:v]";

    for (let i = 0; i < animations.length; i++) {
      const anim = animations[i];
      const inputIdx = i + 1; // input 0 is the base video
      const startTime = anim.timestamp_s;
      const endTime = anim.timestamp_s + anim.duration_s;
      const outputLabel = i === animations.length - 1 ? "[vout]" : `[v${i}]`;

      filters.push(
        `${currentLabel}[${inputIdx}:v]overlay=0:0:enable='between(t,${startTime},${endTime})'${outputLabel}`
      );
      currentLabel = outputLabel;
    }

    const filterComplex = filters.join(";");

    cmd
      .outputOptions([
        "-filter_complex", filterComplex,
        "-map", "[vout]",
        "-map", "0:a?",
        "-c:v", "libx264",
        "-crf", String(cfg.crf),
        "-preset", "fast",
        "-c:a", "aac",
        "-b:a", cfg.audioBitrate,
        "-movflags", "+faststart",
        "-pix_fmt", "yuv420p",
      ])
      .output(outputPath)
      .on("start", (cmdLine) => {
        console.log("[RenderFinal] Overlay command:", cmdLine);
      })
      .on("end", () => {
        console.log("[RenderFinal] Overlay done:", outputPath);
        resolve();
      })
      .on("error", (err, stdout, stderr) => {
        console.error("[RenderFinal] Overlay failed:", err.message);
        console.error("[RenderFinal] stderr:", stderr);
        reject(new Error(`Animation overlay failed: ${err.message}`));
      })
      .run();
  });
}

/**
 * Burn ASS captions onto the video.
 */
function burnCaptions(
  videoPath: string,
  captionAssPath: string,
  outputPath: string,
  cfg: RenderFinalConfig
): Promise<void> {
  return new Promise((resolve, reject) => {
    const escapedPath = captionAssPath
      .replace(/\\/g, "/")
      .replace(/:/g, "\\\\:");

    ffmpeg(videoPath)
      .outputOptions([
        "-c:v", "libx264",
        "-crf", String(cfg.crf),
        "-preset", "fast",
        "-c:a", "aac",
        "-b:a", cfg.audioBitrate,
        "-movflags", "+faststart",
        "-pix_fmt", "yuv420p",
        "-vf", `ass=${escapedPath}`,
      ])
      .output(outputPath)
      .on("start", (cmdLine) => {
        console.log("[RenderFinal] Caption command:", cmdLine);
      })
      .on("end", () => {
        console.log("[RenderFinal] Captions done:", outputPath);
        resolve();
      })
      .on("error", (err, stdout, stderr) => {
        console.error("[RenderFinal] Captions failed:", err.message);
        console.error("[RenderFinal] stderr:", stderr);
        reject(new Error(`Caption burn failed: ${err.message}`));
      })
      .run();
  });
}
