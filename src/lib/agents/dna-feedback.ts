import Anthropic from "@anthropic-ai/sdk";
import { db } from "@/lib/db";
import { feedbackComments, users, dnaProfiles } from "@/lib/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { updateDnaSkill, getDnaProfile } from "@/lib/dna/loader";

const anthropic = new Anthropic();

/**
 * Check if a user has accumulated enough sessions for a DNA update.
 * Triggers after 4-5 sessions with feedback.
 */
export async function checkAndUpdateDna(userId: string): Promise<boolean> {
  // Get user session count
  const [user] = await db.select({ sessionCount: users.sessionCount })
    .from(users).where(eq(users.id, userId)).limit(1);

  if (!user || (user.sessionCount || 0) < 4) return false;

  // Get all feedback for this user
  const feedback = await db.select()
    .from(feedbackComments)
    .where(eq(feedbackComments.userId, userId));

  if (feedback.length < 3) return false; // Need at least 3 comments

  // Get active DNA profile
  const profiles = await db.select()
    .from(dnaProfiles)
    .where(and(eq(dnaProfiles.userId, userId), eq(dnaProfiles.isActive, true)))
    .limit(1);

  if (profiles.length === 0) return false;

  const profile = profiles[0];

  // Use Claude to analyze feedback patterns and update DNA
  const feedbackSummary = feedback
    .map((f) => `[${f.timestampS}s] ${f.comment}`)
    .join("\n");

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-5-20250929",
    max_tokens: 3000,
    messages: [{
      role: "user",
      content: `Analyze this user feedback on their AI-edited videos and suggest updates to their editing DNA skill.

CURRENT DNA SKILL:
${profile.skillContent}

USER FEEDBACK (accumulated across ${user.sessionCount} sessions):
${feedbackSummary}

Identify patterns in the feedback. Common patterns:
- "zoom too aggressive" → reduce zoom aggressiveness
- "caption should be uppercase" → change casing preference
- "animation not needed here" → reduce animation density
- "audio too quiet/loud" → adjust audio targets
- "color too warm/cool" → adjust color profile

Return the COMPLETE updated SKILL.md content (with --- frontmatter ---).
Only change sections where the feedback clearly indicates a preference change.
Keep the same structure and format.
Increment confidence slightly if feedback is consistent.

Return ONLY the SKILL.md content, nothing else.`,
    }],
  });

  const textBlock = response.content.find((c) => c.type === "text");
  if (!textBlock || textBlock.type !== "text") return false;

  const updatedContent = textBlock.text.trim();

  // Validate and save
  try {
    const newConfidence = Math.min((profile.confidence || 0.3) + 0.1, 1.0);
    await updateDnaSkill(profile.id, updatedContent, newConfidence);

    // Reset session count
    await db.update(users).set({
      sessionCount: 0,
      updatedAt: new Date(),
    }).where(eq(users.id, userId));

    return true;
  } catch {
    return false; // Validation failed, keep old DNA
  }
}

/**
 * Increment session count for a user (called after each video processing).
 */
export async function incrementSessionCount(userId: string): Promise<void> {
  await db.update(users).set({
    sessionCount: sql`${users.sessionCount} + 1`,
    updatedAt: new Date(),
  }).where(eq(users.id, userId));
}
