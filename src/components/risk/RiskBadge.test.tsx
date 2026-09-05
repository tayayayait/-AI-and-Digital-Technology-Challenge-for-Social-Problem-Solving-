import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RiskBadge } from "./RiskBadge";

describe("RiskBadge", () => {
  it("keeps the last risk label but lowers stale offline data to gray", () => {
    render(<RiskBadge level="SAFE" stale />);

    const badge = screen.getByRole("status", { name: /정보가 오래된 마지막 위험도: 안전/ });
    expect(badge).toHaveStyle({
      background: "var(--risk-unknown-bg)",
      color: "var(--risk-unknown-text)",
    });
    expect(badge).toHaveTextContent("안전");
  });
});
