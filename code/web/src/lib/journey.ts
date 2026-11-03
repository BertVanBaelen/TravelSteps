import type { Segment, Travel } from '@travelsteps/shared';
import { addDays, dayOf, daysBetween, localDay, travelDay } from './travel';

/** What the route list needs of a step. */
export interface JourneyStep {
  id: string;
  date: string;
  arrival: Segment | null;
}

export type JourneyRow<P> =
  | {
      kind: 'step';
      key: string;
      post: P;
      day: string;
      /** Null for a step outside the travel dates. */
      dayNumber: number | null;
      /** 1-based position of the step in the travel. */
      number: number;
      newest: boolean;
    }
  /** How the travellers got to the next step (its arrival segment). */
  | { kind: 'leg'; key: string; segment: Segment }
  /** Consecutive days without a step: still empty, or deliberately left empty. */
  | { kind: 'empty' | 'rest'; key: string; days: string[]; first: number; last: number };

export interface Journey<P> {
  rows: JourneyRow<P>[];
  /** Days within the shown range with at least one step. */
  stepDays: number;
  restDays: number;
  emptyDays: number;
}

/** A travel never shows more than ten years of days. */
const MAX_DAYS = 3660;

/**
 * The route list of a travel: steps (oldest first) with the leg that led to them, and the days
 * without a step in between, grouped. Days run from the start date to the end date, or up to today
 * for an ongoing travel. A step on a rest day wins; steps outside the travel dates keep their place
 * by date, outside the day list.
 */
export function buildJourney<P extends JourneyStep>(
  travel: Pick<Travel, 'startDate' | 'endDate' | 'restDays'>,
  posts: P[],
  options: { today?: string; timeZone?: string } = {},
): Journey<P> {
  const today = options.today ?? localDay();
  const start = travel.startDate;
  const end = travel.endDate && travel.endDate < today ? travel.endDate : today;
  const rest = new Set(travel.restDays);
  const steps = posts
    .map((post) => ({ post, day: dayOf(post.date, options.timeZone) }))
    .sort((a, b) => a.post.date.localeCompare(b.post.date) || a.post.id.localeCompare(b.post.id));

  const rows: JourneyRow<P>[] = [];
  const counts = { stepDays: 0, restDays: 0, emptyDays: 0 };
  let number = 0;
  // (Cast, so the closure's resets don't make TypeScript narrow it to null.)
  let group = null as { kind: 'empty' | 'rest'; days: string[] } | null;

  const flush = () => {
    if (!group) return;
    const first = group.days[0]!;
    rows.push({
      kind: group.kind,
      key: `${group.kind}-${first}`,
      days: group.days,
      first: daysBetween(start, first) + 1,
      last: daysBetween(start, group.days[group.days.length - 1]!) + 1,
    });
    group = null;
  };

  const addStep = ({ post, day }: { post: P; day: string }) => {
    if (number > 0 && post.arrival) {
      rows.push({ kind: 'leg', key: `leg-${post.id}`, segment: post.arrival });
    }
    number += 1;
    rows.push({
      kind: 'step',
      key: post.id,
      post,
      day,
      dayNumber: travelDay(travel, day),
      number,
      newest: false,
    });
  };

  for (const s of steps) if (s.day < start) addStep(s);

  const byDay = new Map<string, typeof steps>();
  for (const s of steps) byDay.set(s.day, [...(byDay.get(s.day) ?? []), s]);
  let day = start;
  for (let i = 0; day <= end && i < MAX_DAYS; i++, day = addDays(start, i)) {
    const onDay = byDay.get(day);
    if (onDay) {
      flush();
      counts.stepDays += 1;
      onDay.forEach(addStep);
      continue;
    }
    const kind = rest.has(day) ? 'rest' : 'empty';
    if (kind === 'rest') counts.restDays += 1;
    else counts.emptyDays += 1;
    if (group?.kind !== kind) {
      flush();
      group = { kind, days: [] };
    }
    group!.days.push(day);
  }
  flush();

  // Steps after the shown days (planned ahead, or after the end date).
  for (const s of steps) if (s.day >= day) addStep(s);

  for (let i = rows.length - 1; i >= 0; i--) {
    const row = rows[i]!;
    if (row.kind === 'step') {
      row.newest = true;
      break;
    }
  }
  return { rows, ...counts };
}
