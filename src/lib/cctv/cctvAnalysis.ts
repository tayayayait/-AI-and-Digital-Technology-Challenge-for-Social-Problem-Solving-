import { z } from "zod";

import { haversineMeters } from "@/lib/utils";
import type { LatLng, RiskLevel } from "@/lib/types";

export const CCTV_ANALYSIS_CONFIDENCE_THRESHOLD = 0.7;
export const CCTV_ANALYSIS_RADIUS_METERS = 2_000;

const cctvAnalysisResultSchema = z.object({
  cameraId: z.string().min(1),
  cameraName: z.string().min(1),
  position: z.object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
  }),
  flooded: z.boolean(),
  depthGrade: z.enum(["NONE", "SHALLOW", "DEEP", "IMPASSABLE"]),
  passable: z.boolean(),
  confidence: z.number().min(0).max(1),
  observation: z.string().min(1).max(800),
  frameDataUrl: z.string().regex(/^data:image\/(?:jpeg|png|webp);base64,/),
  analyzedAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
});

const cctvAnalysisResponseSchema = z.object({
  status: z.enum(["OK", "LOW_CONFIDENCE", "DAILY_LIMIT"]),
  cached: z.boolean(),
  analysis: cctvAnalysisResultSchema.nullable(),
  message: z.string().optional(),
  durationMs: z.number().nonnegative().optional(),
});

export type CctvAnalysisResult = z.infer<typeof cctvAnalysisResultSchema>;
export type CctvAnalysisResponse = z.infer<typeof cctvAnalysisResponseSchema>;

export interface CctvAnalysisRequestContext {
  requestedByOperator?: boolean;
  riskLevel?: RiskLevel;
  distanceMeters?: number;
}

export const parseCctvAnalysisResponse = (value: unknown): CctvAnalysisResponse =>
  cctvAnalysisResponseSchema.parse(value);

export const canRequestCctvAnalysis = ({
  requestedByOperator = false,
  riskLevel,
  distanceMeters,
}: CctvAnalysisRequestContext) =>
  requestedByOperator ||
  ((riskLevel === "WARNING" || riskLevel === "CRITICAL") &&
    Number.isFinite(distanceMeters) &&
    (distanceMeters ?? Number.POSITIVE_INFINITY) >= 0 &&
    (distanceMeters ?? Number.POSITIVE_INFINITY) <= CCTV_ANALYSIS_RADIUS_METERS);

const DEPTH_SCORE: Record<CctvAnalysisResult["depthGrade"], number> = {
  NONE: 0,
  SHALLOW: 5,
  DEEP: 10,
  IMPASSABLE: 15,
};

export const selectRelevantCctvEvidence = (
  analyses: CctvAnalysisResult[],
  origin: LatLng,
  now = Date.now(),
) =>
  analyses
    .filter(
      (analysis) =>
        analysis.confidence >= CCTV_ANALYSIS_CONFIDENCE_THRESHOLD &&
        new Date(analysis.expiresAt).getTime() > now &&
        haversineMeters(origin, analysis.position) <= CCTV_ANALYSIS_RADIUS_METERS,
    )
    .sort(
      (a, b) =>
        DEPTH_SCORE[b.depthGrade] - DEPTH_SCORE[a.depthGrade] ||
        b.confidence - a.confidence ||
        new Date(b.analyzedAt).getTime() - new Date(a.analyzedAt).getTime(),
    )[0] ?? null;
