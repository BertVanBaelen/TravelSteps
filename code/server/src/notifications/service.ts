import fs from 'node:fs';
import path from 'node:path';
import webpush from 'web-push';
import type { FastifyBaseLogger } from 'fastify';
import type {
  AppNotification,
  NotificationPage,
  NotificationType,
  PushPayload,
  PushSubscriptionInput,
} from '@travelsteps/shared';
import type { DB } from '../db.js';
import type { ContentStore } from '../content/store.js';
import type { UserRepository } from '../users/repository.js';
import { excerpt, truncate } from '../content/excerpt.js';

const PAGE_SIZE = 50;
/** Notifications older than this are removed by the housekeeping job. */
const KEEP_DAYS = 90;
/** Length of the explanation in the notification list and in push messages. */
const LIST_EXCERPT = 160;
const PUSH_EXCERPT = 120;

interface VapidKeys {
  publicKey: string;
  privateKey: string;
}

interface NotificationRow {
  id: number;
  type: NotificationType;
  actor_id: string | null;
  travel_id: string | null;
  post_id: string | null;
  comment_text: string | null;
  created_at: string;
  read_at: string | null;
}

export interface NotifyInput {
  type: NotificationType;
  actorId: string;
  travelId?: string | null;
  postId?: string | null;
  /** For 'comment': the placed comment (its text is shown in the notification). */
  commentId?: string | null;
}

function loadOrCreateVapid(dataDir: string, log?: FastifyBaseLogger): VapidKeys | null {
  const file = path.join(dataDir, '.vapid.json');
  try {
    if (fs.existsSync(file)) {
      const keys = JSON.parse(fs.readFileSync(file, 'utf8')) as Partial<VapidKeys>;
      if (keys.publicKey && keys.privateKey) return keys as VapidKeys;
    }
    const keys = webpush.generateVAPIDKeys();
    fs.writeFileSync(file, JSON.stringify(keys), { mode: 0o600 });
    return keys;
  } catch (err) {
    log?.error({ err: String(err) }, 'VAPID-sleutels konden niet worden gemaakt; geen pushmeldingen');
    return null;
  }
}

/** In-app notifications, blog subscriptions and Web Push. */
export class NotificationService {
  private readonly vapid: VapidKeys | null;

  constructor(
    private readonly db: DB,
    private readonly content: ContentStore,
    private readonly users: UserRepository,
    dataDir: string,
    private readonly publicUrl: string | undefined,
    private readonly log?: FastifyBaseLogger,
  ) {
    this.vapid = loadOrCreateVapid(dataDir, log);
  }

  get pushAvailable(): boolean {
    return this.vapid !== null;
  }

  get publicKey(): string | null {
    return this.vapid?.publicKey ?? null;
  }

  // ---------- Subscriptions (blogs) ----------

  subscribedTo(subscriberId: string): Set<string> {
    const rows = this.db
      .prepare('SELECT traveller_id FROM subscriptions WHERE subscriber_id = ?')
      .all(subscriberId) as { traveller_id: string }[];
    return new Set(rows.map((r) => r.traveller_id));
  }

  subscribe(subscriberId: string, travellerId: string): void {
    this.db
      .prepare(
        `INSERT OR IGNORE INTO subscriptions (subscriber_id, traveller_id, created_at)
         VALUES (?, ?, ?)`,
      )
      .run(subscriberId, travellerId, new Date().toISOString());
  }

  unsubscribe(subscriberId: string, travellerId: string): void {
    this.db
      .prepare('DELETE FROM subscriptions WHERE subscriber_id = ? AND traveller_id = ?')
      .run(subscriberId, travellerId);
  }

  private subscribersOf(travellerIds: string[]): Set<string> {
    if (travellerIds.length === 0) return new Set();
    const rows = this.db
      .prepare(
        `SELECT DISTINCT subscriber_id FROM subscriptions
         WHERE traveller_id IN (${travellerIds.map(() => '?').join(',')})`,
      )
      .all(...travellerIds) as { subscriber_id: string }[];
    return new Set(rows.map((r) => r.subscriber_id));
  }

