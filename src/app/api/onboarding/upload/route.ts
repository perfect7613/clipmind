import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { onboardFromUpload } from "@/lib/agents/onboarding-pipeline";
import { promises as fs } from "fs";
import path from "path";
import os from "os";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get("video") as File | null;
    const creatorName = formData.get("creatorName") as string | null;

    if (!file) {
      return NextResponse.json({ error: "Video file is required" }, { status: 400 });
    }

    if (!creatorName) {
      return NextResponse.json({ error: "Creator name is required" }, { status: 400 });
    }

    // Validate file type
    const validTypes = ["video/mp4", "video/quicktime", "video/x-msvideo", "video/webm"];
    if (!validTypes.includes(file.type)) {
      return NextResponse.json(
        { error: "Invalid file type. Supported: MP4, MOV, AVI, WebM" },
        { status: 400 }
      );
    }

    // Save uploaded file to temp directory
    const tmpDir = path.join(os.tmpdir(), `clipmind-upload-${Date.now()}`);
    await fs.mkdir(tmpDir, { recursive: true });
    const videoPath = path.join(tmpDir, file.name);
    const buffer = Buffer.from(await file.arrayBuffer());
    await fs.writeFile(videoPath, buffer);

    // Run the onboarding pipeline
    const result = await onboardFromUpload(videoPath, user.id, creatorName);

    // Cleanup temp file
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});

    return NextResponse.json({
      success: true,
      profileId: result.profileId,
      message: "DNA profile created successfully",
    });
  } catch (error) {
    console.error("Upload onboarding error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal error" },
      { status: 500 }
    );
  }
}
