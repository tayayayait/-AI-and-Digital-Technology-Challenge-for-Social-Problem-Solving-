import type { LatLng, RouteResult } from "@/lib/types";
import { haversineMeters } from "@/lib/utils";

export interface PositionedPoint {
  position: LatLng;
}

const toPlanarPoint = (point: LatLng, origin: LatLng) => {
  const latScale = 111_320;
  const lngScale = 111_320 * Math.cos((origin.lat * Math.PI) / 180);
  return {
    x: (point.lng - origin.lng) * lngScale,
    y: (point.lat - origin.lat) * latScale,
  };
};

const distanceToSegmentMeters = (point: LatLng, start: LatLng, end: LatLng) => {
  if (start.lat === end.lat && start.lng === end.lng) return haversineMeters(point, start);

  const p = toPlanarPoint(point, start);
  const b = toPlanarPoint(end, start);
  const lengthSq = b.x * b.x + b.y * b.y;
  const t = Math.max(0, Math.min(1, (p.x * b.x + p.y * b.y) / lengthSq));
  const projection = { x: t * b.x, y: t * b.y };
  return Math.hypot(p.x - projection.x, p.y - projection.y);
};

export const distanceToRouteMeters = (target: PositionedPoint, route: RouteResult) => {
  if (route.geometry.length === 0) return Number.POSITIVE_INFINITY;
  if (route.geometry.length === 1) return haversineMeters(target.position, route.geometry[0]);

  return Math.min(
    ...route.geometry
      .slice(1)
      .map((point, index) =>
        distanceToSegmentMeters(target.position, route.geometry[index], point),
      ),
  );
};
