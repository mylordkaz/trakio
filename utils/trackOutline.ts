import type { Coordinate } from '@/db/types';

/**
 * Projects a track outline into an SVG points string fitted to a square of the
 * given size, centred, aspect preserved. Longitudes are scaled by cos(lat) so
 * shapes keep their real proportions.
 */
export function buildOutlinePoints(
  path: Coordinate[],
  size: number,
  padding: number,
): string {
  if (path.length < 2) {
    return '';
  }

  let minLat = path[0].latitude;
  let maxLat = path[0].latitude;
  let minLng = path[0].longitude;
  let maxLng = path[0].longitude;

  for (const point of path) {
    minLat = Math.min(minLat, point.latitude);
    maxLat = Math.max(maxLat, point.latitude);
    minLng = Math.min(minLng, point.longitude);
    maxLng = Math.max(maxLng, point.longitude);
  }

  const lngScale = Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180);
  const spanX = (maxLng - minLng) * lngScale || 1e-9;
  const spanY = maxLat - minLat || 1e-9;
  const inner = size - padding * 2;
  const scale = inner / Math.max(spanX, spanY);
  const offsetX = padding + (inner - spanX * scale) / 2;
  const offsetY = padding + (inner - spanY * scale) / 2;

  return path
    .map((point) => {
      const x = offsetX + (point.longitude - minLng) * lngScale * scale;
      const y = offsetY + (maxLat - point.latitude) * scale;

      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}
