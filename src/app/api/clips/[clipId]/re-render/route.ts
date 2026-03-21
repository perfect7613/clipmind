import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/lib/db";
import { clips, jobs } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { renderClip } from "@/lib/agents/render-agent-1";
import path from "path";
import os from "os";

export const maxDuration = 300;

/**
 * POST /api/clips/{clipId}/re-render
 * Triggers FFmpeg re-render using the saved timeline state.
 * Returns SSE progress stream.
 */
export async function POST(
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

    // Get the job to find the source video
    const [job] = clip.jobId
      ? await db.select().from(jobs).where(eq(jobs.id, clip.jobId)).limit(1)
      : [];

    if (!job || !job.videoUrls) {
      return NextResponse.json({ error: "Source video not found" }, { status: 404 });
    }

    const videoUrls = job.videoUrls as string[];
    const sourceVideo = videoUrls[0];

    // Use timeline data for updated cut points
    const timeline = clip.timelineData as any;
    const startS = clip.startS || 0;
    const endS = clip.endS || 60;

    const outputDir = path.join(os.tmpdir(), "clipmind-outputs");

    // SSE progress stream
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ step: "rendering", pct: 10 })}\n\n`));

          const outputPath = await renderClip(
            sourceVideo,
            {
              clip_id: clipId,
              title: clip.title || "Re-rendered clip",
              start_s: startS,
              end_s: endS,
              duration_s: endS - startS,
              mood: (clip.mood as any) || "interesting",
              hook_text: "",
              why: "",
              scores: (clip.scores as any) || {},
            },
            outputDir,
            0,
            {
              colorProfile: timeline?.effects?.colorProfile || "neutral",
              audioProfile: timeline?.effects?.audioProfile || "youtube_standard",
            }
          );

          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ step: "saving", pct: 80 })}\n\n`));

          // Update clip with new render URL
          await db.update(clips).set({
            renderUrl: outputPath,
          }).where(eq(clips.id, clipId));

          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ step: "completed", pct: 100, renderUrl: outputPath })}\n\n`));
        } catch (err) {
          const message = err instanceof Error ? err.message : "Re-render failed";
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ step: "failed", error: message })}\n\n`));
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
    console.error("Re-render error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
