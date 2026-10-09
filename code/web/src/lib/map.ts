import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  ROUTED_MODES,
  segmentLine,
  type LatLng,
  type Location,
  type MapPost,
  type Segment,
} from '@travelsteps/shared';

export type MapPostLike = Pick<
  MapPost,
  'id' | 'travelId' | 'title' | 'date' | 'coverAssetId' | 'locations' | 'segments' | 'arrival'
>;

export const TRAVEL_COLORS = ['#16a34a', '#2563eb', '#dc2626', '#9333ea', '#ea580c', '#0891b2', '#ca8a04', '#db2777'];
export const DEFAULT_COLOR = TRAVEL_COLORS[0]!;

export function createMap(el: HTMLElement, interactive: boolean): L.Map {
  const map = L.map(el, {
    zoomControl: interactive,
    dragging: interactive,
    scrollWheelZoom: false,
    touchZoom: interactive,
    doubleClickZoom: interactive,
    boxZoom: interactive,
    keyboard: interactive,
    attributionControl: true,
  });
  map.attributionControl.setPrefix(false);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    // CORS responses can be cached by the service worker without the opaque-response overhead.
    crossOrigin: '',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>',
  }).addTo(map);
  return map;
}

/** Walking/cycling/driving routes are solid; straight lines (flights, fallbacks) are dashed. */
export function isDashed(segment: Segment): boolean {
  return !ROUTED_MODES.includes(segment.mode) || segment.source !== 'route';
}

export function drawSegment(
  layer: L.LayerGroup,
  segment: Segment,
  from: Location,
  to: Location,
  color: string,
): L.Polyline {
  return L.polyline(segmentLine(segment, from, to), {
    color,
    weight: 4,
    opacity: 0.85,
    dashArray: isDashed(segment) ? '6 8' : undefined,
  }).addTo(layer);
}

/** Draws a post's points and routes; returns all coordinates for fitting the view. */
export function drawPost(
  layer: L.LayerGroup,
  post: MapPostLike,
  color: string,
  options: { arrival?: boolean; onClick?: (marker: L.CircleMarker) => void } = {},
): LatLng[] {
  const points: LatLng[] = [];
  const locs = post.locations;
  if (options.arrival && post.arrival?.geometry && post.arrival.geometry.length >= 2) {
    const line = post.arrival.geometry;
    L.polyline(line, {
      color,
      weight: 3,
      opacity: 0.6,
      dashArray: isDashed(post.arrival) ? '6 8' : undefined,
    }).addTo(layer);
    points.push(line[0]!);
  }
  for (let i = 0; i < locs.length - 1; i++) {
    const seg = post.segments[i] ?? { mode: 'lopen' as const };
    const line = drawSegment(layer, seg, locs[i]!, locs[i + 1]!, color);
    for (const p of line.getLatLngs() as L.LatLng[]) points.push([p.lat, p.lng]);
  }
  locs.forEach((loc, i) => {
    const marker = L.circleMarker([loc.lat, loc.lng], {
      radius: i === 0 ? 8 : 6,
      color,
      weight: 3,
      fillColor: '#fff',
      fillOpacity: 1,
    }).addTo(layer);
    if (loc.name) marker.bindTooltip(loc.name);
    if (options.onClick) marker.on('click', () => options.onClick!(marker));
    points.push([loc.lat, loc.lng]);
  });
  return points;
}

export function fitTo(map: L.Map, points: LatLng[], maxZoom = 14): void {
  if (points.length === 0) {
    map.setView([52.1, 5.3], 6);
  } else if (points.length === 1) {
    map.setView(points[0]!, Math.min(maxZoom, 13));
  } else {
    map.fitBounds(L.latLngBounds(points), { padding: [24, 24], maxZoom });
  }
}
