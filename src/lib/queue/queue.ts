import { Queue } from "bullmq";
import Redis from "bullmq/node_modules/ioredis";

const connection = new Redis(process.env.UPSTASH_REDIS_URL!, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  tls: process.env.UPSTASH_REDIS_URL?.startsWith("rediss://") ? {} : undefined,
});

export const editQueue = new Queue("edit-pipeline", { connection });
export const onboardingQueue = new Queue("onboarding", { connection });

export { connection };
