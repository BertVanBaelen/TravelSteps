import fs from 'node:fs';
import path from 'node:path';
import type { FastifyBaseLogger } from 'fastify';
import type { DB } from './db.js';

/** Backups are made at the first check on or after this local hour (night, little activity). */
const BACKUP_HOUR = 3;
const FILE_PATTERN = /^travelsteps-(\d{4}-\d{2}-\d{2})\.db$/;

export interface BackupStatus {
  enabled: boolean;
  keep: number;
  dir: string;
  last: { file: string; at: string; size: number } | null;
  lastError: string | null;
}

const localDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/**
 * Nightly online backup of the SQLite database into `<data>/backups`, keeping the newest
 * `keep` files. The backup is consistent while the app keeps running (SQLite backup API).
 */
export class BackupService {
  readonly dir: string;
  private running: Promise<string | null> | null = null;
  private lastError: string | null = null;

  constructor(
    private readonly db: DB,
    dataDir: string,
    private readonly keep: number,
    private readonly log?: FastifyBaseLogger,
  ) {
    this.dir = path.join(dataDir, 'backups');
  }

  get enabled(): boolean {
    return this.keep > 0;
  }

  /** Backup files, newest first. */
  list(): string[] {
    if (!fs.existsSync(this.dir)) return [];
    return fs
      .readdirSync(this.dir)
      .filter((f) => FILE_PATTERN.test(f))
      .sort()
      .reverse();
  }

  /** Makes today's backup when it's due (enabled, after the backup hour, not done yet today). */
  async runIfDue(now = new Date()): Promise<string | null> {
    if (!this.enabled || now.getHours() < BACKUP_HOUR) return null;
    if (this.list()[0] === `travelsteps-${localDate(now)}.db`) return null;
    return this.run(now);
  }

  /** Makes (or replaces) today's backup and removes old ones. Returns the file path. */
  run(now = new Date()): Promise<string | null> {
    this.running ??= this.backup(now).finally(() => {
      this.running = null;
    });
    return this.running;
  }

  private async backup(now: Date): Promise<string | null> {
    const file = path.join(this.dir, `travelsteps-${localDate(now)}.db`);
    const tmp = `${file}.tmp`;
    try {
      fs.mkdirSync(this.dir, { recursive: true });
      await this.db.backup(tmp);
      fs.renameSync(tmp, file);
      this.lastError = null;
      this.prune();
      this.log?.info({ file }, 'Databaseback-up gemaakt');
      return file;
    } catch (err) {
      fs.rmSync(tmp, { force: true });
      this.lastError = err instanceof Error ? err.message : String(err);
      this.log?.error({ err: this.lastError }, 'Databaseback-up mislukt');
      return null;
    }
  }

  private prune(): void {
    for (const old of this.list().slice(Math.max(this.keep, 1))) {
      fs.rmSync(path.join(this.dir, old), { force: true });
    }
  }

  /** Waits for a running backup (before closing the database). */
  async settled(): Promise<void> {
    await this.running;
  }

  status(): BackupStatus {
    const newest = this.list()[0];
    let last: BackupStatus['last'] = null;
    if (newest) {
      const stat = fs.statSync(path.join(this.dir, newest));
      last = { file: newest, at: stat.mtime.toISOString(), size: stat.size };
    }
    return {
      enabled: this.enabled,
      keep: this.keep,
      dir: this.dir,
      last,
      lastError: this.lastError,
    };
  }
}
