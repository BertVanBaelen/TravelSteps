import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { isTraveller, type TravelSummary } from '@travelsteps/shared';
import { api, errorMessage } from '../api';
import { useUser } from '../auth/AuthContext';
import { useBlog, withTraveller } from '../blog/BlogContext';
import { useConfirm } from '../components/ConfirmDialog';
import { EmptyState } from '../components/EmptyState';
import { Alert } from '../components/Field';
import { Fab, FabStack } from '../components/Fab';
import { PencilIcon, PlaneIcon, PlusIcon, TrashIcon, TravelIcon } from '../components/icons';
import { SkeletonCards } from '../components/Skeleton';
import { usePageTitle } from '../components/PageTitle';
import { TravelStats } from '../components/TravelStats';
import { useT } from '../i18n';
import { formatRange, mediaUrl } from '../lib/format';
import { TravelPeople } from './TravelDetailPage';

export function TravelsPage() {
  const msg = useT();
  usePageTitle(msg.travels.title);
  const canCreate = isTraveller(useUser().role);
  const { selected } = useBlog();
  const confirm = useConfirm();
  const [travels, setTravels] = useState<TravelSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api<{ travels: TravelSummary[] }>(`/travels?${withTraveller(new URLSearchParams(), selected)}`)
      .then((r) => setTravels(r.travels))
      .catch((err) => setError(errorMessage(err)));
  }, [selected]);

  useEffect(load, [load]);

  async function run(action: () => Promise<unknown>) {
    setError(null);
    try {
      await action();
      load();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <section className="page">
      {canCreate && (
        <FabStack>
          <Fab to="/reizen/nieuw" icon={<PlaneIcon />} label={msg.travels.new} extended />
        </FabStack>
      )}
      {error && <Alert kind="error">{error}</Alert>}
      {travels === null && !error && <SkeletonCards count={2} media />}
      {travels?.length === 0 && (
        <EmptyState
          icon={<TravelIcon />}
          text={msg.travels.empty}
          action={
            canCreate && (
              <Link to="/reizen/nieuw" className="btn btn-primary btn-small">
                <PlusIcon />
                {msg.travels.new}
              </Link>
            )
          }
        />
      )}
      {travels?.map((t) => (
        <article key={t.id} className="card travel-card">
          {t.coverAssetId && (
            <Link to={`/reizen/${t.id}`} className="travel-cover">
              <img src={mediaUrl(t.coverAssetId, 'preview')} alt={t.name} loading="lazy" />
            </Link>
          )}
          <div className="stack">
            <div className="travel-head">
              <h2>
                <Link to={`/reizen/${t.id}`}>{t.name}</Link>
              </h2>
              {t.myRole === 'invited' && <span className="badge">{msg.travels.invited}</span>}
            </div>
            <TravelPeople travel={t} />
            <p className="muted">
              {formatRange(t.startDate, t.endDate, msg.travels.ongoing)}
              <br />
              {msg.travels.counts(t.postCount, t.photoCount)}
            </p>
            <TravelStats travel={t} />
            {t.canManage && (
              <div className="row-actions">
                <Link to={`/reizen/${t.id}/bewerken`} className="btn btn-small">
                  <PencilIcon />
                  {msg.common.edit}
                </Link>
                {t.postCount === 0 && (
                  <button
                    type="button"
                    className="btn btn-small btn-danger"
                    onClick={() => {
                      void confirm({
                        title: msg.travels.deleteTitle,
                        message: msg.travels.confirmDelete(t.name),
                        confirmLabel: msg.common.delete,
                        danger: true,
                      }).then((ok) => {
                        if (ok) void run(() => api(`/travels/${t.id}`, { method: 'DELETE' }));
                      });
                    }}
                  >
                    <TrashIcon />
                    {msg.common.delete}
                  </button>
                )}
              </div>
            )}
          </div>
        </article>
      ))}
    </section>
  );
}
