import fs from 'node:fs';
import path from 'node:path';
import Fastify, { type FastifyError, type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import compress from '@fastify/compress';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import { ZodError } from 'zod';
import { usernameSchema, type ApiErrorBody } from '@travelsteps/shared';
import type { AppConfig } from './config.js';
import type { DB } from './db.js';
import { createContext } from './context.js';
import { HttpError } from './errors.js';
import { registerAuthGuard } from './auth/guard.js';
import { hashPassword } from './auth/password.js';
import { authRoutes } from './routes/auth.js';
import { directoryRoutes, userRoutes } from './routes/users.js';
import { travelRoutes } from './routes/travels.js';
import { commentRoutes, postRoutes } from './routes/posts.js';
import { immichRoutes, mediaRoutes } from './routes/immich.js';
import { settingsRoutes } from './routes/settings.js';
import { routingRoutes } from './routes/routing.js';
import { libraryRoutes } from './routes/library.js';
import { avatarRoutes, profileRoutes } from './routes/profile.js';
import { notificationRoutes, pushRoutes, travellerRoutes } from './routes/notifications.js';
import { importMarkdown } from './content/import.js';
import { APP_VERSION } from './version.js';

const OSM_TILES = 'https://tile.openstreetmap.org';

const HOUSEKEEPING_INTERVAL_MS = 60 * 60 * 1000;

const INITIAL_ADMIN_PASSWORD_MIN = 12;

/**
 * Creates the first admin from the configured admin_username/admin_password, only when the
 * database has no users. There is no default account, so a fresh install cannot be taken over.
 */
async function seedAdmin(app: FastifyInstance): Promise<void> {
  const { users, config } = app.ctx;
  const initial = config.initialAdmin;
  delete config.initialAdmin;
  if (users.count() > 0) return;

  const hint =
    'Vul admin_username en admin_password in bij de add-on configuratie ' +
    '(of ADMIN_USERNAME/ADMIN_PASSWORD in .env) en herstart.';
  if (!initial?.username || !initial.password) {
    throw new Error(`Er bestaat nog geen beheerder. ${hint}`);
  }
  const username = usernameSchema.safeParse(initial.username);
  if (!username.success) {
    throw new Error(`Ongeldige admin_username: ${username.error.issues[0]?.message}. ${hint}`);
  }
  if (initial.password.length < INITIAL_ADMIN_PASSWORD_MIN || initial.password.length > 256) {
    throw new Error(
      `admin_password moet minstens ${INITIAL_ADMIN_PASSWORD_MIN} tekens bevatten. ${hint}`,
    );
  }

  users.create({
    username: username.data,
    displayName: 'Beheerder',
    passwordHash: await hashPassword(initial.password),
    role: 'admin',
    // The configured password is stored in plaintext in the options file, so replace it.
    mustChangePassword: true,
  });
  app.log.warn(
    { username: username.data },
    'Beheerder aangemaakt uit de configuratie. Wijzig het wachtwoord bij de eerste login.',
  );
}

/**
 * Upgrades from before multi-traveller (0.4): imports the Markdown travels into the database
 * (owned by the admin).
 */
function migrateLegacyContent(app: FastifyInstance): void {
  const { config, content, users } = app.ctx;
  const admin = users.list().find((u) => u.role === 'admin');
  if (!admin) return;

  const root = path.join(config.dataDir, 'travels');
  if (content.travelCount === 0 && fs.existsSync(root)) {
    try {
      const result = importMarkdown(root, content, admin.id, app.log);
      app.log.warn(result, 'Reizen en posts uit Markdown-bestanden overgezet naar de database');
    } catch (err) {
      app.log.error({ err: String(err) }, 'Overzetten van de Markdown-bestanden mislukt');
    }
  }
}

export async function buildApp(config: AppConfig, db: DB): Promise<FastifyInstance> {
  const app = Fastify({
    logger: { level: config.logLevel },
    trustProxy: false,
    bodyLimit: 1024 * 1024,
  });
  app.decorate('ctx', createContext(config, db, app.log));
  app.ctx.content.load();

  app.setErrorHandler((err: FastifyError | Error, req, reply) => {
    let status = 500;
    let body: ApiErrorBody = { error: 'INTERNAL', message: 'Er ging iets mis op de server.' };

    if (err instanceof ZodError) {
      status = 400;
      body = { error: 'VALIDATION', message: err.issues[0]?.message ?? 'Ongeldige invoer.' };
    } else if (err instanceof HttpError) {
      status = err.statusCode;
      body = { error: err.code, message: err.message };
    } else if ('statusCode' in err && err.statusCode && err.statusCode < 500) {
      status = err.statusCode;
      body = {
        error: (err as FastifyError).code ?? 'BAD_REQUEST',
        message: status === 429 ? 'Te veel verzoeken. Probeer het later opnieuw.' : err.message,
      };
    }

    if (status >= 500) req.log.error(err);
    return reply.code(status).send(body);
  });

  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        // OpenStreetMap tiles for the maps (also fetched by the service worker for offline use).
        'img-src': ["'self'", 'data:', 'blob:', OSM_TILES],
        'connect-src': ["'self'", OSM_TILES],
        'worker-src': ["'self'"],
        'upgrade-insecure-requests': null,
      },
    },
  });
  await app.register(cookie);
  await app.register(rateLimit, { global: false });
  // gzip/brotli for JSON and the web app; photos (already compressed) are skipped by type.
  await app.register(compress, { global: true, encodings: ['br', 'gzip'] });

  registerAuthGuard(app);

  app.get('/api/health', { config: { public: true } }, async () => ({
    status: 'ok',
    version: APP_VERSION,
  }));
  await app.register(authRoutes, { prefix: '/api/auth' });
  await app.register(userRoutes, { prefix: '/api/users' });
  await app.register(directoryRoutes, { prefix: '/api/directory' });
  await app.register(travelRoutes, { prefix: '/api/travels' });
  await app.register(postRoutes, { prefix: '/api/posts' });
  await app.register(commentRoutes, { prefix: '/api/comments' });
  await app.register(immichRoutes, { prefix: '/api/immich' });
  await app.register(mediaRoutes, { prefix: '/api/media' });
  await app.register(settingsRoutes, { prefix: '/api/admin/settings' });
  await app.register(routingRoutes, { prefix: '/api/routing' });
  await app.register(libraryRoutes, { prefix: '/api/library' });
  await app.register(profileRoutes, { prefix: '/api/profile' });
  await app.register(avatarRoutes, { prefix: '/api/avatars' });
  await app.register(travellerRoutes, { prefix: '/api/travellers' });
  await app.register(notificationRoutes, { prefix: '/api/notifications' });
  await app.register(pushRoutes, { prefix: '/api/push' });

  const webDist = config.webDistDir;
  if (webDist && fs.existsSync(path.join(webDist, 'index.html'))) {
    await app.register(fastifyStatic, {
      root: webDist,
      wildcard: false,
      setHeaders: (res, filePath) => {
        res.header(
          'Cache-Control',
          /[\\/]assets[\\/]/.test(filePath) ? 'public, max-age=31536000, immutable' : 'no-cache',
        );
      },
    });
  } else {
    app.log.warn('Geen web/dist gevonden; alleen de API wordt geserveerd.');
  }

  app.setNotFoundHandler((req, reply) => {
    if (req.method === 'GET' && !req.url.startsWith('/api/') && webDist) {
      reply.header('Cache-Control', 'no-cache');
      return reply.sendFile('index.html');
    }
    return reply
      .code(404)
      .send({ error: 'NOT_FOUND', message: 'Niet gevonden.' } satisfies ApiErrorBody);
  });

  await seedAdmin(app);
  migrateLegacyContent(app);

  const housekeeping = setInterval(() => {
    app.ctx.sessions.purgeExpired();
    app.ctx.throttle.purgeOld();
    app.ctx.notifications.purgeOld();
    void app.ctx.backups.runIfDue();
  }, HOUSEKEEPING_INTERVAL_MS);
  housekeeping.unref();
  app.addHook('onReady', async () => {
    void app.ctx.backups.runIfDue();
  });
  app.addHook('onClose', async () => {
    clearInterval(housekeeping);
    await app.ctx.backups.settled();
  });

  return app;
}
