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
 * Load ALL Remotion skill rules — every .md file + asset examples.
 * Passes the entire knowledge base to Claude for maximum quality.
 */
async function loadFullRemotionSkills(): Promise<string> {
  const rulesDir = path.resolve(process.cwd(), ".claude/skills/remotion/rules");
  const parts: string[] = [];

  try {
    const files = await fs.readdir(rulesDir);
    const mdFiles = files.filter((f) => f.endsWith(".md")).sort();

    for (const file of mdFiles) {
      try {
        const content = await fs.readFile(path.join(rulesDir, file), "utf-8");
        parts.push(`=== ${file} ===\n${content}`);
      } catch { /* skip unreadable */ }
    }

    // Also load asset examples (real working Remotion components)
    const assetsDir = path.join(rulesDir, "assets");
    try {
      const assetFiles = await fs.readdir(assetsDir);
      for (const file of assetFiles.filter((f) => f.endsWith(".tsx"))) {
        try {
          const content = await fs.readFile(path.join(assetsDir, file), "utf-8");
          parts.push(`=== EXAMPLE: ${file} ===\n${content}`);
        } catch { /* skip */ }
      }
    } catch { /* no assets dir */ }
  } catch {
    // Fallback if directory doesn't exist
    return getFallbackRules();
  }

  if (parts.length === 0) return getFallbackRules();
  return parts.join("\n\n");
}

function getFallbackRules(): string {
  return `REMOTION CORE RULES:
- All animations MUST use useCurrentFrame() hook — NEVER CSS transitions or Tailwind animations
- Use interpolate() for linear animations, spring() for natural motion
- Always clamp: { extrapolateRight: "clamp", extrapolateLeft: "clamp" }
- spring() configs: { damping: 200 } smooth, { damping: 20, stiffness: 200 } snappy, { damping: 8 } bouncy
- Use Easing.out for entrances, Easing.in for exits
- Compose interpolations: create normalized progress (0-1), derive all properties from it
- Stagger delays: spring({ frame, fps, delay: i * STAGGER_DELAY })
- For typewriter: use string.slice(0, charCount), never per-character opacity
- SVG paths: use stroke-dasharray/dashoffset for drawing animations`;
}

/**
 * Complex visual effects reference for Claude.
 * These are advanced techniques beyond basic text/scale animations.
 */
