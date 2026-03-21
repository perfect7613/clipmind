import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import type { WordTimestamp } from "@/types";

const anthropic = new Anthropic();

// Segment with narrative context
export const NarrativeSegmentSchema = z.object({
  start_s: z.number(),
  end_s: z.number(),
  text: z.string(),
  topic: z.string().catch("general"),
  beat: z.enum(["intro", "setup", "build", "climax", "resolution", "transition", "aside"]).catch("setup"),
  emotion: z.enum(["neutral", "excited", "funny", "serious", "passionate", "reflective"]).catch("neutral"),
});

export type NarrativeSegment = z.infer<typeof NarrativeSegmentSchema>;

// Scored segment
export const ScoredSegmentSchema = z.object({
  start_s: z.number().catch(0),
  end_s: z.number().catch(0),
  text: z.string().catch(""),
  topic: z.string().catch("general"),
  beat: z.string().catch("setup"),
  emotion: z.string().catch("neutral"),
  scores: z.object({
    humor: z.number().min(0).max(10).catch(5),
    insight: z.number().min(0).max(10).catch(5),
    energy: z.number().min(0).max(10).catch(5),
    hook_quality: z.number().min(0).max(10).catch(5),
    creator_match: z.number().min(0).max(10).catch(5),
  }).catch({ humor: 5, insight: 5, energy: 5, hook_quality: 5, creator_match: 5 }),
  mood: z.enum(["funny", "interesting", "surprising", "emotional", "educational"]).catch("interesting"),
});

export type ScoredSegment = z.infer<typeof ScoredSegmentSchema>;

export const ContextScorerResultSchema = z.object({
  segments: z.array(ScoredSegmentSchema),
  totalSegments: z.number(),
  topMoments: z.array(z.object({
    segmentIndex: z.number(),
    totalScore: z.number(),
  })),
});

export type ContextScorerResult = z.infer<typeof ContextScorerResultSchema>;

interface ContentTypeWeights {
  humor: number;
  insight: number;
  energy: number;
  storytelling: number;
  controversy: number;
}

const DEFAULT_WEIGHTS: ContentTypeWeights = {
  humor: 0.5,
  insight: 0.5,
  energy: 0.5,
  storytelling: 0.5,
  controversy: 0.3,
};

/**
 * Step 1: Context Agent — Narrative mapping and beat detection.
 * Uses claude-sonnet for deep understanding.
 */
