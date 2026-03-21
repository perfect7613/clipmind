/**
 * Speed Ramp Engine — applies speed changes at moments detected by the show-moment-detector.
 *
 * For v1 prototype:
 * - Analyzes ShowMoment[] to find high-impact moments
 * - Returns SpeedRampEvent[] as metadata (split/concat approach, not time-conditional setpts)
 * - For single-pass rendering: applies a global subtle speed-up to low-energy clips
 * - Builds FFmpeg setpts (video) and atempo (audio) filters
 *
 * DNA-driven: intensity, slow-mo factor, and speed-up factor are extracted from Creator DNA.
 */

import type { ShowMoment } from "./show-moment-detector";

// ── Types ────────────────────────────────────────────────────────────────────

export type SpeedIntensity = "none" | "subtle" | "moderate" | "aggressive";

export interface SpeedRampEvent {
  start_s: number;
  end_s: number;
  factor: number; // 0.5 = half speed (slow-mo), 2.0 = double speed
  reason: string;
}

export interface SpeedRampConfig {
  intensity: SpeedIntensity;
  slowMoFactor: number;  // 0.5-0.75 for slow-mo
  speedUpFactor: number; // 1.5-2.0 for speed-up
}

const DEFAULT_SPEED_RAMP_CONFIG: SpeedRampConfig = {
  intensity: "subtle",
  slowMoFactor: 0.7,
  speedUpFactor: 1.5,
};

// ── Intensity thresholds ─────────────────────────────────────────────────────

/** Minimum gap (seconds) between moments to consider a segment "dead air" worth speeding up */
const DEAD_AIR_THRESHOLD_S: Record<SpeedIntensity, number> = {
  none: Infinity,
  subtle: 15,
  moderate: 10,
  aggressive: 7,
};

/** Max number of slow-mo events per clip */
const MAX_SLOWMO_EVENTS: Record<SpeedIntensity, number> = {
  none: 0,
  subtle: 1,
  moderate: 2,
  aggressive: 4,
};

// ── DNA Extraction ───────────────────────────────────────────────────────────

/**
 * Extract speed ramp preferences from DNA content.
 * Looks for a "Speed Ramping" section with intensity, slow-mo factor, and speed-up factor.
 */
export function getSpeedRampConfig(dnaContent?: string): SpeedRampConfig {
  if (!dnaContent) return { ...DEFAULT_SPEED_RAMP_CONFIG };

  const config: SpeedRampConfig = { ...DEFAULT_SPEED_RAMP_CONFIG };

  // Intensity
  const intensityMatch = dnaContent.match(
    /(?:speed\s*ramp(?:ing)?)\s*[\s\S]*?(?:intensity)[:\s]*(\w+)/i
  );
  if (intensityMatch) {
    const val = intensityMatch[1].toLowerCase();
    if (["none", "subtle", "moderate", "aggressive"].includes(val)) {
      config.intensity = val as SpeedIntensity;
    }
  }

  // Slow-mo factor (e.g., "Slow-mo factor: 0.7x" or "Slow-mo factor: 0.7")
  const slowMoMatch = dnaContent.match(
    /slow[\s-]*mo\s*factor[:\s]*([\d.]+)/i
  );
  if (slowMoMatch) {
    const val = parseFloat(slowMoMatch[1]);
    if (val >= 0.25 && val <= 1.0) {
      config.slowMoFactor = val;
    }
  }

  // Speed-up factor (e.g., "Speed-up factor: 1.5x")
  const speedUpMatch = dnaContent.match(
    /speed[\s-]*up\s*factor[:\s]*([\d.]+)/i
  );
  if (speedUpMatch) {
    const val = parseFloat(speedUpMatch[1]);
    if (val >= 1.0 && val <= 4.0) {
      config.speedUpFactor = val;
    }
  }

  return config;
}

// ── Speed Ramp Planning ──────────────────────────────────────────────────────

/**
 * Determine where to apply speed changes based on detected show moments.
 *
 * Strategy:
 * - High-impact moments (verbal cues, data-heavy types) get slow-mo
 * - Long gaps between moments get speed-up
 * - The highest-scored moment gets priority for slow-mo
 * - Returns events as metadata; the render pipeline can split/concat or apply globally
 */
