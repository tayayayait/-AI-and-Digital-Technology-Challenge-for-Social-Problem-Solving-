import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { getSafeStorage } from "@/lib/offline/queryPersistence";

export const ACCESSIBILITY_STORAGE_KEY = "chimsu-accessibility";

interface AccessibilityState {
  mobilityMode: boolean;
  setMobilityMode: (enabled: boolean) => void;
}

export const useAccessibility = create<AccessibilityState>()(
  persist(
    (set) => ({
      mobilityMode: false,
      setMobilityMode: (mobilityMode) => set({ mobilityMode }),
    }),
    {
      name: ACCESSIBILITY_STORAGE_KEY,
      version: 1,
      storage: createJSONStorage(() => getSafeStorage()),
      partialize: (state) => ({ mobilityMode: state.mobilityMode }),
    },
  ),
);
