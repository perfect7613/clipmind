import type { WordTimestamp } from "@/types";

/** Common config passed through the pipeline */
export interface PipelineConfig {
  colorProfile: string;
  audioProfile: string;
}

/** A selected clip from the clip-selector agent */
export interface SelectedClip {
  clip_id: string;
  title: string;
  start_s: number;
  end_s: number;
  duration_s: number;
  mood: string;
  hook_text: string;
  why: string;
  scores: Record<string, number>;
}

/** Brand config extracted from DNA skill */
export interface BrandConfig {
  headingFont: string;
  bodyFont: string;
  primaryColor: string;
  secondaryColor: string;
  animationStyle: string;
  darkModeDefault: boolean;
}

/** Result of audio extraction */
export interface AudioExtractResult {
  audioPath: string;
  duration_s: number;
}

/** B-roll insertion point */
export interface BrollInsertion {
  timestamp_s: number;
  duration_s: number;
  storageUrl: string;
  matchedKeyword: string;
}
