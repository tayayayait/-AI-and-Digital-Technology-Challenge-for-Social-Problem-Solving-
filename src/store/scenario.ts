import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { ApiStatus } from "@/lib/api/types";
import {
  DEFAULT_SCENARIO_PRESET_ID,
  getScenarioPreset,
  type ScenarioPresetId,
} from "@/lib/scenario/presets";
import type {
  RiskLevel,
  LatLng,
  LocationStatus,
  RiskScoreBreakdown,
  RouteResult,
  Shelter,
} from "@/lib/types";
import { DEMO_CENTER } from "@/mocks/data";
import { scoreToLevel } from "@/lib/risk";
import { getSafeStorage, roundLocationForStorage } from "@/lib/offline/queryPersistence";

export interface OfflineRecommendation {
  shelter: Shelter;
  route: RouteResult | null;
  actionTitle: string;
  actionBody: string;
  confirmedAt: string;
}

export interface ScenarioState {
  hasHydrated: boolean;
  setHasHydrated: (hydrated: boolean) => void;
  scenarioPresetId: ScenarioPresetId;
  riskLevel: RiskLevel;
  riskScore: number;
  apiStatus: ApiStatus;
  wmsStatus: ApiStatus;
  geminiStatus: ApiStatus;
  speechEnabled: boolean;
  setSpeechEnabled: (enabled: boolean) => void;
  setScenarioPreset: (id: ScenarioPresetId) => void;
  setScenario: (level: RiskLevel) => void;
  setRiskScore: (score: number) => void;
  setRiskAssessment: (assessment: Pick<RiskScoreBreakdown, "total" | "level">) => void;
  lastConfirmedAt: string | null;
  setLastConfirmedAt: (timestamp: string | null) => void;
  lastRecommendation: OfflineRecommendation | null;
  setLastRecommendation: (recommendation: OfflineRecommendation | null) => void;

  origin: LatLng;
  setOrigin: (p: LatLng) => void;

  locationStatus: LocationStatus;
  setLocationStatus: (s: LocationStatus) => void;
}

const SCORE_BY_LEVEL: Record<RiskLevel, number> = {
  SAFE: 12,
  WATCH: 38,
  WARNING: 59,
  CRITICAL: 86,
  UNKNOWN: -1,
};

const defaultPreset = getScenarioPreset(DEFAULT_SCENARIO_PRESET_ID);

type PersistableScenarioInput = Pick<
  ScenarioState,
  | "origin"
  | "locationStatus"
  | "riskLevel"
  | "riskScore"
  | "speechEnabled"
  | "lastConfirmedAt"
  | "lastRecommendation"
>;

export interface PersistedScenarioState {
  origin: LatLng;
  locationStatus: LocationStatus;
  riskLevel: RiskLevel;
  riskScore: number;
  speechEnabled: boolean;
  lastConfirmedAt: string | null;
  lastRecommendation: OfflineRecommendation | null;
}

const sanitizeRecommendation = (
  recommendation: OfflineRecommendation | null,
): OfflineRecommendation | null => {
  if (!recommendation) return null;
  return {
    ...recommendation,
    shelter: {
      ...recommendation.shelter,
      position: roundLocationForStorage(recommendation.shelter.position),
    },
    route: recommendation.route
      ? {
          ...recommendation.route,
          geometry: recommendation.route.geometry.map(roundLocationForStorage),
        }
      : null,
  };
};

export const toPersistedScenario = (state: PersistableScenarioInput): PersistedScenarioState => ({
  origin: roundLocationForStorage(state.origin),
  locationStatus: state.locationStatus,
  riskLevel: state.riskLevel,
  riskScore: state.riskScore,
  speechEnabled: state.speechEnabled,
  lastConfirmedAt: state.lastConfirmedAt,
  lastRecommendation: sanitizeRecommendation(state.lastRecommendation),
});

const isLocationStatus = (value: unknown): value is LocationStatus =>
  value === "GRANTED" || value === "DENIED" || value === "PROMPT" || value === "ERROR";

const isRiskLevel = (value: unknown): value is RiskLevel =>
  value === "SAFE" ||
  value === "WATCH" ||
  value === "WARNING" ||
  value === "CRITICAL" ||
  value === "UNKNOWN";

