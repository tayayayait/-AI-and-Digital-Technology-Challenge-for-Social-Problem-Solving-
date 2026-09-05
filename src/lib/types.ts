export type RiskLevel = "SAFE" | "WATCH" | "WARNING" | "CRITICAL" | "UNKNOWN";
export type RouteMode = "WALK" | "DRIVE";
export type RouteStatus = "RECOMMENDED" | "ALTERNATIVE" | "REJECTED" | "LOADING" | "FAILED";
export type ShelterStatus = "OPERATING" | "CHECK_REQUIRED" | "EXCLUDED";
export type LocationStatus = "GRANTED" | "DENIED" | "PROMPT" | "ERROR";

export interface LatLng {
  lat: number;
  lng: number;
}

export interface Shelter {
  id: string;
  name: string;
  address: string;
  position: LatLng;
  capacity: number;
  status: ShelterStatus;
  underground: boolean;
  type: string;
}

export interface RiskZone {
  id: string;
  name: string;
  level: Exclude<RiskLevel, "UNKNOWN">;
  /** GeoJSON-like polygon: array of [lng, lat] */
  polygon: Array<[number, number]>;
  reasons: string[];
}

export interface TrafficEvent {
  id: string;
  type: string;
  eventType: string;
  eventDetailType?: string;
  position: LatLng;
  linkId?: string;
  roadName?: string;
  roadNo?: string;
  roadDirection?: string;
  lanesBlockType?: string;
  lanesBlocked?: string;
  message: string;
  startedAt?: string;
  endedAt?: string;
  source: string;
}

export interface Underpass {
  id: string;
  name: string;
  position: LatLng;
  startPosition: LatLng;
  endPosition: LatLng;
  region: string;
  province?: string | null;
  district?: string | null;
  address?: string | null;
  roadName?: string | null;
  direction?: string | null;
  lengthMeters?: number | null;
  managementAgency?: string | null;
  source: string;
  sourceUpdatedAt: string | null;
}

export interface RouteResult {
  id: string;
  mode: RouteMode;
  status: RouteStatus;
  name: string;
  distanceMeters: number;
  durationSeconds: number;
  safetyScore: number;
  riskReasons: string[];
  /** Polyline as [lat, lng] */
  geometry: LatLng[];
  shelterId: string;
}

export type SafetyFactKind =
  | "RISK"
  | "WEATHER"
  | "WARNING"
  | "DISASTER_MESSAGE"
  | "FLOOD_MAP"
  | "RIVER"
  | "TRAFFIC"
  | "UNDERPASS"
  | "ROUTE"
  | "SHELTER";

export interface SafetyFact {
  id: string;
  kind: SafetyFactKind;
  text: string;
  source: string;
  observedAt: string | null;
  status: "LIVE" | "DELAYED" | "FALLBACK";
}

export type GuidanceSourceKind = "LIVE_DATA" | "GENERAL_KNOWLEDGE";

export interface AiGuidanceItem {
  text: string;
  sourceKind: GuidanceSourceKind;
  evidenceRefs: string[];
}

export interface AiAlternativeShelterReason {
  shelterId: string;
  reason: AiGuidanceItem;
}

export interface AiAnswer {
  judgement:
    | "WAIT"
    | "WALK_TO_SHELTER"
    | "DRIVE_TO_SAFE_ZONE"
    | "AVOID_ROUTE"
    | "CALL_119"
    | "CHECK_OFFICIAL_NOTICE";
  judgementLabel: string;
  reasons: string[];
  basis: string[];
  timestamp: string;
  /** 입력 근거 ID와 출력 스키마가 검증됐다는 뜻이며, 현장 사실 자체의 보증은 아니다. */
  verified: boolean;
  riskSummary?: AiGuidanceItem;
  immediateActions?: AiGuidanceItem[];
  disasterActions?: AiGuidanceItem[];
  recommendedShelterReason?: AiGuidanceItem;
  movementWarnings?: AiGuidanceItem[];
  alternativeShelterReasons?: AiAlternativeShelterReason[];
}

export interface WeatherNow {
  rainfallMmPerHour: number;
  humidityPercent?: number;
  precipitationType?: string;
  alerts?: Array<{ level: "WATCH" | "WARNING" | "CRITICAL" }>;
}

export interface RiskCalculationInput {
  weather: WeatherNow | null;
  floodTrace: boolean;
  floodTraceOverlap?: number;
  riverFlood: boolean;
  riverFloodOverlap?: number;
  disasterMessages: Array<{
    region: string;
    body: string;
    issuedAt?: string;
    source?: string;
  }>;
  hasUnderpass: boolean;
  trafficControl: boolean;
  /** 화면 근거에 표시할 실제 통제 도로·상황명. */
  trafficControlTitle?: string;
  /**
   * 기상청 기상특보 중 침수 관련(호우·태풍·홍수·해일) 최고 등급.
   * 강우 관측값과 독립된 근거이므로 강우 점수와 별도로 반영한다.
   */
  floodWarningLevel?: "WATCH" | "WARNING" | "CRITICAL" | null;
  /** 화면·설명 표시용 특보명. 예: 호우주의보 */
  floodWarningTitle?: string;
  failedDataCount?: number;
  sensors?: Array<{
    id: string;
    type?: "WATER_LEVEL" | "RAINFALL" | "FLOOD_FORECAST";
    currentLevel?: number;
    flowRate?: number;
    attentionLevel?: number;
    warningLevel?: number;
    alarmLevel?: number;
    seriousLevel?: number;
    plannedFloodLevel?: number;
    currentRainfallMmPerHour?: number;
    riskLevel?: RiskLevel;
    forecastKind?: string;
    status: string;
  }>;
}

export interface RiskScoreBreakdown {
  weather: number;
  floodTrace: number;
  riverFlood: number;
  disasterMessages: number;
  underpass: number;
  trafficControl: number;
  total: number;
  level: RiskLevel;
  reasons: string[];
  missingDataCount: number;
}