export function planSpeedRamps(
  moments: ShowMoment[],
  clipDurationS: number,
  config: SpeedRampConfig
): SpeedRampEvent[] {
  if (config.intensity === "none") return [];
  if (clipDurationS <= 0) return [];

  const events: SpeedRampEvent[] = [];

  // Sort moments by timestamp
  const sorted = [...moments].sort((a, b) => a.timestamp_s - b.timestamp_s);

  // ── Slow-mo: high-impact moments ──
  const maxSlowMo = MAX_SLOWMO_EVENTS[config.intensity];

  // Score each moment for slow-mo worthiness
  const scored = sorted.map((m) => ({
    moment: m,
    score: scoreMomentForSlowMo(m),
  }));

  // Pick top N moments by score
  const slowMoCandidates = scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxSlowMo);

  for (const { moment } of slowMoCandidates) {
    const start = Math.max(0, moment.timestamp_s);
    const end = Math.min(clipDurationS, moment.timestamp_s + moment.duration_s);
    if (end - start < 1) continue; // too short to slow down

    events.push({
      start_s: start,
      end_s: end,
      factor: config.slowMoFactor,
      reason: `Slow-mo: ${moment.suggested_type} — ${moment.context}`,
    });
  }

  // ── Speed-up: gaps between moments (dead air) ──
  const deadAirThreshold = DEAD_AIR_THRESHOLD_S[config.intensity];
  const gaps = findGaps(sorted, clipDurationS);

  for (const gap of gaps) {
    const gapDuration = gap.end_s - gap.start_s;
    if (gapDuration >= deadAirThreshold) {
      // Don't speed-up the very start or very end (first/last 2 seconds)
      const safeStart = Math.max(gap.start_s, 2);
      const safeEnd = Math.min(gap.end_s, clipDurationS - 2);
      if (safeEnd - safeStart < 3) continue;

      // Check for overlap with slow-mo events
      const overlaps = events.some(
        (e) => e.start_s < safeEnd && e.end_s > safeStart
      );
      if (overlaps) continue;

      events.push({
        start_s: safeStart,
        end_s: safeEnd,
        factor: config.speedUpFactor,
        reason: `Speed-up: ${gapDuration.toFixed(1)}s gap with no moments`,
      });
    }
  }

  // Sort by start time
  events.sort((a, b) => a.start_s - b.start_s);

  return events;
}

/**
 * Score a ShowMoment for slow-mo worthiness (0-10 scale).
 * Verbal cues score higher. Data-heavy animation types score higher.
 */
function scoreMomentForSlowMo(moment: ShowMoment): number {
  let score = 0;

  // Verbal triggers are intentional "show" moments — worth emphasizing
  if (moment.trigger_type === "verbal") {
    score += 4;
  } else {
    score += 2;
  }

  // Animation types that benefit from slow-mo emphasis
  const highImpactTypes = ["animated_counter", "text_card", "side_by_side"];
  const mediumImpactTypes = ["building_flowchart", "framework_grid"];

  if (highImpactTypes.includes(moment.suggested_type)) {
    score += 3;
  } else if (mediumImpactTypes.includes(moment.suggested_type)) {
    score += 2;
  } else {
    score += 1;
  }

  // Longer moments are more impactful
  if (moment.duration_s >= 5) {
    score += 2;
  } else if (moment.duration_s >= 3) {
    score += 1;
  }

  return score;
}

/**
 * Find gaps between moments (regions with no detected moments).
 */
function findGaps(
  sortedMoments: ShowMoment[],
  clipDurationS: number
): { start_s: number; end_s: number }[] {
  const gaps: { start_s: number; end_s: number }[] = [];

  if (sortedMoments.length === 0) {
    gaps.push({ start_s: 0, end_s: clipDurationS });
    return gaps;
  }

  // Gap before first moment
  if (sortedMoments[0].timestamp_s > 0) {
    gaps.push({ start_s: 0, end_s: sortedMoments[0].timestamp_s });
  }

  // Gaps between moments
  for (let i = 1; i < sortedMoments.length; i++) {
    const prevEnd =
      sortedMoments[i - 1].timestamp_s + sortedMoments[i - 1].duration_s;
    const nextStart = sortedMoments[i].timestamp_s;
    if (nextStart > prevEnd) {
      gaps.push({ start_s: prevEnd, end_s: nextStart });
    }
  }

  // Gap after last moment
  const lastMoment = sortedMoments[sortedMoments.length - 1];
  const lastEnd = lastMoment.timestamp_s + lastMoment.duration_s;
  if (lastEnd < clipDurationS) {
    gaps.push({ start_s: lastEnd, end_s: clipDurationS });
  }

  return gaps;
}

