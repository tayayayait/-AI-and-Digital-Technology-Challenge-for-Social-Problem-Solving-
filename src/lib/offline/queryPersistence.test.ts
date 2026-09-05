import { describe, expect, it } from "vitest";
import {
  OFFLINE_CACHE_MAX_AGE_MS,
  getSafeStorage,
  roundLocationForStorage,
  sanitizePersistedClient,
  shouldPersistOfflineQuery,
} from "./queryPersistence";

describe("offline query persistence", () => {
  it("limits cache age to 24 hours and only includes citizen safety data", () => {
    expect(OFFLINE_CACHE_MAX_AGE_MS).toBe(24 * 60 * 60 * 1_000);
    expect(shouldPersistOfflineQuery({ queryKey: ["shelters"] })).toBe(true);
    // Exact route geometry stays out of Query persistence; a rounded snapshot lives in Zustand.
    expect(shouldPersistOfflineQuery({ queryKey: ["routes"] })).toBe(false);
    expect(shouldPersistOfflineQuery({ queryKey: ["ai-advice"] })).toBe(true);
    expect(shouldPersistOfflineQuery({ queryKey: ["operator-access"] })).toBe(false);
    expect(shouldPersistOfflineQuery({ queryKey: ["unrelated-query"] })).toBe(false);
  });

  it("rounds a user location to administrative-neighborhood precision", () => {
    expect(roundLocationForStorage({ lat: 37.4979123, lng: 127.0276123 })).toEqual({
      lat: 37.498,
      lng: 127.028,
    });
  });

  it("removes exact coordinates from persisted route results without mutating the live cache", () => {
    const client = {
      timestamp: 1,
      buster: "v1",
      clientState: {
        mutations: [],
        queries: [
          {
            queryKey: ["routes", "37.498", "127.028"],
            queryHash: "routes-hash",
            state: {
              data: {
                routes: [
                  {
                    geometry: [
                      { lat: 37.4979123, lng: 127.0276123 },
                      { lat: 37.5012444, lng: 127.0312555 },
                    ],
                  },
                ],
              },
            },
          },
        ],
      },
    };

    const sanitized = sanitizePersistedClient(client);
    expect(sanitized.clientState.queries[0].state.data.routes[0].geometry).toEqual([
      { lat: 37.498, lng: 127.028 },
      { lat: 37.501, lng: 127.031 },
    ]);
    expect(client.clientState.queries[0].state.data.routes[0].geometry[0].lat).toBe(37.4979123);
  });

  it("falls back to in-memory storage when localStorage access throws", () => {
    const storage = getSafeStorage(() => {
      throw new DOMException("blocked", "SecurityError");
    });

    expect(() => storage.setItem("key", "value")).not.toThrow();
    expect(storage.getItem("key")).toBe("value");
  });
});
