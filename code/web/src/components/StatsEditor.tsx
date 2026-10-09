import { FIXED_STATS, type FixedStatKey, type Stats } from '@travelsteps/shared';
import { nl } from '../i18n/nl';
import { formatDuration, parseDuration, parseNumber } from '../lib/format';

export interface StatsForm {
  fixed: Record<FixedStatKey, string>;
  custom: { label: string; value: string; unit: string }[];
}

export function statsToForm(stats: Stats): StatsForm {
  const fixed = {} as Record<FixedStatKey, string>;
  for (const def of FIXED_STATS) {
    const v = stats[def.key];
    fixed[def.key] =
      v === undefined || v === null ? '' : def.key === 'duur' ? formatDuration(v) : String(v).replace('.', ',');
  }
  return {
    fixed,
    custom: (stats.custom ?? []).map((c) => ({ label: c.label, value: c.value, unit: c.unit ?? '' })),
  };
}

/** Throws an Error with a Dutch message when a value is invalid. */
export function formToStats(form: StatsForm): Stats {
  const stats: Stats = { custom: [] };
  for (const def of FIXED_STATS) {
    const raw = form.fixed[def.key].trim();
    if (!raw) continue;
    if (def.key === 'duur') {
      const minutes = parseDuration(raw);
      if (minutes === null) throw new Error(nl.editor.invalidDuration);
      stats.duur = minutes;
    } else {
      const n = parseNumber(raw);
      if (n === null) throw new Error(nl.editor.invalidNumber(def.label));
      stats[def.key] = n;
    }
  }
  stats.custom = form.custom
    .filter((c) => c.label.trim() || c.value.trim())
    .map((c) => ({ label: c.label.trim(), value: c.value.trim(), ...(c.unit.trim() ? { unit: c.unit.trim() } : {}) }));
  return stats;
}

export function StatsEditor({ value, onChange }: { value: StatsForm; onChange: (v: StatsForm) => void }) {
  const setFixed = (key: FixedStatKey, v: string) =>
    onChange({ ...value, fixed: { ...value.fixed, [key]: v } });
  const setCustom = (i: number, patch: Partial<StatsForm['custom'][number]>) =>
    onChange({ ...value, custom: value.custom.map((c, j) => (j === i ? { ...c, ...patch } : c)) });

  return (
    <div className="stack">
      <div className="stats-grid">
        {FIXED_STATS.map((def) => (
          <label key={def.key} className="field">
            <span className="field-label">
              {def.label} <span className="muted">({def.unit})</span>
            </span>
            <input
              inputMode={def.key === 'duur' ? 'text' : 'decimal'}
              placeholder={def.key === 'duur' ? '2:30' : ''}
              value={value.fixed[def.key]}
              onChange={(e) => setFixed(def.key, e.target.value)}
            />
          </label>
        ))}
      </div>

      <span className="field-label">{nl.editor.customStats}</span>
      {value.custom.map((c, i) => (
        <div key={i} className="custom-stat">
          <input
            aria-label={nl.editor.customLabel}
            placeholder={nl.editor.customLabel}
            value={c.label}
            maxLength={40}
            onChange={(e) => setCustom(i, { label: e.target.value })}
          />
          <input
            aria-label={nl.editor.customValue}
            placeholder={nl.editor.customValue}
            value={c.value}
            maxLength={40}
            onChange={(e) => setCustom(i, { value: e.target.value })}
          />
          <input
            aria-label={nl.editor.customUnit}
            placeholder={nl.editor.customUnit}
            value={c.unit}
            maxLength={15}
            onChange={(e) => setCustom(i, { unit: e.target.value })}
          />
          <button
            type="button"
            className="btn btn-small btn-danger"
            aria-label={nl.common.delete}
            onClick={() => onChange({ ...value, custom: value.custom.filter((_, j) => j !== i) })}
          >
            ×
          </button>
        </div>
      ))}
      <button
        type="button"
        className="btn btn-link align-start"
        onClick={() => onChange({ ...value, custom: [...value.custom, { label: '', value: '', unit: '' }] })}
      >
        {nl.editor.addCustom}
      </button>
    </div>
  );
}
