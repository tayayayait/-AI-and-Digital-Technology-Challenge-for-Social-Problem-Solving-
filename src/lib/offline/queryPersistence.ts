import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import type { LatLng } from "@/lib/types";

export const OFFLINE_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1_000;
export const OFFLINE_CACHE_BUSTER = "chimsu-offline-v1";

const PERSISTED_QUERY_KEYS = new Set([
  "shelters",
  "ai-advice",
  "weather",
  "weather-warning",
  "disaster-messages",
]);

export const shouldPersistOfflineQuery = ({ queryKey }: { queryKey: readonly unknown[] }) =>
  typeof queryKey[0] === "string" && PERSISTED_QUERY_KEYS.has(queryKey[0]);

const roundCoordinate = (value: number) => Number(value.toFixed(3));

export const roundLocationForStorage = (location: LatLng): LatLng => ({
  lat: roundCoordinate(location.lat),
  lng: roundCoordinate(location.lng),
});

const sanitizeCoordinates = (value: unknown, propertyName?: string): unknown => {
  if (typeof value === "number" && (propertyName === "lat" || propertyName === "lng")) {
    return roundCoordinate(value);
  }
  if (Array.isArray(value)) return value.map((item) => sanitizeCoordinates(item));
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, sanitizeCoordinates(item, key)]),
  );
};

interface PersistedClientShape {
  clientState: {
    queries: Array<{
      queryKey: readonly unknown[];
      state: { data?: unknown };
    }>;
  };
}

export const sanitizePersistedClient = <T extends PersistedClientShape>(client: T): T =>
  ({
    ...client,
    clientState: {
      ...client.clientState,
      queries: client.clientState.queries.map((query) =>
        query.queryKey[0] === "routes"
          ? {
              ...query,
              state: {
                ...query.state,
                data: sanitizeCoordinates(query.state.data),
              },
            }
          : query,
      ),
    },
  }) as T;

const createMemoryStorage = (): Storage => {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, String(value)),
  };
};

export const getSafeStorage = (
  storageFactory: () => Storage = () => {
    if (typeof window === "undefined") return createMemoryStorage();
    return window.localStorage;
  },
): Storage => {
  try {
    const storage = storageFactory();
    const probeKey = "__chimsu_storage_probe__";
    storage.setItem(probeKey, "1");
    storage.removeItem(probeKey);
    return storage;
  } catch {
    return createMemoryStorage();
  }
};

export const createOfflineQueryPersister = () =>
  createSyncStoragePersister({
    storage: getSafeStorage(),
    key: "chimsu-query-cache",
    throttleTime: 1_000,
    serialize: (client) => JSON.stringify(sanitizePersistedClient(client)),
    deserialize: (value) => JSON.parse(value),
  });

export type OfflineQueryPersister = ReturnType<typeof createOfflineQueryPersister>;
