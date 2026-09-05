import { beforeEach, describe, expect, test } from "vitest";

import { ACCESSIBILITY_STORAGE_KEY, useAccessibility } from "@/store/accessibility";

describe("accessibility store", () => {
  beforeEach(() => {
    localStorage.clear();
    useAccessibility.setState({ mobilityMode: false });
  });

  test("persists mobility mode for the next visit", () => {
    useAccessibility.getState().setMobilityMode(true);

    expect(useAccessibility.getState().mobilityMode).toBe(true);
    expect(JSON.parse(localStorage.getItem(ACCESSIBILITY_STORAGE_KEY) ?? "{}")).toMatchObject({
      state: { mobilityMode: true },
    });
  });
});
