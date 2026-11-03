import type { MouseEvent } from 'react';
import { Link } from 'react-router-dom';
import type { PostSummary, TransportMode, TravelSummary } from '@travelsteps/shared';
import { useT } from '../i18n';
import { formatDuration, formatNumber, formatWeekday, mediaUrl } from '../lib/format';
import type { Journey, JourneyRow } from '../lib/journey';
import { dominantMode, stepDistance } from '../lib/travel';
import { FootprintIcon, MoonIcon, PlusIcon, UndoIcon } from './icons';
import { ModeIcon } from './ModeIcon';

const OWN_POWER: TransportMode[] = ['lopen', 'fietsen'];

/**
 * Totals of a travel as big-number tiles that say what they count: under your own power, in
 * total, climbed, and steps with photos (V3-5).
 */
export function JourneyTotals({
  travel,
  steps,
}: {
  travel: TravelSummary;
  steps: PostSummary[] | null;
}) {
  const msg = useT();
  const stat = (key: string) => travel.stats.find((s) => s.key === key);
  const { ownPower, total } = travel.distanceByGroup ?? { ownPower: 0, total: travel.distanceKm };
  const tiles: { key: string; value: string; label: string; sub?: string }[] = [];

  if (ownPower > 0) {
    tiles.push({
      key: 'own',
      value: `${formatNumber(ownPower)} km`,
      label: msg.journey.ownPower,
      sub: msg.journey.ownPowerSub,
    });
  }
  if (total > 0) {
    const other = new Set<TransportMode>();
    for (const p of steps ?? []) {
      for (const s of [...p.segments, ...(p.arrival ? [p.arrival] : [])]) {
        if (!OWN_POWER.includes(s.mode) && (s.distanceKm ?? 0) > 0) other.add(s.mode);
      }
    }
    tiles.push({
      key: 'total',
      value: `${formatNumber(total)} km`,
      label: msg.journey.total,
      sub: msg.journey.totalAlso([...other].map((m) => msg.modes[m].toLowerCase())),
    });
  } else {
    const distance = stat('afstand');
    if (distance) {
      tiles.push({
        key: 'afstand',
        value: `${formatNumber(distance.value)} km`,
        label: msg.journey.distance,
        sub: msg.journey.fromSteps,
      });
    }
  }
  const climbed = stat('hoogtemeters');
  const highest = stat('maxHoogte');
  if (climbed) {
    tiles.push({
      key: 'climbed',
      value: `${formatNumber(climbed.value)} m`,
      label: msg.journey.climbed,
      sub: highest ? msg.journey.highest(`${formatNumber(highest.value)} m`) : undefined,
    });
  } else if (highest) {
    tiles.push({
      key: 'highest',
      value: `${formatNumber(highest.value)} m`,
      label: msg.journey.highestOnly,
    });
  }
  const duration = stat('duur');
  if (duration && tiles.length < 3) {
    tiles.push({
      key: 'duur',
      value: `${formatDuration(duration.value)} ${msg.stats.hours}`,
      label: msg.journey.duration,
      sub: msg.journey.fromSteps,
    });
  }
  const custom = travel.stats
    .filter((s) => s.key.startsWith('custom:'))
    .slice(0, 2)
    .map((s) => `${formatNumber(s.value)} ${s.unit ? `${s.unit} ` : ''}${s.label.toLowerCase()}`);
  tiles.push({
    key: 'steps',
    value: msg.journey.steps(travel.postCount),
    label: msg.timeline.photos(travel.photoCount),
    sub: custom.length > 0 ? msg.journey.and(custom) : undefined,
  });

  return (
    <dl className="journey-totals" aria-label={msg.journey.totals}>
      {tiles.map((t) => (
        <div key={t.key} className="total-tile">
          <dt>{t.label}</dt>
          <dd className="total-value">{t.value}</dd>
          {t.sub && <dd className="total-sub">{t.sub}</dd>}
        </div>
      ))}
    </dl>
  );
}

/** "Lopen · 3,2 km · 448 m", or the temperature when there is nothing else. */
export function stepMeta(post: PostSummary, modes: Record<TransportMode, string>): string {
  const mode = dominantMode(post.segments);
  const km = stepDistance(post);
  const parts = [
    mode && modes[mode],
    km !== null && `${formatNumber(km)} km`,
    typeof post.stats.hoogtemeters === 'number' && `${formatNumber(post.stats.hoogtemeters)} m`,
  ].filter(Boolean);
  if (parts.length === 0 && typeof post.stats.temperatuur === 'number') {
    parts.push(`${formatNumber(post.stats.temperatuur)} °C`);
  }
  return parts.join(' · ');
}

