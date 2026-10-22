import path from 'node:path';
import { BlockList, isIP } from 'node:net';
import type { FastifyBaseLogger, FastifyReply, FastifyRequest } from 'fastify';
import type { AppConfig } from './config.js';
import type { DB } from './db.js';
import { LoginThrottle } from './auth/loginThrottle.js';
import { SESSION_COOKIE, SessionStore } from './auth/sessions.js';
import { UserRepository, type UserRecord } from './users/repository.js';
import { ContentStore } from './content/store.js';
import { ImmichService, KeyBox } from './immich/keys.js';
import { NotificationService } from './notifications/service.js';
import { SocialRepository } from './social/repository.js';
import { RoutingService } from './routing/service.js';
import { BackupService } from './backup.js';
import { TrustRepository } from './trust/repository.js';
import { canUseAuthorRights } from './trust/permissions.js';
import type { Actor } from './content/store.js';

export interface AppContext {
  config: AppConfig;
  db: DB;
  users: UserRepository;
  sessions: SessionStore;
  throttle: LoginThrottle;
  content: ContentStore;
  social: SocialRepository;
  immich: ImmichService;
  notifications: NotificationService;
  routing: RoutingService;
  backups: BackupService;
  trust: TrustRepository;
  canUseAuthorRights(requester: Actor, authorId: string | null, travelId: string): boolean;
  /** Folder for uploaded profile pictures. */
  avatarDir: string;
}

export function createContext(config: AppConfig, db: DB, log?: FastifyBaseLogger): AppContext {
  const users = new UserRepository(db);
  const content = new ContentStore(db, log);
  const trust = new TrustRepository(db);
  const deps = {
    canView: (actor: Actor, travelId: string) => content.canView(actor, travelId),
    isTrusted: (ownerId: string, trustedId: string) => trust.isTrusted(ownerId, trustedId),
  };
  return {
    config,
    db,
    users,
    sessions: new SessionStore(
      db,
      config.sessionSecret,
      config.sessionTtlDays * 24 * 60 * 60 * 1000,
    ),
    throttle: new LoginThrottle(db),
    content,
    social: new SocialRepository(db),
    immich: new ImmichService(config.immichUrl, users, new KeyBox(config.sessionSecret)),
    notifications: new NotificationService(
      db,
      content,
      users,
      config.dataDir,
      config.publicUrl,
      log,
    ),
    routing: new RoutingService(config.orsApiKey, config.orsUrl, log),
    backups: new BackupService(db, config.dataDir, config.backupKeep ?? 0, log),
    avatarDir: path.join(config.dataDir, 'uploads', 'avatars'),
    trust,
    canUseAuthorRights: (requester, authorId, travelId) =>
      canUseAuthorRights(deps, requester, authorId, travelId),
  };
}

declare module 'fastify' {
  interface FastifyInstance {
    ctx: AppContext;
  }
  interface FastifyRequest {
    user: UserRecord | null;
    sessionToken: string | null;
  }
  interface FastifyContextConfig {
    /** Route is reachable without a session. */
    public?: boolean;
    /** Route is reachable while the user still has to change username/password. */
    allowDuringCredentialChange?: boolean;
  }
}

/**
 * Addresses cloudflared can connect from: loopback, private LAN/Docker/Home Assistant networks.
 * A direct connection from the internet never has such an address, so it cannot spoof its IP.
 */
const TRUSTED_PROXY_NETS = (() => {
  const list = new BlockList();
  list.addSubnet('127.0.0.0', 8, 'ipv4');
  list.addSubnet('10.0.0.0', 8, 'ipv4');
  list.addSubnet('172.16.0.0', 12, 'ipv4');
  list.addSubnet('192.168.0.0', 16, 'ipv4');
  list.addSubnet('169.254.0.0', 16, 'ipv4');
  list.addAddress('::1', 'ipv6');
  list.addSubnet('fc00::', 7, 'ipv6');
  list.addSubnet('fe80::', 10, 'ipv6');
  return list;
})();

export function isTrustedProxy(address: string | undefined): boolean {
  if (!address) return false;
  const v4 = address.startsWith('::ffff:') ? address.slice(7) : address;
  const family = isIP(v4);
  if (family === 0) return false;
  return TRUSTED_PROXY_NETS.check(v4, family === 4 ? 'ipv4' : 'ipv6');
}

export function getClientIp(req: FastifyRequest, config: AppConfig): string {
  if (config.trustCloudflare && isTrustedProxy(req.socket.remoteAddress)) {
    const cf = req.headers['cf-connecting-ip'];
    if (typeof cf === 'string' && isIP(cf) !== 0) return cf;
  }
  return req.ip;
}

export function setSessionCookie(reply: FastifyReply, ctx: AppContext, token: string): void {
  reply.setCookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: ctx.config.cookieSecure,
    sameSite: 'lax',
    path: '/',
    maxAge: Math.floor(ctx.sessions.ttlMs / 1000),
  });
}

export function clearSessionCookie(reply: FastifyReply, ctx: AppContext): void {
  reply.clearCookie(SESSION_COOKIE, {
    httpOnly: true,
    secure: ctx.config.cookieSecure,
    sameSite: 'lax',
    path: '/',
  });
}

/** Revokes every session of the user and issues a fresh one for the current request. */
export function rotateSessions(
  req: FastifyRequest,
  reply: FastifyReply,
  ctx: AppContext,
  userId: string,
): void {
  ctx.sessions.revokeAllForUser(userId);
  const { token } = ctx.sessions.create(userId, {
    ip: getClientIp(req, ctx.config),
    userAgent: req.headers['user-agent'],
  });
  req.sessionToken = token;
  setSessionCookie(reply, ctx, token);
}
