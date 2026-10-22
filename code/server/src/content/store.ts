import crypto from 'node:crypto';
import type { FastifyBaseLogger } from 'fastify';
import {
  isTraveller,
  postInputSchema,
  travelInputSchema,
  type Post,
  type PostInput,
  type Role,
  type Segment,
  type TravelInput,
  type TravelRole,
  type TravelStat,
} from '@travelsteps/shared';
import type { DB } from '../db.js';
import { HttpError, notFound } from '../errors.js';
import { slugify, uniqueName } from './files.js';

export interface TravelRecord {
  id: string;
  slug: string;
  ownerId: string;
  name: string;
  description: string;
  startDate: string;
  endDate: string | null;
  coverAssetId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MemberRecord {
  status: 'invited' | 'accepted';
  invitedBy: string | null;
  createdAt: string;
}

interface TravelEntry {
  travel: TravelRecord;
  members: Map<string, MemberRecord>;
  viewers: Set<string>;
}

/** The user a question about visibility or permissions is asked for. */
export interface Actor {
  id: string;
  role: Role;
}

/** Where an Immich asset is used, and whose Immich account it comes from. */
export interface AssetSource {
  travelId: string;
  /** Post author or travel owner (cover); null when that user was deleted. */
  userId: string | null;
}

interface TravelRow {
  id: string;
  slug: string;
  owner_id: string;
  name: string;
  description: string;
  start_date: string;
  end_date: string | null;
  cover_asset_id: string | null;
  created_at: string;
  updated_at: string;
}

interface PostRow {
  id: string;
  travel_id: string;
  author_id: string | null;
  slug: string;
  title: string;
  date: string;
  body: string;
  photos_json: string;
  locations_json: string;
  segments_json: string;
  arrival_json: string | null;
  stats_json: string;
  created_at: string;
  updated_at: string;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Parses "12", "12.5" or "12,5"; null for anything else. */
function parseNumber(value: string): number | null {
  const s = value.trim().replace(',', '.');
  return /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : null;
}

/**
 * Sums the numeric stats of posts: fixed stats per key (max. height as maximum; temperature is
 * not summable), custom stats with the same label (case-insensitive) and unit.
 */
export function summarizeStats(posts: Post[]): { distanceKm: number; stats: TravelStat[] } {
  let distanceKm = 0;
  const fixed = { afstand: 0, hoogtemeters: 0, duur: 0, maxHoogte: -Infinity };
  const seen = { afstand: false, hoogtemeters: false, duur: false, maxHoogte: false };
  const custom = new Map<string, TravelStat>();

  // Oldest first, so the first spelling of a custom label wins.
  for (const p of [...posts].reverse()) {
    for (const s of [...p.segments, ...(p.arrival ? [p.arrival] : [])]) {
      distanceKm += s.distanceKm ?? 0;
    }
    for (const key of ['afstand', 'hoogtemeters', 'duur'] as const) {
      const v = p.stats[key];
      if (typeof v === 'number') {
        fixed[key] += v;
        seen[key] = true;
      }
    }
    if (typeof p.stats.maxHoogte === 'number') {
      fixed.maxHoogte = Math.max(fixed.maxHoogte, p.stats.maxHoogte);
      seen.maxHoogte = true;
    }
    for (const c of p.stats.custom) {
      const value = parseNumber(c.value);
      if (value === null) continue;
      const unit = c.unit?.trim() ?? '';
      const id = `${c.label.trim().toLowerCase()}|${unit}`;
      const existing = custom.get(id);
      if (existing) existing.value += value;
      else custom.set(id, { key: `custom:${id}`, label: c.label.trim(), unit, value });
    }
  }

  const stats: TravelStat[] = [];
  if (seen.afstand)
    stats.push({ key: 'afstand', label: 'Afstand', unit: 'km', value: round2(fixed.afstand) });
  if (seen.hoogtemeters) {
    stats.push({
      key: 'hoogtemeters',
      label: 'Hoogtemeters',
      unit: 'm',
      value: round2(fixed.hoogtemeters),
    });
  }
  if (seen.maxHoogte) {
    stats.push({ key: 'maxHoogte', label: 'Max. hoogte', unit: 'm', value: fixed.maxHoogte });
  }
  if (seen.duur) stats.push({ key: 'duur', label: 'Duur', unit: 'u:mm', value: fixed.duur });
  for (const s of custom.values()) stats.push({ ...s, value: round2(s.value) });
  return { distanceKm: round2(distanceKm), stats };
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** True when `current` is `desired` or `desired-<n>` (a de-duplicated variant). */
function matchesBase(current: string, desired: string): boolean {
  return new RegExp(`^${escapeRegExp(desired)}(-\\d+)?$`).test(current);
}

const toTravel = (r: TravelRow): TravelRecord => ({
  id: r.id,
  slug: r.slug,
  ownerId: r.owner_id,
  name: r.name,
  description: r.description,
  startDate: r.start_date,
  endDate: r.end_date,
  coverAssetId: r.cover_asset_id,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

const toPost = (r: PostRow): Post => ({
  id: r.id,
  slug: r.slug,
  travelId: r.travel_id,
  authorId: r.author_id,
  title: r.title,
  date: r.date,
  body: r.body,
  photos: JSON.parse(r.photos_json) as Post['photos'],
  locations: JSON.parse(r.locations_json) as Post['locations'],
  segments: JSON.parse(r.segments_json) as Post['segments'],
  arrival: r.arrival_json ? (JSON.parse(r.arrival_json) as Segment) : null,
  stats: JSON.parse(r.stats_json) as Post['stats'],
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

const today = () => new Date().toISOString().slice(0, 10);

/**
 * Travels, posts, travel members and viewers, stored in SQLite. Everything is also kept in memory
 * (a blog has at most a few thousand posts) so lists, filters and stats stay cheap; all writes go
 * through this class.
 */
export class ContentStore {
  private travels = new Map<string, TravelEntry>();
  private posts = new Map<string, Post>();
  private sortedPosts: Post[] | null = null;
  private assetIndex: Map<string, AssetSource[]> | null = null;

  constructor(
    private readonly db: DB,
    private readonly log?: FastifyBaseLogger,
  ) {}

  // ---------- Loading ----------

  load(): void {
    this.travels.clear();
    this.posts.clear();
    this.invalidate();
    for (const row of this.db.prepare('SELECT * FROM travels').all() as TravelRow[]) {
      this.travels.set(row.id, { travel: toTravel(row), members: new Map(), viewers: new Set() });
    }
    const members = this.db.prepare('SELECT * FROM travel_members').all() as {
      travel_id: string;
      user_id: string;
      status: MemberRecord['status'];
      invited_by: string | null;
      created_at: string;
    }[];
    for (const m of members) {
      this.travels.get(m.travel_id)?.members.set(m.user_id, {
        status: m.status,
        invitedBy: m.invited_by,
        createdAt: m.created_at,
      });
    }
    const viewers = this.db.prepare('SELECT * FROM travel_viewers').all() as {
      travel_id: string;
      user_id: string;
    }[];
    for (const v of viewers) this.travels.get(v.travel_id)?.viewers.add(v.user_id);
    for (const row of this.db.prepare('SELECT * FROM posts').all() as PostRow[]) {
      this.posts.set(row.id, toPost(row));
    }
    this.log?.info({ travels: this.travels.size, posts: this.posts.size }, 'Inhoud geladen');
  }

  private invalidate(): void {
    this.sortedPosts = null;
    this.assetIndex = null;
  }

  get travelCount(): number {
    return this.travels.size;
  }

  // ---------- Access ----------

  private entry(id: string): TravelEntry {
    const entry = this.travels.get(id);
    if (!entry) throw notFound('Reis');
    return entry;
  }

  /** The user's relation to a travel (null = none). */
  roleIn(travelId: string, userId: string): TravelRole | null {
    const entry = this.travels.get(travelId);
    if (!entry) return null;
    if (entry.travel.ownerId === userId) return 'owner';
    const m = entry.members.get(userId);
    if (!m) return null;
    return m.status === 'accepted' ? 'member' : 'invited';
  }

  /** Owner or accepted member: the travel is part of this user's blog. */
  isAuthor(travelId: string, userId: string): boolean {
    const role = this.roleIn(travelId, userId);
    return role === 'owner' || role === 'member';
  }

  canView(actor: Actor, travelId: string): boolean {
    const entry = this.travels.get(travelId);
    if (!entry) return false;
    return (
      actor.role === 'admin' ||
      entry.travel.ownerId === actor.id ||
      entry.members.has(actor.id) ||
      entry.viewers.has(actor.id)
    );
  }

  /** Owner or admin: edit details, members and viewers; delete any post or comment. */
  canManage(actor: Actor, travelId: string): boolean {
    const entry = this.travels.get(travelId);
    return Boolean(entry && (actor.role === 'admin' || entry.travel.ownerId === actor.id));
  }

  canPost(actor: Actor, travelId: string): boolean {
    return isTraveller(actor.role) && this.isAuthor(travelId, actor.id);
  }

  /** Travels the actor may see, optionally limited to one traveller's blog. */
  visibleTravelIds(actor: Actor, travellerId?: string): Set<string> {
    const ids = new Set<string>();
    for (const id of this.travels.keys()) {
      if (!this.canView(actor, id)) continue;
      if (travellerId && !this.isAuthor(id, travellerId)) continue;
      ids.add(id);
    }
    return ids;
  }

  /** Users with a blog (owner/accepted member of a travel) the actor can see something of. */
  visibleTravellerIds(actor: Actor): Set<string> {
    const ids = new Set<string>();
    for (const id of this.visibleTravelIds(actor)) {
      const entry = this.travels.get(id)!;
      ids.add(entry.travel.ownerId);
      for (const [userId, m] of entry.members) if (m.status === 'accepted') ids.add(userId);
    }
    return ids;
  }

  /** Users that see posts in this travel (owner, members, viewers; not admins by role). */
  audience(travelId: string): Set<string> {
    const entry = this.entry(travelId);
    return new Set([entry.travel.ownerId, ...entry.members.keys(), ...entry.viewers]);
  }

  /** Owner + accepted members. */
  authors(travelId: string): string[] {
    const entry = this.entry(travelId);
    return [
      entry.travel.ownerId,
      ...[...entry.members].filter(([, m]) => m.status === 'accepted').map(([id]) => id),
    ];
  }

  // ---------- Travels ----------

  /** Newest start date first. */
  listTravels(ids?: Set<string>): TravelRecord[] {
    return [...this.travels.values()]
      .map((e) => e.travel)
      .filter((t) => !ids || ids.has(t.id))
      .sort(
        (a, b) => b.startDate.localeCompare(a.startDate) || b.createdAt.localeCompare(a.createdAt),
      );
  }

  getTravel(id: string): TravelRecord | undefined {
    return this.travels.get(id)?.travel;
  }

  members(travelId: string): Map<string, MemberRecord> {
    return this.entry(travelId).members;
  }

  viewers(travelId: string): Set<string> {
    return this.entry(travelId).viewers;
  }

  /** Travels the user owns. */
  ownedTravels(userId: string): TravelRecord[] {
    return this.listTravels().filter((t) => t.ownerId === userId);
  }

  /**
   * Default travel for a new post: the author's most recent ongoing travel, else the travel
   * with the latest start date.
   */
  defaultTravelFor(userId: string): TravelRecord | undefined {
    const own = this.listTravels().filter((t) => this.isAuthor(t.id, userId));
    const now = today();
    return own.find((t) => t.startDate <= now && (!t.endDate || t.endDate >= now)) ?? own[0];
  }

  private travelSlugTaken = (slug: string, exceptId?: string) =>
    [...this.travels.values()].some((e) => e.travel.slug === slug && e.travel.id !== exceptId);

  private writeTravel(t: TravelRecord): void {
    this.db
      .prepare(
        `INSERT INTO travels (id, slug, owner_id, name, description, start_date, end_date,
           cover_asset_id, created_at, updated_at)
         VALUES (@id, @slug, @ownerId, @name, @description, @startDate, @endDate, @coverAssetId,
           @createdAt, @updatedAt)
         ON CONFLICT(id) DO UPDATE SET slug = excluded.slug, owner_id = excluded.owner_id,
           name = excluded.name, description = excluded.description,
           start_date = excluded.start_date, end_date = excluded.end_date,
           cover_asset_id = excluded.cover_asset_id, updated_at = excluded.updated_at`,
      )
      .run(t);
  }

  createTravel(input: TravelInput, ownerId: string): TravelRecord {
    const data = travelInputSchema.parse(input);
    const now = new Date().toISOString();
    const travel: TravelRecord = {
      id: crypto.randomUUID(),
      slug: uniqueName(slugify(data.name, 'reis'), (s) => this.travelSlugTaken(s)),
      ownerId,
      ...data,
      createdAt: now,
      updatedAt: now,
    };
    this.writeTravel(travel);
    this.travels.set(travel.id, { travel, members: new Map(), viewers: new Set() });
    this.invalidate();
    return travel;
  }

  updateTravel(id: string, input: TravelInput): TravelRecord {
    const { travel } = this.entry(id);
    const data = travelInputSchema.parse(input);
    const desired = slugify(data.name, 'reis');
    if (!matchesBase(travel.slug, desired)) {
      travel.slug = uniqueName(desired, (s) => this.travelSlugTaken(s, id));
    }
    Object.assign(travel, data, { updatedAt: new Date().toISOString() });
    this.writeTravel(travel);
    this.invalidate();
    return travel;
  }

  /** Deletes a travel; with `withPosts` also all its posts, otherwise it must be empty. */
  deleteTravel(id: string, { withPosts = false } = {}): void {
    this.entry(id);
    const posts = this.listPosts(id);
    if (posts.length > 0 && !withPosts) {
      throw new HttpError(
        409,
        'TRAVEL_NOT_EMPTY',
        'Deze reis heeft nog stappen. Verwijder of verplaats die eerst.',
      );
    }
    this.db.transaction(() => {
      this.deleteSocial(posts.map((p) => p.id));
      // Posts, members, viewers and notifications cascade.
      this.db.prepare('DELETE FROM travels WHERE id = ?').run(id);
    })();
    for (const p of posts) this.posts.delete(p.id);
    this.travels.delete(id);
    this.invalidate();
  }

  /** Makes another user owner; the previous owner stays as accepted member. */
  transferTravel(id: string, newOwnerId: string): TravelRecord {
    const entry = this.entry(id);
    const oldOwner = entry.travel.ownerId;
    if (oldOwner === newOwnerId) return entry.travel;
    const now = new Date().toISOString();
    this.db.transaction(() => {
      this.db
        .prepare('DELETE FROM travel_members WHERE travel_id = ? AND user_id = ?')
        .run(id, newOwnerId);
      this.db
        .prepare('DELETE FROM travel_viewers WHERE travel_id = ? AND user_id = ?')
        .run(id, newOwnerId);
      this.db
        .prepare('UPDATE travels SET owner_id = ?, updated_at = ? WHERE id = ?')
        .run(newOwnerId, now, id);
      this.db
        .prepare(
          `INSERT OR REPLACE INTO travel_members (travel_id, user_id, status, invited_by, created_at)
           VALUES (?, ?, 'accepted', ?, ?)`,
        )
        .run(id, oldOwner, newOwnerId, now);
    })();
    entry.members.delete(newOwnerId);
    entry.viewers.delete(newOwnerId);
    entry.members.set(oldOwner, { status: 'accepted', invitedBy: newOwnerId, createdAt: now });
    entry.travel.ownerId = newOwnerId;
    entry.travel.updatedAt = now;
    this.invalidate();
    return entry.travel;
  }

  // ---------- Members & viewers ----------

  invite(travelId: string, userId: string, invitedBy: string): boolean {
    const entry = this.entry(travelId);
    if (entry.travel.ownerId === userId || entry.members.has(userId)) return false;
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO travel_members (travel_id, user_id, status, invited_by, created_at)
         VALUES (?, ?, 'invited', ?, ?)`,
      )
      .run(travelId, userId, invitedBy, now);
    entry.members.set(userId, { status: 'invited', invitedBy, createdAt: now });
    return true;
  }

  acceptInvitation(travelId: string, userId: string): void {
    const entry = this.entry(travelId);
    const m = entry.members.get(userId);
    if (!m || m.status !== 'invited') {
      throw new HttpError(404, 'NO_INVITATION', 'Er is geen uitnodiging voor deze reis.');
    }
    this.db
      .prepare(`UPDATE travel_members SET status = 'accepted' WHERE travel_id = ? AND user_id = ?`)
      .run(travelId, userId);
    m.status = 'accepted';
    this.invalidate();
  }

  /** Declines an invitation, leaves a travel or removes a member. Their posts stay. */
  removeMember(travelId: string, userId: string): void {
    const entry = this.entry(travelId);
    if (!entry.members.has(userId)) throw notFound('Lid');
    this.db
      .prepare('DELETE FROM travel_members WHERE travel_id = ? AND user_id = ?')
      .run(travelId, userId);
    entry.members.delete(userId);
    this.invalidate();
  }

  setViewers(travelId: string, userIds: string[]): void {
    const entry = this.entry(travelId);
    const ids = userIds.filter((id) => id !== entry.travel.ownerId && !entry.members.has(id));
    this.db.transaction(() => {
      this.db.prepare('DELETE FROM travel_viewers WHERE travel_id = ?').run(travelId);
      const insert = this.db.prepare(
        'INSERT INTO travel_viewers (travel_id, user_id) VALUES (?, ?)',
      );
      for (const id of ids) insert.run(travelId, id);
    })();
    entry.viewers = new Set(ids);
  }

  // ---------- Posts ----------

  /** Newest first (date desc, id desc), optionally for one travel or a set of travels. */
  listPosts(travels?: string | Set<string>): Post[] {
    if (!this.sortedPosts) {
      this.sortedPosts = [...this.posts.values()].sort(
        (a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id),
      );
    }
    if (travels === undefined) return this.sortedPosts;
    if (typeof travels === 'string') return this.sortedPosts.filter((p) => p.travelId === travels);
    return this.sortedPosts.filter((p) => travels.has(p.travelId));
  }

  getPost(id: string): Post | undefined {
    return this.posts.get(id);
  }

  private postEntry(id: string): Post {
    const post = this.posts.get(id);
    if (!post) throw notFound('Stap');
    return post;
  }

  private writePost(p: Post, publishedAt?: string): void {
    const values = {
      id: p.id,
      travelId: p.travelId,
      authorId: p.authorId,
      slug: p.slug,
      title: p.title,
      date: p.date,
      body: p.body,
      photos: JSON.stringify(p.photos),
      locations: JSON.stringify(p.locations),
      segments: JSON.stringify(p.segments),
      arrival: p.arrival ? JSON.stringify(p.arrival) : null,
      stats: JSON.stringify(p.stats),
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
      publishedAt: publishedAt ?? p.createdAt,
    };
    this.db
      .prepare(
        `INSERT INTO posts (id, travel_id, author_id, slug, title, date, body, photos_json,
           locations_json, segments_json, arrival_json, stats_json, created_at, updated_at,
           published_at)
         VALUES (@id, @travelId, @authorId, @slug, @title, @date, @body, @photos, @locations,
           @segments, @arrival, @stats, @createdAt, @updatedAt, @publishedAt)
         ON CONFLICT(id) DO UPDATE SET travel_id = excluded.travel_id, slug = excluded.slug,
           title = excluded.title, date = excluded.date, body = excluded.body,
           photos_json = excluded.photos_json, locations_json = excluded.locations_json,
           segments_json = excluded.segments_json, arrival_json = excluded.arrival_json,
           stats_json = excluded.stats_json, updated_at = excluded.updated_at`,
      )
      .run(values);
  }

  /** Chooses the slug `<yyyy-mm-dd>-<title>`, unique within the travel. */
  private placePost(post: Post, previousTravelId?: string): void {
    const desired = `${post.date.slice(0, 10)}-${slugify(post.title, 'post')}`;
    if (post.slug && previousTravelId === post.travelId && matchesBase(post.slug, desired)) return;
    post.slug = uniqueName(desired, (s) =>
      this.listPosts(post.travelId).some((p) => p.slug === s && p.id !== post.id),
    );
  }

  createPost(input: PostInput, authorId: string): Post {
    const data = postInputSchema.parse(input);
    const travelId = data.travelId ?? this.defaultTravelFor(authorId)?.id;
    if (!travelId) throw new HttpError(400, 'NO_TRAVEL', 'Maak eerst een reis aan.');
    this.entry(travelId);
    if (data.id && this.posts.has(data.id)) {
      throw new HttpError(409, 'POST_EXISTS', 'Deze stap bestaat al.');
    }
    const now = new Date().toISOString();
    const post: Post = {
      id: data.id ?? crypto.randomUUID(),
      slug: '',
      travelId,
      authorId,
      title: data.title,
      date: data.date,
      body: data.body,
      photos: data.photos,
      locations: data.locations,
      segments: data.segments,
      arrival: data.arrival,
      stats: data.stats,
      createdAt: now,
      updatedAt: now,
    };
    this.placePost(post);
    this.writePost(post, now);
    this.posts.set(post.id, post);
    this.invalidate();
    return post;
  }

  updatePost(id: string, input: PostInput): Post {
    const post = this.postEntry(id);
    const data = postInputSchema.parse(input);
    if (data.baseUpdatedAt && data.baseUpdatedAt !== post.updatedAt) {
      throw new HttpError(
        409,
        'CONFLICT',
        'Deze stap is intussen ergens anders gewijzigd. Kies welke versie je wilt houden.',
      );
    }
    const travelId = data.travelId ?? post.travelId;
    this.entry(travelId);
    const previousTravelId = post.travelId;
    Object.assign(post, {
      travelId,
      title: data.title,
      date: data.date,
      body: data.body,
      photos: data.photos,
      locations: data.locations,
      segments: data.segments,
      arrival: data.arrival,
      stats: data.stats,
      updatedAt: new Date().toISOString(),
    });
    this.placePost(post, previousTravelId);
    this.writePost(post);
    this.invalidate();
    return post;
  }

  private deleteSocial(postIds: string[]): void {
    const delLikes = this.db.prepare('DELETE FROM likes WHERE post_id = ?');
    const delComments = this.db.prepare('DELETE FROM comments WHERE post_id = ?');
    for (const id of postIds) {
      delLikes.run(id);
      delComments.run(id);
    }
  }

  /** Deletes a post with its likes, comments and notifications. */
  deletePost(id: string): void {
    this.postEntry(id);
    this.db.transaction(() => {
      this.deleteSocial([id]);
      this.db.prepare('DELETE FROM posts WHERE id = ?').run(id);
    })();
    this.posts.delete(id);
    this.invalidate();
  }

  /** Updates the cached connection from the previous post; not an edit, so `updatedAt` stays. */
  setArrival(id: string, arrival: Segment | null): void {
    const post = this.postEntry(id);
    post.arrival = arrival;
    this.db
      .prepare('UPDATE posts SET arrival_json = ? WHERE id = ?')
      .run(arrival ? JSON.stringify(arrival) : null, id);
  }

  /**
   * The post just before the given moment in the same travel (the feed order reversed).
   * A post being created has no ID yet and sorts after posts with the same date.
   */
  previousPost(travelId: string, date: string, id?: string): Post | undefined {
    return this.listPosts(travelId).find(
      (p) => p.id !== id && (p.date < date || (p.date === date && (!id || p.id < id))),
    );
  }

  // ---------- Import (Markdown migration) ----------

  /** Inserts an existing travel/post as-is (IDs, slugs and timestamps kept). */
  importContent(travels: TravelRecord[], posts: Post[]): void {
    this.db.transaction(() => {
      for (const t of travels) this.writeTravel(t);
      for (const p of posts) this.writePost(p);
    })();
    this.load();
  }

  // ---------- Helpers ----------

  postCounts(travelId: string): { postCount: number; photoCount: number } {
    const posts = this.listPosts(travelId);
    return {
      postCount: posts.length,
      photoCount: posts.reduce((n, p) => n + p.photos.length, 0),
    };
  }

  /** Summed stats of all posts in a travel, plus the total route distance. */
  travelStats(travelId: string): { distanceKm: number; stats: TravelStat[] } {
    return summarizeStats(this.listPosts(travelId));
  }

  /** Every place an Immich asset is used (posts and travel covers). */
  assetSources(assetId: string): AssetSource[] {
    if (!this.assetIndex) {
      const index = new Map<string, AssetSource[]>();
      const add = (asset: string, source: AssetSource) => {
        const list = index.get(asset);
        if (list) list.push(source);
        else index.set(asset, [source]);
      };
      for (const p of this.posts.values()) {
        for (const a of p.photos) add(a, { travelId: p.travelId, userId: p.authorId });
      }
      for (const { travel } of this.travels.values()) {
        if (travel.coverAssetId) {
          add(travel.coverAssetId, { travelId: travel.id, userId: travel.ownerId });
        }
      }
      this.assetIndex = index;
    }
    return this.assetIndex.get(assetId) ?? [];
  }
}
