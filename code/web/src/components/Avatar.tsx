import { nl } from '../i18n/nl';

export interface AvatarUser {
  id?: string;
  displayName: string;
  avatarUrl: string | null;
}

export type AvatarSize = 'xs' | 's' | 'm' | 'l';

const PALETTE = ['#16a34a', '#0284c7', '#7c3aed', '#db2777', '#ea580c', '#0d9488', '#4f46e5', '#b45309'];

/** Up to two initials: first letters of the first and last word. */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  const first = words[0]!.charAt(0);
  const last = words.length > 1 ? words[words.length - 1]!.charAt(0) : '';
  return (first + last).toUpperCase();
}

/** A stable colour per user, so the same person always looks the same. */
export function avatarColor(key: string): string {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0;
  return PALETTE[Math.abs(h) % PALETTE.length]!;
}

/**
 * Profile picture, or coloured initials when there is none.
 * `null` is a removed user: a neutral placeholder.
 */
export function Avatar({ user, size = 'm' }: { user: AvatarUser | null; size?: AvatarSize }) {
  const cls = `avatar avatar-${size}`;
  if (!user) {
    return (
      <span className={`${cls} avatar-deleted`} aria-hidden title={nl.blog.deletedUser}>
        ?
      </span>
    );
  }
  if (user.avatarUrl) {
    return <img className={cls} src={user.avatarUrl} alt="" loading="lazy" />;
  }
  return (
    <span className={cls} aria-hidden style={{ background: avatarColor(user.id ?? user.displayName) }}>
      {initials(user.displayName)}
    </span>
  );
}

/** A few overlapping avatars, e.g. of the people who liked something. */
export function AvatarStack({ users, max = 5 }: { users: AvatarUser[]; max?: number }) {
  if (users.length === 0) return null;
  const shown = users.slice(0, max);
  return (
    <span className="avatar-stack" aria-hidden>
      {shown.map((u, i) => (
        <Avatar key={u.id ?? i} user={u} size="xs" />
      ))}
      {users.length > max && <span className="avatar avatar-xs avatar-more">+{users.length - max}</span>}
    </span>
  );
}