const isLatLng = (value: unknown): value is LatLng => {
  if (!value || typeof value !== "object") return false;
  const location = value as Partial<LatLng>;
  return (
    typeof location.lat === "number" &&
    Number.isFinite(location.lat) &&
    typeof location.lng === "number" &&
    Number.isFinite(location.lng)
  );
};

const safePersistedRecommendation = (value: unknown): OfflineRecommendation | null => {
  if (!value || typeof value !== "object") return null;
  try {
    const recommendation = value as OfflineRecommendation;
    if (
      !recommendation.shelter ||
      !isLatLng(recommendation.shelter.position) ||
      typeof recommendation.actionTitle !== "string" ||
      typeof recommendation.actionBody !== "string" ||
      typeof recommendation.confirmedAt !== "string" ||
      (recommendation.route !== null &&
        (!Array.isArray(recommendation.route?.geometry) ||
          !recommendation.route.geometry.every(isLatLng)))
    ) {
      return null;
    }
    return sanitizeRecommendation(recommendation);
  } catch {
    return null;
  }
};

export const migratePersistedScenario = (persisted: unknown): PersistedScenarioState => {
  const value =
    persisted && typeof persisted === "object" ? (persisted as Record<string, unknown>) : {};
  return {
    origin: isLatLng(value.origin) ? roundLocationForStorage(value.origin) : DEMO_CENTER,
    locationStatus: isLocationStatus(value.locationStatus) ? value.locationStatus : "PROMPT",
    riskLevel: isRiskLevel(value.riskLevel) ? value.riskLevel : defaultPreset.riskLevel,
    riskScore:
      typeof value.riskScore === "number" && Number.isFinite(value.riskScore)
        ? value.riskScore
        : defaultPreset.riskScore,
    speechEnabled: typeof value.speechEnabled === "boolean" ? value.speechEnabled : false,
    lastConfirmedAt: typeof value.lastConfirmedAt === "string" ? value.lastConfirmedAt : null,
    lastRecommendation: safePersistedRecommendation(value.lastRecommendation),
  };
};

export const useScenario = create<ScenarioState>()(
  persist<ScenarioState, [], [], PersistedScenarioState>(
    (set) => ({
      hasHydrated: false,
      setHasHydrated: (hydrated) => set({ hasHydrated: hydrated }),
      scenarioPresetId: defaultPreset.id,
      riskLevel: defaultPreset.riskLevel,
      riskScore: defaultPreset.riskScore,
      apiStatus: defaultPreset.apiStatus,
      wmsStatus: defaultPreset.wmsStatus,
      geminiStatus: defaultPreset.geminiStatus,
      speechEnabled: false,
      setSpeechEnabled: (enabled) => set({ speechEnabled: enabled }),
      setScenarioPreset: (id) => {
        const preset = getScenarioPreset(id);
        set({
          scenarioPresetId: preset.id,
          riskLevel: preset.riskLevel,
          riskScore: preset.riskScore,
          apiStatus: preset.apiStatus,
          wmsStatus: preset.wmsStatus,
          geminiStatus: preset.geminiStatus,
        });
      },
      setScenario: (level) => set({ riskLevel: level, riskScore: SCORE_BY_LEVEL[level] }),
      setRiskScore: (score) => set({ riskScore: score, riskLevel: scoreToLevel(score) }),
      setRiskAssessment: (assessment) =>
        set({ riskScore: assessment.total, riskLevel: assessment.level }),
      lastConfirmedAt: null,
      setLastConfirmedAt: (timestamp) => set({ lastConfirmedAt: timestamp }),
      lastRecommendation: null,
      setLastRecommendation: (recommendation) =>
        set({
          lastRecommendation: sanitizeRecommendation(recommendation),
          lastConfirmedAt: recommendation?.confirmedAt ?? null,
        }),

      origin: DEMO_CENTER,
      setOrigin: (p) => set({ origin: p }),

      locationStatus: "PROMPT",
      setLocationStatus: (s) => set({ locationStatus: s }),
    }),
    {
      name: "chimsu-scenario",
      version: 2,
      storage: createJSONStorage<PersistedScenarioState>(() => getSafeStorage()),
      partialize: toPersistedScenario,
      migrate: (persistedState) => migratePersistedScenario(persistedState),
      merge: (persistedState, currentState) => ({
        ...currentState,
        ...migratePersistedScenario(persistedState),
      }),
      skipHydration: true,
    },
  ),
);
