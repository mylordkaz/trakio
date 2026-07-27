import type { Coordinate } from '@/db/types';

// Typical circuit surface width. The ribbon is ground geometry, so it keeps
// covering the track as the map zooms.
export const DEFAULT_TRACK_WIDTH_METERS = 12;

// Caps how far an offset vertex is pushed out on a sharp bend. Beyond this the
// corner is cut rather than allowed to spike.
const MITER_LIMIT = 2;

// The surface is filled as a run of short bands rather than one ring, so that
// layouts which cross themselves (Suzuka's figure-of-eight) still fill: a
// single self-intersecting ring cancels itself out under even-odd fill.
const FILL_BAND_SEGMENTS = 24;

// Bands run one segment into their neighbour. Merely touching would leave a
// hairline where two antialiased edges meet, which reads as a seam across the
// track.
const FILL_BAND_OVERLAP = 1;

// Fraction of a corner's radius the half-width may occupy before the inner
// edge would fold. Kept under 1 so the pinch stays ahead of the artefact.
const MAX_WIDTH_OF_RADIUS = 0.85;

const METERS_PER_DEGREE_LATITUDE = 111132;
const METERS_PER_DEGREE_LONGITUDE = 111320;

type PlanarPoint = { x: number; y: number };

// Radius of the circle through three consecutive points; Infinity when they are
// collinear.
function cornerRadius(a: PlanarPoint, b: PlanarPoint, c: PlanarPoint) {
  const area =
    Math.abs((b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y)) / 2;

  if (area < 1e-9) {
    return Infinity;
  }

  const ab = Math.hypot(b.x - a.x, b.y - a.y);
  const bc = Math.hypot(c.x - b.x, c.y - b.y);
  const ca = Math.hypot(a.x - c.x, a.y - c.y);

  return (ab * bc * ca) / (4 * area);
}

export type TrackRibbon = {
  // Closed bands covering the track surface. Drawn filled, without a stroke.
  fill: Coordinate[][];
  // The two continuous kerb lines. Drawn stroked, without a fill.
  edges: Coordinate[][];
};

function isClosed(path: Coordinate[]) {
  const first = path[0];
  const last = path[path.length - 1];

  return (
    Math.abs(first.latitude - last.latitude) < 1e-9 &&
    Math.abs(first.longitude - last.longitude) < 1e-9
  );
}

/**
 * Widens a centerline into a band of constant ground width, so that it tracks
 * the surface at any zoom instead of being a fixed number of screen points.
 */
export function buildTrackRibbon(
  path: Coordinate[] | null,
  widthMeters: number = DEFAULT_TRACK_WIDTH_METERS,
): TrackRibbon | null {
  if (!path || path.length < 3) {
    return null;
  }

  const closed = isClosed(path);
  const ring = closed ? path.slice(0, -1) : path;

  if (ring.length < 2) {
    return null;
  }

  const originLatitude = ring[0].latitude;
  const originLongitude = ring[0].longitude;
  const metersPerLongitude =
    METERS_PER_DEGREE_LONGITUDE * Math.cos((originLatitude * Math.PI) / 180);

  const planar = ring.map((point) => ({
    x: (point.longitude - originLongitude) * metersPerLongitude,
    y: (point.latitude - originLatitude) * METERS_PER_DEGREE_LATITUDE,
  }));

  const halfWidth = widthMeters / 2;
  const count = planar.length;
  const left: Coordinate[] = [];
  const right: Coordinate[] = [];

  const toCoordinate = (x: number, y: number): Coordinate => ({
    latitude: originLatitude + y / METERS_PER_DEGREE_LATITUDE,
    longitude: originLongitude + x / metersPerLongitude,
  });

  for (let i = 0; i < count; i += 1) {
    const current = planar[i];
    // Open paths reuse the end segment's direction at each endpoint; loops wrap.
    const previous = closed ? planar[(i - 1 + count) % count] : planar[Math.max(i - 1, 0)];
    const next = closed ? planar[(i + 1) % count] : planar[Math.min(i + 1, count - 1)];

    const inbound = { x: current.x - previous.x, y: current.y - previous.y };
    const outbound = { x: next.x - current.x, y: next.y - current.y };
    const inboundLength = Math.hypot(inbound.x, inbound.y);
    const outboundLength = Math.hypot(outbound.x, outbound.y);

    // Perpendiculars of whichever neighbouring segments are non-degenerate.
    const normals: { x: number; y: number }[] = [];

    if (inboundLength > 1e-9) {
      normals.push({ x: -inbound.y / inboundLength, y: inbound.x / inboundLength });
    }
    if (outboundLength > 1e-9) {
      normals.push({ x: -outbound.y / outboundLength, y: outbound.x / outboundLength });
    }
    if (normals.length === 0) {
      left.push(toCoordinate(current.x, current.y));
      right.push(toCoordinate(current.x, current.y));
      continue;
    }

    const summed = normals.reduce(
      (total, normal) => ({ x: total.x + normal.x, y: total.y + normal.y }),
      { x: 0, y: 0 },
    );
    const summedLength = Math.hypot(summed.x, summed.y);

    if (summedLength < 1e-9) {
      left.push(toCoordinate(current.x, current.y));
      right.push(toCoordinate(current.x, current.y));
      continue;
    }

    const bisector = { x: summed.x / summedLength, y: summed.y / summedLength };
    // Compensating for the bend keeps the band's width constant through corners.
    const alignment = bisector.x * normals[0].x + bisector.y * normals[0].y;
    const miter = Math.min(alignment > 1e-6 ? 1 / alignment : MITER_LIMIT, MITER_LIMIT);
    // A corner tighter than the offset would fold the inner edge back through
    // itself, so the band is pinched to what the radius allows. The miter is
    // included before clamping, since it is what pushes the vertex outwards.
    const radius = cornerRadius(previous, current, next);
    const offset = Math.min(halfWidth * miter, radius * MAX_WIDTH_OF_RADIUS);
    const offsetX = bisector.x * offset;
    const offsetY = bisector.y * offset;

    left.push(toCoordinate(current.x + offsetX, current.y + offsetY));
    right.push(toCoordinate(current.x - offsetX, current.y - offsetY));
  }

  if (left.length < 2) {
    return null;
  }

  // Wrapping the first index back onto the end closes a loop's final band.
  const order = left.map((_, index) => index);

  if (closed) {
    order.push(0);
  }

  const fill: Coordinate[][] = [];

  for (let start = 0; start < order.length - 1; start += FILL_BAND_SEGMENTS) {
    const span = order.slice(start, start + FILL_BAND_SEGMENTS + 1 + FILL_BAND_OVERLAP);

    if (span.length < 2) {
      continue;
    }

    fill.push([
      ...span.map((index) => left[index]),
      ...span
        .slice()
        .reverse()
        .map((index) => right[index]),
    ]);
  }

  const edges = closed
    ? [
        [...left, left[0]],
        [...right, right[0]],
      ]
    : [left, right];

  return { fill, edges };
}
