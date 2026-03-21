import { z } from "zod";

export const AudioProfileSchema = z.enum([
  "podcast_warm",
  "youtube_standard",
  "educational_clear",
  "vlog_punchy",
]);

export type AudioProfile = z.infer<typeof AudioProfileSchema>;

interface AudioMasteringConfig {
  style: AudioProfile;
  targetLufs: number;
  targetTruePeak: number;
}

const DEFAULT_CONFIG: AudioMasteringConfig = {
  style: "youtube_standard",
  targetLufs: -16,
  targetTruePeak: -1.5,
};

/**
 * Audio EQ and compression profiles per style.
 */
const AUDIO_PROFILES: Record<AudioProfile, {
  highpass: number;
  lowpass: number;
  presenceFreq: number;
  presenceGain: number;
  warmthFreq: number;
  warmthGain: number;
  compRatio: number;
  compThreshold: number;
  compAttack: number;
  compRelease: number;
}> = {
  podcast_warm: {
    highpass: 60,
    lowpass: 15000,
    presenceFreq: 2500,
    presenceGain: 2,
    warmthFreq: 250,
    warmthGain: 3,
    compRatio: 2.5,
    compThreshold: -24,
    compAttack: 10,
    compRelease: 80,
  },
  youtube_standard: {
    highpass: 80,
    lowpass: 14000,
    presenceFreq: 3000,
    presenceGain: 3,
    warmthFreq: 200,
    warmthGain: 2,
    compRatio: 3,
    compThreshold: -21,
    compAttack: 5,
    compRelease: 50,
  },
  educational_clear: {
    highpass: 100,
    lowpass: 13000,
    presenceFreq: 3500,
    presenceGain: 4,
    warmthFreq: 180,
    warmthGain: 1,
    compRatio: 4,
    compThreshold: -18,
    compAttack: 3,
    compRelease: 40,
  },
  vlog_punchy: {
    highpass: 80,
    lowpass: 15000,
    presenceFreq: 3000,
    presenceGain: 4,
    warmthFreq: 200,
    warmthGain: 3,
    compRatio: 4,
    compThreshold: -20,
    compAttack: 2,
    compRelease: 30,
  },
};

/**
 * Generate the FFmpeg audio filter chain string.
 * Deterministic — no LLM needed.
 */
export function buildAudioFilterChain(
  config: Partial<AudioMasteringConfig> = {}
): string {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const profile = AUDIO_PROFILES[cfg.style];

  return [
    `highpass=f=${profile.highpass}`,
    `lowpass=f=${profile.lowpass}`,
    `equalizer=f=${profile.presenceFreq}:width_type=o:width=1:g=${profile.presenceGain}`,
    `equalizer=f=${profile.warmthFreq}:width_type=o:width=1:g=${profile.warmthGain}`,
    `acompressor=ratio=${profile.compRatio}:threshold=${profile.compThreshold}dB:attack=${profile.compAttack}:release=${profile.compRelease}`,
    `loudnorm=I=${cfg.targetLufs}:TP=${cfg.targetTruePeak}:LRA=11`,
  ].join(",");
}

/**
 * Generate the two-pass loudnorm filter.
 * Pass 1 collects stats, Pass 2 applies correction.
 */
export function buildTwoPassLoudnorm(
  config: Partial<AudioMasteringConfig> = {}
): { pass1: string; pass2: (stats: LoudnormStats) => string } {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const profile = AUDIO_PROFILES[cfg.style];

  const baseChain = [
    `highpass=f=${profile.highpass}`,
    `lowpass=f=${profile.lowpass}`,
    `equalizer=f=${profile.presenceFreq}:width_type=o:width=1:g=${profile.presenceGain}`,
    `equalizer=f=${profile.warmthFreq}:width_type=o:width=1:g=${profile.warmthGain}`,
    `acompressor=ratio=${profile.compRatio}:threshold=${profile.compThreshold}dB:attack=${profile.compAttack}:release=${profile.compRelease}`,
  ].join(",");

  return {
    pass1: `${baseChain},loudnorm=I=${cfg.targetLufs}:TP=${cfg.targetTruePeak}:LRA=11:print_format=json`,
    pass2: (stats: LoudnormStats) =>
      `${baseChain},loudnorm=I=${cfg.targetLufs}:TP=${cfg.targetTruePeak}:LRA=11:measured_I=${stats.input_i}:measured_TP=${stats.input_tp}:measured_LRA=${stats.input_lra}:measured_thresh=${stats.input_thresh}:offset=${stats.target_offset}:linear=true`,
  };
}

export interface LoudnormStats {
  input_i: string;
  input_tp: string;
  input_lra: string;
  input_thresh: string;
  target_offset: string;
}

/**
 * Parse loudnorm stats from FFmpeg stderr output.
 */
export function parseLoudnormStats(stderr: string): LoudnormStats | null {
  const jsonMatch = stderr.match(/\{[\s\S]*?"input_i"[\s\S]*?\}/);
  if (!jsonMatch) return null;

  try {
    const stats = JSON.parse(jsonMatch[0]);
    return {
      input_i: stats.input_i,
      input_tp: stats.input_tp,
      input_lra: stats.input_lra,
      input_thresh: stats.input_thresh,
      target_offset: stats.target_offset,
    };
  } catch {
    return null;
  }
}
