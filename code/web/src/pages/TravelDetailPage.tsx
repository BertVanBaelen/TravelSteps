import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type MouseEvent,
} from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { FeedPage, PostSummary, TravelSummary } from '@travelsteps/shared';
import { api, errorMessage } from '../api';
import { useUser } from '../auth/AuthContext';
import { useBlog } from '../blog/BlogContext';
import { Avatar } from '../components/Avatar';
import { useCelebrate } from '../components/Celebration';
import { useConfirm } from '../components/ConfirmDialog';
import { Fab, FabStack } from '../components/Fab';
import { Alert } from '../components/Field';
import {
  CheckIcon,
  CloseIcon,
  FootprintIcon,
  LeaveIcon,
  PencilIcon,
  PlusIcon,
} from '../components/icons';
import {
  JourneyList,
  JourneyTotals,
  journeyRowId,
  stepMeta,
  useStepDayText,
} from '../components/Journey';
import { LineLegend } from '../components/LineLegend';
import { MapView } from '../components/MapView';
import { Markdown } from '../components/Markdown';
import { PageActions, usePageTitle } from '../components/PageTitle';
import { SkeletonCards } from '../components/Skeleton';
import { useT } from '../i18n';
import { formatDay, formatDayRange, formatNumber, mediaUrl } from '../lib/format';
import { buildJourney, type Journey } from '../lib/journey';
import { daysBetween, stepDistance, travelAuthors, travelColor, travelDay } from '../lib/travel';
import { DESKTOP_QUERY, useMediaQuery } from '../lib/useMedia';
import { useOnline } from '../offline/db';

/** Every step of a travel (oldest pages first are not needed: the list sorts itself). */
async function loadSteps(travelId: string): Promise<PostSummary[]> {
  const all: PostSummary[] = [];
  let cursor: string | null = null;
  do {
    const q = new URLSearchParams({ limit: '50', travelId });
    if (cursor) q.set('cursor', cursor);
    const page: FeedPage = await api<FeedPage>(`/posts?${q}`);
    all.push(...page.items);
    cursor = page.nextCursor;
  } while (cursor && all.length < 5000);
  return all;
}

/**
 * A travel as one journey (V3-5): header, totals, map and "De tocht" – the steps day by day with
 * the legs between them, empty days and rest days. On desktop the list and a large map sit side by
 * side and the chosen step is highlighted in both.
 */
