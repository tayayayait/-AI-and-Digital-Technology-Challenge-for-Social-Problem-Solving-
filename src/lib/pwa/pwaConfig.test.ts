import { describe, expect, it } from "vitest";
import { pwaOptions } from "./pwaConfig";

describe("pwaOptions", () => {
  it("uses a user-controlled update prompt and a complete Korean manifest", () => {
    expect(pwaOptions.registerType).toBe("prompt");
    expect(pwaOptions.outDir).toBe(".vercel/output/static");
    expect(pwaOptions.devOptions?.enabled).toBe(false);
    expect(pwaOptions.manifest).toMatchObject({
      name: "침수퇴로 AI",
      short_name: "침수퇴로",
      lang: "ko",
      start_url: "/",
      display: "standalone",
      background_color: "#ffffff",
      theme_color: "#0b6fd1",
    });
    expect(pwaOptions.manifest?.icons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ src: "/icons/icon-192.png", sizes: "192x192" }),
        expect.objectContaining({ src: "/icons/icon-512.png", sizes: "512x512" }),
        expect.objectContaining({
          src: "/icons/maskable-512.png",
          sizes: "512x512",
          purpose: "maskable",
        }),
      ]),
    );
  });

  it("caches only static datasets and map tiles at runtime", () => {
    const runtimeCaching = pwaOptions.workbox?.runtimeCaching ?? [];
    expect(runtimeCaching).toHaveLength(2);
    expect(runtimeCaching[0]).toMatchObject({
      handler: "StaleWhileRevalidate",
      options: {
        cacheName: "static-data",
        expiration: { maxAgeSeconds: 604_800 },
      },
    });
    expect(runtimeCaching[1]).toMatchObject({
      handler: "CacheFirst",
      options: {
        cacheName: "map-tiles",
        expiration: { maxEntries: 300, maxAgeSeconds: 86_400 },
      },
    });

    const denylist = pwaOptions.workbox?.navigateFallbackDenylist ?? [];
    expect(pwaOptions.workbox?.navigateFallback).toBe("/");
    expect(pwaOptions.workbox?.additionalManifestEntries).toEqual([
      expect.objectContaining({ url: "/", revision: expect.any(String) }),
    ]);
    expect(denylist.some((pattern) => pattern.test("/api/risk"))).toBe(true);
    expect(denylist.some((pattern) => pattern.test("/functions/weather"))).toBe(true);
  });

  it("loads the user-visible Web Push service worker handlers", () => {
    expect(pwaOptions.workbox?.importScripts).toEqual(["/push-sw.js"]);
  });
});