/** "Dag 4 · di 7 juli", or the date with "buiten de reisdatums". */
export function useStepDayText() {
  const msg = useT();
  return (row: Extract<JourneyRow<PostSummary>, { kind: 'step' }>) =>
    row.dayNumber !== null
      ? msg.post.day(row.dayNumber, formatWeekday(row.day))
      : `${formatWeekday(row.day)} · ${msg.journey.outside}`;
}

export const journeyRowId = (postId: string) => `tocht-${postId}`;

/**
 * "De tocht": steps, the legs between them and the empty or rest days, on one route line.
 * Empty days get "Stap toevoegen" and "Rustdag"; rest days "Ongedaan maken".
 */
export function JourneyList({
  travel,
  journey,
  selectedId,
  numbered,
  canMarkRest,
  restDisabled,
  onStepClick,
  onRest,
}: {
  travel: TravelSummary;
  journey: Journey<PostSummary>;
  /** The step chosen on desktop (highlighted, shown on the map). */
  selectedId: string | null;
  /** Desktop: step numbers in the dots. */
  numbered: boolean;
  canMarkRest: boolean;
  restDisabled: boolean;
  onStepClick: (e: MouseEvent, postId: string) => void;
  onRest: (days: string[], rest: boolean) => void;
}) {
  const msg = useT();
  const dayText = useStepDayText();
  const dates = (days: string[]) =>
    days.length === 1
      ? formatWeekday(days[0]!)
      : `${formatWeekday(days[0]!)} – ${formatWeekday(days[days.length - 1]!)}`;

  return (
    <ol className={`journey-list${numbered ? ' journey-numbered' : ''}`}>
      {journey.rows.map((row) => {
        if (row.kind === 'step') {
          const p = row.post;
          const selected = selectedId === p.id;
          const meta = stepMeta(p, msg.modes);
          return (
            <li
              key={row.key}
              id={journeyRowId(p.id)}
              className={`journey-step${row.newest ? ' is-newest' : ''}${selected ? ' is-selected' : ''}`}
            >
              <span className="journey-dot" aria-hidden>
                {numbered ? row.number : null}
              </span>
              <Link
                to={`/post/${p.id}`}
                className="journey-card"
                aria-current={selected ? 'true' : undefined}
                onClick={(e) => onStepClick(e, p.id)}
              >
                {p.coverAssetId ? (
                  <img src={mediaUrl(p.coverAssetId, 'thumbnail')} alt="" loading="lazy" />
                ) : (
                  <span className="journey-thumb" aria-hidden>
                    <FootprintIcon />
                  </span>
                )}
                <span className="journey-card-text">
                  <span className="journey-day">
                    {dayText(row)}
                    {row.newest && <span className="sr-only"> · {msg.journey.newest}</span>}
                  </span>
                  <strong>{p.title}</strong>
                  {meta && <span className="journey-meta">{meta}</span>}
                </span>
              </Link>
            </li>
          );
        }
        if (row.kind === 'leg') {
          const { mode, distanceKm } = row.segment;
          return (
            <li key={row.key} className="journey-leg">
              <span className="journey-leg-icon" aria-hidden>
                <ModeIcon mode={mode} />
              </span>
              <p>
                <strong>{msg.travelBy[mode]}</strong>
                {distanceKm ? ` · ${formatNumber(distanceKm)} km` : ''}
              </p>
            </li>
          );
        }
        const rest = row.kind === 'rest';
        return (
          <li key={row.key} className={`journey-gap${rest ? ' is-rest' : ''}`}>
            <span className="journey-dot-hollow" aria-hidden />
            <div className="journey-gap-card">
              <p>
                <strong>
                  {msg.journey.dayRange(row.first, row.last)} · {dates(row.days)}
                </strong>
                <span>{rest ? msg.journey.restDays(row.days.length) : msg.journey.noStep}</span>
              </p>
              {rest
                ? canMarkRest && (
                    <div className="journey-gap-actions">
                      <button
                        type="button"
                        className="btn btn-small btn-secondary"
                        disabled={restDisabled}
                        onClick={() => onRest(row.days, false)}
                      >
                        <UndoIcon />
                        {msg.journey.undoRest}
                      </button>
                    </div>
                  )
                : (travel.canPost || canMarkRest) && (
                    <div className="journey-gap-actions">
                      {travel.canPost && (
                        <Link
                          to={`/posts/nieuw?reis=${travel.id}&datum=${row.days[0]}`}
                          className="btn btn-small btn-outline"
                        >
                          <PlusIcon />
                          {msg.journey.addStep}
                        </Link>
                      )}
                      {canMarkRest && (
                        <button
                          type="button"
                          className="btn btn-small btn-secondary"
                          disabled={restDisabled}
                          onClick={() => onRest(row.days, true)}
                        >
                          <MoonIcon />
                          {msg.journey.markRest(row.days.length)}
                        </button>
                      )}
                    </div>
                  )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
