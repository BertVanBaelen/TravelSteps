import { useEffect, useState } from 'react';
import type { ServiceStatus, SettingsResponse } from '@travelsteps/shared';
import { api, errorMessage } from '../api';
import { Alert } from '../components/Field';
import { usePageTitle } from '../components/PageTitle';
import { nl } from '../i18n/nl';

function StatusBadge({ status, okLabel }: { status: ServiceStatus; okLabel: string }) {
  const s = nl.settings;
  if (!status.configured) return <span className="badge badge-off">{s.notConfigured}</span>;
  if (!status.ok) return <span className="badge badge-error">{s.error}</span>;
  return <span className="badge">{okLabel}</span>;
}

export function AdminSettingsPage() {
  usePageTitle(nl.settings.title, { back: '/' });
  const [data, setData] = useState<SettingsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<SettingsResponse>('/admin/settings')
      .then(setData)
      .catch((err) => setError(errorMessage(err)));
  }, []);

  const s = nl.settings;
  return (
    <section className="page">
      {error && <Alert kind="error">{error}</Alert>}
      {!data && !error && <p className="muted center">{nl.loading}</p>}
      {data && (
        <>
          <Alert kind="info">{s.intro[data.mode]}</Alert>
          <div className="card">
            <dl className="kv">
              <dt>{s.version}</dt>
              <dd>{data.version}</dd>
              <dt>{s.mode}</dt>
              <dd>{s.modes[data.mode]}</dd>
            </dl>
          </div>
          <div className="card stack">
            <h2>{s.services}</h2>
            {(
              [
                [s.immich, data.immich, s.ok],
                [s.routing, data.routing, s.configured],
                [s.push, data.push, s.configured],
                [s.backup, data.backup, s.ok],
              ] as const
            ).map(([label, status, okLabel]) => (
              <div key={label} className="service">
                <div className="service-head">
                  <strong>{label}</strong>
                  <StatusBadge status={status} okLabel={okLabel} />
                </div>
                {status.detail && <span className="muted">{status.detail}</span>}
              </div>
            ))}
          </div>
          <div className="card stack">
            <h2>{s.values}</h2>
            <ul className="settings-list">
              {data.settings.map((item) => (
                <li key={item.key}>
                  <div className="setting-head">
                    <strong>{item.label}</strong>
                    <span className="badge badge-off">{s.sources[item.source]}</span>
                  </div>
                  <code className="setting-value">{item.value ?? s.empty}</code>
                  <span className="muted setting-key">{item.key.toLowerCase()}</span>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </section>
  );
}
