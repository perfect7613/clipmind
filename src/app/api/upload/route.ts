export const maxDuration = 300;

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
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
    const file = formData.get("file") as File | null;
    const bucket = (formData.get("bucket") as string) || "raw-videos";

    if (!file) {
      return NextResponse.json({ error: "File is required" }, { status: 400 });
    }

    // Save to a persistent temp directory (not cleaned up — coordinator needs it)
    const tmpDir = path.join(os.tmpdir(), "clipmind-videos");
    await fs.mkdir(tmpDir, { recursive: true });
    const tmpPath = path.join(tmpDir, `${Date.now()}-${file.name}`);
    const buffer = Buffer.from(await file.arrayBuffer());
    await fs.writeFile(tmpPath, buffer);

    // Also upload to Supabase Storage for backup
    try {
      const adminClient = createAdminClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );

      const filePath = `${user.id}/${Date.now()}-${file.name}`;
      await adminClient.storage
        .from(bucket)
        .upload(filePath, buffer, { contentType: file.type });
    } catch {
      // Storage upload is non-critical for local prototype
    }

    return NextResponse.json({
      url: tmpPath,
      path: tmpPath,
      localPath: tmpPath,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal error" },
      { status: 500 }
    );
  }
}
