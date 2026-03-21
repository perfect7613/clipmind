import ffmpeg from "fluent-ffmpeg";
import { promises as fs } from "fs";
import path from "path";
import os from "os";

export interface AudioExtractionResult {
  audioPath: string;
  duration_s: number;
}

/**
 * Extract audio from a video file as 16kHz mono WAV (optimal for STT).
 */
export async function extractAudio(
  videoPath: string,
  outputDir?: string
): Promise<AudioExtractionResult> {
  const dir = outputDir || path.join(os.tmpdir(), "clipmind");
  await fs.mkdir(dir, { recursive: true });

  const outputPath = path.join(dir, `audio_${Date.now()}.wav`);

  return new Promise((resolve, reject) => {
    ffmpeg(videoPath)
      .noVideo()
      .audioFrequency(16000)
      .audioChannels(1)
      .audioCodec("pcm_s16le")
      .format("wav")
      .output(outputPath)
      .on("end", async () => {
        // Get duration
        const duration = await getAudioDuration(outputPath);
        resolve({ audioPath: outputPath, duration_s: duration });
      })
      .on("error", (err) => {
        reject(new Error(`FFmpeg audio extraction failed: ${err.message}`));
      })
      .run();
  });
}

/**
 * Get audio duration in seconds using ffprobe.
 */
export function getAudioDuration(filePath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) {
        reject(new Error(`ffprobe failed: ${err.message}`));
        return;
      }
      resolve(metadata.format.duration || 0);
    });
  });
}

/**
 * Extract audio from multiple camera files for sync.
 */
export async function extractMultiCameraAudio(
  videoPaths: string[],
  outputDir?: string
): Promise<AudioExtractionResult[]> {
  return Promise.all(
    videoPaths.map((videoPath) => extractAudio(videoPath, outputDir))
  );
}
