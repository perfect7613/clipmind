import { fetchYouTubeData } from "./youtube-fetch";
import { sampleFrames, cleanupFrames } from "./frame-sampler";
import { analyzeVisualStyle } from "./visual-analyzer";
import { analyzeVoice } from "./voice-analyzer";
import { analyzePacing } from "./pacing-analyzer";
import { writeDnaSkill } from "./dna-writer";
import { saveDnaSkill } from "@/lib/dna/loader";
import { extractAudio } from "@/lib/ffmpeg/extract";
import { getSarvamClient } from "@/lib/sarvam/client";
import { promises as fs } from "fs";
import path from "path";
import os from "os";

export type ProgressCallback = (step: string, pct: number) => void;

/**
 * Onboarding Path 1: YouTube URL → DNA skill generation.
 */
export async function onboardFromYouTube(
  url: string,
  userId: string,
  creatorName: string,
  onProgress?: ProgressCallback
): Promise<{ profileId: string; skillContent: string }> {
  onProgress?.("fetching_youtube", 10);

  // Step 1: Fetch captions + metadata
  const ytData = await fetchYouTubeData(url);

  onProgress?.("downloading_video", 20);

  // Step 2: Download video for frame sampling
  const tmpDir = path.join(os.tmpdir(), `clipmind-onboard-${Date.now()}`);
  await fs.mkdir(tmpDir, { recursive: true });
  const videoPath = path.join(tmpDir, "video.mp4");

  // Download video using yt-dlp
  const { execFile } = await import("child_process");
  const { promisify } = await import("util");
  const execFileAsync = promisify(execFile);

  await execFileAsync("yt-dlp", [
    "-f", "bestvideo[height<=720]+bestaudio/best[height<=720]",
    "--merge-output-format", "mp4",
    "-o", videoPath,
    url,
  ]);

  onProgress?.("sampling_frames", 35);

  // Step 3: Sample frames
  const frameResult = await sampleFrames(videoPath, 20);

  onProgress?.("analyzing_visual", 50);

  // Step 4: Visual analysis
  const visualAnalysis = await analyzeVisualStyle(frameResult.frames);

  onProgress?.("analyzing_voice", 65);

  // Step 5: Voice analysis (from captions)
  const captionText = ytData.captions.map((c) => c.text).join(" ");
  const voiceAnalysis = captionText.length > 50
    ? await analyzeVoice(captionText)
    : undefined;

  onProgress?.("analyzing_pacing", 75);

  // Step 6: Pacing analysis (from caption timestamps as word timestamps)
  const wordTimestamps = ytData.captions.map((c) => ({
    word: c.text,
    start_s: c.start_s,
    end_s: c.end_s,
  }));
  const pacingAnalysis = wordTimestamps.length > 0
    ? analyzePacing(wordTimestamps, ytData.metadata.duration_s)
    : undefined;

  onProgress?.("writing_dna", 85);

  // Step 7: Write DNA skill
  const username = creatorName.toLowerCase().replace(/[^a-z0-9]/g, "-").slice(0, 30);
  const { skillContent } = await writeDnaSkill({
    username,
    creatorName,
    visual: visualAnalysis,
    voice: voiceAnalysis,
    pacing: pacingAnalysis,
  });

  onProgress?.("saving", 95);

  // Step 8: Save to Supabase
  const profileId = await saveDnaSkill(userId, creatorName, skillContent, "youtube", url);

  // Cleanup
  await cleanupFrames(frameResult.output_dir);
  await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});

  onProgress?.("completed", 100);

  return { profileId, skillContent };
}

/**
 * Onboarding Path 2: Own video upload → DNA skill generation.
 */
export async function onboardFromUpload(
  videoPath: string,
  userId: string,
  creatorName: string,
  onProgress?: ProgressCallback
): Promise<{ profileId: string; skillContent: string }> {
  onProgress?.("ingesting", 10);

  // Step 1: Extract audio + transcribe
  const { audioPath, duration_s } = await extractAudio(videoPath);
  const audioBuffer = await fs.readFile(audioPath);

  onProgress?.("transcribing", 25);

  const sarvam = getSarvamClient();
  const transcript = await sarvam.transcribe(audioBuffer);

  onProgress?.("sampling_frames", 40);

  // Step 2: Sample frames
  const frameResult = await sampleFrames(videoPath, 20);

  onProgress?.("analyzing_visual", 55);

  // Step 3: Visual analysis
  const visualAnalysis = await analyzeVisualStyle(frameResult.frames);

  onProgress?.("analyzing_voice", 70);

  // Step 4: Voice analysis
  const voiceAnalysis = transcript.transcript.length > 50
    ? await analyzeVoice(transcript.transcript)
    : undefined;

  onProgress?.("analyzing_pacing", 80);

  // Step 5: Pacing analysis
  const pacingAnalysis = transcript.words.length > 0
    ? analyzePacing(transcript.words, duration_s)
    : undefined;

  onProgress?.("writing_dna", 90);

  // Step 6: Write DNA skill
  const username = creatorName.toLowerCase().replace(/[^a-z0-9]/g, "-").slice(0, 30);
  const { skillContent } = await writeDnaSkill({
    username,
    creatorName,
    visual: visualAnalysis,
    voice: voiceAnalysis,
    pacing: pacingAnalysis,
  });

  onProgress?.("saving", 95);

  // Step 7: Save to Supabase
  const profileId = await saveDnaSkill(userId, creatorName, skillContent, "upload");

  // Cleanup
  await cleanupFrames(frameResult.output_dir);
  await fs.unlink(audioPath).catch(() => {});

  onProgress?.("completed", 100);

  return { profileId, skillContent };
}
