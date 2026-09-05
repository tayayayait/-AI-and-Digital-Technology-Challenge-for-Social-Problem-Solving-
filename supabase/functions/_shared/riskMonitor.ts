import type { RiskLevel } from "./riskNotification.ts";

export const MAX_SUBSCRIPTIONS_PER_RUN = 1_000;

export const forEachWithConcurrency = async <T>(
  items: readonly T[],
  concurrency: number,
  task: (item: T, index: number) => Promise<void>,
) => {
  if (items.length === 0) return;

  const workerCount = Math.min(items.length, Math.max(1, Math.floor(concurrency)));
  let nextIndex = 0;
  const worker = async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      await task(items[index], index);
    }
  };

  await Promise.all(Array.from({ length: workerCount }, worker));
};

export interface MonitorSubscriptionBase {
  id: string;
  region_lat: number;
  region_lng: number;
}

export const groupSubscriptionsByGrid = <T extends MonitorSubscriptionBase>(rows: T[]) => {
  const groups = new Map<string, T[]>();
  for (const row of rows.slice(0, MAX_SUBSCRIPTIONS_PER_RUN)) {
    const key = `${row.region_lat.toFixed(2)},${row.region_lng.toFixed(2)}`;
    const group = groups.get(key);
    if (group) group.push(row);
    else groups.set(key, [row]);
  }
  return groups;
};

interface MonitoredWeather {
  rainfallMmPerHour?: number;
  hourlyForecast?: Array<{
    forecastAt: string;
    rainfallMmPerHour: number;
  }>;
}

interface MonitoredSensor {
  status?: string;
  riskLevel?: string;
  currentRainfallMmPerHour?: number;
  currentLevel?: number;
  attentionLevel?: number;
  warningLevel?: number;
  alarmLevel?: number;
  seriousLevel?: number;
}

const sensorScore = (sensor: MonitoredSensor) => {
  if (sensor.status !== "ACTIVE") return 0;
  if (sensor.riskLevel === "CRITICAL") return 80;
  if (sensor.riskLevel === "WARNING") return 55;
  if (sensor.riskLevel === "WATCH") return 30;
  if (sensor.currentLevel != null) {
    if (sensor.seriousLevel != null && sensor.currentLevel >= sensor.seriousLevel) return 80;
    if (sensor.alarmLevel != null && sensor.currentLevel >= sensor.alarmLevel) {
      return 80;
    }
    if (sensor.warningLevel != null && sensor.currentLevel >= sensor.warningLevel) return 55;
    if (sensor.attentionLevel != null && sensor.currentLevel >= sensor.attentionLevel) return 30;
  }
  return 0;
};

const scoreToLevel = (score: number): RiskLevel => {
  if (score <= 24) return "SAFE";
  if (score <= 49) return "WATCH";
  if (score <= 74) return "WARNING";
  return "CRITICAL";
};

const RISK_RANK: Record<RiskLevel, number> = {
  UNKNOWN: -1,
  SAFE: 0,
  WATCH: 1,
  WARNING: 2,
  CRITICAL: 3,
};

export const calculateMonitoredRisk = ({
  weather,
  sensors,
  failedSources,
}: {
  weather: MonitoredWeather | null;
  sensors: MonitoredSensor[] | null;
  failedSources: number;
}): RiskLevel => {
  if (failedSources >= 2) return "UNKNOWN";

  const sensorRain = Math.max(
    0,
    ...(sensors ?? [])
      .filter((sensor) => sensor.status === "ACTIVE")
      .map((sensor) => sensor.currentRainfallMmPerHour ?? 0),
  );
  const rain = Math.max(weather?.rainfallMmPerHour ?? 0, sensorRain);
  const weatherScore = Math.min(30, Math.round(30 * (rain / 30)));
  const waterScore = Math.max(0, ...(sensors ?? []).map(sensorScore));
  return scoreToLevel(Math.min(100, weatherScore + waterScore));
};

export interface MonitoredRiskState {
  currentLevel: RiskLevel;
  alertLevel: RiskLevel;
  forecastAt?: string;
}

