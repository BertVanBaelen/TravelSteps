import type { LatLng, Location, Segment, TransportMode } from './content.js';

const EARTH_RADIUS_KM = 6371.0088;
const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

export function haversineKm(a: LatLng, b: LatLng): number {
  const dLat = rad(b[0] - a[0]);
  const dLng = rad(b[1] - a[1]);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function lineLengthKm(points: LatLng[]): number {
  let km = 0;
  for (let i = 1; i < points.length; i++) km += haversineKm(points[i - 1]!, points[i]!);
  return km;
}

/** Great-circle line between two points (looks curved on the map for long flights). */
export function greatCircle(a: LatLng, b: LatLng): LatLng[] {
  const km = haversineKm(a, b);
  const steps = Math.min(64, Math.max(1, Math.ceil(km / 50)));
  if (steps === 1) return [a, b];
  const [lat1, lng1, lat2, lng2] = [rad(a[0]), rad(a[1]), rad(b[0]), rad(b[1])];
  const d = km / EARTH_RADIUS_KM;
  const points: LatLng[] = [a];
  for (let i = 1; i < steps; i++) {
    const f = i / steps;
    const A = Math.sin((1 - f) * d) / Math.sin(d);
    const B = Math.sin(f * d) / Math.sin(d);
    const x = A * Math.cos(lat1) * Math.cos(lng1) + B * Math.cos(lat2) * Math.cos(lng2);
    const y = A * Math.cos(lat1) * Math.sin(lng1) + B * Math.cos(lat2) * Math.sin(lng2);
    const z = A * Math.sin(lat1) + B * Math.sin(lat2);
    let lng = deg(Math.atan2(y, x));
    // Keep the line continuous across the antimeridian.
    const prev = points[points.length - 1]![1];
    while (lng - prev > 180) lng -= 360;
    while (lng - prev < -180) lng += 360;
    points.push([deg(Math.atan2(z, Math.sqrt(x * x + y * y))), lng]);
  }
  points.push(b);
  return points;
}

/** Ramer–Douglas–Peucker simplification; `tolerance` in degrees. */
export function simplify(points: LatLng[], tolerance: number): LatLng[] {
  if (points.length <= 2) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack: [number, number][] = [[0, points.length - 1]];
  const sq = tolerance * tolerance;
  while (stack.length) {
    const [start, end] = stack.pop()!;
    const [ay, ax] = points[start]!;
    const [by, bx] = points[end]!;
    const dx = bx - ax;
    const dy = by - ay;
    const len = dx * dx + dy * dy;
    let maxDist = 0;
    let index = -1;
    for (let i = start + 1; i < end; i++) {
      const [py, px] = points[i]!;
      let t = len === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / len;
      t = Math.max(0, Math.min(1, t));
      const ex = ax + t * dx - px;
      const ey = ay + t * dy - py;
      const dist = ex * ex + ey * ey;
      if (dist > maxDist) {
        maxDist = dist;
        index = i;
      }
    }
    if (index !== -1 && maxDist > sq) {
      keep[index] = 1;
      stack.push([start, index], [index, end]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

const round6 = (n: number) => Math.round(n * 1e6) / 1e6;

/** Identifies what a segment's cached geometry was calculated for. */
export function segmentKey(mode: TransportMode, from: Location, to: Location): string {
  return `${mode}|${round6(from.lat)},${round6(from.lng)}|${round6(to.lat)},${round6(to.lng)}`;
}

/** Straight (great-circle) segment, used for train/plane/boat and as routing fallback. */
export function straightSegment(mode: TransportMode, from: Location, to: Location): Segment {
  const a: LatLng = [from.lat, from.lng];
  const b: LatLng = [to.lat, to.lng];
  return {
    mode,
    geometry: greatCircle(a, b),
    distanceKm: Math.round(haversineKm(a, b) * 100) / 100,
    key: segmentKey(mode, from, to),
    source: 'straight',
  };
}

/** Geometry to draw for a segment: the cached one, or a straight line between its points. */
export function segmentLine(segment: Segment | undefined, from: Location, to: Location): LatLng[] {
  if (segment?.geometry && segment.geometry.length >= 2) return segment.geometry;
  return greatCircle([from.lat, from.lng], [to.lat, to.lng]);
}