const COMPLEX_EFFECTS_GUIDE = `
=== COMPLEX VISUAL EFFECTS GUIDE ===

These are advanced Remotion animation techniques. Use these to create cinematic, professional overlays.

## DOLLY ZOOM (Vertigo Effect)
Simultaneously zoom in while scaling down (or vice versa) to create a disorienting perspective shift.
\`\`\`tsx
const frame = useCurrentFrame();
const { fps, durationInFrames } = useVideoConfig();
const progress = interpolate(frame, [0, durationInFrames], [0, 1], { extrapolateRight: "clamp" });

// Zoom in while the container scales down — creates vertigo effect
const zoom = interpolate(progress, [0, 1], [1, 1.8]);
const counterScale = interpolate(progress, [0, 1], [1, 0.6]);

<div style={{
  transform: \`scale(\${zoom})\`,
}}>
  <div style={{
    transform: \`scale(\${counterScale})\`,
    transformOrigin: "center center",
  }}>
    {/* content */}
  </div>
</div>
\`\`\`

## KEN BURNS (Slow Zoom + Pan)
Subtle, cinematic slow zoom with gentle pan — used in documentaries.
\`\`\`tsx
const progress = interpolate(frame, [0, durationInFrames], [0, 1], { extrapolateRight: "clamp", easing: Easing.inOut(Easing.cubic) });
const scale = interpolate(progress, [0, 1], [1, 1.15]);
const translateX = interpolate(progress, [0, 1], [0, -20]);
const translateY = interpolate(progress, [0, 1], [0, -10]);

<div style={{ transform: \`scale(\${scale}) translate(\${translateX}px, \${translateY}px)\` }}>
\`\`\`

## PARALLAX LAYERS
Multiple layers moving at different speeds for depth.
\`\`\`tsx
const progress = interpolate(frame, [0, durationInFrames], [0, 1], { extrapolateRight: "clamp" });
// Background moves slow, foreground moves fast
const bgY = interpolate(progress, [0, 1], [0, -20]);
const midY = interpolate(progress, [0, 1], [0, -40]);
const fgY = interpolate(progress, [0, 1], [0, -80]);
\`\`\`

## GLITCH EFFECT
Random position/color shifts for impact moments.
\`\`\`tsx
const glitchActive = frame % 8 < 2; // Glitch every 8 frames for 2 frames
const glitchX = glitchActive ? (Math.sin(frame * 73) * 10) : 0;
const glitchY = glitchActive ? (Math.cos(frame * 47) * 5) : 0;
const clipPath = glitchActive ? \`inset(\${Math.random() * 40}% 0 \${Math.random() * 40}% 0)\` : "none";
\`\`\`

## REVEAL WIPE
Content revealed by an animated mask/bar sweeping across.
\`\`\`tsx
const wipeProgress = spring({ frame, fps, config: { damping: 200 } });
const clipPercent = interpolate(wipeProgress, [0, 1], [0, 100]);
<div style={{ clipPath: \`inset(0 \${100 - clipPercent}% 0 0)\` }}>
\`\`\`

## MORPHING NUMBERS / COUNTER
Smooth number counting with easing.
\`\`\`tsx
const progress = interpolate(frame, [0, 2 * fps], [0, 1], { extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
const displayNumber = Math.round(interpolate(progress, [0, 1], [0, targetValue]));
<span>{displayNumber.toLocaleString()}</span>
\`\`\`

## CIRCULAR PROGRESS / RADIAL WIPE
SVG circle that fills as a progress indicator.
\`\`\`tsx
const circumference = 2 * Math.PI * radius;
const progress = spring({ frame, fps, config: { damping: 200 } });
const strokeDashoffset = circumference * (1 - progress);
<circle r={radius} cx={cx} cy={cy} fill="none" stroke={color}
  strokeWidth={8} strokeDasharray={circumference}
  strokeDashoffset={strokeDashoffset} strokeLinecap="round"
  transform={\`rotate(-90 \${cx} \${cy})\`} />
\`\`\`

## STAGGERED GRID REVEAL
Items in a grid appear one by one with staggered spring delays.
\`\`\`tsx
const items = data.map((item, i) => {
  const row = Math.floor(i / cols);
  const col = i % cols;
  const delay = (row + col) * 4; // Diagonal reveal
  const scale = spring({ frame, fps, delay, config: { damping: 200 } });
  const opacity = interpolate(frame - delay, [0, 8], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return { ...item, scale, opacity };
});
\`\`\`

## 3D FLIP / CARD REVEAL
Element rotates in 3D to reveal content.
\`\`\`tsx
const flipProgress = spring({ frame, fps, config: { damping: 15, stiffness: 80 } });
const rotateY = interpolate(flipProgress, [0, 1], [90, 0]);
<div style={{ perspective: 1000, perspectiveOrigin: "center" }}>
  <div style={{ transform: \`rotateY(\${rotateY}deg)\`, backfaceVisibility: "hidden" }}>
\`\`\`

## SPLIT SCREEN COMPARISON
Two panels slide in from opposite sides.
\`\`\`tsx
const leftSlide = spring({ frame, fps, config: { damping: 200 } });
const rightSlide = spring({ frame, fps, delay: 8, config: { damping: 200 } });
const leftX = interpolate(leftSlide, [0, 1], [-50, 0]); // % units
const rightX = interpolate(rightSlide, [0, 1], [50, 0]);
\`\`\`

## PULSE / BREATHING GLOW
Subtle scale oscillation for emphasis.
\`\`\`tsx
const pulse = Math.sin(frame * 0.15) * 0.03 + 1; // Scale between 0.97 and 1.03
const glowOpacity = Math.sin(frame * 0.1) * 0.3 + 0.7;
<div style={{ transform: \`scale(\${pulse})\`, filter: \`drop-shadow(0 0 \${glowOpacity * 20}px \${primaryColor})\` }}>
\`\`\`

## ELASTIC BOUNCE ENTRANCE
Spring with low damping for playful, bouncy entrances.
\`\`\`tsx
const bounce = spring({ frame, fps, config: { damping: 8, stiffness: 150 } });
const scale = interpolate(bounce, [0, 1], [0, 1]); // Overshoots then settles
const rotation = interpolate(bounce, [0, 1], [-15, 0]);
\`\`\`

## TYPEWRITER WITH CURSOR
Text appears character by character with blinking cursor.
\`\`\`tsx
const charCount = Math.floor(frame / 2); // 2 frames per character
const displayText = fullText.slice(0, charCount);
const cursorOpacity = interpolate(frame % 16, [0, 8, 16], [1, 0, 1]);
<span>{displayText}<span style={{ opacity: cursorOpacity }}>|</span></span>
\`\`\`

## WORD HIGHLIGHT WIPE
Highlighter pen effect sweeping under a word.
\`\`\`tsx
const wipeProgress = spring({ frame, fps, delay: startDelay, config: { damping: 200 } });
<span style={{ position: "relative" }}>
  <span style={{ position: "absolute", left: 0, right: 0, bottom: "0.1em", height: "0.35em",
    backgroundColor: highlightColor, transform: \`scaleX(\${wipeProgress})\`, transformOrigin: "left",
    borderRadius: 4, zIndex: 0 }} />
  <span style={{ position: "relative", zIndex: 1 }}>{word}</span>
</span>
\`\`\`
`;

