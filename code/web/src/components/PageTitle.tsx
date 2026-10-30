import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate } from 'react-router-dom';
import { useT } from '../i18n';
import { ChevronLeft } from './icons';

interface Header {
  title: string | null;
  back: string | null;
}

interface PageTitleState {
  header: Header;
  setHeader: (h: Header) => void;
  actionsSlot: HTMLElement | null;
  setActionsSlot: (el: HTMLElement | null) => void;
}

const Ctx = createContext<PageTitleState | null>(null);

export function PageTitleProvider({ children }: { children: ReactNode }) {
  const [header, setHeader] = useState<Header>({ title: null, back: null });
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
 */
export function usePageTitle(title: string | null, options: { back?: string } = {}) {
  const msg = useT();
  const { setHeader } = useCtx();
  const back = options.back ?? null;
  useEffect(() => {
    setHeader({ title, back });
    document.title = title ? `${title} – ${msg.appName}` : msg.appName;
  }, [title, back, setHeader, msg.appName]);
}

/** Renders its children on the right side of the app banner. */
export function PageActions({ children }: { children: ReactNode }) {
  const { actionsSlot } = useCtx();
  return actionsSlot ? createPortal(children, actionsSlot) : null;
}

function BackButton({ to }: { to: string }) {
  const msg = useT();
  const navigate = useNavigate();
  return (
    <button
      type="button"
      className="icon-btn banner-back"
      aria-label={msg.common.backLabel}
      onClick={() => {
        // React Router stores the history index; > 0 means we navigated here inside the app.
        const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
        if (idx > 0) navigate(-1);
        else navigate(to);
      }}
    >
      <ChevronLeft />
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
      {header.back ? <BackButton to={header.back} /> : <BrandIcon link />}
      {start && <div className="banner-start">{start}</div>}
      {header.title ? (
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