// ── FFmpeg Filter Builders ───────────────────────────────────────────────────

/**
 * Build FFmpeg filters for a single speed ramp event.
 *
 * For v1 prototype, this builds a global speed filter (applied to whole clip or segment).
 * The render pipeline should use these events to split the clip into segments,
 * apply the speed filter to each segment, then concat.
 *
 * Video: setpts=FACTOR*PTS (factor > 1 = slow-mo, factor < 1 = speed-up)
 * Audio: atempo=FACTOR (inverse of video factor, range 0.5-2.0, chain for extremes)
 */
export function buildSpeedRampFilter(
  events: SpeedRampEvent[],
  clipDurationS: number
): { videoFilter: string; audioFilter: string } {
  // No events → no speed change
  if (events.length === 0) {
    return { videoFilter: "", audioFilter: "" };
  }

  // v1 prototype: apply the single most impactful speed change globally.
  // If there are slow-mo events, pick the one with lowest factor (most dramatic).
  // If only speed-up events, apply a subtle global speed-up.
  const slowMoEvents = events.filter((e) => e.factor < 1.0);
  const speedUpEvents = events.filter((e) => e.factor > 1.0);

  if (slowMoEvents.length > 0) {
    // Use the most dramatic slow-mo factor
    const bestSlowMo = slowMoEvents.reduce((a, b) =>
      a.factor < b.factor ? a : b
    );
    return buildSingleSpeedFilter(bestSlowMo.factor);
  }

  if (speedUpEvents.length > 0) {
    // Use the mildest speed-up for safety (closest to 1.0)
    const mildestSpeedUp = speedUpEvents.reduce((a, b) =>
      a.factor < b.factor ? a : b
    );
    // Cap global speed-up at 1.1x for the prototype to avoid jarring results
    const safeFactor = Math.min(mildestSpeedUp.factor, 1.1);
    return buildSingleSpeedFilter(safeFactor);
  }

  return { videoFilter: "", audioFilter: "" };
}

/**
 * Build video and audio filters for a single speed factor.
 *
 * Video: setpts=(1/factor)*PTS
 *   - factor=0.5 (slow-mo) → setpts=2.0*PTS
 *   - factor=2.0 (speed-up) → setpts=0.5*PTS
 *
 * Audio: atempo=factor (range 0.5-2.0 per filter, chain for extremes)
 *   - factor=0.5 (slow-mo) → atempo=0.5
 *   - factor=2.0 (speed-up) → atempo=2.0
 *   - factor=4.0 → atempo=2.0,atempo=2.0
 */
function buildSingleSpeedFilter(factor: number): {
  videoFilter: string;
  audioFilter: string;
} {
  if (factor === 1.0) {
    return { videoFilter: "", audioFilter: "" };
  }

  // Video: PTS multiplier is inverse of speed factor
  const ptsFactor = (1 / factor).toFixed(4);
  const videoFilter = `setpts=${ptsFactor}*PTS`;

  // Audio: atempo accepts 0.5-2.0, chain for values outside that range
  const audioFilter = buildAtempoChain(factor);

  return { videoFilter, audioFilter };
}

/**
 * Build an atempo filter chain for the given speed factor.
 * atempo only accepts values in [0.5, 2.0], so we chain multiple filters
 * for extreme values.
 *
 * Examples:
 *   factor=0.5  → "atempo=0.5"
 *   factor=2.0  → "atempo=2.0"
 *   factor=4.0  → "atempo=2.0,atempo=2.0"
 *   factor=0.25 → "atempo=0.5,atempo=0.5"
 */
function buildAtempoChain(factor: number): string {
  if (factor === 1.0) return "";

  const parts: string[] = [];
  let remaining = factor;

  if (factor > 1.0) {
    // Speed-up: chain atempo=2.0 as needed
    while (remaining > 2.0) {
      parts.push("atempo=2.0");
      remaining /= 2.0;
    }
    if (remaining > 1.0) {
      parts.push(`atempo=${remaining.toFixed(4)}`);
    }
  } else {
    // Slow-mo: chain atempo=0.5 as needed
    while (remaining < 0.5) {
      parts.push("atempo=0.5");
      remaining /= 0.5; // remaining *= 2
    }
    if (remaining < 1.0) {
      parts.push(`atempo=${remaining.toFixed(4)}`);
    }
  }

  return parts.join(",");
}
