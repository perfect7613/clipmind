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

const DEFAULT_CONFIG: RenderFinalConfig = { crf: 18, audioBitrate: "320k" };

/**
 * Render Agent 3: Combine edited-video.mp4 with animations, B-roll, and captions.
 * Produces the final YouTube-ready MP4.
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
  const outputPath = path.join(dir, "final-video.mp4");

  // Build FFmpeg command
  const inputFiles = [editedVideoPath];
  const filterParts: string[] = [];
  let currentLabel = "[0:v]";
  let overlayIndex = 1;

  // Add animation overlay inputs
  for (const anim of animations) {
    inputFiles.push(anim.filePath);
    const inputIdx = overlayIndex;
    const outLabel = `[v${overlayIndex}]`;
    filterParts.push(
      `${currentLabel}[${inputIdx}:v]overlay=0:0:enable='between(t,${anim.timestamp_s},${anim.timestamp_s + anim.duration_s})'${outLabel}`
    );
    currentLabel = outLabel;
    overlayIndex++;
  }

  // Add B-roll overlay inputs (download first if needed)
  for (const broll of brollInsertions) {
    // For local files or already-downloaded B-roll
    if (broll.clip_url.startsWith("/") || broll.clip_url.startsWith("file://")) {
      inputFiles.push(broll.clip_url.replace("file://", ""));
      const inputIdx = overlayIndex;
      const outLabel = `[v${overlayIndex}]`;
      filterParts.push(
        `${currentLabel}[${inputIdx}:v]overlay=0:0:enable='between(t,${broll.timestamp_s},${broll.timestamp_s + broll.duration_s})'${outLabel}`
      );
      currentLabel = outLabel;
      overlayIndex++;
    }
  }

  // Caption burn-in via ASS filter
  if (captionAssPath) {
    const escapedPath = captionAssPath.replace(/\\/g, "/").replace(/:/g, "\\:");
    const outLabel = `[vcap]`;
    filterParts.push(`${currentLabel}ass='${escapedPath}'${outLabel}`);
    currentLabel = outLabel;
  }

  // Final label
  if (filterParts.length > 0) {
    // Rename last label to [vout]
    const lastFilter = filterParts[filterParts.length - 1];
    const lastLabel = currentLabel;
    if (lastLabel !== "[vout]") {
      filterParts[filterParts.length - 1] = lastFilter.replace(
        new RegExp(`\\${lastLabel.replace("[", "\\[").replace("]", "\\]")}$`),
        "[vout]"
      );
    }
  }

  return new Promise((resolve, reject) => {
    let cmd = ffmpeg();

    for (const input of inputFiles) {
      cmd = cmd.input(input);
    }

    if (filterParts.length > 0) {
      cmd = cmd
        .complexFilter(filterParts.join(";\n"))
        .outputOptions(["-map", "[vout]", "-map", "0:a"]);
    } else if (captionAssPath) {
      // Just captions, no overlays
      cmd = cmd.videoFilters(`ass='${captionAssPath.replace(/\\/g, "/").replace(/:/g, "\\:")}'`);
    }

    cmd
      .outputOptions([
        "-c:v", "libx264",
        "-crf", String(cfg.crf),
        "-preset", "medium",
        "-c:a", "aac",
        "-b:a", cfg.audioBitrate,
        "-movflags", "+faststart",
      ])
      .output(outputPath)
      .on("end", () => resolve(outputPath))
      .on("error", (err) => reject(new Error(`Final render failed: ${err.message}`)))
      .run();
  });
}
