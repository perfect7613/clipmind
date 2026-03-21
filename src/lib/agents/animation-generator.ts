import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { promises as fs } from "fs";
import path from "path";
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
 * Load key Remotion skill rules to pass as context to Claude.
 */
async function loadRemotionSkillContext(): Promise<string> {
  const skillDir = path.resolve(process.cwd(), ".claude/skills/remotion/rules");
  const rules: string[] = [];

  for (const file of ["animations.md", "timing.md", "compositions.md"]) {
    try {
      const content = await fs.readFile(path.join(skillDir, file), "utf-8");
      rules.push(content);
    } catch {
      // Skill files may not exist
    }
  }

  if (rules.length === 0) {
    return `REMOTION RULES:
- All animations MUST use useCurrentFrame() hook
- Use interpolate() for linear animations, spring() for natural motion
- CSS transitions and Tailwind animations are FORBIDDEN
- Always clamp extrapolation: { extrapolateRight: "clamp" }
- spring() config: { damping: 200 } for smooth, { damping: 20, stiffness: 200 } for snappy`;
  }

  return "REMOTION SKILL RULES:\n" + rules.join("\n---\n").slice(0, 3000);
}

/**
 * Generate Remotion React components on the fly for each show moment.
 * Uses Claude Sonnet with Remotion skill rules + Creator DNA brand system
 * to generate unique, contextual animations.
 */
export async function generateAnimations(
  moments: ShowMoment[],
  brand: Partial<BrandConfig> = {},
  dnaSkillContent?: string
): Promise<GeneratedAnimation[]> {
  if (moments.length === 0) return [];

  const b = { ...DEFAULT_BRAND, ...brand };
  const remotionRules = await loadRemotionSkillContext();
  const animations: GeneratedAnimation[] = [];

  // Generate each animation individually for better quality
  for (const moment of moments) {
    try {
      const anim = await generateSingleAnimation(moment, b, remotionRules, dnaSkillContent);
      if (anim) animations.push(anim);
    } catch (err) {
      console.error(`[AnimGen] Failed for moment at ${moment.timestamp_s}s:`, err);
    }
  }

  return animations;
}

async function generateSingleAnimation(
  moment: ShowMoment,
  brand: BrandConfig,
  remotionRules: string,
  dnaSkillContent?: string
): Promise<GeneratedAnimation | null> {
  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 3000,
    messages: [{
      role: "user",
      content: `Generate a Remotion React component for this video animation moment.

${remotionRules}

BRAND SYSTEM:
- Primary color: ${brand.primaryColor}
- Secondary color: ${brand.secondaryColor}
- Background: ${brand.darkModeDefault ? "#111111" : "#ffffff"}
- Heading font: ${brand.headingFont}
- Body font: ${brand.bodyFont}
- Style: ${brand.animationStyle}
${dnaSkillContent ? `\nCREATOR DNA (excerpt):\n${dnaSkillContent.slice(0, 400)}` : ""}

MOMENT TO ANIMATE:
- Type: ${moment.suggested_type}
- Content: "${moment.content}"
- Context: "${moment.context}"
- Duration: ${moment.duration_s} seconds at 30fps = ${Math.round(moment.duration_s * 30)} frames

STRICT REQUIREMENTS:
1. The component MUST be a default export: export default function AnimComponent() { ... }
2. Import ONLY from "remotion": { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring }
3. All animation driven by useCurrentFrame() — NO CSS transitions, NO Tailwind animations
4. Use the brand colors and fonts from above
5. Use spring() for entrances, interpolate() for progress-based values
6. Clamp extrapolation: { extrapolateRight: "clamp", extrapolateLeft: "clamp" }
7. The component must be self-contained — no external imports, no external state

Return ONLY the complete TypeScript React component code. No markdown, no explanation, no backticks.`,
    }],
  });

  const textBlock = response.content.find((c) => c.type === "text");
  if (!textBlock || textBlock.type !== "text") return null;

  let code = textBlock.text.trim();

  // Strip markdown code fences if present
  if (code.startsWith("```")) {
    code = code.replace(/^```(?:tsx?|jsx?)?\n?/, "").replace(/\n?```$/, "");
  }

  // Ensure it has a default export
  if (!code.includes("export default")) {
    // Try to find the component name and add default export
    const match = code.match(/(?:const|function)\s+(\w+)/);
    if (match) {
      code += `\nexport default ${match[1]};`;
    } else {
      // Wrap in a default export
      code = `import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";

export default function AnimComponent() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const opacity = interpolate(frame, [0, 10], [0, 1], { extrapolateRight: "clamp" });
  const slideUp = spring({ frame, fps, config: { damping: 200 } });

  return (
    <AbsoluteFill style={{ backgroundColor: "${brand.darkModeDefault ? "#111" : "#fff"}", justifyContent: "center", alignItems: "center" }}>
      <div style={{ fontSize: 64, fontWeight: 700, color: "${brand.primaryColor}", opacity, transform: \`translateY(\${(1 - slideUp) * 40}px)\`, textAlign: "center", fontFamily: "${brand.headingFont}", padding: "0 80px" }}>
        ${JSON.stringify(moment.content)}
      </div>
    </AbsoluteFill>
  );
}`;
    }
  }

  return {
    timestamp_s: moment.timestamp_s,
    duration_s: moment.duration_s,
    type: moment.suggested_type,
    component_code: code,
    props: {
      text: moment.content,
      primaryColor: brand.primaryColor,
      bgColor: brand.darkModeDefault ? "#111" : "#fff",
    },
  };
}
