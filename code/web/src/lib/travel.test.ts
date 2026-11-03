import { describe, expect, it } from 'vitest';
import type { TravelMember, UserRef } from '@travelsteps/shared';
import {
  addDays,
  dayOf,
  daysBetween,
  dominantMode,
  isAuthorOf,
  placeLine,
  stepDay,
  stepDistance,
  travelAuthors,
  travelDay,
} from './travel';

describe('travelDay', () => {
  const trip = { startDate: '2026-07-04', endDate: '2026-07-16' };

  it('counts the start date as day 1', () => {
    expect(travelDay(trip, '2026-07-04')).toBe(1);
    expect(travelDay(trip, '2026-07-09')).toBe(6);
    expect(travelDay(trip, '2026-07-16')).toBe(13);
  });

  it('is null outside the travel dates', () => {
    expect(travelDay(trip, '2026-07-03')).toBeNull();
    expect(travelDay(trip, '2026-07-17')).toBeNull();
  });

  it('keeps counting for a travel without end date', () => {
    expect(travelDay({ startDate: '2026-10-25', endDate: null }, '2026-11-02')).toBe(9);
  });

  it('is not shifted by daylight saving time', () => {
    expect(travelDay({ startDate: '2026-10-24', endDate: null }, '2026-10-26')).toBe(3);
  });
});

describe('step days', () => {
  const trip = { startDate: '2026-07-04', endDate: '2026-07-16' };

  it('takes the calendar day of the given time zone', () => {
    expect(dayOf('2026-07-08T23:30:00Z', 'UTC')).toBe('2026-07-08');
    expect(dayOf('2026-07-08T23:30:00Z', 'Europe/Oslo')).toBe('2026-07-09');
    expect(dayOf('2026-07-09T03:00:00Z', 'America/New_York')).toBe('2026-07-08');
    expect(stepDay(trip, '2026-07-08T23:30:00Z', 'UTC')).toBe(5);
    expect(stepDay(trip, '2026-07-08T23:30:00Z', 'Europe/Oslo')).toBe(6);
  });

  it('is null for a step outside the travel', () => {
    expect(stepDay(trip, '2026-07-03T21:00:00Z', 'UTC')).toBeNull();
    expect(stepDay(trip, '2026-07-03T23:00:00Z', 'Europe/Oslo')).toBe(1);
  });

  it('counts and adds whole days across daylight saving time', () => {
    expect(daysBetween('2026-10-24', '2026-10-26')).toBe(2);
    expect(daysBetween('2026-07-09', '2026-07-07')).toBe(-2);
    expect(addDays('2026-10-24', 2)).toBe('2026-10-26');
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
  });
});

describe('step helpers', () => {
  it('picks the mode with the most kilometres', () => {
    expect(dominantMode([])).toBeNull();
    expect(dominantMode([{ mode: 'lopen' }, { mode: 'auto' }])).toBe('lopen');
    expect(
      dominantMode([
        { mode: 'lopen', distanceKm: 3 },
        { mode: 'fietsen', distanceKm: 20 },
        { mode: 'lopen', distanceKm: 2 },
      ]),
    ).toBe('fietsen');
  });

  it('uses the entered distance before the route length', () => {
    const segments = [{ mode: 'fietsen' as const, distanceKm: 12.34 }];
    expect(stepDistance({ stats: { custom: [], afstand: 48 }, segments })).toBe(48);
    expect(stepDistance({ stats: { custom: [] }, segments })).toBe(12.3);
    expect(stepDistance({ stats: { custom: [] }, segments: [] })).toBeNull();
  });

  it('joins the named places with arrows', () => {
    expect(
      placeLine([
        { lat: 1, lng: 1, name: 'Ramberg' },
        { lat: 1, lng: 1, name: ' ' },
        { lat: 1, lng: 1, name: 'Leknes' },
      ]),
    ).toBe('Ramberg → Leknes');
  });
});

describe('travel authors', () => {
  const bert: UserRef = { id: 'b', displayName: 'Bert', avatarUrl: null };
  const member = (id: string, status: TravelMember['status']): TravelMember => ({
    id,
    displayName: id,
    avatarUrl: null,
    status,
  });
  const travel = { owner: bert, members: [member('l', 'accepted'), member('j', 'invited')] };

  it('are the owner and accepted co-writers', () => {
    expect(travelAuthors(travel).map((u) => u.id)).toEqual(['b', 'l']);
    expect(isAuthorOf(travel, 'l')).toBe(true);
    expect(isAuthorOf(travel, 'j')).toBe(false);
  });
});
