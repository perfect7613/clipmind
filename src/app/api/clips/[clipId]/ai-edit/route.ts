import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import Anthropic from "@anthropic-ai/sdk";

const VALID_COLOR_PROFILES = ["warm", "neutral", "cool", "cinematic", "bw", "vintage", "neon", "flat"];
const VALID_TRANSITION_TYPES = ["crossfade", "dip-to-black", "wipe-left", "fade", "dissolve"];
const VALID_CAPTION_POSITIONS = ["top", "center", "bottom"];
const VALID_CAPTION_SIZES = ["small", "medium", "large"];
const VALID_CAPTION_BACKGROUNDS = ["none", "dark-bar", "pill", "full-width"];
const VALID_CAPTION_CASINGS = ["upper", "lower", "title", "sentence"];

interface AiEditBody {
  prompt: string;
  segmentId: string;
  timeRange: { start_s: number; end_s: number };
  currentEffects: Record<string, unknown>;
}

/**
 * POST /api/clips/{clipId}/ai-edit
 * Uses Claude to interpret a natural-language prompt and return effect changes.
 * Supports: color grading, zoom, speed, transitions, AND caption/subtitle adjustments.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ clipId: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { clipId } = await params;
    const body = (await request.json()) as AiEditBody;

    if (!body.prompt || typeof body.prompt !== "string") {
      return NextResponse.json({ error: "Missing prompt" }, { status: 400 });
    }

    const anthropic = new Anthropic();

    const systemPrompt = `You are a video effects and subtitle assistant. Given a user request about a video segment, return a JSON object with changes to apply.

Valid fields and allowed values:

VIDEO EFFECTS:
- colorProfile: one of ${JSON.stringify(VALID_COLOR_PROFILES)}
- vignette: boolean
- filmGrain: boolean
- zoom: boolean
- zoomLevel: "punched_in" (1.1x) or "tight" (1.15x)
- speedRamp: boolean
- speedFactor: number between 0.5 and 2.0
- transitionType: one of ${JSON.stringify(VALID_TRANSITION_TYPES)}

CAPTIONS / SUBTITLES:
- captions: object with any of these fields:
  - enabled: boolean (show/hide captions)
  - position: one of ${JSON.stringify(VALID_CAPTION_POSITIONS)}
  - fontSize: one of ${JSON.stringify(VALID_CAPTION_SIZES)}
  - color: hex color string (e.g. "#FFFF00" for yellow)
  - background: one of ${JSON.stringify(VALID_CAPTION_BACKGROUNDS)}
  - casing: one of ${JSON.stringify(VALID_CAPTION_CASINGS)}

Examples of caption requests and expected responses:
- "move subtitles to top" → {"captions": {"position": "top"}}
- "make captions bigger and yellow" → {"captions": {"fontSize": "large", "color": "#FFFF00"}}
- "uppercase captions with no background" → {"captions": {"casing": "upper", "background": "none"}}
- "hide subtitles" → {"captions": {"enabled": false}}
- "pill style captions at center" → {"captions": {"position": "center", "background": "pill"}}

Only include fields that should change. Return ONLY valid JSON, no explanation.

Current segment effects: ${JSON.stringify(body.currentEffects)}
Time range: ${body.timeRange.start_s.toFixed(1)}s - ${body.timeRange.end_s.toFixed(1)}s`;

    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 300,
      messages: [{ role: "user", content: body.prompt }],
      system: systemPrompt,
    });

    const textBlock = message.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      return NextResponse.json({ error: "No response from AI" }, { status: 500 });
    }

    let jsonStr = textBlock.text.trim();
    if (jsonStr.startsWith("```")) {
      jsonStr = jsonStr.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    }

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(jsonStr);
    } catch {
      return NextResponse.json({ error: "Failed to parse AI response" }, { status: 500 });
    }

    // Validate and sanitize
    const effects: Record<string, unknown> = {};

    if (typeof parsed.colorProfile === "string" && VALID_COLOR_PROFILES.includes(parsed.colorProfile)) {
      effects.colorProfile = parsed.colorProfile;
    }
    if (typeof parsed.vignette === "boolean") effects.vignette = parsed.vignette;
    if (typeof parsed.filmGrain === "boolean") effects.filmGrain = parsed.filmGrain;
    if (typeof parsed.zoom === "boolean") effects.zoom = parsed.zoom;
    if (typeof parsed.zoomLevel === "string" && ["punched_in", "tight"].includes(parsed.zoomLevel)) {
      effects.zoomLevel = parsed.zoomLevel;
    }
    if (typeof parsed.speedRamp === "boolean") effects.speedRamp = parsed.speedRamp;
    if (typeof parsed.speedFactor === "number") {
      effects.speedFactor = Math.max(0.5, Math.min(2.0, parsed.speedFactor));
      if (effects.speedRamp === undefined) effects.speedRamp = true;
    }
    if (typeof parsed.transitionType === "string" && VALID_TRANSITION_TYPES.includes(parsed.transitionType)) {
      effects.transitionType = parsed.transitionType;
    }

    // Validate captions
    if (parsed.captions && typeof parsed.captions === "object") {
      const cap = parsed.captions as Record<string, unknown>;
      const validCaptions: Record<string, unknown> = {};

      if (typeof cap.enabled === "boolean") validCaptions.enabled = cap.enabled;
      if (typeof cap.position === "string" && VALID_CAPTION_POSITIONS.includes(cap.position)) {
        validCaptions.position = cap.position;
      }
      if (typeof cap.fontSize === "string" && VALID_CAPTION_SIZES.includes(cap.fontSize)) {
        validCaptions.fontSize = cap.fontSize;
      }
      if (typeof cap.color === "string" && /^#[0-9A-Fa-f]{6}$/.test(cap.color)) {
        validCaptions.color = cap.color;
      }
      if (typeof cap.background === "string" && VALID_CAPTION_BACKGROUNDS.includes(cap.background)) {
        validCaptions.background = cap.background;
      }
      if (typeof cap.casing === "string" && VALID_CAPTION_CASINGS.includes(cap.casing)) {
        validCaptions.casing = cap.casing;
      }

      if (Object.keys(validCaptions).length > 0) {
        effects.captions = validCaptions;
      }
    }

    return NextResponse.json({ effects, clipId });
  } catch (error) {
    console.error("AI edit error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
