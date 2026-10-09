import type { DB } from '../db.js';

const WINDOW_MS = 60 * 60 * 1000;
const BASE_LOCK_MS = 60 * 1000;
const MAX_LOCK_MS = 60 * 60 * 1000;
const RETENTION_MS = 24 * 60 * 60 * 1000;

export const USER_FAILURE_THRESHOLD = 5;
export const IP_FAILURE_THRESHOLD = 30;

/**
 * Incremental lockout for failed logins. After `threshold` failures within the window the key is
 * locked for 1 min, doubling with every additional failure (max 60 min).
 */
export class LoginThrottle {
  constructor(
    private readonly db: DB,
    private readonly now: () => number = Date.now,
  ) {}

  /** Returns milliseconds until the key may try again (0 = allowed). */
  retryAfterMs(key: string, threshold: number): number {
    const now = this.now();
    const rows = this.db
      .prepare('SELECT at FROM login_attempts WHERE key = ? AND at > ? ORDER BY at DESC')
      .all(key, now - WINDOW_MS) as { at: number }[];
    if (rows.length < threshold) return 0;
    const lockMs = Math.min(MAX_LOCK_MS, BASE_LOCK_MS * 2 ** (rows.length - threshold));
    return Math.max(0, rows[0]!.at + lockMs - now);
  }

  recordFailure(key: string): void {
    this.db.prepare('INSERT INTO login_attempts (key, at) VALUES (?, ?)').run(key, this.now());
  }

  reset(key: string): void {
    this.db.prepare('DELETE FROM login_attempts WHERE key = ?').run(key);
  }

  purgeOld(): void {
    this.db.prepare('DELETE FROM login_attempts WHERE at < ?').run(this.now() - RETENTION_MS);
  }
}
