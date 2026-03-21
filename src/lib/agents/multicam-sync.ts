import ffmpeg from "fluent-ffmpeg";
import { promises as fs } from "fs";
import path from "path";
import os from "os";
import { z } from "zod";

export const SyncResultSchema = z.object({
  offset_s: z.number(),
  confidence: z.enum(["high", "manual_review"]),
  measurements: z.array(z.number()),
});

export type SyncResult = z.infer<typeof SyncResultSchema>;

/**
 * Phase 1: Silence pattern matching.
 * Extract audio energy envelopes from both cameras and find the offset
 * by matching silence patterns (pauses happen at the same real-world time).
 */
async function phase1SilencePatternMatch(
  audio1Path: string,
  audio2Path: string
): Promise<number> {
  // Extract silence timestamps from both files
  const silences1 = await detectSilences(audio1Path);
  const silences2 = await detectSilences(audio2Path);

  if (silences1.length < 3 || silences2.length < 3) {
    return 0; // Not enough data for pattern matching
  }

  // Compute inter-silence intervals for both
  const intervals1 = computeIntervals(silences1);
  const intervals2 = computeIntervals(silences2);

  // Find best offset by sliding window correlation of intervals
  let bestOffset = 0;
  let bestScore = -Infinity;

  // Try offsets from -300s to +300s in 0.5s steps
  for (let offset = -300; offset <= 300; offset += 0.5) {
    let score = 0;
    let matches = 0;

    for (const s1 of silences1) {
      const targetTime = s1.start + offset;
      // Find closest silence in camera 2
      const closest = silences2.reduce((prev, curr) =>
        Math.abs(curr.start - targetTime) < Math.abs(prev.start - targetTime) ? curr : prev
      );
      const diff = Math.abs(closest.start - targetTime);
      if (diff < 2.0) {
        score += 1 / (1 + diff);
        matches++;
      }
    }

    if (score > bestScore && matches >= 3) {
      bestScore = score;
      bestOffset = offset;
    }
  }

  return bestOffset;
}

/**
 * Phase 2: Waveform cross-correlation.
 * Extract 5-second audio chunks at 3 distributed points and cross-correlate
 * for sub-frame precision.
 */
async function phase2CrossCorrelation(
  audio1Path: string,
  audio2Path: string,
  roughOffset: number,
  duration1: number
): Promise<{ offset: number; measurements: number[] }> {
  // Pick 3 distributed points
  const points = [
    duration1 * 0.2,
    duration1 * 0.5,
    duration1 * 0.8,
  ];

  const measurements: number[] = [];
  const chunkDuration = 5; // 5-second chunks

  for (const point of points) {
    // Extract chunks from both audio files
    const chunk1Path = path.join(os.tmpdir(), `chunk1-${Date.now()}-${point}.raw`);
    const chunk2Path = path.join(os.tmpdir(), `chunk2-${Date.now()}-${point}.raw`);

    const chunk2Start = point + roughOffset;

    await extractRawChunk(audio1Path, point, chunkDuration, chunk1Path);
    await extractRawChunk(audio2Path, chunk2Start, chunkDuration, chunk2Path);

    // Read raw PCM data
    const data1 = await readPcmSamples(chunk1Path);
    const data2 = await readPcmSamples(chunk2Path);

    // Cross-correlate
    const offset = crossCorrelate(data1, data2, 16000); // 16kHz sample rate
    measurements.push(roughOffset + offset);

    // Cleanup
    await fs.unlink(chunk1Path).catch(() => {});
    await fs.unlink(chunk2Path).catch(() => {});
  }

  // Average the measurements
  const avgOffset = measurements.reduce((a, b) => a + b, 0) / measurements.length;

  return { offset: avgOffset, measurements };
}

/**
 * Full 2-phase sync pipeline.
 */
