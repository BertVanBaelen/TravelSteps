import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { buildApp } from '../src/app.js';
import { openDatabase, type DB } from '../src/db.js';
import type { AppConfig } from '../src/config.js';

const CSRF = { 'x-requested-with': 'TravelSteps' };
const START = 'start-wachtwoord-123';

let app: FastifyInstance;
let db: DB;
let dataDir: string;
let config: AppConfig;

function cookieFrom(res: LightMyRequestResponse): string {
  const c = res.cookies.find((c) => c.name === 'ts_session');
  if (!c) throw new Error('geen sessie-cookie');
  return `ts_session=${c.value}`;
}

async function post(url: string, payload?: unknown, cookie?: string, ip = '10.0.0.1') {
  return app.inject({
    method: 'POST',
    url,
    payload: payload as object,
    headers: { ...CSRF, 'cf-connecting-ip': ip, ...(cookie ? { cookie } : {}) },
  });
}

async function get(url: string, cookie?: string) {
  return app.inject({ method: 'GET', url, headers: cookie ? { cookie } : {} });
}

/** Logs in as the seeded admin and completes the forced password change. */
async function setupAdmin(): Promise<string> {
  const login = await post('/api/auth/login', { username: 'admin', password: START });
  const res = await post(
    '/api/auth/change-password',
    { newPassword: 'een-sterk-wachtwoord' },
    cookieFrom(login),
  );
  expect(res.statusCode).toBe(200);
  return cookieFrom(res);
}

function testConfig(): AppConfig {
  return {
    port: 0,
    host: '127.0.0.1',
    dataDir,
    cookieSecure: false,
    trustCloudflare: true,
    sessionTtlDays: 30,
    sessionSecret: 'x'.repeat(40),
    webDistDir: null,
    logLevel: 'silent',
    initialAdmin: { username: 'admin', password: START },
  };
}

beforeEach(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'travelsteps-test-'));
  config = testConfig();
  db = openDatabase(':memory:');
  app = await buildApp(config, db);
});

afterEach(async () => {
  await app.close();
  db.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

describe('basis', () => {
  it('health is publiek', async () => {
    const res = await get('/api/health');
    expect(res.statusCode).toBe(200);
  });

  it('serveert de web-app met cachekoppen en SPA-fallback', async () => {
    const dist = path.join(dataDir, 'dist');
    fs.mkdirSync(path.join(dist, 'assets'), { recursive: true });
    fs.writeFileSync(path.join(dist, 'index.html'), '<!doctype html><title>TS</title>');
    fs.writeFileSync(path.join(dist, 'assets', 'app-123.js'), 'console.log(1)');
    await app.close();
    app = await buildApp({ ...config, webDistDir: dist }, db);

    const asset = await get('/assets/app-123.js');
    expect(asset.statusCode).toBe(200);
    expect(asset.headers['cache-control']).toContain('immutable');
    for (const url of ['/', '/reizen/abc']) {
      const page = await get(url);
      expect(page.statusCode).toBe(200);
      expect(page.headers['cache-control']).toBe('no-cache');
      expect(page.body).toContain('<title>TS</title>');
    }
    expect((await get('/assets/../../package.json')).body).not.toContain('travelsteps');
  });

  it('comprimeert grotere antwoorden', async () => {
    const cookie = await setupAdmin();
    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/settings',
      headers: { cookie, 'accept-encoding': 'br, gzip' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-encoding']).toBe('br');
  });

  it('API vereist login', async () => {
    expect((await get('/api/auth/me')).statusCode).toBe(401);
    expect((await get('/api/users')).statusCode).toBe(401);
    expect((await get('/api/onbekend')).statusCode).toBe(401);
  });

  it('weigert POST zonder CSRF-header', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'admin', password: START },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error).toBe('CSRF');
  });

  it('slaat wachtwoorden op met Argon2id', () => {
    const row = db.prepare('SELECT password_hash FROM users').get() as { password_hash: string };
    expect(row.password_hash.startsWith('$argon2id$')).toBe(true);
  });
});

