import { create } from "zustand";

interface Job {
  id: string;
  status: "pending" | "processing" | "completed" | "failed";
  progress: string;
  clips: Clip[];
}

interface Clip {
  id: string;
  title: string;
  duration_s: number;
  mood: string;
  url?: string;
  scores: Record<string, number>;
}

interface AppState {
  currentJob: Job | null;
  setCurrentJob: (job: Job | null) => void;
  updateJobProgress: (progress: string) => void;
  updateJobStatus: (status: Job["status"]) => void;
}

export const useAppStore = create<AppState>((set) => ({
  currentJob: null,
  setCurrentJob: (job) => set({ currentJob: job }),
  updateJobProgress: (progress) =>
    set((state) => ({
      currentJob: state.currentJob
        ? { ...state.currentJob, progress }
        : null,
    })),
  updateJobStatus: (status) =>
    set((state) => ({
      currentJob: state.currentJob
        ? { ...state.currentJob, status }
        : null,
    })),
}));
