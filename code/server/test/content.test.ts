import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import type {
  AdminUser,
  AppNotification,
  FeedPage,
  PostDetail,
  Traveller,
  TravelSummary,
} from '@travelsteps/shared';
import { buildApp } from '../src/app.js';
import { DB_FILE, openDatabase, renameLegacyDatabase, type DB } from '../src/db.js';
import type { AppConfig } from '../src/config.js';
import { excerpt } from '../src/routes/posts.js';

const CSRF = { 'x-requested-with': 'TravelSteps' };
const ASSET_A = '11111111-1111-4111-8111-111111111111';
const ASSET_B = '22222222-2222-4222-8222-222222222222';
const ASSET_C = '44444444-4444-4444-8444-444444444444';
const BERT_KEY = 'sleutel-van-bert-123';
const PIET_KEY = 'sleutel-van-piet-123';

let app: FastifyInstance | null = null;
let db: DB | null = null;
let dataDir: string;
let fakeImmich: http.Server | null = null;

interface TestUser {
  cookie: string;
  id: string;
}

function cookieFrom(res: LightMyRequestResponse): string {
  const c = res.cookies.find((c) => c.name === 'ts_session');
  if (!c) throw new Error('geen sessie-cookie');
  return `ts_session=${c.value}`;
}

function call(method: string, url: string, cookie: string, payload?: unknown) {
  return app!.inject({
    method: method as 'GET',
    url,
    payload: payload as object,
    headers: { ...CSRF, cookie, 'cf-connecting-ip': '10.0.0.1' },
  });
}

const dbPath = () => path.join(dataDir, DB_FILE);

async function startApp(config: Partial<AppConfig> = {}, dbFile = ':memory:') {
  db = openDatabase(dbFile);
  app = await buildApp(
    {
      port: 0,
      host: '127.0.0.1',
      dataDir,
      cookieSecure: false,
      trustCloudflare: true,
      sessionTtlDays: 30,
      sessionSecret: 'x'.repeat(40),
      webDistDir: null,
      logLevel: 'silent',
      initialAdmin: { username: 'bert', password: 'start-wachtwoord-123' },
      ...config,
    },
    db,
  );
}

/** Restarts the app on the database file in the data dir. */
async function restart(config: Partial<AppConfig> = {}) {
  await app!.close();
  db!.close();
  await startApp(config, dbPath());
}

async function login(username: string, password: string): Promise<string> {
  const res = await app!.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { username, password },
    headers: { ...CSRF, 'cf-connecting-ip': '10.0.0.1' },
  });
  expect(res.statusCode).toBe(200);
  return cookieFrom(res);
}

let adminId = '';
let omaId = '';

/** Logs in as the seeded admin 'bert' and completes the forced password change. */
async function setupAdmin(): Promise<string> {
  const first = await login('bert', 'start-wachtwoord-123');
  const changed = await call('POST', '/api/auth/change-password', first, {
    newPassword: 'een-sterk-wachtwoord',
  });
  expect(changed.statusCode).toBe(200);
  adminId = changed.json().user.id;
  return cookieFrom(changed);
}

async function addUser(
  admin: string,
  username: string,
  displayName: string,
  role: 'traveller' | 'viewer' = 'viewer',
): Promise<TestUser> {
  const created = await call('POST', '/api/users', admin, {
    username,
    displayName,
    temporaryPassword: 'tijdelijk-wachtwoord',
    role,
  });
  expect(created.statusCode).toBe(201);
  expect(created.json().user.role).toBe(role);
  const tmp = await login(username, 'tijdelijk-wachtwoord');
  const res = await call('POST', '/api/auth/change-password', tmp, {
    newPassword: `${username}-wachtwoord-123`,
  });
  expect(res.statusCode).toBe(200);
  return { cookie: cookieFrom(res), id: created.json().user.id };
}

/** Returns [adminCookie, viewerCookie]; the viewer 'oma' has no rights on any travel yet. */
async function setupUsers(): Promise<[string, string]> {
  const admin = await setupAdmin();
  const oma = await addUser(admin, 'oma', 'Oma');
  omaId = oma.id;
  return [admin, oma.cookie];
}

interface World {
  admin: string;
  piet: TestUser;
  kees: TestUser;
  oma: TestUser;
  jan: TestUser;
  travel: TravelSummary;
}

/** Piet (traveller) owns "IJsland", Kees (traveller) co-writes it, Oma may view it, Jan nothing. */
async function setupWorld(): Promise<World> {
  const admin = await setupAdmin();
  const piet = await addUser(admin, 'piet', 'Piet', 'traveller');
  const kees = await addUser(admin, 'kees', 'Kees', 'traveller');
  const oma = await addUser(admin, 'oma', 'Oma');
  const jan = await addUser(admin, 'jan', 'Jan');
  const travel = await createTravel(piet.cookie, 'IJsland');
  await addMember(piet.cookie, travel.id, kees);
  await setViewers(piet.cookie, travel.id, [oma.id]);
  return { admin, piet, kees, oma, jan, travel };
}

async function createTravel(
  cookie: string,
  name = 'Noorwegen 2025',
  extra: Record<string, unknown> = {},
): Promise<TravelSummary> {
  const res = await call('POST', '/api/travels', cookie, {
    name,
    startDate: '2025-06-01',
    description: 'Een **mooie** reis',
    ...extra,
  });
  expect(res.statusCode).toBe(201);
  return res.json().travel;
}

async function createPost(
  cookie: string,
  title: string,
  date: string,
  extra: Record<string, unknown> = {},
): Promise<PostDetail> {
  const res = await call('POST', '/api/posts', cookie, { title, date, body: 'Hallo', ...extra });
  expect(res.statusCode).toBe(201);
  return res.json().post;
}

async function getTravel(cookie: string, id: string): Promise<TravelSummary> {
  const res = await call('GET', `/api/travels/${id}`, cookie);
  expect(res.statusCode).toBe(200);
  return res.json().travel;
}

async function setViewers(cookie: string, travelId: string, userIds: string[]) {
  const res = await call('PUT', `/api/travels/${travelId}/viewers`, cookie, { userIds });
  expect(res.statusCode).toBe(200);
  return res.json().travel as TravelSummary;
}

/** Invites and accepts. */
async function addMember(manager: string, travelId: string, member: TestUser) {
  const invited = await call('POST', `/api/travels/${travelId}/members`, manager, {
    userId: member.id,
  });
  expect(invited.statusCode).toBe(201);
  const accepted = await call('POST', `/api/travels/${travelId}/invitation/accept`, member.cookie);
  expect(accepted.statusCode).toBe(200);
}

async function notificationsOf(cookie: string): Promise<{ items: AppNotification[]; unread: number }> {
  const res = await call('GET', '/api/notifications', cookie);
  expect(res.statusCode).toBe(200);
  return res.json();
}

const unreadTypes = async (cookie: string) =>
  (await notificationsOf(cookie)).items.filter((n) => !n.read).map((n) => n.type);

const feedTitles = async (cookie: string, query = '') =>
  ((await call('GET', `/api/posts${query}`, cookie)).json() as FeedPage).items.map((p) => p.title);

/** Fake Immich; each API key belongs to one "library" whose name is part of the image body. */
async function startFakeImmich(): Promise<string> {
  const keys: Record<string, string> = { [BERT_KEY]: 'bert', [PIET_KEY]: 'piet' };
  fakeImmich = http.createServer((req, res) => {
    const owner = keys[String(req.headers['x-api-key'])];
    if (!owner) {
      res.writeHead(401).end();
      return;
    }
    const json = (body: unknown) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(body));
    };
    if (req.url === '/api/server/about') return json({ version: 'v1.130.0' });
    if (req.url === '/api/albums') return json([]);
    if (req.url === '/api/search/metadata' && req.method === 'POST') {
      req.resume();
      return json({ assets: { items: [{ id: ASSET_A, type: 'IMAGE' }], nextPage: null } });
    }
    if (req.url?.startsWith('/api/assets/') && !req.url.includes('/', 12)) {
      return json({ id: req.url.slice(12), type: 'IMAGE' });
    }
    const m =
      /^\/api\/assets\/([^/]+)\/thumbnail\?size=(\w+)$/.exec(req.url ?? '') ??
      /^\/api\/assets\/([^/]+)\/(original)$/.exec(req.url ?? '');
    if (m) {
      if (req.headers['if-none-match'] === '"abc"') {
        res.writeHead(304, { etag: '"abc"' }).end();
        return;
      }
      res.writeHead(200, { 'content-type': 'image/jpeg', etag: '"abc"' });
      res.end(`jpeg:${owner}:${m[1]}:${m[2]}`);
      return;
    }
    res.writeHead(404).end();
  });
  await new Promise<void>((r) => fakeImmich!.listen(0, '127.0.0.1', r));
  return `http://127.0.0.1:${(fakeImmich.address() as AddressInfo).port}/`;
}

const immichKeyRow = (userId: string) =>
  (
    db!.prepare('SELECT immich_api_key_enc AS enc FROM users WHERE id = ?').get(userId) as {
      enc: string | null;
    }
  ).enc;

const count = (table: string) =>
  (db!.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;

beforeEach(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'travelsteps-test-'));
});

afterEach(async () => {
  await app?.close();
  app = null;
  db?.close();
  db = null;
  if (fakeImmich) {
    await new Promise((r) => fakeImmich!.close(r));
    fakeImmich = null;
  }
  fs.rmSync(dataDir, { recursive: true, force: true });
});

