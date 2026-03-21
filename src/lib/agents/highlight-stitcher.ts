import ffmpeg from "fluent-ffmpeg";
import { promises as fs } from "fs";
import path from "path";
import os from "os";

/**
 * Stitch multiple clips into a single highlight reel with transitions.
 * Uses FFmpeg xfade filter between clips.
 */
export async function stitchHighlightReel(
  clipPaths: string[],
  transitionType: string = "fade",
  transitionDurationS: number = 0.5
): Promise<string> {
  if (clipPaths.length === 0) throw new Error("No clips to stitch");
  if (clipPaths.length === 1) return clipPaths[0]; // Single clip, no stitching needed

  const outputDir = path.join(os.tmpdir(), "clipmind-outputs");
  await fs.mkdir(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, `highlight-reel-${Date.now()}.mp4`);

  // Map transition type names to FFmpeg xfade transition names
  const xfadeType = mapToXfadeType(transitionType);

  if (clipPaths.length === 2) {
    // Simple case: 2 clips with 1 transition
    await xfadeTwoClips(clipPaths[0], clipPaths[1], outputPath, xfadeType, transitionDurationS);
    return outputPath;
  }

  // For 3+ clips: chain xfade sequentially
  // Process pairs: (clip1 + clip2) → temp1, (temp1 + clip3) → temp2, etc.
  let currentPath = clipPaths[0];
  const tempFiles: string[] = [];

  for (let i = 1; i < clipPaths.length; i++) {
    const isLast = i === clipPaths.length - 1;
    const tempPath = isLast ? outputPath : path.join(outputDir, `stitch-temp-${i}-${Date.now()}.mp4`);

    if (!isLast) tempFiles.push(tempPath);

    await xfadeTwoClips(currentPath, clipPaths[i], tempPath, xfadeType, transitionDurationS);
    currentPath = tempPath;
  }

  // Clean up temp files
  for (const temp of tempFiles) {
    await fs.unlink(temp).catch(() => {});
  }

  console.log(`[Highlight] Stitched ${clipPaths.length} clips → ${outputPath}`);
  return outputPath;
}

function xfadeTwoClips(
  input1: string,
  input2: string,
  output: string,
  xfadeType: string,
  durationS: number
): Promise<void> {
  return new Promise((resolve, reject) => {
    // Get duration of first clip to calculate offset
    ffmpeg.ffprobe(input1, (err, metadata) => {
      if (err) return reject(err);

      const duration1 = metadata.format.duration || 30;
      const offset = Math.max(0, duration1 - durationS);

      // Normalize both clips to same format/resolution/fps before xfade
      // This prevents "filtergraph inputs/outputs" errors from mismatched formats
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
        .on("start", (cmd) => console.log("[Highlight] Command:", cmd))
        .on("end", () => resolve())
        .on("error", (err, _stdout, stderr) => {
          console.error("[Highlight] stderr:", stderr);
          reject(new Error(`Highlight stitch failed: ${err.message}`));
        })
        .run();
    });
  });
}

function mapToXfadeType(type: string): string {
  const map: Record<string, string> = {
    "crossfade": "fade",
    "cross-dissolve": "fade",
    "dip-to-black": "fadeblack",
    "fade": "fade",
    "wipe-left": "wipeleft",
    "wipe-right": "wiperight",
    "slide": "slideleft",
  };
  return map[type] || "fade";
}
