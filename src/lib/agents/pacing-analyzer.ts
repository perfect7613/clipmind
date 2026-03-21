import { z } from "zod";
import type { WordTimestamp } from "@/types";

export const PacingAnalysisSchema = z.object({
  cutsPerMinute: z.number(),
  silenceDistribution: z.object({
    totalSilenceS: z.number(),
    silencePercentage: z.number(),
    avgGapDurationS: z.number(),
    gapCount: z.number(),
  }),
  preferredClipLength: z.object({
    minS: z.number(),
    maxS: z.number(),
    avgS: z.number(),
  }),
  fillerWords: z.object({
    detected: z.array(z.string()),
    totalCount: z.number(),
    perMinute: z.number(),
  }),
  speechRate: z.object({
    wordsPerMinute: z.number(),
    category: z.enum(["slow", "moderate", "fast", "very-fast"]),
  }),
});

export type PacingAnalysis = z.infer<typeof PacingAnalysisSchema>;

const FILLER_WORDS = ["um", "uh", "like", "you know", "sort of", "i mean", "basically", "actually", "literally", "right", "so", "well"];

/**
 * Analyze pacing from word-level timestamps. Deterministic — no LLM needed.
 */
export function analyzePacing(
  words: WordTimestamp[],
  duration_s: number,
  sceneChangeTimestamps?: number[]
): PacingAnalysis {
  if (words.length === 0 || duration_s === 0) {
    return getEmptyPacing();
  }

  // Silence analysis
  const silenceGaps = findSilenceGaps(words, 0.5); // gaps > 0.5s
  const totalSilenceS = silenceGaps.reduce((sum, g) => sum + g.duration, 0);

  // Cuts per minute (from scene changes if available, otherwise estimate from long pauses)
  const cuts = sceneChangeTimestamps
    ? sceneChangeTimestamps.length
    : silenceGaps.filter((g) => g.duration > 1.0).length; // long pauses as proxy for cuts
  const cutsPerMinute = (cuts / duration_s) * 60;

  // Clip length estimation from natural segment breaks
  const segments = findNaturalSegments(words, silenceGaps);
  const segLengths = segments.map((s) => s.end_s - s.start_s).filter((l) => l > 5);
  const avgSegLength = segLengths.length > 0
    ? segLengths.reduce((a, b) => a + b, 0) / segLengths.length
    : 60;

  // Filler word detection
  const transcript = words.map((w) => w.word.toLowerCase()).join(" ");
  const fillerCounts: Record<string, number> = {};
  let totalFillers = 0;

  for (const filler of FILLER_WORDS) {
    const regex = new RegExp(`\\b${filler}\\b`, "gi");
    const matches = transcript.match(regex);
    if (matches && matches.length > 0) {
      fillerCounts[filler] = matches.length;
      totalFillers += matches.length;
    }
  }

  const detectedFillers = Object.keys(fillerCounts).sort(
    (a, b) => (fillerCounts[b] || 0) - (fillerCounts[a] || 0)
  );

  // Speech rate
  const wordsPerMinute = (words.length / duration_s) * 60;
  const speechCategory =
    wordsPerMinute < 120 ? "slow" as const :
    wordsPerMinute < 160 ? "moderate" as const :
    wordsPerMinute < 200 ? "fast" as const :
    "very-fast" as const;

  return PacingAnalysisSchema.parse({
    cutsPerMinute,
    silenceDistribution: {
      totalSilenceS: Math.round(totalSilenceS * 100) / 100,
      silencePercentage: Math.round((totalSilenceS / duration_s) * 10000) / 100,
      avgGapDurationS: silenceGaps.length > 0
        ? Math.round((totalSilenceS / silenceGaps.length) * 100) / 100
        : 0,
      gapCount: silenceGaps.length,
    },
    preferredClipLength: {
      minS: Math.max(15, Math.round(avgSegLength * 0.5)),
      maxS: Math.min(120, Math.round(avgSegLength * 1.5)),
      avgS: Math.round(avgSegLength),
    },
    fillerWords: {
      detected: detectedFillers,
      totalCount: totalFillers,
      perMinute: Math.round((totalFillers / duration_s) * 60 * 100) / 100,
    },
    speechRate: {
      wordsPerMinute: Math.round(wordsPerMinute),
      category: speechCategory,
    },
  });
}

interface SilenceGap {
  start_s: number;
  end_s: number;
  duration: number;
}

function findSilenceGaps(words: WordTimestamp[], minGapS: number): SilenceGap[] {
  const gaps: SilenceGap[] = [];

  for (let i = 1; i < words.length; i++) {
    const gap = words[i].start_s - words[i - 1].end_s;
    if (gap >= minGapS) {
      gaps.push({
        start_s: words[i - 1].end_s,
        end_s: words[i].start_s,
        duration: gap,
      });
    }
  }

  return gaps;
}

interface Segment {
  start_s: number;
  end_s: number;
}

function findNaturalSegments(words: WordTimestamp[], gaps: SilenceGap[]): Segment[] {
  if (words.length === 0) return [];

  const breakpoints = gaps
    .filter((g) => g.duration > 1.0)
    .map((g) => g.start_s);

  const segments: Segment[] = [];
  let segStart = words[0].start_s;

  for (const bp of breakpoints) {
    segments.push({ start_s: segStart, end_s: bp });
    segStart = bp;
  }

  segments.push({ start_s: segStart, end_s: words[words.length - 1].end_s });
  return segments;
}

function getEmptyPacing(): PacingAnalysis {
  return {
    cutsPerMinute: 0,
    silenceDistribution: { totalSilenceS: 0, silencePercentage: 0, avgGapDurationS: 0, gapCount: 0 },
    preferredClipLength: { minS: 30, maxS: 90, avgS: 60 },
    fillerWords: { detected: [], totalCount: 0, perMinute: 0 },
    speechRate: { wordsPerMinute: 0, category: "moderate" },
  };
}
