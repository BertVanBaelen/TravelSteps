import Dexie, { liveQuery, type EntityTable } from 'dexie';
import { useEffect, useState } from 'react';
import type { PostInput } from '@travelsteps/shared';
import type { StatsForm } from '../components/StatsEditor';

/** Post editor contents saved locally while writing (also offline). */
export interface Draft {
  /** Post ID: the existing post, or the client-chosen ID of a new post. */
  id: string;
  isNew: boolean;
  input: PostInput;
  /** Raw stats fields, which may not be valid numbers yet. */
  statsForm?: StatsForm;
  savedAt: number;
}

export type OutboxStatus = 'pending' | 'error' | 'conflict';

/** A post waiting to be sent to the server. */
export interface OutboxItem {
  id: string;
  isNew: boolean;
  input: PostInput;
  status: OutboxStatus;
  error: string | null;
  queuedAt: number;
}

class OfflineDb extends Dexie {
  drafts!: EntityTable<Draft, 'id'>;
  outbox!: EntityTable<OutboxItem, 'id'>;

  constructor() {
    super('travelsteps');
    this.version(1).stores({ drafts: 'id, savedAt', outbox: 'id, queuedAt' });
  }
}

export const db = new OfflineDb();

/** Name of the IndexedDB database and cache prefix before the rename to TravelSteps. */
const LEGACY_NAME = 'bertsteps';

/**
 * One-time, best-effort move of drafts and outbox from the pre-TravelSteps IndexedDB database,
 * and removal of the old service worker caches.
 */
async function migrateLegacyStore(): Promise<void> {
  try {
    if (await Dexie.exists(LEGACY_NAME)) {
      const old = new Dexie(LEGACY_NAME);
      old.version(1).stores({ drafts: 'id, savedAt', outbox: 'id, queuedAt' });
      const [drafts, outbox] = await Promise.all([
        old.table<Draft, string>('drafts').toArray(),
        old.table<OutboxItem, string>('outbox').toArray(),
      ]);
      await db.transaction('rw', db.drafts, db.outbox, async () => {
        for (const d of drafts) if (!(await db.drafts.get(d.id))) await db.drafts.put(d);
        for (const o of outbox) if (!(await db.outbox.get(o.id))) await db.outbox.put(o);
      });
      old.close();
      await Dexie.delete(LEGACY_NAME);
    }
  } catch (err) {
    console.warn('Oude offline gegevens konden niet worden overgezet', err);
  }
  try {
    if ('caches' in window) {
      for (const name of await caches.keys()) {
        if (name.startsWith(`${LEGACY_NAME}-`)) await caches.delete(name);
      }
    }
  } catch {
    // Old caches only take up space; ignore.
  }
}

export const legacyMigration = migrateLegacyStore();

/**
 * Resolves with `fallback` when a local (IndexedDB) operation takes longer than `ms`.
 * IndexedDB can hang on some phones (notably iOS Safari after the app was in the
 * background); the UI must never wait on it forever.
 */
export function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      console.warn(`Lokale opslag reageert niet binnen ${ms} ms`);
      resolve(fallback);
    }, ms);
    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (err: unknown) => {
        window.clearTimeout(timer);
        reject(err instanceof Error ? err : new Error(String(err)));
      },
    );
  });
}

export function newPostId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6]! & 0x0f) | 0x40;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** Re-renders whenever the IndexedDB query result changes. */
export function useLiveQuery<T>(query: () => Promise<T>, deps: unknown[]): T | undefined {
  const [value, setValue] = useState<T>();
  useEffect(() => {
    const sub = liveQuery(query).subscribe({ next: setValue, error: (e) => console.error(e) });
    return () => sub.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return value;
}

export function useOnline(): boolean {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}
