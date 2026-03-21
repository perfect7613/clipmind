import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { promises as fs } from "fs";
import type { FrameSample } from "./frame-sampler";

const anthropic = new Anthropic();

// Output schema — lenient to handle Claude's varied responses
export const VisualAnalysisSchema = z.object({
  captionStyle: z.object({
    detected: z.boolean().catch(false),
    casing: z.enum(["upper", "lower", "title", "sentence"]).nullable().optional().catch(null),
    position: z.enum(["top", "middle", "bottom", "dynamic"]).nullable().optional().catch(null),
    background: z.enum(["none", "dark-bar", "pill", "full-width"]).nullable().optional().catch(null),
    fontSize: z.enum(["small", "medium", "large"]).nullable().optional().catch(null),
    animation: z.enum(["none", "pop", "slide", "bounce", "typewriter"]).nullable().optional().catch(null),
    colorHex: z.string().nullable().optional().catch(null),
  }).catch({ detected: false, casing: null, position: null, background: null, fontSize: null, animation: null, colorHex: null }),
  colorTemperature: z.enum(["warm", "neutral", "cool", "cinematic", "flat"]).catch("neutral"),
  zoomPatterns: z.object({
    levelsDetected: z.number().min(1).max(5).catch(1),
    style: z.enum(["instant", "gradual", "mixed"]).catch("instant"),
    frequency: z.enum(["none", "low", "medium", "high"]).catch("low"),
  }).catch({ levelsDetected: 1, style: "instant" as const, frequency: "low" as const }),
  textOverlays: z.object({
    detected: z.boolean().catch(false),
    frequency: z.enum(["none", "light", "moderate", "heavy"]).catch("none"),
    style: z.string().nullable().optional().catch(null),
  }).catch({ detected: false, frequency: "none" as const, style: null }),
  brollPresence: z.object({
    detected: z.boolean().catch(false),
    estimatedPercentage: z.number().min(0).max(100).catch(0),
    types: z.array(z.string()).catch([]),
  }).catch({ detected: false, estimatedPercentage: 0, types: [] }),
  productionQuality: z.enum(["amateur", "semi-pro", "professional", "high-end"]).catch("semi-pro"),
  overallStyle: z.string().catch("Standard video style"),
});

export type VisualAnalysis = z.infer<typeof VisualAnalysisSchema>;

/**
 * Analyze frames using Claude Vision to extract visual editing style.
 * Sends up to 10 frames to Claude Vision for analysis.
 */
export async function analyzeVisualStyle(
  frames: FrameSample[],
  maxFramesToAnalyze: number = 10
): Promise<VisualAnalysis> {
  // Select subset of frames if too many
  const framesToAnalyze = frames.length > maxFramesToAnalyze
    ? selectEvenly(frames, maxFramesToAnalyze)
    : frames;

  // Read frames as base64
  const imageContents: Anthropic.ImageBlockParam[] = [];
  for (const frame of framesToAnalyze) {
    try {
      const data = await fs.readFile(frame.path);
      const base64 = data.toString("base64");
      imageContents.push({
        type: "image",
        source: {
          type: "base64",
          media_type: "image/jpeg",
          data: base64,
        },
      });
    } catch {
      // Skip unreadable frames
    }
  }

  if (imageContents.length === 0) {
    throw new Error("No valid frames to analyze");
  }

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-5-20250929",
    max_tokens: 2000,
    messages: [
      {
        role: "user",
        content: [
          ...imageContents,
          {
            type: "text",
            text: `Analyze these video frames to extract the editing style. These frames are from the same video/channel.

Return a JSON object with exactly this structure:
{
  "captionStyle": {
    "detected": boolean,
    "casing": "upper" | "lower" | "title" | "sentence" (if detected),
    "position": "top" | "middle" | "bottom" | "dynamic" (if detected),
    "background": "none" | "dark-bar" | "pill" | "full-width" (if detected),
    "fontSize": "small" | "medium" | "large" (if detected),
    "animation": "none" | "pop" | "slide" | "bounce" | "typewriter" (if detected),
    "colorHex": "#RRGGBB hex color" (if detected)
  },
  "colorTemperature": "warm" | "neutral" | "cool" | "cinematic" | "flat",
  "zoomPatterns": {
    "levelsDetected": number (1-5),
    "style": "instant" | "gradual" | "mixed",
    "frequency": "none" | "low" | "medium" | "high"
  },
  "textOverlays": {
    "detected": boolean,
    "frequency": "none" | "light" | "moderate" | "heavy",
    "style": "description of text overlay style if detected"
  },
  "brollPresence": {
    "detected": boolean,
    "estimatedPercentage": number (0-100),
    "types": ["list of B-roll types detected, e.g. 'screen recording', 'product shots'"]
  },
  "productionQuality": "amateur" | "semi-pro" | "professional" | "high-end",
  "overallStyle": "1-2 sentence summary of the editing style"
}

Return ONLY the JSON object, no markdown formatting or explanation.`,
          },
        ],
      },
    ],
  });

  // Parse Claude's response
  const textBlock = response.content.find((c) => c.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No text response from Claude Vision");
  }

  // Extract JSON from response (handle potential markdown wrapping)
  let jsonStr = textBlock.text.trim();
  if (jsonStr.startsWith("```")) {
    jsonStr = jsonStr.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
  }

  try {
    const parsed = JSON.parse(jsonStr);
    return VisualAnalysisSchema.parse(parsed);
  } catch {
    // Return safe defaults if parsing fails
    return {
      captionStyle: { detected: false, casing: null, position: null, background: null, fontSize: null, animation: null, colorHex: null },
      colorTemperature: "neutral" as const,
      zoomPatterns: { levelsDetected: 1, style: "instant" as const, frequency: "low" as const },
      textOverlays: { detected: false, frequency: "none" as const, style: null },
      brollPresence: { detected: false, estimatedPercentage: 0, types: [] },
      productionQuality: "semi-pro" as const,
      overallStyle: "Could not analyze visual style",
    };
  }
}

/**
 * Select N frames evenly distributed from the array.
 */
function selectEvenly(frames: FrameSample[], count: number): FrameSample[] {
  if (frames.length <= count) return frames;
  const step = frames.length / count;
  const selected: FrameSample[] = [];
  for (let i = 0; i < count; i++) {
    selected.push(frames[Math.floor(i * step)]);
  }
  return selected;
}
