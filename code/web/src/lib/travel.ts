import {
  TRAVEL_COLORS,
  type Location,
  type Segment,
  type Stats,
  type TransportMode,
  type Travel,
  type UserRef,
} from '@travelsteps/shared';

/** "YYYY-MM-DD" of a moment in this device's time zone. */
export function localDay(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** "YYYY-MM-DD" of an ISO moment, in this device's time zone or in the given IANA time zone. */
export function dayOf(iso: string, timeZone?: string): string {
  const d = new Date(iso);
  if (!timeZone) return localDay(d);
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d);
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

type Dates = Pick<Travel, 'startDate' | 'endDate'>;

/** 1-based day number of `day` within the travel, or null when it lies outside the travel dates. */
export function travelDay(travel: Dates, day: string = localDay()): number | null {
  if (day < travel.startDate || (travel.endDate && day > travel.endDate)) return null;
  return daysBetween(travel.startDate, day) + 1;
}

/** Day number of a step (by its moment, in the device's or the given time zone). */
export function stepDay(travel: Dates, iso: string, timeZone?: string): number | null {
  return travelDay(travel, dayOf(iso, timeZone));
}

const DAY_MS = 86_400_000;

/** Whole days from one "YYYY-MM-DD" to another (negative when `to` is earlier). */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / DAY_MS);
}

export function addDays(day: string, n: number): string {
  return new Date(Date.parse(`${day}T12:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
}

/** The mode a step covered the most kilometres with; without distances its first mode. */
export function dominantMode(segments: Segment[]): TransportMode | null {
  const km = new Map<TransportMode, number>();
  for (const s of segments) km.set(s.mode, (km.get(s.mode) ?? 0) + (s.distanceKm ?? 0));
  let best: TransportMode | null = segments[0]?.mode ?? null;
  for (const [mode, total] of km) if (best && total > km.get(best)!) best = mode;
  return best;
}

/** Distance of a step: the entered stat, else the length of its route; null when unknown. */
export function stepDistance(post: { stats: Stats; segments: Segment[] }): number | null {
  if (typeof post.stats.afstand === 'number') return post.stats.afstand;
  const km = post.segments.reduce((sum, s) => sum + (s.distanceKm ?? 0), 0);
  return km > 0 ? Math.round(km * 10) / 10 : null;
}

/** "Ramberg → Leknes → Haukland strand": the named places of a step. */
export function placeLine(locations: Location[]): string {
  return locations
    .map((l) => (l.name ?? '').trim())
    .filter(Boolean)
    .join(' → ');
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
