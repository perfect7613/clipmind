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
 * Render Agent 3: Combine edited-video.mp4 with captions.
 * For the prototype, we keep it simple:
 * - If captions exist: burn them in with the ASS filter
 * - Animations and B-roll overlays are skipped for now (complex filter_complex)
 *   They'll be added when Remotion rendering is working.
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

  // If no captions and no overlays, just copy the file
  if (!captionAssPath && animations.length === 0 && brollInsertions.length === 0) {
    await fs.copyFile(editedVideoPath, outputPath);
    return outputPath;
  }

  return new Promise((resolve, reject) => {
    let cmd = ffmpeg(editedVideoPath);

    // Build output options
    const outputOpts = [
      "-c:v", "libx264",
      "-crf", String(cfg.crf),
      "-preset", "fast",
      "-c:a", "aac",
      "-b:a", cfg.audioBitrate,
      "-movflags", "+faststart",
      "-pix_fmt", "yuv420p",
    ];

    // Burn in captions using the ASS subtitle filter
    if (captionAssPath) {
      // FFmpeg ass filter: escape colons and backslashes in path
      const escapedPath = captionAssPath
        .replace(/\\/g, "/")
        .replace(/:/g, "\\\\:");
      outputOpts.push("-vf", `ass=${escapedPath}`);
    }

    cmd
      .outputOptions(outputOpts)
      .output(outputPath)
      .on("start", (cmdLine) => {
        console.log("[RenderFinal] Command:", cmdLine);
      })
      .on("end", () => {
        console.log("[RenderFinal] Done:", outputPath);
        resolve(outputPath);
      })
      .on("error", (err, stdout, stderr) => {
        console.error("[RenderFinal] Failed:", err.message);
        console.error("[RenderFinal] stderr:", stderr);
        reject(new Error(`Final render failed: ${err.message}`));
      })
      .run();
  });
}
