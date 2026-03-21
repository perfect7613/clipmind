import { z } from "zod";
import type { WordTimestamp } from "@/types";

export const SilenceCutSchema = z.object({
  start_s: z.number(),
  end_s: z.number(),
});

export const SilenceRemoverResultSchema = z.object({
  cuts: z.array(SilenceCutSchema),
  trimRegions: z.array(z.object({
    start_s: z.number(),
    end_s: z.number(),
  })),
  totalSilenceRemovedS: z.number(),
  originalDurationS: z.number(),
  newDurationS: z.number(),
});

export type SilenceRemoverResult = z.infer<typeof SilenceRemoverResultSchema>;

interface SilenceRemoverConfig {
  silenceThresholdDb: number;   // default: -30
  minDurationS: number;         // default: 0.5
  preservedPauseS: number;      // default: 0.3
  crossfadeMs: number;          // default: 20
}

const DEFAULT_CONFIG: SilenceRemoverConfig = {
  silenceThresholdDb: -30,
  minDurationS: 0.5,
  preservedPauseS: 0.3,
  crossfadeMs: 20,
};

/**
 * Analyze word timestamps to find silence gaps and generate trim regions.
 * Deterministic — no LLM, no FFmpeg execution. Produces data for render_agent.
 */
export function planSilenceRemoval(
  words: WordTimestamp[],
  totalDurationS: number,
  config: Partial<SilenceRemoverConfig> = {}
): SilenceRemoverResult {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  if (words.length === 0) {
    return {
      cuts: [],
      trimRegions: [{ start_s: 0, end_s: totalDurationS }],
      totalSilenceRemovedS: 0,
      originalDurationS: totalDurationS,
      newDurationS: totalDurationS,
    };
  }

  // Find silence gaps between words
  const silenceGaps: { start_s: number; end_s: number; duration: number }[] = [];

  // Gap before first word
  if (words[0].start_s > cfg.minDurationS) {
    silenceGaps.push({
      start_s: 0,
      end_s: words[0].start_s,
      duration: words[0].start_s,
    });
  }

  // Gaps between words
  for (let i = 1; i < words.length; i++) {
    const gap = words[i].start_s - words[i - 1].end_s;
    if (gap >= cfg.minDurationS) {
      silenceGaps.push({
        start_s: words[i - 1].end_s,
        end_s: words[i].start_s,
        duration: gap,
      });
    }
  }

  // Gap after last word
  const lastWord = words[words.length - 1];
  if (totalDurationS - lastWord.end_s > cfg.minDurationS) {
    silenceGaps.push({
      start_s: lastWord.end_s,
      end_s: totalDurationS,
      duration: totalDurationS - lastWord.end_s,
    });
  }

  // Convert silence gaps to cuts (preserving natural pause on each side)
  const halfPause = cfg.preservedPauseS / 2;
  const cuts = silenceGaps
    .filter((g) => g.duration > cfg.preservedPauseS)
    .map((g) => ({
      start_s: Math.round((g.start_s + halfPause) * 1000) / 1000,
      end_s: Math.round((g.end_s - halfPause) * 1000) / 1000,
    }))
    .filter((c) => c.end_s > c.start_s);

  // Build trim regions (inverse of cuts — the parts we KEEP)
  const trimRegions = buildTrimRegions(cuts, totalDurationS);

  const totalSilenceRemovedS = cuts.reduce((sum, c) => sum + (c.end_s - c.start_s), 0);

  return SilenceRemoverResultSchema.parse({
    cuts,
    trimRegions,
    totalSilenceRemovedS: Math.round(totalSilenceRemovedS * 100) / 100,
    originalDurationS: totalDurationS,
    newDurationS: Math.round((totalDurationS - totalSilenceRemovedS) * 100) / 100,
  });
}

/**
 * Build FFmpeg atrim filter strings from trim regions.
 */
export function buildSilenceFilterComplex(
  trimRegions: { start_s: number; end_s: number }[],
  crossfadeMs: number = 20
): string {
  if (trimRegions.length === 0) return "";

  const crossfadeS = crossfadeMs / 1000;
  const filters: string[] = [];

  trimRegions.forEach((region, i) => {
    // Video trim
    filters.push(
      `[0:v]trim=start=${region.start_s}:end=${region.end_s},setpts=PTS-STARTPTS[v${i}]`
    );
    // Audio trim with crossfade padding
    filters.push(
      `[0:a]atrim=start=${region.start_s}:end=${region.end_s},asetpts=PTS-STARTPTS,afade=t=in:st=0:d=${crossfadeS},afade=t=out:st=${(region.end_s - region.start_s - crossfadeS).toFixed(3)}:d=${crossfadeS}[a${i}]`
    );
  });

  // Concat all segments
  const videoInputs = trimRegions.map((_, i) => `[v${i}]`).join("");
  const audioInputs = trimRegions.map((_, i) => `[a${i}]`).join("");
  filters.push(
    `${videoInputs}concat=n=${trimRegions.length}:v=1:a=0[vout]`
  );
  filters.push(
    `${audioInputs}concat=n=${trimRegions.length}:v=0:a=1[aout]`
  );

  return filters.join(";\n");
}

function buildTrimRegions(
  cuts: { start_s: number; end_s: number }[],
  totalDuration: number
): { start_s: number; end_s: number }[] {
  if (cuts.length === 0) {
    return [{ start_s: 0, end_s: totalDuration }];
  }

  const regions: { start_s: number; end_s: number }[] = [];
  let currentStart = 0;

  for (const cut of cuts) {
    if (cut.start_s > currentStart) {
      regions.push({
        start_s: Math.round(currentStart * 1000) / 1000,
        end_s: Math.round(cut.start_s * 1000) / 1000,
      });
    }
    currentStart = cut.end_s;
  }

  if (currentStart < totalDuration) {
    regions.push({
      start_s: Math.round(currentStart * 1000) / 1000,
      end_s: Math.round(totalDuration * 1000) / 1000,
    });
  }

  return regions;
}
