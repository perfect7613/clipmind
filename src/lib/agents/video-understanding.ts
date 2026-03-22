/**
 * Video Understanding via OpenRouter + Nemotron Nano 12B VL (FREE)
 *
 * Sends actual video segments to a vision-language model for deep
 * editing style analysis. Replaces the "10 static frames" approach
 * with real video understanding — transitions, zoom, pacing, motion.
 *
 * Flow:
 * 1. Trim video to 3 representative segments (start, middle, end) ~30s each
 * 2. Downscale to 360p to keep base64 size manageable
 * 3. Send each segment to Nemotron via OpenRouter
 * 4. Merge observations into a comprehensive editing style report
 * 5. Pass report to DNA writer alongside other analyses
 */

import { exec } from "child_process";
import { promises as fs } from "fs";
import path from "path";
import os from "os";

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";
const MODEL = "nvidia/nemotron-nano-12b-v2-vl:free";

export interface VideoUnderstandingResult {
  editingStyle: string;
  transitionTypes: string[];
  zoomBehavior: string;
  pacingDescription: string;
  colorGrading: string;
  brollUsage: string;
  captionStyle: string;
  uniquePatterns: string[];
  rawAnalysis: string;
}

/**
 * Analyze a video's editing style using Nemotron VL via OpenRouter.
 *
 * Trims 3 representative segments (~30s each), downscales to 360p,
 * sends to the model, and merges observations.
 */
