import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { FeedPage, PostSummary, TravelSummary } from '@travelsteps/shared';
import { api, errorMessage } from '../api';
import { isTraveller } from '@travelsteps/shared';
import { useUser } from '../auth/AuthContext';
import { useBlog, withTraveller } from '../blog/BlogContext';
import { Alert } from '../components/Field';
import { EmptyState } from '../components/EmptyState';
import { Fab, FabStack } from '../components/Fab';
import { FootprintIcon, PlaneIcon, PlusIcon, TravelIcon } from '../components/icons';
import { OutboxList } from '../components/OutboxList';
import { usePageTitle } from '../components/PageTitle';
import { PostCard } from '../components/PostCard';
import { SkeletonCards } from '../components/Skeleton';
import { TravelPicker } from '../components/TravelPicker';
import { useT } from '../i18n';

export function TimelinePage() {
  const msg = useT();
  usePageTitle(null);
  const user = useUser();
  const canWrite = isTraveller(user.role);
  const { selected } = useBlog();
  const [params, setParams] = useSearchParams();
  const [travels, setTravels] = useState<TravelSummary[] | null>(null);
  const requested = params.get('reis') ?? '';
  // A travel from another blog is ignored after switching blogs.
  const travelId = travels && !travels.some((t) => t.id === requested) ? '' : requested;

  useEffect(() => {
    setTravels(null);
    api<{ travels: TravelSummary[] }>(`/travels?${withTraveller(new URLSearchParams(), selected)}`)
      .then((r) => setTravels(r.travels))
      .catch(() => setTravels([]));
  }, [selected]);

  return (
    <section className="page">
      {travels && travels.length > 1 && (
        <TravelPicker
          travels={travels}
          value={travelId}
          allValue=""
          onChange={(v) => setParams(v ? { reis: v } : {})}
        />
      )}
      {canWrite && <OutboxList />}
      <Feed
        key={`${selected}|${travelId}`}
        travelId={travelId}
        traveller={selected}
        canWrite={canWrite}
        hasTravels={(travels?.length ?? 1) > 0}
      />
      {canWrite && (
        <FabStack>
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

export function Feed({
  travelId,
  traveller = '',
  canWrite,
  hasTravels,
}: {
  travelId: string;
  traveller?: string;
  canWrite: boolean;
  hasTravels: boolean;
}) {
  const msg = useT();
  const [posts, setPosts] = useState<PostSummary[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sentinel = useRef<HTMLDivElement>(null);

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
    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) void loadMore();
    }, { rootMargin: '600px' });
    observer.observe(el);
    return () => observer.disconnect();
  }, [loadMore, error, done]);

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
      {posts.map((p) => (
        <PostCard key={p.id} post={p} />
      ))}
      {done && posts.length === 0 && (
        <EmptyState
          icon={!hasTravels && canWrite ? <TravelIcon /> : <FootprintIcon />}
          text={!hasTravels && canWrite ? msg.timeline.noTravel : canWrite ? msg.timeline.emptyAdmin : msg.timeline.empty}
          action={
            canWrite && (
              <Link
                to={hasTravels ? (travelId ? `/posts/nieuw?reis=${travelId}` : '/posts/nieuw') : '/reizen/nieuw'}
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
