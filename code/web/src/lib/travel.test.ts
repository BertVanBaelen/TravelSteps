import { describe, expect, it } from 'vitest';
import type { TravelMember, UserRef } from '@travelsteps/shared';
import { isAuthorOf, travelAuthors, travelDay } from './travel';

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
