import type { MediaSize } from '@travelsteps/shared';
import { currentLocale } from '../i18n/store';

interface Formatters {
  date: Intl.DateTimeFormat;
  dateTime: Intl.DateTimeFormat;
  relative: Intl.RelativeTimeFormat;
  number: Intl.NumberFormat;
}

const cache = new Map<string, Formatters>();

/** Formatters for the current language (nl-NL / en-GB); units stay metric. */
function fmt(): Formatters {
  const locale = currentLocale();
  let f = cache.get(locale);
  if (!f) {
    f = {
      date: new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', year: 'numeric' }),
      dateTime: new Intl.DateTimeFormat(locale, {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }),
      relative: new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }),
      number: new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }),
    };
    cache.set(locale, f);
  }
  return f;
}

const custom = new Map<string, Intl.DateTimeFormat>();

/** Cached Intl.DateTimeFormat for the current language. */
export function dateFormat(options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `${currentLocale()}|${JSON.stringify(options)}`;
  let f = custom.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat(currentLocale(), options);
    custom.set(key, f);
  }
  return f;
}

export const formatDate = (iso: string) => fmt().date.format(new Date(iso));
export const formatDateTime = (iso: string) => fmt().dateTime.format(new Date(iso));
export const formatNumber = (n: number) => fmt().number.format(n);

/** "2025-06-01" → "1 juni 2025" / "1 June 2025" (date-only strings are not shifted by the time zone). */
export const formatDay = (day: string) => fmt().date.format(new Date(`${day}T12:00:00`));

export function formatRange(start: string, end: string | null, ongoing: string): string {
  if (end === start) return formatDay(start);
  return `${formatDay(start)} – ${end ? formatDay(end) : ongoing}`;
}

/** "5 minuten geleden" / "5 minutes ago", "yesterday", or a date when older than a week. */
export function formatRelative(iso: string, now = Date.now()): string {
  const relativeFmt = fmt().relative;
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
