/**
 * FFmpeg Effects System — DNA-driven video effects applied to the actual clip.
 *
 * All real video editing happens here via FFmpeg filters:
 * - Zoom (smooth zoompan with cosine easing via smooth-zoom module)
 * - Color grading (vignette, film grain, LUT-like profiles, bleach bypass)
 * - Motion effects (speed ramps)
 * - Visual effects (chromatic aberration, glitch, blur)
 *
 * The DNA skill determines WHICH effects to apply and with what intensity.
 */

import type { ZoomEvent } from "./zoom-planner";
import { buildSmoothZoomFilter } from "./smooth-zoom";
import type { TransitionConfig, TransitionType } from "./transition-engine";
import { getSpeedRampConfig, type SpeedRampConfig } from "./speed-ramp";

// ── Effect Profiles (extracted from DNA) ────────────────────────────────────

export interface EffectsConfig {
  // Color
  colorProfile: "warm" | "neutral" | "cool" | "cinematic" | "bw" | "vintage" | "neon" | "flat";
  vignette: boolean;
  vignetteIntensity: number;       // 0-1
  filmGrain: boolean;
  filmGrainIntensity: number;      // 0-1 (maps to noise strength)
  bleachBypass: boolean;

  // Zoom
  zoomEvents: ZoomEvent[];
  videoWidth: number;
  videoHeight: number;

  // Effects
  fadeIn: boolean;
  fadeInDuration: number;          // seconds
  fadeOut: boolean;
  fadeOutDuration: number;
  sharpen: boolean;
  sharpenAmount: number;           // 0-1

  // Duration
  clipDurationS: number;
}

// Defaults: NO effects unless DNA/preset explicitly enables them
const DEFAULT_EFFECTS: EffectsConfig = {
  colorProfile: "neutral",
  vignette: false,
  vignetteIntensity: 0.3,
  filmGrain: false,
  filmGrainIntensity: 0.15,
  bleachBypass: false,
  zoomEvents: [],
  videoWidth: 1280,
  videoHeight: 720,
  fadeIn: false,
  fadeInDuration: 0.3,
  fadeOut: false,
  fadeOutDuration: 0.3,
  sharpen: false,
  sharpenAmount: 0.3,
  clipDurationS: 30,
};

// ── Color Grading Filters ───────────────────────────────────────────────────

const COLOR_FILTERS: Record<string, string> = {
  warm: "colorbalance=rs=0.04:gs=-0.01:bs=-0.04,curves=m='0/0 0.25/0.20 0.75/0.82 1/1',eq=brightness=0.02:contrast=1.05:saturation=1.08",
  neutral: "colorbalance=rs=0.02:gs=-0.01:bs=-0.02,curves=m='0/0 0.25/0.20 0.75/0.82 1/1',eq=brightness=0.02:contrast=1.05:saturation=1.05",
  cool: "colorbalance=rs=-0.03:gs=0.0:bs=0.04,curves=m='0/0 0.25/0.22 0.75/0.80 1/1',eq=brightness=0.01:contrast=1.06:saturation=1.02",
  cinematic: "colorbalance=rs=0.01:gs=-0.02:bs=-0.01,curves=m='0/0 0.15/0.08 0.30/0.22 0.70/0.78 0.85/0.92 1/1',eq=brightness=-0.01:contrast=1.12:saturation=0.95",
  bw: "hue=s=0,curves=m='0/0 0.15/0.05 0.35/0.25 0.65/0.75 0.85/0.95 1/1',eq=brightness=-0.02:contrast=1.25",
  vintage: "colorbalance=rs=0.05:gs=0.01:bs=-0.03,curves=m='0/0 0.20/0.15 0.80/0.85 1/1',eq=brightness=0.01:contrast=1.04:saturation=0.75",
  neon: "colorbalance=rs=0.02:gs=-0.03:bs=0.02,curves=m='0/0 0.10/0.02 0.30/0.20 0.70/0.85 0.90/0.98 1/1',eq=brightness=-0.02:contrast=1.15:saturation=1.4",
  flat: "",
};

// ── Build Complete Video Filter Chain ────────────────────────────────────────

/**
 * Build the complete FFmpeg video filter chain combining all effects.
 * Returns a single filter string for -filter:v or the video part of filter_complex.
 */
export function buildVideoFilterChain(config: Partial<EffectsConfig> = {}): string {
  const cfg = { ...DEFAULT_EFFECTS, ...config };
  const filters: string[] = [];

  // 1. Even dimensions (required for libx264)
  filters.push("scale=trunc(iw/2)*2:trunc(ih/2)*2");

  // 2. Smooth zoom — Ken Burns push-in with detected resolution
  if (cfg.zoomEvents.length > 0) {
    const zoomFilter = buildSmoothZoomFilter(cfg.zoomEvents, 30, cfg.videoWidth, cfg.videoHeight);
    if (zoomFilter) filters.push(zoomFilter);
  }

  // 3. Color grading
  const colorFilter = COLOR_FILTERS[cfg.colorProfile];
  if (colorFilter) {
    filters.push(colorFilter);
  }

  // 4. Vignette
  if (cfg.vignette) {
    const angle = 0.3 + cfg.vignetteIntensity * 0.5; // PI/10 to PI/3.3
    filters.push(`vignette=angle=${angle.toFixed(2)}:mode=forward`);
  }

  // 5. Film grain (noise)
  if (cfg.filmGrain) {
    const strength = Math.round(cfg.filmGrainIntensity * 30); // 0-30
    filters.push(`noise=alls=${strength}:allf=t`);
  }

  // 6. Bleach bypass (desaturated high contrast)
  if (cfg.bleachBypass) {
    filters.push("eq=saturation=0.6:contrast=1.3:brightness=0.03");
  }

  // 7. Sharpen
  if (cfg.sharpen) {
    const amount = 0.5 + cfg.sharpenAmount * 1.5; // 0.5-2.0
    filters.push(`unsharp=5:5:${amount.toFixed(1)}:5:5:0`);
  }

  // 8. Fade in/out
  if (cfg.fadeIn) {
    const frames = Math.round(cfg.fadeInDuration * 30);
    filters.push(`fade=t=in:st=0:d=${cfg.fadeInDuration}:alpha=0`);
  }
  if (cfg.fadeOut) {
    const startTime = Math.max(0, cfg.clipDurationS - cfg.fadeOutDuration);
    filters.push(`fade=t=out:st=${startTime.toFixed(2)}:d=${cfg.fadeOutDuration}:alpha=0`);
  }

  // 9. FPS and SAR
  filters.push("fps=30");
  filters.push("setsar=1:1");

  return filters.join(",");
}