describe('eerste beheerder uit de configuratie', () => {
  it('maakt de beheerder aan en dwingt een nieuw wachtwoord af', async () => {
    expect(config.initialAdmin).toBeUndefined(); // removed after seeding

    const login = await post('/api/auth/login', { username: 'admin', password: START });
    expect(login.statusCode).toBe(200);
    const sessionCookie = login.cookies.find((c) => c.name === 'ts_session')!;
    expect(sessionCookie.httpOnly).toBe(true);
    expect(sessionCookie.sameSite).toBe('Lax');
    const cookie = cookieFrom(login);

    const me = (await get('/api/auth/me', cookie)).json().user;
    expect(me.role).toBe('admin');
    expect(me.mustChangePassword).toBe(true);
    expect((await get('/api/users', cookie)).json().error).toBe('MUST_CHANGE_CREDENTIALS');

    const same = await post('/api/auth/change-password', { newPassword: START }, cookie);
    expect(same.json().error).toBe('SAME_PASSWORD');

    const ok = await post(
      '/api/auth/change-password',
      { newPassword: 'een-sterk-wachtwoord' },
      cookie,
    );
    expect(ok.statusCode).toBe(200);
    expect(ok.json().user.mustChangePassword).toBe(false);

    // Old session is revoked, new one works.
    expect((await get('/api/auth/me', cookie)).statusCode).toBe(401);
    expect((await get('/api/users', cookieFrom(ok))).statusCode).toBe(200);

    // The configured password no longer works.
    expect((await post('/api/auth/login', { username: 'admin', password: START })).statusCode).toBe(
      401,
    );
  });

  it('bestaat er geen standaardaccount admin/admin', async () => {
    const res = await post('/api/auth/login', { username: 'admin', password: 'admin' });
    expect(res.statusCode).toBe(401);
  });

  it('weigert te starten zonder (geldige) beheerder in de configuratie', async () => {
    const make = (initialAdmin: AppConfig['initialAdmin']) =>
      buildApp({ ...testConfig(), initialAdmin }, openDatabase(':memory:'));
    await expect(make(undefined)).rejects.toThrow(/admin_username/);
    await expect(make({ username: 'admin', password: 'te-kort' })).rejects.toThrow(/12 tekens/);
    await expect(make({ username: 'a b', password: START })).rejects.toThrow(/admin_username/);
  });

  it('negeert de configuratie als er al gebruikers zijn', async () => {
    const other = await buildApp({ ...testConfig(), initialAdmin: undefined }, db);
    expect(db.prepare('SELECT COUNT(*) AS n FROM users').get()).toEqual({ n: 1 });
    await other.close();
  });
});

describe('beveiligingsregressies', () => {
  it('omzeilt de login-check niet met een gecodeerd pad', async () => {
    for (const url of ['/%61pi/users', '/%61pi/auth/me', '/api/%75sers', '/%2561pi/users']) {
      const res = await get(url);
      expect([400, 401, 404]).toContain(res.statusCode);
      expect(res.statusCode).not.toBe(200);
    }
    expect((await get('/%61pi/users')).statusCode).toBe(400);
    const admin = await setupAdmin();
    // Even logged in, encoded paths are refused (they would skip CSRF/forced-change checks).
    expect((await get('/%61pi/users', admin)).statusCode).toBe(400);
  });

  it('vertrouwt CF-Connecting-IP niet van een publiek adres', async () => {
    // Direct connection from the internet with a different spoofed IP every time.
    for (let i = 0; i < 30; i++) {
      await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        remoteAddress: '203.0.113.7',
        payload: { username: `onbekend${i}`, password: 'fout' },
        headers: { ...CSRF, 'cf-connecting-ip': `198.51.100.${i}` },
      });
    }
    const blocked = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      remoteAddress: '203.0.113.7',
      payload: { username: 'admin', password: START },
      headers: { ...CSRF, 'cf-connecting-ip': '198.51.100.250' },
    });
    expect(blocked.statusCode).toBe(429);
  });
});

