import { extractAudio } from "@/lib/ffmpeg/extract";
import { getSarvamClient } from "@/lib/sarvam/client";
import { loadDnaSkillToFilesystem, cleanupDnaSkill, getDnaProfile } from "@/lib/dna/loader";
import { planSilenceRemoval } from "./silence-remover";
import { planZoomEvents, zoomEventsToFFmpegCrops } from "./zoom-planner";
import { analyzeAndScore } from "./context-scorer";
import { selectClips } from "./clip-selector";
import { renderSkill1, buildRenderSegments } from "./render-agent-1";
import { detectShowMoments } from "./show-moment-detector";
import { generateAnimations } from "./animation-generator";
import { renderAnimations } from "./remotion-renderer";
import { generatePhraseCaptions, writeCaptionFile } from "./caption-writer";
import { matchBroll } from "./broll-matcher";
import { renderFinal } from "./render-agent-3";
import { syncCameras } from "./multicam-sync";
import { promises as fs } from "fs";
import path from "path";
import os from "os";
import type { EditJobPayload, TranscriptResult } from "@/types";

export type ProgressCallback = (step: string, pct: number) => void;

export interface PipelineResult {
  clips: {
    clip_id: string;
    title: string;
    duration_s: number;
    mood: string;
    scores: Record<string, number>;
    render_url: string;
  }[];
}

/**
 * Full three-skill pipeline coordinator.
 * Skill 1 (video-edit) → Skill 2 (video-animate) → Skill 3 (video-finalize)
 */
