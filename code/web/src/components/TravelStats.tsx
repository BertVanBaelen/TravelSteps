import { FIXED_STATS, type FixedStatKey, type TravelSummary } from '@travelsteps/shared';
import { useT } from '../i18n';
import { formatDuration, formatNumber } from '../lib/format';

/** Totals of a travel: route distance plus the summed post statistics. */
export function TravelStats({ travel }: { travel: TravelSummary }) {
  const msg = useT();
  const items = [
    ...(travel.distanceKm > 0 ? [{ key: 'route', label: msg.travels.routeDistance, value: `${formatNumber(travel.distanceKm)} km` }] : []),
    ...travel.stats.map((s) => ({
      key: s.key,
      label: FIXED_STATS.some((d) => d.key === s.key) ? msg.stats[s.key as FixedStatKey] : s.label,
      value: s.key === 'duur' ? `${formatDuration(s.value)} ${msg.stats.hours}` : `${formatNumber(s.value)}${s.unit ? ` ${s.unit}` : ''}`,
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
