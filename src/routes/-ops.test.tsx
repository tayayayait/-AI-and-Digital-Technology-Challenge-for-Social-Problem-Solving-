import { describe, expect, test } from "vitest";

import { shouldRedirectOpsIndex } from "./ops";

describe("ops route nesting", () => {
  test("redirects only the empty operations index to the risk-zone screen", () => {
    expect(shouldRedirectOpsIndex("/ops")).toBe(true);
    expect(shouldRedirectOpsIndex("/ops/risk-zones")).toBe(false);
    expect(shouldRedirectOpsIndex("/ops/data-health")).toBe(false);
  });
});
