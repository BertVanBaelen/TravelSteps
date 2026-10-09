import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { BackupService } from '../src/backup.js';
import { openDatabase, type DB } from '../src/db.js';
import { APP_VERSION } from '../src/version.js';

let dir: string;
let db: DB;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ts-backup-'));
  db = openDatabase(path.join(dir, 'travelsteps.db'));
});

afterEach(() => {
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

const at = (day: number, hour: number) => new Date(2025, 0, day, hour, 0, 0);

describe('backups', () => {
  it('makes a readable copy once a day after 03:00', async () => {
    const backups = new BackupService(db, dir, 7);
    expect(await backups.runIfDue(at(10, 2))).toBeNull();

    const file = await backups.runIfDue(at(10, 4));
    expect(file).toBe(path.join(dir, 'backups', 'travelsteps-2025-01-10.db'));
    const copy = new Database(file!, { readonly: true });
    expect(copy.prepare('SELECT count(*) AS n FROM users').get()).toBeTruthy();
    copy.close();

    expect(await backups.runIfDue(at(10, 23))).toBeNull();
    expect(backups.status().last?.file).toBe('travelsteps-2025-01-10.db');
  });

  it('keeps only the newest backups', async () => {
    const backups = new BackupService(db, dir, 2);
    for (const day of [1, 2, 3, 4]) await backups.runIfDue(at(day, 5));
    expect(backups.list()).toEqual(['travelsteps-2025-01-04.db', 'travelsteps-2025-01-03.db']);
  });

  it('does nothing when disabled', async () => {
    const backups = new BackupService(db, dir, 0);
    expect(await backups.runIfDue(at(1, 5))).toBeNull();
    expect(backups.status()).toMatchObject({ enabled: false, last: null });
  });
});

describe('version', () => {
  it('matches the add-on version in config.yaml', () => {
    const yaml = fs.readFileSync(path.join(__dirname, '..', '..', 'config.yaml'), 'utf8');
    const version = /^version:\s*['"]?([^'"\s]+)/m.exec(yaml)?.[1];
    expect(version).toBe(APP_VERSION);
  });
});
