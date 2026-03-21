import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import type { ScoredSegment } from "./context-scorer";

const anthropic = new Anthropic();

export const SelectedClipSchema = z.object({
  clip_id: z.string(),
  title: z.string(),
  start_s: z.number(),
  end_s: z.number(),
  duration_s: z.number(),
  mood: z.enum(["funny", "interesting", "surprising", "emotional", "educational"]),
  hook_text: z.string(),
  why: z.string(),
  scores: z.object({
    humor: z.number(),
    insight: z.number(),
    energy: z.number(),
    hook_quality: z.number(),
    creator_match: z.number(),
  }),
});

export type SelectedClip = z.infer<typeof SelectedClipSchema>;

interface ClipSelectorConfig {
  clipCount: number;
  minClipLengthS: number;
  maxClipLengthS: number;
  maxOverlapS: number;
}

const DEFAULT_CONFIG: ClipSelectorConfig = {
  clipCount: 5,
  minClipLengthS: 30,
  maxClipLengthS: 90,
  maxOverlapS: 5,
};

/**
 * Select the best non-overlapping clips from scored segments.
 * Uses claude-sonnet for intelligent selection.
 */
export async function selectClips(
  segments: ScoredSegment[],
  config: Partial<ClipSelectorConfig> = {}
): Promise<SelectedClip[]> {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  if (segments.length === 0) return [];

  const segmentList = segments
    .map((s, i) =>
      `[${i}] ${s.start_s.toFixed(1)}s-${s.end_s.toFixed(1)}s | "${s.text}" | mood:${s.mood} | humor:${s.scores.humor} insight:${s.scores.insight} energy:${s.scores.energy} hook:${s.scores.hook_quality} match:${s.scores.creator_match}`
    )
    .join("\n");

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-5-20250929",
    max_tokens: 3000,
    messages: [
      {
        role: "user",
        content: `Select the ${cfg.clipCount} best clips from these scored segments for short-form content.

SEGMENTS:
${segmentList}

RULES:
- Select exactly ${cfg.clipCount} clips (or fewer if not enough good content)
- Each clip must be ${cfg.minClipLengthS}-${cfg.maxClipLengthS} seconds long
- You can combine consecutive segments into one clip
- No two clips can overlap by more than ${cfg.maxOverlapS} seconds
- Each clip MUST have a strong hook in its first 5 seconds
- Each clip MUST end on a complete thought (not mid-sentence)
- Prioritize variety in mood — don't pick all the same type

For each clip, return:
{
  "title": "short punchy title for the clip",
  "start_s": number,
  "end_s": number,
  "mood": "funny" | "interesting" | "surprising" | "emotional" | "educational",
  "hook_text": "the first sentence that grabs attention",
  "why": "1-sentence explanation of why this clip was selected",
  "segment_indices": [list of segment indices used]
}

Return a JSON array of clips. Return ONLY the JSON array.`,
      },
    ],
  });

  const textBlock = response.content.find((c) => c.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No response from Claude");
  }

  let jsonStr = textBlock.text.trim();
  if (jsonStr.startsWith("```")) {
    jsonStr = jsonStr.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
  }

  let rawClips: any[];
  try {
    rawClips = JSON.parse(jsonStr);
  } catch {
    // Fallback: pick top segments by score
    return fallbackSelection(segments, cfg);
  }

  // Validate and enforce constraints
  const clips: SelectedClip[] = rawClips
    .slice(0, cfg.clipCount)
    .map((clip: any, i: number) => {
      const duration = clip.end_s - clip.start_s;
      // Merge scores from referenced segments
      const indices: number[] = clip.segment_indices || [0];
      const refSegments = indices
        .map((idx: number) => segments[idx])
        .filter(Boolean);
      const avgScores = averageScores(refSegments);

      return {
        clip_id: `clip-${i + 1}-${Date.now()}`,
        title: clip.title || `Clip ${i + 1}`,
        start_s: clip.start_s,
        end_s: clip.end_s,
        duration_s: Math.round(duration * 100) / 100,
        mood: clip.mood || "interesting",
        hook_text: clip.hook_text || "",
        why: clip.why || "Selected by AI",
        scores: avgScores,
      };
    });

  // Remove overlapping clips
  return removeOverlaps(clips, cfg.maxOverlapS);
}

function averageScores(segments: ScoredSegment[]): SelectedClip["scores"] {
  if (segments.length === 0) {
    return { humor: 5, insight: 5, energy: 5, hook_quality: 5, creator_match: 5 };
  }
  const sum = { humor: 0, insight: 0, energy: 0, hook_quality: 0, creator_match: 0 };
  for (const s of segments) {
    sum.humor += s.scores.humor;
    sum.insight += s.scores.insight;
    sum.energy += s.scores.energy;
    sum.hook_quality += s.scores.hook_quality;
    sum.creator_match += s.scores.creator_match;
  }
  const n = segments.length;
  return {
    humor: Math.round((sum.humor / n) * 10) / 10,
    insight: Math.round((sum.insight / n) * 10) / 10,
    energy: Math.round((sum.energy / n) * 10) / 10,
    hook_quality: Math.round((sum.hook_quality / n) * 10) / 10,
    creator_match: Math.round((sum.creator_match / n) * 10) / 10,
  };
}

function removeOverlaps(clips: SelectedClip[], maxOverlap: number): SelectedClip[] {
  const sorted = [...clips].sort((a, b) => a.start_s - b.start_s);
  const result: SelectedClip[] = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const prev = result[result.length - 1];
    const overlap = prev.end_s - sorted[i].start_s;
    if (overlap <= maxOverlap) {
      result.push(sorted[i]);
    }
  }

  return result;
}

function fallbackSelection(
  segments: ScoredSegment[],
  cfg: ClipSelectorConfig
): SelectedClip[] {
  const sorted = [...segments].sort((a, b) => {
    const scoreA = a.scores.humor + a.scores.insight + a.scores.energy + a.scores.hook_quality + a.scores.creator_match;
    const scoreB = b.scores.humor + b.scores.insight + b.scores.energy + b.scores.hook_quality + b.scores.creator_match;
    return scoreB - scoreA;
  });

  return sorted.slice(0, cfg.clipCount).map((s, i) => ({
    clip_id: `clip-${i + 1}-${Date.now()}`,
    title: s.topic || `Clip ${i + 1}`,
    start_s: s.start_s,
    end_s: s.end_s,
    duration_s: Math.round((s.end_s - s.start_s) * 100) / 100,
    mood: s.mood,
    hook_text: s.text.split(".")[0] || s.text.slice(0, 50),
    why: `Top scoring segment (${s.beat})`,
    scores: s.scores,
  }));
}
