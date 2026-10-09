import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import {
  TRANSPORT_MODES,
  segmentKey,
  type GeocodeResult,
  type ImmichAsset,
  type LatLng,
  type Location,
  type RoutePreview,
  type Segment,
  type TransportMode,
} from '@travelsteps/shared';
import { api, errorMessage } from '../api';
import { nl } from '../i18n/nl';
import { formatNumber } from '../lib/format';
import { DEFAULT_COLOR, createMap, drawSegment, fitTo, isDashed } from '../lib/map';
import { useOnline } from '../offline/db';
import { Alert } from './Field';

export interface RouteValue {
  locations: Location[];
  segments: Segment[];
  arrival: Segment | null;
}

interface Props {
  value: RouteValue;
  onChange: (v: RouteValue) => void;
  travelId: string;
  postId?: string;
  /** ISO date of the post (decides which post comes before it). */
  date: string;
  photos: string[];
  /** Called with the totals of a calculated route. */
  onRoute?: (preview: RoutePreview) => void;
}

const sameLoc = (a: Location | undefined, b: Location | undefined) =>
  !!a && !!b && a.lat === b.lat && a.lng === b.lng;

/** One segment per consecutive pair; cached geometry is kept only while still valid. */
export function normalizeRoute(v: RouteValue, previousFirst?: Location): RouteValue {
  const { locations } = v;
  const segments: Segment[] = [];
  for (let i = 0; i < locations.length - 1; i++) {
    const old = v.segments[i];
    const mode: TransportMode = old?.mode ?? v.segments[i - 1]?.mode ?? v.arrival?.mode ?? 'lopen';
    const key = segmentKey(mode, locations[i]!, locations[i + 1]!);
    segments.push(old && old.key === key ? old : { mode });
  }
  let arrival = v.arrival;
  if (arrival && (locations.length === 0 || (previousFirst && !sameLoc(previousFirst, locations[0])))) {
    arrival = { mode: arrival.mode };
  }
  return { locations, segments, arrival };
}

const round6 = (n: number) => Math.round(n * 1e6) / 1e6;

function markerIcon(n: number): L.DivIcon {
  return L.divIcon({ className: 'loc-marker', html: `<span>${n}</span>`, iconSize: [28, 28], iconAnchor: [14, 14] });
}

