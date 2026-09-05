import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";

import { AddressFallback } from "./AddressFallback";
import type { GeocodeResult } from "@/lib/geocoding";

const result: GeocodeResult = {
  id: "fallback-demo-center",
  label: "강남역",
  address: "확실한 정보 없음",
  position: { lat: 37.4979, lng: 127.0276 },
  source: "FALLBACK",
};

describe("AddressFallback", () => {
  test("shows validation feedback for a one-character query", async () => {
    const user = userEvent.setup();

    render(<AddressFallback onSelect={vi.fn()} geocode={vi.fn()} />);
    await user.type(screen.getByLabelText("주소 또는 장소명"), "역");
    await user.click(screen.getByRole("button", { name: "주소 검색" }));

    expect(screen.getByRole("alert")).toHaveTextContent("2글자 이상");
  });

  test("uses a region-neutral address example", () => {
    render(<AddressFallback onSelect={vi.fn()} geocode={vi.fn()} />);

    expect(screen.getByLabelText("주소 또는 장소명")).not.toHaveAttribute(
      "placeholder",
      expect.stringMatching(/서울|강남|역삼|탄천/),
    );
  });

  test("lets the user select a geocoding result", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const geocode = vi.fn().mockResolvedValue([result]);

    render(<AddressFallback onSelect={onSelect} geocode={geocode} />);
    await user.type(screen.getByLabelText("주소 또는 장소명"), "강남역");
    await user.click(screen.getByRole("button", { name: "주소 검색" }));
    await user.click(await screen.findByRole("button", { name: /강남역/ }));

    expect(geocode).toHaveBeenCalledWith("강남역");
    expect(onSelect).toHaveBeenCalledWith(result);
  });
});
