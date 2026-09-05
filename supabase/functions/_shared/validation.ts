export type RiskLevel = "SAFE" | "WATCH" | "WARNING" | "CRITICAL" | "UNKNOWN";

export interface LatLng {
  lat: number;
  lng: number;
}

export interface LatLngRouteRequest {
  origin: LatLng;
  destination: LatLng;
}

export interface GeminiPromptRequest {
  question: string;
  riskLevel: RiskLevel;
  recommendedRouteId?: string;
  recommendedShelterId?: string;
  shelterName: string;
  distanceMeters?: number;
  wmsFloodOverlap?: number;
  wmsRiverOverlap?: number;
  routeReasons: string[];
  dataTimestamp: string;
  allowedProperNouns: string[];
  mode: "QUESTION" | "SITUATION_GUIDANCE";
  disasterTypes: string[];
  selectionKind?: "AUTO_RECOMMENDED" | "USER_SELECTED";
  facts: Array<{
    id: string;
    kind:
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
    text: string;
    source: string;
    observedAt: string | null;
    status: "LIVE" | "DELAYED" | "FALLBACK";
  }>;
  alternatives: Array<{
    shelterId: string;
    shelterName: string;
    distanceMeters: number;
    distanceKind: "ROUTE" | "STRAIGHT_LINE";
    routeVerified: boolean;
  }>;
}

const RISK_LEVELS = new Set<RiskLevel>(["SAFE", "WATCH", "WARNING", "CRITICAL", "UNKNOWN"]);
const GEMINI_MODES = new Set(["QUESTION", "SITUATION_GUIDANCE"]);
const SELECTION_KINDS = new Set(["AUTO_RECOMMENDED", "USER_SELECTED"]);
const FACT_KINDS = new Set([
  "RISK",
  "WEATHER",
  "WARNING",
  "DISASTER_MESSAGE",
  "FLOOD_MAP",
  "RIVER",
  "TRAFFIC",
  "UNDERPASS",
  "ROUTE",
  "SHELTER",
]);
const FACT_STATUSES = new Set(["LIVE", "DELAYED", "FALLBACK"]);
const DISTANCE_KINDS = new Set(["ROUTE", "STRAIGHT_LINE"]);

export const parseJsonBody = async (request: Request) => {
  try {
    return await request.json();
  } catch {
    throw new Error("Invalid JSON body");
  }
};

export const assertAllowedMethod = (method: string, allowed: string[]) => {
  if (!allowed.includes(method)) throw new Error("Method not allowed");
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const parseBoundedText = (value: unknown, name: string, min: number, max: number) => {
  if (typeof value !== "string") throw new Error(`Invalid ${name}`);
  const trimmed = value.trim();
  if (trimmed.length < min || trimmed.length > max) throw new Error(`Invalid ${name}`);
  return trimmed;
};

const parseFiniteNonNegativeNumber = (value: unknown, name: string) => {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(`Invalid ${name}`);
  }
  return value;
};

const parseGeminiFacts = (value: unknown): GeminiPromptRequest["facts"] => {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error("Invalid facts");

  return value.slice(0, 20).map((fact, index) => {
    if (!isRecord(fact)) throw new Error(`Invalid facts[${index}]`);
    const kind = parseBoundedText(fact.kind, `facts[${index}].kind`, 1, 30);
    const status = parseBoundedText(fact.status, `facts[${index}].status`, 1, 20);
    if (!FACT_KINDS.has(kind) || !FACT_STATUSES.has(status)) {
      throw new Error(`Invalid facts[${index}]`);
    }

    return {
      id: parseBoundedText(fact.id, `facts[${index}].id`, 1, 100),
      kind: kind as GeminiPromptRequest["facts"][number]["kind"],
      text: parseBoundedText(fact.text, `facts[${index}].text`, 1, 320),
      source: parseBoundedText(fact.source, `facts[${index}].source`, 1, 100),
      observedAt:
        fact.observedAt === null || fact.observedAt === undefined
          ? null
          : parseBoundedText(fact.observedAt, `facts[${index}].observedAt`, 1, 80),
      status: status as GeminiPromptRequest["facts"][number]["status"],
    };
  });
};

