import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { promises as fs } from "fs";
import type { FrameSample } from "./frame-sampler";

const anthropic = new Anthropic();

// Output schema
export const VisualAnalysisSchema = z.object({
  captionStyle: z.object({
    detected: z.boolean(),
    casing: z.enum(["upper", "lower", "title", "sentence"]).optional(),
    position: z.enum(["top", "middle", "bottom", "dynamic"]).optional(),
    background: z.enum(["none", "dark-bar", "pill", "full-width"]).optional(),
    fontSize: z.enum(["small", "medium", "large"]).optional(),
    animation: z.enum(["none", "pop", "slide", "bounce", "typewriter"]).optional(),
    colorHex: z.string().optional(),
  }),
  colorTemperature: z.enum(["warm", "neutral", "cool", "cinematic", "flat"]),
  zoomPatterns: z.object({
    levelsDetected: z.number().min(1).max(5),
    style: z.enum(["instant", "gradual", "mixed"]),
    frequency: z.enum(["none", "low", "medium", "high"]),
  }),
  textOverlays: z.object({
    detected: z.boolean(),
    frequency: z.enum(["none", "light", "moderate", "heavy"]),
    style: z.string().optional(),
  }),
  brollPresence: z.object({
    detected: z.boolean(),
    estimatedPercentage: z.number().min(0).max(100),
    types: z.array(z.string()),
  }),
  productionQuality: z.enum(["amateur", "semi-pro", "professional", "high-end"]),
  overallStyle: z.string(),
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
    model: "claude-sonnet-4-5-20250514",
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

  const parsed = JSON.parse(jsonStr);
  return VisualAnalysisSchema.parse(parsed);
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