  // ---------- Creating notifications ----------

  /** Recipients of a new post: the travel's other authors and subscribers that can see it. */
  postRecipients(travelId: string, actorId: string): string[] {
    const authors = this.content.authors(travelId);
    const ids = new Set([...authors, ...this.subscribersOf(authors)]);
    ids.delete(actorId);
    return [...ids].filter((id) => {
      const user = this.users.findById(id);
      return user && !user.disabled && this.content.canView(user, travelId);
    });
  }

  /** Stores the notification for each recipient and sends a push message (fire and forget). */
  notify(recipients: Iterable<string>, input: NotifyInput): void {
    const ids = [...new Set(recipients)].filter((id) => id !== input.actorId);
    if (ids.length === 0) return;
    const now = new Date().toISOString();
    const insert = this.db.prepare(
      `INSERT INTO notifications (user_id, type, actor_id, travel_id, post_id, comment_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );
    this.db.transaction(() => {
      for (const id of ids) {
        insert.run(
          id,
          input.type,
          input.actorId,
          input.travelId ?? null,
          input.postId ?? null,
          input.commentId ?? null,
          now,
        );
      }
    })();
    const payload = this.payload(input);
    for (const id of ids) void this.push(id, payload);
  }

  private commentText(id: string | null | undefined): string | null {
    if (!id) return null;
    const row = this.db.prepare('SELECT text FROM comments WHERE id = ?').get(id) as
      | { text: string }
      | undefined;
    return row?.text ?? null;
  }

  private payload(input: NotifyInput): PushPayload {
    const actor = this.users.findById(input.actorId)?.displayName ?? 'Iemand';
    const travel = input.travelId ? this.content.getTravel(input.travelId) : undefined;
    const post = input.postId ? this.content.getPost(input.postId) : undefined;
    const postUrl = post ? `/post/${post.id}` : '/';
    const title = post ? `"${post.title}"` : 'je stap';
    switch (input.type) {
      case 'post': {
        const preview = post ? excerpt(post.body, PUSH_EXCERPT) : '';
        return {
          title: travel
            ? `${actor} plaatste een nieuwe stap in ${travel.name}`
            : `${actor} plaatste een nieuwe stap`,
          body: [post?.title, preview].filter(Boolean).join(' – ') || 'Bekijk de nieuwe stap.',
          url: postUrl,
          tag: `post-${input.postId}`,
        };
      }
      case 'invite':
        return {
          title: `${actor} nodigt je uit om mee te reizen`,
          body: travel
            ? `Schrijf mee aan "${travel.name}". Open je meldingen om de uitnodiging te accepteren.`
            : 'Open je meldingen om de uitnodiging te accepteren.',
          url: '/meldingen',
          tag: `invite-${input.travelId}`,
        };
      case 'like':
        return {
          title: `${actor} vindt je stap leuk`,
          body: `${actor} gaf een like op ${title}.`,
          url: postUrl,
        };
      case 'comment': {
        const text = this.commentText(input.commentId);
        return {
          title: `${actor} reageerde op ${title}`,
          body: text ? `"${truncate(text, PUSH_EXCERPT)}"` : 'Bekijk de reactie bij je stap.',
          url: `${postUrl}#reacties`,
          ...(input.commentId ? { tag: `comment-${input.commentId}` } : {}),
        };
      }
    }
  }

  /** Explanation shown below a notification in the list. */
  private explanation(row: NotificationRow): string | null {
    switch (row.type) {
      case 'comment':
        return row.comment_text ? truncate(row.comment_text, LIST_EXCERPT) : null;
      case 'post':
      case 'like': {
        const post = row.post_id ? this.content.getPost(row.post_id) : undefined;
        return (post && excerpt(post.body, LIST_EXCERPT)) || null;
      }
      case 'invite': {
        const travel = row.travel_id ? this.content.getTravel(row.travel_id) : undefined;
        return (travel && excerpt(travel.description, LIST_EXCERPT)) || null;
      }
    }
  }

  // ---------- Reading ----------

  /**
   * Removes notifications about travels the user can no longer see (removed as viewer or
   * member), so the list never reveals current titles or excerpts of those posts.
   */
  private dropInaccessible(userId: string): void {
    const user = this.users.findById(userId);
    if (!user) return;
    const travelIds = this.db
      .prepare(
        'SELECT DISTINCT travel_id FROM notifications WHERE user_id = ? AND travel_id IS NOT NULL',
      )
      .pluck()
      .all(userId) as string[];
    const remove = this.db.prepare('DELETE FROM notifications WHERE user_id = ? AND travel_id = ?');
    for (const travelId of travelIds) {
      if (!this.content.canView(user, travelId)) remove.run(userId, travelId);
    }
  }

  list(userId: string): NotificationPage {
    this.dropInaccessible(userId);
    const rows = this.db
      .prepare(
        `SELECT n.id, n.type, n.actor_id, n.travel_id, n.post_id, c.text AS comment_text,
                n.created_at, n.read_at
         FROM notifications n LEFT JOIN comments c ON c.id = n.comment_id
         WHERE n.user_id = ? ORDER BY n.id DESC LIMIT ?`,
      )
      .all(userId, PAGE_SIZE) as NotificationRow[];
    const refs = this.users.refs();
    const items: AppNotification[] = rows.map((r) => ({
      id: r.id,
      type: r.type,
      actor: (r.actor_id && refs.get(r.actor_id)) || null,
      travelId: r.travel_id,
      travelName: (r.travel_id && this.content.getTravel(r.travel_id)?.name) || null,
      postId: r.post_id,
      postTitle: (r.post_id && this.content.getPost(r.post_id)?.title) || null,
      excerpt: this.explanation(r),
      createdAt: r.created_at,
      read: r.read_at !== null,
    }));
    return { items, unread: this.countUnread(userId) };
  }

  unreadCount(userId: string): number {
    this.dropInaccessible(userId);
    return this.countUnread(userId);
  }

  private countUnread(userId: string): number {
    const row = this.db
      .prepare('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read_at IS NULL')
      .get(userId) as { n: number };
    return row.n;
  }

  markRead(userId: string, id?: number): void {
    const now = new Date().toISOString();
    if (id === undefined) {
      this.db
        .prepare('UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL')
        .run(now, userId);
    } else {
      this.db
        .prepare(
          'UPDATE notifications SET read_at = COALESCE(read_at, ?) WHERE id = ? AND user_id = ?',
        )
        .run(now, id, userId);
    }
  }

  purgeOld(): void {
    const cutoff = new Date(Date.now() - KEEP_DAYS * 24 * 60 * 60 * 1000).toISOString();
    this.db.prepare('DELETE FROM notifications WHERE created_at < ?').run(cutoff);
  }

  // ---------- Web Push ----------

  addPushSubscription(userId: string, sub: PushSubscriptionInput): void {
    this.db
      .prepare(
        `INSERT INTO push_subscriptions (endpoint, user_id, p256dh, auth, created_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id,
           p256dh = excluded.p256dh, auth = excluded.auth`,
      )
      .run(sub.endpoint, userId, sub.keys.p256dh, sub.keys.auth, new Date().toISOString());
  }

  removePushSubscription(userId: string, endpoint: string): void {
    this.db
      .prepare('DELETE FROM push_subscriptions WHERE endpoint = ? AND user_id = ?')
      .run(endpoint, userId);
  }

  private async push(userId: string, payload: PushPayload): Promise<void> {
    if (!this.vapid) return;
    const subs = this.db
      .prepare('SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?')
      .all(userId) as { endpoint: string; p256dh: string; auth: string }[];
    const body = JSON.stringify(payload);
    for (const s of subs) {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          body,
          {
            TTL: 24 * 60 * 60,
            vapidDetails: {
              subject: this.publicUrl ?? 'mailto:travelsteps@localhost',
              publicKey: this.vapid.publicKey,
              privateKey: this.vapid.privateKey,
            },
          },
        );
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          this.db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?').run(s.endpoint);
        } else {
          this.log?.warn({ status, err: String(err) }, 'Pushmelding versturen mislukt');
        }
      }
    }
  }
}
