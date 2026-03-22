import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { DnaSkillParamsSchema, DEFAULT_DNA_PARAMS, type DnaSkillParams } from "@/lib/dna/schema";
import { generateDnaSkillContent } from "@/lib/dna/template";
import type { VisualAnalysis } from "./visual-analyzer";
import type { VoiceAnalysis } from "./voice-analyzer";
import type { PacingAnalysis } from "./pacing-analyzer";
import type { AudioAnalysis } from "./audio-analyzer";
import type { FrameWindow } from "./frame-sampler";

const anthropic = new Anthropic();

interface DnaWriterInput {
  username: string;
  creatorName: string;
  visual?: VisualAnalysis;
  voice?: VoiceAnalysis;
  pacing?: PacingAnalysis;
  audio?: AudioAnalysis;
  windows?: FrameWindow[];
}

/**
 * Merge analysis outputs into a Creator DNA SKILL.md.
 * Uses Claude to reason about how analyses map to DNA params,
 * then generates the SKILL.md from the template.
 */
export async function writeDnaSkill(input: DnaWriterInput): Promise<{
  skillContent: string;
  params: DnaSkillParams;
}> {
  // Build context from available analyses
  const analysisContext = buildAnalysisContext(input);

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 3000,
    messages: [
      {
        role: "user",
        content: `Based on the following analysis of a creator's editing style, generate a Creator DNA parameter set.

${analysisContext}

Return a JSON object matching this exact structure (fill in values based on the analysis, use reasonable defaults for anything not covered):

{
  "username": "${input.username}",
  "creatorName": "${input.creatorName}",
  "captionStyle": {
    "casing": "upper" | "lower" | "title" | "sentence",
    "position": "top" | "middle" | "bottom" | "dynamic",
    "background": "none" | "dark-bar" | "pill" | "full-width",
    "avgWords": number (2-5),
    "fontSize": "small" | "medium" | "large",
    "animation": "none" | "pop" | "slide" | "bounce" | "typewriter",
    "colorHex": "#RRGGBB"
  },
  "zoom": {
    "aggressiveness": number (0-1),
    "maxZoomLevel": number (1.0-2.0),
    "triggers": ["energy_peak", "punchline", "emphasis", "key_point", "reaction"] (pick relevant ones)
  },
  "audio": {
    "style": "podcast_warm" | "youtube_standard" | "educational_clear" | "vlog_punchy",
    "targetLufs": -16,
    "targetTruePeak": -1.5
  },
  "color": {
    "profile": "warm" | "neutral" | "cool" | "cinematic" | "flat"
  },
  "brand": {
    "headingFont": "font name",
    "bodyFont": "font name",
    "primaryColor": "#RRGGBB",
    "secondaryColor": "#RRGGBB",
    "animationStyle": "slide-up" | "pop" | "fade" | "wipe",
    "darkModeDefault": boolean
  },
  "pacing": {
    "preferredClipLengthMin": number (seconds),
    "preferredClipLengthMax": number (seconds),
    "cutsPerMinute": number,
    "silenceToleranceMs": number,
    "removeFillers": boolean,
    "fillerWords": ["list of filler words detected"]
  },
  "speedRamp": {
    "intensity": "none" | "subtle" | "moderate" | "aggressive",
    "slowMoFactor": number (0.5-0.75, how much to slow down key moments),
    "speedUpFactor": number (1.5-2.0, how much to speed up dead air)
  },
  "animationDensity": "none" | "light" | "moderate" | "heavy",
  "contentType": "vlog" | "podcast" | "educational" | "commentary" | "mixed",
  "humorType": "dry" | "absurdist" | "self-deprecating" | "observational" | "none",
  "energyLevel": "chill" | "medium" | "high" | "chaotic",
  "hookPattern": "question" | "statement" | "reaction" | "story" | "stat"
}

Also include an "observations" array with 3-5 specific, actionable observations about what makes this creator's editing style UNIQUE compared to typical YouTube editing. Things a video editor would notice:
- "Always starts with a 2-3 second cold open before the title"
- "Music drops to silence during key arguments for emphasis"
- "Uses jump cuts every 3-4 seconds during high-energy segments"
- "Never uses B-roll — entire video is talking head"

Add: "observations": ["observation 1", "observation 2", ...]

Return ONLY the JSON object, no explanation.`,
      },
    ],
  });

  const textBlock = response.content.find((c) => c.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No text response from Claude");
  }

  let jsonStr = textBlock.text.trim();
  if (jsonStr.startsWith("```")) {
    jsonStr = jsonStr.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
  }

  let rawParsed: any;
  let params: DnaSkillParams;
  try {
    rawParsed = JSON.parse(jsonStr);
    params = DnaSkillParamsSchema.parse(rawParsed);
  } catch {
    rawParsed = {};
    params = mergeWithDefaults(input);
  }

  // Extract observations (not in Zod schema — passed separately to template)
  const observations: string[] = Array.isArray(rawParsed?.observations)
    ? rawParsed.observations.filter((o: any) => typeof o === "string").slice(0, 7)
    : [];

  const brollPercentage = input.visual?.brollPresence?.estimatedPercentage;
  const speechRatio = input.pacing
    ? (100 - (input.pacing.silenceDistribution?.silencePercentage || 25)) / 100
    : undefined;

  const skillContent = generateDnaSkillContent({
    ...params,
    brollPercentage,
    speechRatio,
    observations,
  });

  return { skillContent, params };
}

