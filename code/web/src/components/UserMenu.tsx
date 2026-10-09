import { Link } from 'react-router-dom';
import { useAuth, useUser } from '../auth/AuthContext';
import { nl } from '../i18n/nl';
import { Avatar } from './Avatar';
import { LeaveIcon, ProfileIcon, SettingsIcon, UsersIcon } from './icons';
import { Menu } from './Menu';

/** Profile picture in the banner; opens a menu with profile, admin pages and log out. */
export function UserMenu() {
  const user = useUser();
  const { logout } = useAuth();

  return (
    <Menu trigger={<Avatar user={user} size="s" />} label={nl.userMenu.open} triggerClassName="banner-avatar">
      <div className="menu-head">
        <Avatar user={user} size="m" />
        <span>
          <strong>{user.displayName}</strong>
          <span className="muted">{nl.profile.roles[user.role]}</span>
        </span>
      </div>
      <Link to="/profiel" role="menuitem">
        <ProfileIcon />
        {nl.userMenu.profile}
      </Link>
      {user.role === 'admin' && (
        <>
          <Link to="/beheer/gebruikers" role="menuitem">
            <UsersIcon />
            {nl.profile.manageUsers}
          </Link>
          <Link to="/beheer/instellingen" role="menuitem">
            <SettingsIcon />
            {nl.profile.settings}
          </Link>
        </>
      )}
      <button type="button" role="menuitem" className="menu-sep" onClick={() => void logout()}>
        <LeaveIcon />
        {nl.profile.logout}
      </button>
    </Menu>
  );
}
