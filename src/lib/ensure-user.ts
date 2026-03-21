import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

/**
 * Ensure a user row exists in the users table.
 * Supabase Auth creates users in auth.users but not in our custom public.users table.
 * This function creates the row if missing.
 */
export async function ensureUser(userId: string, email: string): Promise<void> {
  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (existing.length === 0) {
    await db.insert(users).values({
      id: userId,
      email,
    });
  }
}
