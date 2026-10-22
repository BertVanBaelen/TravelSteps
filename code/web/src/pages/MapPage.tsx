import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { MapPost, TravelSummary } from '@travelsteps/shared';
import { api, errorMessage } from '../api';
import { useBlog, withTraveller } from '../blog/BlogContext';
import { Alert } from '../components/Field';
import { EmptyState } from '../components/EmptyState';
import { MapIcon } from '../components/icons';
import { MapView } from '../components/MapView';
import { usePageTitle } from '../components/PageTitle';
import { SkeletonBlock } from '../components/Skeleton';
import { TravelPicker } from '../components/TravelPicker';
import { useT } from '../i18n';
import { TRAVEL_COLORS } from '../lib/map';

const ALL = 'alle';

export function MapPage() {
  const msg = useT();
  usePageTitle(msg.map.title);
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
        <TravelPicker
          travels={travels}
          value={filter}
          allValue={ALL}
          colorFor={travels.length > 1 ? colorFor : undefined}
          onChange={(v) => setParams({ reis: v }, { replace: true })}
        />
      )}
      {error && <Alert kind="error">{error}</Alert>}
      {posts === null && !error && <SkeletonBlock height="60vh" />}
      {posts && (
        <>
          <MapView
            posts={shown}
            colorFor={filter === ALL ? colorFor : undefined}
            arrivals
            onOpen={openPost}
            className="map-full"
          />
          {shown.length === 0 && <EmptyState icon={<MapIcon />} text={msg.map.empty} />}
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
