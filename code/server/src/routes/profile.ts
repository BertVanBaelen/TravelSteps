import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import type { ReadableStream as WebReadableStream } from 'node:stream/web';
import type { FastifyInstance } from 'fastify';
import {
  AVATAR_MAX_BYTES,
  avatarInputSchema,
  immichKeySchema,
  isTraveller,
  updateProfileSchema,
} from '@travelsteps/shared';
import { currentUser } from '../auth/guard.js';
import { HttpError, forbidden, notFound } from '../errors.js';
import { toPublicUser } from '../users/repository.js';
import type { AppContext } from '../context.js';
import { ImmichClient } from '../immich/client.js';

const IMAGE_TYPES = [
  { ext: 'jpg', type: 'image/jpeg', test: (b: Buffer) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  {
    ext: 'png',
    type: 'image/png',
    test: (b: Buffer) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  },
  {
    ext: 'webp',
    type: 'image/webp',
    test: (b: Buffer) => b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP',
  },
] as const;

const FILE_NAME = /^[0-9a-f-]{36}-[A-Za-z0-9_-]{8,}\.(jpg|png|webp)$/;

/** Removes an uploaded avatar file (no-op for Immich avatars). */
export function removeAvatarFile(ctx: AppContext, avatar: string | null): void {
  if (!avatar?.startsWith('file:')) return;
  const name = avatar.slice(5);
  if (FILE_NAME.test(name)) fs.rmSync(path.join(ctx.avatarDir, name), { force: true });
}

/** Throws when Immich rejects the key (not when Immich is just unreachable). */
export async function verifyImmichKey(ctx: AppContext, apiKey: string): Promise<void> {
  if (!ctx.config.immichUrl) {
    throw new HttpError(503, 'IMMICH_NOT_CONFIGURED', 'Immich is niet ingesteld (immich_url).');
  }
  try {
    await new ImmichClient(ctx.config.immichUrl, apiKey).timeline(1, 1);
  } catch (err) {
    if (err instanceof HttpError && err.code === 'IMMICH_AUTH') {
      throw new HttpError(400, 'IMMICH_AUTH', 'Immich weigert deze API-sleutel.');
    }
    if (!(err instanceof HttpError && err.code === 'IMMICH_UNREACHABLE')) throw err;
  }
}

/** Own profile: display name, profile picture and Immich key. */
export async function profileRoutes(app: FastifyInstance): Promise<void> {
  const ctx = app.ctx;

  app.patch('/', async (req) => {
    const { displayName } = updateProfileSchema.parse(req.body);
    const user = ctx.users.update(currentUser(req).id, { displayName });
    return { user: toPublicUser(user) };
  });

  app.put(
    '/avatar',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (req) => {
      const user = currentUser(req);
      const input = avatarInputSchema.parse(req.body);
      let avatar: string;
      if ('assetId' in input) {
        if (!isTraveller(user.role)) throw forbidden();
        await ctx.immich.client(user.id).asset(input.assetId);
        avatar = `immich:${input.assetId}`;
      } else {
        const data = Buffer.from(input.image, 'base64');
        if (data.length === 0 || data.length > AVATAR_MAX_BYTES) {
          throw new HttpError(400, 'VALIDATION', 'Afbeelding is te groot.');
        }
        const kind = IMAGE_TYPES.find((t) => t.test(data));
        if (!kind) throw new HttpError(400, 'VALIDATION', 'Alleen JPEG, PNG of WebP is toegestaan.');
        const name = `${user.id}-${crypto.randomBytes(9).toString('base64url')}.${kind.ext}`;
        fs.mkdirSync(ctx.avatarDir, { recursive: true });
        fs.writeFileSync(path.join(ctx.avatarDir, name), data);
        avatar = `file:${name}`;
      }
      removeAvatarFile(ctx, user.avatar);
      req.log.info({ userId: user.id }, 'Profielfoto gewijzigd');
      return { user: toPublicUser(ctx.users.update(user.id, { avatar })) };
    },
  );

  /** Own Immich API key (travellers); checked against Immich before it is stored. */
  app.put(
    '/immich-key',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (req) => {
      const user = currentUser(req);
      if (!isTraveller(user.role)) throw forbidden();
      const { apiKey } = immichKeySchema.parse(req.body);
      if (apiKey) await verifyImmichKey(ctx, apiKey);
      ctx.immich.setKey(user.id, apiKey);
      req.log.info({ userId: user.id }, apiKey ? 'Immich-sleutel ingesteld' : 'Immich-sleutel verwijderd');
      return { user: toPublicUser(ctx.users.findById(user.id)!) };
    },
  );

  app.delete('/avatar', async (req) => {
    const user = currentUser(req);
    removeAvatarFile(ctx, user.avatar);
    return { user: toPublicUser(ctx.users.update(user.id, { avatar: null })) };
  });
}

/** Profile pictures, visible to every logged-in user. */
export async function avatarRoutes(app: FastifyInstance): Promise<void> {
  const ctx = app.ctx;

  app.get<{ Params: { userId: string } }>('/:userId', async (req, reply) => {
    const avatar = ctx.users.findById(req.params.userId)?.avatar;
    if (!avatar) throw notFound('Profielfoto');
    reply.header('Cache-Control', 'private, max-age=604800');
    reply.header('X-Content-Type-Options', 'nosniff');

    if (avatar.startsWith('immich:')) {
      const client = ctx.immich.tryClient(req.params.userId);
      if (!client) throw notFound('Profielfoto');
      const res = await client.media(avatar.slice(7), 'thumbnail', {});
      const type = res.headers.get('content-type');
      if (type) reply.header('content-type', type);
      if (!res.body) throw notFound('Profielfoto');
      return reply.send(Readable.fromWeb(res.body as WebReadableStream));
    }

    const name = avatar.slice(5);
    const file = path.join(ctx.avatarDir, name);
    if (!FILE_NAME.test(name) || !fs.existsSync(file)) throw notFound('Profielfoto');
    const ext = name.split('.').pop();
    reply.header('content-type', IMAGE_TYPES.find((t) => t.ext === ext)!.type);
    return reply.send(fs.createReadStream(file));
  });
}