describe('reizen en posts', () => {
  it('slaat reizen en posts op in SQLite en laadt ze opnieuw na herstart', async () => {
    await startApp({}, dbPath());
    const [admin] = await setupUsers();
    const travel = await createTravel(admin);
    expect(travel).toMatchObject({
      slug: 'noorwegen-2025',
      myRole: 'owner',
      canManage: true,
      canPost: true,
      members: [],
      viewerIds: [],
    });
    expect(travel.owner).toMatchObject({ id: adminId, displayName: 'Beheerder' });

    const post = await createPost(admin, 'Dag 1: Bergen!', '2025-06-02T10:00:00+02:00', {
      photos: [ASSET_A],
      stats: { afstand: 12.5, custom: [{ label: 'Koffie', value: '3', unit: 'kopjes' }] },
    });
    expect(post).toMatchObject({
      travelId: travel.id,
      date: '2025-06-02T08:00:00.000Z',
      slug: '2025-06-02-dag-1-bergen',
      canEdit: true,
      canDelete: true,
    });
    expect(post.author).toMatchObject({ id: adminId, displayName: 'Beheerder' });
    await setViewers(admin, travel.id, [omaId]);
    // No Markdown files anymore.
    expect(fs.existsSync(path.join(dataDir, 'travels'))).toBe(false);

    // Restart on the same database file (the session is stored there too).
    await restart();
    const res = await call('GET', `/api/posts/${post.id}`, admin);
    expect(res.statusCode).toBe(200);
    const reloaded: PostDetail = res.json().post;
    expect(reloaded.title).toBe('Dag 1: Bergen!');
    expect(reloaded.body).toBe('Hallo');
    expect(reloaded.photos).toEqual([ASSET_A]);
    expect(reloaded.stats.afstand).toBe(12.5);
    expect(reloaded.stats.custom).toEqual([{ label: 'Koffie', value: '3', unit: 'kopjes' }]);
    expect(reloaded.travelName).toBe('Noorwegen 2025');
    expect(reloaded.author?.id).toBe(adminId);
    const t = await getTravel(admin, travel.id);
    expect(t).toMatchObject({ description: 'Een **mooie** reis', viewerIds: [omaId], postCount: 1 });
  });

  it('verplaatst posts tussen reizen en houdt slugs uniek', async () => {
    await startApp();
    const [admin] = await setupUsers();
    const t1 = await createTravel(admin, 'Reis Een');
    const t2 = await createTravel(admin, 'Reis Twee');
    const post = await createPost(admin, 'Titel', '2025-06-02T10:00:00Z', { travelId: t1.id });
    expect(post.slug).toBe('2025-06-02-titel');

    const res = await call('PUT', `/api/posts/${post.id}`, admin, {
      travelId: t2.id,
      title: 'Nieuwe titel',
      date: '2025-06-03T10:00:00Z',
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().post).toMatchObject({ travelId: t2.id, slug: '2025-06-03-nieuwe-titel' });
    const twin = await createPost(admin, 'Nieuwe titel', '2025-06-03T12:00:00Z', {
      travelId: t2.id,
    });
    expect(twin.slug).toBe('2025-06-03-nieuwe-titel-2');

    const renamed = await call('PUT', `/api/travels/${t2.id}`, admin, {
      name: 'Reis Drie',
      startDate: '2025-06-01',
    });
    expect(renamed.json().travel.slug).toBe('reis-drie');
    expect((await createTravel(admin, 'Reis Drie')).slug).toBe('reis-drie-2');

    // Editing without travelId keeps the post where it is.
    const again = await call('PUT', `/api/posts/${post.id}`, admin, {
      title: 'Nieuwe titel',
      date: '2025-06-03T10:00:00Z',
      body: 'aangepast',
    });
    expect(again.statusCode).toBe(200);
    expect(again.json().post).toMatchObject({ travelId: t2.id, slug: '2025-06-03-nieuwe-titel' });

    // A travel with posts cannot be deleted; an empty one can.
    const blocked = await call('DELETE', `/api/travels/${t2.id}`, admin);
    expect(blocked.statusCode).toBe(409);
    expect(blocked.json().error).toBe('TRAVEL_NOT_EMPTY');
    expect((await call('DELETE', `/api/travels/${t1.id}`, admin)).statusCode).toBe(204);
    expect((await call('GET', `/api/travels/${t1.id}`, admin)).statusCode).toBe(404);
  });

  it('kiest de lopende reis van de auteur als standaardreis', async () => {
    await startApp();
    const admin = await setupAdmin();
    const piet = await addUser(admin, 'piet', 'Piet', 'traveller');
    await createTravel(admin, 'Oud', { startDate: '2020-01-01', endDate: '2020-02-01' });
    const ongoing = await createTravel(admin, 'Lopend', { startDate: '2021-01-01' });
    await createTravel(admin, 'Toekomst', { startDate: '2099-01-01' });
    await createTravel(piet.cookie, 'Piet vroeger', { startDate: '2019-01-01', endDate: '2019-01-10' });
    const later = await createTravel(piet.cookie, 'Piet later', { startDate: '2098-01-01' });

    expect((await createPost(admin, 'A', '2025-06-02T10:00:00Z')).travelId).toBe(ongoing.id);
    // No ongoing travel of his own: the one with the latest start date. Travels piet is only
    // invited to (not yet accepted) don't count.
    await call('POST', `/api/travels/${ongoing.id}/members`, admin, { userId: piet.id });
    expect((await createPost(piet.cookie, 'B', '2025-06-02T10:00:00Z')).travelId).toBe(later.id);
    await call('POST', `/api/travels/${ongoing.id}/invitation/accept`, piet.cookie);
    expect((await createPost(piet.cookie, 'C', '2025-06-02T10:00:00Z')).travelId).toBe(ongoing.id);
  });

  it('geeft 400 bij een post zonder reis', async () => {
    await startApp();
    const [admin] = await setupUsers();
    const res = await call('POST', '/api/posts', admin, {
      title: 'X',
      date: '2025-06-02T10:00:00Z',
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('NO_TRAVEL');
  });

  it('pagineert de feed op datum', async () => {
    await startApp();
    const [admin, viewer] = await setupUsers();
    const travel = await createTravel(admin);
    await setViewers(admin, travel.id, [omaId]);
    for (let i = 1; i <= 5; i++) await createPost(admin, `Post ${i}`, `2025-06-0${i}T10:00:00Z`);

    const page1: FeedPage = (await call('GET', '/api/posts?limit=2', viewer)).json();
    expect(page1.items.map((p) => p.title)).toEqual(['Post 5', 'Post 4']);
    expect(page1.nextCursor).toBeTruthy();
    const page2: FeedPage = (
      await call('GET', `/api/posts?limit=2&cursor=${page1.nextCursor}`, viewer)
    ).json();
    expect(page2.items.map((p) => p.title)).toEqual(['Post 3', 'Post 2']);
    const page3: FeedPage = (
      await call('GET', `/api/posts?limit=2&cursor=${page2.nextCursor}`, viewer)
    ).json();
    expect(page3.items.map((p) => p.title)).toEqual(['Post 1']);
    expect(page3.nextCursor).toBeNull();
  });

  it('weigert schrijfacties voor kijkers', async () => {
    await startApp();
    const [admin, viewer] = await setupUsers();
    const travel = await createTravel(admin);
    await setViewers(admin, travel.id, [omaId]);
    const post = await createPost(admin, 'X', '2025-06-02T10:00:00Z');
    expect(
      (await call('POST', '/api/travels', viewer, { name: 'Y', startDate: '2025-01-01' }))
        .statusCode,
    ).toBe(403);
    expect((await call('DELETE', `/api/travels/${travel.id}`, viewer)).statusCode).toBe(403);
    expect(
      (await call('PUT', `/api/travels/${travel.id}`, viewer, { name: 'Y', startDate: '2025-01-01' }))
        .statusCode,
    ).toBe(403);
    expect(
      (await call('POST', '/api/posts', viewer, { title: 'Y', date: '2025-01-01' })).statusCode,
    ).toBe(403);
    expect(
      (await call('PUT', `/api/posts/${post.id}`, viewer, { title: 'Y', date: '2025-01-01' }))
        .statusCode,
    ).toBe(403);
    expect((await call('DELETE', `/api/posts/${post.id}`, viewer)).statusCode).toBe(403);
    expect((await call('GET', '/api/admin/settings', viewer)).statusCode).toBe(403);
    expect((await call('GET', '/api/immich/albums', viewer)).statusCode).toBe(403);
    expect((await call('GET', '/api/directory', viewer)).statusCode).toBe(403);
    expect(
      (await call('PUT', '/api/profile/immich-key', viewer, { apiKey: BERT_KEY })).statusCode,
    ).toBe(403);
    expect((await call('GET', '/api/posts', viewer)).statusCode).toBe(200);
  });

  it('zet Markdown-bestanden eenmalig over naar de database en slaat ongeldige over', async () => {
    const root = path.join(dataDir, 'travels');
    const write = (file: string, content: string) => {
      fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
      fs.writeFileSync(path.join(root, file), content);
    };
    const POST_ID = '55555555-5555-4555-8555-555555555555';
    write(
      'a/travel.md',
      `---\nid: aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa\nname: A\nstartDate: 2025-01-01\nactive: true\ncoverAssetId: ${ASSET_B}\nupdatedAt: 2025-01-01T00:00:00Z\n---\n\nOver **A**\n`,
    );
    write(
      'b/travel.md',
      '---\nid: bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb\nname: B\nstartDate: 2025-02-01\nactive: false\nupdatedAt: 2025-02-01T00:00:00Z\n---\n',
    );
    write('kapot/travel.md', '---\nname: [onzin\n---\n');
    fs.mkdirSync(path.join(root, 'leeg'));
    write(
      'b/posts/2025-02-02-dag-1.md',
      `---\nid: ${POST_ID}\ntitle: "Dag 1: Reykjavik"\ndate: 2025-02-02T10:00:00+01:00\nphotos:\n  - ${ASSET_A}\nstats:\n  afstand: 4.5\n  custom: []\n---\n\nHallo **IJsland**\n`,
    );
    write('b/posts/x.md', '---\ntitle: zonder id\n---\n');
    write('b/posts/dubbel.md', `---\nid: ${POST_ID}\ntitle: Dubbel\ndate: 2025-02-03\n---\n`);
    write('b/posts/notities.txt', 'geen post');

    await startApp({}, dbPath());
    const admin = await setupAdmin();
    const travels: TravelSummary[] = (await call('GET', '/api/travels', admin)).json().travels;
    expect(travels.map((t) => [t.name, t.slug, t.owner.id])).toEqual([
      ['B', 'b', adminId],
      ['A', 'a', adminId],
    ]);
    expect(travels[1]).toMatchObject({ description: 'Over **A**', coverAssetId: ASSET_B });

    const feed: FeedPage = (await call('GET', '/api/posts', admin)).json();
    expect(feed.items).toHaveLength(1);
    const post: PostDetail = (await call('GET', `/api/posts/${POST_ID}`, admin)).json().post;
    expect(post).toMatchObject({
      title: 'Dag 1: Reykjavik',
      slug: '2025-02-02-dag-1',
      date: '2025-02-02T09:00:00.000Z',
      body: 'Hallo **IJsland**',
      photos: [ASSET_A],
      travelId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      canEdit: true,
    });
    expect(post.stats.afstand).toBe(4.5);
    expect(post.author?.id).toBe(adminId);

    // The folder is kept as backup under another name.
    expect(fs.existsSync(root)).toBe(false);
    expect(fs.existsSync(path.join(`${root}.migrated`, 'b', 'posts', 'x.md'))).toBe(true);

    // Once the database has travels, a new folder is not imported again.
    write('c/travel.md', '---\nid: cccccccc-cccc-4ccc-8ccc-cccccccccccc\nname: C\nstartDate: 2025-03-01\n---\n');
    await restart();
    expect((await call('GET', '/api/travels', admin)).json().travels).toHaveLength(2);
    expect(fs.existsSync(root)).toBe(true);
  });
});

describe('likes en reacties', () => {
  it('telt een like maar één keer, kan ontliken en meldt het aan de auteur', async () => {
    await startApp();
    const [admin, viewer] = await setupUsers();
    const travel = await createTravel(admin);
    await setViewers(admin, travel.id, [omaId]);
    const post = await createPost(admin, 'X', '2025-06-02T10:00:00Z');

    await call('PUT', `/api/posts/${post.id}/like`, viewer);
    const twice = await call('PUT', `/api/posts/${post.id}/like`, viewer);
    expect(twice.json()).toEqual({ likeCount: 1, likedByMe: true });
    await call('PUT', `/api/posts/${post.id}/like`, admin);

    const likers = (await call('GET', `/api/posts/${post.id}/likes`, admin)).json().users;
    expect(likers.map((u: { displayName: string }) => u.displayName)).toEqual(['Oma', 'Beheerder']);

    const off = await call('DELETE', `/api/posts/${post.id}/like`, viewer);
    expect(off.json()).toEqual({ likeCount: 1, likedByMe: false });

    const feed: FeedPage = (await call('GET', '/api/posts', admin)).json();
    expect(feed.items[0]).toMatchObject({ likeCount: 1, likedByMe: true, commentCount: 0 });

    // One like notification for the author (own like and the repeated like don't count).
    const n = await notificationsOf(admin);
    expect(n.items.map((i) => [i.type, i.actor?.displayName, i.postId])).toEqual([
      ['like', 'Oma', post.id],
    ]);
  });

  it('regelt rechten op reacties', async () => {
    await startApp();
    const [admin, viewer] = await setupUsers();
    const travel = await createTravel(admin);
    await setViewers(admin, travel.id, [omaId]);
    const post = await createPost(admin, 'X', '2025-06-02T10:00:00Z');

    const empty = await call('POST', `/api/posts/${post.id}/comments`, viewer, { text: '   ' });
    expect(empty.statusCode).toBe(400);

    const created = await call('POST', `/api/posts/${post.id}/comments`, viewer, { text: 'Mooi!' });
    expect(created.statusCode).toBe(201);
    const comment = created.json().comment;
    expect(comment).toMatchObject({ text: 'Mooi!', canEdit: true, canDelete: true });
    expect(comment.author.displayName).toBe('Oma');

    // Admin sees it as not editable but deletable.
    const asAdmin = (await call('GET', `/api/posts/${post.id}/comments`, admin)).json().comments;
    expect(asAdmin[0]).toMatchObject({ canEdit: false, canDelete: true });
    expect(
      (await call('PATCH', `/api/comments/${comment.id}`, admin, { text: 'nee' })).statusCode,
    ).toBe(403);

    const edited = await call('PATCH', `/api/comments/${comment.id}`, viewer, {
      text: 'Heel mooi!',
    });
    expect(edited.json().comment.text).toBe('Heel mooi!');

    const byAdmin = await call('POST', `/api/posts/${post.id}/comments`, admin, {
      text: 'Dank je',
    });
    const adminComment = byAdmin.json().comment;
    expect((await call('DELETE', `/api/comments/${adminComment.id}`, viewer)).statusCode).toBe(403);
    expect((await call('DELETE', `/api/comments/${comment.id}`, admin)).statusCode).toBe(204);

    // Deleting the post removes its comments.
    await call('DELETE', `/api/posts/${post.id}`, admin);
    expect(count('comments')).toBe(0);
  });
});

describe('immich', () => {
  it('proxyt foto’s en beperkt kijkers tot gepubliceerde foto’s', async () => {
    const url = await startFakeImmich();
    await startApp({ immichUrl: url });
    const [admin, viewer] = await setupUsers();
    app!.ctx.immich.setKey(adminId, BERT_KEY);
    const travel = await createTravel(admin);
    await setViewers(admin, travel.id, [omaId]);
    await createPost(admin, 'X', '2025-06-02T10:00:00Z', { photos: [ASSET_A] });

    const ok = await call('GET', `/api/media/${ASSET_A}/thumbnail`, viewer);
    expect(ok.statusCode).toBe(200);
    expect(ok.headers['content-type']).toBe('image/jpeg');
    expect(ok.headers['cache-control']).toBe('private, max-age=86400');
    expect(ok.body).toBe(`jpeg:bert:${ASSET_A}:thumbnail`);

    expect((await call('GET', `/api/media/${ASSET_B}/preview`, viewer)).statusCode).toBe(404);
    expect((await call('GET', `/api/media/${ASSET_B}/preview`, admin)).statusCode).toBe(200);
    expect((await call('GET', `/api/media/${ASSET_A}/huge`, admin)).statusCode).toBe(404);
    // Originals (full EXIF/GPS) only via one's own key, even for published photos.
    expect((await call('GET', `/api/media/${ASSET_A}/original`, viewer)).statusCode).toBe(404);
    expect((await call('GET', `/api/media/${ASSET_A}/original`, admin)).statusCode).toBe(200);
    expect((await call('GET', '/api/media/../preview', admin)).statusCode).toBe(404);

    const cached = await app!.inject({
      method: 'GET',
      url: `/api/media/${ASSET_A}/thumbnail`,
      headers: { cookie: viewer, 'if-none-match': '"abc"' },
    });
    expect(cached.statusCode).toBe(304);

    // Others without access to the travel see nothing.
    const jan = await addUser(admin, 'jan', 'Jan');
    expect((await call('GET', `/api/media/${ASSET_A}/thumbnail`, jan.cookie)).statusCode).toBe(404);
  });

  it('toont instellingen zonder Immich-sleutel en met Immich- en pushstatus', async () => {
    const url = await startFakeImmich();
    await startApp({
      immichUrl: url,
      sources: { IMMICH_URL: 'addon' },
    });
    const [admin] = await setupUsers();
    app!.ctx.immich.setKey(adminId, BERT_KEY);
    const res = await call('GET', '/api/admin/settings', admin);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(JSON.stringify(body)).not.toContain(BERT_KEY);
    expect(body.settings.find((s: { key: string }) => s.key === 'IMMICH_API_KEY')).toBeUndefined();
    expect(body.settings.find((s: { key: string }) => s.key === 'IMMICH_URL')).toMatchObject({
      source: 'addon',
    });
    expect(body.immich).toEqual({ configured: true, ok: true, detail: 'Versie v1.130.0' });
    expect(body.push).toEqual({ configured: true, ok: true, detail: 'Pushmeldingen beschikbaar.' });
    expect(body.routing.configured).toBe(false);
  });

  it('meldt een verkeerde sleutel en controleert een nieuwe profielsleutel', async () => {
    const url = await startFakeImmich();
    await startApp({ immichUrl: url });
    const [admin] = await setupUsers();
    app!.ctx.immich.setKey(adminId, 'een-foute-sleutel');
    const settings = (await call('GET', '/api/admin/settings', admin)).json();
    expect(settings.immich).toMatchObject({ configured: true, ok: false });
    const res = await call('GET', '/api/immich/albums', admin);
    expect(res.statusCode).toBe(502);
    expect(res.json().error).toBe('IMMICH_AUTH');

    const wrong = await call('PUT', '/api/profile/immich-key', admin, { apiKey: 'nog-een-foute' });
    expect(wrong.statusCode).toBe(400);
    expect(wrong.json().error).toBe('IMMICH_AUTH');
    const good = await call('PUT', '/api/profile/immich-key', admin, { apiKey: BERT_KEY });
    expect(good.statusCode).toBe(200);
    expect(good.json().user.hasImmichKey).toBe(true);
    expect((await call('GET', '/api/immich/albums', admin)).statusCode).toBe(200);
  });

  it('meldt Immich zonder eigen sleutel en geeft 503 als Immich niet is ingesteld', async () => {
    const url = await startFakeImmich();
    await startApp({ immichUrl: url });
    const [admin] = await setupUsers();
    const settings = (await call('GET', '/api/admin/settings', admin)).json();
    expect(settings.immich).toEqual({
      configured: false,
      ok: false,
      detail: 'Immich URL ingesteld; stel je eigen API-sleutel in bij Profiel.',
    });
    const noKey = await call('GET', '/api/immich/assets', admin);
    expect(noKey.statusCode).toBe(400);
    expect(noKey.json().error).toBe('IMMICH_NO_KEY');

    await app!.close();
    db!.close();
    await startApp();
    const [admin2] = await setupUsers();
    const res = await call('GET', '/api/immich/assets', admin2);
    expect(res.statusCode).toBe(503);
    expect(res.json().error).toBe('IMMICH_NOT_CONFIGURED');
  });
});

describe('tijdlijn met foto’s en reacties', () => {
  it('geeft alle foto’s, eerste likers en laatste 2 reacties in de feed', async () => {
    await startApp();
    const [admin, viewer] = await setupUsers();
    const travel = await createTravel(admin);
    await setViewers(admin, travel.id, [omaId]);
    const post = await createPost(admin, 'X', '2025-06-02T10:00:00Z', {
      photos: [ASSET_A, ASSET_B],
    });
    await call('PUT', `/api/posts/${post.id}/like`, viewer);
    await call('PUT', `/api/posts/${post.id}/like`, admin);
    for (const text of ['een', 'twee', 'drie']) {
      await call('POST', `/api/posts/${post.id}/comments`, viewer, { text });
    }

    const feed: FeedPage = (await call('GET', '/api/posts', viewer)).json();
    const item = feed.items[0]!;
    expect(item.photos).toEqual([ASSET_A, ASSET_B]);
    expect(item.likers.map((u) => u.displayName)).toEqual(['Oma', 'Beheerder']);
    expect(item.latestComments.map((c) => c.text)).toEqual(['twee', 'drie']);
    expect(item.latestComments[0]).toMatchObject({ canEdit: true, canDelete: true });
    expect(item.latestComments[0]!.author).toMatchObject({ displayName: 'Oma', avatarUrl: null });
    expect(item.commentCount).toBe(3);
    expect(item).toMatchObject({ canEdit: false, canDelete: false });
    expect(item.author).toMatchObject({ id: adminId, displayName: 'Beheerder' });
  });
});

describe('routes en kaart', () => {
  let fakeOrs: http.Server | null = null;
  let orsCalls: string[] = [];
  let orsFails = false;

  async function startFakeOrs(): Promise<string> {
    orsCalls = [];
    orsFails = false;
    fakeOrs = http.createServer((req, res) => {
      if (req.headers.authorization !== 'ors-sleutel') {
        res.writeHead(403).end();
        return;
      }
      orsCalls.push(req.url ?? '');
      if (orsFails) {
        res.writeHead(500).end();
        return;
      }
      if (req.url?.startsWith('/geocode/search')) {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(
          JSON.stringify({
            features: [
              {
                geometry: { coordinates: [5.32, 60.39] },
                properties: { label: 'Bergen, Noorwegen' },
              },
            ],
          }),
        );
        return;
      }
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        const coords = JSON.parse(body).coordinates as number[][];
        const [a, b] = [coords[0]!, coords[1]!];
        res.writeHead(200, { 'content-type': 'application/geo+json' });
        res.end(
          JSON.stringify({
            features: [
              {
                geometry: {
                  coordinates: [[...a, 10], [a[0]! + 0.01, b[1]!, 30], [...b, 20]],
                },
                properties: { summary: { distance: 1500 }, ascent: 42 },
              },
            ],
          }),
        );
      });
    });
    await new Promise<void>((r) => fakeOrs!.listen(0, '127.0.0.1', r));
    return `http://127.0.0.1:${(fakeOrs.address() as AddressInfo).port}`;
  }

  afterEach(async () => {
    if (fakeOrs) await new Promise((r) => fakeOrs!.close(r));
    fakeOrs = null;
  });

  const BERGEN = { lat: 60.39, lng: 5.32, name: 'Bergen' };
  const FLOYEN = { lat: 60.395, lng: 5.345, name: 'Fløyen' };
  const OSLO = { lat: 59.91, lng: 10.75, name: 'Oslo' };

  it('routeert wandelsegmenten, cachet de geometrie en tekent vluchten recht', async () => {
    const url = await startFakeOrs();
    await startApp({ orsApiKey: 'ors-sleutel', orsUrl: url });
    const [admin, viewer] = await setupUsers();
    const travel = await createTravel(admin);
    await setViewers(admin, travel.id, [omaId]);

    const post = await createPost(admin, 'Wandeling', '2025-06-02T10:00:00Z', {
      locations: [BERGEN, FLOYEN],
      segments: [{ mode: 'lopen' }],
    });
    expect(orsCalls).toEqual(['/v2/directions/foot-hiking/geojson']);
    expect(post.segments[0]).toMatchObject({
      mode: 'lopen',
      source: 'route',
      distanceKm: 1.5,
      ascentM: 42,
    });
    expect(post.segments[0]!.geometry).toHaveLength(3);
    expect(post.stats).toMatchObject({ afstand: 1.5, hoogtemeters: 42 });

    // Viewing and saving unchanged segments never calls the routing API again.
    await call('GET', `/api/posts/${post.id}`, viewer);
    await call('GET', '/api/posts/map', viewer);
    const same = await call('PUT', `/api/posts/${post.id}`, admin, {
      title: 'Wandeling',
      date: post.date,
      locations: post.locations,
      segments: post.segments,
      stats: { custom: [] },
    });
    expect(same.statusCode).toBe(200);
    expect(same.json().post.stats.afstand).toBeUndefined();
    expect(orsCalls).toHaveLength(1);

    // Next post: flight from the last point of the previous post, straight line.
    const next = await createPost(admin, 'Naar Oslo', '2025-06-03T10:00:00Z', {
      locations: [OSLO],
      arrival: { mode: 'vliegtuig' },
    });
    expect(orsCalls).toHaveLength(1);
    expect(next.arrival).toMatchObject({ mode: 'vliegtuig', source: 'straight' });
    expect(next.arrival!.geometry![0]).toEqual([FLOYEN.lat, FLOYEN.lng]);
    expect(next.arrival!.distanceKm).toBeGreaterThan(290);

    const map = (await call('GET', '/api/posts/map', viewer)).json().posts;
    expect(map.map((p: { title: string }) => p.title)).toEqual(['Naar Oslo', 'Wandeling']);

    // Deleting the previous post unlinks the connection (only the mode is kept).
    await call('DELETE', `/api/posts/${post.id}`, admin);
    const after = (await call('GET', `/api/posts/${next.id}`, admin)).json().post;
    expect(after.arrival).toEqual({ mode: 'vliegtuig' });

    const t = (await call('GET', '/api/travels', admin)).json().travels[0];
    expect(t.distanceKm).toBe(0);
  });

  it('valt terug op een rechte lijn als routeren mislukt', async () => {
    const url = await startFakeOrs();
    await startApp({ orsApiKey: 'ors-sleutel', orsUrl: url });
    const [admin] = await setupUsers();
    await createTravel(admin);
    orsFails = true;

    const preview = await call('POST', '/api/routing/preview', admin, {
      locations: [BERGEN, FLOYEN],
      segments: [{ mode: 'fietsen' }],
    });
    expect(preview.statusCode).toBe(200);
    expect(preview.json()).toMatchObject({ fallback: true });
    expect(preview.json().segments[0]).toMatchObject({ mode: 'fietsen', source: 'straight' });

    const settings = (await call('GET', '/api/admin/settings', admin)).json();
    expect(settings.routing).toMatchObject({ configured: true, ok: false });

    orsFails = false;
    const search = await call('GET', '/api/routing/search?q=Bergen', admin);
    expect(search.json().results).toEqual([{ name: 'Bergen, Noorwegen', lat: 60.39, lng: 5.32 }]);
  });

  it('zonder sleutel: rechte lijnen, routing-endpoints alleen voor reizigers', async () => {
    await startApp();
    const [admin, viewer] = await setupUsers();
    const piet = await addUser(admin, 'piet', 'Piet', 'traveller');
    await createTravel(admin);
    const post = await createPost(admin, 'X', '2025-06-02T10:00:00Z', {
      locations: [BERGEN, FLOYEN],
      segments: [{ mode: 'auto' }],
    });
    expect(post.segments[0]).toMatchObject({ mode: 'auto', source: 'straight' });
    const preview = await call('POST', '/api/routing/preview', viewer, { locations: [] });
    expect(preview.statusCode).toBe(403);
    const asTraveller = await call('POST', '/api/routing/preview', piet.cookie, { locations: [] });
    expect(asTraveller.statusCode).toBe(200);
  });
});

describe('reizen, bibliotheek en profiel', () => {
  it('telt statistieken van een reis op', async () => {
    await startApp();
    const [admin] = await setupUsers();
    const travel = await createTravel(admin);
    await createPost(admin, 'A', '2025-06-02T10:00:00Z', {
      photos: [ASSET_A],
      stats: {
        afstand: 10,
        maxHoogte: 100,
        temperatuur: 20,
        duur: 90,
        custom: [
          { label: 'Koffie', value: '3', unit: 'kopjes' },
          { label: 'Stemming', value: 'top' },
        ],
      },
    });
    await createPost(admin, 'B', '2025-06-03T10:00:00Z', {
      photos: [ASSET_B],
      stats: {
        afstand: 5.5,
        maxHoogte: 300,
        duur: 30,
        custom: [{ label: 'koffie', value: '2,5', unit: 'kopjes' }],
      },
    });
    const summary = await getTravel(admin, travel.id);
    expect(summary).toMatchObject({ postCount: 2, photoCount: 2, distanceKm: 0 });
    expect(summary.stats).toEqual([
      { key: 'afstand', label: 'Afstand', unit: 'km', value: 15.5 },
      { key: 'maxHoogte', label: 'Max. hoogte', unit: 'm', value: 300 },
      { key: 'duur', label: 'Duur', unit: 'u:mm', value: 120 },
      { key: 'custom:koffie|kopjes', label: 'Koffie', unit: 'kopjes', value: 5.5 },
    ]);
  });

  it('bibliotheek toont alleen foto’s uit zichtbare posts', async () => {
    await startApp();
    const [admin, viewer] = await setupUsers();
    const travel = await createTravel(admin);
    const post = await createPost(admin, 'A', '2025-06-02T10:00:00Z', {
      photos: [ASSET_B, ASSET_A],
    });
    expect((await call('GET', '/api/library', viewer)).json().photos).toEqual([]);
    await setViewers(admin, travel.id, [omaId]);
    const res = await call('GET', '/api/library', viewer);
    expect(res.statusCode).toBe(200);
    expect(res.json().photos).toEqual([
      expect.objectContaining({
        assetId: ASSET_B,
        postId: post.id,
        travelName: 'Noorwegen 2025',
        authorId: adminId,
      }),
      expect.objectContaining({ assetId: ASSET_A, postTitle: 'A' }),
    ]);
  });

  it('weigert verouderde wijzigingen (409) en maakt geen dubbele posts', async () => {
    await startApp();
    const [admin] = await setupUsers();
    await createTravel(admin);
    const id = '33333333-3333-4333-8333-333333333333';
    const first = await createPost(admin, 'Offline', '2025-06-02T10:00:00Z', { id });
    expect(first.id).toBe(id);
    const retry = await call('POST', '/api/posts', admin, {
      id,
      title: 'Offline',
      date: '2025-06-02T10:00:00Z',
    });
    expect(retry.statusCode).toBe(200);
    expect((await call('GET', '/api/posts', admin)).json().items).toHaveLength(1);

    const input = { title: 'Nieuw', date: first.date, baseUpdatedAt: first.updatedAt };
    await new Promise((r) => setTimeout(r, 5));
    const ok = await call('PUT', `/api/posts/${id}`, admin, input);
    expect(ok.statusCode).toBe(200);
    const stale = await call('PUT', `/api/posts/${id}`, admin, { ...input, title: 'Ander' });
    expect(stale.statusCode).toBe(409);
    expect(stale.json().error).toBe('CONFLICT');
    // Without baseUpdatedAt ("keep mine") the update is forced.
    const forced = await call('PUT', `/api/posts/${id}`, admin, {
      title: 'Ander',
      date: first.date,
    });
    expect(forced.json().post.title).toBe('Ander');
  });

  it('wijzigt weergavenaam en profielfoto', async () => {
    await startApp();
    const [admin, viewer] = await setupUsers();
    const travel = await createTravel(admin);
    await setViewers(admin, travel.id, [omaId]);
    const post = await createPost(admin, 'A', '2025-06-02T10:00:00Z');
    await call('POST', `/api/posts/${post.id}/comments`, viewer, { text: 'Hoi' });

    const renamed = await call('PATCH', '/api/profile', viewer, { displayName: 'Oma Jet' });
    expect(renamed.json().user.displayName).toBe('Oma Jet');

    const png = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.alloc(32, 1),
    ]);
    const bad = await call('PUT', '/api/profile/avatar', viewer, {
      image: Buffer.from('<svg/>').toString('base64'),
    });
    expect(bad.statusCode).toBe(400);
    const set = await call('PUT', '/api/profile/avatar', viewer, { image: png.toString('base64') });
    expect(set.statusCode).toBe(200);
    const avatarUrl: string = set.json().user.avatarUrl;
    expect(avatarUrl).toMatch(/^\/api\/avatars\/[0-9a-f-]+\?v=/);

    const comments = (await call('GET', `/api/posts/${post.id}/comments`, admin)).json().comments;
    expect(comments[0].author).toEqual({ id: omaId, displayName: 'Oma Jet', avatarUrl });
    const img = await call('GET', avatarUrl, admin);
    expect(img.statusCode).toBe(200);
    expect(img.headers['content-type']).toBe('image/png');
    expect(img.rawPayload.equals(png)).toBe(true);

    // Only travellers may pick an Immich photo.
    const immich = await call('PUT', '/api/profile/avatar', viewer, { assetId: ASSET_A });
    expect(immich.statusCode).toBe(403);

    const removed = await call('DELETE', '/api/profile/avatar', viewer);
    expect(removed.json().user.avatarUrl).toBeNull();
    expect(fs.readdirSync(path.join(dataDir, 'uploads', 'avatars'))).toEqual([]);
    expect((await call('GET', avatarUrl, admin)).statusCode).toBe(404);
  });
});

