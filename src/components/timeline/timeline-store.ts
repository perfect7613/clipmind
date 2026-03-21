import { create } from "zustand";

export interface CutPoint {
  start_s: number;
  end_s: number;
}

export interface SegmentEffects {
  colorProfile: string;
  vignette: boolean;
  filmGrain: boolean;
  zoom: boolean;
  zoomLevel: string;
  speedRamp: boolean;
  speedFactor: number;
  transitionType: string;
}

export interface TimelineState {
  clipId: string | null;
  durationS: number;
  cutPoints: CutPoint[];
  effects: SegmentEffects;
  zoomEvents: Array<{ start_s: number; end_s: number; zoom_level: string }>;
  speedRamps: Array<{ start_s: number; end_s: number; factor: number }>;
  isModified: boolean;
  isExporting: boolean;
  exportProgress: number;
  selectedSegmentIndex: number;

  // Actions
  loadTimeline: (clipId: string, data: any) => void;
  updateCutPoint: (index: number, field: "start_s" | "end_s", value: number) => void;
  addCutPoint: (start_s: number, end_s: number) => void;
  removeCutPoint: (index: number) => void;
  updateEffects: (effects: Partial<SegmentEffects>) => void;
  setSelectedSegment: (index: number) => void;
  setExporting: (exporting: boolean, progress?: number) => void;
  reset: () => void;
}

const DEFAULT_EFFECTS: SegmentEffects = {
  colorProfile: "neutral",
  vignette: true,
  filmGrain: false,
  zoom: false,
  zoomLevel: "punched_in",
  speedRamp: false,
  speedFactor: 1.0,
  transitionType: "crossfade",
};

export const useTimelineStore = create<TimelineState>((set) => ({
  clipId: null,
  durationS: 0,
  cutPoints: [],
  effects: DEFAULT_EFFECTS,
  zoomEvents: [],
  speedRamps: [],
  isModified: false,
  isExporting: false,
  exportProgress: 0,
  selectedSegmentIndex: 0,

  loadTimeline: (clipId, data) =>
    set({
      clipId,
      durationS: data.durationS || 0,
      cutPoints: data.timeline?.cutPoints || [{ start_s: 0, end_s: data.durationS || 0 }],
      effects: { ...DEFAULT_EFFECTS, ...(data.timeline?.effects || {}) },
      zoomEvents: data.timeline?.zoomEvents || [],
      speedRamps: data.timeline?.speedRamps || [],
      isModified: false,
      selectedSegmentIndex: 0,
    }),

  updateCutPoint: (index, field, value) =>
    set((state) => {
      const points = [...state.cutPoints];
      if (points[index]) {
        points[index] = { ...points[index], [field]: value };
      }
      return { cutPoints: points, isModified: true };
    }),

  addCutPoint: (start_s, end_s) =>
    set((state) => ({
      cutPoints: [...state.cutPoints, { start_s, end_s }].sort((a, b) => a.start_s - b.start_s),
      isModified: true,
    })),

  removeCutPoint: (index) =>
    set((state) => ({
      cutPoints: state.cutPoints.filter((_, i) => i !== index),
      isModified: true,
    })),

  updateEffects: (effects) =>
    set((state) => ({
      effects: { ...state.effects, ...effects },
      isModified: true,
    })),

  setSelectedSegment: (index) => set({ selectedSegmentIndex: index }),

  setExporting: (isExporting, progress) =>
    set({ isExporting, exportProgress: progress ?? 0 }),

  reset: () =>
    set({
      clipId: null,
      durationS: 0,
      cutPoints: [],
      effects: DEFAULT_EFFECTS,
      zoomEvents: [],
      speedRamps: [],
      isModified: false,
      isExporting: false,
      exportProgress: 0,
      selectedSegmentIndex: 0,
    }),
}));
