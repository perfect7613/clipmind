import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { jobs } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let lastStep = "";
      let lastPct = -1;
      let completed = false;

      const interval = setInterval(async () => {
        try {
          const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1);
          if (!job) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: "Job not found" })}\n\n`));
            clearInterval(interval);
            controller.close();
            return;
          }

          if (job.currentStep !== lastStep || job.progressPct !== lastPct) {
            lastStep = job.currentStep || "";
            lastPct = job.progressPct || 0;
            controller.enqueue(encoder.encode(
              `data: ${JSON.stringify({ step: lastStep, pct: lastPct, status: job.status })}\n\n`
            ));
          }

          if (job.status === "completed" || job.status === "failed") {
            if (!completed) {
              completed = true;
              controller.enqueue(encoder.encode(
                `data: ${JSON.stringify({ step: job.currentStep, pct: 100, status: job.status, error: job.errorMessage })}\n\n`
              ));
              clearInterval(interval);
              controller.close();
            }
          }
        } catch {
          clearInterval(interval);
          controller.close();
        }
      }, 1000);

      request.signal.addEventListener("abort", () => {
        clearInterval(interval);
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
