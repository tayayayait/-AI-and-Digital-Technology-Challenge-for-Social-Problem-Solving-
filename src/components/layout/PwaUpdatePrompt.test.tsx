import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PwaUpdateBanner } from "./PwaUpdateBanner";

describe("PwaUpdateBanner", () => {
  it("stays hidden until a service-worker update is ready", () => {
    render(<PwaUpdateBanner visible={false} onRefresh={vi.fn()} onDismiss={vi.fn()} />);

    expect(screen.queryByText("새 버전이 있습니다")).not.toBeInTheDocument();
  });

  it("refreshes only after the user explicitly accepts the update", () => {
    const onRefresh = vi.fn();
    const onDismiss = vi.fn();
    render(<PwaUpdateBanner visible onRefresh={onRefresh} onDismiss={onDismiss} />);

    expect(screen.getByRole("status")).toHaveTextContent("새 버전이 있습니다");
    fireEvent.click(screen.getByRole("button", { name: "새로고침" }));
    expect(onRefresh).toHaveBeenCalledOnce();
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it("lets the user postpone the update", () => {
    const onDismiss = vi.fn();
    render(<PwaUpdateBanner visible onRefresh={vi.fn()} onDismiss={onDismiss} />);

    fireEvent.click(screen.getByRole("button", { name: "나중에" }));
    expect(onDismiss).toHaveBeenCalledOnce();
  });
});
