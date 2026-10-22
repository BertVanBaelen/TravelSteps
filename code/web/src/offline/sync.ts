import type { PostDetail, PostInput } from '@travelsteps/shared';
import { ApiError, api, errorMessage } from '../api';
import { messages } from '../i18n/store';
import { db, legacyMigration, withTimeout, type OutboxItem } from './db';

export type SyncEvent =
  | { type: 'published'; postId: string; title: string }
  | { type: 'unauthorized' };

const listeners = new Set<(e: SyncEvent) => void>();

export function onSyncEvent(listener: (e: SyncEvent) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const emit = (e: SyncEvent) => listeners.forEach((l) => l(e));

export async function savePost(id: string, isNew: boolean, input: PostInput): Promise<PostDetail> {
  const r = await api<{ post: PostDetail }>(isNew ? '/posts' : `/posts/${id}`, {
    method: isNew ? 'POST' : 'PUT',
    body: isNew ? { ...input, id } : input,
  });
  return r.post;
}

/** Puts a post in the outbox (removing its draft) and tries to send it right away. */
export async function queuePost(id: string, isNew: boolean, input: PostInput): Promise<void> {
  await db.transaction('rw', db.outbox, db.drafts, async () => {
    await db.outbox.put({ id, isNew, input, status: 'pending', error: null, queuedAt: Date.now() });
    await db.drafts.delete(id);
  });
  void syncOutbox();
}

type Result = 'next' | 'stop';

async function send(item: OutboxItem): Promise<Result> {
  try {
    const post = await savePost(item.id, item.isNew, item.input);
    await db.outbox.delete(item.id);
    emit({ type: 'published', postId: post.id, title: post.title });
    return 'next';
  } catch (err) {
    if (!(err instanceof ApiError)) {
      await db.outbox.update(item.id, { status: 'error', error: messages().errors.generic });
      return 'next';
    }
    // Offline, server trouble or rate limit: keep the item pending and try again later.
    if (err.status === 0 || err.status === 429 || err.status >= 500) return 'stop';
    if (err.status === 401) {
      // Session expired: keep everything and let the user log in again.
      emit({ type: 'unauthorized' });
      return 'stop';
    }
    await db.outbox.update(item.id, {
      status: err.status === 409 && err.code === 'CONFLICT' ? 'conflict' : 'error',
      error: errorMessage(err),
    });
    return 'next';
  }
}

let running = false;
let again = false;

/** Sends all pending outbox items in order. Safe to call often. */
export async function syncOutbox(): Promise<void> {
  if (running) {
    again = true;
    return;
  }
  if (!navigator.onLine) return;
  running = true;
  try {
    // The one-time move from the old database must not block syncing when it hangs.
    await withTimeout(legacyMigration, 5000, undefined);
    do {
      again = false;
      const items = await db.outbox.orderBy('queuedAt').filter((i) => i.status === 'pending').toArray();
      for (const item of items) {
        if ((await send(item)) === 'stop') return;
      }
    } while (again);
  } finally {
    running = false;
  }
}

/** Starts syncing on reconnect, when the app becomes visible and periodically. */
export function startSync(): () => void {
  const run = () => void syncOutbox();
  const onVisible = () => {
    if (document.visibilityState === 'visible') run();
  };
  window.addEventListener('online', run);
  document.addEventListener('visibilitychange', onVisible);
  const timer = window.setInterval(run, 60_000);
  run();
  return () => {
    window.removeEventListener('online', run);
    document.removeEventListener('visibilitychange', onVisible);
    window.clearInterval(timer);
  };
}

export async function retryItem(id: string): Promise<void> {
  await db.outbox.update(id, { status: 'pending', error: null });
  void syncOutbox();
}

/** Conflict: overwrite the server version with the local one. */
export async function keepMine(id: string): Promise<void> {
  const item = await db.outbox.get(id);
  if (!item) return;
  const input = { ...item.input };
  delete input.baseUpdatedAt;
  await db.outbox.put({ ...item, input, status: 'pending', error: null });
  void syncOutbox();
}

/** Conflict: drop the local version. */
export async function discardItem(id: string): Promise<void> {
  await db.transaction('rw', db.outbox, db.drafts, async () => {
    await db.outbox.delete(id);
    await db.drafts.delete(id);
  });
}
