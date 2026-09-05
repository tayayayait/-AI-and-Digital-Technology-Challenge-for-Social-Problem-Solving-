import { render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { BottomTabs } from "./BottomTabs";

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
  useLocation: () => ({ pathname: "/" }),
}));

describe("BottomTabs", () => {
  test("reserves safe-area space for mobile fixed navigation", () => {
    render(<BottomTabs />);

    const nav = screen.getByRole("navigation", { name: "주요 메뉴" });
    const navStyle = nav.getAttribute("style");

    expect(navStyle).toContain("height: calc(64px + env(safe-area-inset-bottom))");
    expect(nav).toHaveClass("pb-[env(safe-area-inset-bottom)]");
  });

  test("exposes the six-hour outlook from the primary navigation", () => {
    render(<BottomTabs />);

    expect(screen.getByRole("link", { name: /전망/ })).toHaveAttribute("href", "/forecast");
    expect(screen.queryByRole("link", { name: /현장/ })).not.toBeInTheDocument();
  });

  test("does not expose route comparison as a primary navigation item", () => {
    render(<BottomTabs />);

    expect(screen.queryByRole("link", { name: /경로/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /홈/ })).toHaveAttribute("href", "/");
  });
});
