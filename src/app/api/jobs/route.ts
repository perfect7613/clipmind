import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/lib/db";
import { jobs, projects } from "@/lib/db/schema";
import { runPipeline } from "@/lib/agents/coordinator";
import { eq } from "drizzle-orm";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { videoUrls, dnaProfileId, platform, clipCount, skipAnimations, skipBroll } = body;

    if (!videoUrls?.length || !dnaProfileId || !platform) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Create project
    const [project] = await db.insert(projects).values({
      userId: user.id,
      title: `Edit ${new Date().toLocaleDateString()}`,
      platform,
      clipCount: clipCount || 5,
      status: "processing",
      dnaProfileId,
    }).returning();

    // Create job
    const [job] = await db.insert(jobs).values({
      projectId: project.id,
      userId: user.id,
      status: "processing",
      currentStep: "starting",
      videoUrls: videoUrls,
      startedAt: new Date(),
    }).returning();

    // Run pipeline async (don't await — return job ID immediately)
    runPipeline(
      { videoUrls, dnaProfileId, platform, clipCount: clipCount || 5, skipAnimations, skipBroll },
      user.id,
      async (step, pct) => {
        await db.update(jobs).set({
          currentStep: step,
          progressPct: pct,
        }).where(eq(jobs.id, job.id));
      }
    ).then(async (result) => {
      await db.update(jobs).set({
        status: "completed",
        currentStep: "completed",
        progressPct: 100,
        resultUrls: result.clips.map((c) => c.render_url),
        completedAt: new Date(),
      }).where(eq(jobs.id, job.id));

      // Save clips to DB
      const { clips: clipsTable } = await import("@/lib/db/schema");
      for (const clip of result.clips) {
        await db.insert(clipsTable).values({
          jobId: job.id,
          projectId: project.id,
          title: clip.title,
          durationS: clip.duration_s,
          mood: clip.mood,
          scores: clip.scores,
          renderUrl: clip.render_url,
        });
      }
    }).catch(async (err) => {
      await db.update(jobs).set({
        status: "failed",
        currentStep: "failed",
        errorMessage: err.message,
        completedAt: new Date(),
      }).where(eq(jobs.id, job.id));
    });

    return NextResponse.json({ jobId: job.id, projectId: project.id });
  } catch (error) {
    console.error("Job creation error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal error" },
      { status: 500 }
    );
  }
}
