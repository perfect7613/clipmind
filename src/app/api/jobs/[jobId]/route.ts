import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/lib/db";
import { jobs, clips } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function GET(
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

    const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1);
    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    const jobClips = await db.select().from(clips).where(eq(clips.jobId, jobId));

    return NextResponse.json({
      id: job.id,
      status: job.status,
      currentStep: job.currentStep,
      progressPct: job.progressPct,
      errorMessage: job.errorMessage,
      presetId: job.presetId,
      highlightReelUrl: job.highlightReelUrl,
      clips: jobClips,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
    });
  } catch (error) {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
