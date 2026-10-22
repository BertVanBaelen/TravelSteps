import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

export type DB = Database.Database;

export const DB_FILE = 'travelsteps.db';
/** Database file name before the rename to TravelSteps. */
const LEGACY_DB_FILE = 'bertsteps.db';

/**
 * One-time rename of the pre-TravelSteps database file (incl. WAL/SHM). Best effort: returns
 * true when renamed, false when there was nothing to do, or the error on failure.
 */
export function renameLegacyDatabase(dataDir: string): boolean | Error {
  const from = path.join(dataDir, LEGACY_DB_FILE);
  const to = path.join(dataDir, DB_FILE);
  if (!fs.existsSync(from) || fs.existsSync(to)) return false;
  try {
    for (const suffix of ['-wal', '-shm']) {
      if (fs.existsSync(from + suffix)) fs.renameSync(from + suffix, to + suffix);
    }
    fs.renameSync(from, to);
    return true;
  } catch (err) {
    return err instanceof Error ? err : new Error(String(err));
  }
}

/** Append-only list of migrations; index + 1 is stored in PRAGMA user_version. */
const migrations: string[] = [
  `
  CREATE TABLE users (
    id                      TEXT PRIMARY KEY,
    username                TEXT NOT NULL UNIQUE COLLATE NOCASE,
    display_name            TEXT NOT NULL,
    password_hash           TEXT NOT NULL,
    role                    TEXT NOT NULL CHECK (role IN ('admin', 'viewer')),
    must_change_credentials INTEGER NOT NULL DEFAULT 0,
    must_change_password    INTEGER NOT NULL DEFAULT 0,
    disabled                INTEGER NOT NULL DEFAULT 0,
    created_at              TEXT NOT NULL,
    updated_at              TEXT NOT NULL
  );

  CREATE TABLE sessions (
    id_hash      TEXT PRIMARY KEY,
    user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at   INTEGER NOT NULL,
    last_seen_at INTEGER NOT NULL,
    expires_at   INTEGER NOT NULL,
    ip           TEXT,
    user_agent   TEXT
  );
  CREATE INDEX idx_sessions_user ON sessions(user_id);

  CREATE TABLE login_attempts (
    id      INTEGER PRIMARY KEY AUTOINCREMENT,
    key     TEXT NOT NULL,
    at      INTEGER NOT NULL
  );
  CREATE INDEX idx_login_attempts_key_at ON login_attempts(key, at);
  `,
  `
  CREATE TABLE likes (
    post_id    TEXT NOT NULL,
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    PRIMARY KEY (post_id, user_id)
  );

  CREATE TABLE comments (
    id         TEXT PRIMARY KEY,
    post_id    TEXT NOT NULL,
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    text       TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX idx_comments_post ON comments(post_id, created_at);
  `,
  // Profile picture: 'file:<name>' in the avatar folder or 'immich:<assetId>'.
  `ALTER TABLE users ADD COLUMN avatar TEXT`,
  // Phase 8: 'traveller' role (CHECK constraint → table rebuild) and a personal Immich key.
  `
  CREATE TABLE users_new (
    id                      TEXT PRIMARY KEY,
    username                TEXT NOT NULL UNIQUE COLLATE NOCASE,
    display_name            TEXT NOT NULL,
    password_hash           TEXT NOT NULL,
    role                    TEXT NOT NULL CHECK (role IN ('admin', 'traveller', 'viewer')),
    must_change_credentials INTEGER NOT NULL DEFAULT 0,
    must_change_password    INTEGER NOT NULL DEFAULT 0,
    disabled                INTEGER NOT NULL DEFAULT 0,
    created_at              TEXT NOT NULL,
    updated_at              TEXT NOT NULL,
    avatar                  TEXT,
    -- AES-256-GCM encrypted Immich API key (see immich/keys.ts).
    immich_api_key_enc      TEXT
  );
  INSERT INTO users_new (id, username, display_name, password_hash, role, must_change_credentials,
      must_change_password, disabled, created_at, updated_at, avatar)
    SELECT id, username, display_name, password_hash, role, must_change_credentials,
      must_change_password, disabled, created_at, updated_at, avatar FROM users;
  DROP TABLE users;
  ALTER TABLE users_new RENAME TO users;
  `,
  // Phase 8: travels and posts move from Markdown files into the database.
  `
  CREATE TABLE travels (
    id             TEXT PRIMARY KEY,
    slug           TEXT NOT NULL UNIQUE,
    owner_id       TEXT NOT NULL REFERENCES users(id),
    name           TEXT NOT NULL,
    description    TEXT NOT NULL DEFAULT '',
    start_date     TEXT NOT NULL,
    end_date       TEXT,
    cover_asset_id TEXT,
    created_at     TEXT NOT NULL,
    updated_at     TEXT NOT NULL
  );

  CREATE TABLE travel_members (
    travel_id  TEXT NOT NULL REFERENCES travels(id) ON DELETE CASCADE,
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status     TEXT NOT NULL CHECK (status IN ('invited', 'accepted')),
    invited_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (travel_id, user_id)
  );
  CREATE INDEX idx_travel_members_user ON travel_members(user_id);

  CREATE TABLE travel_viewers (
    travel_id TEXT NOT NULL REFERENCES travels(id) ON DELETE CASCADE,
    user_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    PRIMARY KEY (travel_id, user_id)
  );
  CREATE INDEX idx_travel_viewers_user ON travel_viewers(user_id);

  CREATE TABLE posts (
    id             TEXT PRIMARY KEY,
    travel_id      TEXT NOT NULL REFERENCES travels(id) ON DELETE CASCADE,
    author_id      TEXT REFERENCES users(id) ON DELETE SET NULL,
    slug           TEXT NOT NULL,
    title          TEXT NOT NULL,
    date           TEXT NOT NULL,
    body           TEXT NOT NULL DEFAULT '',
    photos_json    TEXT NOT NULL DEFAULT '[]',
    locations_json TEXT NOT NULL DEFAULT '[]',
    segments_json  TEXT NOT NULL DEFAULT '[]',
    arrival_json   TEXT,
    stats_json     TEXT NOT NULL DEFAULT '{"custom":[]}',
    created_at     TEXT NOT NULL,
    updated_at     TEXT NOT NULL,
    published_at   TEXT NOT NULL,
    UNIQUE (travel_id, slug)
  );
  CREATE INDEX idx_posts_travel_date ON posts(travel_id, date);

  CREATE TABLE subscriptions (
    subscriber_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    traveller_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at    TEXT NOT NULL,
    PRIMARY KEY (subscriber_id, traveller_id)
  );

  CREATE TABLE notifications (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type       TEXT NOT NULL CHECK (type IN ('post', 'invite', 'like', 'comment')),
    actor_id   TEXT REFERENCES users(id) ON DELETE SET NULL,
    travel_id  TEXT REFERENCES travels(id) ON DELETE CASCADE,
    post_id    TEXT REFERENCES posts(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    read_at    TEXT
  );
  CREATE INDEX idx_notifications_user ON notifications(user_id, id);

  CREATE TABLE push_subscriptions (
    endpoint   TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    p256dh     TEXT NOT NULL,
    auth       TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE INDEX idx_push_subscriptions_user ON push_subscriptions(user_id);
  `,
  // Phase X: comment notifications show the comment text (and disappear with the comment).
  `ALTER TABLE notifications ADD COLUMN comment_id TEXT REFERENCES comments(id) ON DELETE CASCADE`,
  // V2-3: chosen UI/notification language ('nl' | 'en'); NULL = not chosen yet.
  `ALTER TABLE users ADD COLUMN language TEXT`,
  // V2-4: owner_id trusts trusted_id (original photo download, share links in V2-5).
  `
  CREATE TABLE trusted_users (
    owner_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    trusted_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    PRIMARY KEY (owner_id, trusted_id)
  );
  CREATE INDEX idx_trusted_users_trusted ON trusted_users(trusted_id);
  `,
];

export function openDatabase(file: string): DB {
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 5000');

  // Foreign keys stay off during migrations, so table rebuilds don't cascade.
  db.pragma('foreign_keys = OFF');
  const current = db.pragma('user_version', { simple: true }) as number;
  for (let i = current; i < migrations.length; i++) {
    db.transaction(() => {
      db.exec(migrations[i]!);
      const broken = db.pragma('foreign_key_check') as unknown[];
      if (broken.length > 0) throw new Error(`Migratie ${i + 1}: ongeldige verwijzingen`);
      db.pragma(`user_version = ${i + 1}`);
    })();
  }
  db.pragma('foreign_keys = ON');
  return db;
}