describe('excerpt', () => {
  it('maakt platte tekst van Markdown', () => {
    expect(excerpt('# Kop\n\nDit is **vet** en een [link](http://x).')).toBe(
      'Kop Dit is vet en een link.',
    );
    expect(excerpt('woord '.repeat(100)).endsWith('…')).toBe(true);
  });
});

describe('zichtbaarheid', () => {
  it('geeft 404 aan wie een reis niet mag zien en beheert de kijkerslijst', async () => {
    await startApp();
    const { admin, piet, kees, oma, jan, travel } = await setupWorld();
    const post = await createPost(piet.cookie, 'Geiser', '2025-06-02T10:00:00Z');

    for (const [method, url] of [
      ['GET', `/api/travels/${travel.id}`],
      ['PUT', `/api/travels/${travel.id}/viewers`],
      ['GET', `/api/posts/${post.id}`],
      ['GET', `/api/posts/${post.id}/comments`],
      ['PUT', `/api/posts/${post.id}/like`],
      ['DELETE', `/api/posts/${post.id}`],
    ] as const) {
      const res = await call(method, url, jan.cookie, method === 'PUT' ? { userIds: [] } : undefined);
      expect(res.statusCode, `${method} ${url}`).toBe(404);
    }
    expect(
      (await call('POST', `/api/posts/${post.id}/comments`, jan.cookie, { text: 'Hoi' })).statusCode,
    ).toBe(404);
    expect((await call('GET', '/api/travels', jan.cookie)).json().travels).toEqual([]);
    expect(await feedTitles(jan.cookie)).toEqual([]);
    expect((await call('GET', '/api/posts/map', jan.cookie)).json().posts).toEqual([]);
    expect((await call('GET', '/api/library', jan.cookie)).json().photos).toEqual([]);

    // Owner sees members and viewers; others see the travel without the viewer list.
    const asPiet = await getTravel(piet.cookie, travel.id);
    expect(asPiet).toMatchObject({ myRole: 'owner', canManage: true, canPost: true, viewerIds: [oma.id] });
    expect(asPiet.members).toEqual([expect.objectContaining({ id: kees.id, status: 'accepted' })]);
    expect(await getTravel(kees.cookie, travel.id)).toMatchObject({
      myRole: 'member',
      canManage: false,
      canPost: true,
      viewerIds: [],
    });
    expect(await getTravel(oma.cookie, travel.id)).toMatchObject({
      myRole: null,
      canManage: false,
      canPost: false,
      viewerIds: [],
    });
    expect(await getTravel(admin, travel.id)).toMatchObject({
      myRole: null,
      canManage: true,
      canPost: false,
      viewerIds: [oma.id],
    });
    expect(await feedTitles(oma.cookie)).toEqual(['Geiser']);

    // Forbidden write actions on a visible travel give 403.
    const edit = { name: 'Anders', startDate: '2025-06-01' };
    expect((await call('PUT', `/api/travels/${travel.id}`, kees.cookie, edit)).statusCode).toBe(403);
    expect((await call('DELETE', `/api/travels/${travel.id}`, kees.cookie)).statusCode).toBe(403);
    expect(
      (await call('PUT', `/api/travels/${travel.id}/viewers`, kees.cookie, { userIds: [] }))
        .statusCode,
    ).toBe(403);
    expect(
      (await call('POST', `/api/travels/${travel.id}/members`, kees.cookie, { userId: jan.id }))
        .statusCode,
    ).toBe(403);
    expect((await call('PUT', `/api/travels/${travel.id}`, admin, edit)).statusCode).toBe(200);

    // Owner, members and unknown users are dropped from the viewer list.
    const updated = await setViewers(piet.cookie, travel.id, [
      oma.id,
      piet.id,
      kees.id,
      jan.id,
      crypto.randomUUID(),
    ]);
    expect([...updated.viewerIds].sort()).toEqual([oma.id, jan.id].sort());
    expect(await feedTitles(jan.cookie)).toEqual(['Geiser']);
    await setViewers(piet.cookie, travel.id, [jan.id]);
    expect((await call('GET', `/api/travels/${travel.id}`, oma.cookie)).statusCode).toBe(404);
    expect(await feedTitles(oma.cookie)).toEqual([]);

    // Viewer rights are stored, not only cached.
    app!.ctx.content.load();
    expect((await getTravel(piet.cookie, travel.id)).viewerIds).toEqual([jan.id]);
  });

  it('filtert feed, reizen, kaart en bibliotheek op reiziger', async () => {
    await startApp();
    const { admin, piet, kees, oma, travel } = await setupWorld();
    const own = await createTravel(admin, 'Bert reis');
    await setViewers(admin, own.id, [oma.id]);
    await createPost(admin, 'Van Bert', '2025-06-05T10:00:00Z', {
      photos: [ASSET_C],
      locations: [{ lat: 52, lng: 5, name: 'Utrecht' }],
    });
    await createPost(piet.cookie, 'Van Piet', '2025-06-03T10:00:00Z', {
      photos: [ASSET_A],
      locations: [{ lat: 64, lng: -21, name: 'Reykjavik' }],
    });
    await createPost(kees.cookie, 'Van Kees', '2025-06-04T10:00:00Z', {
      travelId: travel.id,
      photos: [ASSET_B],
    });

    expect(await feedTitles(oma.cookie)).toEqual(['Van Bert', 'Van Kees', 'Van Piet']);
    // A traveller's blog = all travels they own or co-write.
    expect(await feedTitles(oma.cookie, `?traveller=${kees.id}`)).toEqual(['Van Kees', 'Van Piet']);
    expect(await feedTitles(oma.cookie, `?traveller=${adminId}`)).toEqual(['Van Bert']);
    expect(await feedTitles(oma.cookie, `?travelId=${own.id}`)).toEqual(['Van Bert']);
    expect(await feedTitles(oma.cookie, `?traveller=${oma.id}`)).toEqual([]);

    const travels = async (query: string) =>
      ((await call('GET', `/api/travels${query}`, oma.cookie)).json().travels as TravelSummary[]).map(
        (t) => t.name,
      );
    expect(await travels('')).toEqual(['Bert reis', 'IJsland']);
    expect(await travels(`?traveller=${piet.id}`)).toEqual(['IJsland']);
    expect(await travels(`?traveller=${adminId}`)).toEqual(['Bert reis']);

    const map = (await call('GET', `/api/posts/map?traveller=${piet.id}`, oma.cookie)).json().posts;
    expect(map.map((p: { title: string }) => p.title)).toEqual(['Van Piet']);

    const library = (await call('GET', `/api/library?traveller=${piet.id}`, oma.cookie)).json()
      .photos;
    expect(library.map((p: { assetId: string; authorId: string }) => [p.assetId, p.authorId])).toEqual(
      expect.arrayContaining([
        [ASSET_A, piet.id],
        [ASSET_B, kees.id],
      ]),
    );
    expect(library).toHaveLength(2);

    // Travellers whose blogs I can see; me first, then by name.
    const names = async (cookie: string) =>
      ((await call('GET', '/api/travellers', cookie)).json().travellers as Traveller[]).map(
        (t) => t.displayName,
      );
    expect(await names(oma.cookie)).toEqual(['Beheerder', 'Kees', 'Piet']);
    expect(await names(piet.cookie)).toEqual(['Piet', 'Kees']);
    expect(await names(admin)).toEqual(['Beheerder', 'Kees', 'Piet']);
  });
});

