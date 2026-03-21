import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/lib/db";
import { jobs, clips } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { stitchHighlightReel, mapToXfadeType } from "@/lib/agents/highlight-stitcher";
import type { ClipForStitch } from "@/lib/agents/highlight-stitcher";

export const maxDuration = 300;

/**
 * POST /api/jobs/{jobId}/stitch
 * Re-stitch the highlight reel with custom clip order and transitions.
 *
 * Body: {
 *   clipOrder: [{ clipId: string, transitionToNext?: string }]
 *   defaultTransition?: string
 *   transitionDuration?: number
 * }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { jobId } = await params;
    const body = await request.json();
    const { clipOrder, defaultTransition = "fade", transitionDuration = 0.7 } = body;

    if (!clipOrder || !Array.isArray(clipOrder) || clipOrder.length === 0) {
      return NextResponse.json({ error: "clipOrder is required" }, { status: 400 });
    }

    // Get all clips for this job
    const jobClips = await db.select().from(clips).where(eq(clips.jobId, jobId));
    const clipMap = new Map(jobClips.map((c) => [c.id, c]));

    // Build ordered clip list with transitions
    const orderedClips: ClipForStitch[] = [];
    for (const item of clipOrder) {
      const clip = clipMap.get(item.clipId);
      if (!clip || !clip.renderUrl) continue;
      orderedClips.push({
        path: clip.renderUrl,
        transitionToNext: item.transitionToNext
          ? mapToXfadeType(item.transitionToNext)
          : undefined,
      });
    }

    if (orderedClips.length === 0) {
      return NextResponse.json({ error: "No valid clips found" }, { status: 400 });
    }

    // SSE progress
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ step: "stitching", pct: 10 })}\n\n`));

          const reelPath = await stitchHighlightReel(
            orderedClips,
            defaultTransition,
            transitionDuration
          );

          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ step: "saving", pct: 80 })}\n\n`));

          // Update job with new highlight reel URL
          await db.update(jobs).set({
            highlightReelUrl: reelPath,
          }).where(eq(jobs.id, jobId));

          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ step: "completed", pct: 100 })}\n\n`));
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Stitch failed";
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ step: "failed", error: msg })}\n\n`));
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    console.error("Stitch error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
