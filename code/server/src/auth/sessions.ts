import crypto from 'node:crypto';
import type { DB } from '../db.js';

export const SESSION_COOKIE = 'ts_session';

/** How often the sliding expiry is pushed forward (avoids a DB write on every request). */
const REFRESH_INTERVAL_MS = 60 * 60 * 1000;

interface SessionRow {
  user_id: string;
  last_seen_at: number;
  expires_at: number;
}

export interface ValidSession {
  userId: string;
  expiresAt: number;
  refreshed: boolean;
}

/**
 * Server-side sessions. The cookie holds a random token; only an HMAC of the token is stored,
 * so a leaked database cannot be used to hijack sessions.
 */
export class SessionStore {
  constructor(
    private readonly db: DB,
    private readonly secret: string,
    readonly ttlMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  private hash(token: string): string {
    return crypto.createHmac('sha256', this.secret).update(token).digest('hex');
  }

  create(userId: string, meta: { ip?: string; userAgent?: string } = {}): { token: string } {
    const token = crypto.randomBytes(32).toString('base64url');
    const now = this.now();
    this.db
      .prepare(
        `INSERT INTO sessions (id_hash, user_id, created_at, last_seen_at, expires_at, ip, user_agent)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        this.hash(token),
        userId,
        now,
        now,
        now + this.ttlMs,
        meta.ip ?? null,
        meta.userAgent?.slice(0, 300) ?? null,
      );
    return { token };
  }

  validate(token: string): ValidSession | null {
    if (!token || token.length > 100) return null;
    const idHash = this.hash(token);
    const row = this.db
      .prepare('SELECT user_id, last_seen_at, expires_at FROM sessions WHERE id_hash = ?')
      .get(idHash) as SessionRow | undefined;
    if (!row) return null;

    const now = this.now();
    if (row.expires_at <= now) {
      this.db.prepare('DELETE FROM sessions WHERE id_hash = ?').run(idHash);
      return null;
    }

    if (now - row.last_seen_at >= REFRESH_INTERVAL_MS) {
      const expiresAt = now + this.ttlMs;
      this.db
        .prepare('UPDATE sessions SET last_seen_at = ?, expires_at = ? WHERE id_hash = ?')
        .run(now, expiresAt, idHash);
      return { userId: row.user_id, expiresAt, refreshed: true };
    }
    return { userId: row.user_id, expiresAt: row.expires_at, refreshed: false };
  }

  revoke(token: string): void {
    this.db.prepare('DELETE FROM sessions WHERE id_hash = ?').run(this.hash(token));
  }

  revokeAllForUser(userId: string): void {
    this.db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
  }

  purgeExpired(): void {
    this.db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(this.now());
  }
}
