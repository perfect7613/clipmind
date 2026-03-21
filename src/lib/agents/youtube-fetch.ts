import { z } from "zod";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

// Output schema
export const YouTubeFetchResultSchema = z.object({
  captions: z.array(
    z.object({
      text: z.string(),
      start_s: z.number(),
      end_s: z.number(),
    })
  ),
  metadata: z.object({
    title: z.string(),
    duration_s: z.number(),
    channel: z.string(),
    description: z.string(),
    chapters: z.array(
      z.object({
        title: z.string(),
        start_s: z.number(),
        end_s: z.number(),
      })
    ),
  }),
  thumbnail_url: z.string().nullable(),
});

export type YouTubeFetchResult = z.infer<typeof YouTubeFetchResultSchema>;

/**
 * Validate a YouTube URL.
 */
export function isValidYouTubeUrl(url: string): boolean {
  const patterns = [
    /^https?:\/\/(www\.)?youtube\.com\/watch\?v=[\w-]+/,
    /^https?:\/\/youtu\.be\/[\w-]+/,
    /^https?:\/\/(www\.)?youtube\.com\/shorts\/[\w-]+/,
  ];
  return patterns.some((p) => p.test(url));
}

/**
 * Fetch captions and metadata from a YouTube video using yt-dlp.
 */
export async function fetchYouTubeData(url: string): Promise<YouTubeFetchResult> {
  if (!isValidYouTubeUrl(url)) {
    throw new Error(`Invalid YouTube URL: ${url}`);
  }

  // Fetch metadata as JSON
  const { stdout: metadataJson } = await execFileAsync("yt-dlp", [
    "--dump-json",
    "--no-download",
    url,
  ]);

  const metadata = JSON.parse(metadataJson);

  // Extract captions
  const captions = await extractCaptions(url, metadata);

  // Extract chapters
  const chapters = (metadata.chapters || []).map((ch: any) => ({
    title: ch.title || "",
    start_s: ch.start_time || 0,
    end_s: ch.end_time || 0,
  }));

  return YouTubeFetchResultSchema.parse({
    captions,
    metadata: {
      title: metadata.title || "",
      duration_s: metadata.duration || 0,
      channel: metadata.channel || metadata.uploader || "",
      description: (metadata.description || "").slice(0, 2000),
      chapters,
    },
    thumbnail_url: metadata.thumbnail || null,
  });
}

/**
 * Extract captions from a YouTube video.
 * Tries: manual captions -> auto-generated captions -> empty array.
 */
async function extractCaptions(
  url: string,
  metadata: any
): Promise<{ text: string; start_s: number; end_s: number }[]> {
  // Check if subtitles are available
  const subtitles = metadata.subtitles || {};
  const autoSubs = metadata.automatic_captions || {};

  const hasManual = Object.keys(subtitles).length > 0;
  const hasAuto = Object.keys(autoSubs).length > 0;

  if (!hasManual && !hasAuto) {
    return [];
  }

  try {
    // Use yt-dlp to write subtitle file
    const tmpDir = `/tmp/clipmind-yt-${Date.now()}`;
    await execFileAsync("yt-dlp", [
      "--skip-download",
      "--write-sub",
      "--write-auto-sub",
      "--sub-lang", "en",
      "--sub-format", "vtt",
      "--output", `${tmpDir}/%(id)s`,
      url,
    ]);

    // Read the VTT file
    const fs = await import("fs/promises");
    const path = await import("path");

    const files = await fs.readdir(tmpDir).catch(() => [] as string[]);
    const vttFile = files.find((f) => f.endsWith(".vtt"));

    if (!vttFile) {
      // Fallback: parse from metadata description
      return parseFromDescription(metadata);
    }

    const vttContent = await fs.readFile(path.join(tmpDir, vttFile), "utf-8");
    const parsed = parseVTT(vttContent);

    // Cleanup
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});

    return parsed;
  } catch {
    // Fallback: return empty captions
    return parseFromDescription(metadata);
  }
}

/**
 * Parse a VTT subtitle file into structured captions.
 */
function parseVTT(
  vtt: string
): { text: string; start_s: number; end_s: number }[] {
  const captions: { text: string; start_s: number; end_s: number }[] = [];
  const lines = vtt.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    // Match timestamp line: 00:00:01.000 --> 00:00:04.000
    const match = line.match(
      /(\d{2}):(\d{2}):(\d{2})\.(\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2})\.(\d{3})/
    );
    if (match) {
      const start_s =
        parseInt(match[1]) * 3600 +
        parseInt(match[2]) * 60 +
        parseInt(match[3]) +
        parseInt(match[4]) / 1000;
      const end_s =
        parseInt(match[5]) * 3600 +
        parseInt(match[6]) * 60 +
        parseInt(match[7]) +
        parseInt(match[8]) / 1000;

      // Collect text lines until next blank line
      const textLines: string[] = [];
      for (let j = i + 1; j < lines.length; j++) {
        const textLine = lines[j].trim();
        if (textLine === "") break;
        // Strip VTT tags
        textLines.push(textLine.replace(/<[^>]+>/g, ""));
      }

      const text = textLines.join(" ").trim();
      if (text) {
        captions.push({ text, start_s, end_s });
      }
    }
  }

  return captions;
}

/**
 * Fallback: create a single caption from description.
 */
function parseFromDescription(
  metadata: any
): { text: string; start_s: number; end_s: number }[] {
  if (metadata.description) {
    return [
      {
        text: metadata.description.slice(0, 5000),
        start_s: 0,
        end_s: metadata.duration || 0,
      },
    ];
  }
  return [];
}
