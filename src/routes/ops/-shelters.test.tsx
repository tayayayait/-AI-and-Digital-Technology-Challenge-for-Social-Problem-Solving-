import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import type { Shelter } from "@/lib/types";
import { Route } from "./shelters";

const useSheltersMock = vi.hoisted(() => vi.fn());

vi.mock("@/hooks/useShelters", () => ({
  useShelters: (...args: unknown[]) => useSheltersMock(...args),
}));

vi.mock("@/store/scenario", () => ({
  useScenario: () => ({ origin: { lat: 35.165, lng: 129.165 } }),
}));

vi.mock("@/components/ops/OpsLayout", () => ({
  OpsLayout: ({ children, detail }: { children: React.ReactNode; detail: React.ReactNode }) => (
    <div>
      <main>{children}</main>
      <aside>{detail}</aside>
    </div>
  ),
}));

const shelter: Shelter = {
  id: "busan-shelter",
  name: "해운대구 문화복합센터",
  address: "부산 해운대구 센텀중앙로 170",
  position: { lat: 35.165, lng: 129.165 },
  capacity: 1200,
  status: "OPERATING",
  underground: false,
  type: "지자체 대피시설",
};

const OpsSheltersPage = Route.options.component!;

beforeEach(() => {
  useSheltersMock.mockReset();
  useSheltersMock.mockReturnValue({ shelters: [shelter], isLoading: false, error: null });
});

describe("Ops shelters", () => {
  test("API가 확인 시각을 제공하지 않으면 운영중으로 추정하지 않고 확인필요로 표시한다", () => {
    render(<OpsSheltersPage />);

    expect(screen.getByText("해운대구 문화복합센터")).toBeInTheDocument();
    expect(screen.getByText(/수용 1,200명 · 확인필요/)).toBeInTheDocument();
    expect(
      screen.getByText("최근 확인 확실한 정보 없음 · 출처 이재민 임시주거시설 데이터"),
    ).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/2026-|행정안전부 API 연동/);
  });

  test("실제 조회 결과가 비어 있으면 빈 상태를 표시한다", () => {
    useSheltersMock.mockReturnValue({ shelters: [], isLoading: false, error: null });

    render(<OpsSheltersPage />);

    expect(screen.getByText("현재 표시할 대피소가 없습니다")).toBeInTheDocument();
  });
});
