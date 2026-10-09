import type { FastifyInstance, FastifyRequest } from 'fastify';
import { CSRF_HEADER, CSRF_VALUE, isTraveller } from '@travelsteps/shared';
import { SESSION_COOKIE } from './sessions.js';
import { HttpError, forbidden, unauthorized } from '../errors.js';
import { setSessionCookie } from '../context.js';
import type { UserRecord } from '../users/repository.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Global guard for /api/*: CSRF header check, session resolution, authentication and the
 * forced credential change. Everything is private unless a route sets `config.public`.
 */
export function registerAuthGuard(app: FastifyInstance): void {
  const ctx = app.ctx;
  app.decorateRequest('user', null);
  app.decorateRequest('sessionToken', null);

  app.addHook('onRequest', async (req, reply) => {
    // Decide on the route that find-my-way actually matched (it percent-decodes the path), not on
    // the raw URL: otherwise `/%61pi/...` would reach API routes while skipping this guard.
    const rawPath = req.url.split('?')[0] ?? '';
    const matched = req.routeOptions.url;
    const isApi = matched ? matched.startsWith('/api/') : rawPath.startsWith('/api/');
    if (!isApi) return;
    // API paths only ever contain plain ASCII (UUIDs, slugs); reject encoded tricks outright.
    if (!rawPath.startsWith('/api/') || rawPath.includes('%')) {
      throw new HttpError(400, 'BAD_PATH', 'Ongeldig pad.');
    }

    if (!SAFE_METHODS.has(req.method) && req.headers[CSRF_HEADER] !== CSRF_VALUE) {
      throw new HttpError(403, 'CSRF', 'Ongeldig verzoek.');
    }

    const token = req.cookies[SESSION_COOKIE];
    if (token) {
      const session = ctx.sessions.validate(token);
      const user = session && ctx.users.findById(session.userId);
      if (session && user && !user.disabled) {
        req.user = user;
        req.sessionToken = token;
        if (session.refreshed) setSessionCookie(reply, ctx, token);
      } else if (session) {
        ctx.sessions.revoke(token);
      }
    }

    const routeConfig = req.routeOptions.config ?? {};
    if (routeConfig.public) return;
    if (!req.user) throw unauthorized();
    if (
      (req.user.mustChangeCredentials || req.user.mustChangePassword) &&
      !routeConfig.allowDuringCredentialChange
    ) {
      throw new HttpError(
        403,
        'MUST_CHANGE_CREDENTIALS',
        'Je moet eerst je inloggegevens wijzigen.',
      );
    }
  });
}

export async function requireAdmin(req: FastifyRequest): Promise<void> {
  if (req.user?.role !== 'admin') throw forbidden();
}

/** Admin or traveller: may write travels/posts and use Immich. */
export async function requireTraveller(req: FastifyRequest): Promise<void> {
  if (!req.user || !isTraveller(req.user.role)) throw forbidden();
}

/** The logged-in user; throws 401 instead of crashing when a guard was somehow bypassed. */
export function currentUser(req: FastifyRequest): UserRecord {
  if (!req.user) throw unauthorized();
  return req.user;
}
