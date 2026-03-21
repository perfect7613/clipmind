import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/lib/db";
import { jobs } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { readFileSync, statSync } from "fs";

/**
 * GET /api/jobs/{jobId}/highlight-reel
 * Serves the stitched highlight reel MP4.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { jobId } = await params;
    const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1);

    if (!job || !job.highlightReelUrl) {
      return NextResponse.json({ error: "Highlight reel not available" }, { status: 404 });
    }

    const filePath = job.highlightReelUrl;

    let stat;
    try {
      stat = statSync(filePath);
    } catch {
      return NextResponse.json({ error: "Highlight reel file not found" }, { status: 404 });
    }

    const buffer = readFileSync(filePath);
    return new Response(buffer, {
      headers: {
        "Content-Type": "video/mp4",
        "Content-Length": String(stat.size),
        "Content-Disposition": `attachment; filename="highlight-reel.mp4"`,
      },
    });
  } catch (error) {
    console.error("Highlight reel error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
