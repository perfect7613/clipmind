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
 * Generate Remotion React components for detected show moments.
 * Uses claude-sonnet with knowledge of Remotion APIs.
 */
export async function generateAnimations(
  moments: ShowMoment[],
  brand: Partial<BrandConfig> = {},
  dnaSkillContent?: string
): Promise<GeneratedAnimation[]> {
  if (moments.length === 0) return [];

  const b = { ...DEFAULT_BRAND, ...brand };
  const animations: GeneratedAnimation[] = [];

  // Process in batches of 3 to avoid hitting token limits
  for (let i = 0; i < moments.length; i += 3) {
    const batch = moments.slice(i, i + 3);
    const batchResults = await generateBatch(batch, b, dnaSkillContent);
    animations.push(...batchResults);
  }

  return animations;
}

async function generateBatch(
  moments: ShowMoment[],
  brand: BrandConfig,
  dnaSkillContent?: string
): Promise<GeneratedAnimation[]> {
  const momentDescriptions = moments
    .map((m, i) => `
Moment ${i + 1}:
- Timestamp: ${m.timestamp_s}s, Duration: ${m.duration_s}s
- Type: ${m.suggested_type}
- Content: "${m.content}"
- Context: "${m.context}"`)
    .join("\n");

  const prompt = `Generate Remotion React components for these animation moments.

BRAND SYSTEM:
- Heading font: ${brand.headingFont}
- Body font: ${brand.bodyFont}
- Primary color: ${brand.primaryColor}
- Secondary color: ${brand.secondaryColor}
- Animation style: ${brand.animationStyle}
- Dark mode: ${brand.darkModeDefault}
${dnaSkillContent ? `\nCREATOR DNA CONTEXT:\n${dnaSkillContent.slice(0, 500)}` : ""}

MOMENTS:
${momentDescriptions}

For each moment, generate a complete Remotion React component. Use these imports:
import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from 'remotion';

RULES:
- Each component must be a valid React functional component
- Use the brand colors and fonts
- Use spring() or interpolate() for smooth animations
- Component should be self-contained (no external imports besides remotion)
- Duration should match the moment's duration_s (at 30fps)

Return a JSON array:
[
  {
    "moment_index": 0,
    "component_code": "full React component code as a string",
    "props": { "text": "...", "primaryColor": "..." }
  }
]

Return ONLY the JSON array.`;

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-5-20250514",
    max_tokens: 4000,
    messages: [{ role: "user", content: prompt }],
  });

  const textBlock = response.content.find((c) => c.type === "text");
  if (!textBlock || textBlock.type !== "text") return [];

  let jsonStr = textBlock.text.trim();
  if (jsonStr.startsWith("```")) {
    jsonStr = jsonStr.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
  }

  try {
    const results = JSON.parse(jsonStr);
    return results.map((r: any) => {
      const moment = moments[r.moment_index] || moments[0];
      return {
        timestamp_s: moment.timestamp_s,
        duration_s: moment.duration_s,
        type: moment.suggested_type,
        component_code: r.component_code,
        props: r.props || {},
      };
    });
  } catch {
    // Fallback: generate simple text cards
    return moments.map((m) => ({
      timestamp_s: m.timestamp_s,
      duration_s: m.duration_s,
      type: m.suggested_type,
      component_code: generateFallbackTextCard(m.content, brand),
      props: { text: m.content },
    }));
  }
}

function generateFallbackTextCard(text: string, brand: BrandConfig): string {
  return `import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from 'remotion';

export const TextCard = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const opacity = interpolate(frame, [0, 8], [0, 1], { extrapolateRight: 'clamp' });
  const translateY = spring({ frame, fps, config: { stiffness: 200, damping: 20 } });

  return (
    <AbsoluteFill style={{
      backgroundColor: '${brand.darkModeDefault ? "#111" : "#fff"}',
      justifyContent: 'center',
      alignItems: 'center',
    }}>
      <div style={{
        fontFamily: '${brand.headingFont}',
        fontSize: 72,
        color: '${brand.primaryColor}',
        opacity,
        transform: \`translateY(\${(1 - translateY) * 50}px)\`,
        padding: '0 80px',
        textAlign: 'center',
        fontWeight: 700,
      }}>
        ${JSON.stringify(text)}
      </div>
    </AbsoluteFill>
  );
};`;
}
