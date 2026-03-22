/**
 * Average YouTube editor baseline.
 * DNA comparisons are expressed as deltas from this baseline
 * so the DNA describes what's DIFFERENT about this creator.
 */
export const BASELINE = {
  cutsPerMinute: 8,
  zoomEventsPerMinute: 2,
  zoomAggressiveness: 0.5,
  brollPercentage: 15,
  silenceToleranceMs: 300,
  avgPauseDurationS: 0.4,
  pausesPerMinute: 6,
  speechRatio: 0.75,
  captionCasing: "sentence",
  captionPosition: "bottom",
  captionBackground: "dark-bar",
  colorProfile: "neutral",
  audioLufs: -16,
  energyLevel: "medium",
  animationDensity: "moderate",
  avgClipLengthS: 45,
} as const;

/**
 * Compare a value against baseline and return a human-readable delta string.
 */
export function compareToBaseline(
  label: string,
  actual: number,
  baselineValue: number,
  unit: string = ""
): string {
  if (actual === baselineValue) return `${label}: average (${actual}${unit})`;

  const ratio = actual / baselineValue;
  const direction = actual > baselineValue ? "more" : "fewer";
  const directionAdj = actual > baselineValue ? "higher" : "lower";

  if (ratio >= 1.8) return `${label}: significantly ${direction} than average (${actual}${unit} vs ${baselineValue}${unit} avg — ${ratio.toFixed(1)}x)`;
  if (ratio >= 1.3) return `${label}: ${direction} than average (${actual}${unit} vs ${baselineValue}${unit} avg)`;
  if (ratio <= 0.55) return `${label}: significantly ${direction} than average (${actual}${unit} vs ${baselineValue}${unit} avg — ${(1/ratio).toFixed(1)}x ${directionAdj})`;
  if (ratio <= 0.75) return `${label}: ${direction} than average (${actual}${unit} vs ${baselineValue}${unit} avg)`;

  return `${label}: near average (${actual}${unit}, baseline ${baselineValue}${unit})`;
}

/**
 * Generate the comparative section of the DNA.
 */
export function generateComparativeSection(params: {
  cutsPerMinute: number;
  zoomAggressiveness: number;
  silenceToleranceMs: number;
  energyLevel: string;
  animationDensity: string;
  brollPercentage?: number;
  speechRatio?: number;
}): string {
  const lines: string[] = [];

  lines.push(compareToBaseline("Cuts per minute", params.cutsPerMinute, BASELINE.cutsPerMinute, "/min"));
  lines.push(compareToBaseline("Zoom aggressiveness", params.zoomAggressiveness * 10, BASELINE.zoomAggressiveness * 10, "/10"));
  lines.push(compareToBaseline("Silence tolerance", params.silenceToleranceMs, BASELINE.silenceToleranceMs, "ms"));

  if (params.brollPercentage !== undefined) {
    lines.push(compareToBaseline("B-roll usage", params.brollPercentage, BASELINE.brollPercentage, "%"));
  }
  if (params.speechRatio !== undefined) {
    lines.push(compareToBaseline("Speech ratio", Math.round(params.speechRatio * 100), Math.round(BASELINE.speechRatio * 100), "%"));
  }

  // Categorical comparisons
  const energyMap: Record<string, string> = {
    low: "lower energy than average — calm, measured delivery",
    medium: "average energy level",
    high: "higher energy than average — fast-paced, enthusiastic",
    dynamic: "highly dynamic energy — varies significantly throughout",
  };
  lines.push(`Energy: ${energyMap[params.energyLevel] || "average"}`);

  const densityMap: Record<string, string> = {
    none: "no animations — clean, uncluttered look",
    light: "fewer overlays than average — lets content breathe",
    moderate: "average animation usage",
    heavy: "heavy animation usage — visually dense, information-rich",
  };
  lines.push(`Overlays: ${densityMap[params.animationDensity] || "average"}`);

  return lines.map((l) => `- ${l}`).join("\n");
}
