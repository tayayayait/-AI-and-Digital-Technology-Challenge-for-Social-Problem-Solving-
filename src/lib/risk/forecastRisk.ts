import type { WeatherForecastPoint } from "@/lib/api/types";
import { calculateRiskScore } from "@/lib/risk/calculateRiskScore";
import type { RiskCalculationInput, RiskLevel } from "@/lib/types";

export interface RiskOutlookPoint extends WeatherForecastPoint {
  riskScore: number;
  riskLevel: RiskLevel;
  reasons: string[];
}

export const buildRiskOutlook = ({
  forecast,
  baseInput,
}: {
  forecast: WeatherForecastPoint[];
  baseInput: RiskCalculationInput;
}): RiskOutlookPoint[] =>
  forecast.slice(0, 6).map((point) => {
    const projectedWeather = {
      rainfallMmPerHour: point.rainfallMmPerHour,
      humidityPercent: point.humidityPercent,
      precipitationType: point.precipitationType,
    };
    const assessment = calculateRiskScore({
      ...baseInput,
      weather: projectedWeather,
    });

    return {
      ...point,
      riskScore: assessment.total,
      riskLevel: assessment.level,
      reasons: assessment.reasons,
    };
  });
