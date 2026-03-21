import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import type { WordTimestamp } from "@/types";

const anthropic = new Anthropic();

export const ZoomEventSchema = z.object({
  start_s: z.number(),
  end_s: z.number(),
  zoom_level: z.enum(["normal", "punched_in", "tight"]),
  reason: z.string(),
});

export const ZoomPlanSchema = z.object({
  events: z.array(ZoomEventSchema),
  face_crop: z.object({
    x: z.number(),
    y: z.number(),
    w: z.number(),
    h: z.number(),
  }),
});

export type ZoomEvent = z.infer<typeof ZoomEventSchema>;
export type ZoomPlan = z.infer<typeof ZoomPlanSchema>;

interface ZoomConfig {
  aggressiveness: number;     // 0-1
  maxZoomLevel: number;       // 1.0-2.0
  triggers: string[];         // energy_peak, punchline, emphasis, key_point, reaction
  maxSegmentDurationS: number; // default 7
  videoWidth: number;
  videoHeight: number;
}

const DEFAULT_CONFIG: ZoomConfig = {
  aggressiveness: 0.5,
  maxZoomLevel: 1.5,
  triggers: ["energy_peak", "emphasis", "key_point"],
  maxSegmentDurationS: 7,
  videoWidth: 1920,
  videoHeight: 1080,
};

/**
 * Zoom level crop factors.
 */
const ZOOM_LEVELS = {
  normal: 1.0,
  punched_in: 1.3,
  tight: 1.5,
} as const;

/**
 * Plan zoom events based on transcript content analysis.
 * Uses claude-haiku for classification.
 */
export async function planZoomEvents(
  words: WordTimestamp[],
  totalDurationS: number,
  config: Partial<ZoomConfig> = {}
): Promise<ZoomPlan> {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  if (words.length === 0) {
    return {
      events: [{ start_s: 0, end_s: totalDurationS, zoom_level: "normal", reason: "default" }],
      face_crop: { x: 0, y: 0, w: cfg.videoWidth, h: cfg.videoHeight },
    };
  }

  // Build transcript segments (~10 second chunks)
  const segments = buildSegments(words, 10);
  const transcript = segments
    .map((s, i) => `[${s.start_s.toFixed(1)}s-${s.end_s.toFixed(1)}s] ${s.text}`)
    .join("\n");

  // Target number of zoom events based on aggressiveness
  const targetEvents = Math.max(2, Math.round((totalDurationS / 60) * 4 * cfg.aggressiveness));

  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 2000,
    messages: [
      {
        role: "user",
        content: `Analyze this transcript and assign zoom levels to each segment.

TRANSCRIPT (with timestamps):
${transcript}

RULES:
- Three zoom levels: "normal" (default framing), "punched_in" (closer, for emphasis), "tight" (very close, for emotional peaks)
- Default to "normal" for factual/calm content
- Use "punched_in" for: ${cfg.triggers.join(", ")}
- Use "tight" sparingly for emotional peaks or bold claims
- No single zoom level should last more than ${cfg.maxSegmentDurationS} seconds
- Target approximately ${targetEvents} zoom changes for this ${totalDurationS.toFixed(0)}s video
- Alternate zoom levels — avoid the same level for consecutive segments

Return a JSON array of zoom events:
[
  {"start_s": 0.0, "end_s": 5.2, "zoom_level": "normal", "reason": "introduction"},
  {"start_s": 5.2, "end_s": 10.8, "zoom_level": "punched_in", "reason": "key point about X"},
  ...
]

Return ONLY the JSON array, no explanation.`,
      },
    ],
  });

  const textBlock = response.content.find((c) => c.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No response from Claude");
  }

  let jsonStr = textBlock.text.trim();
  if (jsonStr.startsWith("```")) {
    jsonStr = jsonStr.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
  }

  let events: ZoomEvent[];
  try {
    const parsed = JSON.parse(jsonStr);
    events = z.array(ZoomEventSchema).parse(parsed);
  } catch {
    // Fallback: all normal
    events = [{ start_s: 0, end_s: totalDurationS, zoom_level: "normal", reason: "fallback" }];
  }

  // Enforce max segment duration
  events = enforceMaxDuration(events, cfg.maxSegmentDurationS);

  // Default face crop (center of frame)
  const face_crop = {
    x: Math.round(cfg.videoWidth * 0.15),
    y: Math.round(cfg.videoHeight * 0.05),
    w: Math.round(cfg.videoWidth * 0.7),
    h: Math.round(cfg.videoHeight * 0.9),
  };

  return { events, face_crop };
}

/**
 * Convert zoom events to FFmpeg crop parameters for each segment.
 */
export function zoomEventsToFFmpegCrops(
  events: ZoomEvent[],
  faceCrop: { x: number; y: number; w: number; h: number },
  videoWidth: number = 1920,
  videoHeight: number = 1080,
  outputWidth: number = 1920,
  outputHeight: number = 1080
): { start_s: number; end_s: number; crop: string; scale: string }[] {
  return events.map((event) => {
    const zoomFactor = ZOOM_LEVELS[event.zoom_level];

    // Calculate crop dimensions (zoom in = smaller crop area)
    const cropW = Math.round(videoWidth / zoomFactor);
    const cropH = Math.round(videoHeight / zoomFactor);

    // Center crop on face position
    const centerX = faceCrop.x + faceCrop.w / 2;
    const centerY = faceCrop.y + faceCrop.h / 2;

    let cropX = Math.round(centerX - cropW / 2);
    let cropY = Math.round(centerY - cropH / 2);

    // Clamp to video bounds
    cropX = Math.max(0, Math.min(cropX, videoWidth - cropW));
    cropY = Math.max(0, Math.min(cropY, videoHeight - cropH));

    return {
      start_s: event.start_s,
      end_s: event.end_s,
      crop: `crop=${cropW}:${cropH}:${cropX}:${cropY}`,
      scale: `scale=${outputWidth}:${outputHeight}:flags=lanczos`,
    };
  });
}

function buildSegments(
  words: WordTimestamp[],
  targetDurationS: number
): { start_s: number; end_s: number; text: string }[] {
  const segments: { start_s: number; end_s: number; text: string }[] = [];
  let segStart = words[0].start_s;
  let segWords: string[] = [];

  for (const word of words) {
    segWords.push(word.word);
    if (word.end_s - segStart >= targetDurationS) {
      segments.push({
        start_s: segStart,
        end_s: word.end_s,
        text: segWords.join(" "),
      });
      segStart = word.end_s;
      segWords = [];
    }
  }

  if (segWords.length > 0) {
    segments.push({
      start_s: segStart,
      end_s: words[words.length - 1].end_s,
      text: segWords.join(" "),
    });
  }

  return segments;
}

function enforceMaxDuration(events: ZoomEvent[], maxDuration: number): ZoomEvent[] {
  const result: ZoomEvent[] = [];

  for (const event of events) {
    const duration = event.end_s - event.start_s;
    if (duration <= maxDuration) {
      result.push(event);
    } else {
      // Split into chunks
      let start = event.start_s;
      const levels: Array<"normal" | "punched_in" | "tight"> = ["normal", "punched_in", "normal"];
      let levelIdx = event.zoom_level === "normal" ? 1 : 0;

      while (start < event.end_s) {
        const end = Math.min(start + maxDuration, event.end_s);
        result.push({
          start_s: start,
          end_s: end,
          zoom_level: levels[levelIdx % levels.length],
          reason: event.reason,
        });
        start = end;
        levelIdx++;
      }
    }
  }

  return result;
}
