import { Worker, Job } from "bullmq";
import { connection } from "./queue";
import type { EditJobPayload } from "@/types";

// Worker for the edit pipeline
export function createEditWorker() {
  const worker = new Worker(
    "edit-pipeline",
    async (job: Job<EditJobPayload>) => {
      const { videoUrls, dnaProfileId, platform, clipCount } = job.data;

      // Step 1: Ingest + Transcribe
      await job.updateProgress({ step: "ingesting", pct: 5 });
      // TODO: Call ingest_agent

      // Step 2: Context + Score + Select
      await job.updateProgress({ step: "analyzing", pct: 20 });
      // TODO: Call context_agent, moment_scorer, clip_selector

      // Step 3: Silence + Zoom + Color + Audio
      await job.updateProgress({ step: "editing", pct: 40 });
      // TODO: Call silence, zoom, color, audio agents

      // Step 4: Render Skill 1
      await job.updateProgress({ step: "rendering_skill1", pct: 55 });
      // TODO: Call render_agent_1

      // Step 5: Remotion animations
      await job.updateProgress({ step: "animating", pct: 70 });
      // TODO: Call show_moment_detector, animation_generator, remotion_renderer

      // Step 6: Final render
      await job.updateProgress({ step: "finalizing", pct: 90 });
      // TODO: Call caption_writer, broll_matcher, render_agent_3

      await job.updateProgress({ step: "completed", pct: 100 });

      return { status: "completed" };
    },
    {
      connection,
      concurrency: 1,
    }
  );

  worker.on("completed", (job) => {
    console.log(`Job ${job.id} completed`);
  });

  worker.on("failed", (job, err) => {
    console.error(`Job ${job?.id} failed:`, err.message);
  });

  return worker;
}

// Worker for onboarding (DNA generation)
export function createOnboardingWorker() {
  const worker = new Worker(
    "onboarding",
    async (job: Job) => {
      const { type, url, videoUrl, userId } = job.data;

      if (type === "youtube") {
        await job.updateProgress({ step: "fetching_youtube", pct: 10 });
        // TODO: fetch_agent
        await job.updateProgress({ step: "sampling_frames", pct: 25 });
        // TODO: frame_sampler_agent
        await job.updateProgress({ step: "analyzing_visual", pct: 40 });
        // TODO: visual_analyzer_agent
        await job.updateProgress({ step: "analyzing_voice", pct: 55 });
        // TODO: voice_analyzer_agent
        await job.updateProgress({ step: "analyzing_pacing", pct: 70 });
        // TODO: pacing_analyzer_agent
        await job.updateProgress({ step: "writing_dna", pct: 90 });
        // TODO: dna_writer_agent
      } else {
        await job.updateProgress({ step: "ingesting", pct: 10 });
        // TODO: ingest_agent
        await job.updateProgress({ step: "sampling_frames", pct: 30 });
        // TODO: frame_sampler_agent
        await job.updateProgress({ step: "analyzing", pct: 50 });
        // TODO: analyzer agents
        await job.updateProgress({ step: "writing_dna", pct: 90 });
        // TODO: dna_writer_agent
      }

      await job.updateProgress({ step: "completed", pct: 100 });
      return { status: "completed" };
    },
    {
      connection,
      concurrency: 1,
    }
  );

  return worker;
}
