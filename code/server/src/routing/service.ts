import type { FastifyBaseLogger } from 'fastify';
import {
  ROUTED_MODES,
  lineLengthKm,
  segmentKey,
  simplify,
  straightSegment,
  type GeocodeResult,
  type LatLng,
  type Location,
  type Segment,
  type TransportMode,
} from '@travelsteps/shared';
import { HttpError } from '../errors.js';

const TIMEOUT_MS = 20_000;
/** Place lookups are interactive: give up quickly instead of leaving the editor waiting. */
const GEOCODE_TIMEOUT_MS = 6_000;
const GEOCODE_CACHE_SIZE = 500;
const NOMINATIM_URL = 'https://nominatim.openstreetmap.org';
const USER_AGENT = 'TravelSteps travel blog (self-hosted)';
/** ~5 m; keeps cached geometry small without visible loss. */
const SIMPLIFY_TOLERANCE = 0.00005;

const ORS_PROFILES: Partial<Record<TransportMode, string>> = {
  lopen: 'foot-hiking',
  fietsen: 'cycling-regular',
  auto: 'driving-car',
};

interface OrsDirections {
  features?: {
    geometry?: { coordinates?: number[][] };
    properties?: { summary?: { distance?: number }; ascent?: number };
  }[];
}

interface OrsGeocode {
  features?: {
    geometry?: { coordinates?: number[] };
    properties?: { label?: string; name?: string; locality?: string };
  }[];
}

interface NominatimPlace {
  lat?: string;
  lon?: string;
  display_name?: string;
  name?: string;
  address?: Record<string, string>;
}

export interface RoutingStatus {
  at: string;
  ok: boolean;
  detail: string | null;
}

/**
 * Routes segments via OpenRouteService (walking/cycling/driving) and draws straight lines for
 * train/plane/boat. Results are cached in the post frontmatter by the caller, keyed on mode +
 * end points, so the API is only called when a segment actually changes.
 */
export class RoutingService {
  private readonly baseUrl: string;
  lastResult: RoutingStatus | null = null;
  /** Small LRU of successful geocoding answers (search text / rounded point). */
  private readonly geocodeCache = new Map<string, unknown>();

  constructor(
    private readonly apiKey: string | undefined,
    baseUrl: string | undefined,
    private readonly log?: FastifyBaseLogger,
    private readonly nominatimUrl = NOMINATIM_URL,
  ) {
    this.baseUrl = (baseUrl ?? 'https://api.openrouteservice.org').replace(/\/+$/, '');
  }

  get configured(): boolean {
    return Boolean(this.apiKey);
  }

