import Anthropic from "@anthropic-ai/sdk";
import { promises as fs } from "fs";
import ffmpeg from "fluent-ffmpeg";
import path from "path";
import os from "os";

const anthropic = new Anthropic();

export interface BrollTag {
  autoTags: string[];
  description: string;
}

/**
 * Extract a representative frame from a B-roll clip and auto-tag with Claude Vision.
 */
export async function autoTagBroll(videoPath: string): Promise<BrollTag> {
  const tmpDir = path.join(os.tmpdir(), `clipmind-broll-${Date.now()}`);
  await fs.mkdir(tmpDir, { recursive: true });
  const framePath = path.join(tmpDir, "frame.jpg");

  // Extract middle frame
  await new Promise<void>((resolve, reject) => {
    ffmpeg(videoPath)
      .screenshots({ count: 1, folder: tmpDir, filename: "frame.jpg", size: "640x360" })
      .on("end", () => resolve())
      .on("error", (err) => reject(new Error(`Frame extraction failed: ${err.message}`)));
  });

  const frameData = await fs.readFile(framePath);
  const base64 = frameData.toString("base64");

  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 500,
    messages: [{
      role: "user",
      content: [
        { type: "image", source: { type: "base64", media_type: "image/jpeg", data: base64 } },
        { type: "text", text: `Tag this B-roll video frame. Return JSON: {"tags": ["tag1", "tag2", ...], "description": "brief description"}. Tags should be 1-3 word descriptors like "office scene", "typing", "product demo", "outdoor", "cityscape", "meeting", "screen recording". Return ONLY JSON.` },
      ],
    }],
  });

  await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});

  const textBlock = response.content.find((c) => c.type === "text");
  if (!textBlock || textBlock.type !== "text") return { autoTags: ["untagged"], description: "" };

  try {
    let jsonStr = textBlock.text.trim();
    if (jsonStr.startsWith("```")) jsonStr = jsonStr.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    const parsed = JSON.parse(jsonStr);
    return { autoTags: parsed.tags || ["untagged"], description: parsed.description || "" };
  } catch {
    return { autoTags: ["untagged"], description: "" };
  }
}
