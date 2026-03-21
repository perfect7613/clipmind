import { extractAudio } from "@/lib/ffmpeg/extract";
import { getSarvamClient } from "@/lib/sarvam/client";
import { loadDnaSkillToFilesystem, cleanupDnaSkill, getDnaProfile } from "@/lib/dna/loader";
import { analyzeAndScore } from "./context-scorer";
import { selectClips } from "./clip-selector";
import { renderClip } from "./render-agent-1";
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
    if (payload.videoUrls.length === 2) {
      onProgress?.("syncing_cameras", 5);
      try {
        const syncResult = await syncCameras(payload.videoUrls[0], payload.videoUrls[1]);
        if (syncResult.confidence !== "high") {
          console.warn("Multi-cam sync low confidence, using single camera");
        }
      } catch (err) {
        console.error("Multi-cam sync failed, using single camera:", err);
      }
    }

    // Ingest + Transcribe
    onProgress?.("transcribing", 10);
    const { audioPath, duration_s } = await extractAudio(payload.videoUrls[0], workDir);
    const sarvam = getSarvamClient();
    const transcript: TranscriptResult = duration_s > 25
      ? await sarvam.transcribeLong(audioPath, duration_s)
      : await sarvam.transcribe(audioPath);

    console.log(`[Pipeline] Transcribed ${transcript.words.length} words, ${duration_s.toFixed(1)}s`);

    // Context analysis + scoring
    onProgress?.("analyzing", 20);
    const scored = await analyzeAndScore(transcript.words, duration_s);
    console.log(`[Pipeline] Scored ${scored.segments.length} segments`);

    // Select clips
    onProgress?.("selecting_clips", 30);
    const clips = await selectClips(scored.segments, {
      clipCount: payload.clipCount,
    });
    console.log(`[Pipeline] Selected ${clips.length} clips`);

    if (clips.length === 0) {
      throw new Error("No suitable clips found in the video");
    }

    // Parse DNA for color/audio profiles
    const colorProfile = extractDnaValue(dnaContent, "Profile:", "neutral") as any;
    const audioStyle = extractDnaValue(dnaContent, "Style:", "youtube_standard") as any;

    // Process each clip through the full pipeline
    onProgress?.("rendering", 40);
    const clipResults: PipelineResult["clips"] = [];

    for (let i = 0; i < clips.length; i++) {
      const clip = clips[i];
      const clipPctBase = 40 + Math.round((i / clips.length) * 50);

      // ── Skill 1: Render edited clip ──
      onProgress?.(`rendering_clip_${i + 1}`, clipPctBase);
      console.log(`[Pipeline] Rendering clip ${i + 1}: ${clip.title} (${clip.start_s}s → ${clip.end_s}s)`);

      let editedPath: string;
      try {
        editedPath = await renderClip(
          payload.videoUrls[0],
          clip,
          workDir,
          i,
          { colorProfile, audioProfile: audioStyle }
        );
      } catch (err) {
        console.error(`[Pipeline] Clip ${i + 1} render failed, skipping:`, err);
        continue;
      }

      // Build clip-relative word timestamps
      const clipWords = transcript.words
        .filter((w) => w.start_s >= clip.start_s && w.end_s <= clip.end_s)
        .map((w) => ({
          ...w,
          start_s: w.start_s - clip.start_s,
          end_s: w.end_s - clip.start_s,
        }));

      // ── Skill 2: Animations (skip if requested or no Remotion) ──
      let renderedAnimations: Awaited<ReturnType<typeof renderAnimations>> = [];

      if (!payload.skipAnimations) {
        onProgress?.(`animating_clip_${i + 1}`, clipPctBase + 5);
        try {
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
            renderedAnimations = await renderAnimations(generated);
          }
        } catch (err) {
          console.error(`[Pipeline] Animation failed for clip ${i + 1}, skipping:`, err);
        }
      }

      // ── Skill 3: Finalize (captions + B-roll + overlays) ──
      onProgress?.(`finalizing_clip_${i + 1}`, clipPctBase + 10);

      // Generate captions
      const captions = generatePhraseCaptions(clipWords, {
        casing: extractDnaValue(dnaContent, "Casing:", "sentence") as any,
        colorHex: extractDnaValue(dnaContent, "Color:", "#FFFFFF"),
      });

      let captionPath: string | null = null;
      if (captions.length > 0) {
        captionPath = path.join(workDir, `captions-${i}.ass`);
        await writeCaptionFile(captions, captionPath);
      }

      // B-roll matching
      let brollInsertions: Awaited<ReturnType<typeof matchBroll>> = [];
      if (!payload.skipBroll) {
        try {
          const animTimestamps = renderedAnimations.map((a) => ({
            start_s: a.timestamp_s,
            end_s: a.timestamp_s + a.duration_s,
          }));
          brollInsertions = await matchBroll(clipWords, userId, animTimestamps);
        } catch {
          // Graceful degradation — no B-roll
        }
      }

      // Final render (only if we have captions, animations, or B-roll to add)
      let finalPath = editedPath;
      if (captionPath || renderedAnimations.length > 0 || brollInsertions.length > 0) {
        try {
          finalPath = await renderFinal(
            editedPath,
            captionPath,
            renderedAnimations,
            brollInsertions,
            workDir
          );
        } catch (err) {
          console.error(`[Pipeline] Final render failed for clip ${i + 1}, using edited version:`, err);
          // Use the Skill 1 output as-is
        }
      }

      // Copy to final output location
      const outputPath = path.join(workDir, `final-clip-${i + 1}.mp4`);
      if (finalPath !== outputPath) {
        await fs.copyFile(finalPath, outputPath);
      }

      clipResults.push({
        clip_id: clip.clip_id,
        title: clip.title,
        duration_s: clip.duration_s,
        mood: clip.mood,
        scores: clip.scores,
        render_url: outputPath,
      });

      console.log(`[Pipeline] Clip ${i + 1} complete: ${outputPath}`);
    }

    if (clipResults.length === 0) {
      throw new Error("All clip renders failed");
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
