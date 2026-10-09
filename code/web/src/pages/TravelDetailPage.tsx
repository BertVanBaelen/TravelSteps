import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { MapPost, TravelSummary } from '@travelsteps/shared';
import { api, errorMessage } from '../api';
import { useUser } from '../auth/AuthContext';
import { useBlog } from '../blog/BlogContext';
import { Avatar } from '../components/Avatar';
import { useConfirm } from '../components/ConfirmDialog';
import { Alert } from '../components/Field';
import { MapView } from '../components/MapView';
import { Markdown } from '../components/Markdown';
import { PageActions, usePageTitle } from '../components/PageTitle';
import { TravelStats } from '../components/TravelStats';
import { nl } from '../i18n/nl';
import { formatRange, mediaUrl } from '../lib/format';
import { Feed } from './TimelinePage';

export function TravelDetailPage() {
  const { id = '' } = useParams();
  const me = useUser();
  const { reloadTravellers } = useBlog();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const [travel, setTravel] = useState<TravelSummary | null>(null);
  const [mapPosts, setMapPosts] = useState<MapPost[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  usePageTitle(travel?.name ?? (error ? nl.travels.title : nl.loading), { back: '/reizen' });
  const openPost = useCallback((postId: string) => navigate(`/post/${postId}`), [navigate]);

  useEffect(() => {
    api<{ travel: TravelSummary }>(`/travels/${id}`)
      .then((r) => setTravel(r.travel))
      .catch((err) => setError(errorMessage(err)));
    api<{ posts: MapPost[] }>(`/posts/map?travelId=${id}`)
      .then((r) => setMapPosts(r.posts))
      .catch(() => setMapPosts([]));
  }, [id]);

  async function run(action: () => Promise<void>) {
    setActionError(null);
    try {
      await action();
      reloadTravellers();
    } catch (err) {
      setActionError(errorMessage(err));
    }
  }

  const accept = () =>
    run(async () => {
      const r = await api<{ travel: TravelSummary }>(`/travels/${id}/invitation/accept`, { method: 'POST' });
      setTravel(r.travel);
    });

  const leave = async (declining: boolean) => {
    if (!travel) return;
    if (
      !declining &&
      !(await confirm({ message: nl.travels.confirmLeave(travel.name), confirmLabel: nl.travels.leave, danger: true }))
    ) {
      return;
    }
    void run(async () => {
      await api(`/travels/${id}/members/${me.id}`, { method: 'DELETE' });
      navigate('/reizen', { replace: true });
    });
  };

  if (error) return <Alert kind="error">{error}</Alert>;
  if (!travel) return <p className="muted center">{nl.loading}</p>;

  const accepted = travel.members.filter((m) => m.status === 'accepted');

  return (
    <section className="page">
      {(travel.canManage || travel.myRole === 'member') && (
        <PageActions>
          {travel.canManage ? (
            <Link to={`/reizen/${travel.id}/bewerken`} className="btn btn-small">
              {nl.common.edit}
            </Link>
          ) : (
            <button type="button" className="btn btn-small" onClick={() => void leave(false)}>
              {nl.travels.leave}
            </button>
          )}
        </PageActions>
      )}
      {travel.myRole === 'invited' && (
        <div className="card stack">
          <p>{nl.travels.inviteBanner(travel.owner.displayName)}</p>
          <div className="row-actions">
            <button type="button" className="btn btn-primary btn-small" onClick={() => void accept()}>
              {nl.notifications.accept}
            </button>
            <button type="button" className="btn btn-small" onClick={() => void leave(true)}>
              {nl.notifications.decline}
            </button>
          </div>
        </div>
      )}
      {actionError && <Alert kind="error">{actionError}</Alert>}
      <article className="card travel-card">
        {travel.coverAssetId && (
          <div className="travel-cover">
            <img src={mediaUrl(travel.coverAssetId, 'preview')} alt={travel.name} />
          </div>
        )}
        <div className="stack">
          <p className="muted">{formatRange(travel.startDate, travel.endDate, nl.travels.ongoing)}</p>
          <TravelPeople travel={travel} />
          <p className="muted">{nl.travels.counts(travel.postCount, travel.photoCount)}</p>
          <TravelStats travel={travel} />
          {travel.description && <Markdown>{travel.description}</Markdown>}
        </div>
      </article>
      {mapPosts.some((p) => p.locations.length > 0) && (
        <MapView posts={mapPosts} arrivals className="travel-map" onOpen={openPost} />
      )}
      <Feed travelId={travel.id} canWrite={travel.canPost} hasTravels />
      {accepted.length === 0 && null}
    </section>
  );
}

/** Owner and accepted co-authors of a travel. */
export function TravelPeople({ travel }: { travel: TravelSummary }) {
  const accepted = travel.members.filter((m) => m.status === 'accepted');
  return (
    <div className="travel-people">
      <span className="avatar-stack">
        {[travel.owner, ...accepted].slice(0, 4).map((u) => (
          <Avatar key={u.id} user={u} size="tiny" />
        ))}
      </span>
      <span className="muted">
        {nl.travels.by(travel.owner.displayName)}
        {accepted.length > 0 && ` ${nl.travels.with(accepted.map((m) => m.displayName))}`}
      </span>
    </div>
  );
}