  private async fetchJson<T>(
    url: string,
    init: RequestInit = {},
    timeoutMs = TIMEOUT_MS,
  ): Promise<T> {
    const res = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) {
      await res.body?.cancel();
      throw new Error(`HTTP ${res.status}`);
    }
    return (await res.json()) as T;
  }

  /** One segment; never throws (falls back to a straight line). */
  async route(mode: TransportMode, from: Location, to: Location): Promise<Segment> {
    const profile = ORS_PROFILES[mode];
    if (!profile || !this.apiKey) return straightSegment(mode, from, to);
    try {
      const data = await this.fetchJson<OrsDirections>(
        `${this.baseUrl}/v2/directions/${profile}/geojson`,
        {
          method: 'POST',
          headers: {
            Authorization: this.apiKey,
            'Content-Type': 'application/json',
            Accept: 'application/geo+json, application/json',
          },
          body: JSON.stringify({
            coordinates: [
              [from.lng, from.lat],
              [to.lng, to.lat],
            ],
            elevation: true,
          }),
        },
      );
      const feature = data.features?.[0];
      const line = (feature?.geometry?.coordinates ?? [])
        .filter((c) => Number.isFinite(c[0]) && Number.isFinite(c[1]))
        .map((c): LatLng => [c[1]!, c[0]!]);
      if (line.length < 2) throw new Error('Lege route');
      const geometry = simplify(line, SIMPLIFY_TOLERANCE).map(([lat, lng]): LatLng => [
        Math.round(lat * 1e6) / 1e6,
        Math.round(lng * 1e6) / 1e6,
      ]);
      const meters = feature?.properties?.summary?.distance;
      const ascent = feature?.properties?.ascent;
      this.lastResult = { at: new Date().toISOString(), ok: true, detail: null };
      return {
        mode,
        geometry,
        distanceKm:
          Math.round((typeof meters === 'number' ? meters / 1000 : lineLengthKm(line)) * 100) / 100,
        ...(typeof ascent === 'number' ? { ascentM: Math.round(ascent) } : {}),
        key: segmentKey(mode, from, to),
        source: 'route',
      };
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      this.lastResult = { at: new Date().toISOString(), ok: false, detail };
      this.log?.warn({ mode, err: detail }, 'Route berekenen mislukt; rechte lijn gebruikt');
      return straightSegment(mode, from, to);
    }
  }

  /** True when the cached segment is still valid for this mode and these end points. */
  private reusable(cached: Segment | undefined | null, key: string): cached is Segment {
    if (!cached || cached.key !== key || !cached.geometry || cached.geometry.length < 2) {
      return false;
    }
    // Retry segments that fell back to a straight line because routing failed.
    return !(ROUTED_MODES.includes(cached.mode) && cached.source !== 'route' && this.apiKey);
  }

  async segment(
    cached: Segment | undefined | null,
    mode: TransportMode,
    from: Location,
    to: Location,
  ): Promise<Segment> {
    if (this.reusable(cached, segmentKey(mode, from, to))) return cached;
    return this.route(mode, from, to);
  }

  /** Segments between consecutive locations; the mode per segment comes from the input. */
  async segments(locations: Location[], input: Segment[]): Promise<Segment[]> {
    const result: Segment[] = [];
    for (let i = 0; i < locations.length - 1; i++) {
      const cached = input[i];
      result.push(
        await this.segment(cached, cached?.mode ?? 'lopen', locations[i]!, locations[i + 1]!),
      );
    }
    return result;
  }

  // ---------- Geocoding ----------

  private async cached<T>(key: string, load: () => Promise<T>): Promise<T> {
    if (this.geocodeCache.has(key)) {
      const hit = this.geocodeCache.get(key) as T;
      this.geocodeCache.delete(key);
      this.geocodeCache.set(key, hit);
      return hit;
    }
    const value = await load();
    this.geocodeCache.set(key, value);
    if (this.geocodeCache.size > GEOCODE_CACHE_SIZE) {
      this.geocodeCache.delete(this.geocodeCache.keys().next().value!);
    }
    return value;
  }

  async search(text: string): Promise<GeocodeResult[]> {
    try {
      return await this.cached(`s:${text.trim().toLowerCase()}`, () => this.searchUncached(text));
    } catch (err) {
      this.log?.warn({ err: String(err) }, 'Plaats zoeken mislukt');
      throw new HttpError(502, 'GEOCODE_FAILED', 'Zoeken naar plaatsen lukt nu niet.');
    }
  }

  private async searchUncached(text: string): Promise<GeocodeResult[]> {
    if (this.apiKey) {
      const params = new URLSearchParams({ text, size: '6', lang: 'nl' });
      const data = await this.fetchJson<OrsGeocode>(
        `${this.baseUrl}/geocode/search?${params}`,
        { headers: { Authorization: this.apiKey } },
        GEOCODE_TIMEOUT_MS,
      );
      return (data.features ?? []).flatMap((f) => {
        const c = f.geometry?.coordinates;
        if (!c || !Number.isFinite(c[0]) || !Number.isFinite(c[1])) return [];
        return [{ name: f.properties?.label ?? text, lat: c[1]!, lng: c[0]! }];
      });
    }
    const params = new URLSearchParams({
      q: text,
      format: 'jsonv2',
      limit: '6',
      'accept-language': 'nl',
    });
    const data = await this.fetchJson<NominatimPlace[]>(
      `${this.nominatimUrl}/search?${params}`,
      { headers: { 'User-Agent': USER_AGENT } },
      GEOCODE_TIMEOUT_MS,
    );
    return data.flatMap((p) => {
      const lat = Number(p.lat);
      const lng = Number(p.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return [];
      return [{ name: p.display_name ?? p.name ?? text, lat, lng }];
    });
  }

  /** Short place name for a point, or null when unknown/unavailable. */
  async reverse(lat: number, lng: number): Promise<string | null> {
    try {
      // ~10 m grid: taps on (almost) the same spot reuse the answer.
      return await this.cached(`r:${lat.toFixed(4)},${lng.toFixed(4)}`, () =>
        this.reverseUncached(lat, lng),
      );
    } catch {
      return null;
    }
  }

  private async reverseUncached(lat: number, lng: number): Promise<string | null> {
    if (this.apiKey) {
      const params = new URLSearchParams({
        'point.lat': String(lat),
        'point.lon': String(lng),
        size: '1',
        lang: 'nl',
      });
      const data = await this.fetchJson<OrsGeocode>(
        `${this.baseUrl}/geocode/reverse?${params}`,
        { headers: { Authorization: this.apiKey } },
        GEOCODE_TIMEOUT_MS,
      );
      const p = data.features?.[0]?.properties;
      return p?.name ?? p?.locality ?? p?.label ?? null;
    }
    const params = new URLSearchParams({
      lat: String(lat),
      lon: String(lng),
      format: 'jsonv2',
      zoom: '14',
      'accept-language': 'nl',
    });
    const data = await this.fetchJson<NominatimPlace>(
      `${this.nominatimUrl}/reverse?${params}`,
      { headers: { 'User-Agent': USER_AGENT } },
      GEOCODE_TIMEOUT_MS,
    );
    const a = data.address ?? {};
    return data.name || a.village || a.town || a.city || a.hamlet || data.display_name || null;
  }
}