describe('meeschrijvers', () => {
  it('nodigt uit, accepteert, weigert, verlaat en verwijdert leden', async () => {
    await startApp();
    const admin = await setupAdmin();
    const piet = await addUser(admin, 'piet', 'Piet', 'traveller');
    const kees = await addUser(admin, 'kees', 'Kees', 'traveller');
    const anna = await addUser(admin, 'anna', 'Anna', 'traveller');
    const oma = await addUser(admin, 'oma', 'Oma');
    const travel = await createTravel(piet.cookie, 'IJsland');
    const members = (body: { travel: TravelSummary }) =>
      body.travel.members.map((m) => [m.displayName, m.status]);

    const invited = await call('POST', `/api/travels/${travel.id}/members`, piet.cookie, {
      userId: kees.id,
    });
    expect(invited.statusCode).toBe(201);
    expect(members(invited.json())).toEqual([['Kees', 'invited']]);
    const n = await notificationsOf(kees.cookie);
    expect(n.unread).toBe(1);
    expect(n.items[0]).toMatchObject({
      type: 'invite',
      travelId: travel.id,
      travelName: 'IJsland',
      postId: null,
      read: false,
    });
    expect(n.items[0]!.actor).toMatchObject({ id: piet.id, displayName: 'Piet' });

    // Inviting again does not notify twice.
    await call('POST', `/api/travels/${travel.id}/members`, piet.cookie, { userId: kees.id });
    expect((await notificationsOf(kees.cookie)).items).toHaveLength(1);

    const notTraveller = await call('POST', `/api/travels/${travel.id}/members`, piet.cookie, {
      userId: oma.id,
    });
    expect(notTraveller.statusCode).toBe(400);
    expect(notTraveller.json().error).toBe('NOT_TRAVELLER');
    expect(
      (
        await call('POST', `/api/travels/${travel.id}/members`, piet.cookie, {
          userId: crypto.randomUUID(),
        })
      ).statusCode,
    ).toBe(404);

    // Invited: may see the travel but not post yet.
    expect(await getTravel(kees.cookie, travel.id)).toMatchObject({ myRole: 'invited', canPost: false });
    const early = await call('POST', '/api/posts', kees.cookie, {
      title: 'Te vroeg',
      date: '2025-06-02T10:00:00Z',
      travelId: travel.id,
    });
    expect(early.statusCode).toBe(403);
    expect(
      (await call('POST', `/api/travels/${travel.id}/invitation/accept`, anna.cookie)).statusCode,
    ).toBe(404);

    const accepted = await call('POST', `/api/travels/${travel.id}/invitation/accept`, kees.cookie);
    expect(accepted.statusCode).toBe(200);
    expect(accepted.json().travel).toMatchObject({ myRole: 'member', canPost: true });
    const again = await call('POST', `/api/travels/${travel.id}/invitation/accept`, kees.cookie);
    expect(again.json().error).toBe('NO_INVITATION');
    const post = await createPost(kees.cookie, 'Van Kees', '2025-06-02T10:00:00Z', {
      travelId: travel.id,
    });

    // Anna declines; a member may not remove others.
    await call('POST', `/api/travels/${travel.id}/members`, piet.cookie, { userId: anna.id });
    expect(
      (await call('DELETE', `/api/travels/${travel.id}/members/${anna.id}`, kees.cookie)).statusCode,
    ).toBe(403);
    const declined = await call('DELETE', `/api/travels/${travel.id}/members/${anna.id}`, anna.cookie);
    expect(declined.statusCode).toBe(200);
    expect(declined.json()).toEqual({ travel: null });
    expect((await call('GET', `/api/travels/${travel.id}`, anna.cookie)).statusCode).toBe(404);
    expect(
      (await call('DELETE', `/api/travels/${travel.id}/members/${anna.id}`, piet.cookie)).statusCode,
    ).toBe(404);

    // Kees leaves; his post stays.
    const left = await call('DELETE', `/api/travels/${travel.id}/members/${kees.id}`, kees.cookie);
    expect(left.json()).toEqual({ travel: null });
    expect((await call('GET', `/api/posts/${post.id}`, kees.cookie)).statusCode).toBe(404);
    const kept: PostDetail = (await call('GET', `/api/posts/${post.id}`, piet.cookie)).json().post;
    expect(kept.author?.id).toBe(kees.id);

    // The owner removes a member.
    await addMember(piet.cookie, travel.id, kees);
    const removed = await call('DELETE', `/api/travels/${travel.id}/members/${kees.id}`, piet.cookie);
    expect(removed.statusCode).toBe(200);
    expect(removed.json().travel.members).toEqual([]);
  });
});

