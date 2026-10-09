import type { MediaSize } from '@travelsteps/shared';

const dateFmt = new Intl.DateTimeFormat('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' });
const dateTimeFmt = new Intl.DateTimeFormat('nl-NL', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});
const relativeFmt = new Intl.RelativeTimeFormat('nl', { numeric: 'auto' });
const numberFmt = new Intl.NumberFormat('nl-NL', { maximumFractionDigits: 1 });

export const formatDate = (iso: string) => dateFmt.format(new Date(iso));
export const formatDateTime = (iso: string) => dateTimeFmt.format(new Date(iso));
export const formatNumber = (n: number) => numberFmt.format(n);

/** "2025-06-01" → "1 juni 2025" (date-only strings are not shifted by the time zone). */
export const formatDay = (day: string) => dateFmt.format(new Date(`${day}T12:00:00`));

export function formatRange(start: string, end: string | null, ongoing: string): string {
  return `${formatDay(start)} – ${end ? formatDay(end) : ongoing}`;
}

/** "5 minuten geleden", "gisteren", or a date when older than a week. */
export function formatRelative(iso: string, now = Date.now()): string {
  const diff = (new Date(iso).getTime() - now) / 1000;
  const abs = Math.abs(diff);
  if (abs < 60) return relativeFmt.format(0, 'second');
  if (abs < 3600) return relativeFmt.format(Math.round(diff / 60), 'minute');
  if (abs < 86400) return relativeFmt.format(Math.round(diff / 3600), 'hour');
  if (abs < 7 * 86400) return relativeFmt.format(Math.round(diff / 86400), 'day');
  return formatDate(iso);
}

/** Minutes → "2:05". */
export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return `${h}:${String(m).padStart(2, '0')}`;
}

/** "2:05" or "125" (minutes) → 125; null when invalid. */
export function parseDuration(text: string): number | null {
  const t = text.trim();
  const hm = /^(\d{1,4}):([0-5]\d)$/.exec(t);
  if (hm) return Number(hm[1]) * 60 + Number(hm[2]);
  if (/^\d{1,5}$/.test(t)) return Number(t);
  return null;
}

/** Accepts both "12,5" and "12.5". */
export function parseNumber(text: string): number | null {
  const t = text.trim().replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(t)) return null;
  return Number(t);
}

const pad = (n: number) => String(n).padStart(2, '0');

/** ISO string → value for <input type="datetime-local"> in local time. */
export function toLocalInput(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export const fromLocalInput = (value: string) => new Date(value).toISOString();

export const mediaUrl = (assetId: string, size: MediaSize = 'preview') =>
  `/api/media/${assetId}/${size}`;
