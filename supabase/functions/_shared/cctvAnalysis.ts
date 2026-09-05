export const CCTV_DEPTH_GRADES = ["NONE", "SHALLOW", "DEEP", "IMPASSABLE"] as const;
export type CctvDepthGrade = (typeof CCTV_DEPTH_GRADES)[number];

export interface CctvAnalysis {
  flooded: boolean;
  depthGrade: CctvDepthGrade;
  passable: boolean;
  confidence: number;
  observation: string;
}

export interface CctvAnalyzeRequest {
  camera: {
    id: string;
    name: string;
    streamUrl: string;
    source?: string;
    position: { lat: number; lng: number };
  };
  frame: {
    mimeType: "image/jpeg" | "image/png" | "image/webp";
    data: string;
    dataUrl: string;
  };
}

export const CCTV_ANALYSIS_CONFIDENCE_THRESHOLD = 0.7;

const DEPTH_SCORE: Record<CctvDepthGrade, number> = {
  NONE: 0,
  SHALLOW: 5,
  DEEP: 10,
  IMPASSABLE: 15,
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const boundedText = (value: unknown, maxLength: number) => {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text.length > 0 && text.length <= maxLength ? text : null;
};

export const parseCctvAnalyzeRequest = (value: unknown): CctvAnalyzeRequest => {
  const camera = isRecord(value) && isRecord(value.camera) ? value.camera : null;
  const position = camera && isRecord(camera.position) ? camera.position : null;
  const id = camera ? boundedText(camera.id, 300) : null;
  const name = camera ? boundedText(camera.name, 300) : null;
  const streamUrl = camera ? boundedText(camera.streamUrl, 2_000) : null;
  const source = camera ? boundedText(camera.source, 300) : null;
  const frameDataUrl = isRecord(value) ? boundedText(value.frameDataUrl, 4_000_000) : null;
  const frameMatch = frameDataUrl?.match(
    /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=\s]+)$/,
  );
  const lat = position?.lat;
  const lng = position?.lng;

  if (
    !id ||
    !name ||
    !streamUrl ||
    !streamUrl.startsWith("https://") ||
    typeof lat !== "number" ||
    !Number.isFinite(lat) ||
    lat < -90 ||
    lat > 90 ||
    typeof lng !== "number" ||
    !Number.isFinite(lng) ||
    lng < -180 ||
    lng > 180 ||
    !frameDataUrl ||
    !frameMatch
  ) {
    throw new Error("Invalid CCTV analysis request");
  }

  return {
    camera: {
      id,
      name,
      streamUrl,
      source: source ?? undefined,
      position: { lat, lng },
    },
    frame: {
      mimeType: frameMatch[1] as CctvAnalyzeRequest["frame"]["mimeType"],
      data: frameMatch[2].replace(/\s/g, ""),
      dataUrl: frameDataUrl,
    },
  };
};

export const readCctvAnalysisDailyLimit = (value: string | undefined) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 1_000 ? parsed : 100;
};

export const parseCctvAnalysis = (value: unknown): CctvAnalysis => {
  if (!isRecord(value)) throw new Error("Invalid CCTV analysis");

  const depthGrade = value.depthGrade;
  const observation = typeof value.observation === "string" ? value.observation.trim() : "";
  if (
    typeof value.flooded !== "boolean" ||
    typeof value.passable !== "boolean" ||
    !CCTV_DEPTH_GRADES.includes(depthGrade as CctvDepthGrade) ||
    typeof value.confidence !== "number" ||
    !Number.isFinite(value.confidence) ||
    value.confidence < 0 ||
    value.confidence > 1 ||
    observation.length === 0 ||
    observation.length > 800
  ) {
    throw new Error("Invalid CCTV analysis");
  }

  return {
    flooded: value.flooded,
    depthGrade: depthGrade as CctvDepthGrade,
    passable: value.passable,
    confidence: value.confidence,
    observation,
  };
};

export const reliableCctvAnalysis = (value: unknown): CctvAnalysis | null => {
  const parsed = parseCctvAnalysis(value);
  return parsed.confidence >= CCTV_ANALYSIS_CONFIDENCE_THRESHOLD ? parsed : null;
};

export const cctvFloodEvidenceScore = (value: unknown) => {
  const reliable = reliableCctvAnalysis(value);
  return reliable ? DEPTH_SCORE[reliable.depthGrade] : 0;
};
