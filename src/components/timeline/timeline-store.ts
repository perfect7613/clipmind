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

export interface Segment {
  id: string;
  start_s: number;
  end_s: number;
  effects: SegmentEffects;
}

interface UndoSnapshot {
  segments: Segment[];
  selectedSegmentId: string | null;
}

export interface TimelineState {
  clipId: string | null;
  durationS: number;
  cutPoints: CutPoint[];
  effects: SegmentEffects;
  segments: Segment[];
  zoomEvents: Array<{ start_s: number; end_s: number; zoom_level: string }>;
  speedRamps: Array<{ start_s: number; end_s: number; factor: number }>;
  isModified: boolean;
  isExporting: boolean;
  exportProgress: number;
  selectedSegmentIndex: number;
  selectedSegmentId: string | null;
  timelineZoom: number;
  playheadS: number;
  undoStack: UndoSnapshot[];
  redoStack: UndoSnapshot[];

  // Actions
  loadTimeline: (clipId: string, data: Record<string, unknown>) => void;
  updateCutPoint: (index: number, field: "start_s" | "end_s", value: number) => void;
  addCutPoint: (start_s: number, end_s: number) => void;
  removeCutPoint: (index: number) => void;
  updateEffects: (effects: Partial<SegmentEffects>) => void;
  setSelectedSegment: (index: number) => void;
  selectSegmentById: (id: string | null) => void;
  setExporting: (exporting: boolean, progress?: number) => void;
  setPlayhead: (time: number) => void;
  setTimelineZoom: (zoom: number) => void;
  splitAtPlayhead: () => void;
  deleteSegment: (id: string) => void;
  pushUndo: () => void;
  undo: () => void;
  redo: () => void;
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

let segmentCounter = 0;
function makeSegmentId(): string {
  segmentCounter += 1;
  return `seg_${Date.now()}_${segmentCounter}`;
}

function snapshot(state: TimelineState): UndoSnapshot {
  return {
    segments: state.segments.map((s) => ({ ...s, effects: { ...s.effects } })),
    selectedSegmentId: state.selectedSegmentId,
  };
}

export const useTimelineStore = create<TimelineState>((set, get) => ({
  clipId: null,
  durationS: 0,
  cutPoints: [],
  effects: DEFAULT_EFFECTS,
  segments: [],
  zoomEvents: [],
  speedRamps: [],
  isModified: false,
  isExporting: false,
  exportProgress: 0,
  selectedSegmentIndex: 0,
  selectedSegmentId: null,
  timelineZoom: 1,
  playheadS: 0,
  undoStack: [],
  redoStack: [],

  loadTimeline: (clipId, data: Record<string, unknown>) => {
    const timeline = (data.timeline || {}) as Record<string, unknown>;
    const dur = (data.durationS as number) || 0;
    const cutPts = (timeline.cutPoints as CutPoint[]) || [{ start_s: 0, end_s: dur }];

    // Build segments from cut points
    const segments: Segment[] = cutPts.map((cp) => ({
      id: makeSegmentId(),
      start_s: cp.start_s,
      end_s: cp.end_s,
      effects: { ...DEFAULT_EFFECTS, ...((timeline.effects as Partial<SegmentEffects>) || {}) },
    }));

    // If no cut points, create one full segment
    if (segments.length === 0 && dur > 0) {
      segments.push({
        id: makeSegmentId(),
        start_s: 0,
        end_s: dur,
        effects: { ...DEFAULT_EFFECTS },
      });
    }

    set({
      clipId,
      durationS: dur,
      cutPoints: cutPts,
      effects: { ...DEFAULT_EFFECTS, ...((timeline.effects as Partial<SegmentEffects>) || {}) },
      segments,
      zoomEvents: (timeline.zoomEvents as TimelineState["zoomEvents"]) || [],
      speedRamps: (timeline.speedRamps as TimelineState["speedRamps"]) || [],
      isModified: false,
      selectedSegmentIndex: 0,
      selectedSegmentId: segments[0]?.id ?? null,
      undoStack: [],
      redoStack: [],
    });
  },

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
    set((state) => {
      const newEffects = { ...state.effects, ...effects };
      // Also update the selected segment's effects
      const segments = state.segments.map((s) =>
        s.id === state.selectedSegmentId ? { ...s, effects: { ...s.effects, ...effects } } : s
      );
      return { effects: newEffects, segments, isModified: true };
    }),

  setSelectedSegment: (index) => set((state) => {
    const seg = state.segments[index];
    return {
      selectedSegmentIndex: index,
      selectedSegmentId: seg?.id ?? null,
      effects: seg?.effects ?? state.effects,
    };
  }),

  selectSegmentById: (id) => set((state) => {
    const idx = state.segments.findIndex((s) => s.id === id);
    const seg = idx >= 0 ? state.segments[idx] : null;
    return {
      selectedSegmentId: id,
      selectedSegmentIndex: idx >= 0 ? idx : state.selectedSegmentIndex,
      effects: seg?.effects ?? state.effects,
    };
  }),

  setExporting: (isExporting, progress) =>
    set({ isExporting, exportProgress: progress ?? 0 }),

  setPlayhead: (time) => set({ playheadS: time }),

  setTimelineZoom: (zoom) => set({ timelineZoom: Math.max(1, Math.min(10, zoom)) }),

  splitAtPlayhead: () => {
    const state = get();
    const t = state.playheadS;
    // Find the segment containing the playhead
    const idx = state.segments.findIndex((s) => t > s.start_s && t < s.end_s);
    if (idx < 0) return;

    // Push undo before modifying
    state.pushUndo();

    const seg = state.segments[idx];
    const left: Segment = {
      id: seg.id,
      start_s: seg.start_s,
      end_s: t,
      effects: { ...seg.effects },
    };
    const right: Segment = {
      id: makeSegmentId(),
      start_s: t,
      end_s: seg.end_s,
      effects: { ...seg.effects },
    };

    const newSegments = [...state.segments];
    newSegments.splice(idx, 1, left, right);

    // Rebuild cut points
    const cutPoints = newSegments.map((s) => ({ start_s: s.start_s, end_s: s.end_s }));

    set({
      segments: newSegments,
      cutPoints,
      isModified: true,
      selectedSegmentId: right.id,
      selectedSegmentIndex: idx + 1,
    });
  },

  deleteSegment: (id) => {
    const state = get();
    if (state.segments.length <= 1) return; // Cannot delete the last segment

    state.pushUndo();

    const newSegments = state.segments.filter((s) => s.id !== id);
    const cutPoints = newSegments.map((s) => ({ start_s: s.start_s, end_s: s.end_s }));

    // Select the previous or first segment
    const newSelected = newSegments[0];

    set({
      segments: newSegments,
      cutPoints,
      isModified: true,
      selectedSegmentId: newSelected?.id ?? null,
      selectedSegmentIndex: 0,
      effects: newSelected?.effects ?? state.effects,
    });
  },

  pushUndo: () =>
    set((state) => ({
      undoStack: [...state.undoStack.slice(-49), snapshot(state)],
      redoStack: [],
    })),

  undo: () =>
    set((state) => {
      if (state.undoStack.length === 0) return state;
      const prev = state.undoStack[state.undoStack.length - 1];
      const newUndo = state.undoStack.slice(0, -1);
      const cutPoints = prev.segments.map((s) => ({ start_s: s.start_s, end_s: s.end_s }));
      const sel = prev.segments.find((s) => s.id === prev.selectedSegmentId);
      return {
        undoStack: newUndo,
        redoStack: [...state.redoStack, snapshot(state)],
        segments: prev.segments,
        cutPoints,
        selectedSegmentId: prev.selectedSegmentId,
        selectedSegmentIndex: Math.max(0, prev.segments.findIndex((s) => s.id === prev.selectedSegmentId)),
        effects: sel?.effects ?? state.effects,
        isModified: true,
      };
    }),

  redo: () =>
    set((state) => {
      if (state.redoStack.length === 0) return state;
      const next = state.redoStack[state.redoStack.length - 1];
      const newRedo = state.redoStack.slice(0, -1);
      const cutPoints = next.segments.map((s) => ({ start_s: s.start_s, end_s: s.end_s }));
      const sel = next.segments.find((s) => s.id === next.selectedSegmentId);
      return {
        redoStack: newRedo,
        undoStack: [...state.undoStack, snapshot(state)],
        segments: next.segments,
        cutPoints,
        selectedSegmentId: next.selectedSegmentId,
        selectedSegmentIndex: Math.max(0, next.segments.findIndex((s) => s.id === next.selectedSegmentId)),
        effects: sel?.effects ?? state.effects,
        isModified: true,
      };
    }),

  reset: () =>
    set({
      clipId: null,
      durationS: 0,
      cutPoints: [],
      effects: DEFAULT_EFFECTS,
      segments: [],
      zoomEvents: [],
      speedRamps: [],
      isModified: false,
      isExporting: false,
      exportProgress: 0,
      selectedSegmentIndex: 0,
      selectedSegmentId: null,
      timelineZoom: 1,
      playheadS: 0,
      undoStack: [],
      redoStack: [],
    }),
}));
