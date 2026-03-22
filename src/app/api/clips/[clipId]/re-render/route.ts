import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/lib/db";
import { clips, jobs } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { renderClip } from "@/lib/agents/render-agent-1";
import { applyTransitionsBetweenSegments, getDefaultTransition } from "@/lib/agents/transition-engine";
import path from "path";
import os from "os";
import { promises as fs } from "fs";

export const maxDuration = 300;

/**
 * POST /api/clips/{clipId}/re-render
 * Re-renders using saved timeline segments + effects.
 * If multiple segments exist, renders each and stitches with transitions.
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

    const [job] = clip.jobId
      ? await db.select().from(jobs).where(eq(jobs.id, clip.jobId)).limit(1)
      : [];

    if (!job || !job.videoUrls) {
      return NextResponse.json({ error: "Source video not found" }, { status: 404 });
    }

    const videoUrls = job.videoUrls as string[];
    const sourceVideo = videoUrls[0];
    const timeline = clip.timelineData as any;
    const outputDir = path.join(os.tmpdir(), "clipmind-outputs");
    await fs.mkdir(outputDir, { recursive: true });

    // Get segments from timeline data
    const segments: Array<{ start_s: number; end_s: number; effects?: any }> =
      timeline?.segments || timeline?.cutPoints || [{ start_s: clip.startS || 0, end_s: clip.endS || 60 }];

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          const send = (data: any) => {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
          };

          send({ step: "rendering", pct: 5 });

          if (segments.length === 1) {
            // Single segment — render directly
            const seg = segments[0];
            const outputPath = await renderClip(
              sourceVideo,
              {
                clip_id: clipId,
                title: clip.title || "Re-rendered",
                start_s: seg.start_s,
                end_s: seg.end_s,
                duration_s: seg.end_s - seg.start_s,
                mood: (clip.mood as any) || "interesting",
                hook_text: "", why: "",
                scores: (clip.scores as any) || {},
              },
              outputDir, 0,
              {
                colorProfile: seg.effects?.colorProfile || timeline?.effects?.colorProfile || "neutral",
                audioProfile: seg.effects?.audioProfile || timeline?.effects?.audioProfile || "youtube_standard",
              }
            );

            send({ step: "saving", pct: 80 });
            await db.update(clips).set({ renderUrl: outputPath }).where(eq(clips.id, clipId));
            send({ step: "completed", pct: 100, renderUrl: outputPath });
          } else {
            // Multiple segments — render each, then stitch with transitions
            const segmentPaths: string[] = [];

            for (let s = 0; s < segments.length; s++) {
              const seg = segments[s];
              const pct = 10 + Math.round((s / segments.length) * 60);
              send({ step: `rendering_segment_${s + 1}`, pct });

              const segPath = await renderClip(
                sourceVideo,
                {
                  clip_id: `${clipId}-seg-${s}`,
                  title: `Segment ${s + 1}`,
                  start_s: seg.start_s,
                  end_s: seg.end_s,
                  duration_s: seg.end_s - seg.start_s,
                  mood: (clip.mood as any) || "interesting",
                  hook_text: "", why: "",
                  scores: (clip.scores as any) || {},
                },
                outputDir, s,
                {
                  colorProfile: seg.effects?.colorProfile || timeline?.effects?.colorProfile || "neutral",
                  audioProfile: seg.effects?.audioProfile || timeline?.effects?.audioProfile || "youtube_standard",
                }
              );

              // Validate
              const stat = await fs.stat(segPath);
              if (stat.size > 1000) {
                segmentPaths.push(segPath);
              }
            }

            if (segmentPaths.length === 0) {
              send({ step: "failed", error: "All segments failed to render" });
              controller.close();
              return;
            }

            send({ step: "stitching", pct: 75 });

            let outputPath: string;
            if (segmentPaths.length === 1) {
              outputPath = segmentPaths[0];
            } else {
              // Get transition config from the first segment's effects
              const transitionType = segments[0]?.effects?.transitionType || "crossfade";
              const transConfig = { type: transitionType as any, durationS: 0.5 };

              // Build CutSegment format for transition engine
              const cutSegments = segmentPaths.map((p, idx) => ({
                start_s: 0,
                end_s: segments[idx] ? segments[idx].end_s - segments[idx].start_s : 30,
                path: p,
              }));

              outputPath = path.join(outputDir, `re-rendered-${clipId}-${Date.now()}.mp4`);
              try {
                await applyTransitionsBetweenSegments(segmentPaths[0], cutSegments, transConfig, outputPath);
              } catch {
                // Fallback: just use the first segment
                outputPath = segmentPaths[0];
              }
            }

            send({ step: "saving", pct: 90 });
            await db.update(clips).set({ renderUrl: outputPath }).where(eq(clips.id, clipId));
            send({ step: "completed", pct: 100, renderUrl: outputPath });
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Re-render failed";
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
    console.error("Re-render error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
