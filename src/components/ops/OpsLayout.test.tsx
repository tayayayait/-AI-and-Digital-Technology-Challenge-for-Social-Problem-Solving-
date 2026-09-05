import { render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { OpsLayout } from "./OpsLayout";

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    className,
    style,
    to,
  }: {
    children: React.ReactNode;
    className?: string;
    style?: React.CSSProperties;
    to: string;
  }) => (
    <a className={className} href={to} style={style}>
      {children}
    </a>
  ),
  useLocation: () => ({ pathname: "/ops" }),
}));

vi.mock("@/lib/auth/useOperatorAccess", () => ({
  useOperatorAccess: () => ({
    status: "unauthenticated",
    message: "not signed in",
    role: null,
  }),
}));

describe("OpsLayout", () => {
  test("renders field information content without requiring operator access", () => {
    render(
      <OpsLayout
        title="현장정보"
        description="모든 시민이 확인하는 재난 현장 정보"
        detail={<div>상세 정보</div>}
      >
        <div>위험지역과 수위 정보</div>
      </OpsLayout>,
    );

    expect(screen.getAllByText("현장정보").length).toBeGreaterThan(0);
    expect(screen.getByText("위험지역과 수위 정보")).toBeInTheDocument();
    expect(screen.queryByText(/권한/)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "위험지역" })).toHaveAttribute(
      "href",
      "/ops/risk-zones",
    );
    expect(screen.getByRole("link", { name: "주민 안내문" })).toHaveAttribute(
      "href",
      "/ops/messages",
    );
    expect(screen.queryByRole("link", { name: "CCTV" })).not.toBeInTheDocument();
  });
});
