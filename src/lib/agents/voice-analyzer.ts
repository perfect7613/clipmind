import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

const anthropic = new Anthropic();

export const VoiceAnalysisSchema = z.object({
  humorType: z.enum(["dry", "absurdist", "self-deprecating", "observational", "none"]),
  energyLevel: z.enum(["chill", "medium", "high", "chaotic"]),
  hookPattern: z.enum(["question", "statement", "reaction", "story", "stat"]),
  vocabulary: z.enum(["casual", "mixed", "formal", "technical"]),
  contentType: z.enum(["vlog", "podcast", "educational", "commentary", "mixed"]),
  contentTypeWeights: z.object({
    humor: z.number().min(0).max(1),
    insight: z.number().min(0).max(1),
    energy: z.number().min(0).max(1),
    storytelling: z.number().min(0).max(1),
    controversy: z.number().min(0).max(1),
  }),
  energyWords: z.array(z.string()),
  sampleCaptions: z.array(z.string()),
  overallVoice: z.string(),
});

export type VoiceAnalysis = z.infer<typeof VoiceAnalysisSchema>;

/**
 * Analyze transcript text to extract the creator's voice and style.
 */
export async function analyzeVoice(transcript: string): Promise<VoiceAnalysis> {
  // Truncate transcript if too long (keep first 5000 chars for analysis)
  const truncated = transcript.length > 5000 ? transcript.slice(0, 5000) : transcript;

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-5-20250514",
    max_tokens: 2000,
    messages: [
      {
        role: "user",
        content: `Analyze this video transcript to extract the creator's voice and communication style.

TRANSCRIPT:
${truncated}

Return a JSON object with exactly this structure:
{
  "humorType": "dry" | "absurdist" | "self-deprecating" | "observational" | "none",
  "energyLevel": "chill" | "medium" | "high" | "chaotic",
  "hookPattern": "question" | "statement" | "reaction" | "story" | "stat" (how they typically start segments),
  "vocabulary": "casual" | "mixed" | "formal" | "technical",
  "contentType": "vlog" | "podcast" | "educational" | "commentary" | "mixed",
  "contentTypeWeights": {
    "humor": 0-1 (how much humor matters in their content),
    "insight": 0-1 (how much novel ideas matter),
    "energy": 0-1 (how much energy/pace matters),
    "storytelling": 0-1 (how much narrative matters),
    "controversy": 0-1 (how much provocative takes matter)
  },
  "energyWords": ["list", "of", "words", "this", "creator", "uses", "frequently", "for", "emphasis"],
  "sampleCaptions": ["5 example short captions (2-5 words) that match this creator's voice and style"],
  "overallVoice": "1-2 sentence summary of the creator's communication style"
}

Return ONLY the JSON object, no markdown formatting.`,
      },
    ],
  });

  const textBlock = response.content.find((c) => c.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No text response from Claude");
  }

  let jsonStr = textBlock.text.trim();
  if (jsonStr.startsWith("```")) {
    jsonStr = jsonStr.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
  }

  return VoiceAnalysisSchema.parse(JSON.parse(jsonStr));
}
