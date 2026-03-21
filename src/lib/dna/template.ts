export function generateDnaSkillContent(params: {
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
  animationDensity: string;
  contentType: string;
  humorType: string;
  energyLevel: string;
  hookPattern: string;
}): string {
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

## Animation Density

- Frequency: ${params.animationDensity}

## Content Type

- Type: ${params.contentType}
- Humor: ${params.humorType}
- Energy: ${params.energyLevel}
- Hook pattern: ${params.hookPattern}
`;
}
