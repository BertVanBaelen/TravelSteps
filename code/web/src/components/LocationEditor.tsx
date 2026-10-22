import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import {
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
import { useT } from '../i18n';
import { formatNumber } from '../lib/format';
import { DEFAULT_COLOR, createMap, drawSegment, fitTo, isDashed } from '../lib/map';
import { useOnline } from '../offline/db';
import { Alert } from './Field';

import { MapIcon, PhotoIcon, PinIcon, SearchIcon } from './icons';
import { Listbox } from './Listbox';
import { modeOptions } from './ModeIcon';

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
  if (
    arrival &&
    (locations.length === 0 || (previousFirst && !sameLoc(previousFirst, locations[0])))
  ) {
    arrival = { mode: arrival.mode };
  }
  return { locations, segments, arrival };
}

const round6 = (n: number) => Math.round(n * 1e6) / 1e6;

function markerIcon(n: number): L.DivIcon {
  return L.divIcon({
    className: 'loc-marker',
    html: `<span>${n}</span>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}

export function LocationEditor({
  value,
  onChange,
  travelId,
  postId,
  date,
  photos,
  onRoute,
}: Props) {
  const msg = useT();
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
  // Points whose place name is still being looked up ("lat,lng").
  const [naming, setNaming] = useState<ReadonlySet<string>>(() => new Set());

  // Latest value for map event handlers.
  const valueRef = useRef(value);
  valueRef.current = value;
  const addModeRef = useRef(addMode);
  addModeRef.current = addMode;

  const update = (next: RouteValue) =>
    onChange(normalizeRoute(next, valueRef.current.locations[0]));

  async function nameFor(lat: number, lng: number): Promise<string | undefined> {
    if (!navigator.onLine) return undefined;
    try {
      const r = await api<{ name: string | null }>(`/routing/reverse?lat=${lat}&lng=${lng}`);
      return r.name?.slice(0, 120) ?? undefined;
    } catch {
      return undefined;
    }
  }

  const pointKey = (p: { lat: number; lng: number }) => `${p.lat},${p.lng}`;

  /**
   * Adds the points right away (so the marker shows instantly) and looks up missing place names
   * in the background; a name arrives later unless the traveller typed one in the meantime.
   */
  async function addPoints(points: Location[], lookupNames: boolean) {
    const current = valueRef.current;
    const locations = [...current.locations];
    const added: Location[] = [];
    for (const p of points) {
      const loc = { lat: round6(p.lat), lng: round6(p.lng), ...(p.name ? { name: p.name } : {}) };
      if (locations.length >= 50) break;
      if (sameLoc(locations[locations.length - 1], loc)) continue;
      locations.push(loc);
      added.push(loc);
    }
    update({ ...current, locations });

    const unnamed = lookupNames ? added.filter((p) => !p.name) : [];
    if (unnamed.length === 0) return;
    const keys = unnamed.map(pointKey);
    setNaming((s) => new Set([...s, ...keys]));
    await Promise.all(
      unnamed.map(async (p) => {
        const name = await nameFor(p.lat, p.lng);
        setNaming((s) => {
          const next = new Set(s);
          next.delete(pointKey(p));
          return next;
        });
        if (!name) return;
        const latest = valueRef.current;
        const i = latest.locations.findIndex((l) => !l.name && l.lat === p.lat && l.lng === p.lng);
        if (i < 0) return;
        update({
          ...latest,
          locations: latest.locations.map((l, j) => (j === i ? { ...l, name } : l)),
        });
      }),
    );
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
    fitTo(
      map,
      valueRef.current.locations.map((l) => [l.lat, l.lng] as LatLng),
    );
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Toggle via classList: a React className update would wipe Leaflet's own classes
  // (leaflet-container clips the tiles), letting the map spill out of its box.
  useEffect(() => {
    mapEl.current?.classList.toggle('map-adding', addMode);
  }, [addMode]);

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
      drawSegment(
        layer,
        segments[i] ?? { mode: 'lopen' },
        locations[i]!,
        locations[i + 1]!,
        DEFAULT_COLOR,
      );
    }
    locations.forEach((loc, i) => {
      const marker = L.marker([loc.lat, loc.lng], {
        icon: markerIcon(i + 1),
        draggable: true,
      }).addTo(layer);
      if (loc.name) marker.bindTooltip(loc.name);
      marker.on('dragend', () => {
        const p = marker.getLatLng();
        const current = valueRef.current;
        update({
          ...current,
          locations: current.locations.map((l, j) =>
            j === i ? { ...l, lat: round6(p.lat), lng: round6(p.lng) } : l,
          ),
        });
      });
    });
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fit the view when points are added or removed (not on every drag).
  const count = value.locations.length;
  useEffect(() => {
    const map = mapRef.current;
    if (map && count > 0)
      fitTo(
        map,
        valueRef.current.locations.map((l) => [l.lat, l.lng] as LatLng),
      );
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
        // Latest locations: a place name may have arrived while the route was calculated.
        onChange({
          locations: valueRef.current.locations,
          segments: preview.segments,
          arrival: preview.arrival,
        });
        onRoute?.(preview);
      } catch {
        if (!cancelled) setRouteInfo(null);
      } finally {
        if (!cancelled) setRouting(false);
      }
    }, 400);
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
      setError(
        err instanceof Error && !(err as { status?: number }).status
          ? err.message
          : errorMessage(err),
      );
    } finally {
      setBusy(null);
    }
  }

  function addGps() {
    void run('gps', async () => {
      if (!navigator.geolocation) throw new Error(msg.locations.gpsUnavailable);
      const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 20_000,
          maximumAge: 30_000,
        }),
      ).catch(() => {
        throw new Error(msg.locations.gpsFailed);
      });
      await addPoints([{ lat: pos.coords.latitude, lng: pos.coords.longitude }], true);
    });
  }

  function search() {
    if (query.trim().length < 2) return;
    void run('search', async () => {
      const r = await api<{ results: GeocodeResult[] }>(
        `/routing/search?q=${encodeURIComponent(query.trim())}`,
      );
      setResults(r.results);
    });
  }

  function fromPhotos() {
    void run('photos', async () => {
      const assets = await Promise.all(
        photos.map((id) =>
          api<{ asset: ImmichAsset }>(`/immich/assets/${id}`)
            .then((r) => r.asset)
            .catch(() => null),
        ),
      );
      const withGps = assets
        .filter((a): a is ImmichAsset => !!a && a.lat !== null && a.lng !== null)
        .sort((a, b) => (a.takenAt ?? '').localeCompare(b.takenAt ?? ''));
      if (withGps.length === 0) throw new Error(msg.locations.noPhotoGps);
      await addPoints(
        withGps.map((a) => ({
          lat: a.lat!,
          lng: a.lng!,
          ...(a.place ? { name: a.place.slice(0, 120) } : {}),
        })),
        true,
      );
    });
  }

  const setLocation = (i: number, patch: Partial<Location>) =>
    update({
      ...value,
      locations: value.locations.map((l, j) => (j === i ? { ...l, ...patch } : l)),
    });

  function move(i: number, dir: -1 | 1) {
    const locations = [...value.locations];
    const [item] = locations.splice(i, 1);
    locations.splice(i + dir, 0, item!);
    update({ ...value, locations });
  }

  const remove = (i: number) =>
    update({ ...value, locations: value.locations.filter((_, j) => j !== i) });

  const setMode = (i: number, mode: TransportMode) =>
    update({ ...value, segments: value.segments.map((s, j) => (j === i ? { mode } : s)) });

  const noPlaces = value.locations.length === 0;
  const loadingLabel =
    busy === 'gps'
      ? msg.locations.locating
      : busy === 'search'
        ? msg.locations.searching
        : busy === 'photos'
          ? msg.locations.readingPhotos
          : naming.size > 0
            ? msg.locations.lookingUp
            : routing
              ? msg.locations.routing
              : null;

  return (
    <div className="stack location-editor">
      <div className="row-actions">
        <button
          type="button"
          className="btn btn-small btn-secondary"
          onClick={addGps}
          disabled={busy !== null}
        >
          <PinIcon /> {busy === 'gps' ? msg.locations.locating : msg.locations.gps}
        </button>
        <button
          type="button"
          className={`btn btn-small ${addMode ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setAddMode((m) => !m)}
          aria-pressed={addMode}
        >
          <MapIcon /> {addMode ? msg.locations.tapMap : msg.locations.mapTap}
        </button>
        <button
          type="button"
          className="btn btn-small btn-secondary"
          onClick={fromPhotos}
          disabled={!online || photos.length === 0 || busy !== null}
          title={photos.length === 0 ? msg.locations.noPhotos : undefined}
        >
          <PhotoIcon /> {busy === 'photos' ? msg.loading : msg.locations.fromPhotos}
        </button>
      </div>

      <div className="loc-search">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={online ? msg.locations.searchPlaceholder : msg.locations.searchOffline}
          aria-label={msg.locations.search}
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
        <button
          type="button"
          className="btn btn-small btn-secondary"
          onClick={search}
          disabled={!online || busy !== null}
        >
          <SearchIcon />
          {busy === 'search' ? msg.loading : msg.locations.search}
        </button>
      </div>
      {results && (
        <ul className="loc-results">
          {results.length === 0 && <li className="muted">{msg.locations.noResults}</li>}
          {results.map((r, i) => (
            <li key={i}>
              <button
                type="button"
                className="btn-text"
                onClick={() => {
                  setResults(null);
                  setQuery('');
                  void addPoints(
                    [{ lat: r.lat, lng: r.lng, name: r.name.split(',')[0]!.slice(0, 120) }],
                    false,
                  );
                }}
              >
                {r.name}
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && <Alert kind="error">{error}</Alert>}

      <div className="editor-map-wrap" aria-busy={loadingLabel !== null}>
        <div ref={mapEl} className="map editor-map" />
        {loadingLabel && (
          <div className="map-loading" role="status">
            <span className="map-loading-pill">
              <span className="spinner" aria-hidden="true" />
              {loadingLabel}
            </span>
          </div>
        )}
      </div>

      <div className="field">
        <label className="field-label" htmlFor="arrival">
          {msg.locations.arrival}
        </label>
        <Listbox
          id="arrival"
          variant="field"
          title={msg.locations.arrival}
          selected={noPlaces ? '' : (value.arrival?.mode ?? '')}
          disabled={noPlaces}
          onSelect={(id) =>
            update({ ...value, arrival: id ? { mode: id as TransportMode } : null })
          }
          options={[
            {
              id: '',
              label: msg.locations.noArrival,
              icon: (
                <span className="picker-icon picker-icon-muted">
                  <PinIcon />
                </span>
              ),
            },
            ...modeOptions(),
          ]}
        />
        <span className="field-hint">
          {noPlaces ? msg.locations.arrivalNeedsPlace : msg.locations.arrivalHint}
        </span>
      </div>

      {value.locations.length === 0 ? (
        <p className="muted">{msg.locations.empty}</p>
      ) : (
        <ol className="loc-list">
          {value.locations.map((loc, i) => (
            <li key={i}>
              <div className="loc-row">
                <span className="loc-num">{i + 1}</span>
                <input
                  value={loc.name ?? ''}
                  onChange={(e) => setLocation(i, { name: e.target.value || undefined })}
                  placeholder={
                    naming.has(pointKey(loc))
                      ? msg.locations.lookingUp
                      : `${loc.lat.toFixed(4)}, ${loc.lng.toFixed(4)}`
                  }
                  aria-label={msg.locations.name(i + 1)}
                  maxLength={120}
                />
                <button
                  type="button"
                  className="icon-btn"
                  onClick={() => move(i, -1)}
                  disabled={i === 0}
                  aria-label={msg.editor.moveUp}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="icon-btn"
                  onClick={() => move(i, 1)}
                  disabled={i === value.locations.length - 1}
                  aria-label={msg.editor.moveDown}
                >
                  ↓
                </button>
                <button
                  type="button"
                  className="icon-btn btn-danger"
                  onClick={() => remove(i)}
                  aria-label={msg.common.delete}
                >
                  ×
                </button>
              </div>
              {i < value.segments.length && (
                <div className="loc-segment">
                  <Listbox
                    variant="compact"
                    title={msg.locations.mode(i + 1, i + 2)}
                    selected={value.segments[i]!.mode}
                    onSelect={(id) => setMode(i, id as TransportMode)}
                    options={modeOptions()}
                  />
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
          ? msg.locations.routeOffline
          : routing
            ? msg.locations.routing
            : routeInfo && value.locations.length > 1
              ? msg.locations.routeTotal(
                  formatNumber(routeInfo.distanceKm),
                  formatNumber(routeInfo.ascentM),
                )
              : ''}
        {online && routeInfo?.fallback && !routing && ` ${msg.locations.fallback}`}
      </p>
    </div>
  );
}