export async function runPipeline(
  payload: EditJobPayload,
  userId: string,
  onProgress?: ProgressCallback
): Promise<PipelineResult> {
  const workDir = path.join(os.tmpdir(), `clipmind-pipeline-${Date.now()}`);
  await fs.mkdir(workDir, { recursive: true });

  try {
    // Load DNA skill
    onProgress?.("loading_dna", 2);
    const dnaProfile = await getDnaProfile(payload.dnaProfileId);
    if (!dnaProfile) throw new Error("DNA profile not found");

    const dnaContent = dnaProfile.skillContent;
    await loadDnaSkillToFilesystem(payload.dnaProfileId, workDir);

    // ═══════════════════════════════════════════════════
    // SKILL 1: video-edit
    // ═══════════════════════════════════════════════════

    // Multi-cam sync (if 2 cameras)
    let syncOffset = 0;
    if (payload.videoUrls.length === 2) {
      onProgress?.("syncing_cameras", 5);
      try {
        const syncResult = await syncCameras(payload.videoUrls[0], payload.videoUrls[1]);
        if (syncResult.confidence === "high") {
          syncOffset = syncResult.offset_s;
        }
      } catch (err) {
        console.error("Multi-cam sync failed, using single camera:", err);
      }
    }

    // Ingest + Transcribe
    onProgress?.("transcribing", 10);
    const { audioPath, duration_s } = await extractAudio(payload.videoUrls[0], workDir);
    const audioBuffer = await fs.readFile(audioPath);
    const sarvam = getSarvamClient();
    const transcript: TranscriptResult = await sarvam.transcribe(audioBuffer);

    // Context analysis + scoring
    onProgress?.("analyzing", 20);
    const scored = await analyzeAndScore(transcript.words, duration_s);

    // Select clips
    onProgress?.("selecting_clips", 30);
    const clips = await selectClips(scored.segments, {
      clipCount: payload.clipCount,
    });

    // Plan silence removal
    onProgress?.("planning_edits", 35);
    const silenceResult = planSilenceRemoval(transcript.words, duration_s);

    // Plan zoom events
    const zoomPlan = await planZoomEvents(transcript.words, duration_s);
    const zoomCrops = zoomEventsToFFmpegCrops(zoomPlan.events, zoomPlan.face_crop);

    // Parse DNA for color/audio profiles
    const colorProfile = extractDnaValue(dnaContent, "Profile:", "neutral") as any;
    const audioStyle = extractDnaValue(dnaContent, "Style:", "youtube_standard") as any;

    // Render Skill 1 — for each clip
    onProgress?.("rendering_skill1", 40);
    const clipResults: PipelineResult["clips"] = [];

    for (let i = 0; i < clips.length; i++) {
      const clip = clips[i];
      onProgress?.(`rendering_clip_${i + 1}`, 40 + Math.round((i / clips.length) * 20));

      const segments = buildRenderSegments([clip], zoomCrops);
      const editedPath = await renderSkill1(
        [payload.videoUrls[0]],
        segments,
        workDir,
        { colorProfile, audioProfile: audioStyle }
      );

      // ═══════════════════════════════════════════════════
      // SKILL 2: video-animate (skip if requested)
      // ═══════════════════════════════════════════════════

      let renderedAnimations: Awaited<ReturnType<typeof renderAnimations>> = [];

      if (!payload.skipAnimations) {
        onProgress?.(`animating_clip_${i + 1}`, 60 + Math.round((i / clips.length) * 10));

        // Re-transcribe the edited clip for accurate timestamps
        const clipWords = transcript.words.filter(
          (w) => w.start_s >= clip.start_s && w.end_s <= clip.end_s
        ).map((w) => ({
          ...w,
          start_s: w.start_s - clip.start_s,
          end_s: w.end_s - clip.start_s,
        }));

        const moments = await detectShowMoments(clipWords, clip.duration_s);
        if (moments.length > 0) {
          const brand = {
            headingFont: extractDnaValue(dnaContent, "Heading font:", "DM Serif Display"),
            bodyFont: extractDnaValue(dnaContent, "Body font:", "DM Sans"),
            primaryColor: extractDnaValue(dnaContent, "Primary color:", "#E8620E"),
            secondaryColor: extractDnaValue(dnaContent, "Secondary color:", "#0E5C58"),
            animationStyle: extractDnaValue(dnaContent, "Animation style:", "slide-up"),
            darkModeDefault: dnaContent.includes("Dark mode default: true"),
          };

          const generated = await generateAnimations(moments, brand, dnaContent);
          try {
            renderedAnimations = await renderAnimations(generated);
          } catch {
            // Graceful degradation — skip animations
          }
        }
      }

      // ═══════════════════════════════════════════════════
      // SKILL 3: video-finalize
      // ═══════════════════════════════════════════════════

      onProgress?.(`finalizing_clip_${i + 1}`, 75 + Math.round((i / clips.length) * 15));

      // Captions
      const clipWords = transcript.words.filter(
        (w) => w.start_s >= clip.start_s && w.end_s <= clip.end_s
      ).map((w) => ({
        ...w,
        start_s: w.start_s - clip.start_s,
        end_s: w.end_s - clip.start_s,
      }));

      const captions = generatePhraseCaptions(clipWords, {
        casing: extractDnaValue(dnaContent, "Casing:", "sentence") as any,
        colorHex: extractDnaValue(dnaContent, "Color:", "#FFFFFF"),
      });

      const captionPath = path.join(workDir, `captions-${i}.ass`);
      await writeCaptionFile(captions, captionPath);

      // B-roll
      let brollInsertions: Awaited<ReturnType<typeof matchBroll>> = [];
      if (!payload.skipBroll) {
        const animTimestamps = renderedAnimations.map((a) => ({
          start_s: a.timestamp_s,
          end_s: a.timestamp_s + a.duration_s,
        }));
        try {
          brollInsertions = await matchBroll(clipWords, userId, animTimestamps);
        } catch {
          // Graceful degradation
        }
      }

      // Final render
      const finalPath = await renderFinal(
        editedPath,
        captionPath,
        renderedAnimations,
        brollInsertions,
        workDir
      );

      // Move final to a stable location
      const outputPath = path.join(workDir, `final-clip-${i + 1}.mp4`);
      await fs.rename(finalPath, outputPath);

      clipResults.push({
        clip_id: clip.clip_id,
        title: clip.title,
        duration_s: clip.duration_s,
        mood: clip.mood,
        scores: clip.scores,
        render_url: outputPath,
      });
    }

    onProgress?.("completed", 100);
    return { clips: clipResults };
  } finally {
    await cleanupDnaSkill(workDir);
  }
}

function extractDnaValue(dnaContent: string, key: string, defaultValue: string): string {
  const regex = new RegExp(`${key}\\s*(.+)`, "m");
  const match = dnaContent.match(regex);
  return match ? match[1].trim() : defaultValue;
}
