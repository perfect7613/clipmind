export interface FilmmakerPreset {
  id: string;
  name: string;
  description: string;
  category: "cinematic" | "social" | "classic";
  skillContent: string;
}

function makeSkillContent(params: {
  id: string;
  name: string;
  description: string;
  colorProfile: string;
  grain: number;
  vignette: number;
  zoomAggressiveness: number;
  zoomLabel: string;
  transition: string;
  speed: string;
  captionCasing: string;
  captionPosition: string;
  captionBackground: string;
  captionAvgWords: number;
  captionFontSize: string;
  captionAnimation: string;
  captionColor: string;
  audioStyle: string;
  targetLufs: number;
  targetTruePeak: number;
  headingFont: string;
  bodyFont: string;
  primaryColor: string;
  secondaryColor: string;
  animationStyle: string;
  darkModeDefault: boolean;
  clipLengthMin: number;
  clipLengthMax: number;
  cutsPerMinute: number;
  silenceToleranceMs: number;
  removeFillers: boolean;
  animationDensity: string;
  contentType: string;
  energyLevel: string;
  hookPattern: string;
}): string {
  return `---
name: preset-${params.id}
description: ${params.description}
---

# Filmmaker Preset -- ${params.name}

## Caption Style

- Casing: ${params.captionCasing}
- Position: ${params.captionPosition}
- Background: ${params.captionBackground}
- Average words per phrase: ${params.captionAvgWords}
- Font size: ${params.captionFontSize}
- Animation: ${params.captionAnimation}
- Color: ${params.captionColor}

## Zoom Behavior

- Aggressiveness: ${params.zoomAggressiveness} (0-1 scale, ${params.zoomLabel})
- Max zoom level: ${params.zoomAggressiveness >= 0.8 ? "1.5" : params.zoomAggressiveness >= 0.5 ? "1.3" : "1.15"}x
- Triggers: emphasis, emotional_peak, punchline

When emphasizing a point, use punched-in zoom (~130%). For emotional peaks or bold claims, use tight zoom (~150%). Default to normal framing for factual content.

## Audio Standards

- Style: ${params.audioStyle}
- Target LUFS: ${params.targetLufs}
- Target true peak: ${params.targetTruePeak} dBTP

## Color Profile

- Profile: ${params.colorProfile}
- Vignette: ${params.vignette > 0 ? "true" : "false"}
- Vignette intensity: ${params.vignette}
- Film grain: ${params.grain > 0 ? "true" : "false"}
- Film grain intensity: ${params.grain}
- Sharpen: false
- Fade in: true
- Fade out: true

## Transitions

- Type: ${params.transition}
- Speed ramp: ${params.speed}

## Brand System

- Heading font: ${params.headingFont}
- Body font: ${params.bodyFont}
- Primary color: ${params.primaryColor}
- Secondary color: ${params.secondaryColor}
- Animation style: ${params.animationStyle}
- Dark mode default: ${params.darkModeDefault}

## Pacing

- Preferred clip length: ${params.clipLengthMin}s - ${params.clipLengthMax}s
- Cuts per minute: ${params.cutsPerMinute}
- Silence tolerance: ${params.silenceToleranceMs}ms
- Remove fillers: ${params.removeFillers}
- Filler words: um, uh, like, you know, so, basically

## Animation Density

- Frequency: ${params.animationDensity}

## Content Type

- Type: ${params.contentType}
- Energy: ${params.energyLevel}
- Hook pattern: ${params.hookPattern}
`;
}

