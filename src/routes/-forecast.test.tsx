import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { useScenario } from "@/store/scenario";
import { Route } from "./forecast";

const useRiskAssessmentMock = vi.hoisted(() =>
  vi.fn((_origin: unknown) => ({
    riskOutlook: [
      {
        forecastAt: "2026-06-11T16:00:00+09:00",
        rainfallMmPerHour: 30,
        precipitationProbabilityPercent: 80,
        precipitationType: "rain",
        riskScore: 55,
        riskLevel: "WARNING",
        reasons: ["강우·기상특보 위험"],
      },
    ],
    weather: {
      observedAt: "20260611T1500",
      rainfallMmPerHour: 0,
      alerts: [],
      hourlyForecast: [],
    },
  })),
);

vi.mock("@/hooks/useRiskAssessment", () => ({
  useRiskAssessment: (origin: unknown) => useRiskAssessmentMock(origin),
}));

const ForecastPage = Route.options.component!;

describe("ForecastPage", () => {
  beforeEach(() => {
    useRiskAssessmentMock.mockClear();
    useScenario.setState({
      origin: { lat: 37.5665, lng: 126.978 },
      locationStatus: "GRANTED",
    });
  });

  test("renders the selected location's six-hour risk outlook", () => {
    render(<ForecastPage />);

    expect(screen.getByRole("heading", { name: "앞으로 6시간 위험 전망" })).toBeInTheDocument();
    expect(screen.getByText("예상 경계")).toBeInTheDocument();
    expect(useRiskAssessmentMock).toHaveBeenCalledWith({ lat: 37.5665, lng: 126.978 });
  });
});
