import type { ApiResult } from "./types";
import type { LatLng, RouteMode } from "@/lib/types";

export const API_CACHE_TTL_MS = {
  SHELTERS: 24 * 60 * 60 * 1000,
  WMS_METADATA: 6 * 60 * 60 * 1000,
  WEATHER_CURRENT: 10 * 60 * 1000,
  WEATHER_ALERT: 30 * 60 * 1000,
  DISASTER_MESSAGES: 60 * 1000,
  TRAFFIC_EVENTS: 60 * 1000,
  ROUTE: 5 * 60 * 1000,
  GEMINI: 30 * 60 * 1000,
} as const;

interface CacheEntry<T> {
  result: ApiResult<T>;
  expiresAt: number;
}

export interface ApiCache {
  set<T>(key: string, result: ApiResult<T>, ttlMs: number): void;
  getFresh<T>(key: string): ApiResult<T> | null;
  getStale<T>(key: string): ApiResult<T> | null;
  clear(): void;
}

export const createApiCache = (now: () => number = () => Date.now()): ApiCache => {
  const store = new Map<string, CacheEntry<unknown>>();

  return {
    set<T>(key: string, result: ApiResult<T>, ttlMs: number) {
      if (store.size >= 100) {
        const oldestKey = store.keys().next().value;
        if (oldestKey) store.delete(oldestKey);
      }
      store.set(key, { result, expiresAt: now() + ttlMs });
    },

    getFresh<T>(key: string) {
      const entry = store.get(key) as CacheEntry<T> | undefined;
      if (!entry) return null;
      if (entry.expiresAt < now()) return null;
      return entry.result;
    },

    getStale<T>(key: string) {
      const entry = store.get(key) as CacheEntry<T> | undefined;
      return entry?.result ?? null;
    },

    clear() {
      store.clear();
    },
  };
};

const formatCoordinate = ({ lat, lng }: LatLng) => `${lat.toFixed(5)},${lng.toFixed(5)}`;

export const buildRouteCacheKey = ({
  origin,
  destination,
  mode,
  sourceVersion,
}: {
  origin: LatLng;
  destination: LatLng;
  mode: RouteMode;
  sourceVersion: string;
}) => `route:${mode}:${formatCoordinate(origin)}:${formatCoordinate(destination)}:${sourceVersion}`;
