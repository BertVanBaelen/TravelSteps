import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { FeedPage, PostSummary, TravelSummary } from '@travelsteps/shared';
import { api, errorMessage } from '../api';
import { isTraveller } from '@travelsteps/shared';
import { useUser } from '../auth/AuthContext';
import { useBlog, withTraveller } from '../blog/BlogContext';
import { Alert } from '../components/Field';
import { PlusIcon } from '../components/icons';
import { OutboxList } from '../components/OutboxList';
import { PageActions, usePageTitle } from '../components/PageTitle';
import { PostCard } from '../components/PostCard';
import { nl } from '../i18n/nl';

export function TimelinePage() {
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
        <PageActions>
          <select
            className="select-inline"
            aria-label={nl.editor.travel}
            value={travelId}
            onChange={(e) => setParams(e.target.value ? { reis: e.target.value } : {})}
          >
            <option value="">{nl.timeline.allTravels}</option>
            {travels.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </PageActions>
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
        <Link
          to={travels?.some((t) => t.canPost) === false ? '/reizen/nieuw' : '/posts/nieuw'}
          className="fab"
          aria-label={travels?.some((t) => t.canPost) === false ? nl.travels.new : nl.timeline.newPost}
        >
          <PlusIcon />
        </Link>
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
            {nl.common.retry}
          </button>
        </Alert>
      )}
      {posts.map((p) => (
        <PostCard key={p.id} post={p} />
      ))}
      {done && posts.length === 0 && (
        <div className="card empty">
          <p>{!hasTravels && canWrite ? nl.timeline.noTravel : canWrite ? nl.timeline.emptyAdmin : nl.timeline.empty}</p>
        </div>
      )}
      {done && posts.length > 3 && <p className="muted center">{nl.timeline.end}</p>}
      {loading && <p className="muted center">{nl.loading}</p>}
      <div ref={sentinel} className="sentinel" />
    </>
  );
}