function buildAnalysisContext(input: DnaWriterInput): string {
  const parts: string[] = [];

  if (input.visual) {
    parts.push(`## Visual Analysis
- Color temperature: ${input.visual.colorTemperature}
- Caption detected: ${input.visual.captionStyle.detected}
${input.visual.captionStyle.detected ? `  - Casing: ${input.visual.captionStyle.casing || "unknown"}
  - Position: ${input.visual.captionStyle.position || "unknown"}
  - Background: ${input.visual.captionStyle.background || "unknown"}` : ""}
- Zoom levels detected: ${input.visual.zoomPatterns.levelsDetected}
- Zoom style: ${input.visual.zoomPatterns.style}
- Zoom frequency: ${input.visual.zoomPatterns.frequency}
- Text overlays: ${input.visual.textOverlays.frequency}
- B-roll: ${input.visual.brollPresence.detected ? `${input.visual.brollPresence.estimatedPercentage}%` : "none"}
- Production quality: ${input.visual.productionQuality}
- Overall style: ${input.visual.overallStyle}`);
  }

  if (input.voice) {
    parts.push(`## Voice Analysis
- Humor type: ${input.voice.humorType}
- Energy level: ${input.voice.energyLevel}
- Hook pattern: ${input.voice.hookPattern}
- Vocabulary: ${input.voice.vocabulary}
- Content type: ${input.voice.contentType}
- Energy words: ${input.voice.energyWords.join(", ")}
- Overall voice: ${input.voice.overallVoice}`);
  }

  if (input.pacing) {
    parts.push(`## Pacing Analysis
- Cuts per minute: ${input.pacing.cutsPerMinute}
- Speech rate: ${input.pacing.speechRate.wordsPerMinute} WPM (${input.pacing.speechRate.category})
- Silence: ${input.pacing.silenceDistribution.silencePercentage}% of video
- Avg gap duration: ${input.pacing.silenceDistribution.avgGapDurationS}s
- Preferred clip length: ${input.pacing.preferredClipLength.minS}s - ${input.pacing.preferredClipLength.maxS}s
- Filler words: ${input.pacing.fillerWords.detected.join(", ")} (${input.pacing.fillerWords.perMinute}/min)`);
  }

  if (input.audio) {
    parts.push(`## Audio Analysis (FFmpeg)
- Integrated loudness: ${input.audio.integratedLoudness} LUFS
- True peak: ${input.audio.truePeak} dBTP
- Loudness range (LRA): ${input.audio.loudnessRange} LU
- Speech ratio: ${(input.audio.speechRatio * 100).toFixed(1)}%
- Energy profile: ${input.audio.energyProfile}
- Pause frequency: ${input.audio.pauseFrequency} pauses/min
- Avg pause duration: ${input.audio.avgPauseDuration}s
- Silence segments detected: ${input.audio.silenceSegments.length}`);
  }

  if (input.windows && input.windows.length > 0) {
    const windowStats = summarizeWindows(input.windows);
    parts.push(`## Per-Window Frame Analysis (${input.windows.length} windows of 10s each)
- Dominant colors across video: ${windowStats.topColors.join(", ") || "unknown"}
- Average brightness: ${windowStats.avgBrightness.toFixed(0)}/255 (${windowStats.avgBrightness > 170 ? "bright" : windowStats.avgBrightness > 85 ? "medium" : "dark"})
- Total scene changes: ${windowStats.totalSceneChanges}
- Avg scene changes per window: ${windowStats.avgSceneChangesPerWindow.toFixed(1)}
- Estimated B-roll %: ${windowStats.brollPercentage.toFixed(0)}% (windows without detected faces)
- Pacing category: ${windowStats.pacingCategory}`);
  }

  if (parts.length === 0) {
    parts.push("No analysis data available. Use sensible defaults for a YouTube vlogger.");
  }

  return parts.join("\n\n");
}

