import { exec } from "child_process";
import { promisify } from "util";
import { getAudioDuration } from "@/lib/ffmpeg/extract";

const execAsync = promisify(exec);

export interface AudioAnalysis {
  integratedLoudness: number;     // LUFS
  truePeak: number;               // dBTP
  loudnessRange: number;          // LRA
  silenceSegments: Array<{ start_s: number; end_s: number; duration_s: number }>;
  avgPauseDuration: number;       // seconds
  pauseFrequency: number;         // pauses per minute
  speechRatio: number;            // 0-1 (speech time / total time)
  energyProfile: "low" | "medium" | "high" | "dynamic";
}

/**
 * Extract audio features from a WAV file using FFmpeg loudnorm + silencedetect.
 * All parsing is regex-based on FFmpeg stderr output.
 */
export async function analyzeAudio(audioPath: string): Promise<AudioAnalysis> {
  const [loudness, silenceSegments, duration] = await Promise.all([
    measureLoudness(audioPath),
    detectSilence(audioPath),
    getAudioDuration(audioPath),
  ]);

  const totalSilence = silenceSegments.reduce((sum, s) => sum + s.duration_s, 0);
  const speechRatio = duration > 0 ? Math.max(0, Math.min(1, (duration - totalSilence) / duration)) : 1;
  const pauseFrequency = duration > 0 ? (silenceSegments.length / (duration / 60)) : 0;
  const avgPauseDuration = silenceSegments.length > 0
    ? totalSilence / silenceSegments.length
    : 0;

  const energyProfile = classifyEnergy(loudness.integratedLoudness, loudness.loudnessRange);

  return {
    integratedLoudness: loudness.integratedLoudness,
    truePeak: loudness.truePeak,
    loudnessRange: loudness.loudnessRange,
    silenceSegments,
    avgPauseDuration: round(avgPauseDuration, 2),
    pauseFrequency: round(pauseFrequency, 2),
    speechRatio: round(speechRatio, 3),
    energyProfile,
  };
}

// ---------------------------------------------------------------------------
// Loudness measurement via loudnorm filter
// ---------------------------------------------------------------------------

interface LoudnessResult {
  integratedLoudness: number;
  truePeak: number;
  loudnessRange: number;
}

async function measureLoudness(audioPath: string): Promise<LoudnessResult> {
  const cmd = `ffmpeg -i "${audioPath}" -af loudnorm=print_format=json -f null /dev/null`;

  try {
    // loudnorm prints its JSON summary to stderr
    const { stderr } = await execAsync(cmd, { maxBuffer: 10 * 1024 * 1024 });

    // The JSON block sits between the last pair of { } in stderr
    const jsonMatch = stderr.match(/\{[^{}]*"input_i"[^{}]*\}/s);
    if (!jsonMatch) {
      throw new Error("Could not find loudnorm JSON in FFmpeg output");
    }

    const data = JSON.parse(jsonMatch[0]);

    return {
      integratedLoudness: parseFloat(data.input_i) || -23,
      truePeak: parseFloat(data.input_tp) || -1,
      loudnessRange: parseFloat(data.input_lra) || 7,
    };
  } catch (err: unknown) {
    // If ffmpeg exits non-zero but still printed output, try parsing stderr
    if (err && typeof err === "object" && "stderr" in err) {
      const stderr = (err as { stderr: string }).stderr;
      const jsonMatch = stderr.match(/\{[^{}]*"input_i"[^{}]*\}/s);
      if (jsonMatch) {
        const data = JSON.parse(jsonMatch[0]);
        return {
          integratedLoudness: parseFloat(data.input_i) || -23,
          truePeak: parseFloat(data.input_tp) || -1,
          loudnessRange: parseFloat(data.input_lra) || 7,
        };
      }
    }
    console.warn("Loudness measurement failed, using defaults:", err);
    return { integratedLoudness: -23, truePeak: -1, loudnessRange: 7 };
  }
}

// ---------------------------------------------------------------------------
// Silence detection via silencedetect filter
// ---------------------------------------------------------------------------

interface SilenceSegment {
  start_s: number;
  end_s: number;
  duration_s: number;
}

async function detectSilence(audioPath: string): Promise<SilenceSegment[]> {
  const cmd = `ffmpeg -i "${audioPath}" -af silencedetect=noise=-30dB:d=0.5 -f null /dev/null`;

  let stderr: string;
  try {
    const result = await execAsync(cmd, { maxBuffer: 10 * 1024 * 1024 });
    stderr = result.stderr;
  } catch (err: unknown) {
    // FFmpeg may exit non-zero but still produce valid silence data on stderr
    if (err && typeof err === "object" && "stderr" in err) {
      stderr = (err as { stderr: string }).stderr;
    } else {
      console.warn("Silence detection failed:", err);
      return [];
    }
  }

  const segments: SilenceSegment[] = [];

  // Parse silence_start / silence_end pairs from stderr
  // Format: [silencedetect @ ...] silence_start: 1.234
  //         [silencedetect @ ...] silence_end: 2.345 | silence_duration: 1.111
  const startRegex = /silence_start:\s*([\d.]+)/g;
  const endRegex = /silence_end:\s*([\d.]+)\s*\|\s*silence_duration:\s*([\d.]+)/g;

  const starts: number[] = [];
  let match: RegExpExecArray | null;

  while ((match = startRegex.exec(stderr)) !== null) {
    starts.push(parseFloat(match[1]));
  }

  let idx = 0;
  while ((match = endRegex.exec(stderr)) !== null) {
    const end_s = parseFloat(match[1]);
    const duration_s = parseFloat(match[2]);
    const start_s = idx < starts.length ? starts[idx] : end_s - duration_s;

    segments.push({
      start_s: round(start_s, 3),
      end_s: round(end_s, 3),
      duration_s: round(duration_s, 3),
    });
    idx++;
  }

  return segments;
}

// ---------------------------------------------------------------------------
// Energy classification
// ---------------------------------------------------------------------------

function classifyEnergy(
  integratedLoudness: number,
  loudnessRange: number
): "low" | "medium" | "high" | "dynamic" {
  if (loudnessRange > 15) return "dynamic";
  if (integratedLoudness > -12) return "high";
  if (integratedLoudness < -20) return "low";
  return "medium";
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function round(n: number, decimals: number): number {
  const f = Math.pow(10, decimals);
  return Math.round(n * f) / f;
}
