import ffmpeg from "fluent-ffmpeg";
import { promises as fs } from "fs";
import path from "path";

/**
 * Extract video frame thumbnails at 1-second intervals.
 * Used by the timeline editor to show a visual thumbnail strip.
 */
export async function extractThumbnails(
  videoPath: string,
  outputDir: string,
  fps: number = 1
): Promise<string> {
  // Use video filename as subdirectory to avoid conflicts between clips
  const videoName = path.basename(videoPath, path.extname(videoPath));
  const thumbDir = path.join(outputDir, `thumbnails-${videoName}`);
  await fs.mkdir(thumbDir, { recursive: true });

  return new Promise((resolve, reject) => {
    ffmpeg(videoPath)
      .outputOptions([
        "-vf", `fps=${fps},scale=160:-1`,
        "-q:v", "5",
      ])
      .output(path.join(thumbDir, "thumb-%04d.jpg"))
      .on("end", () => {
        console.log(`[Thumbnails] Extracted to ${thumbDir}`);
        resolve(thumbDir);
      })
      .on("error", (err) => {
        console.error("[Thumbnails] Extraction failed:", err.message);
        reject(new Error(`Thumbnail extraction failed: ${err.message}`));
      })
      .run();
  });
}

/**
 * Extract audio track from video for waveform rendering.
 */
export async function extractAudioForWaveform(
  videoPath: string,
  outputDir: string
): Promise<string> {
  const audioPath = path.join(outputDir, "waveform-audio.mp3");

  return new Promise((resolve, reject) => {
    ffmpeg(videoPath)
      .noVideo()
      .audioCodec("libmp3lame")
      .audioBitrate("64k")
      .audioChannels(1)
      .output(audioPath)
      .on("end", () => {
        console.log(`[Audio] Extracted for waveform: ${audioPath}`);
        resolve(audioPath);
      })
      .on("error", (err) => {
        console.error("[Audio] Extraction failed:", err.message);
        reject(new Error(`Audio extraction failed: ${err.message}`));
      })
      .run();
  });
}

/**
 * List thumbnail files in a directory, sorted.
 */
export async function listThumbnails(thumbDir: string): Promise<string[]> {
  try {
    const files = await fs.readdir(thumbDir);
    return files
      .filter((f) => f.endsWith(".jpg"))
      .sort()
      .map((f) => path.join(thumbDir, f));
  } catch {
    return [];
  }
}
