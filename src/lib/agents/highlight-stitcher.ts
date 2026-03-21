import ffmpeg from "fluent-ffmpeg";
import { promises as fs } from "fs";
import path from "path";
import os from "os";

/**
 * All available FFmpeg xfade transitions.
 * These are the actual FFmpeg transition names.
 */
export const AVAILABLE_TRANSITIONS = [
  "fade", "fadeblack", "fadewhite", "dissolve",
  "wipeleft", "wiperight", "wipeup", "wipedown",
  "slideleft", "slideright", "slideup", "slidedown",
  "smoothleft", "smoothright", "smoothup", "smoothdown",
  "circlecrop", "circleclose", "circleopen",
  "vertopen", "vertclose", "horzopen", "horzclose",
  "diagtl", "diagtr", "diagbl", "diagbr",
  "hlslice", "hrslice", "vuslice", "vdslice",
  "pixelize", "radial", "zoomin",
] as const;

export type XfadeTransition = typeof AVAILABLE_TRANSITIONS[number];

export interface ClipForStitch {
  path: string;
  transitionToNext?: XfadeTransition; // transition AFTER this clip
}

/**
 * Map friendly names to FFmpeg xfade transition names.
 */
export function mapToXfadeType(type: string): XfadeTransition {
  const map: Record<string, XfadeTransition> = {
    "crossfade": "fade",
    "cross-dissolve": "dissolve",
    "dip-to-black": "fadeblack",
    "dip-to-white": "fadewhite",
    "fade": "fade",
    "wipe-left": "wipeleft",
    "wipe-right": "wiperight",
    "wipe-up": "wipeup",
    "wipe-down": "wipedown",
    "slide-left": "slideleft",
    "slide-right": "slideright",
    "circle": "circleopen",
    "circle-open": "circleopen",
    "circle-close": "circleclose",
    "zoom": "zoomin",
    "zoom-in": "zoomin",
    "pixelize": "pixelize",
    "radial": "radial",
    "diagonal": "diagbr",
  };
  const mapped = map[type.toLowerCase()];
  if (mapped) return mapped;
  // Check if it's already a valid xfade name
  if (AVAILABLE_TRANSITIONS.includes(type as XfadeTransition)) return type as XfadeTransition;
  return "fade";
}

/**
 * Stitch multiple clips into a highlight reel with per-clip transitions.
 *
 * Each clip can specify its own transition to the next clip.
 * If no per-clip transition is set, falls back to the default.
 */
export async function stitchHighlightReel(
  clips: ClipForStitch[] | string[],
  defaultTransition: string = "fade",
  transitionDurationS: number = 0.7
): Promise<string> {
  // Normalize input — accept either string[] or ClipForStitch[]
  const normalizedClips: ClipForStitch[] = (clips as any[]).map((c) =>
    typeof c === "string" ? { path: c } : c
  );

  if (normalizedClips.length === 0) throw new Error("No clips to stitch");
  if (normalizedClips.length === 1) return normalizedClips[0].path;

  const outputDir = path.join(os.tmpdir(), "clipmind-outputs");
  await fs.mkdir(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, `highlight-reel-${Date.now()}.mp4`);

  const defaultXfade = mapToXfadeType(defaultTransition);

  // Chain clips pairwise: (clip1 + clip2) → temp, (temp + clip3) → temp2, ...
  let currentPath = normalizedClips[0].path;
  const tempFiles: string[] = [];

  for (let i = 1; i < normalizedClips.length; i++) {
    const isLast = i === normalizedClips.length - 1;
    const tempPath = isLast ? outputPath : path.join(outputDir, `stitch-temp-${i}-${Date.now()}.mp4`);
    if (!isLast) tempFiles.push(tempPath);

    // Use the PREVIOUS clip's transitionToNext, or default
    const transition = normalizedClips[i - 1].transitionToNext || defaultXfade;

    console.log(`[Highlight] Joining clip ${i} → ${i + 1} with '${transition}' transition`);
    await xfadeTwoClips(currentPath, normalizedClips[i].path, tempPath, transition, transitionDurationS);
    currentPath = tempPath;
  }

  // Clean up temp files
  for (const temp of tempFiles) {
    await fs.unlink(temp).catch(() => {});
  }

  console.log(`[Highlight] Stitched ${normalizedClips.length} clips → ${outputPath}`);
  return outputPath;
}

function xfadeTwoClips(
  input1: string,
  input2: string,
  output: string,
  xfadeType: XfadeTransition,
  durationS: number
): Promise<void> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(input1, (err, metadata) => {
      if (err) return reject(err);

      const duration1 = metadata.format.duration || 30;
      const offset = Math.max(0, duration1 - durationS);

      // Normalize both clips to same format before xfade
      const filterComplex = [
        `[0:v]scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30,format=yuv420p[v0];`,
        `[1:v]scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30,format=yuv420p[v1];`,
        `[v0][v1]xfade=transition=${xfadeType}:duration=${durationS}:offset=${offset.toFixed(2)}[vout];`,
        `[0:a]aformat=sample_rates=44100:channel_layouts=stereo[a0];`,
        `[1:a]aformat=sample_rates=44100:channel_layouts=stereo[a1];`,
        `[a0][a1]acrossfade=d=${durationS}:c1=tri:c2=tri[aout]`,
      ].join("");

      ffmpeg()
        .input(input1)
        .input(input2)
        .outputOptions([
          "-filter_complex", filterComplex,
          "-map", "[vout]",
          "-map", "[aout]",
          "-c:v", "libx264",
          "-crf", "22",
          "-preset", "fast",
          "-c:a", "aac",
          "-b:a", "192k",
          "-movflags", "+faststart",
        ])
        .output(output)
        .on("start", (cmd) => console.log("[Highlight]", cmd.slice(0, 200) + "..."))
        .on("end", () => resolve())
        .on("error", (err, _stdout, stderr) => {
          console.error("[Highlight] stderr:", stderr?.slice(-500));
          reject(new Error(`Highlight stitch failed: ${err.message}`));
        })
        .run();
    });
  });
}
