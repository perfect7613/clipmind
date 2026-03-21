import { z } from "zod";

const SARVAM_API_URL = "https://api.sarvam.ai";

// Zod schemas for Sarvam responses
export const WordTimestampSchema = z.object({
  word: z.string(),
  start_s: z.number(),
  end_s: z.number(),
  confidence: z.number().optional(),
});

export const TranscriptResultSchema = z.object({
  transcript: z.string(),
  words: z.array(WordTimestampSchema),
  duration_s: z.number(),
});

export type WordTimestamp = z.infer<typeof WordTimestampSchema>;
export type TranscriptResult = z.infer<typeof TranscriptResultSchema>;

export class SarvamClient {
  private apiKey: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.SARVAM_API_KEY!;
    if (!this.apiKey) {
      throw new Error("SARVAM_API_KEY is required");
    }
  }

  private async request(endpoint: string, options: RequestInit = {}) {
    const res = await fetch(`${SARVAM_API_URL}${endpoint}`, {
      ...options,
      headers: {
        "api-subscription-key": this.apiKey,
        ...options.headers,
      },
    });

    if (!res.ok) {
      const error = await res.text();
      throw new Error(`Sarvam API error (${res.status}): ${error}`);
    }

    return res.json();
  }

  // Step 1: Initiate a batch transcription job
  async initiateJob(): Promise<{ job_id: string; upload_url: string }> {
    return this.request("/speech-to-text/batch/initiate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "saaras:v3",
        with_timestamps: true,
        with_word_timestamps: true,
      }),
    });
  }

  // Step 2: Upload audio file to the job
  async uploadFile(uploadUrl: string, audioBuffer: Buffer, filename: string): Promise<void> {
    const formData = new FormData();
    const blob = new Blob([new Uint8Array(audioBuffer)], { type: "audio/wav" });
    formData.append("file", blob, filename);

    const res = await fetch(uploadUrl, {
      method: "PUT",
      body: formData,
    });

    if (!res.ok) {
      throw new Error(`Upload failed (${res.status}): ${await res.text()}`);
    }
  }

  // Step 3: Start the batch job
  async startJob(jobId: string): Promise<void> {
    await this.request(`/speech-to-text/batch/${jobId}/start`, {
      method: "POST",
    });
  }

  // Step 4: Poll for job completion
  async getJobStatus(jobId: string): Promise<{ status: string; result_url?: string }> {
    return this.request(`/speech-to-text/batch/${jobId}/status`);
  }

  // Step 5: Download results
  async downloadResults(resultUrl: string): Promise<any> {
    const res = await fetch(resultUrl);
    if (!res.ok) throw new Error(`Download failed: ${res.status}`);
    return res.json();
  }

  // Full transcription pipeline with polling
  async transcribe(audioBuffer: Buffer, filename: string = "audio.wav"): Promise<TranscriptResult> {
    // Initiate
    const { job_id, upload_url } = await this.initiateJob();

    // Upload
    await this.uploadFile(upload_url, audioBuffer, filename);

    // Start
    await this.startJob(job_id);

    // Poll with exponential backoff
    let delay = 2000;
    const maxDelay = 30000;
    const maxAttempts = 60;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, delay));

      const status = await this.getJobStatus(job_id);

      if (status.status === "completed" && status.result_url) {
        const rawResult = await this.downloadResults(status.result_url);
        return this.parseResult(rawResult);
      }

      if (status.status === "failed") {
        throw new Error(`Transcription job ${job_id} failed`);
      }

      delay = Math.min(delay * 1.5, maxDelay);
    }

    throw new Error(`Transcription job ${job_id} timed out after ${maxAttempts} attempts`);
  }

  // Parse Sarvam response into our standard format
  private parseResult(rawResult: any): TranscriptResult {
    const words: WordTimestamp[] = [];
    let fullTranscript = "";

    // Parse word-level timestamps from Sarvam response
    if (rawResult.words) {
      for (const w of rawResult.words) {
        words.push({
          word: w.word || w.text,
          start_s: w.start || w.start_time,
          end_s: w.end || w.end_time,
          confidence: w.confidence,
        });
      }
      fullTranscript = words.map((w) => w.word).join(" ");
    } else if (rawResult.transcript) {
      fullTranscript = rawResult.transcript;
    }

    const duration_s =
      words.length > 0
        ? words[words.length - 1].end_s
        : rawResult.duration || 0;

    return TranscriptResultSchema.parse({
      transcript: fullTranscript,
      words,
      duration_s,
    });
  }
}

// Singleton
let sarvamClient: SarvamClient | null = null;
export function getSarvamClient(): SarvamClient {
  if (!sarvamClient) {
    sarvamClient = new SarvamClient();
  }
  return sarvamClient;
}
