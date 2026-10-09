import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth, useUser } from '../auth/AuthContext';
import { nl } from '../i18n/nl';
import { Avatar } from './Avatar';

/** Profile picture in the banner; opens a menu with profile, admin pages and log out. */
export function UserMenu() {
  const user = useUser();
  const { logout } = useAuth();
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="user-menu" ref={ref}>
      <button
        type="button"
        className="banner-avatar"
        aria-label={nl.userMenu.open}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <Avatar user={user} size="small" />
      </button>
      {open && (
        <div className="user-menu-panel" role="menu">
          <div className="user-menu-head">
            <strong>{user.displayName}</strong>
            <span className="muted">{nl.profile.roles[user.role]}</span>
          </div>
          <Link to="/profiel" role="menuitem">
            {nl.userMenu.profile}
          </Link>
          {user.role === 'admin' && (
            <>
              <Link to="/beheer/gebruikers" role="menuitem">
                {nl.profile.manageUsers}
              </Link>
              <Link to="/beheer/instellingen" role="menuitem">
                {nl.profile.settings}
              </Link>
            </>
          )}
          <button type="button" role="menuitem" onClick={() => void logout()}>
            {nl.profile.logout}
          </button>
        </div>
      )}
    </div>
  );
}