export function TravelDetailPage() {
  const msg = useT();
  const { id = '' } = useParams();
  const me = useUser();
  const { reloadTravellers } = useBlog();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const celebrate = useCelebrate();
  const online = useOnline();
  const desktop = useMediaQuery(DESKTOP_QUERY);
  const [travel, setTravel] = useState<TravelSummary | null>(null);
  const [steps, setSteps] = useState<PostSummary[] | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  usePageTitle(travel?.name ?? (error ? msg.travels.title : msg.loading), {
    back: '/reizen',
    backLabel: msg.travels.title,
  });
  const openPost = useCallback((postId: string) => navigate(`/post/${postId}`), [navigate]);

  useEffect(() => {
    setTravel(null);
    setSteps(null);
    setChosen(null);
    api<{ travel: TravelSummary }>(`/travels/${id}`)
      .then((r) => setTravel(r.travel))
      .catch((err) => setError(errorMessage(err)));
    loadSteps(id)
      .then(setSteps)
      .catch(() => setSteps([]));
  }, [id]);

  const journey = useMemo(
    () => (travel && steps ? buildJourney(travel, steps) : null),
    [travel, steps],
  );
  const mapSteps = useMemo(() => (steps ?? []).filter((p) => p.locations.length > 0), [steps]);
  const colorFor = useCallback(() => (travel ? travelColor(travel) : '#1b6b45'), [travel]);

  // Desktop: the chosen step, else the newest one.
  const newest = [...(journey?.rows ?? [])].reverse().find((r) => r.kind === 'step');
  const selectedId = desktop ? (chosen ?? (newest?.kind === 'step' ? newest.post.id : null)) : null;

  const choose = useCallback((postId: string) => {
    setChosen(postId);
    document.getElementById(journeyRowId(postId))?.scrollIntoView({ block: 'nearest' });
  }, []);

  /** On desktop the first click chooses a step (map + preview); the second opens it. */
  const onStepClick = (e: MouseEvent, postId: string) => {
    if (desktop && selectedId !== postId) {
      e.preventDefault();
      setChosen(postId);
    }
  };

  async function run(action: () => Promise<void>) {
    setActionError(null);
    try {
      await action();
      reloadTravellers();
    } catch (err) {
      setActionError(errorMessage(err));
    }
  }

  async function setRest(days: string[], rest: boolean) {
    setBusy(true);
    setActionError(null);
    try {
      let latest: TravelSummary | null = null;
      for (const day of days) {
        const r = await api<{ travel: TravelSummary }>(`/travels/${id}/rest-days/${day}`, {
          method: rest ? 'PUT' : 'DELETE',
        });
        latest = r.travel;
      }
      if (latest) setTravel(latest);
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setBusy(false);
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

  const canMarkRest = travel.canPost || me.role === 'admin';
  const newStep = `/posts/nieuw?reis=${travel.id}`;

  return (
    <section className="page journey-page">
      {(travel.canManage || travel.canPost || travel.myRole === 'member') && (
        <PageActions>
          {!travel.canManage && travel.myRole === 'member' && (
            <button
              type="button"
              className="btn btn-small btn-danger"
              onClick={() => void leave(false)}
            >
              <LeaveIcon />
              {msg.travels.leave}
            </button>
          )}
          {travel.canManage && (
            <Link to={`/reizen/${travel.id}/bewerken`} className="btn btn-outline">
              <PencilIcon />
              {msg.common.edit}
            </Link>
          )}
          {travel.canPost && (
            <Link to={newStep} className="btn btn-primary desktop-only">
              <PlusIcon />
              {msg.timeline.newPost}
            </Link>
          )}
        </PageActions>
      )}
      {travel.canPost && (
        <FabStack className="hide-desktop">
          <Fab to={newStep} icon={<FootprintIcon />} label={msg.timeline.newPost} extended />
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

      <div className="journey-layout">
        <JourneyHead travel={travel} />
        <JourneyTotals travel={travel} steps={steps} />
        {mapSteps.length > 0 && (
          <figure className="journey-map">
            <MapView
              posts={mapSteps}
              colorFor={colorFor}
              arrivals
              onOpen={desktop ? undefined : openPost}
              onSelect={desktop ? choose : undefined}
              focusId={selectedId}
              className="travel-map"
            />
            {desktop && selectedId && (
              <MapPreview post={steps!.find((p) => p.id === selectedId)} journey={journey} />
            )}
            <figcaption className="map-legend-card">
              <LineLegend />
            </figcaption>
          </figure>
        )}
        <section className="journey-route" aria-labelledby="de-tocht">
          <header className="journey-route-head">
            <h2 id="de-tocht">{msg.journey.route}</h2>
            {journey && (
              <p className="muted">
                {msg.journey.summary(journey.stepDays, journey.restDays, journey.emptyDays)}
              </p>
            )}
          </header>
          {!online && canMarkRest && <Alert kind="info">{msg.journey.restOffline}</Alert>}
          {journey === null && <SkeletonCards count={2} />}
          {journey && journey.rows.length === 0 && <p className="muted">{msg.journey.noSteps}</p>}
          {journey && journey.rows.length > 0 && (
            <JourneyList
              travel={travel}
              journey={journey}
              selectedId={selectedId}
              numbered={desktop}
              canMarkRest={canMarkRest}
              restDisabled={busy || !online}
              onStepClick={onStepClick}
              onRest={(days, rest) => void setRest(days, rest)}
            />
          )}
        </section>
      </div>
    </section>
  );
}

/** Cover in the travel's colour ring, name, dates, travellers and description. */
function JourneyHead({ travel }: { travel: TravelSummary }) {
  const msg = useT();
  const authors = travelAuthors(travel);
  const today = travelDay(travel);
  const dates = travel.endDate
    ? `${formatDayRange(travel.startDate, travel.endDate)} · ${msg.journey.days(daysBetween(travel.startDate, travel.endDate) + 1)}`
    : `${formatDay(travel.startDate)} – ${msg.travels.ongoing}${today !== null ? ` · ${msg.context.day(today)}` : ''}`;
  return (
    <header className="journey-head" style={{ '--swatch': travelColor(travel) } as CSSProperties}>
      {travel.coverAssetId && (
        <img className="journey-cover" src={mediaUrl(travel.coverAssetId, 'preview')} alt="" />
      )}
      <div className="journey-title">
        <h1>{travel.name}</h1>
        <p className="journey-dates">{dates}</p>
        <p className="journey-people">
          <span className="avatar-stack">
            {authors.slice(0, 4).map((u) => (
              <Avatar key={u.id} user={u} size="s" />
            ))}
          </span>
          <span>{msg.context.names(authors.map((u) => u.displayName))}</span>
        </p>
      </div>
      {travel.description && (
        <div className="card journey-description">
          <Markdown>{travel.description}</Markdown>
        </div>
      )}
    </header>
  );
}

/** Desktop: the chosen step on the map, with "Open stap". */
function MapPreview({
  post,
  journey,
}: {
  post: PostSummary | undefined;
  journey: Journey<PostSummary> | null;
}) {
  const msg = useT();
  const dayText = useStepDayText();
  const row = journey?.rows.find((r) => r.kind === 'step' && r.post.id === post?.id);
  if (!post || row?.kind !== 'step') return null;
  const km = stepDistance(post);
  const facts = [
    km !== null && `${formatNumber(km)} km`,
    typeof post.stats.hoogtemeters === 'number' &&
      `${formatNumber(post.stats.hoogtemeters)} m ${msg.figureLabels.hoogtemeters}`,
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <div className="map-preview">
      {post.coverAssetId && <img src={mediaUrl(post.coverAssetId, 'thumbnail')} alt="" />}
      <div className="map-preview-text">
        <span className="journey-day">
          {msg.journey.stepNumber(row.number)} · {dayText(row)}
        </span>
        <strong>{post.title}</strong>
        {(facts || stepMeta(post, msg.modes)) && (
          <span className="journey-meta">{facts || stepMeta(post, msg.modes)}</span>
        )}
        <Link to={`/post/${post.id}`} className="btn btn-primary btn-small">
          {msg.journey.openStep}
        </Link>
      </div>
    </div>
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
