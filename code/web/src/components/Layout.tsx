import { Suspense, useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useSearchParams } from 'react-router-dom';
import { isTraveller } from '@travelsteps/shared';
import { useUser } from '../auth/AuthContext';
import { ALL_TRAVELS, BlogProvider, EVERYONE, useBlog } from '../blog/BlogContext';
import { messages, useT } from '../i18n';
import { useOnline } from '../offline/db';
import { onSyncEvent, startSync } from '../offline/sync';
import { CelebrationProvider } from './Celebration';
import { ContextBar } from './ContextBar';
import {
  BellIcon,
  MapIcon,
  PhotoIcon,
  PlaneIcon,
  PlusIcon,
  TimelineIcon,
  TravelIcon,
} from './icons';
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

/** Pages that show one travel or diary (or everyone's) and therefore get the context bar. */
const CONTEXT_PAGES = new Set(['/', '/kaart', '/fotos']);
/** The travels list only chooses whose travels to list. */
const WHO_PAGES = new Set(['/reizen']);

export function Layout() {
  return (
    <BlogProvider>
      <CelebrationProvider>
        <Shell />
      </CelebrationProvider>
    </BlogProvider>
  );
}

/**
 * One navigation, three layouts (see styles.css, em breakpoints): four tabs at the bottom with
 * notifications as a bell in the top bar on phones, a labelled rail on tablets and a sidebar with
 * "Nieuwe stap" and the profile on desktops.
 */
function Shell() {
  const msg = useT();
  const user = useUser();
  const online = useOnline();
  const { unread, allTravels, travels, travelId, select, selectTravel, reloadTravels } = useBlog();
  const { pathname } = useLocation();
  const [params, setParams] = useSearchParams();
  const [toast, setToast] = useState<string | null>(null);
  const onContextPage = CONTEXT_PAGES.has(pathname);
  const canWrite = isTraveller(user.role);

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

  // Travels may have been added or changed on another page.
  useEffect(() => {
    if (onContextPage) reloadTravels();
  }, [onContextPage, pathname, reloadTravels]);

  // Links from before V3 (`/?reis=…`, `/kaart?reis=alle`) choose the travel in the context bar.
  const requested = onContextPage ? params.get('reis') : null;
  useEffect(() => {
    if (requested === null || travels === null) return;
    const id = requested === 'alle' ? ALL_TRAVELS : requested;
    if (id !== ALL_TRAVELS && !travels.some((t) => t.id === id)) {
      // A travel outside the chosen diary: show everyone's, which contains it.
      if (allTravels?.some((t) => t.id === id)) select(EVERYONE);
      else return;
    }
    selectTravel(id);
    const next = new URLSearchParams(params);
    next.delete('reis');
    setParams(next, { replace: true });
  }, [requested, travels, allTravels, params, select, selectTravel, setParams]);

  const noTravelYet = allTravels?.some((t) => t.canPost) === false;
  const newLink = noTravelYet
    ? { to: '/reizen/nieuw', label: msg.travels.new, icon: <PlaneIcon /> }
    : {
        to: travelId ? `/posts/nieuw?reis=${travelId}` : '/posts/nieuw',
        label: msg.timeline.newPost,
        icon: <PlusIcon />,
      };
  const badge = unread > 0 && (
    <span className="nav-badge" aria-hidden>
      {unread > 99 ? '99+' : unread}
    </span>
  );

  return (
    <PageTitleProvider>
      <div className="app-shell">
        <nav className="app-nav" aria-label={msg.nav.main}>
          <Link to="/" className="nav-brand" aria-label={msg.appName}>
            <img src="/favicon.svg" alt="" width={44} height={44} />
            <span className="nav-brand-name">{msg.appName}</span>
          </Link>
          {items().map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} className="nav-item">
              {item.icon}
              <span className="nav-label">{item.label}</span>
            </NavLink>
          ))}
          <NavLink
            to="/meldingen"
            className="nav-item nav-notifications"
            aria-label={msg.nav.notificationsUnread(unread)}
          >
            <span className="nav-icon">
              <BellIcon />
              {badge}
            </span>
            <span className="nav-label">{msg.nav.notifications}</span>
            {unread > 0 && (
              <span className="nav-count" aria-hidden>
                {unread > 99 ? '99+' : unread}
              </span>
            )}
          </NavLink>
          {canWrite && (
            <Link to={newLink.to} className="btn btn-primary nav-new">
              {newLink.icon}
              {newLink.label}
            </Link>
          )}
          <div className="nav-user">
            <UserMenu placement="nav" />
          </div>
        </nav>
        <div className="app-body">
          <div className="app-top">
            <LayoutBanner
              start={
                onContextPage ? (
                  <ContextBar />
                ) : WHO_PAGES.has(pathname) ? (
                  <ContextBar whoOnly />
                ) : undefined
              }
              end={
                <>
                  {canWrite && onContextPage && (
                    <Link to={newLink.to} className="btn btn-primary header-new">
                      {newLink.icon}
                      {newLink.label}
                    </Link>
                  )}
                  <NavLink
                    to="/meldingen"
                    className="icon-btn header-bell"
                    aria-label={msg.nav.notificationsUnread(unread)}
                  >
                    <span className="nav-icon">
                      <BellIcon />
                      {badge}
                    </span>
                  </NavLink>
                  <span className="header-user">
                    <UserMenu />
                  </span>
                </>
              }
            />
          </div>
          <PhoneBanner />
          {!online && <div className="offline-bar">{msg.sync.offline}</div>}
          <main className="app-main">
            <Suspense fallback={<SkeletonCards count={2} />}>
              <Outlet />
            </Suspense>
          </main>
        </div>
        {toast && (
          <div className="toast" role="status">
            {toast}
          </div>
        )}
      </div>
    </PageTitleProvider>
  );
}
