import { Suspense, useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { isTraveller } from '@travelsteps/shared';
import { useUser } from '../auth/AuthContext';
import { BlogProvider, useBlog } from '../blog/BlogContext';
import { messages, useT } from '../i18n';
import { useOnline } from '../offline/db';
import { onSyncEvent, startSync } from '../offline/sync';
import { BlogBar } from './BlogBar';
import { CelebrationProvider } from './Celebration';
import { BellIcon, MapIcon, PhotoIcon, TimelineIcon, TravelIcon } from './icons';
import { LayoutBanner, PageTitleProvider } from './PageTitle';
import { PhoneBanner } from './PhoneBanner';
import { SkeletonCards } from './Skeleton';
import { UserMenu } from './UserMenu';

const items = () => [
  { to: '/', label: messages().nav.timeline, icon: <TimelineIcon />, end: true },
  { to: '/kaart', label: messages().nav.map, icon: <MapIcon /> },
  { to: '/fotos', label: messages().nav.photos, icon: <PhotoIcon /> },
  { to: '/reizen', label: messages().nav.travels, icon: <TravelIcon /> },
];

/** Pages that show one blog (or everyone's) and therefore get the blog selector. */
const BLOG_PAGES = new Set(['/', '/kaart', '/fotos', '/reizen']);

export function Layout() {
  return (
    <BlogProvider>
      <CelebrationProvider>
        <Shell />
      </CelebrationProvider>
    </BlogProvider>
  );
}

function Shell() {
  const msg = useT();
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
        if (e.type === 'published') setToast(messages().sync.published(e.title));
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
        {!online && <div className="offline-bar">{msg.sync.offline}</div>}
        <main className="app-main">
          <Suspense fallback={<SkeletonCards count={2} />}>
            <Outlet />
          </Suspense>
        </main>
        {toast && (
          <div className="toast" role="status">
            {toast}
          </div>
        )}
        <nav className="bottom-nav" aria-label="Hoofdmenu">
          {items().map((item) => (
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
            <span>{msg.nav.notifications}</span>
          </NavLink>
        </nav>
      </div>
    </PageTitleProvider>
  );
}
