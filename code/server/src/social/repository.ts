import crypto from 'node:crypto';
import type { SocialCounts, UserRef } from '@travelsteps/shared';
import type { DB } from '../db.js';
import { avatarUrl } from '../users/repository.js';

export interface CommentRecord {
  id: string;
  postId: string;
  userId: string;
  authorName: string;
  authorAvatarUrl: string | null;
  text: string;
  createdAt: string;
  updatedAt: string;
}

interface CommentRow {
  id: string;
  post_id: string;
  user_id: string;
  display_name: string;
  avatar: string | null;
  text: string;
  created_at: string;
  updated_at: string;
}

const toComment = (r: CommentRow): CommentRecord => ({
  id: r.id,
  postId: r.post_id,
  userId: r.user_id,
  authorName: r.display_name,
  authorAvatarUrl: avatarUrl(r.user_id, r.avatar),
  text: r.text,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

const COMMENT_SELECT = `
  SELECT c.id, c.post_id, c.user_id, u.display_name, u.avatar, c.text, c.created_at, c.updated_at
  FROM comments c JOIN users u ON u.id = c.user_id`;

/** Likes and comments, keyed by post ID (posts themselves live in Markdown files). */
export class SocialRepository {
  constructor(private readonly db: DB) {}

  // ---------- Likes ----------

  /** True when this is a new like. */
  like(postId: string, userId: string): boolean {
    const res = this.db
      .prepare('INSERT OR IGNORE INTO likes (post_id, user_id, created_at) VALUES (?, ?, ?)')
      .run(postId, userId, new Date().toISOString());
    return res.changes > 0;
  }

  unlike(postId: string, userId: string): void {
    this.db.prepare('DELETE FROM likes WHERE post_id = ? AND user_id = ?').run(postId, userId);
  }

  likers(postId: string): UserRef[] {
    return this.likersFor([postId], 1000).get(postId) ?? [];
  }

  /** The first `limit` likers per post (in like order). */
  likersFor(postIds: string[], limit: number): Map<string, UserRef[]> {
    const result = new Map<string, UserRef[]>(postIds.map((id) => [id, []]));
    if (postIds.length === 0) return result;
    const rows = this.db
      .prepare(
        `SELECT post_id, id, display_name, avatar FROM (
           SELECT l.post_id, u.id, u.display_name, u.avatar,
             ROW_NUMBER() OVER (PARTITION BY l.post_id ORDER BY l.created_at, l.rowid) AS rn
           FROM likes l JOIN users u ON u.id = l.user_id
           WHERE l.post_id IN (${postIds.map(() => '?').join(',')})
         ) WHERE rn <= ? ORDER BY post_id, rn`,
      )
      .all(...postIds, limit) as {
      post_id: string;
      id: string;
      display_name: string;
      avatar: string | null;
    }[];
    for (const r of rows) {
      result.get(r.post_id)!.push({
        id: r.id,
        displayName: r.display_name,
        avatarUrl: avatarUrl(r.id, r.avatar),
      });
    }
    return result;
  }

  /** The latest `limit` comments per post, oldest first. */
  latestComments(postIds: string[], limit: number): Map<string, CommentRecord[]> {
    const result = new Map<string, CommentRecord[]>(postIds.map((id) => [id, []]));
    if (postIds.length === 0) return result;
    const rows = this.db
      .prepare(
        `SELECT * FROM (
           ${COMMENT_SELECT.replace(
             'SELECT ',
             'SELECT ROW_NUMBER() OVER (PARTITION BY c.post_id ORDER BY c.created_at DESC, c.rowid DESC) AS rn, ',
           )}
           WHERE c.post_id IN (${postIds.map(() => '?').join(',')})
         ) WHERE rn <= ? ORDER BY post_id, rn DESC`,
      )
      .all(...postIds, limit) as CommentRow[];
    for (const r of rows) result.get(r.post_id)!.push(toComment(r));
    return result;
  }

  /** Like/comment counts and own like state for many posts at once. */
  counts(postIds: string[], userId: string): Map<string, SocialCounts> {
    const result = new Map<string, SocialCounts>();
    for (const id of postIds) result.set(id, { likeCount: 0, commentCount: 0, likedByMe: false });
    if (postIds.length === 0) return result;

    const placeholders = postIds.map(() => '?').join(',');
    const likeRows = this.db
      .prepare(
        `SELECT post_id, COUNT(*) AS n, MAX(user_id = ?) AS mine
         FROM likes WHERE post_id IN (${placeholders}) GROUP BY post_id`,
      )
      .all(userId, ...postIds) as { post_id: string; n: number; mine: number }[];
    for (const r of likeRows) {
      const c = result.get(r.post_id)!;
      c.likeCount = r.n;
      c.likedByMe = r.mine === 1;
    }
    const commentRows = this.db
      .prepare(
        `SELECT post_id, COUNT(*) AS n FROM comments
         WHERE post_id IN (${placeholders}) GROUP BY post_id`,
      )
      .all(...postIds) as { post_id: string; n: number }[];
    for (const r of commentRows) result.get(r.post_id)!.commentCount = r.n;
    return result;
  }

  countsFor(postId: string, userId: string): SocialCounts {
    return this.counts([postId], userId).get(postId)!;
  }

  // ---------- Comments ----------

  listComments(postId: string): CommentRecord[] {
    return (
      this.db
        .prepare(`${COMMENT_SELECT} WHERE c.post_id = ? ORDER BY c.created_at, c.rowid`)
        .all(postId) as CommentRow[]
    ).map(toComment);
  }

  getComment(id: string): CommentRecord | undefined {
    const row = this.db.prepare(`${COMMENT_SELECT} WHERE c.id = ?`).get(id) as
      CommentRow | undefined;
    return row && toComment(row);
  }

  addComment(postId: string, userId: string, text: string): CommentRecord {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO comments (id, post_id, user_id, text, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(id, postId, userId, text, now, now);
    return this.getComment(id)!;
  }

  updateComment(id: string, text: string): CommentRecord {
    this.db
      .prepare('UPDATE comments SET text = ?, updated_at = ? WHERE id = ?')
      .run(text, new Date().toISOString(), id);
    return this.getComment(id)!;
  }

  deleteComment(id: string): void {
    this.db.prepare('DELETE FROM comments WHERE id = ?').run(id);
  }

  /** Removes all likes and comments of a deleted post. */
  deleteForPost(postId: string): void {
    this.db.transaction(() => {
      this.db.prepare('DELETE FROM likes WHERE post_id = ?').run(postId);
      this.db.prepare('DELETE FROM comments WHERE post_id = ?').run(postId);
    })();
  }
}