const parseGeminiAlternatives = (value: unknown): GeminiPromptRequest["alternatives"] => {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error("Invalid alternatives");

  return value.slice(0, 3).map((alternative, index) => {
    if (!isRecord(alternative)) throw new Error(`Invalid alternatives[${index}]`);
    const distanceKind = parseBoundedText(
      alternative.distanceKind,
      `alternatives[${index}].distanceKind`,
      1,
      30,
    );
    if (!DISTANCE_KINDS.has(distanceKind) || typeof alternative.routeVerified !== "boolean") {
      throw new Error(`Invalid alternatives[${index}]`);
    }

    return {
      shelterId: parseBoundedText(
        alternative.shelterId,
        `alternatives[${index}].shelterId`,
        1,
        100,
      ),
      shelterName: parseBoundedText(
        alternative.shelterName,
        `alternatives[${index}].shelterName`,
        1,
        100,
      ),
      distanceMeters: parseFiniteNonNegativeNumber(
        alternative.distanceMeters,
        `alternatives[${index}].distanceMeters`,
      ),
      distanceKind: distanceKind as GeminiPromptRequest["alternatives"][number]["distanceKind"],
      routeVerified: alternative.routeVerified,
    };
  });
};

const validateLatLng = (value: unknown, name: string): LatLng => {
  if (!isRecord(value)) throw new Error(`Invalid ${name}`);
  const { lat, lng } = value;
  if (typeof lat !== "number" || !Number.isFinite(lat) || lat < -90 || lat > 90) {
    throw new Error(`Invalid ${name}`);
  }
  if (typeof lng !== "number" || !Number.isFinite(lng) || lng < -180 || lng > 180) {
    throw new Error(`Invalid ${name}`);
  }
  return { lat, lng };
};

export const validateLatLngRequest = (value: unknown): LatLngRouteRequest => {
  if (!isRecord(value)) throw new Error("Invalid request body");
  return {
    origin: validateLatLng(value.origin, "origin"),
    destination: validateLatLng(value.destination, "destination"),
  };
};

export const validateGeminiPromptRequest = (value: unknown): GeminiPromptRequest => {
  if (!isRecord(value)) throw new Error("Invalid request body");

  const riskLevel = value.riskLevel;
  if (typeof riskLevel !== "string" || !RISK_LEVELS.has(riskLevel as RiskLevel)) {
    throw new Error("Invalid riskLevel");
  }

  const routeReasons = Array.isArray(value.routeReasons)
    ? value.routeReasons
        .filter((reason): reason is string => typeof reason === "string")
        .map((reason) => reason.trim())
        .filter(Boolean)
        .slice(0, 5)
    : [];
  const mode =
    typeof value.mode === "string" && GEMINI_MODES.has(value.mode)
      ? (value.mode as GeminiPromptRequest["mode"])
      : "QUESTION";
  const selectionKind =
    typeof value.selectionKind === "string" && SELECTION_KINDS.has(value.selectionKind)
      ? (value.selectionKind as GeminiPromptRequest["selectionKind"])
      : undefined;

  return {
    question: parseBoundedText(value.question, "question", 1, 200),
    riskLevel: riskLevel as RiskLevel,
    recommendedRouteId:
      typeof value.recommendedRouteId === "string"
        ? parseBoundedText(value.recommendedRouteId, "recommendedRouteId", 1, 80)
        : undefined,
    recommendedShelterId:
      typeof value.recommendedShelterId === "string"
        ? parseBoundedText(value.recommendedShelterId, "recommendedShelterId", 1, 80)
        : undefined,
    shelterName: parseBoundedText(value.shelterName, "shelterName", 1, 80),
    distanceMeters: typeof value.distanceMeters === "number" ? value.distanceMeters : undefined,
    wmsFloodOverlap: typeof value.wmsFloodOverlap === "number" ? value.wmsFloodOverlap : undefined,
    wmsRiverOverlap: typeof value.wmsRiverOverlap === "number" ? value.wmsRiverOverlap : undefined,
    routeReasons,
    dataTimestamp: parseBoundedText(value.dataTimestamp, "dataTimestamp", 1, 80),
    allowedProperNouns: Array.isArray(value.allowedProperNouns)
      ? value.allowedProperNouns
          .filter((term): term is string => typeof term === "string")
          .map((term) => term.trim())
          .filter(Boolean)
          .slice(0, 20)
      : [],
    mode,
    disasterTypes: Array.isArray(value.disasterTypes)
      ? value.disasterTypes
          .filter((item): item is string => typeof item === "string")
          .map((item) => item.trim())
          .filter(Boolean)
          .slice(0, 4)
      : [],
    selectionKind,
    facts: parseGeminiFacts(value.facts),
    alternatives: parseGeminiAlternatives(value.alternatives),
  };
};
