import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/lib/db";
import { clips } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

/**
 * GET /api/clips/{clipId}/timeline
 * Returns timeline data (cut points, effects, zoom events).
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ clipId: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { clipId } = await params;
    const [clip] = await db.select().from(clips).where(eq(clips.id, clipId)).limit(1);

    if (!clip) {
      return NextResponse.json({ error: "Clip not found" }, { status: 404 });
    }

    return NextResponse.json({
      clipId: clip.id,
      durationS: clip.durationS,
      startS: clip.startS,
      endS: clip.endS,
      timeline: clip.timelineData || {
        cutPoints: [],
        effects: {},
        zoomEvents: [],
        speedRamps: [],
      },
    });
  } catch (error) {
    console.error("Timeline GET error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

/**
 * PUT /api/clips/{clipId}/timeline
 * Saves updated timeline state from the timeline editor.
 */
export async function PUT(
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
    const body = await request.json();

    const [clip] = await db.select().from(clips).where(eq(clips.id, clipId)).limit(1);
    if (!clip) {
      return NextResponse.json({ error: "Clip not found" }, { status: 404 });
    }

    await db.update(clips).set({
      timelineData: body.timeline,
      startS: body.startS ?? clip.startS,
      endS: body.endS ?? clip.endS,
    }).where(eq(clips.id, clipId));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Timeline PUT error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
