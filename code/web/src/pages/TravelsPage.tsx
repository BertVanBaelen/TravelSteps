import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { isTraveller, type TravelSummary } from '@travelsteps/shared';
import { api, errorMessage } from '../api';
import { useUser } from '../auth/AuthContext';
import { useBlog, withTraveller } from '../blog/BlogContext';
import { useConfirm } from '../components/ConfirmDialog';
import { Alert } from '../components/Field';
import { PageActions, usePageTitle } from '../components/PageTitle';
import { TravelStats } from '../components/TravelStats';
import { nl } from '../i18n/nl';
import { formatRange, mediaUrl } from '../lib/format';
import { TravelPeople } from './TravelDetailPage';

export function TravelsPage() {
  usePageTitle(nl.travels.title);
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
        <PageActions>
          <Link to="/reizen/nieuw" className="btn btn-primary btn-small">
            + {nl.travels.new}
          </Link>
        </PageActions>
      )}
      {error && <Alert kind="error">{error}</Alert>}
      {travels === null && !error && <p className="muted center">{nl.loading}</p>}
      {travels?.length === 0 && (
        <div className="card empty">
          <p>{nl.travels.empty}</p>
        </div>
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
              {t.myRole === 'invited' && <span className="badge">{nl.travels.invited}</span>}
            </div>
            <TravelPeople travel={t} />
            <p className="muted">
              {formatRange(t.startDate, t.endDate, nl.travels.ongoing)}
              <br />
              {nl.travels.counts(t.postCount, t.photoCount)}
            </p>
            <TravelStats travel={t} />
            {t.canManage && (
              <div className="row-actions">
                <Link to={`/reizen/${t.id}/bewerken`} className="btn btn-small">
                  {nl.common.edit}
                </Link>
                {t.postCount === 0 && (
                  <button
                    type="button"
                    className="btn btn-small btn-danger"
                    onClick={() => {
                      void confirm({
                        message: nl.travels.confirmDelete(t.name),
                        confirmLabel: nl.common.delete,
                        danger: true,
                      }).then((ok) => {
                        if (ok) void run(() => api(`/travels/${t.id}`, { method: 'DELETE' }));
                      });
                    }}
                  >
                    {nl.common.delete}
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
