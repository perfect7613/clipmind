import { promises as fs } from "fs";
import path from "path";
import { db } from "@/lib/db";
import { dnaProfiles } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

const SKILLS_DIR = ".claude/skills/creator-dna";

/**
 * Load a DNA skill from Supabase and write it to the filesystem
 * so the Agent SDK can discover it.
 */
export async function loadDnaSkillToFilesystem(
  dnaProfileId: string,
  workDir: string
): Promise<string> {
  // Fetch from DB
  const profile = await db
    .select()
    .from(dnaProfiles)
    .where(eq(dnaProfiles.id, dnaProfileId))
    .limit(1);

  if (!profile.length) {
    throw new Error(`DNA profile ${dnaProfileId} not found`);
  }

  const skillDir = path.join(workDir, SKILLS_DIR);
  await fs.mkdir(skillDir, { recursive: true });

  const skillPath = path.join(skillDir, "SKILL.md");
  await fs.writeFile(skillPath, profile[0].skillContent, "utf-8");

  return skillPath;
}

/**
 * Clean up the DNA skill file from the filesystem after job completion.
 */
export async function cleanupDnaSkill(workDir: string): Promise<void> {
  const skillDir = path.join(workDir, SKILLS_DIR);
  try {
    await fs.rm(skillDir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
}

/**
 * Save DNA skill content to Supabase.
 */
export async function saveDnaSkill(
  userId: string,
  name: string,
  skillContent: string,
  sourceType: "youtube" | "upload",
  sourceUrl?: string
): Promise<string> {
  const [result] = await db
    .insert(dnaProfiles)
    .values({
      userId,
      name,
      skillContent,
      sourceType,
      sourceUrl: sourceUrl || null,
      confidence: 0.3,
      isActive: true,
    })
    .returning({ id: dnaProfiles.id });

  return result.id;
}
