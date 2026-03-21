import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/lib/db";
import { clips } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { readFileSync, readdirSync, statSync } from "fs";
import path from "path";

/**
 * GET /api/clips/{clipId}/thumbnails
 * Returns thumbnail images as a JSON array of base64 data URLs,
 * or serves individual thumbnails by index via ?index=N query param.
 */
export async function GET(
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
    const [clip] = await db.select().from(clips).where(eq(clips.id, clipId)).limit(1);

    if (!clip || !clip.thumbnailsDir) {
      return NextResponse.json({ error: "Thumbnails not available" }, { status: 404 });
    }

    const thumbDir = clip.thumbnailsDir;

    // Check if requesting a single thumbnail by index
    const index = request.nextUrl.searchParams.get("index");
    if (index !== null) {
      const files = readdirSync(thumbDir).filter((f: string) => f.endsWith(".jpg")).sort();
      const idx = parseInt(index, 10);
      if (idx < 0 || idx >= files.length) {
        return NextResponse.json({ error: "Index out of range" }, { status: 404 });
      }
      const buffer = readFileSync(path.join(thumbDir, files[idx]));
      return new Response(buffer, {
        headers: { "Content-Type": "image/jpeg", "Cache-Control": "public, max-age=3600" },
      });
    }

    // Return list of thumbnail URLs
    let files: string[];
    try {
      files = readdirSync(thumbDir).filter((f: string) => f.endsWith(".jpg")).sort();
    } catch {
      return NextResponse.json({ error: "Thumbnails directory not found" }, { status: 404 });
    }

    const thumbnails = files.map((_f: string, i: number) => ({
      index: i,
      url: `/api/clips/${clipId}/thumbnails?index=${i}`,
    }));

    return NextResponse.json({ count: thumbnails.length, thumbnails });
  } catch (error) {
    console.error("Thumbnails error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
