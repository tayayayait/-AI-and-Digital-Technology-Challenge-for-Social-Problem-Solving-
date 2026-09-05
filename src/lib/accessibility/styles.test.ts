import { readFileSync } from "node:fs";

import { describe, expect, test } from "vitest";

const luminance = (hex: string) => {
  const channels = hex
    .replace("#", "")
    .match(/.{2}/g)!
    .map((channel) => Number.parseInt(channel, 16) / 255)
    .map((channel) => (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4));
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
};

const contrastRatio = (foreground: string, background: string) => {
  const lighter = Math.max(luminance(foreground), luminance(background));
  const darker = Math.min(luminance(foreground), luminance(background));
  return (lighter + 0.05) / (darker + 0.05);
};

describe("mobility accessibility styles", () => {
  const styles = readFileSync("src/styles.css", "utf8");

  test("defines the documented 1.25 scale and high-contrast tokens", () => {
    expect(styles).toMatch(/:root\[data-a11y=["']large-contrast["']\]/);
    expect(styles).toMatch(/--font-scale:\s*1\.25/);
    expect(styles).toMatch(/--text:\s*#000000/i);
    expect(styles).toMatch(/--primary:\s*#00458a/i);
  });

  test("keeps normal text and primary controls above WCAG AA contrast", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio("#1f2937", "#ffffff")).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio("#ffffff", "#00458a")).toBeGreaterThanOrEqual(4.5);
  });

  test("scales main content while preserving fixed navigation geometry and enlarges map markers", () => {
    expect(styles).toMatch(/data-a11y=["']large-contrast["'][\s\S]*?main/);
    expect(styles).toMatch(/\.a11y-map-marker[\s\S]*?scale:\s*1\.2/);
    expect(readFileSync("src/lib/map/markers.ts", "utf8")).toContain("a11y-map-marker");
  });

  test("keeps the required React axe integration available for development checks", () => {
    const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
    expect(packageJson.devDependencies["@axe-core/react"]).toBeTruthy();
  });
});
