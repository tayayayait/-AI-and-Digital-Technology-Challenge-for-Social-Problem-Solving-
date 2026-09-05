import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { supabase } from "@/integrations/supabase/client";
import { NoticeGenerator } from "./NoticeGenerator";

const reportApiHealthMock = vi.hoisted(() => vi.fn());

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: { invoke: vi.fn() },
  },
}));

vi.mock("@/store/apiHealth", () => ({
  API_HEALTH_SOURCE_NAMES: { geminiNotice: "Gemini 안내문" },
  useApiHealthStore: {
    getState: () => ({ report: reportApiHealthMock }),
  },
}));

const invoke = vi.mocked(supabase.functions.invoke);
const props = {
  region: "부산 해운대구",
  riskLevel: "WARNING" as const,
  riskFactors: ["침수흔적 중첩"],
  recommendedAction: "침수 구간을 피해 지상 대피소로 이동하세요.",
  dataTimestamp: "2026-09-03T04:00:00.000Z",
  allowedProperNouns: ["부산 해운대구", "해운대구", "지상 대피소"],
};

describe("NoticeGenerator API health", () => {
  beforeEach(() => {
    invoke.mockReset();
    reportApiHealthMock.mockReset();
  });

  test("Gemini 안내문 생성 성공을 OK와 체감시간으로 보고한다", async () => {
    const summary = `${props.region} 침수 위험입니다. ${props.recommendedAction} 기준시각 ${props.dataTimestamp}`;
    invoke.mockResolvedValue({
      data: { summary, timestamp: props.dataTimestamp, verified: true },
      error: null,
    });

    render(<NoticeGenerator {...props} />);
    await userEvent.click(screen.getByRole("button", { name: "안내문 생성" }));

    await waitFor(() => expect(screen.getByDisplayValue(summary)).toBeInTheDocument());
    expect(reportApiHealthMock).toHaveBeenCalledWith(
      "Gemini 안내문",
      expect.objectContaining({ status: "OK" }),
      expect.any(Number),
    );
  });

  test("Gemini 호출 실패를 FAILED로 보고하고 규칙 기반 안내문을 유지한다", async () => {
    invoke.mockResolvedValue({
      data: null,
      error: { message: "Vertex AI unavailable" },
    });

    render(<NoticeGenerator {...props} />);
    await userEvent.click(screen.getByRole("button", { name: "안내문 생성" }));

    await waitFor(() =>
      expect(screen.getByText(/규칙 기반 안내문을 사용합니다/)).toBeInTheDocument(),
    );
    expect(reportApiHealthMock).toHaveBeenCalledWith(
      "Gemini 안내문",
      expect.objectContaining({ status: "FAILED", error: "Vertex AI unavailable" }),
      expect.any(Number),
    );
  });

  test("부산 안내문에 서울·강남을 전역 허용하지 않는다", async () => {
    const leaked = `${props.region} 침수 위험입니다. 서울 강남구 주민센터를 확인하세요. ${props.recommendedAction} 기준시각 ${props.dataTimestamp}`;
    invoke.mockResolvedValue({
      data: { summary: leaked, timestamp: props.dataTimestamp, verified: true },
      error: null,
    });

    render(<NoticeGenerator {...props} />);
    await userEvent.click(screen.getByRole("button", { name: "안내문 생성" }));

    await waitFor(() =>
      expect(screen.getByText(/규칙 기반 안내문을 사용합니다/)).toBeInTheDocument(),
    );
    expect(screen.getByRole("textbox")).not.toHaveValue(expect.stringMatching(/서울|강남/));
  });
});
