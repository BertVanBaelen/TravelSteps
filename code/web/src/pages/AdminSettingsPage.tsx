import { useEffect, useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import type { ServiceStatus, SettingsResponse } from '@travelsteps/shared';
import { api, errorMessage } from '../api';
import { Alert } from '../components/Field';
import { InfoIcon, PlugIcon, SlidersIcon } from '../components/icons';
import { usePageTitle } from '../components/PageTitle';
import { SettingsMenu } from '../components/SettingsMenu';
import { SkeletonCards } from '../components/Skeleton';
import { nl } from '../i18n/nl';

function StatusBadge({ status, okLabel }: { status: ServiceStatus; okLabel: string }) {
  const s = nl.settings;
  if (!status.configured) return <span className="badge badge-off">{s.notConfigured}</span>;
  if (!status.ok) return <span className="badge badge-error">{s.error}</span>;
  return <span className="badge">{okLabel}</span>;
}

function useSettings() {
  const [data, setData] = useState<SettingsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api<SettingsResponse>('/admin/settings')
      .then(setData)
      .catch((err) => setError(errorMessage(err)));
  }, []);
  return { data, error };
}

function services(data: SettingsResponse) {
  const s = nl.settings;
  return [
    [s.immich, data.immich, s.ok],
    [s.routing, data.routing, s.configured],
    [s.push, data.push, s.configured],
    [s.backup, data.backup, s.ok],
  ] as const;
}

/** `/beheer/instellingen`: overview of the (read-only) server settings, grouped in sub pages. */
export function AdminSettingsPage() {
  usePageTitle(nl.settings.title, { back: '/profiel' });
  const { data, error } = useSettings();
  const s = nl.settings;
  const list = data ? services(data) : [];
  const working = list.filter(([, st]) => st.configured && st.ok).length;
  const failing = list.filter(([, st]) => st.configured && !st.ok).length;

  return (
    <section className="page">
      {error && <Alert kind="error">{error}</Alert>}
      {!data && !error && <SkeletonCards count={2} />}
      {data && (
        <>
          <Alert kind="info">{s.intro[data.mode]}</Alert>
          <SettingsMenu
            rows={[
              {
                icon: <InfoIcon />,
                title: s.general,
                summary: `${s.version} ${data.version} · ${s.modes[data.mode]}`,
                to: '/beheer/instellingen/algemeen',
              },
              {
                icon: <PlugIcon />,
                title: s.services,
                summary: failing > 0 ? s.servicesFailing(failing) : s.servicesSummary(working, list.length),
                to: '/beheer/instellingen/koppelingen',
              },
              {
                icon: <SlidersIcon />,
                title: s.values,
                summary: s.valuesSummary(data.settings.length),
                to: '/beheer/instellingen/waarden',
              },
            ]}
          />
        </>
      )}
    </section>
  );
}

const SECTIONS = { algemeen: 'general', koppelingen: 'services', waarden: 'values' } as const;

/** `/beheer/instellingen/:section`. */
export function AdminSettingsSectionPage() {
  const { section = '' } = useParams();
  const key = Object.hasOwn(SECTIONS, section) ? SECTIONS[section as keyof typeof SECTIONS] : null;
  const s = nl.settings;
  usePageTitle(key ? s[key] : s.title, { back: '/beheer/instellingen' });
  const { data, error } = useSettings();
  if (!key) return <Navigate to="/beheer/instellingen" replace />;

  return (
    <section className="page settings-page">
      {error && <Alert kind="error">{error}</Alert>}
      {!data && !error && <SkeletonCards count={1} />}
      {data && key === 'general' && (
        <div className="card">
          <dl className="kv">
            <dt>{s.version}</dt>
            <dd>{data.version}</dd>
            <dt>{s.mode}</dt>
            <dd>{s.modes[data.mode]}</dd>
          </dl>
        </div>
      )}
      {data && key === 'services' && (
        <div className="card stack">
          {services(data).map(([label, status, okLabel]) => (
            <div key={label} className="service">
              <div className="service-head">
                <strong>{label}</strong>
                <StatusBadge status={status} okLabel={okLabel} />
              </div>
              {status.detail && <span className="muted">{status.detail}</span>}
            </div>
          ))}
        </div>
      )}
      {data && key === 'values' && (
        <div className="card stack">
          <p className="muted">{s.intro[data.mode]}</p>
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
      )}
    </section>
  );
}