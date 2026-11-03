import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { MapPost } from '@travelsteps/shared';
import { api, errorMessage } from '../api';
import { ALL_TRAVELS, useBlog, withTraveller } from '../blog/BlogContext';
import { Alert } from '../components/Field';
import { EmptyState } from '../components/EmptyState';
import { MapIcon } from '../components/icons';
import { LineLegend } from '../components/LineLegend';
import { MapView } from '../components/MapView';
import { usePageTitle } from '../components/PageTitle';
import { SkeletonBlock } from '../components/Skeleton';
import { useT } from '../i18n';
import { travelColor } from '../lib/travel';

export function MapPage() {
  const msg = useT();
  usePageTitle(msg.map.title);
  const navigate = useNavigate();
  // "Grote kaart" on the step page opens the map on that step.
  const [params] = useSearchParams();
  const focus = params.get('post');
  const [posts, setPosts] = useState<MapPost[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // The travel and diary come from the context bar in the header.
  const { selected, travels, travelId } = useBlog();

  useEffect(() => {
    setPosts(null);
    api<{ posts: MapPost[] }>(`/posts/map?${withTraveller(new URLSearchParams(), selected)}`)
      .then((p) => setPosts(p.posts))
      .catch((err) => setError(errorMessage(err)));
  }, [selected]);

  const colors = useMemo(
    () => new Map((travels ?? []).map((t) => [t.id, travelColor(t)])),
    [travels],
  );
  const colorFor = useCallback(
    (id: string) => colors.get(id) ?? travelColor({ color: 'forest' }),
    [colors],
  );
  const openPost = useCallback((id: string) => navigate(`/post/${id}`), [navigate]);

  const shown = useMemo(
    () =>
      (posts ?? []).filter(
        (p) =>
          p.locations.length > 0 &&
          (travelId === ALL_TRAVELS || p.travelId === travelId || p.id === focus),
      ),
    [posts, travelId, focus],
  );
  const focusId = shown.some((p) => p.id === focus) ? focus : null;
  const shownTravels = (travels ?? []).filter(
    (t) =>
      shown.some((p) => p.travelId === t.id) && (travelId === ALL_TRAVELS || t.id === travelId),
  );

  return (
    <section className="page map-page">
      {error && <Alert kind="error">{error}</Alert>}
      {posts === null && !error && <SkeletonBlock height="60vh" />}
      {posts && (
        <>
          <MapView
            posts={shown}
            colorFor={colorFor}
            arrivals
            onOpen={openPost}
            focusId={focusId}
            className="map-full"
          />
          {shown.length === 0 && <EmptyState icon={<MapIcon />} text={msg.map.empty} />}
          {shown.length > 0 && <LineLegend />}
          {travelId === ALL_TRAVELS && shownTravels.length > 1 && (
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
