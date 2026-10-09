import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate } from 'react-router-dom';
import { nl } from '../i18n/nl';
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
  startSlot: HTMLElement | null;
  setStartSlot: (el: HTMLElement | null) => void;
}

const Ctx = createContext<PageTitleState | null>(null);

export function PageTitleProvider({ children }: { children: ReactNode }) {
  const [header, setHeader] = useState<Header>({ title: null, back: null });
  const [actionsSlot, setActionsSlot] = useState<HTMLElement | null>(null);
  const [startSlot, setStartSlot] = useState<HTMLElement | null>(null);
  return (
    <Ctx.Provider value={{ header, setHeader, actionsSlot, setActionsSlot, startSlot, setStartSlot }}>
      {children}
    </Ctx.Provider>
  );
}

function useCtx(): PageTitleState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('PageTitleProvider ontbreekt');
  return ctx;
}

/**
 * Shows `title` in the app banner (null = app name) and sets the document title.
 * `back` adds a back arrow; it goes back in history when possible, otherwise to this path.
 */
export function usePageTitle(title: string | null, options: { back?: string } = {}) {
  const { setHeader } = useCtx();
  const back = options.back ?? null;
  useEffect(() => {
    setHeader({ title, back });
    document.title = title ? `${title} – ${nl.appName}` : nl.appName;
  }, [title, back, setHeader]);
}

/** Renders its children on the right side of the app banner. */
export function PageActions({ children }: { children: ReactNode }) {
  const { actionsSlot } = useCtx();
  return actionsSlot ? createPortal(children, actionsSlot) : null;
}

/** Renders its children on the left of the app banner, in place of the (visually hidden) title. */
export function PageStart({ children }: { children: ReactNode }) {
  const { startSlot } = useCtx();
  return startSlot ? createPortal(children, startSlot) : null;
}

function BackButton({ to }: { to: string }) {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      className="icon-btn banner-back"
      aria-label={nl.common.backLabel}
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
  const img = <img src="/favicon.svg" alt="" width={32} height={32} />;
  return link ? (
    <Link to="/" className="banner-icon" aria-label={nl.appName}>
      {img}
    </Link>
  ) : (
    <span className="banner-icon">{img}</span>
  );
}

/** Banner used inside the layout; reads the title set by the current page. */
export function LayoutBanner({ end }: { end?: ReactNode }) {
  const { header, setActionsSlot, setStartSlot } = useCtx();
  return (
    <header className="app-header">
      {header.back ? <BackButton to={header.back} /> : <BrandIcon link />}
      <div className="banner-start" ref={setStartSlot} />
      {header.title ? (
        <h1 className="banner-title">{header.title}</h1>
      ) : (
        <span className="brand banner-title">{nl.appName}</span>
      )}
      <div className="banner-actions" ref={setActionsSlot} />
      {end}
    </header>
  );
}

/** Same banner style for pages outside the layout (login, forced password change). */
export function StaticBanner({ title }: { title: string | null }) {
  useEffect(() => {
    document.title = title ? `${title} – ${nl.appName}` : nl.appName;
  }, [title]);
  return (
    <header className="app-header">
      <BrandIcon link={false} />
      {title ? (
        <h1 className="banner-title">{title}</h1>
      ) : (
        <span className="brand banner-title">{nl.appName}</span>
      )}
    </header>
  );
}