describe('rechten op posts en reacties', () => {
  it('auteur bewerkt, auteur en beheerder van de reis verwijderen', async () => {
    await startApp();
    const { admin, piet, kees, oma, travel } = await setupWorld();
    const anna = await addUser(admin, 'anna', 'Anna', 'traveller');
    const byPiet = await createPost(piet.cookie, 'Van Piet', '2025-06-02T10:00:00Z');
    const byKees = await createPost(kees.cookie, 'Van Kees', '2025-06-03T10:00:00Z');
    const rights = async (cookie: string, id: string) => {
      const p: PostDetail = (await call('GET', `/api/posts/${id}`, cookie)).json().post;
      return [p.canEdit, p.canDelete];
    };
    expect(await rights(kees.cookie, byKees.id)).toEqual([true, true]);
    expect(await rights(piet.cookie, byKees.id)).toEqual([false, true]);
    expect(await rights(admin, byKees.id)).toEqual([false, true]);
    expect(await rights(oma.cookie, byKees.id)).toEqual([false, false]);
    expect(await rights(kees.cookie, byPiet.id)).toEqual([false, false]);
    const feed: FeedPage = (await call('GET', '/api/posts', kees.cookie)).json();
    expect(feed.items.map((p) => [p.title, p.canEdit, p.canDelete])).toEqual([
      ['Van Kees', true, true],
      ['Van Piet', false, false],
    ]);

    const edit = { title: 'Anders', date: '2025-06-03T10:00:00Z' };
    expect((await call('PUT', `/api/posts/${byKees.id}`, piet.cookie, edit)).statusCode).toBe(403);
    expect((await call('PUT', `/api/posts/${byPiet.id}`, kees.cookie, edit)).statusCode).toBe(403);
    expect((await call('PUT', `/api/posts/${byPiet.id}`, anna.cookie, edit)).statusCode).toBe(404);
    expect((await call('DELETE', `/api/posts/${byPiet.id}`, kees.cookie)).statusCode).toBe(403);
    expect((await call('DELETE', `/api/posts/${byPiet.id}`, oma.cookie)).statusCode).toBe(403);
    expect((await call('DELETE', `/api/posts/${byPiet.id}`, anna.cookie)).statusCode).toBe(404);

    // Moving a post needs posting rights in the target travel.
    const hidden = await createTravel(piet.cookie, 'Geheim');
    const watchOnly = await createTravel(admin, 'Alleen kijken');
    await setViewers(admin, watchOnly.id, [kees.id]);
    const ownTravel = await createTravel(kees.cookie, 'Van mezelf');
    const move = (travelId: string) =>
      call('PUT', `/api/posts/${byKees.id}`, kees.cookie, { ...edit, travelId });
    expect((await move(hidden.id)).statusCode).toBe(404);
    expect((await move(watchOnly.id)).statusCode).toBe(403);
    const moved = await move(ownTravel.id);
    expect(moved.statusCode).toBe(200);
    expect(moved.json().post).toMatchObject({ travelId: ownTravel.id, title: 'Anders' });
    // Piet no longer manages its travel and cannot see it.
    expect((await call('DELETE', `/api/posts/${byKees.id}`, piet.cookie)).statusCode).toBe(404);

    expect((await call('DELETE', `/api/posts/${byPiet.id}`, admin)).statusCode).toBe(204);
    const again = await createPost(kees.cookie, 'Terug', '2025-06-04T10:00:00Z', {
      travelId: travel.id,
    });
    expect((await call('DELETE', `/api/posts/${again.id}`, piet.cookie)).statusCode).toBe(204);
    expect(count('posts')).toBe(1);
  });

  it('reacties: schrijver, postauteur, reisbeheerder en beheerder mogen verwijderen', async () => {
    await startApp();
    const { admin, piet, kees, oma, jan, travel } = await setupWorld();
    const post = await createPost(kees.cookie, 'Van Kees', '2025-06-03T10:00:00Z');
    const comment = async (cookie: string, text: string) => {
      const res = await call('POST', `/api/posts/${post.id}/comments`, cookie, { text });
      expect(res.statusCode).toBe(201);
      return res.json().comment as { id: string; canEdit: boolean; canDelete: boolean };
    };
    expect(
      (await call('POST', `/api/posts/${post.id}/comments`, jan.cookie, { text: 'Hoi' })).statusCode,
    ).toBe(404);
    await setViewers(piet.cookie, travel.id, [oma.id, jan.id]);

    const c1 = await comment(oma.cookie, 'een');
    const c2 = await comment(oma.cookie, 'twee');
    const c3 = await comment(oma.cookie, 'drie');
    const c4 = await comment(oma.cookie, 'vier');
    const byJan = await comment(jan.cookie, 'van Jan');

    const asSeenBy = async (cookie: string) =>
      ((await call('GET', `/api/posts/${post.id}/comments`, cookie)).json().comments as {
        id: string;
        canEdit: boolean;
        canDelete: boolean;
      }[]).map((c) => [c.canEdit, c.canDelete]);
    expect((await asSeenBy(kees.cookie))[0]).toEqual([false, true]);
    expect((await asSeenBy(piet.cookie))[0]).toEqual([false, true]);
    expect((await asSeenBy(jan.cookie))[0]).toEqual([false, false]);
    expect((await asSeenBy(jan.cookie))[4]).toEqual([true, true]);

    expect((await call('DELETE', `/api/comments/${c1.id}`, jan.cookie)).statusCode).toBe(403);
    expect((await call('PATCH', `/api/comments/${c1.id}`, kees.cookie, { text: 'x' })).statusCode).toBe(
      403,
    );
    expect((await call('DELETE', `/api/comments/${c1.id}`, oma.cookie)).statusCode).toBe(204);
    expect((await call('DELETE', `/api/comments/${c2.id}`, kees.cookie)).statusCode).toBe(204);
    expect((await call('DELETE', `/api/comments/${c3.id}`, piet.cookie)).statusCode).toBe(204);
    expect((await call('DELETE', `/api/comments/${c4.id}`, admin)).statusCode).toBe(204);
    // Someone who lost access cannot delete their own comment anymore.
    await setViewers(piet.cookie, travel.id, [oma.id]);
    expect((await call('DELETE', `/api/comments/${byJan.id}`, jan.cookie)).statusCode).toBe(404);
    expect(count('comments')).toBe(1);
  });
});

