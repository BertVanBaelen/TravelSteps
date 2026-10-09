interface AvatarUser {
  displayName: string;
  avatarUrl: string | null;
}

/** Profile picture, or the first letter of the name when there is none. */
export function Avatar({ user, size = 'medium' }: { user: AvatarUser; size?: 'tiny' | 'small' | 'medium' | 'large' }) {
  const cls = `avatar avatar-${size}`;
  if (user.avatarUrl) {
    return <img className={cls} src={user.avatarUrl} alt="" loading="lazy" />;
  }
  return (
    <span className={cls} aria-hidden>
      {user.displayName.charAt(0).toUpperCase()}
    </span>
  );
}
