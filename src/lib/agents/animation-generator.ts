import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import type { ShowMoment } from "./show-moment-detector";

const anthropic = new Anthropic();

export const GeneratedAnimationSchema = z.object({
  timestamp_s: z.number(),
  duration_s: z.number(),
  type: z.string(),
  component_code: z.string(),
  props: z.record(z.string(), z.any()),
});

export type GeneratedAnimation = z.infer<typeof GeneratedAnimationSchema>;

interface BrandConfig {
  headingFont: string;
  bodyFont: string;
  primaryColor: string;
  secondaryColor: string;
  animationStyle: string;
  darkModeDefault: boolean;
}

const DEFAULT_BRAND: BrandConfig = {
  headingFont: "DM Serif Display",
  bodyFont: "DM Sans",
  primaryColor: "#E8620E",
  secondaryColor: "#0E5C58",
  animationStyle: "slide-up",
  darkModeDefault: true,
};

/**
 * Available pre-built Remotion compositions.
 * These follow Remotion best practices:
 * - All animations driven by useCurrentFrame()
 * - No CSS transitions or Tailwind animation classes
 * - Uses interpolate() and spring() for motion
 */
const COMPOSITION_TYPES = {
  text_card: "TextCard",
  animated_counter: "AnimatedCounter",
  list_builder: "ListBuilder",
  building_flowchart: "ListBuilder",
  side_by_side: "TextCard",
  data_bar: "AnimatedCounter",
  framework_grid: "ListBuilder",
} as const;

/**
 * Generate animation specs for detected show moments.
 * Uses Claude to decide which composition type and props to use,
 * then maps to our pre-built Remotion compositions.
 */
export async function generateAnimations(
  moments: ShowMoment[],
  brand: Partial<BrandConfig> = {},
  dnaSkillContent?: string
): Promise<GeneratedAnimation[]> {
  if (moments.length === 0) return [];

  const b = { ...DEFAULT_BRAND, ...brand };

  const momentDescriptions = moments
    .map((m, i) =>
      `${i}: [${m.timestamp_s}s, ${m.duration_s}s] type=${m.suggested_type} content="${m.content}" context="${m.context}"`
    )
    .join("\n");

  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 2000,
    messages: [{
      role: "user",
      content: `For each moment, pick the best animation type and extract the display props.

AVAILABLE TYPES:
- text_card: { text: string } — bold statement, key takeaway
- animated_counter: { value: number, label: string } — statistic, count
- list_builder: { items: string[], title: string } — list of 2+ points

BRAND COLORS: primary=${b.primaryColor}, bg=${b.darkModeDefault ? "#111" : "#fff"}

MOMENTS:
${momentDescriptions}

Return JSON array:
[{"index": 0, "type": "text_card", "props": {"text": "Key point here"}}, ...]

Return ONLY the JSON array.`,
    }],
  });

  const textBlock = response.content.find((c) => c.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    return fallbackAnimations(moments, b);
  }

  let jsonStr = textBlock.text.trim();
  if (jsonStr.startsWith("```")) {
    jsonStr = jsonStr.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
  }

  try {
    const results = JSON.parse(jsonStr);
    return results.map((r: any) => {
      const moment = moments[r.index] ?? moments[0];
      const type = r.type || moment.suggested_type;
      return {
        timestamp_s: moment.timestamp_s,
        duration_s: moment.duration_s,
        type,
        component_code: "", // Not used — we use pre-built compositions
        props: {
          ...r.props,
          primaryColor: b.primaryColor,
          bgColor: b.darkModeDefault ? "#111" : "#fff",
          fontFamily: b.headingFont,
        },
      };
    });
  } catch {
    return fallbackAnimations(moments, b);
  }
}

function fallbackAnimations(moments: ShowMoment[], brand: BrandConfig): GeneratedAnimation[] {
  return moments.map((m) => ({
    timestamp_s: m.timestamp_s,
    duration_s: m.duration_s,
    type: "text_card",
    component_code: "",
    props: {
      text: m.content,
      primaryColor: brand.primaryColor,
      bgColor: brand.darkModeDefault ? "#111" : "#fff",
      fontFamily: brand.headingFont,
    },
  }));
}
