import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/lib/db";
import { clips } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { readFileSync, statSync } from "fs";

/**
 * Serve a clip's video file from disk.
 * Supports range requests for video seeking.
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

    if (!clip || !clip.renderUrl) {
      return NextResponse.json({ error: "Clip not found" }, { status: 404 });
    }

    const filePath = clip.renderUrl;

    let stat;
    try {
      stat = statSync(filePath);
    } catch {
      return NextResponse.json({ error: "Video file not found on disk" }, { status: 404 });
    }

    const fileSize = stat.size;
    const range = request.headers.get("range");

    if (range) {
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : Math.min(start + 1024 * 1024, fileSize - 1); // 1MB chunks
      const chunkSize = end - start + 1;

      // Read the specific byte range
      const buffer = Buffer.alloc(chunkSize);
      const fd = require("fs").openSync(filePath, "r");
      require("fs").readSync(fd, buffer, 0, chunkSize, start);
      require("fs").closeSync(fd);

      return new Response(buffer, {
        status: 206,
        headers: {
          "Content-Range": `bytes ${start}-${end}/${fileSize}`,
          "Accept-Ranges": "bytes",
          "Content-Length": String(chunkSize),
          "Content-Type": "video/mp4",
        },
      });
    }

    // Full file — read entirely (fine for clips under ~500MB)
    const buffer = readFileSync(filePath);

    return new Response(buffer, {
      headers: {
        "Content-Length": String(fileSize),
        "Content-Type": "video/mp4",
        "Accept-Ranges": "bytes",
      },
    });
  } catch (error) {
    console.error("Video serve error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
