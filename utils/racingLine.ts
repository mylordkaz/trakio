import type { SessionDetail } from '@/db';
import { getBestLap } from '@/utils/session-analytics';

export type GeoPoint = { latitude: number; longitude: number };

export function getBestLapRacingLine(sessionDetail: SessionDetail | null): GeoPoint[] {
  if (!sessionDetail) return [];
  const bestLap = getBestLap(sessionDetail);
  if (!bestLap) return [];
  const points = sessionDetail.gpsPoints
    .filter((point) => point.lapId === bestLap.id)
    .map((point) => ({ latitude: point.latitude, longitude: point.longitude }));
  if (points.length > 2) {
    points.push(points[0]);
  }
  return points;
}

export function gpsPointsToSvgPath(
  points: GeoPoint[],
  viewportWidth: number,
  viewportHeight: number,
  padding = 0,
): string | null {
  if (points.length < 2) return null;

  let minLat = points[0].latitude;
  let maxLat = points[0].latitude;
  let minLng = points[0].longitude;
  let maxLng = points[0].longitude;
  for (const p of points) {
    if (p.latitude < minLat) minLat = p.latitude;
    if (p.latitude > maxLat) maxLat = p.latitude;
    if (p.longitude < minLng) minLng = p.longitude;
    if (p.longitude > maxLng) maxLng = p.longitude;
  }

  const centerLat = (minLat + maxLat) / 2;
  const lngScale = Math.cos((centerLat * Math.PI) / 180);

  const widthDeg = (maxLng - minLng) * lngScale;
  const heightDeg = maxLat - minLat;
  if (widthDeg === 0 || heightDeg === 0) return null;

  const availableWidth = viewportWidth - padding * 2;
  const availableHeight = viewportHeight - padding * 2;
  const scale = Math.min(availableWidth / widthDeg, availableHeight / heightDeg);

  const scaledWidth = widthDeg * scale;
  const scaledHeight = heightDeg * scale;
  const offsetX = padding + (availableWidth - scaledWidth) / 2;
  const offsetY = padding + (availableHeight - scaledHeight) / 2;

  let path = '';
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const x = offsetX + (p.longitude - minLng) * lngScale * scale;
    const y = offsetY + (maxLat - p.latitude) * scale;
    path += (i === 0 ? 'M' : 'L') + x.toFixed(1) + ' ' + y.toFixed(1) + ' ';
  }
  return path.trim();
}
