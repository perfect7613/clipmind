import { z } from "zod";
import { db } from "@/lib/db";
import { brollCatalog } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import type { WordTimestamp } from "@/types";

export const BrollInsertionSchema = z.object({
  timestamp_s: z.number(),
  duration_s: z.number(),
  clip_url: z.string(),
  tag_match: z.string(),
});

export type BrollInsertion = z.infer<typeof BrollInsertionSchema>;

/**
 * Match B-roll clips from the user's catalog against transcript context.
 * Keyword matching — no vector search in v1.
 */
export async function matchBroll(
  words: WordTimestamp[],
  userId: string,
  animationTimestamps: { start_s: number; end_s: number }[] = []
): Promise<BrollInsertion[]> {
  // Fetch user's B-roll catalog
  const catalog = await db
    .select()
    .from(brollCatalog)
    .where(eq(brollCatalog.userId, userId));

  if (catalog.length === 0) return [];

  // Build 10-second context windows from transcript
  const windows = buildContextWindows(words, 10);
  const insertions: BrollInsertion[] = [];

  for (const window of windows) {
    // Check for animation conflicts
    const hasConflict = animationTimestamps.some(
      (a) => a.start_s < window.end_s && a.end_s > window.start_s
    );
    if (hasConflict) continue;

    // Keyword match against catalog tags
    const windowText = window.text.toLowerCase();
    for (const clip of catalog) {
      const tags = (clip.autoTags as string[]) || [];
      const matched = tags.find((tag) =>
        windowText.includes(tag.toLowerCase()) ||
        tag.toLowerCase().split(" ").some((word) => windowText.includes(word))
      );

      if (matched) {
        insertions.push({
          timestamp_s: window.start_s,
          duration_s: Math.min(clip.durationS || 4, 5),
          clip_url: clip.storageUrl,
          tag_match: matched,
        });
        break; // One B-roll per window
      }
    }
  }

  return insertions;
}

function buildContextWindows(words: WordTimestamp[], windowS: number) {
  const windows: { start_s: number; end_s: number; text: string }[] = [];
  if (words.length === 0) return windows;

  let start = words[0].start_s;
  let windowWords: string[] = [];

  for (const word of words) {
    windowWords.push(word.word);
    if (word.end_s - start >= windowS) {
      windows.push({ start_s: start, end_s: word.end_s, text: windowWords.join(" ") });
      start = word.end_s;
      windowWords = [];
    }
  }
  if (windowWords.length > 0) {
    windows.push({ start_s: start, end_s: words[words.length - 1].end_s, text: windowWords.join(" ") });
  }
  return windows;
}
