import { z } from "zod";

export const ColorProfileSchema = z.enum([
  "warm",
  "neutral",
  "cool",
  "cinematic",
  "flat",
]);

export type ColorProfile = z.infer<typeof ColorProfileSchema>;

/**
 * Color correction parameters per profile.
 */
const COLOR_PROFILES: Record<ColorProfile, {
  colorbalance: { rs: number; gs: number; bs: number };
  curves: string;
  eq: { brightness: number; contrast: number; saturation: number };
}> = {
  warm: {
    colorbalance: { rs: 0.04, gs: -0.01, bs: -0.04 },
    curves: "m='0/0 0.25/0.20 0.75/0.82 1/1'",
    eq: { brightness: 0.02, contrast: 1.05, saturation: 1.08 },
  },
  neutral: {
    colorbalance: { rs: 0.02, gs: -0.01, bs: -0.02 },
    curves: "m='0/0 0.25/0.20 0.75/0.82 1/1'",
    eq: { brightness: 0.02, contrast: 1.05, saturation: 1.05 },
  },
  cool: {
    colorbalance: { rs: -0.03, gs: 0.0, bs: 0.04 },
    curves: "m='0/0 0.25/0.22 0.75/0.80 1/1'",
    eq: { brightness: 0.01, contrast: 1.06, saturation: 1.02 },
  },
  cinematic: {
    colorbalance: { rs: 0.01, gs: -0.02, bs: -0.01 },
    curves: "m='0/0 0.15/0.08 0.30/0.22 0.70/0.78 0.85/0.92 1/1'",
    eq: { brightness: -0.01, contrast: 1.12, saturation: 0.95 },
  },
  flat: {
    colorbalance: { rs: 0, gs: 0, bs: 0 },
    curves: "m='0/0 1/1'",
    eq: { brightness: 0, contrast: 1.0, saturation: 1.0 },
  },
};

/**
 * Generate the FFmpeg video color correction filter chain string.
 * Deterministic — no LLM needed.
 */
export function buildColorFilterChain(profile: ColorProfile = "neutral"): string {
  const p = COLOR_PROFILES[profile];

  if (profile === "flat") {
    return "null"; // FFmpeg identity filter — no processing
  }

  return [
    `colorbalance=rs=${p.colorbalance.rs}:gs=${p.colorbalance.gs}:bs=${p.colorbalance.bs}`,
    `curves=${p.curves}`,
    `eq=brightness=${p.eq.brightness}:contrast=${p.eq.contrast}:saturation=${p.eq.saturation}`,
  ].join(",");
}

/**
 * Get the full color profile config for a given profile name.
 */
export function getColorProfile(profile: ColorProfile) {
  return COLOR_PROFILES[profile];
}
