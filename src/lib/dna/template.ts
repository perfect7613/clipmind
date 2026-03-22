import { generateComparativeSection } from "./baseline";

export interface DnaTemplateParams {
  username: string;
  creatorName: string;
  captionStyle: {
    casing: string;
    position: string;
    background: string;
    avgWords: number;
    fontSize: string;
    animation: string;
    colorHex: string;
  };
  zoom: {
    aggressiveness: number;
    maxZoomLevel: number;
    triggers: string[];
  };
  audio: {
    style: string;
    targetLufs: number;
    targetTruePeak: number;
  };
  color: {
    profile: string;
  };
  brand: {
    headingFont: string;
    bodyFont: string;
    primaryColor: string;
    secondaryColor: string;
    animationStyle: string;
    darkModeDefault: boolean;
  };
  pacing: {
    preferredClipLengthMin: number;
    preferredClipLengthMax: number;
    cutsPerMinute: number;
    silenceToleranceMs: number;
    removeFillers: boolean;
    fillerWords: string[];
  };
  speedRamp: {
    intensity: string;
    slowMoFactor: number;
    speedUpFactor: number;
  };
  animationDensity: string;
  contentType: string;
  humorType: string;
  energyLevel: string;
  hookPattern: string;
  // New: comparative + observations
  brollPercentage?: number;
  speechRatio?: number;
  observations?: string[];
}

export function generateDnaSkillContent(params: DnaTemplateParams): string {
  return `---
name: creator-dna-${params.username}
description: Editing style profile for ${params.creatorName}. Defines caption style, zoom behavior, audio standards, color preferences, animation density, brand system, and pacing rules. Referenced by all pipeline agents when editing this creator's videos.
---

# Creator DNA — ${params.creatorName}

## Caption Style

- Casing: ${params.captionStyle.casing}
- Position: ${params.captionStyle.position}
- Background: ${params.captionStyle.background}
- Average words per phrase: ${params.captionStyle.avgWords}
- Font size: ${params.captionStyle.fontSize}
- Animation: ${params.captionStyle.animation}
- Color: ${params.captionStyle.colorHex}

## Zoom Behavior

- Aggressiveness: ${params.zoom.aggressiveness} (0-1 scale)
- Max zoom level: ${params.zoom.maxZoomLevel}x
- Triggers: ${params.zoom.triggers.join(", ")}

When this creator emphasizes a point, use punched-in zoom (~130%). For emotional peaks or bold claims, use tight zoom (~150%). Default to normal framing for factual content.

## Audio Standards

- Style: ${params.audio.style}
- Target LUFS: ${params.audio.targetLufs}
- Target true peak: ${params.audio.targetTruePeak} dBTP

## Color Profile

- Profile: ${params.color.profile}
- Vignette: ${params.color.profile === "cinematic" || params.color.profile === "warm" ? "true" : "false"}
- Vignette intensity: ${params.color.profile === "cinematic" ? "0.4" : "0.2"}
- Film grain: ${params.color.profile === "cinematic" ? "true" : "false"}
- Film grain intensity: ${params.color.profile === "cinematic" ? "0.15" : "0"}
- Sharpen: false
- Fade in: ${params.color.profile === "cinematic" ? "true" : "false"}
- Fade out: ${params.color.profile === "cinematic" ? "true" : "false"}

## Brand System

- Heading font: ${params.brand.headingFont}
- Body font: ${params.brand.bodyFont}
- Primary color: ${params.brand.primaryColor}
- Secondary color: ${params.brand.secondaryColor}
- Animation style: ${params.brand.animationStyle}
- Dark mode default: ${params.brand.darkModeDefault}

## Pacing

- Preferred clip length: ${params.pacing.preferredClipLengthMin}s - ${params.pacing.preferredClipLengthMax}s
- Cuts per minute: ${params.pacing.cutsPerMinute}
- Silence tolerance: ${params.pacing.silenceToleranceMs}ms
- Remove fillers: ${params.pacing.removeFillers}
- Filler words: ${params.pacing.fillerWords.join(", ")}

## Speed Ramping

- Intensity: ${params.speedRamp.intensity}
- Slow-mo factor: ${params.speedRamp.slowMoFactor}x
- Speed-up factor: ${params.speedRamp.speedUpFactor}x

## Transitions

- Type: cross-dissolve
- Duration: 0.5s
- Between clips: cross-dissolve

## Animation Density

- Frequency: ${params.animationDensity}

## Content Type

- Type: ${params.contentType}
- Humor: ${params.humorType}
- Energy: ${params.energyLevel}
- Hook pattern: ${params.hookPattern}

## Style vs Average (Comparative)

${generateComparativeSection({
  cutsPerMinute: params.pacing.cutsPerMinute,
  zoomAggressiveness: params.zoom.aggressiveness,
  silenceToleranceMs: params.pacing.silenceToleranceMs,
  energyLevel: params.energyLevel,
  animationDensity: params.animationDensity,
  brollPercentage: params.brollPercentage,
  speechRatio: params.speechRatio,
})}

## Observations

${(params.observations && params.observations.length > 0)
  ? params.observations.map((o) => `- ${o}`).join("\n")
  : "- No specific observations yet. Will be populated after analyzing more videos."}
`;
}