/**
 * Generate Remotion React components for each show moment.
 *
 * Passes to Claude:
 * - ALL Remotion skill rules (every .md file + asset examples)
 * - FULL Creator DNA skill content (no truncation)
 * - Complex effects guide (dolly zoom, vertigo, Ken Burns, parallax, etc.)
 */
export async function generateAnimations(
  moments: ShowMoment[],
  brand: Partial<BrandConfig> = {},
  dnaSkillContent?: string
): Promise<GeneratedAnimation[]> {
  if (moments.length === 0) return [];

  const b = { ...DEFAULT_BRAND, ...brand };
  const remotionSkills = await loadFullRemotionSkills();
  const animations: GeneratedAnimation[] = [];

  for (const moment of moments) {
    try {
      const anim = await generateSingleAnimation(moment, b, remotionSkills, dnaSkillContent || "");
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
  remotionSkills: string,
  dnaSkillContent: string
): Promise<GeneratedAnimation | null> {
  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 6000,
    messages: [{
      role: "user",
      content: `You are an expert Remotion motion graphics developer. Create a visually stunning, cinematic overlay animation component.

============================
REMOTION SKILL RULES (FULL)
============================
${remotionSkills}

${COMPLEX_EFFECTS_GUIDE}

============================
CREATOR DNA SKILL (FULL)
============================
${dnaSkillContent || "No DNA skill provided — use defaults."}

============================
BRAND SYSTEM
============================
- Primary: ${brand.primaryColor}
- Secondary: ${brand.secondaryColor}
- Heading font: "${brand.headingFont}"
- Body font: "${brand.bodyFont}"
- Animation style: ${brand.animationStyle}
- Dark mode: ${brand.darkModeDefault}

============================
MOMENT TO ANIMATE
============================
- Type: ${moment.suggested_type}
- Content: "${moment.content}"
- Context: "${moment.context}"
- Duration: ${moment.duration_s}s @ 30fps = ${Math.round(moment.duration_s * 30)} frames

============================
WHAT TO BUILD FOR EACH TYPE
============================
- text_card → Use REVEAL WIPE + PARALLAX or DOLLY ZOOM entrance. Bold statement with accent line, gradient glow, word highlight on key word. NOT just plain text.
- animated_counter → Use MORPHING NUMBERS + CIRCULAR PROGRESS. Smooth eased counting with a radial or bar progress indicator. Show unit/label.
- building_flowchart → Use STAGGERED GRID REVEAL. Nodes appear with connecting animated lines (SVG). Each step springs in with delay. Arrow/line draws with dashoffset.
- side_by_side → Use SPLIT SCREEN COMPARISON + 3D FLIP. Two panels slide/flip from opposite sides. Color-coded with brand colors.
- list_builder → Use staggered springs with ELASTIC BOUNCE. Each bullet slides up and bounces into place. Accent dots/icons per item.
- data_bar → Use bar chart pattern from Remotion skills. Horizontal bars fill with spring(). Labels and values animate. Background grid lines.
- framework_grid → Use STAGGERED GRID REVEAL with 3D FLIP per cell. Diagonal reveal pattern. Each cell has icon + label.

============================
STRICT REQUIREMENTS
============================
1. export default function AnimOverlay() { ... }
2. Import ONLY from "remotion": { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring, Easing }
3. All animation driven by useCurrentFrame() — NEVER CSS transitions/Tailwind
4. Use brand colors and fonts
5. Always clamp interpolation
6. TRANSPARENT OVERLAY — no backgroundColor on <AbsoluteFill>
   - Text shadow: textShadow: "0 2px 12px rgba(0,0,0,0.9), 0 1px 3px rgba(0,0,0,0.6)"
   - Pill backgrounds: rgba(0,0,0,0.65) with borderRadius
7. ENTER animation (first 15-20 frames) + EXIT animation (last 10-15 frames)
8. Make it CINEMATIC — use multiple effects:
   - Combine scale + translate + opacity + rotation
   - Use parallax (elements at different speeds)
   - Staggered timing for multiple elements
   - Accent decorations (lines, dots, glows, SVG shapes)
   - Visual hierarchy (size, weight, color contrast)
   - Ken Burns or dolly zoom where appropriate
9. The component is self-contained — no external imports

Return ONLY the TypeScript React component code. No markdown fences, no explanation.`,
    }],
  });

  const textBlock = response.content.find((c) => c.type === "text");
  if (!textBlock || textBlock.type !== "text") return null;

  let code = textBlock.text.trim();

  if (code.startsWith("```")) {
    code = code.replace(/^```(?:tsx?|jsx?)?\n?/, "").replace(/\n?```$/, "");
  }

  if (!code.includes("export default")) {
    const match = code.match(/(?:const|function)\s+(\w+)/);
    if (match) {
      code += `\nexport default ${match[1]};`;
    } else {
      code = buildFallbackComponent(moment, brand);
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
      secondaryColor: brand.secondaryColor,
    },
  };
}

