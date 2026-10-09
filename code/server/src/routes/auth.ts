import type { FastifyInstance } from 'fastify';
import { changeCredentialsSchema, changePasswordSchema, loginSchema } from '@travelsteps/shared';
import { HttpError, forbidden } from '../errors.js';
import { dummyVerify, hashPassword, verifyPassword } from '../auth/password.js';
import { IP_FAILURE_THRESHOLD, USER_FAILURE_THRESHOLD } from '../auth/loginThrottle.js';
import { toPublicUser } from '../users/repository.js';
import { clearSessionCookie, getClientIp, rotateSessions, setSessionCookie } from '../context.js';
import { currentUser } from '../auth/guard.js';

/**
 * The current password is only skipped during a forced change: the user just
 * logged in with it, and the session can do nothing else until it is changed.
 */
async function checkPasswords(
  user: { passwordHash: string },
  forced: boolean,
  currentPassword: string | undefined,
  newPassword: string,
): Promise<void> {
  if (!forced || currentPassword) {
    if (!currentPassword) {
      throw new HttpError(400, 'VALIDATION', 'Huidig wachtwoord is verplicht.');
    }
    if (!(await verifyPassword(user.passwordHash, currentPassword))) {
      throw new HttpError(400, 'INVALID_PASSWORD', 'Huidig wachtwoord is onjuist.');
    }
  }
  if (await verifyPassword(user.passwordHash, newPassword)) {
    throw new HttpError(400, 'SAME_PASSWORD', 'Kies een nieuw wachtwoord.');
  }
}

function minutesText(ms: number): string {
  const minutes = Math.max(1, Math.ceil(ms / 60_000));
  return minutes === 1 ? '1 minuut' : `${minutes} minuten`;
}

export async function authRoutes(app: FastifyInstance): Promise<void> {
  const ctx = app.ctx;

  app.post(
    '/login',
    {
      config: {
        public: true,
        rateLimit: {
          max: 10,
          timeWindow: '1 minute',
          keyGenerator: (req) => getClientIp(req, ctx.config),
        },
      },
    },
    async (req, reply) => {
      const body = loginSchema.parse(req.body);
      const ip = getClientIp(req, ctx.config);
      const userKey = `user:${body.username.toLowerCase()}`;
      const ipKey = `ip:${ip}`;

      const waitMs = Math.max(
        ctx.throttle.retryAfterMs(userKey, USER_FAILURE_THRESHOLD),
        ctx.throttle.retryAfterMs(ipKey, IP_FAILURE_THRESHOLD),
      );
      if (waitMs > 0) {
        reply.header('Retry-After', Math.ceil(waitMs / 1000));
        throw new HttpError(
          429,
          'TOO_MANY_ATTEMPTS',
          `Te veel mislukte pogingen. Probeer het over ${minutesText(waitMs)} opnieuw.`,
        );
      }

      const user = ctx.users.findByUsername(body.username);
      const valid = user
        ? await verifyPassword(user.passwordHash, body.password)
        : await dummyVerify(body.password);

      if (!user || !valid || user.disabled) {
        ctx.throttle.recordFailure(userKey);
        ctx.throttle.recordFailure(ipKey);
        // Log only whether the account exists: people sometimes type their password here.
        req.log.warn({ ip, userId: user?.id ?? null }, 'Mislukte inlogpoging');
        throw new HttpError(401, 'INVALID_CREDENTIALS', 'Ongeldige gebruikersnaam of wachtwoord.');
      }

      ctx.throttle.reset(userKey);
      // Never reuse a session that existed before login (session fixation).
      if (req.sessionToken) ctx.sessions.revoke(req.sessionToken);
      const { token } = ctx.sessions.create(user.id, {
        ip,
        userAgent: req.headers['user-agent'],
      });
      setSessionCookie(reply, ctx, token);
      req.log.info({ userId: user.id }, 'Ingelogd');
      return { user: toPublicUser(user) };
    },
  );

  app.post('/logout', { config: { public: true } }, async (req, reply) => {
    if (req.sessionToken) ctx.sessions.revoke(req.sessionToken);
    clearSessionCookie(reply, ctx);
    return reply.code(204).send();
  });

  app.get('/me', { config: { allowDuringCredentialChange: true } }, async (req) => {
    return { user: toPublicUser(currentUser(req)) };
  });

  app.post(
    '/change-credentials',
    { config: { allowDuringCredentialChange: true } },
    async (req, reply) => {
      const user = currentUser(req);
      if (user.role !== 'admin') throw forbidden();
      const body = changeCredentialsSchema.parse(req.body);

      await checkPasswords(
        user,
        user.mustChangeCredentials,
        body.currentPassword,
        body.newPassword,
      );
      if (
        user.mustChangeCredentials &&
        body.newUsername.toLowerCase() === user.username.toLowerCase()
      ) {
        throw new HttpError(400, 'SAME_USERNAME', 'Kies een nieuwe gebruikersnaam.');
      }
      const existing = ctx.users.findByUsername(body.newUsername);
      if (existing && existing.id !== user.id) {
        throw new HttpError(409, 'USERNAME_TAKEN', 'Deze gebruikersnaam is al in gebruik.');
      }

      const updated = ctx.users.update(user.id, {
        username: body.newUsername,
        displayName: body.displayName,
        passwordHash: await hashPassword(body.newPassword),
        mustChangeCredentials: false,
        mustChangePassword: false,
      });
      rotateSessions(req, reply, ctx, user.id);
      req.log.info({ userId: user.id }, 'Inloggegevens gewijzigd');
      return { user: toPublicUser(updated) };
    },
  );

  app.post(
    '/change-password',
    { config: { allowDuringCredentialChange: true } },
    async (req, reply) => {
      const user = currentUser(req);
      if (user.mustChangeCredentials) {
        throw new HttpError(
          403,
          'MUST_CHANGE_CREDENTIALS',
          'Je moet eerst je gebruikersnaam en wachtwoord wijzigen.',
        );
      }
      const body = changePasswordSchema.parse(req.body);

      await checkPasswords(user, user.mustChangePassword, body.currentPassword, body.newPassword);

      const updated = ctx.users.update(user.id, {
        passwordHash: await hashPassword(body.newPassword),
        mustChangePassword: false,
      });
      rotateSessions(req, reply, ctx, user.id);
      req.log.info({ userId: user.id }, 'Wachtwoord gewijzigd');
      return { user: toPublicUser(updated) };
    },
  );
}
