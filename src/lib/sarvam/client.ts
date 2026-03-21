import { z } from "zod";
import { promises as fs } from "fs";

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

  /**
   * Transcribe audio using Sarvam REST API (POST /speech-to-text).
   * Accepts either a Buffer or a file path.
   * Max 30 seconds per request — for longer files, chunks automatically.
   */
  async transcribe(
    audioInput: Buffer | string,
    filename: string = "audio.wav"
  ): Promise<TranscriptResult> {
    let audioBuffer: Buffer;

    if (typeof audioInput === "string") {
      // It's a file path
      audioBuffer = await fs.readFile(audioInput);
    } else {
      audioBuffer = audioInput;
    }

    // Sarvam REST API: single POST with multipart form data
    const formData = new FormData();
    const blob = new Blob([new Uint8Array(audioBuffer)], { type: "audio/wav" });
    formData.append("file", blob, filename);
    formData.append("model", "saaras:v3");
    formData.append("language_code", "en-IN");

    const res = await fetch(`${SARVAM_API_URL}/speech-to-text`, {
      method: "POST",
      headers: {
        "api-subscription-key": this.apiKey,
      },
      body: formData,
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Sarvam API error (${res.status}): ${errorText}`);
    }

    const rawResult = await res.json();
    return this.parseResult(rawResult);
  }

  /**
   * Transcribe a long audio file by chunking into 25-second segments.
   */
  async transcribeLong(
    audioPath: string,
    totalDurationS: number
  ): Promise<TranscriptResult> {
    const ffmpeg = (await import("fluent-ffmpeg")).default;
    const path = await import("path");
    const os = await import("os");

    const chunkDuration = 25; // seconds — under 30s limit
    const chunks = Math.ceil(totalDurationS / chunkDuration);
    const allWords: WordTimestamp[] = [];
    let fullTranscript = "";

    const tmpDir = path.join(os.tmpdir(), `clipmind-sarvam-${Date.now()}`);
    await fs.mkdir(tmpDir, { recursive: true });

    for (let i = 0; i < chunks; i++) {
      const startS = i * chunkDuration;
      const chunkPath = path.join(tmpDir, `chunk-${i}.wav`);

      // Extract chunk with FFmpeg
      await new Promise<void>((resolve, reject) => {
        ffmpeg(audioPath)
          .setStartTime(startS)
          .duration(chunkDuration)
          .audioFrequency(16000)
          .audioChannels(1)
          .audioCodec("pcm_s16le")
          .output(chunkPath)
          .on("end", () => resolve())
          .on("error", (err: Error) => reject(err))
          .run();
      });

      try {
        const result = await this.transcribe(chunkPath, `chunk-${i}.wav`);

        // Offset word timestamps by chunk start time
        for (const word of result.words) {
          allWords.push({
            word: word.word,
            start_s: word.start_s + startS,
            end_s: word.end_s + startS,
            confidence: word.confidence,
          });
        }

        if (result.transcript) {
          fullTranscript += (fullTranscript ? " " : "") + result.transcript;
        }
      } catch (err) {
        console.error(`Chunk ${i} transcription failed:`, err);
        // Continue with other chunks
      }
    }

    // Cleanup
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});

    return TranscriptResultSchema.parse({
      transcript: fullTranscript,
      words: allWords,
      duration_s: totalDurationS,
    });
  }

  private parseResult(rawResult: any): TranscriptResult {
    const words: WordTimestamp[] = [];
    let fullTranscript = "";

    // Sarvam returns { transcript, timestamps: [{start, end, word}] } or similar
    if (rawResult.timestamps) {
      for (const w of rawResult.timestamps) {
        words.push({
          word: w.word || w.text || "",
          start_s: w.start ?? w.start_time ?? 0,
          end_s: w.end ?? w.end_time ?? 0,
          confidence: w.confidence,
        });
      }
    } else if (rawResult.words) {
      for (const w of rawResult.words) {
        words.push({
          word: w.word || w.text || "",
          start_s: w.start ?? w.start_time ?? 0,
          end_s: w.end ?? w.end_time ?? 0,
          confidence: w.confidence,
        });
      }
    }

    fullTranscript = rawResult.transcript || words.map((w) => w.word).join(" ");

    // If no word timestamps, create approximate ones from transcript
    if (words.length === 0 && fullTranscript) {
      const wordsArr = fullTranscript.split(/\s+/);
      const avgWordDuration = 0.4; // rough estimate
      wordsArr.forEach((word, i) => {
        words.push({
          word,
          start_s: i * avgWordDuration,
          end_s: (i + 1) * avgWordDuration,
        });
      });
    }

    const duration_s =
      words.length > 0 ? words[words.length - 1].end_s : rawResult.duration || 0;

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
