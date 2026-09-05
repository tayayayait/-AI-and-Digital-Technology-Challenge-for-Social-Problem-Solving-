import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import type { RiskOutlookPoint } from "@/lib/risk/forecastRisk";
import { RiskForecastPanel } from "./RiskForecastPanel";

const outlook: RiskOutlookPoint[] = [
  {
    forecastAt: "2026-06-11T15:00:00+09:00",
    rainfallMmPerHour: 0,
    precipitationProbabilityPercent: 10,
    precipitationType: "none",
    riskScore: 5,
    riskLevel: "SAFE",
    reasons: ["현재 위치 주변 지하차도"],
  },
  {
    forecastAt: "2026-06-11T16:00:00+09:00",
    rainfallMmPerHour: 30,
    precipitationProbabilityPercent: 80,
    precipitationType: "rain",
    riskScore: 55,
    riskLevel: "WARNING",
    reasons: ["강우·예보 위험", "재난문자 위험지역"],
  },
];

describe("RiskForecastPanel", () => {
  test("shows hourly rain, probability, and expected risk separately from current conditions", () => {
    render(<RiskForecastPanel outlook={outlook} />);

    expect(screen.getByRole("region", { name: "6시간 침수 위험 전망" })).toBeInTheDocument();
    expect(screen.getByText("가장 높은 예상 위험: 경계")).toBeInTheDocument();
    expect(screen.getByText("시간당 30mm")).toBeInTheDocument();
    expect(screen.getByText("강수확률 80%")).toBeInTheDocument();
    expect(screen.getByText("예상 경계")).toBeInTheDocument();
    expect(screen.getByText(/현재 침수 사실을 뜻하지 않습니다/)).toBeInTheDocument();
  });

  test("shows a clear fallback when forecast data is unavailable", () => {
    render(<RiskForecastPanel outlook={[]} />);

    expect(screen.getByRole("status")).toHaveTextContent("기상청 초단기예보를 불러오지 못했습니다");
  });
});
