import { existsSync, readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { pwaOptions } from "./pwaConfig";

describe("PWA manifest availability", () => {
  it("serves the configured manifest as a static asset during local development", () => {
    const manifestPath = "public/manifest.webmanifest";

    expect(
      existsSync(manifestPath),
      "The root route requests /manifest.webmanifest, so public/manifest.webmanifest must exist in dev",
    ).toBe(true);

    const staticManifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    expect(staticManifest).toEqual(pwaOptions.manifest);
  });
});