function mergeWithDefaults(input: DnaWriterInput): DnaSkillParams {
  const params = { ...DEFAULT_DNA_PARAMS };
  params.username = input.username;
  params.creatorName = input.creatorName;

  if (input.visual) {
    if (input.visual.captionStyle.casing) params.captionStyle.casing = input.visual.captionStyle.casing;
    if (input.visual.captionStyle.position) params.captionStyle.position = input.visual.captionStyle.position;
    if (input.visual.captionStyle.background) params.captionStyle.background = input.visual.captionStyle.background;
    if (input.visual.captionStyle.fontSize) params.captionStyle.fontSize = input.visual.captionStyle.fontSize;
    params.color.profile = input.visual.colorTemperature;
    params.zoom.aggressiveness = input.visual.zoomPatterns.levelsDetected / 5;
  }

  if (input.voice) {
    params.humorType = input.voice.humorType;
    params.energyLevel = input.voice.energyLevel;
    params.hookPattern = input.voice.hookPattern;
    params.contentType = input.voice.contentType;
  }

  if (input.pacing) {
    params.pacing.cutsPerMinute = input.pacing.cutsPerMinute;
    params.pacing.preferredClipLengthMin = input.pacing.preferredClipLength.minS;
    params.pacing.preferredClipLengthMax = input.pacing.preferredClipLength.maxS;
    params.pacing.fillerWords = input.pacing.fillerWords.detected;
    params.pacing.removeFillers = input.pacing.fillerWords.perMinute > 2;
  }

  if (input.audio) {
    // Audio style: lots of pauses → podcast_warm, high energy → vlog_punchy
    if (input.audio.pauseFrequency > 8 || input.audio.avgPauseDuration > 1.5) {
      params.audio.style = "podcast_warm";
    } else if (input.audio.energyProfile === "high" || input.audio.energyProfile === "dynamic") {
      params.audio.style = "vlog_punchy";
    }

    // Use actual loudness targets
    params.audio.targetLufs = Math.round(input.audio.integratedLoudness);
    params.audio.targetTruePeak = Math.round(input.audio.truePeak * 10) / 10;

    // Silence tolerance from actual pause data (convert to ms)
    if (input.audio.avgPauseDuration > 0) {
      params.pacing.silenceToleranceMs = Math.round(input.audio.avgPauseDuration * 1000);
    }

    // Refine pacing cuts-per-minute from speech ratio when no pacing data exists
    if (!input.pacing && input.audio.speechRatio > 0) {
      params.pacing.cutsPerMinute = input.audio.speechRatio > 0.85
        ? 8  // dense speech → more cuts to keep it punchy
        : input.audio.speechRatio < 0.6
          ? 3  // lots of breathing room → fewer cuts
          : 5;
    }
  }

  return params;
}
