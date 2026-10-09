import type { TravelSummary } from '@travelsteps/shared';
import { nl } from '../i18n/nl';
import { formatDuration, formatNumber } from '../lib/format';

/** Totals of a travel: route distance plus the summed post statistics. */
export function TravelStats({ travel }: { travel: TravelSummary }) {
  const items = [
    ...(travel.distanceKm > 0 ? [{ key: 'route', label: nl.travels.routeDistance, value: `${formatNumber(travel.distanceKm)} km` }] : []),
    ...travel.stats.map((s) => ({
      key: s.key,
      label: s.label,
      value: s.key === 'duur' ? `${formatDuration(s.value)} u` : `${formatNumber(s.value)}${s.unit ? ` ${s.unit}` : ''}`,
    })),
  ];
  if (items.length === 0) return null;
  return (
    <dl className="stats travel-stats">
      {items.map((s) => (
        <div key={s.key} className="stat">
          <dt>{s.label}</dt>
          <dd>{s.value}</dd>
        </div>
      ))}
    </dl>
  );
}
