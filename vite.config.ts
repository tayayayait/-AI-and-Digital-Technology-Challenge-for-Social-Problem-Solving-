// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, nitro (build-only using cloudflare as a default target),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig as lovableDefineConfig } from "@lovable.dev/vite-tanstack-config";
import type { ConfigEnv, PluginOption } from "vite";
import { VitePWA } from "vite-plugin-pwa";
import { pwaOptions } from "./src/lib/pwa/pwaConfig";

const baseConfigFn = lovableDefineConfig({
  vite: {
    plugins: [VitePWA(pwaOptions)],
    resolve: {
      tsconfigPaths: true,
    },
  },
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  nitro: {
    preset: "vercel",
  },
});

const flattenPluginOptions = (plugins: readonly PluginOption[]): PluginOption[] => {
  const flattened: PluginOption[] = [];
  const visit = (plugin: PluginOption) => {
    if (Array.isArray(plugin)) {
      plugin.forEach(visit);
      return;
    }
    flattened.push(plugin);
  };
  plugins.forEach(visit);
  return flattened;
};

const isTsconfigPathsPlugin = (plugin: PluginOption) => {
  if (!plugin || typeof plugin !== "object" || !("name" in plugin)) return false;
  const name = (plugin as { name?: unknown }).name;
  return name === "vite-tsconfig-paths" || name === "vite-plugin-tsconfig-paths";
};

export default async (env: ConfigEnv) => {
  const config = await baseConfigFn(env);
  // Vite 8부터 tsconfig paths를 resolve.tsconfigPaths로 네이티브 지원하므로,
  // 중복 감지 경고를 발생시키는 외부 vite-tsconfig-paths 플러그인을 제거합니다.
  if (Array.isArray(config.plugins)) {
    config.plugins = flattenPluginOptions(config.plugins).filter(
      (plugin) => !isTsconfigPathsPlugin(plugin),
    );
  }
  return config;
};
