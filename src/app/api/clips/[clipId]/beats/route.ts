import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/lib/db";
import { clips } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import path from "path";
import { detectBeats } from "@/lib/ffmpeg/beat-detector";

/**
 * GET /api/clips/{clipId}/beats
 * Detects beat markers in the clip's audio track.
 * Returns { beats: BeatMarker[] }
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

    // Find the source audio — use the waveform-audio.mp3 stored alongside thumbnails
    if (!clip.thumbnailsDir) {
      return NextResponse.json({ error: "Audio not available" }, { status: 404 });
    }

    const audioPath = path.join(path.dirname(clip.thumbnailsDir), "waveform-audio.mp3");

    const beats = await detectBeats(audioPath, {
      energyThreshold: 0.6,
      minBeatSpacingMs: 250,
    });

    return NextResponse.json({ beats }, {
      headers: {
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (error) {
    console.error("Beat detection error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
