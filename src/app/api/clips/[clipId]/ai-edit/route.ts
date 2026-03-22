import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import Anthropic from "@anthropic-ai/sdk";

const VALID_COLOR_PROFILES = [
  "warm",
  "neutral",
  "cool",
  "cinematic",
  "bw",
  "vintage",
  "neon",
  "flat",
];

const VALID_TRANSITION_TYPES = [
  "crossfade",
  "dip-to-black",
  "wipe-left",
  "fade",
  "dissolve",
];

interface AiEditBody {
  prompt: string;
  segmentId: string;
  timeRange: { start_s: number; end_s: number };
  currentEffects: Record<string, unknown>;
}

/**
 * POST /api/clips/{clipId}/ai-edit
 * Uses Claude to interpret a natural-language prompt and return effect changes.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ clipId: string }> }
) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { clipId } = await params;
    const body = (await request.json()) as AiEditBody;

    if (!body.prompt || typeof body.prompt !== "string") {
      return NextResponse.json(
        { error: "Missing prompt" },
        { status: 400 }
      );
    }

    const anthropic = new Anthropic();

    const systemPrompt = `You are a video effects assistant. Given a user request about a video segment, return a JSON object with effect changes to apply.

Valid fields and their allowed values:
- colorProfile: one of ${JSON.stringify(VALID_COLOR_PROFILES)}
- vignette: boolean
- filmGrain: boolean
- zoom: boolean
- speedRamp: boolean
- speedFactor: number between 0.5 and 2.0
- transitionType: one of ${JSON.stringify(VALID_TRANSITION_TYPES)}

Only include fields that should change based on the user's request. Return ONLY valid JSON, no explanation.

Current segment effects: ${JSON.stringify(body.currentEffects)}
Time range: ${body.timeRange.start_s}s - ${body.timeRange.end_s}s`;

    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 256,
      messages: [{ role: "user", content: body.prompt }],
      system: systemPrompt,
    });

    // Extract text from response
    const textBlock = message.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      return NextResponse.json(
        { error: "No response from AI" },
        { status: 500 }
      );
    }

    // Parse JSON from response (handle possible markdown code blocks)
    let jsonStr = textBlock.text.trim();
    if (jsonStr.startsWith("```")) {
      jsonStr = jsonStr.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    }

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(jsonStr);
    } catch {
      return NextResponse.json(
        { error: "Failed to parse AI response" },
        { status: 500 }
      );
    }

    // Validate and sanitize the parsed effects
    const effects: Record<string, unknown> = {};

    if (
      typeof parsed.colorProfile === "string" &&
      VALID_COLOR_PROFILES.includes(parsed.colorProfile)
    ) {
      effects.colorProfile = parsed.colorProfile;
    }

    if (typeof parsed.vignette === "boolean") {
      effects.vignette = parsed.vignette;
    }

    if (typeof parsed.filmGrain === "boolean") {
      effects.filmGrain = parsed.filmGrain;
    }

    if (typeof parsed.zoom === "boolean") {
      effects.zoom = parsed.zoom;
    }

    if (typeof parsed.speedRamp === "boolean") {
      effects.speedRamp = parsed.speedRamp;
    }

    if (typeof parsed.speedFactor === "number") {
      effects.speedFactor = Math.max(0.5, Math.min(2.0, parsed.speedFactor));
      // If speedFactor is set, also enable speedRamp
      if (effects.speedRamp === undefined) {
        effects.speedRamp = true;
      }
    }

    if (
      typeof parsed.transitionType === "string" &&
      VALID_TRANSITION_TYPES.includes(parsed.transitionType)
    ) {
      effects.transitionType = parsed.transitionType;
    }

    return NextResponse.json({ effects, clipId });
  } catch (error) {
    console.error("AI edit error:", error);
    return NextResponse.json(
      { error: "Internal error" },
      { status: 500 }
    );
  }
}
