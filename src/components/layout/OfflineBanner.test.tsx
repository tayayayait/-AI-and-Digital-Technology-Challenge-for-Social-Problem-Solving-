import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { OfflineStatusBanner } from "./OfflineBanner";

const confirmedAt = new Date(2026, 7, 31, 17, 2).toISOString();

describe("OfflineStatusBanner", () => {
  it("stays hidden while the connection is available", () => {
    render(
      <OfflineStatusBanner
        online
        lastConfirmedAt={confirmedAt}
        now={new Date(2026, 7, 31, 17, 25).getTime()}
      />,
    );
    expect(screen.queryByText(/오프라인/)).not.toBeInTheDocument();
  });

  it("shows the last confirmation time and age while offline", () => {
    render(
      <OfflineStatusBanner
        online={false}
        lastConfirmedAt={confirmedAt}
        now={new Date(2026, 7, 31, 17, 25).getTime()}
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent("오프라인 · 마지막 확인 17:02 (23분 전)");
    expect(screen.queryByText("정보가 오래됐습니다")).not.toBeInTheDocument();
  });

  it("warns when the last confirmed data is older than one hour", () => {
    render(
      <OfflineStatusBanner
        online={false}
        lastConfirmedAt={confirmedAt}
        now={new Date(2026, 7, 31, 18, 3).getTime()}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("정보가 오래됐습니다");
  });
});
