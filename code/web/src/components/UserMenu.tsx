import { Link } from 'react-router-dom';
import { useAuth, useUser } from '../auth/AuthContext';
import { useT } from '../i18n';
import { Avatar } from './Avatar';
import { LeaveIcon, ProfileIcon, SettingsIcon, UsersIcon } from './icons';
import { Menu } from './Menu';

/**
 * Profile picture that opens a menu with profile, admin pages and log out. In the banner on
 * phones; at the bottom of the rail/sidebar (`placement="nav"`, opening upwards) on wider screens,
 * where the sidebar also shows the name.
 */
export function UserMenu({ placement = 'banner' }: { placement?: 'banner' | 'nav' }) {
  const msg = useT();
  const user = useUser();
  const { logout } = useAuth();
  const nav = placement === 'nav';

  return (
    <Menu
      trigger={
        nav ? (
          <>
            <Avatar user={user} size="m" />
            <span className="nav-user-text">
              <strong>{user.displayName}</strong>
              <span>{msg.nav.profileSettings}</span>
            </span>
          </>
        ) : (
          <Avatar user={user} size="m" />
        )
      }
      label={msg.userMenu.open}
      triggerClassName={nav ? 'nav-user-button' : 'banner-avatar'}
      panelClassName={nav ? 'menu-panel-up' : undefined}
    >
      <div className="menu-head">
        <Avatar user={user} size="m" />
        <span>
          <strong>{user.displayName}</strong>
          <span className="muted">{msg.profile.roles[user.role]}</span>
        </span>
      </div>
      <Link to="/profiel" role="menuitem">
        <ProfileIcon />
        {msg.userMenu.profile}
      </Link>
      {user.role === 'admin' && (
        <>
          <Link to="/beheer/gebruikers" role="menuitem">
            <UsersIcon />
            {msg.profile.manageUsers}
          </Link>
          <Link to="/beheer/instellingen" role="menuitem">
            <SettingsIcon />
            {msg.profile.settings}
          </Link>
        </>
      )}
      <button type="button" role="menuitem" className="menu-sep" onClick={() => void logout()}>
        <LeaveIcon />
        {msg.profile.logout}
      </button>
    </Menu>
  );
}
