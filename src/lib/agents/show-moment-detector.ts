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
 * Uses Creator DNA to determine animation density and preferred types.
 */
export async function detectShowMoments(
  words: WordTimestamp[],
  totalDurationS: number,
  dnaContext?: string
): Promise<ShowMoment[]> {
  if (words.length === 0) return [];

  // Build transcript with timestamps
  const chunks = buildTimedChunks(words, 15);
  const transcript = chunks
    .map((c) => `[${c.start_s.toFixed(1)}s] ${c.text}`)
    .join("\n");

  // Extract DNA preferences for animation density + pass full context
  const densityHint = extractDensityHint(dnaContext);
  const dnaSection = dnaContext ? `\nCREATOR DNA SKILL (use to match this creator's style):\n${dnaContext}\n` : "";

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 3000,
    messages: [
      {
        role: "user",
        content: `Find moments in this transcript where a visual animation would enhance the content.

TRANSCRIPT (${totalDurationS.toFixed(0)}s total):
${transcript}

${densityHint}
${dnaSection}

DETECTION RULES:
1. VERBAL CUES - speaker signals a visual: "let me show you", "check this out", "here's what it looks like", "like this", "picture this", "imagine", "look at this"
2. CONTEXT CUES - speaker describes something visual:
   - A tool/app name near "tab", "window", "button", "settings", "click"
   - A process with steps ("first... then... finally")
   - A comparison ("compared to", "versus", "on one hand... on the other")
   - A statistic or number ("percent", "million", "doubled", any significant number)
   - A list or framework ("three things", "the key factors are")
   - A bold claim or key takeaway ("the most important thing", "here's the truth")
   - An emotional peak or punchline

ANIMATION TYPES (match the best type to each moment):
- text_card: strong statement, bold claim, key takeaway, memorable quote
- animated_counter: statistic, number, percentage, growth metric
- building_flowchart: step-by-step process, workflow, sequence of events
- side_by_side: two things compared, before/after, pros/cons
- list_builder: list or framework with 3+ items, key principles
- data_bar: metric, progress, ranking, performance indicator
- framework_grid: 2x2 or 3x3 framework, matrix, categorization

GUIDELINES:
- Duration should be 3-8 seconds (enough to read and appreciate)
- Space animations at least 15 seconds apart
- Prefer variety — don't use the same type repeatedly
- Content should be concise (max 10 words for text_card, include the actual numbers for counters)
- Include ALL relevant data in the content field (the animation generator needs this)

Return a JSON array:
[
  {
    "timestamp_s": 42.5,
    "duration_s": 5.0,
    "trigger_type": "verbal" or "context",
    "context": "brief description of what's being said and why this moment benefits from animation",
    "suggested_type": "text_card",
    "content": "the exact text/data to display in the animation"
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

/**
 * Extract animation density preference from DNA content.
 */
function extractDensityHint(dnaContent?: string): string {
  if (!dnaContent) {
    return "TARGET: Find 2-4 animation moments per 30 seconds of content (moderate density).";
  }

  // Check for animation density/frequency preference
  const densityMatch = dnaContent.match(/(?:animation|overlay)\s*(?:density|frequency)[:\s]*(\w+)/i);
  const density = densityMatch?.[1]?.toLowerCase() || "moderate";

  // Check for preferred animation types
  const typesMatch = dnaContent.match(/(?:preferred|favorite)\s*(?:animation|overlay)\s*types?[:\s]*([\s\S]*?)(?:\n\n|\n##|$)/i);
  const preferredTypes = typesMatch?.[1]?.trim() || "";

  // Check for content type (affects what kind of moments to look for)
  const contentMatch = dnaContent.match(/(?:content\s*type|content_type)[:\s]*(\w+)/i);
  const contentType = contentMatch?.[1]?.toLowerCase() || "";

  const densityMap: Record<string, string> = {
    none: "TARGET: Find only 0-1 animation moments — this creator prefers minimal overlays.",
    light: "TARGET: Find 1-2 animation moments per 30 seconds — this creator prefers subtle, occasional animations.",
    moderate: "TARGET: Find 2-4 animation moments per 30 seconds — this creator likes balanced animation usage.",
    heavy: "TARGET: Find 4-6 animation moments per 30 seconds — this creator loves frequent, engaging animations.",
  };

  let hint = densityMap[density] || densityMap.moderate;

  if (preferredTypes) {
    hint += `\nPREFERRED TYPES: ${preferredTypes}`;
  }

  if (contentType) {
    hint += `\nCONTENT TYPE: ${contentType} — adjust moment detection accordingly.`;
  }

  return hint;
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