export async function analyzeContext(
  words: WordTimestamp[],
  totalDurationS: number
): Promise<NarrativeSegment[]> {
  if (words.length === 0) return [];

  // Build ~30-second segments
  const chunks = buildChunks(words, 30);
  const transcript = chunks
    .map((c) => `[${c.start_s.toFixed(1)}s - ${c.end_s.toFixed(1)}s]\n${c.text}`)
    .join("\n\n");

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4000,
    messages: [
      {
        role: "user",
        content: `Analyze this video transcript for narrative structure. Break it into segments and identify the topic, narrative beat, and emotion for each.

TRANSCRIPT:
${transcript}

For each segment, return:
- start_s and end_s (use the timestamps from the transcript)
- text: the key content of that segment (1-2 sentences summary)
- topic: what is being discussed
- beat: one of "intro", "setup", "build", "climax", "resolution", "transition", "aside"
- emotion: one of "neutral", "excited", "funny", "serious", "passionate", "reflective"

Return a JSON array:
[
  {"start_s": 0.0, "end_s": 28.5, "text": "...", "topic": "...", "beat": "intro", "emotion": "excited"},
  ...
]

Return ONLY the JSON array.`,
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

  try {
    return z.array(NarrativeSegmentSchema).parse(JSON.parse(jsonStr));
  } catch {
    // Fallback: single segment
    return [{
      start_s: 0,
      end_s: totalDurationS,
      text: words.map((w) => w.word).join(" ").slice(0, 200),
      topic: "general",
      beat: "setup",
      emotion: "neutral",
    }];
  }
}

/**
 * Step 2: Moment Scorer — Score each segment on 5 axes.
 * Uses claude-haiku for fast scoring.
 */
export async function scoreSegments(
  segments: NarrativeSegment[],
  weights: Partial<ContentTypeWeights> = {}
): Promise<ContextScorerResult> {
  const w = { ...DEFAULT_WEIGHTS, ...weights };

  if (segments.length === 0) {
    return { segments: [], totalSegments: 0, topMoments: [] };
  }

  const segmentList = segments
    .map((s, i) => `Segment ${i}: [${s.start_s.toFixed(1)}s-${s.end_s.toFixed(1)}s] "${s.text}" (${s.beat}, ${s.emotion})`)
    .join("\n");

  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 3000,
    messages: [
      {
        role: "user",
        content: `Score each segment on 5 axes (0-10 scale) and assign a mood.

SEGMENTS:
${segmentList}

SCORING AXES:
- humor (0-10): comedic value, laugh potential
- insight (0-10): novel idea, interesting take, counter-intuitive point
- energy (0-10): pace, excitement, emotional intensity
- hook_quality (0-10): how well the first few seconds work as a standalone hook
- creator_match (0-10): overall shareability and engagement potential

MOOD: classify as "funny", "interesting", "surprising", "emotional", or "educational"

Return a JSON array with one entry per segment:
[
  {"index": 0, "humor": 3, "insight": 7, "energy": 5, "hook_quality": 6, "creator_match": 7, "mood": "interesting"},
  ...
]

Return ONLY the JSON array.`,
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

  let rawScores: any[];
  try {
    rawScores = JSON.parse(jsonStr);
  } catch {
    // Fallback: default scores
    rawScores = segments.map((_, i) => ({
      index: i, humor: 5, insight: 5, energy: 5, hook_quality: 5, creator_match: 5, mood: "interesting",
    }));
  }

  // Merge scores with segments
  const scoredSegments: ScoredSegment[] = segments.map((seg, i) => {
    const score = rawScores.find((s: any) => s.index === i) || rawScores[i] || {};
    return {
      start_s: seg.start_s,
      end_s: seg.end_s,
      text: seg.text,
      topic: seg.topic,
      beat: seg.beat,
      emotion: seg.emotion,
      scores: {
        humor: score.humor ?? 5,
        insight: score.insight ?? 5,
        energy: score.energy ?? 5,
        hook_quality: score.hook_quality ?? 5,
        creator_match: score.creator_match ?? 5,
      },
      mood: score.mood || "interesting",
    };
  });

  // Calculate weighted total scores and find top moments
  const scoredWithTotals = scoredSegments.map((seg, i) => {
    const total =
      seg.scores.humor * w.humor +
      seg.scores.insight * w.insight +
      seg.scores.energy * w.energy +
      seg.scores.hook_quality * 0.8 +
      seg.scores.creator_match * 0.7;
    return { segmentIndex: i, totalScore: Math.round(total * 100) / 100 };
  });

  const topMoments = [...scoredWithTotals]
    .sort((a, b) => b.totalScore - a.totalScore)
    .slice(0, 10);

  return ContextScorerResultSchema.parse({
    segments: scoredSegments,
    totalSegments: scoredSegments.length,
    topMoments,
  });
}

/**
 * Combined: analyze context + score in one call.
 */
export async function analyzeAndScore(
  words: WordTimestamp[],
  totalDurationS: number,
  weights?: Partial<ContentTypeWeights>
): Promise<ContextScorerResult> {
  const segments = await analyzeContext(words, totalDurationS);
  return scoreSegments(segments, weights);
}

function buildChunks(
  words: WordTimestamp[],
  targetDurationS: number
): { start_s: number; end_s: number; text: string }[] {
  const chunks: { start_s: number; end_s: number; text: string }[] = [];
  let chunkStart = words[0].start_s;
  let chunkWords: string[] = [];

  for (const word of words) {
    chunkWords.push(word.word);
    if (word.end_s - chunkStart >= targetDurationS) {
      chunks.push({
        start_s: chunkStart,
        end_s: word.end_s,
        text: chunkWords.join(" "),
      });
      chunkStart = word.end_s;
      chunkWords = [];
    }
  }

  if (chunkWords.length > 0) {
    chunks.push({
      start_s: chunkStart,
      end_s: words[words.length - 1].end_s,
      text: chunkWords.join(" "),
    });
  }

  return chunks;
}
