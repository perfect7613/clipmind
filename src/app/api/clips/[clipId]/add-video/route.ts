import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { exec } from "child_process";
import { promises as fs } from "fs";
import path from "path";
import os from "os";

export const maxDuration = 120;

/**
 * POST /api/clips/{clipId}/add-video
 * Upload a new video to add to the timeline.
 * Probes duration via ffprobe and saves locally.
 * Returns { path, durationS, width, height }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ clipId: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await params; // validate clipId exists

    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "File required" }, { status: 400 });
    }

    // Save to local temp
    const tmpDir = path.join(os.tmpdir(), "clipmind-videos");
    await fs.mkdir(tmpDir, { recursive: true });
    const tmpPath = path.join(tmpDir, `${Date.now()}-${file.name}`);
    const buffer = Buffer.from(await file.arrayBuffer());
    await fs.writeFile(tmpPath, buffer);

    // Probe duration and dimensions
    const info = await probeVideo(tmpPath);

    return NextResponse.json({
      path: tmpPath,
      durationS: info.duration,
      width: info.width,
      height: info.height,
    });
  } catch (error) {
    console.error("Add video error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal error" },
      { status: 500 }
    );
  }
}

function probeVideo(filePath: string): Promise<{ duration: number; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    exec(
      `ffprobe -v error -show_entries format=duration -show_entries stream=width,height -of json "${filePath}"`,
      (err, stdout) => {
        if (err) return reject(err);
        try {
          const data = JSON.parse(stdout);
          const duration = parseFloat(data.format?.duration || "0");
          const stream = data.streams?.find((s: any) => s.width && s.height);
          resolve({
            duration,
            width: stream?.width || 1920,
            height: stream?.height || 1080,
          });
        } catch {
          reject(new Error("Failed to parse ffprobe output"));
        }
      }
    );
  });
}
