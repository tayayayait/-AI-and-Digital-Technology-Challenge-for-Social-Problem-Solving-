import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { useScenario } from "@/store/scenario";
import { SpeechSettingsCard } from "./SpeechSettingsCard";

describe("SpeechSettingsCard", () => {
  beforeEach(() => {
    useScenario.setState({ speechEnabled: false });
  });

  afterEach(() => {
    useScenario.setState({ speechEnabled: false });
  });

  test("자동 음성 안내는 기본적으로 꺼져 있고 사용자가 직접 켠다", () => {
    render(<SpeechSettingsCard />);

    const toggle = screen.getByRole("switch", {
      name: "심각 단계 자동 음성 안내",
    });
    expect(toggle).toHaveAttribute("aria-checked", "false");

    fireEvent.click(toggle);

    expect(toggle).toHaveAttribute("aria-checked", "true");
    expect(useScenario.getState().speechEnabled).toBe(true);
  });

  test("자동 재생 조건과 수동 듣기 범위를 같은 화면에서 설명한다", () => {
    render(<SpeechSettingsCard />);

    expect(
      screen.getByText(/사용자 동작 이후 심각 단계에서 한 번만 자동 재생/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/모든 위험 단계에서 수동으로 다시 들을 수 있습니다/),
    ).toBeInTheDocument();
  });
});
