import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { MapPost, TravelSummary } from '@travelsteps/shared';
import { api, errorMessage } from '../api';
import { useUser } from '../auth/AuthContext';
import { useBlog } from '../blog/BlogContext';
import { Avatar } from '../components/Avatar';
import { useCelebrate } from '../components/Celebration';
import { useConfirm } from '../components/ConfirmDialog';
import { Fab, FabStack } from '../components/Fab';
import { Alert } from '../components/Field';
import { CheckIcon, CloseIcon, FootprintIcon, LeaveIcon, PencilIcon } from '../components/icons';
import { MapView } from '../components/MapView';
import { Markdown } from '../components/Markdown';
import { PageActions, usePageTitle } from '../components/PageTitle';
import { TravelStats } from '../components/TravelStats';
import { SkeletonCards } from '../components/Skeleton';
import { useT } from '../i18n';

import { formatRange, mediaUrl } from '../lib/format';
import { Feed } from './TimelinePage';

export function TravelDetailPage() {
  const msg = useT();
  const { id = '' } = useParams();
  const me = useUser();
  const { reloadTravellers } = useBlog();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const celebrate = useCelebrate();
  const [travel, setTravel] = useState<TravelSummary | null>(null);
  const [mapPosts, setMapPosts] = useState<MapPost[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  usePageTitle(travel?.name ?? (error ? msg.travels.title : msg.loading), { back: '/reizen' });
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
      const r = await api<{ travel: TravelSummary }>(`/travels/${id}/invitation/accept`, {
        method: 'POST',
      });
      setTravel(r.travel);
      void celebrate('invite');
    });

  const leave = async (declining: boolean) => {
    if (!travel) return;
    if (
      !declining &&
      !(await confirm({
        title: msg.travels.leaveTitle,
        message: msg.travels.confirmLeave(travel.name),
        confirmLabel: msg.travels.leave,
        danger: true,
        icon: <LeaveIcon />,
      }))
    ) {
      return;
    }
    void run(async () => {
      await api(`/travels/${id}/members/${me.id}`, { method: 'DELETE' });
      navigate('/reizen', { replace: true });
    });
  };

  if (error) return <Alert kind="error">{error}</Alert>;
  if (!travel) return <SkeletonCards count={2} media />;

  const accepted = travel.members.filter((m) => m.status === 'accepted');

  return (
    <section className="page">
      {!travel.canManage && travel.myRole === 'member' && (
        <PageActions>
          <button
            type="button"
            className="btn btn-small btn-danger"
            onClick={() => void leave(false)}
          >
            <LeaveIcon />
            {msg.travels.leave}
          </button>
        </PageActions>
      )}
      {(travel.canManage || travel.canPost) && (
        <FabStack>
          {travel.canManage && (
            <Fab
              to={`/reizen/${travel.id}/bewerken`}
              icon={<PencilIcon />}
              label={msg.travelEditor.editTitle}
              secondary={travel.canPost}
              extended={!travel.canPost}
            />
          )}
          {travel.canPost && (
            <Fab
              to={`/posts/nieuw?reis=${travel.id}`}
              icon={<FootprintIcon />}
              label={msg.timeline.newPost}
              extended
            />
          )}
        </FabStack>
      )}
      {travel.myRole === 'invited' && (
        <div className="card stack">
          <p>{msg.travels.inviteBanner(travel.owner.displayName)}</p>
          <div className="row-actions">
            <button
              type="button"
              className="btn btn-primary btn-small"
              onClick={() => void accept()}
            >
              <CheckIcon />
              {msg.notifications.accept}
            </button>
            <button type="button" className="btn btn-small" onClick={() => void leave(true)}>
              <CloseIcon />
              {msg.notifications.decline}
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
          <p className="muted">
            {formatRange(travel.startDate, travel.endDate, msg.travels.ongoing)}
          </p>
          <TravelPeople travel={travel} />
          <p className="muted">{msg.travels.counts(travel.postCount, travel.photoCount)}</p>
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
  const msg = useT();
  const accepted = travel.members.filter((m) => m.status === 'accepted');
  return (
    <div className="travel-people">
      <span className="avatar-stack">
        {[travel.owner, ...accepted].slice(0, 4).map((u) => (
          <Avatar key={u.id} user={u} size="xs" />
        ))}
      </span>
      <span className="muted">
        {msg.travels.by(travel.owner.displayName)}
        {accepted.length > 0 && ` ${msg.travels.with(accepted.map((m) => m.displayName))}`}
      </span>
    </div>
  );
}
