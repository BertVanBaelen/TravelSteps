import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { MapPost, TravelSummary } from '@travelsteps/shared';
import { api, errorMessage } from '../api';
import { useBlog, withTraveller } from '../blog/BlogContext';
import { Alert } from '../components/Field';
import { MapView } from '../components/MapView';
import { PageActions, usePageTitle } from '../components/PageTitle';
import { nl } from '../i18n/nl';
import { TRAVEL_COLORS } from '../lib/map';

const ALL = 'alle';

export function MapPage() {
  usePageTitle(nl.map.title);
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [travels, setTravels] = useState<TravelSummary[] | null>(null);
  const [posts, setPosts] = useState<MapPost[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { selected } = useBlog();

  useEffect(() => {
    const q = withTraveller(new URLSearchParams(), selected);
    setPosts(null);
    Promise.all([api<{ travels: TravelSummary[] }>(`/travels?${q}`), api<{ posts: MapPost[] }>(`/posts/map?${q}`)])
      .then(([t, p]) => {
        setTravels(t.travels);
        setPosts(p.posts);
      })
      .catch((err) => setError(errorMessage(err)));
  }, [selected]);

  const requested = params.get('reis') ?? ALL;
  // A travel from another blog falls back to all travels.
  const filter = requested === ALL || travels?.some((t) => t.id === requested) ? requested : ALL;

  const colors = useMemo(() => {
    const m = new Map<string, string>();
    // Oldest travel first, so colours stay stable when a new travel is added.
    [...(travels ?? [])].reverse().forEach((t, i) => m.set(t.id, TRAVEL_COLORS[i % TRAVEL_COLORS.length]!));
    return m;
  }, [travels]);
  const colorFor = useCallback((id: string) => colors.get(id) ?? TRAVEL_COLORS[0]!, [colors]);
  const openPost = useCallback((id: string) => navigate(`/post/${id}`), [navigate]);

  const shown = useMemo(
    () => (posts ?? []).filter((p) => p.locations.length > 0 && (filter === ALL || p.travelId === filter)),
    [posts, filter],
  );
  const shownTravels = (travels ?? []).filter((t) => filter === ALL || t.id === filter);

  return (
    <section className="page map-page">
      {travels && travels.length > 0 && (
        <PageActions>
          <select
            className="select-inline"
            aria-label={nl.map.filter}
            value={filter}
            onChange={(e) => setParams({ reis: e.target.value }, { replace: true })}
          >
            <option value={ALL}>{nl.timeline.allTravels}</option>
            {travels.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </PageActions>
      )}
      {error && <Alert kind="error">{error}</Alert>}
      {posts === null && !error && <p className="muted center">{nl.loading}</p>}
      {posts && (
        <>
          <MapView
            posts={shown}
            colorFor={filter === ALL ? colorFor : undefined}
            arrivals
            onOpen={openPost}
            className="map-full"
          />
          {shown.length === 0 && <p className="muted center">{nl.map.empty}</p>}
          {filter === ALL && shownTravels.length > 1 && (
            <ul className="map-legend">
              {shownTravels.map((t) => (
                <li key={t.id}>
                  <span className="legend-swatch" style={{ background: colorFor(t.id) }} />
                  {t.name}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