describe('gebruikersbeheer', () => {
  it('beheerder maakt kijker aan die eerst zijn wachtwoord moet wijzigen', async () => {
    const admin = await setupAdmin();
    const created = await post(
      '/api/users',
      { username: 'oma', displayName: 'Oma', temporaryPassword: 'tijdelijk-123' },
      admin,
    );
    expect(created.statusCode).toBe(201);
    expect(created.json().user.role).toBe('viewer');

    const dup = await post(
      '/api/users',
      { username: 'OMA', displayName: 'Oma 2', temporaryPassword: 'tijdelijk-123' },
      admin,
    );
    expect(dup.statusCode).toBe(409);

    const login = await post('/api/auth/login', { username: 'oma', password: 'tijdelijk-123' });
    const viewer = cookieFrom(login);
    expect(login.json().user.mustChangePassword).toBe(true);
    expect((await get('/api/users', viewer)).json().error).toBe('MUST_CHANGE_CREDENTIALS');

    // Forced change right after login: no current password needed, but it must be new.
    const same = await post('/api/auth/change-password', { newPassword: 'tijdelijk-123' }, viewer);
    expect(same.json().error).toBe('SAME_PASSWORD');
    const changed = await post(
      '/api/auth/change-password',
      { newPassword: 'mijn-eigen-wachtwoord' },
      viewer,
    );
    expect(changed.statusCode).toBe(200);
    const viewer2 = cookieFrom(changed);

    // A normal change does require the current password.
    const noCurrent = await post(
      '/api/auth/change-password',
      { newPassword: 'nog-een-wachtwoord' },
      viewer2,
    );
    expect(noCurrent.statusCode).toBe(400);

    // Viewers are not admins.
    expect((await get('/api/users', viewer2)).statusCode).toBe(403);
    expect(
      (
        await post(
          '/api/auth/change-credentials',
          {
            currentPassword: 'mijn-eigen-wachtwoord',
            newUsername: 'x123',
            newPassword: 'abcdefghijk',
          },
          viewer2,
        )
      ).statusCode,
    ).toBe(403);
  });

  it('uitschakelen beëindigt sessies en blokkeert login', async () => {
    const admin = await setupAdmin();
    const { user } = (
      await post(
        '/api/users',
        { username: 'opa', displayName: 'Opa', temporaryPassword: 'tijdelijk-123' },
        admin,
      )
    ).json();
    const viewer = cookieFrom(
      await post('/api/auth/login', { username: 'opa', password: 'tijdelijk-123' }),
    );

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/users/${user.id}`,
      payload: { disabled: true },
      headers: { ...CSRF, cookie: admin },
    });
    expect(res.statusCode).toBe(200);
    expect((await get('/api/auth/me', viewer)).statusCode).toBe(401);
    expect(
      (await post('/api/auth/login', { username: 'opa', password: 'tijdelijk-123' })).statusCode,
    ).toBe(401);
  });

  it('beheerder kan zichzelf niet verwijderen of uitschakelen', async () => {
    const admin = await setupAdmin();
    const me = (await get('/api/auth/me', admin)).json().user;
    const del = await app.inject({
      method: 'DELETE',
      url: `/api/users/${me.id}`,
      headers: { ...CSRF, cookie: admin },
    });
    expect(del.statusCode).toBe(400);
    const dis = await app.inject({
      method: 'PATCH',
      url: `/api/users/${me.id}`,
      payload: { disabled: true },
      headers: { ...CSRF, cookie: admin },
    });
    expect(dis.statusCode).toBe(400);
  });
});

describe('bescherming tegen brute force', () => {
  it('blokkeert na 5 mislukte pogingen voor dezelfde gebruiker', async () => {
    for (let i = 0; i < 5; i++) {
      const res = await post(
        '/api/auth/login',
        { username: 'admin', password: 'fout' },
        undefined,
        `10.0.1.${i}`,
      );
      expect(res.statusCode).toBe(401);
    }
    const blocked = await post(
      '/api/auth/login',
      { username: 'admin', password: START },
      undefined,
      '10.0.2.1',
    );
    expect(blocked.statusCode).toBe(429);
    expect(blocked.headers['retry-after']).toBeDefined();
  });

  it('geeft dezelfde melding voor onbekende gebruiker', async () => {
    const res = await post('/api/auth/login', { username: 'bestaatniet', password: 'x' });
    expect(res.statusCode).toBe(401);
    expect(res.json().error).toBe('INVALID_CREDENTIALS');
  });
});
