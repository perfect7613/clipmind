import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { onboardFromYouTube } from "@/lib/agents/onboarding-pipeline";
import { isValidYouTubeUrl } from "@/lib/agents/youtube-fetch";
import { ensureUser } from "@/lib/ensure-user";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Ensure user exists in our users table
    await ensureUser(user.id, user.email!);

    const body = await request.json();
    const { url, creatorName } = body;

    if (!url || !isValidYouTubeUrl(url)) {
      return NextResponse.json({ error: "Invalid YouTube URL" }, { status: 400 });
    }

    if (!creatorName || typeof creatorName !== "string") {
      return NextResponse.json({ error: "Creator name is required" }, { status: 400 });
    }

    // Run the onboarding pipeline
    const result = await onboardFromYouTube(url, user.id, creatorName);

    return NextResponse.json({
      success: true,
      profileId: result.profileId,
      message: "DNA profile created successfully",
    });
  } catch (error) {
    console.error("YouTube onboarding error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal error" },
      { status: 500 }
    );
  }
}
