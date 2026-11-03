import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate } from 'react-router-dom';
import { useT } from '../i18n';
import { ChevronLeft } from './icons';

interface Header {
  title: string | null;
  back: string | null;
  /** Visible text next to the back arrow; the title then only goes to the document title. */
  backLabel: string | null;
}

interface PageTitleState {
  header: Header;
  setHeader: (h: Header) => void;
  actionsSlot: HTMLElement | null;
  setActionsSlot: (el: HTMLElement | null) => void;
}

const Ctx = createContext<PageTitleState | null>(null);

export function PageTitleProvider({ children }: { children: ReactNode }) {
  const [header, setHeader] = useState<Header>({ title: null, back: null, backLabel: null });
  const [actionsSlot, setActionsSlot] = useState<HTMLElement | null>(null);
  return (
    <Ctx.Provider value={{ header, setHeader, actionsSlot, setActionsSlot }}>
      {children}
    </Ctx.Provider>
  );
}

function useCtx(): PageTitleState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('PageTitleProvider is missing');
  return ctx;
}

/**
 * Shows `title` in the app banner (null = app name) and sets the document title.
 * `back` adds a back arrow; it goes back in history when possible, otherwise to this path.
 * With `backLabel` the banner shows "‹ backLabel" instead of the title (the page has its own
 * heading), as on the step and travel pages.
 */
export function usePageTitle(
  title: string | null,
  options: { back?: string; backLabel?: string } = {},
) {
  const msg = useT();
  const { setHeader } = useCtx();
  const back = options.back ?? null;
  const backLabel = (back && options.backLabel) || null;
  useEffect(() => {
    setHeader({ title, back, backLabel });
    document.title = title ? `${title} – ${msg.appName}` : msg.appName;
  }, [title, back, backLabel, setHeader, msg.appName]);
}

/** Renders its children on the right side of the app banner. */
export function PageActions({ children }: { children: ReactNode }) {
  const { actionsSlot } = useCtx();
  return actionsSlot ? createPortal(children, actionsSlot) : null;
}

function BackButton({ to, label }: { to: string; label?: string | null }) {
  const msg = useT();
  const navigate = useNavigate();
  return (
    <button
      type="button"
      className={label ? 'banner-back-label' : 'icon-btn banner-back'}
      aria-label={label ? `${msg.common.backLabel}: ${label}` : msg.common.backLabel}
      onClick={() => {
        // React Router stores the history index; > 0 means we navigated here inside the app.
        const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
        if (idx > 0) navigate(-1);
        else navigate(to);
      }}
    >
      <ChevronLeft />
      {label && <span>{label}</span>}
    </button>
  );
}

/** App icon at the top left of the banner; links to the timeline. */
function BrandIcon({ link }: { link: boolean }) {
  const msg = useT();
  const img = <img src="/favicon.svg" alt="" width={32} height={32} />;
  return link ? (
    <Link to="/" className="banner-icon" aria-label={msg.appName}>
      {img}
    </Link>
  ) : (
    <span className="banner-icon">{img}</span>
  );
}

/**
 * Banner used inside the layout; reads the title set by the current page. `start` (the context
 * bar) takes the place of the visually hidden title.
 */
export function LayoutBanner({ start, end }: { start?: ReactNode; end?: ReactNode }) {
  const msg = useT();
  const { header, setActionsSlot } = useCtx();
  return (
    <header className="app-header">
      {header.back ? <BackButton to={header.back} label={header.backLabel} /> : <BrandIcon link />}
      {start && <div className="banner-start">{start}</div>}
      {header.backLabel ? (
        <span className="banner-spacer" />
      ) : header.title ? (
        <h1 className="banner-title">{header.title}</h1>
      ) : (
        <span className="brand banner-title">{msg.appName}</span>
      )}
      <div className="banner-actions" ref={setActionsSlot} />
      {end}
    </header>
  );
}

/** Same banner style for pages outside the layout (login, forced password change). */
export function StaticBanner({ title }: { title: string | null }) {
  const msg = useT();
  useEffect(() => {
    document.title = title ? `${title} – ${msg.appName}` : msg.appName;
  }, [title, msg.appName]);
  return (
    <header className="app-header">
      <BrandIcon link={false} />
      {title ? (
        <h1 className="banner-title">{title}</h1>
      ) : (
        <span className="brand banner-title">{msg.appName}</span>
      )}
    </header>
  );
}
