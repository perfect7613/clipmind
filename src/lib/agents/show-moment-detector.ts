import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import type { WordTimestamp } from "@/types";

const anthropic = new Anthropic();

export const ShowMomentSchema = z.object({
  timestamp_s: z.number(),
  duration_s: z.number(),
  trigger_type: z.enum(["verbal", "context"]),
  context: z.string(),
  suggested_type: z.enum([
    "text_card", "animated_counter", "building_flowchart",
    "side_by_side", "list_builder", "data_bar", "framework_grid",
  ]),
  content: z.string(),
});

export type ShowMoment = z.infer<typeof ShowMomentSchema>;

/**
 * Detect moments in the transcript that would benefit from visual animation.
 * Uses claude-haiku for fast detection.
 */
export async function detectShowMoments(
  words: WordTimestamp[],
  totalDurationS: number
): Promise<ShowMoment[]> {
  if (words.length === 0) return [];

  // Build transcript with timestamps
  const chunks = buildTimedChunks(words, 15);
  const transcript = chunks
    .map((c) => `[${c.start_s.toFixed(1)}s] ${c.text}`)
    .join("\n");

  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 2000,
    messages: [
      {
        role: "user",
        content: `Find moments in this transcript where a visual animation would enhance the content.

TRANSCRIPT:
${transcript}

DETECTION RULES:
1. VERBAL CUES - speaker signals a visual: "let me show you", "check this out", "here's what it looks like", "like this", "picture this"
2. CONTEXT CUES - speaker describes something visual: a tool/app name near "tab", "window", "button", "settings", "click"; a process with steps; a comparison; a statistic or number

ANIMATION TYPES:
- text_card: strong statement, bold claim, key takeaway
- animated_counter: statistic, number, percentage mentioned
- building_flowchart: step-by-step process described
- side_by_side: two things compared
- list_builder: list or framework with 3+ items
- data_bar: metric or progress described
- framework_grid: 2x2 or 3x3 framework

Return a JSON array:
[
  {
    "timestamp_s": 42.5,
    "duration_s": 4.0,
    "trigger_type": "verbal" or "context",
    "context": "brief description of what's being said",
    "suggested_type": "text_card",
    "content": "the text/data to display in the animation"
  }
]

Return ONLY the JSON array. Return empty array [] if no good moments found.`,
      },
    ],
  });

  const textBlock = response.content.find((c) => c.type === "text");
  if (!textBlock || textBlock.type !== "text") return [];

  let jsonStr = textBlock.text.trim();
  if (jsonStr.startsWith("```")) {
    jsonStr = jsonStr.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
  }

  try {
    return z.array(ShowMomentSchema).parse(JSON.parse(jsonStr));
  } catch {
    return [];
  }
}

function buildTimedChunks(
  words: WordTimestamp[],
  targetSeconds: number
): { start_s: number; text: string }[] {
  const chunks: { start_s: number; text: string }[] = [];
  let start = words[0].start_s;
  let chunkWords: string[] = [];

  for (const word of words) {
    chunkWords.push(word.word);
    if (word.end_s - start >= targetSeconds) {
      chunks.push({ start_s: start, text: chunkWords.join(" ") });
      start = word.end_s;
      chunkWords = [];
    }
  }
  if (chunkWords.length > 0) {
    chunks.push({ start_s: start, text: chunkWords.join(" ") });
  }
  return chunks;
}
