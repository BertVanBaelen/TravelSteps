import { describe, expect, it } from 'vitest';
import type { Segment } from '@travelsteps/shared';
import { buildJourney, type JourneyRow } from './journey';

const step = (id: string, date: string, arrival: Segment | null = null) => ({ id, date, arrival });
type Step = ReturnType<typeof step>;

/** Compact description of the rows: "1:a", "leg:auto", "empty:3-4", "rest:5". */
function describeRows(rows: JourneyRow<Step>[]): string[] {
  return rows.map((r) => {
    if (r.kind === 'step') return `${r.dayNumber ?? '-'}:${r.post.id}${r.newest ? '*' : ''}`;
    if (r.kind === 'leg') return `leg:${r.segment.mode}`;
    return `${r.kind}:${r.first === r.last ? r.first : `${r.first}-${r.last}`}`;
  });
}

const UTC = { timeZone: 'UTC' };

describe('buildJourney', () => {
  const trip = { startDate: '2026-07-04', endDate: '2026-07-10', restDays: ['2026-07-08'] };

  it('lists steps, legs, grouped empty days and rest days in date order', () => {
    const j = buildJourney(
      trip,
      [
        step('c', '2026-07-09T10:00:00Z', { mode: 'boot', distanceKm: 89 }),
        step('a', '2026-07-04T10:00:00Z', { mode: 'auto' }),
        step('b', '2026-07-05T10:00:00Z', { mode: 'auto', distanceKm: 23 }),
        step('b2', '2026-07-05T18:00:00Z'),
      ],
      { today: '2026-08-01', ...UTC },
    );
    expect(describeRows(j.rows)).toEqual([
      '1:a',
      'leg:auto',
      '2:b',
      '2:b2',
      'empty:3-4',
      'rest:5',
      'leg:boot',
      '6:c*',
      'empty:7',
    ]);
    expect(j).toMatchObject({ stepDays: 3, restDays: 1, emptyDays: 3 });
  });

  it('lets a step win over a rest day', () => {
    const j = buildJourney(trip, [step('x', '2026-07-08T09:00:00Z')], {
      today: '2026-07-08',
      ...UTC,
    });
    expect(describeRows(j.rows)).toEqual(['empty:1-4', '5:x*']);
    expect(j).toMatchObject({ stepDays: 1, restDays: 0, emptyDays: 4 });
  });

  it('shows an ongoing travel only up to today', () => {
    const ongoing = { startDate: '2026-07-04', endDate: null, restDays: [] };
    const j = buildJourney(ongoing, [step('a', '2026-07-05T08:00:00Z')], {
      today: '2026-07-06',
      ...UTC,
    });
    expect(describeRows(j.rows)).toEqual(['empty:1', '2:a*', 'empty:3']);
  });

  it('handles a one-day travel', () => {
    const day = { startDate: '2026-07-04', endDate: '2026-07-04', restDays: [] };
    expect(describeRows(buildJourney(day, [], { today: '2026-09-01' }).rows)).toEqual(['empty:1']);
    const j = buildJourney(day, [step('a', '2026-07-04T08:00:00Z')], {
      today: '2026-09-01',
      ...UTC,
    });
    expect(describeRows(j.rows)).toEqual(['1:a*']);
  });

  it('keeps steps outside the travel dates at their place, outside the day list', () => {
    const j = buildJourney(
      trip,
      [
        step('before', '2026-07-01T10:00:00Z'),
        step('in', '2026-07-04T10:00:00Z'),
        step('after', '2026-07-12T10:00:00Z', { mode: 'vliegtuig' }),
      ],
      { today: '2026-08-01', ...UTC },
    );
    expect(describeRows(j.rows)).toEqual([
      '-:before',
      '1:in',
      'empty:2-4',
      'rest:5',
      'empty:6-7',
      'leg:vliegtuig',
      '-:after*',
    ]);
  });

  it('shows nothing but planned steps for a travel that has not started', () => {
    const j = buildJourney(trip, [step('plan', '2026-07-05T10:00:00Z')], {
      today: '2026-06-01',
      ...UTC,
    });
    expect(describeRows(j.rows)).toEqual(['2:plan*']);
    expect(j).toMatchObject({ stepDays: 0, restDays: 0, emptyDays: 0 });
  });

  it('places a step on the day of the given time zone', () => {
    // 23:30 UTC on 4 July is already 5 July in Oslo.
    const late = [step('late', '2026-07-04T23:30:00Z')];
    const options = { today: '2026-07-05' };
    expect(describeRows(buildJourney(trip, late, { ...options, ...UTC }).rows)).toEqual([
      '1:late*',
      'empty:2',
    ]);
    expect(
      describeRows(buildJourney(trip, late, { ...options, timeZone: 'Europe/Oslo' }).rows),
    ).toEqual(['empty:1', '2:late*']);
  });
});