export async function analyzeVideoStyle(
  videoPath: string,
  apiKey: string
): Promise<VideoUnderstandingResult> {
  const tmpDir = path.join(os.tmpdir(), `clipmind-vu-${Date.now()}`);
  await fs.mkdir(tmpDir, { recursive: true });

  try {
    // Get video duration
    const duration = await getVideoDuration(videoPath);
    console.log(`[VideoUnderstanding] Video duration: ${duration.toFixed(1)}s`);

    // Trim 3 representative segments (start, middle, end)
    const segments = selectSegments(duration);
    const segmentPaths: string[] = [];

    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      const outputPath = path.join(tmpDir, `segment-${i}.mp4`);
      await trimAndDownscale(videoPath, outputPath, seg.start, seg.duration);
      segmentPaths.push(outputPath);
      console.log(`[VideoUnderstanding] Segment ${i + 1}: ${seg.start.toFixed(1)}s → ${(seg.start + seg.duration).toFixed(1)}s`);
    }

    // Analyze each segment
    const analyses: string[] = [];
    for (let i = 0; i < segmentPaths.length; i++) {
      const label = i === 0 ? "opening" : i === segments.length - 1 ? "ending" : "middle";
      console.log(`[VideoUnderstanding] Analyzing ${label} segment...`);
      try {
        const analysis = await analyzeSegment(segmentPaths[i], apiKey, label, i + 1, segments.length);
        analyses.push(`### ${label.toUpperCase()} SEGMENT (${segments[i].start.toFixed(0)}s - ${(segments[i].start + segments[i].duration).toFixed(0)}s)\n${analysis}`);
      } catch (err) {
        console.error(`[VideoUnderstanding] Segment ${i + 1} analysis failed:`, err);
        analyses.push(`### ${label.toUpperCase()} SEGMENT\nAnalysis failed.`);
      }
    }

    const rawAnalysis = analyses.join("\n\n");

    // Parse structured data from the raw analysis
    return parseAnalysis(rawAnalysis);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * Select 3 representative segments from the video.
 */
function selectSegments(duration: number): Array<{ start: number; duration: number }> {
  const segDuration = Math.min(30, duration / 3);

  if (duration <= 90) {
    // Short video — just send the whole thing as one segment
    return [{ start: 0, duration: Math.min(60, duration) }];
  }

  return [
    { start: 0, duration: segDuration },                                    // Opening
    { start: Math.max(0, duration / 2 - segDuration / 2), duration: segDuration }, // Middle
    { start: Math.max(0, duration - segDuration - 2), duration: segDuration },     // End
  ];
}

/**
 * Trim a segment and downscale to 360p for manageable base64 size.
 */
function trimAndDownscale(
  inputPath: string,
  outputPath: string,
  startS: number,
  durationS: number
): Promise<void> {
  return new Promise((resolve, reject) => {
    const cmd = `ffmpeg -ss ${startS.toFixed(2)} -i "${inputPath}" -t ${durationS.toFixed(2)} -vf "scale=-2:360,fps=15" -c:v libx264 -preset ultrafast -crf 35 -an -movflags +faststart -y "${outputPath}"`;

    exec(cmd, { maxBuffer: 10 * 1024 * 1024 }, (err, _stdout, stderr) => {
      if (err) {
        console.error("[VideoUnderstanding] Trim stderr:", stderr?.slice(-300));
        reject(new Error(`Trim failed: ${err.message}`));
      } else {
        resolve();
      }
    });
  });
}

/**
 * Send a video segment to Nemotron VL via OpenRouter.
 */
async function analyzeSegment(
  segmentPath: string,
  apiKey: string,
  label: string,
  segNum: number,
  totalSegs: number
): Promise<string> {
  const videoBuffer = await fs.readFile(segmentPath);
  const base64Video = videoBuffer.toString("base64");
  const dataUrl = `data:video/mp4;base64,${base64Video}`;

  const stat = await fs.stat(segmentPath);
  console.log(`[VideoUnderstanding] Segment ${segNum} size: ${(stat.size / 1024 / 1024).toFixed(1)}MB`);

  const response = await fetch(OPENROUTER_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "video_url",
              video_url: { url: dataUrl },
            },
            {
              type: "text",
              text: `You are a professional video editor analyzing editing techniques. This is the ${label} segment (${segNum}/${totalSegs}) of a video.

Analyze the EDITING STYLE — not the content/story. Focus on:

1. CUTS & TRANSITIONS: How are shots connected? Hard cuts, dissolves, jump cuts, whip pans, fade to black? How frequent are cuts?
2. CAMERA MOVEMENT & ZOOM: Static shots, pans, tilts, zooms (smooth or instant), Ken Burns, handheld shake?
3. COLOR & GRADING: Warm/cool/neutral tones? High or low contrast? Desaturated? Cinematic look? Consistent or varying?
4. FRAMING: Wide shots, medium, close-ups? How does framing change? Is there a pattern?
5. TEXT & GRAPHICS: Any text overlays, lower thirds, captions visible? Style?
6. PACING: Fast-paced with frequent cuts? Slow and contemplative? Dynamic (varying pace)?
7. B-ROLL: Is this all talking head, or mixed with B-roll footage? What kind?
8. AUDIO CLUES: Any visible indicators of audio editing (waveform-style captions, beat-synced cuts)?

Be specific and technical. Give concrete observations, not vague descriptions.`,
            },
          ],
        },
      ],
      max_tokens: 1000,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenRouter API error ${response.status}: ${errorText.slice(0, 200)}`);
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error("No content in response");

  return content;
}

/**
 * Parse the raw analysis text into structured data.
 */
function parseAnalysis(rawAnalysis: string): VideoUnderstandingResult {
  const lower = rawAnalysis.toLowerCase();

  // Extract transition types mentioned
  const transitionTypes: string[] = [];
  const transitionKeywords = [
    "hard cut", "jump cut", "cross dissolve", "crossfade", "fade to black",
    "dip to black", "whip pan", "wipe", "match cut", "j-cut", "l-cut",
    "dissolve", "fade", "transition", "smash cut",
  ];
  for (const kw of transitionKeywords) {
    if (lower.includes(kw)) transitionTypes.push(kw);
  }

  // Detect zoom behavior
  let zoomBehavior = "static";
  if (lower.includes("zoom in") || lower.includes("push in") || lower.includes("ken burns")) {
    zoomBehavior = "active zoom";
  } else if (lower.includes("punch") || lower.includes("crop")) {
    zoomBehavior = "punch-in crops";
  } else if (lower.includes("smooth zoom") || lower.includes("gradual zoom")) {
    zoomBehavior = "smooth gradual zoom";
  }

  // Detect color grading
  let colorGrading = "neutral";
  if (lower.includes("warm") || lower.includes("golden") || lower.includes("orange")) colorGrading = "warm";
  else if (lower.includes("cool") || lower.includes("blue") || lower.includes("teal")) colorGrading = "cool";
  else if (lower.includes("desaturated") || lower.includes("muted") || lower.includes("flat")) colorGrading = "flat";
  else if (lower.includes("cinematic") || lower.includes("film") || lower.includes("contrast")) colorGrading = "cinematic";
  else if (lower.includes("black and white") || lower.includes("monochrome")) colorGrading = "bw";
  else if (lower.includes("vibrant") || lower.includes("saturated") || lower.includes("neon")) colorGrading = "neon";

  // Detect pacing
  let pacingDescription = "moderate";
  if (lower.includes("fast") || lower.includes("rapid") || lower.includes("quick cut")) pacingDescription = "fast-paced with frequent cuts";
  else if (lower.includes("slow") || lower.includes("contemplative") || lower.includes("long take")) pacingDescription = "slow and deliberate";
  else if (lower.includes("dynamic") || lower.includes("varies") || lower.includes("mix")) pacingDescription = "dynamic, varies by section";

  // Detect B-roll
  let brollUsage = "none detected";
  if (lower.includes("b-roll") || lower.includes("b roll") || lower.includes("cutaway")) {
    if (lower.includes("heavy") || lower.includes("frequent") || lower.includes("lots")) brollUsage = "heavy B-roll usage";
    else if (lower.includes("occasional") || lower.includes("some")) brollUsage = "moderate B-roll usage";
    else brollUsage = "B-roll present";
  } else if (lower.includes("talking head") || lower.includes("single shot")) {
    brollUsage = "no B-roll — talking head only";
  }

  // Detect captions
  let captionStyle = "none detected";
  if (lower.includes("caption") || lower.includes("subtitle") || lower.includes("text overlay")) {
    if (lower.includes("large") || lower.includes("bold") || lower.includes("animated")) captionStyle = "bold animated captions";
    else if (lower.includes("lower third")) captionStyle = "lower third text";
    else captionStyle = "captions present";
  }

  // Extract unique patterns
  const uniquePatterns: string[] = [];
  const lines = rawAnalysis.split("\n").filter((l) => l.trim().length > 20);
  for (const line of lines) {
    const trimmed = line.replace(/^[-*•#\d.)\s]+/, "").trim();
    if (trimmed.length > 30 && trimmed.length < 200 && !trimmed.startsWith("Analyze") && !trimmed.startsWith("You are")) {
      uniquePatterns.push(trimmed);
      if (uniquePatterns.length >= 5) break;
    }
  }

  return {
    editingStyle: `${pacingDescription}, ${colorGrading} color, ${transitionTypes[0] || "standard cuts"}`,
    transitionTypes: transitionTypes.length > 0 ? transitionTypes : ["hard cut"],
    zoomBehavior,
    pacingDescription,
    colorGrading,
    brollUsage,
    captionStyle,
    uniquePatterns,
    rawAnalysis,
  };
}

/**
 * Get video duration via ffprobe.
 */
function getVideoDuration(videoPath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    exec(
      `ffprobe -v error -show_entries format=duration -of csv=p=0 "${videoPath}"`,
      (err, stdout) => {
        if (err) return reject(err);
        const duration = parseFloat(stdout.trim());
        if (isNaN(duration)) return reject(new Error("Could not parse duration"));
        resolve(duration);
      }
    );
  });
}
