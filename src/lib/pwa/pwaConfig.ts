import type { VitePWAOptions } from "vite-plugin-pwa";

const appShellRevision =
  process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.GITHUB_SHA ?? new Date().toISOString();

export const pwaOptions = {
  registerType: "prompt",
  injectRegister: null,
  // Nitro's Vercel preset serves this directory; the default output is not deployed.
  outDir: ".vercel/output/static",
  manifest: {
    name: "침수퇴로 AI",
    short_name: "침수퇴로",
    description: "침수 위험 상황에서 가장 안전한 대피소와 퇴로를 안내합니다",
    lang: "ko",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#0b6fd1",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icons/maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  },
  workbox: {
    importScripts: ["/push-sw.js"],
    globPatterns: ["**/*.{js,css,html,woff2}"],
    // TanStack Start is SSR and has no built index.html. Precache the rendered root instead.
    additionalManifestEntries: [{ url: "/", revision: appShellRevision }],
    navigateFallback: "/",
    navigateFallbackDenylist: [/^\/api/, /^\/functions/],
    runtimeCaching: [
      {
        urlPattern: /\/data\/.*\.json$/,
        handler: "StaleWhileRevalidate",
        options: {
          cacheName: "static-data",
          expiration: { maxAgeSeconds: 604_800 },
        },
      },
      {
        urlPattern: /^https:\/\/.*\.map\.naver\.(com|net)\/.*/,
        handler: "CacheFirst",
        options: {
          cacheName: "map-tiles",
          expiration: { maxEntries: 300, maxAgeSeconds: 86_400 },
        },
      },
    ],
  },
  devOptions: { enabled: false },
} satisfies Partial<VitePWAOptions>;