const presets: FilmmakerPreset[] = [
  {
    id: "cinematic-dark",
    name: "Cinematic Dark",
    description: "Moody, high-contrast look with deep blacks, film grain, heavy vignette, and aggressive zooms. Dip-to-black transitions with moderate speed ramps.",
    category: "cinematic",
    skillContent: makeSkillContent({
      id: "cinematic-dark",
      name: "Cinematic Dark",
      description: "Moody cinematic style with deep blacks, film grain, heavy vignette, and aggressive zooms. Dip-to-black transitions with moderate speed ramps.",
      colorProfile: "cinematic",
      grain: 0.25,
      vignette: 0.6,
      zoomAggressiveness: 0.8,
      zoomLabel: "aggressive",
      transition: "dip-to-black",
      speed: "moderate",
      captionCasing: "UPPERCASE",
      captionPosition: "center-bottom",
      captionBackground: "none",
      captionAvgWords: 4,
      captionFontSize: "large",
      captionAnimation: "fade-word",
      captionColor: "#FFFFFF",
      audioStyle: "youtube_standard",
      targetLufs: -14,
      targetTruePeak: -1.5,
      headingFont: "Bebas Neue",
      bodyFont: "Inter",
      primaryColor: "#E50914",
      secondaryColor: "#141414",
      animationStyle: "cinematic-fade",
      darkModeDefault: true,
      clipLengthMin: 3,
      clipLengthMax: 8,
      cutsPerMinute: 12,
      silenceToleranceMs: 300,
      removeFillers: true,
      animationDensity: "moderate",
      contentType: "cinematic",
      energyLevel: "high",
      hookPattern: "bold-statement",
    }),
  },
  {
    id: "warm-nostalgic",
    name: "Warm Nostalgic",
    description: "Golden warm tones with light grain, soft vignette, and gentle zooms. Crossfade transitions with subtle speed ramps for a cozy, nostalgic feel.",
    category: "classic",
    skillContent: makeSkillContent({
      id: "warm-nostalgic",
      name: "Warm Nostalgic",
      description: "Golden warm tones with light grain, soft vignette, and gentle zooms. Crossfade transitions with subtle speed ramps for a nostalgic feel.",
      colorProfile: "warm",
      grain: 0.15,
      vignette: 0.4,
      zoomAggressiveness: 0.3,
      zoomLabel: "gentle",
      transition: "crossfade",
      speed: "subtle",
      captionCasing: "Sentence case",
      captionPosition: "center-bottom",
      captionBackground: "semi-transparent",
      captionAvgWords: 5,
      captionFontSize: "medium",
      captionAnimation: "typewriter",
      captionColor: "#FFF8E7",
      audioStyle: "podcast_warm",
      targetLufs: -16,
      targetTruePeak: -1.0,
      headingFont: "Playfair Display",
      bodyFont: "Lora",
      primaryColor: "#D4A574",
      secondaryColor: "#2C1810",
      animationStyle: "gentle-slide",
      darkModeDefault: true,
      clipLengthMin: 4,
      clipLengthMax: 10,
      cutsPerMinute: 8,
      silenceToleranceMs: 500,
      removeFillers: false,
      animationDensity: "low",
      contentType: "vlog",
      energyLevel: "calm",
      hookPattern: "story-opener",
    }),
  },
  {
    id: "pastel-symmetrical",
    name: "Pastel Symmetrical",
    description: "Flat color profile with boosted saturation, no grain or vignette, and minimal zoom. Clean crossfades with no speed ramps for a polished, symmetrical aesthetic.",
    category: "social",
    skillContent: makeSkillContent({
      id: "pastel-symmetrical",
      name: "Pastel Symmetrical",
      description: "Flat color profile with boosted saturation, no grain, minimal zoom. Clean crossfades with no speed ramps for a symmetrical aesthetic.",
      colorProfile: "flat",
      grain: 0,
      vignette: 0,
      zoomAggressiveness: 0.1,
      zoomLabel: "minimal",
      transition: "crossfade",
      speed: "none",
      captionCasing: "lowercase",
      captionPosition: "center",
      captionBackground: "solid-pastel",
      captionAvgWords: 3,
      captionFontSize: "large",
      captionAnimation: "pop-in",
      captionColor: "#333333",
      audioStyle: "educational_clear",
      targetLufs: -14,
      targetTruePeak: -1.0,
      headingFont: "Poppins",
      bodyFont: "Poppins",
      primaryColor: "#FFB5E8",
      secondaryColor: "#B5DEFF",
      animationStyle: "pop-in",
      darkModeDefault: false,
      clipLengthMin: 3,
      clipLengthMax: 7,
      cutsPerMinute: 10,
      silenceToleranceMs: 400,
      removeFillers: true,
      animationDensity: "high",
      contentType: "educational",
      energyLevel: "medium",
      hookPattern: "question",
    }),
  },
  {
    id: "high-contrast-bw",
    name: "High Contrast B&W",
    description: "Desaturated cinematic look with strong grain, heavy vignette, and moderate zoom. Dip-to-black transitions with no speed ramps for a dramatic black-and-white style.",
    category: "cinematic",
    skillContent: makeSkillContent({
      id: "high-contrast-bw",
      name: "High Contrast B&W",
      description: "Desaturated cinematic look with strong grain, heavy vignette, and moderate zoom. Dip-to-black transitions for a dramatic B&W style.",
      colorProfile: "bw",
      grain: 0.3,
      vignette: 0.5,
      zoomAggressiveness: 0.5,
      zoomLabel: "moderate",
      transition: "dip-to-black",
      speed: "none",
      captionCasing: "UPPERCASE",
      captionPosition: "lower-third",
      captionBackground: "none",
      captionAvgWords: 3,
      captionFontSize: "large",
      captionAnimation: "fade-in",
      captionColor: "#FFFFFF",
      audioStyle: "podcast_warm",
      targetLufs: -16,
      targetTruePeak: -1.5,
      headingFont: "Oswald",
      bodyFont: "Source Sans Pro",
      primaryColor: "#FFFFFF",
      secondaryColor: "#000000",
      animationStyle: "fade",
      darkModeDefault: true,
      clipLengthMin: 5,
      clipLengthMax: 12,
      cutsPerMinute: 6,
      silenceToleranceMs: 600,
      removeFillers: false,
      animationDensity: "low",
      contentType: "documentary",
      energyLevel: "low",
      hookPattern: "provocative-statement",
    }),
  },
  {
    id: "neon-vibrant",
    name: "Neon Vibrant",
    description: "High-saturation warm tones with minimal grain, light vignette, and aggressive zooms. Wipe-left transitions with moderate speed ramps for an energetic, neon-lit look.",
    category: "social",
    skillContent: makeSkillContent({
      id: "neon-vibrant",
      name: "Neon Vibrant",
      description: "High-saturation warm tones with minimal grain, light vignette, aggressive zooms. Wipe-left transitions with moderate speed ramps for an energetic look.",
      colorProfile: "neon",
      grain: 0.08,
      vignette: 0.2,
      zoomAggressiveness: 0.8,
      zoomLabel: "aggressive",
      transition: "wipe-left",
      speed: "moderate",
      captionCasing: "UPPERCASE",
      captionPosition: "center",
      captionBackground: "neon-glow",
      captionAvgWords: 3,
      captionFontSize: "extra-large",
      captionAnimation: "bounce-in",
      captionColor: "#00FF88",
      audioStyle: "vlog_punchy",
      targetLufs: -12,
      targetTruePeak: -1.0,
      headingFont: "Montserrat Black",
      bodyFont: "Montserrat",
      primaryColor: "#FF00FF",
      secondaryColor: "#00FFFF",
      animationStyle: "bounce",
      darkModeDefault: true,
      clipLengthMin: 2,
      clipLengthMax: 6,
      cutsPerMinute: 16,
      silenceToleranceMs: 200,
      removeFillers: true,
      animationDensity: "high",
      contentType: "entertainment",
      energyLevel: "very-high",
      hookPattern: "shock-value",
    }),
  },
  {
    id: "natural-documentary",
    name: "Natural Documentary",
    description: "Neutral color profile with no grain, light vignette, and gentle zooms. Crossfade transitions with subtle speed ramps for an authentic, documentary-style feel.",
    category: "classic",
    skillContent: makeSkillContent({
      id: "natural-documentary",
      name: "Natural Documentary",
      description: "Neutral colors with no grain, light vignette, gentle zooms. Crossfade transitions with subtle speed ramps for an authentic documentary style.",
      colorProfile: "neutral",
      grain: 0,
      vignette: 0.2,
      zoomAggressiveness: 0.3,
      zoomLabel: "gentle",
      transition: "crossfade",
      speed: "subtle",
      captionCasing: "Sentence case",
      captionPosition: "lower-third",
      captionBackground: "semi-transparent",
      captionAvgWords: 6,
      captionFontSize: "medium",
      captionAnimation: "fade-in",
      captionColor: "#FFFFFF",
      audioStyle: "podcast_warm",
      targetLufs: -16,
      targetTruePeak: -1.0,
      headingFont: "Merriweather",
      bodyFont: "Open Sans",
      primaryColor: "#2D5016",
      secondaryColor: "#F5F0EB",
      animationStyle: "gentle-slide",
      darkModeDefault: false,
      clipLengthMin: 5,
      clipLengthMax: 15,
      cutsPerMinute: 5,
      silenceToleranceMs: 800,
      removeFillers: false,
      animationDensity: "minimal",
      contentType: "documentary",
      energyLevel: "calm",
      hookPattern: "narrative-intro",
    }),
  },
  {
    id: "vintage-film",
    name: "Vintage Film",
    description: "Desaturated warm tones with heavy grain, strong vignette, and gentle zooms. Dip-to-black transitions with no speed ramps for an old-school film aesthetic.",
    category: "classic",
    skillContent: makeSkillContent({
      id: "vintage-film",
      name: "Vintage Film",
      description: "Desaturated warm tones with heavy grain, strong vignette, gentle zooms. Dip-to-black transitions for an old-school film aesthetic.",
      colorProfile: "vintage",
      grain: 0.35,
      vignette: 0.6,
      zoomAggressiveness: 0.3,
      zoomLabel: "gentle",
      transition: "dip-to-black",
      speed: "none",
      captionCasing: "Sentence case",
      captionPosition: "center-bottom",
      captionBackground: "none",
      captionAvgWords: 5,
      captionFontSize: "medium",
      captionAnimation: "typewriter",
      captionColor: "#E8DCC8",
      audioStyle: "podcast_warm",
      targetLufs: -18,
      targetTruePeak: -2.0,
      headingFont: "Courier Prime",
      bodyFont: "Courier Prime",
      primaryColor: "#8B7355",
      secondaryColor: "#2C2418",
      animationStyle: "fade",
      darkModeDefault: true,
      clipLengthMin: 6,
      clipLengthMax: 15,
      cutsPerMinute: 4,
      silenceToleranceMs: 1000,
      removeFillers: false,
      animationDensity: "minimal",
      contentType: "narrative",
      energyLevel: "low",
      hookPattern: "story-opener",
    }),
  },
  {
    id: "clean-youtube",
    name: "Clean YouTube",
    description: "Neutral color profile with no grain or vignette, moderate zoom, and crossfade transitions. Subtle speed ramps for a polished, professional YouTube look.",
    category: "social",
    skillContent: makeSkillContent({
      id: "clean-youtube",
      name: "Clean YouTube",
      description: "Neutral colors with no grain, moderate zoom, crossfade transitions. Subtle speed ramps for a polished, professional YouTube look.",
      colorProfile: "neutral",
      grain: 0,
      vignette: 0,
      zoomAggressiveness: 0.5,
      zoomLabel: "moderate",
      transition: "crossfade",
      speed: "subtle",
      captionCasing: "Sentence case",
      captionPosition: "center-bottom",
      captionBackground: "box",
      captionAvgWords: 5,
      captionFontSize: "medium",
      captionAnimation: "pop-in",
      captionColor: "#FFFFFF",
      audioStyle: "youtube_standard",
      targetLufs: -14,
      targetTruePeak: -1.0,
      headingFont: "Roboto",
      bodyFont: "Roboto",
      primaryColor: "#FF0000",
      secondaryColor: "#282828",
      animationStyle: "slide-up",
      darkModeDefault: false,
      clipLengthMin: 3,
      clipLengthMax: 8,
      cutsPerMinute: 10,
      silenceToleranceMs: 400,
      removeFillers: true,
      animationDensity: "moderate",
      contentType: "youtube",
      energyLevel: "medium",
      hookPattern: "question",
    }),
  },
];

/**
 * Get all filmmaker presets.
 */
export function getAllPresets(): FilmmakerPreset[] {
  return presets;
}

/**
 * Get a single filmmaker preset by ID.
 */
export function getPreset(id: string): FilmmakerPreset | undefined {
  return presets.find((p) => p.id === id);
}