describe('meldingen en abonnementen', () => {
  it('meldt nieuwe posts aan meeschrijvers en abonnees die de reis mogen zien', async () => {
    await startApp();
    const { admin, piet, kees, oma, jan, travel } = await setupWorld();
    // Kees' invite notification from the setup.
    await call('POST', '/api/notifications/read', kees.cookie, {});

    // Only travellers whose blog I can see can be followed.
    expect((await call('PUT', `/api/travellers/${piet.id}/subscription`, jan.cookie)).statusCode).toBe(
      404,
    );
    const sub = await call('PUT', `/api/travellers/${piet.id}/subscription`, oma.cookie);
    expect(sub.json()).toEqual({ subscribed: true });
    await call('PUT', `/api/travellers/${kees.id}/subscription`, admin);
    const list = (await call('GET', '/api/travellers', oma.cookie)).json().travellers as Traveller[];
    expect(list.map((t) => [t.displayName, t.subscribed])).toEqual([
      ['Kees', false],
      ['Piet', true],
    ]);

    const post = await createPost(piet.cookie, 'Geiser', '2025-06-02T10:00:00Z');
    expect(await unreadTypes(kees.cookie)).toEqual(['post']);
    expect(await unreadTypes(oma.cookie)).toEqual(['post']);
    expect(await unreadTypes(admin)).toEqual(['post']);
    expect(await unreadTypes(piet.cookie)).toEqual([]);
    expect(await unreadTypes(jan.cookie)).toEqual([]);
    const n = (await notificationsOf(oma.cookie)).items[0]!;
    expect(n).toMatchObject({
      type: 'post',
      travelName: 'IJsland',
      postId: post.id,
      postTitle: 'Geiser',
      read: false,
    });
    expect(n.actor?.id).toBe(piet.id);

    // A travel Oma cannot see: subscribers without access get nothing.
    const hidden = await createTravel(piet.cookie, 'Geheim');
    await createPost(piet.cookie, 'Stiekem', '2025-06-03T10:00:00Z', { travelId: hidden.id });
    expect(await unreadTypes(oma.cookie)).toEqual(['post']);
    expect(await unreadTypes(kees.cookie)).toEqual(['post']);

    // Like and comment go to the post author, not to the actor.
    await call('PUT', `/api/posts/${post.id}/like`, kees.cookie);
    await call('POST', `/api/posts/${post.id}/comments`, oma.cookie, { text: 'Prachtig' });
    await call('POST', `/api/posts/${post.id}/comments`, piet.cookie, { text: 'Dank je' });
    const forPiet = await notificationsOf(piet.cookie);
    expect(forPiet.items.map((i) => [i.type, i.actor?.displayName])).toEqual([
      ['comment', 'Oma'],
      ['like', 'Kees'],
    ]);
    // The comment notification explains what was written; the like shows the post text.
    expect(forPiet.items[0]!.excerpt).toBe('Prachtig');
    expect(forPiet.items[1]!.excerpt).toBe('Hallo');
    expect(n.excerpt).toBe('Hallo');
    expect(forPiet.unread).toBe(2);

    const one = await call('POST', '/api/notifications/read', piet.cookie, {
      id: forPiet.items[0]!.id,
    });
    expect(one.json()).toEqual({ unread: 1 });
    expect((await notificationsOf(piet.cookie)).items.map((i) => i.read)).toEqual([true, false]);
    // Someone else's notification id changes nothing.
    await call('POST', '/api/notifications/read', oma.cookie, { id: forPiet.items[1]!.id });
    expect((await call('GET', '/api/notifications/unread', piet.cookie)).json()).toEqual({
      unread: 1,
    });
    expect((await call('POST', '/api/notifications/read', piet.cookie, {})).json()).toEqual({
      unread: 0,
    });

    // Unsubscribed: no more notifications.
    const unsub = await call('DELETE', `/api/travellers/${piet.id}/subscription`, oma.cookie);
    expect(unsub.json()).toEqual({ subscribed: false });
    await call('POST', '/api/notifications/read', oma.cookie, {});
    await createPost(piet.cookie, 'Gletsjer', '2025-06-04T10:00:00Z', { travelId: travel.id });
    expect(await unreadTypes(oma.cookie)).toEqual([]);
    expect(await unreadTypes(kees.cookie)).toEqual(['post', 'post']);

    // Removed as viewer: old notifications no longer reveal titles or excerpts of the travel.
    expect((await notificationsOf(oma.cookie)).items.length).toBeGreaterThan(0);
    await setViewers(piet.cookie, travel.id, []);
    expect((await notificationsOf(oma.cookie)).items).toEqual([]);
  });

  it('registreert en verwijdert pushabonnementen', async () => {
    await startApp();
    const [, viewer] = await setupUsers();
    const key = await call('GET', '/api/push/key', viewer);
    expect(key.statusCode).toBe(200);
    expect(typeof key.json().publicKey).toBe('string');
    expect(key.json().publicKey.length).toBeGreaterThan(20);

    const sub = {
      endpoint: 'https://push.example.com/abc',
      keys: { p256dh: 'BOr1Xx'.repeat(10), auth: 'YXV0aHNlY3JldA' },
    };
    for (const endpoint of [
      'http://push.example.com/y',
      'https://10.0.0.5/y',
      'https://localhost/y',
      'https://homeassistant/y',
      'https://[::1]/y',
    ]) {
      expect(
        (await call('POST', '/api/push/subscriptions', viewer, { ...sub, endpoint })).statusCode,
      ).toBe(400);
    }
    expect((await call('POST', '/api/push/subscriptions', viewer, sub)).statusCode).toBe(204);
    expect(count('push_subscriptions')).toBe(1);
    expect(
      (await call('DELETE', '/api/push/subscriptions', viewer, { endpoint: sub.endpoint }))
        .statusCode,
    ).toBe(204);
    expect(count('push_subscriptions')).toBe(0);
  });
});

