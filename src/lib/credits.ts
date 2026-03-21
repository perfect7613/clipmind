import { db } from "@/lib/db";
import { users, creditTransactions } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";

interface CreditCost {
  perVideo: number;
  perMinInput: number;
  perMinOutput: number;
}

const CREDIT_RATES: CreditCost = {
  perVideo: 1,
  perMinInput: 0.1,
  perMinOutput: 0.2,
};

/**
 * Calculate credit cost for a job.
 */
export function calculateCreditCost(
  inputDurationMin: number,
  outputDurationMin: number
): { total: number; breakdown: CreditCost & { total: number } } {
  const perVideo = CREDIT_RATES.perVideo;
  const perInput = Math.round(inputDurationMin * CREDIT_RATES.perMinInput * 100) / 100;
  const perOutput = Math.round(outputDurationMin * CREDIT_RATES.perMinOutput * 100) / 100;
  const total = Math.round((perVideo + perInput + perOutput) * 100) / 100;

  return {
    total,
    breakdown: {
      perVideo,
      perMinInput: perInput,
      perMinOutput: perOutput,
      total,
    },
  };
}

/**
 * Check if user has enough credits.
 */
export async function hasEnoughCredits(userId: string, estimatedCost: number): Promise<boolean> {
  const [user] = await db.select({ credits: users.creditsRemaining })
    .from(users).where(eq(users.id, userId)).limit(1);
  return (user?.credits || 0) >= estimatedCost;
}

/**
 * Deduct credits after successful processing.
 */
export async function deductCredits(
  userId: string,
  jobId: string,
  inputDurationMin: number,
  outputDurationMin: number
): Promise<void> {
  const { total, breakdown } = calculateCreditCost(inputDurationMin, outputDurationMin);

  // Deduct atomically
  await db.update(users).set({
    creditsRemaining: sql`${users.creditsRemaining} - ${total}`,
    creditsUsedTotal: sql`${users.creditsUsedTotal} + ${total}`,
    updatedAt: new Date(),
  }).where(eq(users.id, userId));

  // Log transaction
  await db.insert(creditTransactions).values({
    userId,
    jobId,
    creditsAmount: total,
    transactionType: "deduct",
    breakdown,
  });
}
