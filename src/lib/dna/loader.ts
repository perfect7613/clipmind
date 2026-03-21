import { promises as fs } from "fs";
import path from "path";
import { db } from "@/lib/db";
import { dnaProfiles } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

const SKILLS_DIR = ".claude/skills/creator-dna";

/**
 * Validate that a SKILL.md string has valid frontmatter.
 * Returns true if the skill content has valid ---name/description--- frontmatter.
 */
export function validateSkillContent(content: string): { valid: boolean; error?: string } {
  // Check frontmatter exists
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (!frontmatterMatch) {
    return { valid: false, error: "Missing YAML frontmatter (--- delimiters)" };
  }

  const frontmatter = frontmatterMatch[1];

  // Check name field
  const nameMatch = frontmatter.match(/^name:\s*(.+)$/m);
  if (!nameMatch) {
    return { valid: false, error: "Missing 'name' field in frontmatter" };
  }
  const name = nameMatch[1].trim();
  if (name.length > 64) {
    return { valid: false, error: "Name must be 64 characters or fewer" };
  }
  if (!/^[a-z0-9-]+$/.test(name)) {
    return { valid: false, error: "Name must contain only lowercase letters, numbers, and hyphens" };
  }

  // Check description field
  const descMatch = frontmatter.match(/^description:\s*(.+)$/m);
  if (!descMatch) {
    return { valid: false, error: "Missing 'description' field in frontmatter" };
  }
  if (descMatch[1].trim().length > 1024) {
    return { valid: false, error: "Description must be 1024 characters or fewer" };
  }

  return { valid: true };
}

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
  const validation = validateSkillContent(skillContent);
  if (!validation.valid) {
    throw new Error(`Invalid SKILL.md: ${validation.error}`);
  }

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

/**
 * Update an existing DNA skill content in Supabase.
 */
export async function updateDnaSkill(
  profileId: string,
  skillContent: string,
  confidence?: number
): Promise<void> {
  const validation = validateSkillContent(skillContent);
  if (!validation.valid) {
    throw new Error(`Invalid SKILL.md: ${validation.error}`);
  }

  const updateData: Record<string, unknown> = {
    skillContent,
    updatedAt: new Date(),
  };
  if (confidence !== undefined) {
    updateData.confidence = confidence;
  }

  await db
    .update(dnaProfiles)
    .set(updateData)
    .where(eq(dnaProfiles.id, profileId));
}

/**
 * Get all DNA profiles for a user.
 */
export async function getUserDnaProfiles(userId: string) {
  return db
    .select()
    .from(dnaProfiles)
    .where(eq(dnaProfiles.userId, userId));
}

/**
 * Get a single DNA profile by ID.
 */
export async function getDnaProfile(profileId: string) {
  const results = await db
    .select()
    .from(dnaProfiles)
    .where(eq(dnaProfiles.id, profileId))
    .limit(1);
  return results[0] || null;
}

/**
 * Delete a DNA profile.
 */
export async function deleteDnaProfile(profileId: string): Promise<void> {
  await db.delete(dnaProfiles).where(eq(dnaProfiles.id, profileId));
}
