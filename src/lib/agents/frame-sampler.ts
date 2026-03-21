import { z } from "zod";
import ffmpeg from "fluent-ffmpeg";
import { promises as fs } from "fs";
import path from "path";
import os from "os";

// Output schema
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

/**
 * Extract representative frames from a video for style analysis.
 * Uses scene change detection + 1fps sampling, then selects 20 most representative.
 */
export async function sampleFrames(
  videoPath: string,
  maxFrames: number = 20
): Promise<FrameSamplerResult> {
  const outputDir = path.join(os.tmpdir(), `clipmind-frames-${Date.now()}`);
  await fs.mkdir(outputDir, { recursive: true });

  // Get video duration
  const duration = await getVideoDuration(videoPath);

  // Step 1: Extract scene change frames
  const sceneFrames = await extractSceneChangeFrames(videoPath, outputDir);

  // Step 2: Extract 1fps sample frames
  const sampleRate = Math.max(1, Math.floor(duration / (maxFrames * 2)));
  const regularFrames = await extractRegularFrames(videoPath, outputDir, sampleRate);

  // Step 3: Merge and select top N frames, distributed across duration
  const allFrames = [...sceneFrames, ...regularFrames];
  const selected = selectRepresentativeFrames(allFrames, maxFrames, duration);

  return FrameSamplerResultSchema.parse({
    frames: selected,
    video_duration_s: duration,
    output_dir: outputDir,
  });
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
 * Extract frames at scene changes using FFmpeg scene detection.
 */
function extractSceneChangeFrames(
  videoPath: string,
  outputDir: string
): Promise<FrameSample[]> {
  return new Promise((resolve, reject) => {
    const frames: FrameSample[] = [];
    const prefix = "scene";

    ffmpeg(videoPath)
      .outputOptions([
        "-vf", "select='gt(scene,0.3)',showinfo",
        "-vsync", "vfr",
        "-q:v", "2",
      ])
      .output(path.join(outputDir, `${prefix}-%04d.jpg`))
      .on("stderr", (line: string) => {
        // Parse timestamp from showinfo filter output
        const match = line.match(/pts_time:(\d+\.?\d*)/);
        if (match) {
          const timestamp = parseFloat(match[1]);
          const frameNum = frames.length + 1;
          frames.push({
            path: path.join(outputDir, `${prefix}-${String(frameNum).padStart(4, "0")}.jpg`),
            timestamp_s: timestamp,
            is_scene_change: true,
          });
        }
      })
      .on("end", () => resolve(frames))
      .on("error", (err) => reject(new Error(`Scene detection failed: ${err.message}`)))
      .run();
  });
}

/**
 * Extract frames at regular intervals.
 */
function extractRegularFrames(
  videoPath: string,
  outputDir: string,
  intervalSeconds: number
): Promise<FrameSample[]> {
  return new Promise((resolve, reject) => {
    const prefix = "regular";

    ffmpeg(videoPath)
      .outputOptions([
        "-vf", `fps=1/${intervalSeconds}`,
        "-q:v", "2",
      ])
      .output(path.join(outputDir, `${prefix}-%04d.jpg`))
      .on("end", async () => {
        // List generated files and build frame list
        try {
          const files = await fs.readdir(outputDir);
          const regularFiles = files
            .filter((f) => f.startsWith(prefix) && f.endsWith(".jpg"))
            .sort();

          const frames: FrameSample[] = regularFiles.map((file, i) => ({
            path: path.join(outputDir, file),
            timestamp_s: i * intervalSeconds,
            is_scene_change: false,
          }));

          resolve(frames);
        } catch (err) {
          resolve([]);
        }
      })
      .on("error", (err) => reject(new Error(`Regular frame extraction failed: ${err.message}`)))
      .run();
  });
}

/**
 * Select N representative frames distributed evenly across the video duration.
 * Prioritizes scene change frames, fills gaps with regular frames.
 */
function selectRepresentativeFrames(
  allFrames: FrameSample[],
  maxFrames: number,
  duration: number
): FrameSample[] {
  if (allFrames.length <= maxFrames) return allFrames;

  // Deduplicate by proximity (within 1 second)
  const deduped: FrameSample[] = [];
  const sorted = [...allFrames].sort((a, b) => a.timestamp_s - b.timestamp_s);

  for (const frame of sorted) {
    const tooClose = deduped.some(
      (f) => Math.abs(f.timestamp_s - frame.timestamp_s) < 1.0
    );
    if (!tooClose) {
      deduped.push(frame);
    } else if (frame.is_scene_change) {
      // Prefer scene change frames over regular ones
      const closeIdx = deduped.findIndex(
        (f) => Math.abs(f.timestamp_s - frame.timestamp_s) < 1.0 && !f.is_scene_change
      );
      if (closeIdx !== -1) {
        deduped[closeIdx] = frame;
      }
    }
  }

  if (deduped.length <= maxFrames) return deduped;

  // Divide duration into N buckets, pick best frame per bucket
  const bucketSize = duration / maxFrames;
  const selected: FrameSample[] = [];

  for (let i = 0; i < maxFrames; i++) {
    const bucketStart = i * bucketSize;
    const bucketEnd = (i + 1) * bucketSize;
    const candidates = deduped.filter(
      (f) => f.timestamp_s >= bucketStart && f.timestamp_s < bucketEnd
    );

    if (candidates.length > 0) {
      // Prefer scene change frames within the bucket
      const sceneFrame = candidates.find((f) => f.is_scene_change);
      selected.push(sceneFrame || candidates[0]);
    }
  }

  return selected;
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
