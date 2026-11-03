import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { FeedPage, PostSummary } from '@travelsteps/shared';
import { api, errorMessage } from '../api';
import { isTraveller } from '@travelsteps/shared';
import { useUser } from '../auth/AuthContext';
import { useBlog, withTraveller } from '../blog/BlogContext';
import { Alert } from '../components/Field';
import { EmptyState } from '../components/EmptyState';
import { Fab, FabStack } from '../components/Fab';
import { FootprintIcon, PlaneIcon, PlusIcon, TravelIcon } from '../components/icons';
import { LineLegend } from '../components/LineLegend';
import { MapView } from '../components/MapView';
import { ModeIcon } from '../components/ModeIcon';
import { OutboxList } from '../components/OutboxList';
import { usePageTitle } from '../components/PageTitle';
import { PostCard, cardId } from '../components/PostCard';
import { SkeletonCards } from '../components/Skeleton';
import { useTravelOf } from '../components/Step';
import { useT } from '../i18n';
import { formatNumber } from '../lib/format';
import { prefersReducedMotion } from '../lib/map';
import { dayOf, daysBetween, stepDay, travelColor } from '../lib/travel';
import { DESKTOP_QUERY, useMediaQuery } from '../lib/useMedia';

export function TimelinePage() {
  const msg = useT();
  usePageTitle(null);
  const user = useUser();
  const canWrite = isTraveller(user.role);
  // The travel and diary come from the context bar in the header.
  const { selected, travels, travelId } = useBlog();
  const desktop = useMediaQuery(DESKTOP_QUERY);
  const feedKey = `${selected}|${travelId}`;
  const [posts, setPosts] = useState<PostSummary[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    setPosts([]);
    setActiveId(null);
  }, [feedKey]);

  // A marker on the desktop map scrolls the feed to its card.
  const select = useCallback((id: string) => {
    setActiveId(id);
    document.getElementById(cardId(id))?.scrollIntoView({
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
      block: 'start',
    });
  }, []);

  return (
    <section className="page timeline-page">
      <div className="feed-layout">
        <div className="feed-column">
          {canWrite && <OutboxList />}
          <Feed
            key={feedKey}
            travelId={travelId}
            traveller={selected}
            canWrite={canWrite}
            hasTravels={(travels?.length ?? 1) > 0}
            onPosts={setPosts}
            activeId={desktop ? activeId : null}
            onActive={desktop ? setActiveId : undefined}
          />
        </div>
        {desktop && <FeedMap posts={posts} activeId={activeId} onSelect={select} />}
      </div>
      {canWrite && (
        <FabStack className="phone-only">
          {travels?.some((t) => t.canPost) === false ? (
            <Fab to="/reizen/nieuw" icon={<PlaneIcon />} label={msg.travels.new} extended />
          ) : (
            <Fab
              to={travelId ? `/posts/nieuw?reis=${travelId}` : '/posts/nieuw'}
              icon={<FootprintIcon />}
              label={msg.timeline.newPost}
              extended
            />
          )}
        </FabStack>
      )}
    </section>
  );
}

/** Desktop: the map next to the feed follows the step you are reading. */
function FeedMap({
  posts,
  activeId,
  onSelect,
}: {
  posts: PostSummary[];
  activeId: string | null;
  onSelect: (id: string) => void;
}) {
  const msg = useT();
  const { allTravels } = useBlog();
  const colors = useMemo(
    () => new Map((allTravels ?? []).map((t) => [t.id, travelColor(t)])),
    [allTravels],
  );
  const colorFor = useCallback(
    (id: string) => colors.get(id) ?? travelColor({ color: 'forest' }),
    [colors],
  );
  const shown = useMemo(() => posts.filter((p) => p.locations.length > 0), [posts]);
  const active = posts.find((p) => p.id === activeId);
  const travel = useTravelOf(active?.travelId);
  const day = active && travel ? stepDay(travel, active.date) : null;
  const place = [...(active?.locations ?? [])].reverse().find((l) => l.name)?.name ?? active?.title;

  return (
    <aside className="feed-map" aria-label={msg.timeline.feedMap}>
      <MapView
        posts={shown}
        colorFor={colorFor}
        arrivals
        focusId={active && active.locations.length > 0 ? active.id : null}
        onSelect={onSelect}
        className="feed-map-view"
      />
      {active && (
        <div className="map-label">
          {day !== null && (
            <span className="map-label-number" aria-hidden>
              {day}
            </span>
          )}
          <span>
            <strong>{place}</strong>
            <span>{msg.timeline.nowReading}</span>
          </span>
        </div>
      )}
      {shown.length > 0 && (
        <div className="map-legend-card">
          <LineLegend />
        </div>
      )}
    </aside>
  );
}

