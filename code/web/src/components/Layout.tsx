import { Suspense, useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { isTraveller } from '@travelsteps/shared';
import { useUser } from '../auth/AuthContext';
import { BlogProvider, useBlog } from '../blog/BlogContext';
import { nl } from '../i18n/nl';
import { useOnline } from '../offline/db';
import { onSyncEvent, startSync } from '../offline/sync';
import { BlogBar } from './BlogBar';
import { BellIcon, MapIcon, PhotoIcon, TimelineIcon, TravelIcon } from './icons';
import { LayoutBanner, PageTitleProvider } from './PageTitle';
import { PhoneBanner } from './PhoneBanner';
import { UserMenu } from './UserMenu';

const items = [
  { to: '/', label: nl.nav.timeline, icon: <TimelineIcon />, end: true },
  { to: '/kaart', label: nl.nav.map, icon: <MapIcon /> },
  { to: '/fotos', label: nl.nav.photos, icon: <PhotoIcon /> },
  { to: '/reizen', label: nl.nav.travels, icon: <TravelIcon /> },
];

/** Pages that show one blog (or everyone's) and therefore get the blog selector. */
const BLOG_PAGES = new Set(['/', '/kaart', '/fotos', '/reizen']);

export function Layout() {
  return (
    <BlogProvider>
      <Shell />
    </BlogProvider>
  );
}

function Shell() {
  const user = useUser();
  const online = useOnline();
  const { unread } = useBlog();
  const { pathname } = useLocation();
  const [toast, setToast] = useState<string | null>(null);

  // Only travellers write posts, so only they have an outbox to sync.
  useEffect(() => (isTraveller(user.role) ? startSync() : undefined), [user.role]);

  useEffect(
    () =>
      onSyncEvent((e) => {
        if (e.type === 'published') setToast(nl.sync.published(e.title));
      }),
    [],
  );

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 4000);
    return () => window.clearTimeout(t);
  }, [toast]);

  return (
    <PageTitleProvider>
      <div className="app-shell">
        <div className="app-top">
          <LayoutBanner end={<UserMenu />} />
          {BLOG_PAGES.has(pathname) && <BlogBar />}
        </div>
        <PhoneBanner />
        {!online && <div className="offline-bar">{nl.sync.offline}</div>}
        <main className="app-main">
          <Suspense fallback={<p className="muted center">{nl.loading}</p>}>
            <Outlet />
          </Suspense>
        </main>
        {toast && (
          <div className="toast" role="status">
            {toast}
          </div>
        )}
        <nav className="bottom-nav" aria-label="Hoofdmenu">
          {items.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end}>
              {item.icon}
              <span>{item.label}</span>
            </NavLink>
          ))}
          <NavLink to="/meldingen">
            <span className="nav-icon">
              <BellIcon />
              {unread > 0 && <span className="nav-badge">{unread > 99 ? '99+' : unread}</span>}
            </span>
            <span>{nl.nav.notifications}</span>
          </NavLink>
        </nav>
      </div>
    </PageTitleProvider>
  );
}
