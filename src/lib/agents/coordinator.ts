import { extractAudio } from "@/lib/ffmpeg/extract";
import { getSarvamClient } from "@/lib/sarvam/client";
import { loadDnaSkillToFilesystem, cleanupDnaSkill, getDnaProfile } from "@/lib/dna/loader";
import { getPreset } from "@/lib/presets/filmmaker-presets";
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
import { extractThumbnails, extractAudioForWaveform } from "./thumbnail-extractor";
import { stitchHighlightReel } from "./highlight-stitcher";
import { planSpeedRamps, getSpeedRampConfig } from "./speed-ramp";
import { getDefaultTransition } from "./transition-engine";
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
    thumbnails_dir?: string;
    timeline_data?: Record<string, unknown>;
  }[];
  highlightReelUrl?: string;
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
    // Load DNA skill (preset overrides DNA profile if provided)
    onProgress?.("loading_dna", 2);
    let dnaContent: string;

    if (payload.presetId) {
      const preset = getPreset(payload.presetId);
      if (!preset) throw new Error(`Filmmaker preset '${payload.presetId}' not found`);
      dnaContent = preset.skillContent;

      // Write preset skill content to filesystem for agent discovery
      const skillDir = path.join(workDir, ".claude/skills/creator-dna");
      await fs.mkdir(skillDir, { recursive: true });
      await fs.writeFile(path.join(skillDir, "SKILL.md"), dnaContent, "utf-8");
    } else {
      const dnaProfile = await getDnaProfile(payload.dnaProfileId);
      if (!dnaProfile) throw new Error("DNA profile not found");
      dnaContent = dnaProfile.skillContent;
      await loadDnaSkillToFilesystem(payload.dnaProfileId, workDir);
    }

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
    const colorProfile = extractDnaValue(dnaContent, "Profile:", "neutral").split(/[\s(]/)[0].toLowerCase() as any;
    const audioStyle = extractDnaValue(dnaContent, "Style:", "youtube_standard").split(/[\s(]/)[0].toLowerCase() as any;
    console.log(`[Pipeline] DNA color=${colorProfile}, audio=${audioStyle}`);

    // Process each clip through the full pipeline
    onProgress?.("rendering", 40);
    const clipResults: PipelineResult["clips"] = [];

    // Filter out any invalid clips before processing
    const validClips = clips.filter((c) => c && typeof c.start_s === "number" && typeof c.end_s === "number" && c.end_s > c.start_s);
    console.log(`[Pipeline] ${validClips.length} valid clips out of ${clips.length} selected`);

    if (validClips.length === 0) {
      throw new Error("No valid clips with timestamps found");
    }

    for (let i = 0; i < validClips.length; i++) {
      const clip = validClips[i];
      const clipPctBase = 40 + Math.round((i / validClips.length) * 50);

      // Build clip-relative word timestamps (needed by both Skill 1 and Skill 2)
      const clipWords = transcript.words
        .filter((w) => w.start_s >= clip.start_s && w.end_s <= clip.end_s)
        .map((w) => ({
          ...w,
          start_s: w.start_s - clip.start_s,
          end_s: w.end_s - clip.start_s,
        }));

      // ── Skill 1: Render edited clip (FFmpeg: zoom, color, grain, vignette, audio) ──
      onProgress?.(`rendering_clip_${i + 1}`, clipPctBase);
      console.log(`[Pipeline] Rendering clip ${i + 1}: ${clip.title} (${clip.start_s}s → ${clip.end_s}s)`);

      let editedPath: string;
      try {
        editedPath = await renderClip(
          payload.videoUrls[0],
          clip,
          workDir,
          i,
          {
            colorProfile,
            audioProfile: audioStyle,
            dnaContent,
            clipWords,
          }
        );
        // Validate the output file isn't empty/corrupt
        const stat = await fs.stat(editedPath);
        if (stat.size < 1000) {
          throw new Error(`Output file too small (${stat.size} bytes) — likely corrupt`);
        }
      } catch (err) {
        console.error(`[Pipeline] Clip ${i + 1} render failed, skipping:`, err);
        continue;
      }

      // ── Skill 2: Moment detection → drives zoom, speed, and optional Remotion overlays ──
      let renderedAnimations: Awaited<ReturnType<typeof renderAnimations>> = [];
      let detectedMoments: Awaited<ReturnType<typeof detectShowMoments>> = [];
      let speedRampEvents: ReturnType<typeof planSpeedRamps> = [];

      if (!payload.skipAnimations) {
        onProgress?.(`analyzing_moments_${i + 1}`, clipPctBase + 3);
        try {
          detectedMoments = await detectShowMoments(clipWords, clip.duration_s, dnaContent);
          console.log(`[Pipeline] Detected ${detectedMoments.length} moments for clip ${i + 1}`);

          // Plan speed ramps from detected moments
          const speedConfig = getSpeedRampConfig(dnaContent);
          if (speedConfig.intensity !== "none") {
            speedRampEvents = planSpeedRamps(detectedMoments, clip.duration_s, speedConfig);
            console.log(`[Pipeline] Planned ${speedRampEvents.length} speed ramps for clip ${i + 1}`);
          }

          // Optional Remotion text overlays (only if moments call for them)
          if (detectedMoments.length > 0) {
            onProgress?.(`animating_clip_${i + 1}`, clipPctBase + 5);
            const brand = {
              headingFont: extractDnaValue(dnaContent, "Heading font:", "DM Serif Display"),
              bodyFont: extractDnaValue(dnaContent, "Body font:", "DM Sans"),
              primaryColor: extractDnaValue(dnaContent, "Primary color:", "#E8620E"),
              secondaryColor: extractDnaValue(dnaContent, "Secondary color:", "#0E5C58"),
              animationStyle: extractDnaValue(dnaContent, "Animation style:", "slide-up"),
              darkModeDefault: dnaContent.includes("Dark mode default: true"),
            };
            try {
              const generated = await generateAnimations(detectedMoments, brand, dnaContent);
              renderedAnimations = await renderAnimations(generated);
            } catch (animErr) {
              console.error(`[Pipeline] Remotion overlay failed for clip ${i + 1}, skipping:`, animErr);
            }
          }
        } catch (err) {
          console.error(`[Pipeline] Moment detection failed for clip ${i + 1}, skipping:`, err);
        }
      }

      // ── Skill 3: Finalize via FFmpeg (overlay animations + captions + B-roll) ──
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

      // Final render
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
        }
      }

      // Copy to persistent output location (survives tmp cleanup)
      const persistDir = path.join(os.tmpdir(), "clipmind-outputs");
      await fs.mkdir(persistDir, { recursive: true });
      const outputPath = path.join(persistDir, `${path.basename(workDir)}-clip-${i + 1}.mp4`);
      await fs.copyFile(finalPath, outputPath);

      // Extract thumbnails + audio for timeline editor
      let thumbnailsDir: string | undefined;
      try {
        thumbnailsDir = await extractThumbnails(outputPath, persistDir);
        await extractAudioForWaveform(outputPath, persistDir);
      } catch (err) {
        console.error(`[Pipeline] Thumbnail/audio extraction failed for clip ${i + 1}:`, err);
      }

      clipResults.push({
        clip_id: clip.clip_id,
        title: clip.title,
        duration_s: clip.duration_s,
        mood: clip.mood,
        scores: clip.scores,
        render_url: outputPath,
        thumbnails_dir: thumbnailsDir,
        timeline_data: {
          cutPoints: [{ start_s: 0, end_s: clip.duration_s }],
          effects: { colorProfile, audioProfile: audioStyle },
          zoomEvents: [],
          speedRamps: speedRampEvents.map((e) => ({
            start_s: e.start_s, end_s: e.end_s, factor: e.factor, reason: e.reason,
          })),
          moments: detectedMoments.map((m) => ({
            timestamp_s: m.timestamp_s, duration_s: m.duration_s,
            type: m.suggested_type, content: m.content,
          })),
        },
      });

      console.log(`[Pipeline] Clip ${i + 1} complete: ${outputPath}`);
    }

    if (clipResults.length === 0) {
      throw new Error("All clip renders failed");
    }

    // ── Stitch highlight reel (all clips with varied transitions) ──
    let highlightReelUrl: string | undefined;
    if (clipResults.length > 1) {
      onProgress?.("stitching_highlight_reel", 95);
      try {
        const transitionConfig = getDefaultTransition(dnaContent);
        // Cycle through visually interesting transitions for variety
        const transitionCycle = ["fade", "zoomin", "fadeblack", "circleopen", "slideleft", "dissolve", "radial", "wipeleft"] as const;
        const clipsWithTransitions = clipResults.map((c, idx) => ({
          path: c.render_url,
          transitionToNext: transitionCycle[idx % transitionCycle.length],
        }));
        highlightReelUrl = await stitchHighlightReel(
          clipsWithTransitions,
          transitionConfig.type,
          0.7
        );
        console.log(`[Pipeline] Highlight reel: ${highlightReelUrl}`);
      } catch (err) {
        console.error("[Pipeline] Highlight reel failed:", err);
      }
    }

    onProgress?.("completed", 100);
    return { clips: clipResults, highlightReelUrl };
  } finally {
    await cleanupDnaSkill(workDir);
  }
}

function extractDnaValue(dnaContent: string, key: string, defaultValue: string): string {
  const regex = new RegExp(`${key}\\s*(.+)`, "m");
  const match = dnaContent.match(regex);
  return match ? match[1].trim() : defaultValue;
}
