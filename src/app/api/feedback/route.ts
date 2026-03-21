import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/lib/db";
import { feedbackComments } from "@/lib/db/schema";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { clipId, timestampS, comment, sessionId } = body;

    if (!clipId || timestampS === undefined || !comment) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const [result] = await db.insert(feedbackComments).values({
      userId: user.id,
      clipId,
      timestampS: timestampS,
      comment,
      sessionId: sessionId || `session-${Date.now()}`,
    }).returning();

    return NextResponse.json({ id: result.id, success: true });
  } catch (error) {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
