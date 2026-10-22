import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useT } from '../i18n';
import { dateFormat } from '../lib/format';
import {
  CalendarIcon,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClockIcon,
  CloseIcon,
} from './icons';
import { Sheet, useDismiss } from './Sheet';

const pad = (n: number) => String(n).padStart(2, '0');
const toIso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

function parseDay(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
}

const longFmt = () =>
  dateFormat({ weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' });
const monthFmt = () => dateFormat({ month: 'long', year: 'numeric' });
const dayLabelFmt = () =>
  dateFormat({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const weekdays = () =>
  Array.from({ length: 7 }, (_, i) =>
    dateFormat({ weekday: 'short' }).format(new Date(2024, 0, 1 + i)),
  );

/** The 42 days (6 weeks, Monday first) shown for the month of `month`. */
function monthGrid(month: Date): Date[] {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const offset = (first.getDay() + 6) % 7;
  return Array.from(
    { length: 42 },
    (_, i) => new Date(first.getFullYear(), first.getMonth(), 1 - offset + i),
  );
}

interface DatePickerProps {
  /** `YYYY-MM-DD`, or '' when empty. */
  value: string;
  onChange: (value: string) => void;
  id?: string;
  /** Accessible name of the trigger and title of the sheet. */
  title: string;
  min?: string;
  /** Shown when empty; also enables the "clear" button. */
  emptyLabel?: string;
}

/** App-style date picker: a month calendar in a dropdown (bottom sheet on phones). */
export function DatePicker({ value, onChange, id, title, min, emptyLabel }: DatePickerProps) {
  const msg = useT();
  const selected = parseDay(value);
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() => selected ?? new Date());
  const [focus, setFocus] = useState(() => selected ?? new Date());
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const grid = useRef<HTMLDivElement>(null);
  const today = toIso(new Date());

  function close(focusButton = true) {
    setOpen(false);
    if (focusButton) button.current?.focus();
  }
  useDismiss(open, root, () => close(false));

  function openSheet() {
    const start = selected ?? parseDay(min ?? '') ?? new Date();
    setMonth(start);
    setFocus(start);
    setOpen(true);
  }

  useEffect(() => {
    if (open)
      grid.current?.querySelector<HTMLButtonElement>(`[data-day="${toIso(focus)}"]`)?.focus();
  }, [open, focus]);

  const disabledDay = (iso: string) => !!min && iso < min;

  function pick(d: Date) {
    const iso = toIso(d);
    if (disabledDay(iso)) return;
    onChange(iso);
    close();
  }

  function moveFocus(days: number) {
    const next = new Date(focus.getFullYear(), focus.getMonth(), focus.getDate() + days);
    setFocus(next);
    if (next.getMonth() !== month.getMonth() || next.getFullYear() !== month.getFullYear())
      setMonth(next);
  }

  function onGridKey(e: KeyboardEvent) {
    const moves: Record<string, number> = {
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -7,
      ArrowDown: 7,
    };
    if (e.key in moves) {
      e.preventDefault();
      moveFocus(moves[e.key]!);
    } else if (e.key === 'Escape') {
      e.stopPropagation();
      close();
    }
  }

  const shiftMonth = (n: number) => {
    const next = new Date(month.getFullYear(), month.getMonth() + n, 1);
    setMonth(next);
    setFocus(next);
  };

  return (
    <div className="picker picker-field date-picker" ref={root}>
      <button
        ref={button}
        id={id}
        type="button"
        className="picker-trigger"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`${title}: ${selected ? longFmt().format(selected) : (emptyLabel ?? '')}`}
        onClick={() => (open ? close() : openSheet())}
      >
        <span className="picker-icon">
          <CalendarIcon />
        </span>
        <span className={`picker-trigger-name${selected ? '' : ' muted'}`}>
          {selected ? longFmt().format(selected) : emptyLabel}
        </span>
        <span className={`picker-chevron${open ? ' open' : ''}`}>
          <ChevronDown />
        </span>
      </button>
      <Sheet open={open} className="picker-sheet date-sheet">
        <div role="dialog" aria-label={title}>
          <p className="sheet-title">{title}</p>
          <div className="cal-head">
            <button
              type="button"
              className="icon-btn"
              onClick={() => shiftMonth(-1)}
              aria-label={msg.dateTime.prevMonth}
            >
              <ChevronLeft />
            </button>
            <strong aria-live="polite">{monthFmt().format(month)}</strong>
            <button
              type="button"
              className="icon-btn"
              onClick={() => shiftMonth(1)}
              aria-label={msg.dateTime.nextMonth}
            >
              <ChevronRight />
            </button>
          </div>
          <div className="cal-grid" ref={grid} onKeyDown={onGridKey}>
            {weekdays().map((w) => (
              <span key={w} className="cal-weekday" aria-hidden>
                {w}
              </span>
            ))}
            {monthGrid(month).map((d) => {
              const iso = toIso(d);
              const cls = [
                'cal-day',
                d.getMonth() !== month.getMonth() ? 'other' : '',
                iso === today ? 'today' : '',
                iso === value ? 'selected' : '',
              ]
                .filter(Boolean)
                .join(' ');
              return (
                <button
                  key={iso}
                  type="button"
                  data-day={iso}
                  className={cls}
                  tabIndex={iso === toIso(focus) ? 0 : -1}
                  disabled={disabledDay(iso)}
                  aria-pressed={iso === value}
                  aria-label={dayLabelFmt().format(d)}
                  onClick={() => pick(d)}
                >
                  {d.getDate()}
                </button>
              );
            })}
          </div>
          <div className="cal-foot">
            {emptyLabel && value && (
              <button
                type="button"
                className="btn btn-small btn-secondary"
                onClick={() => {
                  onChange('');
                  close();
                }}
              >
                <CloseIcon />
                {emptyLabel}
              </button>
            )}
            <button
              type="button"
              className="btn btn-small btn-secondary"
              onClick={() => pick(new Date())}
              disabled={disabledDay(today)}
            >
              <CalendarIcon />
              {msg.dateTime.today}
            </button>
          </div>
        </div>
      </Sheet>
    </div>
  );
}

interface TimePickerProps {
  /** `HH:mm` */
  value: string;
  onChange: (value: string) => void;
  title: string;
}

const HOURS = Array.from({ length: 24 }, (_, i) => pad(i));
const MINUTES = Array.from({ length: 12 }, (_, i) => pad(i * 5));

/** App-style time picker: an hour and a minute column. */
export function TimePicker({ value, onChange, title }: TimePickerProps) {
  const msg = useT();
  const [hour = '00', minute = '00'] = value.split(':');
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const sheet = useRef<HTMLDivElement>(null);
  const minutes = MINUTES.includes(minute) ? MINUTES : [...MINUTES, minute].sort();

  function close(focusButton = true) {
    setOpen(false);
    if (focusButton) button.current?.focus();
  }
  useDismiss(open, root, () => close(false));

  useEffect(() => {
    if (!open) return;
    sheet.current
      ?.querySelectorAll<HTMLElement>('.time-option.selected')
      .forEach((el) => el.scrollIntoView({ block: 'center' }));
    sheet.current?.querySelector<HTMLElement>('.time-option.selected')?.focus();
  }, [open]);

  function now() {
    const d = new Date();
    onChange(`${pad(d.getHours())}:${pad(d.getMinutes())}`);
    close();
  }

  return (
    <div className="picker picker-field time-picker" ref={root}>
      <button
        ref={button}
        type="button"
        className="picker-trigger"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`${title}: ${hour}:${minute}`}
        onClick={() => (open ? close() : setOpen(true))}
      >
        <span className="picker-icon">
          <ClockIcon />
        </span>
        <span className="picker-trigger-name">
          {hour}:{minute}
        </span>
        <span className={`picker-chevron${open ? ' open' : ''}`}>
          <ChevronDown />
        </span>
      </button>
      <Sheet open={open} className="picker-sheet time-sheet">
        <div role="dialog" aria-label={title} ref={sheet}>
          <p className="sheet-title">{title}</p>
          <div className="time-cols">
            <div className="time-col" role="group" aria-label={msg.dateTime.hours}>
              <span className="cal-weekday">{msg.dateTime.hours}</span>
              {HOURS.map((h) => (
                <button
                  key={h}
                  type="button"
                  className={`time-option${h === hour ? ' selected' : ''}`}
                  aria-pressed={h === hour}
                  onClick={() => onChange(`${h}:${minute}`)}
                >
                  {h}
                </button>
              ))}
            </div>
            <div className="time-col" role="group" aria-label={msg.dateTime.minutes}>
              <span className="cal-weekday">{msg.dateTime.minutes}</span>
              {minutes.map((m) => (
                <button
                  key={m}
                  type="button"
                  className={`time-option${m === minute ? ' selected' : ''}`}
                  aria-pressed={m === minute}
                  onClick={() => {
                    onChange(`${hour}:${m}`);
                    close();
                  }}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>
          <div className="cal-foot">
            <button type="button" className="btn btn-small btn-secondary" onClick={now}>
              <ClockIcon />
              {msg.dateTime.now}
            </button>
            <button type="button" className="btn btn-small btn-primary" onClick={() => close()}>
              {msg.common.ok}
            </button>
          </div>
        </div>
      </Sheet>
    </div>
  );
}

/** Labelled date field (`YYYY-MM-DD`). */
export function DateField({
  label,
  name,
  ...picker
}: Omit<DatePickerProps, 'id' | 'title'> & { label: string; name: string }) {
  return (
    <div className="field">
      <label className="field-label" htmlFor={name}>
        {label}
      </label>
      <DatePicker id={name} title={label} {...picker} />
    </div>
  );
}

/**
 * Labelled date + time field; value like a datetime-local input (`YYYY-MM-DDTHH:mm`).
 * With `fixedDay` (e.g. a one-day travel) only the time can be chosen.
 */
export function DateTimeField({
  label,
  name,
  value,
  onChange,
  fixedDay,
  hint,
}: {
  label: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
  fixedDay?: string;
  hint?: string;
}) {
  const msg = useT();
  const [valueDay = '', time = '12:00'] = value.split('T');
  const day = fixedDay ?? valueDay;
  return (
    <div className="field">
      <label className="field-label" htmlFor={fixedDay ? undefined : name}>
        {fixedDay ? msg.dateTime.time : label}
      </label>
      <div className="datetime-row">
        {!fixedDay && (
          <DatePicker
            id={name}
            title={label}
            value={day}
            onChange={(d) => onChange(`${d}T${time}`)}
          />
        )}
        <TimePicker
          title={msg.dateTime.time}
          value={time}
          onChange={(t) => onChange(`${day}T${t}`)}
        />
      </div>
      {hint && <span className="field-hint">{hint}</span>}
    </div>
  );
}
