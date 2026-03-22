import ffmpeg from "fluent-ffmpeg";
import { promises as fs } from "fs";
import path from "path";
import os from "os";

export interface BeatMarker {
  timeS: number;
  energy: number; // 0-1 normalized
}

export interface BeatDetectionConfig {
  energyThreshold: number;   // 0-1 (default 0.6)
  minBeatSpacingMs: number;  // minimum gap between beats (default 250)
}

const DEFAULT_CONFIG: BeatDetectionConfig = {
  energyThreshold: 0.6,
  minBeatSpacingMs: 250,
};

/**
 * Detect beats in an audio file using FFmpeg for extraction + JS peak detection.
 *
 * 1. Extract mono 22050Hz 16-bit PCM WAV via fluent-ffmpeg
 * 2. Parse WAV header to locate sample data
 * 3. Calculate RMS energy per window (1024 samples ~ 46ms at 22050Hz)
 * 4. Smooth the energy envelope (moving average)
 * 5. Find local maxima above threshold with minimum spacing
 */
export async function detectBeats(
  audioPath: string,
  config?: Partial<BeatDetectionConfig>
): Promise<BeatMarker[]> {
  const cfg: BeatDetectionConfig = { ...DEFAULT_CONFIG, ...config };

  const tmpDir = path.join(os.tmpdir(), "clipmind-beats");
  await fs.mkdir(tmpDir, { recursive: true });
  const wavPath = path.join(tmpDir, `beats_${Date.now()}.wav`);

  try {
    // Step 1: Extract filtered mono WAV
    await extractFilteredWav(audioPath, wavPath);

    // Step 2: Read WAV and parse samples
    const wavBuffer = await fs.readFile(wavPath);
    const samples = parseWavSamples(wavBuffer);

    if (samples.length === 0) return [];

    const sampleRate = 22050;
    const windowSize = 1024; // ~46ms per window

    // Step 3: Calculate RMS energy per window
    const energyEnvelope = computeRmsEnvelope(samples, windowSize);

    // Step 4: Smooth envelope (moving average, window=5)
    const smoothed = smoothEnvelope(energyEnvelope, 5);

    // Step 5: Find peaks
    const beats = findPeaks(
      smoothed,
      windowSize,
      sampleRate,
      cfg.energyThreshold,
      cfg.minBeatSpacingMs
    );

    return beats;
  } finally {
    // Cleanup temp file
    try { await fs.unlink(wavPath); } catch { /* ignore */ }
  }
}

// ---------------------------------------------------------------------------
// FFmpeg extraction: mono 22050Hz with bandpass filter for beat-relevant freqs
// ---------------------------------------------------------------------------

function extractFilteredWav(inputPath: string, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .noVideo()
      .audioFilters(["highpass=f=60", "lowpass=f=8000"])
      .audioFrequency(22050)
      .audioChannels(1)
      .audioCodec("pcm_s16le")
      .format("wav")
      .output(outputPath)
      .on("end", () => resolve())
      .on("error", (err) => {
        reject(new Error(`FFmpeg beat extraction failed: ${err.message}`));
      })
      .run();
  });
}

// ---------------------------------------------------------------------------
// WAV parsing — extract Int16 sample data from a standard PCM WAV
// ---------------------------------------------------------------------------

function parseWavSamples(buffer: Buffer): Float32Array {
  // Find "data" subchunk
  let dataOffset = -1;
  let dataSize = 0;

  for (let i = 0; i < buffer.length - 8; i++) {
    if (
      buffer[i] === 0x64 &&     // 'd'
      buffer[i + 1] === 0x61 && // 'a'
      buffer[i + 2] === 0x74 && // 't'
      buffer[i + 3] === 0x61    // 'a'
    ) {
      dataSize = buffer.readUInt32LE(i + 4);
      dataOffset = i + 8;
      break;
    }
  }

  if (dataOffset < 0) return new Float32Array(0);

  const numSamples = Math.min(
    Math.floor(dataSize / 2),
    Math.floor((buffer.length - dataOffset) / 2)
  );
  const samples = new Float32Array(numSamples);

  for (let i = 0; i < numSamples; i++) {
    const raw = buffer.readInt16LE(dataOffset + i * 2);
    samples[i] = raw / 32768; // normalize to -1..1
  }

  return samples;
}

// ---------------------------------------------------------------------------
// RMS energy envelope
// ---------------------------------------------------------------------------

function computeRmsEnvelope(samples: Float32Array, windowSize: number): Float32Array {
  const numWindows = Math.floor(samples.length / windowSize);
  const envelope = new Float32Array(numWindows);

  for (let w = 0; w < numWindows; w++) {
    let sum = 0;
    const offset = w * windowSize;
    for (let i = 0; i < windowSize; i++) {
      const s = samples[offset + i];
      sum += s * s;
    }
    envelope[w] = Math.sqrt(sum / windowSize);
  }

  return envelope;
}

// ---------------------------------------------------------------------------
// Smoothing (moving average)
// ---------------------------------------------------------------------------

function smoothEnvelope(envelope: Float32Array, windowSize: number): Float32Array {
  const smoothed = new Float32Array(envelope.length);
  const half = Math.floor(windowSize / 2);

  for (let i = 0; i < envelope.length; i++) {
    let sum = 0;
    let count = 0;
    for (let j = i - half; j <= i + half; j++) {
      if (j >= 0 && j < envelope.length) {
        sum += envelope[j];
        count++;
      }
    }
    smoothed[i] = sum / count;
  }

  return smoothed;
}

// ---------------------------------------------------------------------------
// Peak detection
// ---------------------------------------------------------------------------

function findPeaks(
  envelope: Float32Array,
  windowSize: number,
  sampleRate: number,
  threshold: number,
  minSpacingMs: number
): BeatMarker[] {
  if (envelope.length === 0) return [];

  // Find the maximum energy for normalization
  let maxEnergy = 0;
  for (let i = 0; i < envelope.length; i++) {
    if (envelope[i] > maxEnergy) maxEnergy = envelope[i];
  }

  if (maxEnergy === 0) return [];

  // Normalize
  const normalized = new Float32Array(envelope.length);
  for (let i = 0; i < envelope.length; i++) {
    normalized[i] = envelope[i] / maxEnergy;
  }

  // Find local maxima above threshold
  const candidates: BeatMarker[] = [];
  const secondsPerWindow = windowSize / sampleRate;

  for (let i = 1; i < normalized.length - 1; i++) {
    const val = normalized[i];
    if (
      val >= threshold &&
      val >= normalized[i - 1] &&
      val >= normalized[i + 1]
    ) {
      candidates.push({
        timeS: round(i * secondsPerWindow, 3),
        energy: round(val, 3),
      });
    }
  }

  // Enforce minimum spacing
  const beats: BeatMarker[] = [];
  const minSpacingS = minSpacingMs / 1000;

  for (const candidate of candidates) {
    const last = beats[beats.length - 1];
    if (!last || candidate.timeS - last.timeS >= minSpacingS) {
      beats.push(candidate);
    } else if (candidate.energy > last.energy) {
      // Replace last beat if this one has more energy
      beats[beats.length - 1] = candidate;
    }
  }

  return beats;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function round(n: number, decimals: number): number {
  const f = Math.pow(10, decimals);
  return Math.round(n * f) / f;
}
