import type { ReactElement } from 'react';
import type { Location, Segment, Stats, Travel, UserRef } from '@travelsteps/shared';
import { useUser } from '../auth/AuthContext';
import { useBlog } from '../blog/BlogContext';
import { messages, useT } from '../i18n';
import { formatDuration, formatNumber, formatTime, formatWeekday } from '../lib/format';
import { dayOf, dominantMode, placeLine, travelDay } from '../lib/travel';
import { AvatarStack } from './Avatar';
import { ClockIcon, MountainIcon, PinIcon, RouteIcon, ThermometerIcon } from './icons';
import { ModeIcon } from './ModeIcon';

/** A travel the user can see, from the blog context (null while loading or unknown). */
export function useTravelOf(travelId: string | undefined): Travel | null {
  const { allTravels } = useBlog();
  return (travelId && allTravels?.find((t) => t.id === travelId)) || null;
}

/** "Dag 6 · do 9 juli" (plus " · 16:20" with `time`); only the date outside the travel dates. */
export function DayBadge({
  travel,
  date,
  time = false,
}: {
  travel: Pick<Travel, 'startDate' | 'endDate'> | null;
  date: string;
  time?: boolean;
}) {
  const msg = useT();
  const day = dayOf(date);
  const n = travel ? travelDay(travel, day) : null;
  return (
    <time className="day-badge" dateTime={date}>
      {msg.post.day(n, formatWeekday(day))}
      {time && ` · ${formatTime(date)}`}
    </time>
  );
}

/** "Ramberg → Leknes → Haukland strand" with a pin; nothing when no place has a name. */
export function PlaceLine({ locations }: { locations: Location[] }) {
  const text = placeLine(locations);
  if (!text) return null;
  return (
    <p className="place-line">
      <PinIcon />
      <span>{text}</span>
    </p>
  );
}

export interface Figure {
  key: string;
  icon: ReactElement | null;
  value: string;
  unit: string;
  /** What the number is, for screen readers ("Afstand"). */
  name: string;
  /** Word under the number on the step page ("gefietst", "geklommen"). */
  label: string;
  custom: boolean;
}

/** A step's figures in display order, with an icon and a label that fits the transport mode. */
export function stepFigures(stats: Stats, segments: Segment[]): Figure[] {
  const msg = messages();
  const mode = dominantMode(segments);
  const out: Figure[] = [];
  const add = (f: Omit<Figure, 'custom'>) => out.push({ ...f, custom: false });
  if (typeof stats.afstand === 'number') {
    add({
      key: 'afstand',
      icon: mode ? <ModeIcon mode={mode} /> : <RouteIcon />,
      value: formatNumber(stats.afstand),
      unit: 'km',
      name: msg.stats.afstand,
      label: msg.figureLabels[mode ?? 'afstand'],
    });
  }
  if (typeof stats.hoogtemeters === 'number') {
    add({
      key: 'hoogtemeters',
      icon: <MountainIcon />,
      value: formatNumber(stats.hoogtemeters),
      unit: 'm',
      name: msg.stats.hoogtemeters,
      label: msg.figureLabels.hoogtemeters,
    });
  }
  if (typeof stats.duur === 'number') {
    add({
      key: 'duur',
      icon: <ClockIcon />,
      value: formatDuration(stats.duur),
      unit: msg.stats.hours,
      name: msg.stats.duur,
      label: msg.figureLabels.duur,
    });
  }
  if (typeof stats.temperatuur === 'number') {
    add({
      key: 'temperatuur',
      icon: <ThermometerIcon />,
      value: formatNumber(stats.temperatuur),
      unit: '°C',
      name: msg.stats.temperatuur,
      label: msg.figureLabels.temperatuur,
    });
  }
  if (typeof stats.maxHoogte === 'number') {
    add({
      key: 'maxHoogte',
      icon: <MountainIcon />,
      value: formatNumber(stats.maxHoogte),
      unit: 'm',
      name: msg.stats.maxHoogte,
      label: msg.figureLabels.maxHoogte,
    });
  }
  (stats.custom ?? []).forEach((c, i) =>
    out.push({
      key: `custom-${i}`,
      icon: null,
      value: c.value,
      unit: c.unit ?? '',
      name: c.label,
      label: c.label,
      custom: true,
    }),
  );
  return out;
}

const withUnit = (f: Figure) => (f.unit ? ` ${f.unit}` : '');

/** Small chips on a step card: icon + value ("48 km"), custom figures as "Wafels 3". */
export function StatChips({ stats, segments }: { stats: Stats; segments: Segment[] }) {
  const figures = stepFigures(stats, segments);
  if (figures.length === 0) return null;
  return (
    <ul className="stat-chips">
      {figures.map((f) => (
        <li key={f.key} className="stat-chip">
          {f.custom ? (
            <span>
              {f.label} <strong>{f.value}</strong>
              {withUnit(f)}
            </span>
          ) : (
            <>
              {f.icon}
              <span>
                <span className="sr-only">{f.name}: </span>
                <strong>{f.value}</strong>
                {withUnit(f)}
              </span>
            </>
          )}
        </li>
      ))}
    </ul>
  );
}

/** Labelled tiles on the step page: "48 km gefietst", custom figures as "eigen cijfer". */
export function FigureTiles({
  stats,
  segments,
  headingId,
}: {
  stats: Stats;
  segments: Segment[];
  headingId: string;
}) {
  const msg = useT();
  const figures = stepFigures(stats, segments);
  if (figures.length === 0) return null;
  return (
    <section className="card figures" aria-labelledby={headingId}>
      <h2 id={headingId} className="section-title">
        {msg.post.figures}
      </h2>
      <ul className="figure-grid">
        {figures.map((f) => {
          if (!f.custom) {
            return (
              <li key={f.key} className="figure">
                <span className="figure-icon" aria-hidden>
                  {f.icon}
                </span>
                <span className="figure-text">
                  <strong className="figure-value">
                    {f.value}
                    {withUnit(f)}
                  </strong>
                  <span>{f.label}</span>
                </span>
              </li>
            );
          }
          // A short custom value fits in the square; a longer one becomes the big text.
          const short = f.value.length <= 4;
          return (
            <li key={f.key} className="figure figure-own">
              <span className="figure-icon" aria-hidden>
                {short ? f.value : '#'}
              </span>
              <span className="figure-text">
                {short ? (
                  <strong>
                    {f.label}
                    <span className="sr-only">
                      : {f.value}
                      {withUnit(f)}
                    </span>
                  </strong>
                ) : (
                  <strong className="figure-value">
                    {f.value}
                    {withUnit(f)}
                  </strong>
                )}
                <span>
                  {!short && `${f.label} · `}
                  {short && f.unit && `${f.unit} · `}
                  {msg.post.ownFigure}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Avatar stack + "Marleen, Jonas en Lies vinden dit leuk". */
export function LikersLine({ likers, likeCount }: { likers: UserRef[]; likeCount: number }) {
  const msg = useT();
  const me = useUser();
  if (likeCount === 0 || likers.length === 0) return null;
  return (
    <p className="likers-line">
      <AvatarStack users={likers} max={3} />
      <span>
        {msg.likes.likeThis(
          likers.map((u) => (u.id === me.id ? msg.likes.youSubject : u.displayName)),
          Math.max(0, likeCount - likers.length),
        )}
      </span>
    </p>
  );
}