describe('gebruikers verwijderen', () => {
  const remove = (admin: string, id: string, body: Record<string, unknown>) =>
    call('DELETE', `/api/users/${id}`, admin, body);

  it('verwijdert eigen reizen met posts en houdt posts in andere reizen zonder auteur', async () => {
    await startApp();
    const { admin, piet, kees, oma, travel } = await setupWorld();
    const keesTravel = await createTravel(kees.cookie, 'Fjorden');
    await setViewers(kees.cookie, keesTravel.id, [oma.id]);
    const inOwn = await createPost(kees.cookie, 'Eigen', '2025-06-02T10:00:00Z', {
      travelId: keesTravel.id,
    });
    await call('POST', `/api/posts/${inOwn.id}/comments`, oma.cookie, { text: 'Mooi' });
    const inPiets = await createPost(kees.cookie, 'Bij Piet', '2025-06-03T10:00:00Z', {
      travelId: travel.id,
    });
    const byPiet = await createPost(piet.cookie, 'Van Piet', '2025-06-04T10:00:00Z');
    await call('PUT', `/api/posts/${byPiet.id}/like`, kees.cookie);
    await call('POST', `/api/posts/${byPiet.id}/comments`, kees.cookie, { text: 'Hoi' });

    const users: AdminUser[] = (await call('GET', '/api/users', admin)).json().users;
    expect(users.find((u) => u.id === kees.id)!.ownedTravels).toEqual([
      { id: keesTravel.id, name: 'Fjorden', members: [] },
    ]);
    expect(users.find((u) => u.id === piet.id)!.ownedTravels).toEqual([
      { id: travel.id, name: 'IJsland', members: [{ id: kees.id, displayName: 'Kees' }] },
    ]);
    const protectedAdmin = await remove(admin, adminId, { mode: 'delete' });
    expect(protectedAdmin.statusCode).toBe(400);
    expect(protectedAdmin.json().error).toBe('ADMIN_PROTECTED');
    expect((await remove(piet.cookie, kees.id, { mode: 'delete' })).statusCode).toBe(403);

    expect((await remove(admin, kees.id, { mode: 'delete' })).statusCode).toBe(204);
    expect((await call('GET', `/api/travels/${keesTravel.id}`, admin)).statusCode).toBe(404);
    expect((await call('GET', `/api/posts/${inOwn.id}`, admin)).statusCode).toBe(404);
    const kept: PostDetail = (await call('GET', `/api/posts/${inPiets.id}`, piet.cookie)).json().post;
    expect(kept).toMatchObject({ title: 'Bij Piet', author: null, canEdit: false, canDelete: true });
    expect((await getTravel(piet.cookie, travel.id)).members).toEqual([]);
    const liked: PostDetail = (await call('GET', `/api/posts/${byPiet.id}`, piet.cookie)).json().post;
    expect(liked).toMatchObject({ likeCount: 0, commentCount: 0 });
    expect(await feedTitles(oma.cookie)).toEqual(['Van Piet', 'Bij Piet']);
    expect(count('posts')).toBe(2);
    expect(count('comments')).toBe(0);
    expect((await call('GET', '/api/posts', kees.cookie)).statusCode).toBe(401);
    // The post stays deletable by the travel owner.
    expect((await call('DELETE', `/api/posts/${inPiets.id}`, piet.cookie)).statusCode).toBe(204);
  });

  it('draagt reizen over aan een reiziger en verwijdert niet-overgedragen reizen', async () => {
    await startApp();
    const { admin, piet, kees, oma, travel } = await setupWorld();
    const other = await createTravel(piet.cookie, 'Schotland');
    const p1 = await createPost(piet.cookie, 'IJs', '2025-06-02T10:00:00Z', { travelId: travel.id });
    const p2 = await createPost(piet.cookie, 'Hooglanden', '2025-06-02T10:00:00Z', {
      travelId: other.id,
    });
    const before = count('posts');

    for (const target of [oma.id, piet.id, crypto.randomUUID()]) {
      const res = await remove(admin, piet.id, {
        mode: 'transfer',
        transfers: { [travel.id]: target },
      });
      expect(res.statusCode, target).toBe(400);
      expect(res.json().error).toBe('INVALID_TRANSFER');
    }
    // A disabled traveller cannot take over either.
    const anna = await addUser(admin, 'anna', 'Anna', 'traveller');
    await call('PATCH', `/api/users/${anna.id}`, admin, { disabled: true });
    const disabled = await remove(admin, piet.id, {
      mode: 'transfer',
      transfers: { [travel.id]: kees.id, [other.id]: anna.id },
    });
    expect(disabled.statusCode).toBe(400);
    // Nothing changed.
    expect(count('posts')).toBe(before);
    expect((await getTravel(piet.cookie, travel.id)).myRole).toBe('owner');
    expect((await getTravel(piet.cookie, other.id)).myRole).toBe('owner');

    const res = await remove(admin, piet.id, {
      mode: 'transfer',
      transfers: { [travel.id]: kees.id },
    });
    expect(res.statusCode).toBe(204);
    const t = await getTravel(kees.cookie, travel.id);
    expect(t).toMatchObject({ myRole: 'owner', canManage: true, members: [], viewerIds: [oma.id] });
    expect(t.owner.id).toBe(kees.id);
    const moved: PostDetail = (await call('GET', `/api/posts/${p1.id}`, kees.cookie)).json().post;
    expect(moved).toMatchObject({ author: null, canDelete: true });
    expect((await call('GET', `/api/travels/${other.id}`, admin)).statusCode).toBe(404);
    expect((await call('GET', `/api/posts/${p2.id}`, admin)).statusCode).toBe(404);
    expect(await feedTitles(oma.cookie)).toEqual(['IJs']);
  });

  it('schakelt een eigenaar uit en houdt alles; zonder reizen wordt echt verwijderd', async () => {
    await startApp();
    const { admin, piet, kees, oma, jan, travel } = await setupWorld();
    await createPost(piet.cookie, 'Geiser', '2025-06-02T10:00:00Z');

    const res = await remove(admin, piet.id, { mode: 'disable' });
    expect(res.statusCode).toBe(200);
    expect(res.json().user).toMatchObject({ id: piet.id, disabled: true });
    expect((await call('GET', '/api/posts', piet.cookie)).statusCode).toBe(401);
    expect(await feedTitles(oma.cookie)).toEqual(['Geiser']);
    expect((await getTravel(kees.cookie, travel.id)).owner.id).toBe(piet.id);
    // Disabled users cannot be invited.
    const other = await createTravel(kees.cookie, 'Ander');
    expect(
      (await call('POST', `/api/travels/${other.id}/members`, kees.cookie, { userId: piet.id }))
        .statusCode,
    ).toBe(404);

    // Without owned travels "disable" just deletes the user.
    expect((await remove(admin, jan.id, { mode: 'disable' })).statusCode).toBe(204);
    const ids = ((await call('GET', '/api/users', admin)).json().users as AdminUser[]).map((u) => u.id);
    expect(ids).not.toContain(jan.id);
    expect(ids).toContain(piet.id);
  });

  it('wijzigt de rol van een gebruiker', async () => {
    await startApp();
    const { admin, kees, travel } = await setupWorld();
    const res = await call('PATCH', `/api/users/${kees.id}`, admin, { role: 'viewer' });
    expect(res.statusCode).toBe(200);
    expect(res.json().user.role).toBe('viewer');
    // Still a member, but viewers cannot post.
    expect(await getTravel(kees.cookie, travel.id)).toMatchObject({ myRole: 'member', canPost: false });
    expect(
      (await call('POST', '/api/posts', kees.cookie, { title: 'X', date: '2025-06-02' })).statusCode,
    ).toBe(403);
    const adminRole = await call('PATCH', `/api/users/${adminId}`, admin, { role: 'viewer' });
    expect(adminRole.json().error).toBe('ADMIN_PROTECTED');
    await call('PATCH', `/api/users/${kees.id}`, admin, { role: 'traveller' });
    expect((await getTravel(kees.cookie, travel.id)).canPost).toBe(true);
  });
});