// ── DNA → Effects Config Extraction ─────────────────────────────────────────

/**
 * Parse DNA skill content and extract effects configuration.
 */
export function extractEffectsFromDna(dnaContent: string): Partial<EffectsConfig> {
  const config: Partial<EffectsConfig> = {};

  // Color profile — match the first word after "Profile:" against known profiles
  const colorMatch = dnaContent.match(/(?:Profile|color_profile)[:\s]*(\w+)/i);
  if (colorMatch) {
    const profile = colorMatch[1].toLowerCase();
    const validProfiles = Object.keys(COLOR_FILTERS);
    if (validProfiles.includes(profile)) {
      config.colorProfile = profile as EffectsConfig["colorProfile"];
    }
  }

  // Vignette
  if (/vignette[:\s]*(true|yes|enabled)/i.test(dnaContent)) {
    config.vignette = true;
    const intensityMatch = dnaContent.match(/vignette.*?intensity[:\s]*([\d.]+)/i);
    if (intensityMatch) config.vignetteIntensity = parseFloat(intensityMatch[1]);
  }

  // Film grain
  if (/film.?grain[:\s]*(true|yes|enabled)/i.test(dnaContent)) {
    config.filmGrain = true;
    const grainMatch = dnaContent.match(/grain.*?intensity[:\s]*([\d.]+)/i);
    if (grainMatch) config.filmGrainIntensity = parseFloat(grainMatch[1]);
  } else if (/cinematic/i.test(dnaContent.match(/Profile[:\s]*(\w+)/)?.[1] || "")) {
    // Cinematic profiles get subtle film grain by default
    config.filmGrain = true;
    config.filmGrainIntensity = 0.1;
  }

  // Bleach bypass
  if (/bleach.?bypass[:\s]*(true|yes|enabled)/i.test(dnaContent)) {
    config.bleachBypass = true;
  }

  // Sharpen
  if (/sharpen[:\s]*(true|yes|enabled)/i.test(dnaContent)) {
    config.sharpen = true;
  }

  // Fade
  if (/fade.?in[:\s]*(false|no|disabled)/i.test(dnaContent)) {
    config.fadeIn = false;
  }
  if (/fade.?out[:\s]*(false|no|disabled)/i.test(dnaContent)) {
    config.fadeOut = false;
  }

  return config;
}

// ── DNA → Transition Config Extraction ───────────────────────────────────────

/**
 * Parse DNA skill content and extract transition configuration.
 * Looks for the ## Transitions section with Type, Duration, and Between clips fields.
 * Defaults to crossfade 0.5s if not found.
 */
export function extractTransitionFromDna(dnaContent: string): TransitionConfig {
  const config: TransitionConfig = {
    type: "crossfade",
    durationS: 0.5,
  };

  // Look for transition type in the Transitions section
  const typeMatch = dnaContent.match(
    /##\s*Transitions[\s\S]*?(?:Type|Between\s+clips)[:\s]*([\w-]+)/i
  );
  if (typeMatch) {
    const raw = typeMatch[1].toLowerCase().replace(/\s+/g, "-");
    const mapped = mapTransitionType(raw);
    if (mapped) config.type = mapped;
  }

  // Look for transition duration
  const durationMatch = dnaContent.match(
    /##\s*Transitions[\s\S]*?Duration[:\s]*([\d.]+)\s*s?/i
  );
  if (durationMatch) {
    const dur = parseFloat(durationMatch[1]);
    if (dur > 0 && dur <= 3) {
      config.durationS = dur;
    }
  }

  return config;
}

/**
 * Map raw DNA transition type strings to the TransitionType union.
 */
function mapTransitionType(raw: string): TransitionType | null {
  const aliases: Record<string, TransitionType> = {
    crossfade: "crossfade",
    "cross-fade": "crossfade",
    "cross-dissolve": "crossfade",
    crossdissolve: "crossfade",
    dissolve: "fade",
    fade: "fade",
    "dip-to-black": "dip-to-black",
    diptoblack: "dip-to-black",
    fadeblack: "dip-to-black",
    "wipe-left": "wipe-left",
    wipeleft: "wipe-left",
    "wipe-right": "wipe-right",
    wiperight: "wipe-right",
  };
  return aliases[raw] ?? null;
}

// ── DNA → Speed Ramp Config Extraction ───────────────────────────────────────

/**
 * Parse DNA skill content and extract speed ramp configuration.
 * Delegates to the speed-ramp module's getSpeedRampConfig.
 */
export function extractSpeedRampFromDna(dnaContent: string): SpeedRampConfig {
  return getSpeedRampConfig(dnaContent);
}
