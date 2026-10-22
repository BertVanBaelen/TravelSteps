import crypto from 'node:crypto';
import { isLanguage, type Language, type PublicUser, type Role, type UserRef } from '@travelsteps/shared';
import type { DB } from '../db.js';

interface UserRow {
  id: string;
  username: string;
  display_name: string;
  password_hash: string;
  role: Role;
  must_change_credentials: number;
  must_change_password: number;
  disabled: number;
  avatar: string | null;
  immich_api_key_enc: string | null;
  language: string | null;
  created_at: string;
  updated_at: string;
}

export interface UserRecord {
  id: string;
  username: string;
  displayName: string;
  passwordHash: string;
  role: Role;
  mustChangeCredentials: boolean;
  mustChangePassword: boolean;
  disabled: boolean;
  /** 'file:<name>' or 'immich:<assetId>'. */
  avatar: string | null;
  /** Encrypted personal Immich API key. */
  immichKeyEnc: string | null;
  /** Chosen language; null = not chosen yet (notifications use Dutch). */
  language: Language | null;
  createdAt: string;
  updatedAt: string;
}

export interface NewUser {
  username: string;
  displayName: string;
  passwordHash: string;
  role: Role;
  mustChangeCredentials?: boolean;
  mustChangePassword?: boolean;
}

export type UserPatch = Partial<
  Pick<
    UserRecord,
    | 'username'
    | 'displayName'
    | 'passwordHash'
    | 'mustChangeCredentials'
    | 'mustChangePassword'
    | 'disabled'
    | 'avatar'
    | 'role'
    | 'immichKeyEnc'
    | 'language'
  >
>;

const PATCH_COLUMNS: Record<keyof UserPatch, string> = {
  username: 'username',
  displayName: 'display_name',
  passwordHash: 'password_hash',
  mustChangeCredentials: 'must_change_credentials',
  mustChangePassword: 'must_change_password',
  disabled: 'disabled',
  avatar: 'avatar',
  role: 'role',
  immichKeyEnc: 'immich_api_key_enc',
  language: 'language',
};

function fromRow(row: UserRow): UserRecord {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    passwordHash: row.password_hash,
    role: row.role,
    mustChangeCredentials: row.must_change_credentials === 1,
    mustChangePassword: row.must_change_password === 1,
    disabled: row.disabled === 1,
    avatar: row.avatar ?? null,
    immichKeyEnc: row.immich_api_key_enc ?? null,
    language: isLanguage(row.language) ? row.language : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Versioned URL, so browsers may cache the picture until it changes. */
export function avatarUrl(userId: string, avatar: string | null | undefined): string | null {
  if (!avatar) return null;
  const version = crypto.createHash('sha256').update(avatar).digest('base64url').slice(0, 10);
  return `/api/avatars/${userId}?v=${version}`;
}

export function toPublicUser(user: UserRecord): PublicUser {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    mustChangeCredentials: user.mustChangeCredentials,
    mustChangePassword: user.mustChangePassword,
    disabled: user.disabled,
    createdAt: user.createdAt,
    avatarUrl: avatarUrl(user.id, user.avatar),
    hasImmichKey: Boolean(user.immichKeyEnc),
    language: user.language,
  };
}

export class UserRepository {
  constructor(private readonly db: DB) {}

  count(): number {
    return (this.db.prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number }).n;
  }

  list(): UserRecord[] {
    const rows = this.db
      .prepare("SELECT * FROM users ORDER BY role = 'admin' DESC, display_name COLLATE NOCASE")
      .all() as UserRow[];
    return rows.map(fromRow);
  }

  findById(id: string): UserRecord | undefined {
    const row = this.db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined;
    return row && fromRow(row);
  }

  /** Case-insensitive lookup. */
  findByUsername(username: string): UserRecord | undefined {
    const row = this.db.prepare('SELECT * FROM users WHERE username = ?').get(username) as
      UserRow | undefined;
    return row && fromRow(row);
  }

  create(input: NewUser): UserRecord {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO users (id, username, display_name, password_hash, role,
           must_change_credentials, must_change_password, disabled, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
      )
      .run(
        id,
        input.username,
        input.displayName,
        input.passwordHash,
        input.role,
        input.mustChangeCredentials ? 1 : 0,
        input.mustChangePassword ? 1 : 0,
        now,
        now,
      );
    return this.findById(id)!;
  }

  update(id: string, patch: UserPatch): UserRecord {
    const sets: string[] = [];
    const values: (string | number | null)[] = [];
    for (const [key, value] of Object.entries(patch) as [keyof UserPatch, unknown][]) {
      if (value === undefined) continue;
      sets.push(`${PATCH_COLUMNS[key]} = ?`);
      values.push(typeof value === 'boolean' ? (value ? 1 : 0) : (value as string | null));
    }
    if (sets.length > 0) {
      sets.push('updated_at = ?');
      values.push(new Date().toISOString(), id);
      this.db.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`).run(...values);
    }
    return this.findById(id)!;
  }

  delete(id: string): void {
    this.db.prepare('DELETE FROM users WHERE id = ?').run(id);
  }

  /** Name + avatar of every user, for showing authors, members and actors. */
  refs(): Map<string, UserRef> {
    const rows = this.db.prepare('SELECT id, display_name, avatar FROM users').all() as {
      id: string;
      display_name: string;
      avatar: string | null;
    }[];
    return new Map(
      rows.map((r) => [r.id, { id: r.id, displayName: r.display_name, avatarUrl: avatarUrl(r.id, r.avatar) }]),
    );
  }

  ref(id: string | null | undefined): UserRef | null {
    if (!id) return null;
    const user = this.findById(id);
    return user ? { id: user.id, displayName: user.displayName, avatarUrl: avatarUrl(user.id, user.avatar) } : null;
  }
}
