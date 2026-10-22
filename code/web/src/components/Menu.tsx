import { useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { useDismiss } from './Sheet';

interface Props {
  /** Content of the trigger button. */
  trigger: ReactNode;
  label: string;
  triggerClassName?: string;
  /** Menu items (links/buttons with role="menuitem"); clicking one closes the menu. */
  children: ReactNode;
}

/** Button that opens a menu panel; arrow keys move between the items. */
export function Menu({ trigger, label, triggerClassName, children }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  useDismiss(open, ref, () => setOpen(false));

  function onKeyDown(e: KeyboardEvent) {
    const items = [...(panel.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
    if (items.length === 0) return;
    const i = items.indexOf(document.activeElement as HTMLElement);
    let next: number | null = null;
    if (e.key === 'ArrowDown') next = (i + 1) % items.length;
    else if (e.key === 'ArrowUp') next = (i - 1 + items.length) % items.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = items.length - 1;
    if (next !== null) {
      e.preventDefault();
      items[next]!.focus();
    }
  }

  return (
    <div className="menu" ref={ref}>
      <button
        type="button"
        className={triggerClassName}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {trigger}
      </button>
      {open && (
        <div
          className="menu-panel"
          role="menu"
          ref={panel}
          onKeyDown={onKeyDown}
          onClick={() => setOpen(false)}
        >
          {children}
        </div>
      )}
    </div>
  );
}