export const calculateMonitoredRiskState = ({
  weather,
  sensors,
  failedSources,
}: {
  weather: MonitoredWeather | null;
  sensors: MonitoredSensor[] | null;
  failedSources: number;
}): MonitoredRiskState => {
  const currentLevel = calculateMonitoredRisk({ weather, sensors, failedSources });
  const peakForecast = (weather?.hourlyForecast ?? []).reduce<{
    level: RiskLevel;
    forecastAt: string;
  } | null>((peak, point) => {
    const level = calculateMonitoredRisk({
      weather: { rainfallMmPerHour: point.rainfallMmPerHour },
      sensors,
      failedSources,
    });
    return !peak || RISK_RANK[level] > RISK_RANK[peak.level]
      ? { level, forecastAt: point.forecastAt }
      : peak;
  }, null);

  if (peakForecast && RISK_RANK[peakForecast.level] > RISK_RANK[currentLevel]) {
    return {
      currentLevel,
      alertLevel: peakForecast.level,
      forecastAt: peakForecast.forecastAt,
    };
  }
  return { currentLevel, alertLevel: currentLevel };
};

const KMA_GRID = {
  re: 6371.00877,
  grid: 5,
  slat1: 30,
  slat2: 60,
  olon: 126,
  olat: 38,
  xo: 43,
  yo: 136,
};

const toRad = (degrees: number) => (degrees * Math.PI) / 180;

export const toKmaGrid = ({ lat, lng }: { lat: number; lng: number }) => {
  const re = KMA_GRID.re / KMA_GRID.grid;
  const slat1 = toRad(KMA_GRID.slat1);
  const slat2 = toRad(KMA_GRID.slat2);
  const olon = toRad(KMA_GRID.olon);
  const olat = toRad(KMA_GRID.olat);
  let sn = Math.tan(Math.PI * 0.25 + slat2 * 0.5) / Math.tan(Math.PI * 0.25 + slat1 * 0.5);
  sn = Math.log(Math.cos(slat1) / Math.cos(slat2)) / Math.log(sn);
  let sf = Math.tan(Math.PI * 0.25 + slat1 * 0.5);
  sf = (sf ** sn * Math.cos(slat1)) / sn;
  let ro = Math.tan(Math.PI * 0.25 + olat * 0.5);
  ro = (re * sf) / ro ** sn;
  let ra = Math.tan(Math.PI * 0.25 + toRad(lat) * 0.5);
  ra = (re * sf) / ra ** sn;
  let theta = lng === KMA_GRID.olon ? 0 : toRad(lng) - olon;
  if (theta > Math.PI) theta -= 2 * Math.PI;
  if (theta < -Math.PI) theta += 2 * Math.PI;
  theta *= sn;
  return {
    nx: Math.floor(ra * Math.sin(theta) + KMA_GRID.xo + 0.5),
    ny: Math.floor(ro - ra * Math.cos(theta) + KMA_GRID.yo + 0.5),
  };
};

const pad = (value: number) => String(value).padStart(2, "0");

export const getKmaNowcastBase = (now = new Date()) => {
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1_000);
  if (kst.getUTCMinutes() < 40) kst.setUTCHours(kst.getUTCHours() - 1);
  kst.setUTCMinutes(0, 0, 0);
  return {
    baseDate: `${kst.getUTCFullYear()}${pad(kst.getUTCMonth() + 1)}${pad(kst.getUTCDate())}`,
    baseTime: `${pad(kst.getUTCHours())}00`,
  };
};

export const getKmaUltraForecastBase = (now = new Date()) => {
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1_000);
  if (kst.getUTCMinutes() < 45) kst.setUTCHours(kst.getUTCHours() - 1);
  kst.setUTCMinutes(30, 0, 0);
  return {
    forecastBaseDate: `${kst.getUTCFullYear()}${pad(kst.getUTCMonth() + 1)}${pad(kst.getUTCDate())}`,
    forecastBaseTime: `${pad(kst.getUTCHours())}30`,
  };
};