/** Dashed line between two cards: how the travellers got to the newer step, and when. */
function RouteLeg({ newer, older }: { newer: PostSummary; older: PostSummary }) {
  const msg = useT();
  const gap = daysBetween(dayOf(older.date), dayOf(newer.date));
  const leg = newer.arrival;
  const when = msg.timeline.daysEarlier(gap);
  return (
    <div className="route-leg">
      <span className="route-leg-icon" aria-hidden>
        {leg ? <ModeIcon mode={leg.mode} /> : <FootprintIcon />}
      </span>
      <p>
        {leg ? (
          <>
            <strong>{msg.travelBy[leg.mode]}</strong>
            {leg.distanceKm ? ` · ${formatNumber(leg.distanceKm)} km` : ''} · {when}
          </>
        ) : (
          when.charAt(0).toUpperCase() + when.slice(1)
        )}
      </p>
    </div>
  );
}

export function Feed({
  travelId,
  traveller = '',
  canWrite,
  hasTravels,
  onPosts,
  activeId = null,
  onActive,
}: {
  travelId: string;
  traveller?: string;
  canWrite: boolean;
  hasTravels: boolean;
  /** Called with all loaded posts (for the desktop map). */
  onPosts?: (posts: PostSummary[]) => void;
  activeId?: string | null;
  /** Reports the card nearest the top third of the screen. */
  onActive?: (id: string) => void;
}) {
  const msg = useT();
  const [posts, setPosts] = useState<PostSummary[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sentinel = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);

  const loadMore = useCallback(async () => {
    if (loading || done) return;
    setLoading(true);
    setError(null);
    try {
      const q = new URLSearchParams({ limit: '10' });
      if (travelId) q.set('travelId', travelId);
      else withTraveller(q, traveller);
      if (cursor) q.set('cursor', cursor);
      const page = await api<FeedPage>(`/posts?${q}`);
      setPosts((p) => [...p, ...page.items]);
      setCursor(page.nextCursor);
      setDone(page.nextCursor === null);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [loading, done, travelId, traveller, cursor]);

  useEffect(() => {
    const el = sentinel.current;
    if (!el || error || done) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) void loadMore();
      },
      { rootMargin: '600px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [loadMore, error, done]);

  useEffect(() => onPosts?.(posts), [posts, onPosts]);

  // The card crossing a band at the top third of the screen is the one being read.
  useEffect(() => {
    const root = list.current;
    if (!onActive || !root) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const hit = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        const id = (hit?.target as HTMLElement | undefined)?.dataset.postId;
        if (id) onActive(id);
      },
      { rootMargin: '-30% 0px -60% 0px' },
    );
    root.querySelectorAll('[data-post-id]').forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [posts, onActive]);

  return (
    <>
      {error && (
        <Alert kind="error">
          {error}{' '}
          <button type="button" className="btn-text" onClick={() => void loadMore()}>
            {msg.common.retry}
          </button>
        </Alert>
      )}
      {posts.length > 0 && (
        <div className="feed" ref={list}>
          {posts.map((p, i) => {
            const older = posts[i + 1];
            return (
              <FeedItem key={p.id}>
                <PostCard post={p} showTravel={!travelId} active={p.id === activeId} />
                {older && older.travelId === p.travelId && <RouteLeg newer={p} older={older} />}
              </FeedItem>
            );
          })}
        </div>
      )}
      {done && posts.length === 0 && (
        <EmptyState
          icon={!hasTravels && canWrite ? <TravelIcon /> : <FootprintIcon />}
          text={
            !hasTravels && canWrite
              ? msg.timeline.noTravel
              : canWrite
                ? msg.timeline.emptyAdmin
                : msg.timeline.empty
          }
          action={
            canWrite && (
              <Link
                to={
                  hasTravels
                    ? travelId
                      ? `/posts/nieuw?reis=${travelId}`
                      : '/posts/nieuw'
                    : '/reizen/nieuw'
                }
                className="btn btn-primary btn-small"
              >
                <PlusIcon />
                {hasTravels ? msg.timeline.newPost : msg.travels.new}
              </Link>
            )
          }
        />
      )}
      {done && posts.length > 3 && <p className="muted center">{msg.timeline.end}</p>}
      {loading && <SkeletonCards count={posts.length === 0 ? 3 : 1} media />}
      <div ref={sentinel} className="sentinel" />
    </>
  );
}

/** A card and the route line under it; one grid cell on tablets. */
function FeedItem({ children }: { children: ReactNode }) {
  return <div className="feed-item">{children}</div>;
}