describe('eigen Immich-sleutel', () => {
  it('slaat de sleutel versleuteld op en haalt foto’s op met de sleutel van de auteur', async () => {
    const url = await startFakeImmich();
    await startApp({ immichUrl: url });
    const { admin, piet, kees, oma, jan, travel } = await setupWorld();
    const ASSET_D = '66666666-6666-4666-8666-666666666666';

    const set = await call('PUT', '/api/profile/immich-key', piet.cookie, { apiKey: PIET_KEY });
    expect(set.statusCode).toBe(200);
    expect(set.json().user.hasImmichKey).toBe(true);
    expect(JSON.stringify(set.json())).not.toContain(PIET_KEY);
    const stored = immichKeyRow(piet.id)!;
    expect(stored.startsWith('v1.')).toBe(true);
    expect(stored).not.toContain(PIET_KEY);
    expect((await call('GET', '/api/auth/me', kees.cookie)).json().user.hasImmichKey).toBe(false);

    await createPost(piet.cookie, 'Van Piet', '2025-06-02T10:00:00Z', { photos: [ASSET_A] });
    await createPost(kees.cookie, 'Van Kees', '2025-06-03T10:00:00Z', { photos: [ASSET_C] });
    const media = async (cookie: string, asset: string, size = 'preview') => {
      const res = await call('GET', `/api/media/${asset}/${size}`, cookie);
      return res.statusCode === 200 ? res.body : res.statusCode;
    };

    // Published photos come from the author's library, also for viewers.
    expect(await media(oma.cookie, ASSET_A)).toBe(`jpeg:piet:${ASSET_A}:preview`);
    expect(await media(kees.cookie, ASSET_A)).toBe(`jpeg:piet:${ASSET_A}:preview`);
    expect(await media(jan.cookie, ASSET_A)).toBe(404);
    expect(await media(oma.cookie, ASSET_A, 'original')).toBe(404);
    expect(await media(kees.cookie, ASSET_A, 'original')).toBe(404);
    expect(await media(piet.cookie, ASSET_A, 'original')).toBe(`jpeg:piet:${ASSET_A}:original`);
    // Unpublished: only from one's own library.
    expect(await media(oma.cookie, ASSET_D)).toBe(404);
    expect(await media(kees.cookie, ASSET_D)).toBe(404);
    expect(await media(piet.cookie, ASSET_D)).toBe(`jpeg:piet:${ASSET_D}:preview`);
    // Kees has no key yet, so his photos cannot be shown.
    expect(await media(oma.cookie, ASSET_C)).toBe(404);

    // The admin sets keys for travellers only.
    const notTraveller = await call('PUT', `/api/users/${oma.id}/immich-key`, admin, {
      apiKey: BERT_KEY,
    });
    expect(notTraveller.json().error).toBe('NOT_TRAVELLER');
    const wrong = await call('PUT', `/api/users/${kees.id}/immich-key`, admin, {
      apiKey: 'een-foute-sleutel',
    });
    expect(wrong.statusCode).toBe(400);
    const byAdmin = await call('PUT', `/api/users/${kees.id}/immich-key`, admin, {
      apiKey: BERT_KEY,
    });
    expect(byAdmin.statusCode).toBe(200);
    expect(byAdmin.json().user.hasImmichKey).toBe(true);
    expect(await media(oma.cookie, ASSET_C)).toBe(`jpeg:bert:${ASSET_C}:preview`);
    expect(await media(piet.cookie, ASSET_C)).toBe(`jpeg:bert:${ASSET_C}:preview`);

    // Covers come from the travel owner's library.
    await call('PUT', `/api/travels/${travel.id}`, piet.cookie, {
      name: 'IJsland',
      startDate: '2025-06-01',
      coverAssetId: ASSET_B,
    });
    expect(await media(oma.cookie, ASSET_B, 'thumbnail')).toBe(`jpeg:piet:${ASSET_B}:thumbnail`);

    // Immich browsing uses one's own key.
    expect((await call('GET', '/api/immich/albums', piet.cookie)).statusCode).toBe(200);
    const assets = await call('GET', '/api/immich/assets', kees.cookie);
    expect(assets.statusCode).toBe(200);
    expect(JSON.stringify(assets.json())).toContain(ASSET_A);

    // Immich photo as avatar, served with the user's own key.
    const avatar = await call('PUT', '/api/profile/avatar', kees.cookie, { assetId: ASSET_A });
    expect(avatar.statusCode).toBe(200);
    const img = await call('GET', avatar.json().user.avatarUrl, oma.cookie);
    expect(img.statusCode).toBe(200);
    expect(img.body).toBe(`jpeg:bert:${ASSET_A}:thumbnail`);

    // Removing the key.
    const removed = await call('PUT', '/api/profile/immich-key', piet.cookie, { apiKey: null });
    expect(removed.json().user.hasImmichKey).toBe(false);
    expect(immichKeyRow(piet.id)).toBeNull();
    expect((await call('GET', '/api/immich/albums', piet.cookie)).json().error).toBe('IMMICH_NO_KEY');
    expect(await media(oma.cookie, ASSET_A)).toBe(404);
  });
});

describe('oude database', () => {
  it('hernoemt bertsteps.db naar travelsteps.db', () => {
    const old = path.join(dataDir, 'bertsteps.db');
    const legacy = openDatabase(old);
    legacy.prepare("INSERT INTO login_attempts (key, at) VALUES ('oud', 1)").run();
    legacy.close();
    fs.writeFileSync(`${old}-wal`, '');
    fs.writeFileSync(`${old}-shm`, '');

    expect(renameLegacyDatabase(dataDir)).toBe(true);
    expect(fs.readdirSync(dataDir).sort()).toEqual([
      DB_FILE,
      `${DB_FILE}-shm`,
      `${DB_FILE}-wal`,
    ]);
    fs.rmSync(path.join(dataDir, `${DB_FILE}-wal`));
    fs.rmSync(path.join(dataDir, `${DB_FILE}-shm`));
    const reopened = openDatabase(dbPath());
    expect(reopened.prepare('SELECT key FROM login_attempts').get()).toEqual({ key: 'oud' });
    reopened.close();

    // Nothing to do without an old file, and an existing new database is never overwritten.
    expect(renameLegacyDatabase(dataDir)).toBe(false);
    fs.writeFileSync(old, 'oud');
    expect(renameLegacyDatabase(dataDir)).toBe(false);
    expect(fs.existsSync(old)).toBe(true);
  });
});
