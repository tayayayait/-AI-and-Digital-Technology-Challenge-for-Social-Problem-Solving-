import { create } from "zustand";

import {
  CCTV_ANALYSIS_CONFIDENCE_THRESHOLD,
  type CctvAnalysisResult,
} from "@/lib/cctv/cctvAnalysis";

interface CctvAnalysisState {
  analyses: Record<string, CctvAnalysisResult>;
  record: (analysis: CctvAnalysisResult, now?: number) => void;
  pruneExpired: (now?: number) => void;
  reset: () => void;
}

const activeAnalyses = (analyses: Record<string, CctvAnalysisResult>, now: number) =>
  Object.fromEntries(
    Object.entries(analyses).filter(([, analysis]) => new Date(analysis.expiresAt).getTime() > now),
  );

export const useCctvAnalysisStore = create<CctvAnalysisState>((set) => ({
  analyses: {},
  record: (analysis, now = Date.now()) =>
    set((state) => {
      const analyses = activeAnalyses(state.analyses, now);
      if (
        analysis.confidence < CCTV_ANALYSIS_CONFIDENCE_THRESHOLD ||
        new Date(analysis.expiresAt).getTime() <= now
      ) {
        return { analyses };
      }

      return {
        analyses: {
          ...analyses,
          [analysis.cameraId]: analysis,
        },
      };
    }),
  pruneExpired: (now = Date.now()) =>
    set((state) => ({ analyses: activeAnalyses(state.analyses, now) })),
  reset: () => set({ analyses: {} }),
}));
