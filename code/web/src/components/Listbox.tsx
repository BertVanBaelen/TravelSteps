import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { CheckIcon, ChevronDown } from './icons';
import { Sheet, useDismiss } from './Sheet';

export interface ListboxOption {
  id: string;
  /** Text on the trigger and the accessible name. */
  label: string;
  /** Bold name in the list (defaults to the label); may contain a badge. */
  name?: ReactNode;
  meta?: string;
  /** Icon/avatar in the list. */
  icon?: ReactNode;
  /** Smaller icon on the trigger (defaults to `icon`). */
  triggerIcon?: ReactNode;
}

interface Props {
  options: ListboxOption[];
  selected: string;
  onSelect: (id: string) => void;
  /** Title of the list; also the accessible label of the trigger. */
  title: string;
  className?: string;
  /** pill: rounded chip (header, blog bar); field: full-width form input; compact: small inline. */
  variant?: 'pill' | 'field' | 'compact';
  /** ID of the trigger button (for a visible label). */
  id?: string;
  disabled?: boolean;
}

/** Accessible single-select listbox: dropdown on wide screens, bottom sheet on phones. */
export function Listbox({
  options,
  selected,
  onSelect,
  title,
  className,
  variant = 'pill',
  id,
  disabled = false,
}: Props) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const baseId = useId();
  const optionId = (i: number) => `${baseId}-opt-${i}`;
  const selectedIndex = Math.max(
    0,
    options.findIndex((o) => o.id === selected),
  );
  const current = options[selectedIndex]!;

  function close(focusButton = true) {
    setOpen(false);
    if (focusButton) button.current?.focus();
  }
  useDismiss(open, root, () => close(false));

  useEffect(() => {
    if (open) list.current?.focus();
  }, [open]);

  useEffect(() => {
    if (open)
      document.getElementById(`${baseId}-opt-${active}`)?.scrollIntoView({ block: 'nearest' });
  }, [open, active, baseId]);

  function openList() {
    setActive(selectedIndex);
    setOpen(true);
  }

  function choose(i: number) {
    onSelect(options[i]!.id);
    close();
  }

  function onButtonKey(e: KeyboardEvent) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      openList();
    }
  }

  function onListKey(e: KeyboardEvent) {
    const last = options.length - 1;
    switch (e.key) {
      case 'ArrowDown':
        setActive((i) => Math.min(last, i + 1));
        break;
      case 'ArrowUp':
        setActive((i) => Math.max(0, i - 1));
        break;
      case 'Home':
        setActive(0);
        break;
      case 'End':
        setActive(last);
        break;
      case 'Enter':
      case ' ':
        choose(active);
        break;
      case 'Escape':
        close();
        break;
      case 'Tab':
        close(false);
        return;
      default:
        return;
    }
    e.preventDefault();
    e.stopPropagation();
  }

  return (
    <div className={`picker picker-${variant}${className ? ` ${className}` : ''}`} ref={root}>
      <button
        ref={button}
        id={id}
        type="button"
        disabled={disabled}
        className="picker-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`${title}: ${current.label}`}
        onClick={() => (open ? close() : openList())}
        onKeyDown={onButtonKey}
      >
        {current.triggerIcon ?? current.icon}
        <span className="picker-trigger-name">{current.label}</span>
        <span className={`picker-chevron${open ? ' open' : ''}`}>
          <ChevronDown />
        </span>
      </button>
      <Sheet open={open} className="picker-sheet">
        <p className="sheet-title">{title}</p>
        <ul
          ref={list}
          role="listbox"
          tabIndex={-1}
          aria-label={title}
          aria-activedescendant={optionId(active)}
          className="picker-options"
          onKeyDown={onListKey}
        >
          {options.map((o, i) => (
            <li
              key={o.id || 'all'}
              id={optionId(i)}
              role="option"
              aria-selected={o.id === selected}
              className={`picker-option${i === active ? ' active' : ''}`}
              onPointerMove={() => setActive(i)}
              onClick={() => choose(i)}
            >
              {o.icon}
              <span className="picker-option-text">
                <span className="picker-option-name">{o.name ?? o.label}</span>
                {o.meta && <span className="picker-option-meta">{o.meta}</span>}
              </span>
              {o.id === selected && (
                <span className="picker-option-check">
                  <CheckIcon />
                </span>
              )}
            </li>
          ))}
        </ul>
      </Sheet>
    </div>
  );
}
