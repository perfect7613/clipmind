import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import type { WordTimestamp } from "@/types";

const anthropic = new Anthropic();

export const CaptionSchema = z.object({
  text: z.string(),
  start_s: z.number(),
  end_s: z.number(),
  style: z.object({
    casing: z.string(),
    emphasis: z.boolean().optional(),
  }),
});

export type Caption = z.infer<typeof CaptionSchema>;

interface CaptionConfig {
  casing: "upper" | "lower" | "title" | "sentence";
  avgWords: number;
  position: "top" | "bottom" | "dynamic";
  background: "none" | "dark-bar" | "pill" | "full-width";
  fontSize: "small" | "medium" | "large";
  animation: "none" | "pop" | "slide" | "bounce" | "typewriter";
  colorHex: string;
  fontName: string;
}

const DEFAULT_CONFIG: CaptionConfig = {
  casing: "sentence",
  avgWords: 3,
  position: "bottom",
  background: "dark-bar",
  fontSize: "medium",
  animation: "pop",
  colorHex: "#FFFFFF",
  fontName: "Arial",
};

/**
 * Generate phrase captions (2-5 words) from word timestamps.
 * Groups words into natural phrases.
 */
export function generatePhraseCaptions(
  words: WordTimestamp[],
  config: Partial<CaptionConfig> = {}
): Caption[] {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  if (words.length === 0) return [];

  const captions: Caption[] = [];
  let phraseWords: WordTimestamp[] = [];

  for (const word of words) {
    phraseWords.push(word);

    const shouldBreak =
      phraseWords.length >= cfg.avgWords + 2 ||
      (phraseWords.length >= cfg.avgWords &&
        (word.word.endsWith(",") ||
          word.word.endsWith(".") ||
          word.word.endsWith("!") ||
          word.word.endsWith("?") ||
          word.word.endsWith(":")));

    if (shouldBreak) {
      captions.push(buildCaption(phraseWords, cfg));
      phraseWords = [];
    }
  }

  // Remaining words
  if (phraseWords.length > 0) {
    captions.push(buildCaption(phraseWords, cfg));
  }

  return captions;
}

function buildCaption(words: WordTimestamp[], cfg: CaptionConfig): Caption {
  const text = applyCasing(
    words.map((w) => w.word).join(" "),
    cfg.casing
  );

  return {
    text,
    start_s: words[0].start_s,
    end_s: words[words.length - 1].end_s,
    style: { casing: cfg.casing, emphasis: false },
  };
}

function applyCasing(text: string, casing: string): string {
  switch (casing) {
    case "upper": return text.toUpperCase();
    case "lower": return text.toLowerCase();
    case "title": return text.replace(/\b\w/g, (c) => c.toUpperCase());
    case "sentence":
    default: return text.charAt(0).toUpperCase() + text.slice(1);
  }
}

/**
 * Compile captions to ASS (Advanced SubStation Alpha) subtitle format.
 */
export function compileCaptionsToASS(
  captions: Caption[],
  config: Partial<CaptionConfig> = {},
  videoWidth: number = 1920,
  videoHeight: number = 1080
): string {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  const fontSizeMap = { small: 42, medium: 56, large: 72 };
  const fontSize = fontSizeMap[cfg.fontSize];

  // ASS color format: &HBBGGRR& (reversed hex)
  const assColor = hexToAssColor(cfg.colorHex);

  // Position: alignment values in ASS
  const alignmentMap = { top: 8, bottom: 2, dynamic: 2 };
  const alignment = alignmentMap[cfg.position];

  // Background style
  const borderStyle = cfg.background === "none" ? 1 : 3;
  const shadow = cfg.background === "none" ? 0 : 2;
  const outlineColor = cfg.background === "dark-bar" ? "&H80000000" :
    cfg.background === "pill" ? "&HC0000000" : "&H00000000";

  const marginV = cfg.position === "top" ? 60 : 80;

  let ass = `[Script Info]
Title: ClipMind Captions
ScriptType: v4.00+
PlayResX: ${videoWidth}
PlayResY: ${videoHeight}
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,${cfg.fontName},${fontSize},${assColor},${assColor},${outlineColor},&H80000000,1,0,0,0,100,100,0,0,${borderStyle},3,${shadow},${alignment},40,40,${marginV},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  for (const caption of captions) {
    const startTime = formatAssTime(caption.start_s);
    const endTime = formatAssTime(caption.end_s);
    let text = caption.text.replace(/\n/g, "\\N");

    // Add animation effect
    if (cfg.animation === "pop") {
      text = `{\\fad(100,100)}${text}`;
    } else if (cfg.animation === "slide") {
      text = `{\\move(${videoWidth / 2},${videoHeight},${videoWidth / 2},${videoHeight - marginV - fontSize})}${text}`;
    } else if (cfg.animation === "bounce") {
      text = `{\\fad(80,80)\\t(0,80,\\fscx110\\fscy110)\\t(80,160,\\fscx100\\fscy100)}${text}`;
    }

    ass += `Dialogue: 0,${startTime},${endTime},Default,,0,0,0,,${text}\n`;
  }

  return ass;
}

/**
 * Write ASS file to disk.
 */
export async function writeCaptionFile(
  captions: Caption[],
  outputPath: string,
  config: Partial<CaptionConfig> = {}
): Promise<string> {
  const { promises: fs } = await import("fs");
  const ass = compileCaptionsToASS(captions, config);
  await fs.writeFile(outputPath, ass, "utf-8");
  return outputPath;
}

function formatAssTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const cs = Math.round((seconds % 1) * 100);
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
}

function hexToAssColor(hex: string): string {
  // Convert #RRGGBB to ASS &H00BBGGRR
  const r = hex.slice(1, 3);
  const g = hex.slice(3, 5);
  const b = hex.slice(5, 7);
  return `&H00${b}${g}${r}`;
}
