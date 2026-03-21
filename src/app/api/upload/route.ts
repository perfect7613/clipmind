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

    // Save to temp, then upload to Supabase Storage
    const tmpDir = path.join(os.tmpdir(), `clipmind-upload-${Date.now()}`);
    await fs.mkdir(tmpDir, { recursive: true });
    const tmpPath = path.join(tmpDir, file.name);
    const buffer = Buffer.from(await file.arrayBuffer());
    await fs.writeFile(tmpPath, buffer);

    const adminClient = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const filePath = `${user.id}/${Date.now()}-${file.name}`;
    const { error: uploadError } = await adminClient.storage
      .from(bucket)
      .upload(filePath, buffer, { contentType: file.type });

    if (uploadError) {
      throw new Error(`Upload failed: ${uploadError.message}`);
    }

    const { data: urlData } = adminClient.storage
      .from(bucket)
      .getPublicUrl(filePath);

    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});

    return NextResponse.json({
      url: urlData.publicUrl,
      path: filePath,
      localPath: tmpPath,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal error" },
      { status: 500 }
    );
  }
}
