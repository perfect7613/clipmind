import { z } from "zod";

export const DnaSkillParamsSchema = z.object({
  username: z.string(),
  creatorName: z.string(),
  captionStyle: z.object({
    casing: z.enum(["upper", "lower", "title", "sentence"]),
    position: z.enum(["top", "middle", "bottom", "dynamic"]),
    background: z.enum(["none", "dark-bar", "pill", "full-width"]),
    avgWords: z.number().min(1).max(10),
    fontSize: z.enum(["small", "medium", "large"]),
    animation: z.enum(["none", "pop", "slide", "bounce", "typewriter"]),
    colorHex: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  }),
  zoom: z.object({
    aggressiveness: z.number().min(0).max(1),
    maxZoomLevel: z.number().min(1).max(2),
    triggers: z.array(z.enum(["energy_peak", "punchline", "emphasis", "key_point", "reaction"])),
  }),
  audio: z.object({
    style: z.enum(["podcast_warm", "youtube_standard", "educational_clear", "vlog_punchy"]),
    targetLufs: z.number(),
    targetTruePeak: z.number(),
  }),
  color: z.object({
    profile: z.enum(["warm", "neutral", "cool", "cinematic", "flat"]),
  }),
  brand: z.object({
    headingFont: z.string(),
    bodyFont: z.string(),
    primaryColor: z.string(),
    secondaryColor: z.string(),
    animationStyle: z.enum(["slide-up", "pop", "fade", "wipe"]),
    darkModeDefault: z.boolean(),
  }),
  pacing: z.object({
    preferredClipLengthMin: z.number(),
    preferredClipLengthMax: z.number(),
    cutsPerMinute: z.number(),
    silenceToleranceMs: z.number(),
    removeFillers: z.boolean(),
    fillerWords: z.array(z.string()),
  }),
  animationDensity: z.enum(["none", "light", "moderate", "heavy"]),
  contentType: z.enum(["vlog", "podcast", "educational", "commentary", "mixed"]),
  humorType: z.enum(["dry", "absurdist", "self-deprecating", "observational", "none"]),
  energyLevel: z.enum(["chill", "medium", "high", "chaotic"]),
  hookPattern: z.enum(["question", "statement", "reaction", "story", "stat"]),
});

export type DnaSkillParams = z.infer<typeof DnaSkillParamsSchema>;

// Default DNA params for bootstrapping
export const DEFAULT_DNA_PARAMS: DnaSkillParams = {
  username: "default",
  creatorName: "Default Creator",
  captionStyle: {
    casing: "sentence",
    position: "bottom",
    background: "dark-bar",
    avgWords: 3,
    fontSize: "medium",
    animation: "pop",
    colorHex: "#FFFFFF",
  },
  zoom: {
    aggressiveness: 0.5,
    maxZoomLevel: 1.5,
    triggers: ["energy_peak", "emphasis", "key_point"],
  },
  audio: {
    style: "youtube_standard",
    targetLufs: -16,
    targetTruePeak: -1.5,
  },
  color: {
    profile: "neutral",
  },
  brand: {
    headingFont: "DM Serif Display",
    bodyFont: "DM Sans",
    primaryColor: "#E8620E",
    secondaryColor: "#0E5C58",
    animationStyle: "slide-up",
    darkModeDefault: true,
  },
  pacing: {
    preferredClipLengthMin: 30,
    preferredClipLengthMax: 90,
    cutsPerMinute: 8,
    silenceToleranceMs: 500,
    removeFillers: true,
    fillerWords: ["um", "uh", "like", "you know", "sort of", "I mean", "basically"],
  },
  animationDensity: "moderate",
  contentType: "vlog",
  humorType: "none",
  energyLevel: "medium",
  hookPattern: "statement",
};
