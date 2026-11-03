import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  ROUTED_MODES,
  segmentLine,
  TRAVEL_COLORS,
  type LatLng,
  type Location,
  type MapPost,
  type Segment,
  type TransportMode,
} from '@travelsteps/shared';

export type MapPostLike = Pick<
  MapPost,
  'id' | 'travelId' | 'title' | 'date' | 'coverAssetId' | 'locations' | 'segments' | 'arrival'
>;

export const DEFAULT_COLOR = TRAVEL_COLORS.forest;
/** The step you are reading or chose: Sunset, drawn on top of the others. */
export const HIGHLIGHT_COLOR = '#ef6b3a';
/** Boat, train and plane lines: dashed in fjord blue, whatever the travel colour. */
const TRANSIT_COLOR = TRAVEL_COLORS.fjord;

/** Map line groups; the legend shows them with their own style, not by colour alone. */
export type LineGroup = 'own' | 'car' | 'transit';

export function lineGroup(mode: TransportMode): LineGroup {
  if (mode === 'lopen' || mode === 'fietsen') return 'own';
  return mode === 'auto' ? 'car' : 'transit';
}

/**
 * Line style per transport mode: under your own power thick and solid, car thinner and lighter,
 * boat/train/plane dashed in fjord blue. `faint` is used for the connection from the previous step.
 */
export function lineStyle(segment: Segment, color: string, faint = false): L.PolylineOptions {
  const group = lineGroup(segment.mode);
  const dim = faint ? 0.7 : 1;
  if (group === 'transit') {
    return { color: TRANSIT_COLOR, weight: 3, opacity: 0.85 * dim, dashArray: '8 8' };
  }
  if (group === 'car') {
    return {
      color,
      weight: 3,
      opacity: 0.5 * dim,
      dashArray: isDashed(segment) ? '6 8' : undefined,
    };
  }
  return { color, weight: 5, opacity: 0.9 * dim, dashArray: isDashed(segment) ? '6 8' : undefined };
}

export function createMap(el: HTMLElement, interactive: boolean): L.Map {
  const map = L.map(el, {
    // Zoom buttons top right (48 px, see styles.css): labels and previews sit top left.
    zoomControl: false,
    dragging: interactive,
    scrollWheelZoom: false,
    touchZoom: interactive,
    doubleClickZoom: interactive,
    boxZoom: interactive,
    keyboard: interactive,
    attributionControl: true,
  });
  if (interactive) L.control.zoom({ position: 'topright' }).addTo(map);
  map.attributionControl.setPrefix(false);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    // CORS responses can be cached by the service worker without the opaque-response overhead.
    crossOrigin: '',
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>',
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
  return L.polyline(segmentLine(segment, from, to), lineStyle(segment, color)).addTo(layer);
}

/** Draws a post's points and routes; returns all coordinates for fitting the view. */
export function drawPost(
  layer: L.LayerGroup,
  post: MapPostLike,
  color: string,
  options: {
    arrival?: boolean;
    onClick?: (marker: L.CircleMarker) => void;
    /** Bigger markers on top of the other steps. */
    highlight?: boolean;
  } = {},
): LatLng[] {
  const points: LatLng[] = [];
  const locs = post.locations;
  if (options.arrival && post.arrival?.geometry && post.arrival.geometry.length >= 2) {
    const line = post.arrival.geometry;
    L.polyline(line, lineStyle(post.arrival, color, true)).addTo(layer);
    points.push(line[0]!);
  }
  for (let i = 0; i < locs.length - 1; i++) {
    const seg = post.segments[i] ?? { mode: 'lopen' as const };
    const line = drawSegment(layer, seg, locs[i]!, locs[i + 1]!, color);
    for (const p of line.getLatLngs() as L.LatLng[]) points.push([p.lat, p.lng]);
  }
  locs.forEach((loc, i) => {
    const big = options.highlight ? 2 : 0;
    const marker = L.circleMarker([loc.lat, loc.lng], {
      radius: (i === 0 ? 8 : 6) + big,
      color,
      weight: 3 + (options.highlight ? 1 : 0),
      fillColor: '#fff',
      fillOpacity: 1,
    }).addTo(layer);
    if (options.highlight) marker.bringToFront();
    if (loc.name) marker.bindTooltip(loc.name);
    if (options.onClick) marker.on('click', () => options.onClick!(marker));
    points.push([loc.lat, loc.lng]);
  });
  return points;
}

export function fitTo(map: L.Map, points: LatLng[], maxZoom = 14, animate = false): void {
  if (points.length === 0) {
    map.setView([52.1, 5.3], 6);
  } else if (points.length === 1) {
    map.setView(points[0]!, Math.min(maxZoom, 13), { animate });
  } else {
    map.fitBounds(L.latLngBounds(points), { padding: [24, 24], maxZoom, animate });
  }
}

export const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
