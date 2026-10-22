import { FIXED_STATS, type Stats } from '@travelsteps/shared';
import { messages } from '../i18n';
import { formatDuration, formatNumber } from '../lib/format';

interface StatItem {
  label: string;
  value: string;
  unit?: string;
}

export function statItems(stats: Stats): StatItem[] {
  const msg = messages();
  const items: StatItem[] = [];
  for (const def of FIXED_STATS) {
    const v = stats[def.key];
    if (v === undefined || v === null) continue;
    items.push(
      def.key === 'duur'
        ? { label: msg.stats[def.key], value: formatDuration(v), unit: msg.stats.hours }
        : { label: msg.stats[def.key], value: formatNumber(v), unit: def.unit },
    );
  }
  for (const c of stats.custom ?? []) items.push({ label: c.label, value: c.value, unit: c.unit });
  return items;
}

export function StatsView({ stats, compact = false }: { stats: Stats; compact?: boolean }) {
  const items = statItems(stats);
  if (items.length === 0) return null;
  const shown = compact ? items.slice(0, 4) : items;
  return (
    <dl className={`stats${compact ? ' stats-compact' : ''}`}>
      {shown.map((s, i) => (
        <div key={i} className="stat">
          <dt>{s.label}</dt>
          <dd>
            {s.value}
            {s.unit && <span className="stat-unit"> {s.unit}</span>}
          </dd>
        </div>
      ))}
    </dl>
  );
}
