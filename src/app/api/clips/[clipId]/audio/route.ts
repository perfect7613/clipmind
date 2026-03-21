import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/lib/db";
import { clips } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { readFileSync, statSync } from "fs";
import path from "path";

/**
 * GET /api/clips/{clipId}/audio
 * Serves the audio track (MP3) for client-side waveform rendering.
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

    if (!clip || !clip.thumbnailsDir) {
      return NextResponse.json({ error: "Audio not available" }, { status: 404 });
    }

    // Audio file is stored alongside thumbnails
    const audioPath = path.join(path.dirname(clip.thumbnailsDir), "waveform-audio.mp3");

    let stat;
    try {
      stat = statSync(audioPath);
    } catch {
      return NextResponse.json({ error: "Audio file not found" }, { status: 404 });
    }

    const buffer = readFileSync(audioPath);
    return new Response(buffer, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Length": String(stat.size),
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (error) {
    console.error("Audio serve error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