function buildFallbackComponent(moment: ShowMoment, brand: BrandConfig): string {
  const content = JSON.stringify(moment.content);
  return `import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring, Easing } from "remotion";

export default function AnimOverlay() {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  // Ken Burns entrance
  const kenBurns = interpolate(frame, [0, durationInFrames], [1, 1.08], {
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.cubic),
  });

  // Reveal wipe
  const wipe = spring({ frame, fps, config: { damping: 200 } });
  const clipPercent = interpolate(wipe, [0, 1], [100, 0]);

  // Enter/exit
  const enterOpacity = interpolate(frame, [0, 15], [0, 1], { extrapolateRight: "clamp" });
  const exitOpacity = interpolate(frame, [durationInFrames - 12, durationInFrames], [1, 0], { extrapolateLeft: "clamp" });
  const opacity = Math.min(enterOpacity, exitOpacity);

  // Slide up entrance
  const slideUp = spring({ frame, fps, config: { damping: 200 } });
  const translateY = interpolate(slideUp, [0, 1], [40, 0]);

  // Accent line
  const lineProgress = spring({ frame, fps, delay: 5, config: { damping: 200 } });
  const lineWidth = interpolate(lineProgress, [0, 1], [0, 120]);

  // Accent dot pulse
  const pulse = Math.sin(frame * 0.15) * 0.3 + 0.7;

  return (
    <AbsoluteFill style={{
      justifyContent: "center",
      alignItems: "center",
      transform: \`scale(\${kenBurns})\`,
    }}>
      <div style={{
        opacity,
        transform: \`translateY(\${translateY}px)\`,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 16,
      }}>
        {/* Accent dot */}
        <div style={{
          width: 8, height: 8,
          borderRadius: "50%",
          backgroundColor: "${brand.primaryColor}",
          opacity: pulse,
          boxShadow: \`0 0 \${pulse * 15}px ${brand.primaryColor}\`,
        }} />

        {/* Top accent line */}
        <div style={{
          width: lineWidth,
          height: 3,
          backgroundColor: "${brand.primaryColor}",
          borderRadius: 2,
        }} />

        {/* Main text with reveal wipe */}
        <div style={{
          clipPath: \`inset(0 \${clipPercent}% 0 0)\`,
        }}>
          <div style={{
            fontSize: 56,
            fontWeight: 700,
            color: "#ffffff",
            fontFamily: "${brand.headingFont}",
            padding: "20px 48px",
            backgroundColor: "rgba(0,0,0,0.65)",
            borderRadius: 16,
            textShadow: "0 2px 12px rgba(0,0,0,0.9), 0 1px 3px rgba(0,0,0,0.6)",
            borderLeft: \`4px solid ${brand.primaryColor}\`,
            textAlign: "center",
            maxWidth: 900,
          }}>
            ${content}
          </div>
        </div>

        {/* Bottom accent line */}
        <div style={{
          width: lineWidth * 0.6,
          height: 2,
          backgroundColor: "${brand.secondaryColor}",
          borderRadius: 2,
        }} />
      </div>
    </AbsoluteFill>
  );
}`;
}
