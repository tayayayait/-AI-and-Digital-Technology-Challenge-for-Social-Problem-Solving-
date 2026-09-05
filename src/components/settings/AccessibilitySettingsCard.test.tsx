import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { AccessibilityModeSync } from "@/components/layout/AccessibilityModeSync";
import { AccessibilitySettingsCard } from "@/components/settings/AccessibilitySettingsCard";
import { useAccessibility } from "@/store/accessibility";

describe("AccessibilitySettingsCard", () => {
  beforeEach(() => {
    localStorage.clear();
    useAccessibility.setState({ mobilityMode: false });
    document.documentElement.removeAttribute("data-a11y");
  });

  afterEach(() => {
    document.documentElement.removeAttribute("data-a11y");
  });

  test("enables the large high-contrast mobility profile and syncs the root attribute", async () => {
    const user = userEvent.setup();
    render(
      <>
        <AccessibilityModeSync />
        <AccessibilitySettingsCard />
      </>,
    );

    const toggle = screen.getByRole("switch", { name: "이동약자 모드" });
    expect(toggle).toHaveAttribute("aria-checked", "false");

    await user.click(toggle);

    expect(toggle).toHaveAttribute("aria-checked", "true");
    expect(screen.getByText(/45m\/분/)).toBeInTheDocument();
    expect(screen.getByText(/계단 회피/)).toBeInTheDocument();
    await waitFor(() =>
      expect(document.documentElement).toHaveAttribute("data-a11y", "large-contrast"),
    );
  });

  test("removes the root accessibility profile when switched off", async () => {
    const user = userEvent.setup();
    useAccessibility.setState({ mobilityMode: true });
    render(
      <>
        <AccessibilityModeSync />
        <AccessibilitySettingsCard />
      </>,
    );

    await waitFor(() =>
      expect(document.documentElement).toHaveAttribute("data-a11y", "large-contrast"),
    );
    await user.click(screen.getByRole("switch", { name: "이동약자 모드" }));

    await waitFor(() => expect(document.documentElement).not.toHaveAttribute("data-a11y"));
  });
});