export function LocationEditor({ value, onChange, travelId, postId, date, photos, onRoute }: Props) {
  const online = useOnline();
  const mapEl = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const [addMode, setAddMode] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GeocodeResult[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [routeInfo, setRouteInfo] = useState<RoutePreview | null>(null);
  const [routing, setRouting] = useState(false);

  // Latest value for map event handlers.
  const valueRef = useRef(value);
  valueRef.current = value;
  const addModeRef = useRef(addMode);
  addModeRef.current = addMode;

  const update = (next: RouteValue) => onChange(normalizeRoute(next, valueRef.current.locations[0]));

  async function nameFor(lat: number, lng: number): Promise<string | undefined> {
    if (!navigator.onLine) return undefined;
    try {
      const r = await api<{ name: string | null }>(`/routing/reverse?lat=${lat}&lng=${lng}`);
      return r.name?.slice(0, 120) ?? undefined;
    } catch {
      return undefined;
    }
  }

  async function addPoints(points: Location[], lookupNames: boolean) {
    const named = await Promise.all(
      points.map(async (p) => {
        const loc = { lat: round6(p.lat), lng: round6(p.lng), ...(p.name ? { name: p.name } : {}) };
        if (!loc.name && lookupNames) {
          const name = await nameFor(loc.lat, loc.lng);
          if (name) return { ...loc, name };
        }
        return loc;
      }),
    );
    const current = valueRef.current;
    const locations = [...current.locations];
    for (const p of named) {
      if (locations.length >= 50) break;
      if (!sameLoc(locations[locations.length - 1], p)) locations.push(p);
    }
    update({ ...current, locations });
  }

  const addPointsRef = useRef(addPoints);
  addPointsRef.current = addPoints;

  // Create the map once.
  useEffect(() => {
    if (!mapEl.current) return;
    const map = createMap(mapEl.current, true);
    map.on('click', (e: L.LeafletMouseEvent) => {
      if (!addModeRef.current) return;
      setAddMode(false);
      void addPointsRef.current([{ lat: e.latlng.lat, lng: e.latlng.lng }], true);
    });
    mapRef.current = map;
    layerRef.current = L.layerGroup().addTo(map);
    fitTo(map, valueRef.current.locations.map((l) => [l.lat, l.lng] as LatLng));
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Redraw points and lines.
  const pointsSig = value.locations.map((l) => `${l.lat},${l.lng}`).join(';');
  useEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;
    layer.clearLayers();
    const { locations, segments, arrival } = value;
    if (arrival?.geometry && arrival.geometry.length >= 2) {
      L.polyline(arrival.geometry, {
        color: '#6b7280',
        weight: 3,
        dashArray: isDashed(arrival) ? '6 8' : undefined,
      }).addTo(layer);
    }
    for (let i = 0; i < locations.length - 1; i++) {
      drawSegment(layer, segments[i] ?? { mode: 'lopen' }, locations[i]!, locations[i + 1]!, DEFAULT_COLOR);
    }
    locations.forEach((loc, i) => {
      const marker = L.marker([loc.lat, loc.lng], { icon: markerIcon(i + 1), draggable: true }).addTo(layer);
      if (loc.name) marker.bindTooltip(loc.name);
      marker.on('dragend', () => {
        const p = marker.getLatLng();
        const current = valueRef.current;
        update({
          ...current,
          locations: current.locations.map((l, j) => (j === i ? { ...l, lat: round6(p.lat), lng: round6(p.lng) } : l)),
        });
      });
    });
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fit the view when points are added or removed (not on every drag).
  const count = value.locations.length;
  useEffect(() => {
    const map = mapRef.current;
    if (map && count > 0) fitTo(map, valueRef.current.locations.map((l) => [l.lat, l.lng] as LatLng));
  }, [count]);

  // Calculate the route (debounced) when points or modes change.
  const routeSig = JSON.stringify([
    pointsSig,
    value.segments.map((s) => s.mode),
    value.arrival?.mode ?? null,
    travelId,
    date,
  ]);
  useEffect(() => {
    if (!online || (value.locations.length === 0 && !value.arrival)) {
      setRouteInfo(null);
      return;
    }
    let cancelled = false;
    const t = window.setTimeout(async () => {
      setRouting(true);
      try {
        const current = valueRef.current;
        const preview = await api<RoutePreview>('/routing/preview', {
          method: 'POST',
          body: {
            travelId: travelId || undefined,
            postId,
            date,
            locations: current.locations,
            segments: current.segments,
            arrival: current.arrival,
          },
        });
        if (cancelled) return;
        setRouteInfo(preview);
        onChange({ locations: current.locations, segments: preview.segments, arrival: preview.arrival });
        onRoute?.(preview);
      } catch {
        if (!cancelled) setRouteInfo(null);
      } finally {
        if (!cancelled) setRouting(false);
      }
    }, 700);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [routeSig, online]); // eslint-disable-line react-hooks/exhaustive-deps

  async function run(label: string, fn: () => Promise<void>) {
    setBusy(label);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error && !(err as { status?: number }).status ? err.message : errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  function addGps() {
    void run('gps', async () => {
      if (!navigator.geolocation) throw new Error(nl.locations.gpsUnavailable);
      const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 20_000,
          maximumAge: 30_000,
        }),
      ).catch(() => {
        throw new Error(nl.locations.gpsFailed);
      });
      await addPoints([{ lat: pos.coords.latitude, lng: pos.coords.longitude }], true);
    });
  }

  function search() {
    if (query.trim().length < 2) return;
    void run('search', async () => {
      const r = await api<{ results: GeocodeResult[] }>(`/routing/search?q=${encodeURIComponent(query.trim())}`);
      setResults(r.results);
    });
  }

  function fromPhotos() {
    void run('photos', async () => {
      const assets = await Promise.all(
        photos.map((id) => api<{ asset: ImmichAsset }>(`/immich/assets/${id}`).then((r) => r.asset).catch(() => null)),
      );
      const withGps = assets
        .filter((a): a is ImmichAsset => !!a && a.lat !== null && a.lng !== null)
        .sort((a, b) => (a.takenAt ?? '').localeCompare(b.takenAt ?? ''));
      if (withGps.length === 0) throw new Error(nl.locations.noPhotoGps);
      await addPoints(
        withGps.map((a) => ({ lat: a.lat!, lng: a.lng!, ...(a.place ? { name: a.place.slice(0, 120) } : {}) })),
        true,
      );
    });
  }

  const setLocation = (i: number, patch: Partial<Location>) =>
    update({ ...value, locations: value.locations.map((l, j) => (j === i ? { ...l, ...patch } : l)) });

  function move(i: number, dir: -1 | 1) {
    const locations = [...value.locations];
    const [item] = locations.splice(i, 1);
    locations.splice(i + dir, 0, item!);
    update({ ...value, locations });
  }

  const remove = (i: number) => update({ ...value, locations: value.locations.filter((_, j) => j !== i) });

  const setMode = (i: number, mode: TransportMode) =>
    update({ ...value, segments: value.segments.map((s, j) => (j === i ? { mode } : s)) });

  return (
    <div className="stack location-editor">
      <div className="row-actions">
        <button type="button" className="btn btn-small btn-secondary" onClick={addGps} disabled={busy !== null}>
          📍 {busy === 'gps' ? nl.locations.locating : nl.locations.gps}
        </button>
        <button
          type="button"
          className={`btn btn-small ${addMode ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setAddMode((m) => !m)}
          aria-pressed={addMode}
        >
          🗺️ {addMode ? nl.locations.tapMap : nl.locations.mapTap}
        </button>
        <button
          type="button"
          className="btn btn-small btn-secondary"
          onClick={fromPhotos}
          disabled={!online || photos.length === 0 || busy !== null}
          title={photos.length === 0 ? nl.locations.noPhotos : undefined}
        >
          🖼️ {busy === 'photos' ? nl.loading : nl.locations.fromPhotos}
        </button>
      </div>

      <div className="loc-search">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={online ? nl.locations.searchPlaceholder : nl.locations.searchOffline}
          aria-label={nl.locations.search}
          disabled={!online}
          enterKeyHint="search"
          onKeyDown={(e) => {
            // Keep Enter from submitting the surrounding post form.
            if (e.key === 'Enter') {
              e.preventDefault();
              search();
            }
          }}
        />
        <button type="button" className="btn btn-small btn-secondary" onClick={search} disabled={!online || busy !== null}>
          {busy === 'search' ? nl.loading : nl.locations.search}
        </button>
      </div>
      {results && (
        <ul className="loc-results">
          {results.length === 0 && <li className="muted">{nl.locations.noResults}</li>}
          {results.map((r, i) => (
            <li key={i}>
              <button
                type="button"
                className="btn-text"
                onClick={() => {
                  setResults(null);
                  setQuery('');
                  void addPoints([{ lat: r.lat, lng: r.lng, name: r.name.split(',')[0]!.slice(0, 120) }], false);
                }}
              >
                {r.name}
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && <Alert kind="error">{error}</Alert>}

      <div ref={mapEl} className={`map editor-map${addMode ? ' map-adding' : ''}`} />

      <div className="field">
        <label className="field-label" htmlFor="arrival">
          {nl.locations.arrival}
        </label>
        <select
          id="arrival"
          className="select-inline"
          value={value.arrival?.mode ?? ''}
          onChange={(e) => update({ ...value, arrival: e.target.value ? { mode: e.target.value as TransportMode } : null })}
        >
          <option value="">{nl.locations.noArrival}</option>
          {TRANSPORT_MODES.map((m) => (
            <option key={m} value={m}>
              {nl.modes[m]}
            </option>
          ))}
        </select>
        <span className="field-hint">{nl.locations.arrivalHint}</span>
      </div>

      {value.locations.length === 0 ? (
        <p className="muted">{nl.locations.empty}</p>
      ) : (
        <ol className="loc-list">
          {value.locations.map((loc, i) => (
            <li key={i}>
              <div className="loc-row">
                <span className="loc-num">{i + 1}</span>
                <input
                  value={loc.name ?? ''}
                  onChange={(e) => setLocation(i, { name: e.target.value || undefined })}
                  placeholder={`${loc.lat.toFixed(4)}, ${loc.lng.toFixed(4)}`}
                  aria-label={nl.locations.name(i + 1)}
                  maxLength={120}
                />
                <button type="button" className="icon-btn" onClick={() => move(i, -1)} disabled={i === 0} aria-label={nl.editor.moveUp}>
                  ↑
                </button>
                <button
                  type="button"
                  className="icon-btn"
                  onClick={() => move(i, 1)}
                  disabled={i === value.locations.length - 1}
                  aria-label={nl.editor.moveDown}
                >
                  ↓
                </button>
                <button type="button" className="icon-btn btn-danger" onClick={() => remove(i)} aria-label={nl.common.delete}>
                  ×
                </button>
              </div>
              {i < value.segments.length && (
                <div className="loc-segment">
                  <select
                    className="select-inline"
                    value={value.segments[i]!.mode}
                    onChange={(e) => setMode(i, e.target.value as TransportMode)}
                    aria-label={nl.locations.mode(i + 1, i + 2)}
                  >
                    {TRANSPORT_MODES.map((m) => (
                      <option key={m} value={m}>
                        {nl.modes[m]}
                      </option>
                    ))}
                  </select>
                  {value.segments[i]!.distanceKm !== undefined && (
                    <span className="muted">{formatNumber(value.segments[i]!.distanceKm!)} km</span>
                  )}
                </div>
              )}
            </li>
          ))}
        </ol>
      )}

      <p className="muted route-status" aria-live="polite">
        {!online
          ? nl.locations.routeOffline
          : routing
            ? nl.locations.routing
            : routeInfo && value.locations.length > 1
              ? nl.locations.routeTotal(formatNumber(routeInfo.distanceKm), formatNumber(routeInfo.ascentM))
              : ''}
        {online && routeInfo?.fallback && !routing && ` ${nl.locations.fallback}`}
      </p>
    </div>
  );
}
