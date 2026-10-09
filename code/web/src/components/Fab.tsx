import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { CloseIcon, MoreIcon } from './icons';
import { useDismiss } from './Sheet';

interface FabProps {
  icon: ReactNode;
  /** Shown next to the icon for the main action; the accessible name for icon-only buttons. */
  label: string;
  to?: string;
  onClick?: () => void;
  /** Smaller, white secondary button (e.g. edit next to "new step"). */
  secondary?: boolean;
  /** Show the label next to the icon. */
  extended?: boolean;
}

/** Floating action button for the main add/edit actions of a page. Put it in a {@link FabStack}. */
export function Fab({ icon, label, to, onClick, secondary = false, extended = false }: FabProps) {
  const cls = ['fab', secondary && 'fab-secondary', extended && 'fab-extended'].filter(Boolean).join(' ');
  const content = (
    <>
      {icon}
      {extended && <span className="fab-label">{label}</span>}
    </>
  );
  const a11y = extended ? {} : { 'aria-label': label, title: label };
  if (to) {
    return (
      <Link to={to} className={cls} {...a11y}>
        {content}
      </Link>
    );
  }
  return (
    <button type="button" className={cls} onClick={onClick} {...a11y}>
      {content}
    </button>
  );
}

/** Bottom-right stack of floating action buttons, above the bottom navigation. Main action last. */
export function FabStack({ children }: { children: ReactNode }) {
  return <div className="fab-stack">{children}</div>;
}

export interface FabAction {
  icon: ReactNode;
  label: string;
  to?: string;
  onClick?: () => void;
  danger?: boolean;
}

/**
 * Expanding ("speed dial") floating action button: the main button opens a column of labelled
 * mini actions. With a single action it renders a plain extended {@link Fab}.
 */
export function FabMenu({ actions, label }: { actions: FabAction[]; label: string }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const menuId = useId();

  useDismiss(open, root, () => setOpen(false));
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (open) root.current?.querySelector<HTMLElement>('.fab-menu-item button')?.focus();
  }, [open]);

  if (actions.length === 1) {
    const a = actions[0]!;
    return (
      <FabStack>
        <Fab icon={a.icon} label={a.label} to={a.to} onClick={a.onClick} extended />
      </FabStack>
    );
  }

  function run(a: FabAction) {
    setOpen(false);
    if (a.to) navigate(a.to);
    else a.onClick?.();
  }

  return (
    <>
      <div className={`fab-scrim${open ? ' open' : ''}`} aria-hidden />
      <div className={`fab-stack fab-menu${open ? ' open' : ''}`} ref={root}>
        <ul id={menuId} className="fab-menu-items" hidden={!open}>
          {actions.map((a, i) => (
            <li
              key={a.label}
              className="fab-menu-item"
              style={{ animationDelay: `${(actions.length - 1 - i) * 45}ms` }}
            >
              <button
                type="button"
                className={`fab-mini${a.danger ? ' fab-mini-danger' : ''}`}
                onClick={() => run(a)}
              >
                <span className="fab-mini-label">{a.label}</span>
                <span className="fab-mini-icon">{a.icon}</span>
              </button>
            </li>
          ))}
        </ul>
        <button
          ref={toggle}
          type="button"
          className="fab fab-menu-toggle"
          aria-label={label}
          title={label}
          aria-haspopup="true"
          aria-expanded={open}
          aria-controls={menuId}
          onClick={() => setOpen((o) => !o)}
          onKeyDown={(e) => {
            if (e.key === 'Escape' && open) {
              setOpen(false);
              toggle.current?.focus();
            }
          }}
        >
          <span className="fab-menu-icon fab-menu-icon-more">
            <MoreIcon />
          </span>
          <span className="fab-menu-icon fab-menu-icon-close">
            <CloseIcon />
          </span>
        </button>
      </div>
    </>
  );
}