import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";

import { EmergencyBar } from "./EmergencyBar";

describe("EmergencyBar", () => {
  test("경로 계산 실패 시 단일 CTA를 대피소 목록 동작으로 바꾼다", async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();

    render(<EmergencyBar variant="shelters" onAction={onAction} />);

    await user.click(
      screen.getByRole("button", {
        name: "경로를 계산할 수 없습니다 · 대피소 목록 보기",
      }),
    );

    expect(onAction).toHaveBeenCalledTimes(1);
  });

  test("대피소 후보가 없으면 단일 CTA를 119 전화 링크로 바꾼다", () => {
    render(<EmergencyBar variant="call" />);

    expect(screen.getByRole("link", { name: "주변 대피소가 없습니다 · 119 신고" })).toHaveAttribute(
      "href",
      "tel:119",
    );
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
