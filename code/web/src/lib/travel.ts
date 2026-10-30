import { TRAVEL_COLORS, type Travel, type UserRef } from '@travelsteps/shared';

/** "YYYY-MM-DD" of a moment in this device's time zone. */
export function localDay(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

type Dates = Pick<Travel, 'startDate' | 'endDate'>;

/** 1-based day number of `day` within the travel, or null when it lies outside the travel dates. */
export function travelDay(travel: Dates, day: string = localDay()): number | null {
  if (day < travel.startDate || (travel.endDate && day > travel.endDate)) return null;
  const ms = Date.parse(`${day}T12:00:00Z`) - Date.parse(`${travel.startDate}T12:00:00Z`);
  return Math.round(ms / 86_400_000) + 1;
}

/** Owner and accepted co-writers: the people whose diary the travel is. */
export function travelAuthors(travel: Pick<Travel, 'owner' | 'members'>): UserRef[] {
  return [travel.owner, ...travel.members.filter((m) => m.status === 'accepted')];
}

/** The travel is part of this traveller's blog (same rule as the server's `traveller=` filter). */
export function isAuthorOf(travel: Pick<Travel, 'owner' | 'members'>, userId: string): boolean {
  return travelAuthors(travel).some((u) => u.id === userId);
}

/** Hex colour of a travel (map line, cover ring, chip). */
export function travelColor(travel: Pick<Travel, 'color'>): string {
  return TRAVEL_COLORS[travel.color] ?? TRAVEL_COLORS.forest;
}