export async function syncCameras(
  video1Path: string,
  video2Path: string
): Promise<SyncResult> {
  // Extract audio from both
  const tmpDir = path.join(os.tmpdir(), `clipmind-sync-${Date.now()}`);
  await fs.mkdir(tmpDir, { recursive: true });

  const audio1 = path.join(tmpDir, "audio1.wav");
  const audio2 = path.join(tmpDir, "audio2.wav");

  await extractMonoAudio(video1Path, audio1);
  await extractMonoAudio(video2Path, audio2);

  const duration1 = await getAudioDuration(audio1);

  // Phase 1
  const roughOffset = await phase1SilencePatternMatch(audio1, audio2);

  // Phase 2
  const { offset, measurements } = await phase2CrossCorrelation(
    audio1, audio2, roughOffset, duration1
  );

  // Check if measurements agree within 0.04s (1 frame at 25fps)
  const maxDeviation = Math.max(...measurements.map((m) => Math.abs(m - offset)));
  const confidence = maxDeviation <= 0.04 ? "high" as const : "manual_review" as const;

  // Cleanup
  await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});

  return SyncResultSchema.parse({
    offset_s: Math.round(offset * 1000) / 1000,
    confidence,
    measurements: measurements.map((m) => Math.round(m * 1000) / 1000),
  });
}

// ── Helpers ────────────────────────────────────────────────────────────────────

interface Silence { start: number; end: number; duration: number }

function detectSilences(audioPath: string): Promise<Silence[]> {
  return new Promise((resolve, reject) => {
    const silences: Silence[] = [];
    let currentStart: number | null = null;

    ffmpeg(audioPath)
      .audioFilters("silencedetect=n=-30dB:d=0.5")
      .format("null")
      .output("-")
      .on("stderr", (line: string) => {
        const startMatch = line.match(/silence_start:\s*([\d.]+)/);
        const endMatch = line.match(/silence_end:\s*([\d.]+)\s*\|\s*silence_duration:\s*([\d.]+)/);

        if (startMatch) currentStart = parseFloat(startMatch[1]);
        if (endMatch && currentStart !== null) {
          silences.push({
            start: currentStart,
            end: parseFloat(endMatch[1]),
            duration: parseFloat(endMatch[2]),
          });
          currentStart = null;
        }
      })
      .on("end", () => resolve(silences))
      .on("error", (err) => reject(new Error(`Silence detection failed: ${err.message}`)))
      .run();
  });
}

function computeIntervals(silences: Silence[]): number[] {
  const intervals: number[] = [];
  for (let i = 1; i < silences.length; i++) {
    intervals.push(silences[i].start - silences[i - 1].start);
  }
  return intervals;
}

function extractMonoAudio(videoPath: string, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    ffmpeg(videoPath)
      .noVideo()
      .audioFrequency(16000)
      .audioChannels(1)
      .audioCodec("pcm_s16le")
      .output(outputPath)
      .on("end", () => resolve())
      .on("error", (err) => reject(new Error(`Audio extraction failed: ${err.message}`)))
      .run();
  });
}

function extractRawChunk(
  audioPath: string,
  startS: number,
  durationS: number,
  outputPath: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    ffmpeg(audioPath)
      .setStartTime(startS)
      .duration(durationS)
      .audioCodec("pcm_s16le")
      .audioFrequency(16000)
      .audioChannels(1)
      .format("s16le")
      .output(outputPath)
      .on("end", () => resolve())
      .on("error", (err) => reject(new Error(`Chunk extraction failed: ${err.message}`)))
      .run();
  });
}

async function readPcmSamples(filePath: string): Promise<Float32Array> {
  const buffer = await fs.readFile(filePath);
  const samples = new Float32Array(buffer.length / 2);
  for (let i = 0; i < samples.length; i++) {
    samples[i] = buffer.readInt16LE(i * 2) / 32768;
  }
  return samples;
}

function crossCorrelate(
  signal1: Float32Array,
  signal2: Float32Array,
  sampleRate: number
): number {
  const maxLag = Math.min(sampleRate * 2, signal1.length, signal2.length); // ±2 seconds
  let bestLag = 0;
  let bestCorr = -Infinity;

  for (let lag = -maxLag; lag <= maxLag; lag += 1) {
    let sum = 0;
    let count = 0;
    for (let i = 0; i < signal1.length; i++) {
      const j = i + lag;
      if (j >= 0 && j < signal2.length) {
        sum += signal1[i] * signal2[j];
        count++;
      }
    }
    const corr = count > 0 ? sum / count : 0;
    if (corr > bestCorr) {
      bestCorr = corr;
      bestLag = lag;
    }
  }

  return bestLag / sampleRate;
}

function getAudioDuration(audioPath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(audioPath, (err, metadata) => {
      if (err) return reject(err);
      resolve(metadata.format.duration || 0);
    });
  });
}
