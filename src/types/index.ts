export type Platform = "youtube" | "tiktok" | "reels" | "shorts";
export type PlanTier = "free" | "pro";
export type JobStatus = "pending" | "processing" | "completed" | "failed";
export type AudioStyle = "podcast_warm" | "youtube_standard" | "educational_clear" | "vlog_punchy";
export type ColorProfile = "warm" | "neutral" | "cool" | "cinematic" | "flat";

export type PresetCategory = "cinematic" | "social" | "classic";

export interface EditJobPayload {
  videoUrls: string[];
  dnaProfileId: string;
  platform: Platform;
  clipCount: number;
  presetId?: string;
  skipAnimations?: boolean;
  skipBroll?: boolean;
}

export interface WordTimestamp {
  word: string;
  start_s: number;
  end_s: number;
  confidence?: number;
}

export interface TranscriptResult {
  transcript: string;
  words: WordTimestamp[];
  duration_s: number;
}

export interface ClipResult {
  clip_id: string;
  title: string;
  start_s: number;
  end_s: number;
  duration_s: number;
  mood: "funny" | "interesting" | "surprising" | "emotional" | "educational";
  hook_text: string;
  why: string;
  scores: {
    humor: number;
    insight: number;
    energy: number;
    hook_quality: number;
    creator_match: number;
  };
  render_url?: string;
}

export interface ZoomEvent {
  start_s: number;
  end_s: number;
  zoom_level: number;
  crop_x: number;
  crop_y: number;
  crop_w: number;
  crop_h: number;
}

export interface SilenceCut {
  start_s: number;
  end_s: number;
}

export interface AnimationSlot {
  timestamp_s: number;
  duration_s: number;
  type: "text_card" | "animated_counter" | "building_flowchart" | "side_by_side" | "list_builder" | "data_bar" | "framework_grid";
  content: string;
  component_code?: string;
}

export interface BrollInsertion {
  timestamp_s: number;
  duration_s: number;
  clip_url: string;
  tag_match: string;
}

export interface FeedbackComment {
  id: string;
  timestamp_s: number;
  comment: string;
  session_id: string;
  clip_id: string;
  created_at: string;
}
