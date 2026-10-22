import { Link } from 'react-router-dom';
import { useAuth, useUser } from '../auth/AuthContext';
import { useT } from '../i18n';
import { Avatar } from './Avatar';
import { LeaveIcon, ProfileIcon, SettingsIcon, UsersIcon } from './icons';
import { Menu } from './Menu';

/** Profile picture in the banner; opens a menu with profile, admin pages and log out. */
export function UserMenu() {
  const msg = useT();
  const user = useUser();
  const { logout } = useAuth();

  return (
    <Menu trigger={<Avatar user={user} size="s" />} label={msg.userMenu.open} triggerClassName="banner-avatar">
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
