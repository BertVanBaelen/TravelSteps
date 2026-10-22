import { Readable } from 'node:stream';
import type { ReadableStream as WebReadableStream } from 'node:stream/web';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { assetIdSchema, isTraveller, type MediaSize } from '@travelsteps/shared';
import { currentUser, requireTraveller } from '../auth/guard.js';
import { HttpError, forbidden, notFound } from '../errors.js';

const pageQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  size: z.coerce.number().int().min(1).max(200).default(60),
  q: z.string().trim().max(200).optional(),
  albumId: z.string().uuid().optional(),
});

/** Browsing the traveller's own Immich library (for the photo picker), with their own key. */
export async function immichRoutes(app: FastifyInstance): Promise<void> {
  const { immich } = app.ctx;
  app.addHook('preHandler', requireTraveller);

  app.get('/assets', async (req) => {
    const client = immich.client(currentUser(req).id);
    const q = pageQuerySchema.parse(req.query);
    if (q.albumId) return client.albumAssets(q.albumId, q.page, q.size);
    if (q.q) return client.search(q.q, q.page, q.size);
    return client.timeline(q.page, q.size);
  });

  app.get('/albums', async (req) => ({
    albums: await immich.client(currentUser(req).id).albums(),
  }));

  app.get<{ Params: { id: string } }>('/assets/:id', async (req) => ({
    asset: await immich.client(currentUser(req).id).asset(assetIdSchema.parse(req.params.id)),
  }));
}

const MEDIA_SIZES: readonly MediaSize[] = ['thumbnail', 'preview', 'original'];
const FORWARD_HEADERS = ['content-type', 'content-length', 'etag', 'last-modified'];
const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'image/gif': 'gif',
  'image/tiff': 'tif',
};

const originalUnavailable = () =>
  new HttpError(404, 'ORIGINAL_UNAVAILABLE', 'Het origineel is niet beschikbaar.');

export function attachmentHeader(fileName: string | null, assetId: string, type: string | null) {
  const base = fileName?.split(/[\\/]/).pop()?.trim();
  const ext = EXTENSIONS[type?.split(';')[0]?.trim().toLowerCase() ?? ''] ?? 'jpg';
  const name = base || `${assetId}.${ext}`;
  const ascii = name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

/** Image proxy: the browser never talks to Immich directly. */
export async function mediaRoutes(app: FastifyInstance): Promise<void> {
  const ctx = app.ctx;
  const { immich, content } = ctx;

  app.get<{ Params: { assetId: string; size: string } }>('/:assetId/:size', async (req, reply) => {
    const parsed = assetIdSchema.safeParse(req.params.assetId);
    const size = req.params.size as MediaSize;
    if (!parsed.success || !MEDIA_SIZES.includes(size)) throw notFound('Foto');
    const assetId = parsed.data;
    const user = currentUser(req);
    const own = isTraveller(user.role) ? immich.tryClient(user.id) : null;
    const sources = content
      .assetSources(assetId)
      .filter((s) => s.userId && content.canView(user, s.travelId));

    if (size === 'original') {
      const allowed = sources.filter((s) => ctx.canUseAuthorRights(user, s.userId, s.travelId));
      if (sources.length > 0 && allowed.length === 0) throw forbidden();
      const source = allowed.find((s) => s.userId === user.id) ?? allowed[0];
      const ownerId = source ? source.userId! : user.id;
      const client = source ? immich.tryClient(ownerId) : own;
      if (!client) throw source ? originalUnavailable() : notFound('Foto');
      let res: Response;
      let fileName: string | null = null;
      try {
        fileName = (await client.asset(assetId)).fileName;
        res = await client.media(assetId, 'original', {});
      } catch (err) {
        if (err instanceof HttpError && err.statusCode === 404) throw originalUnavailable();
        throw err;
      }
      if (!res.body) throw originalUnavailable();
      const type = res.headers.get('content-type');
      for (const name of ['content-type', 'content-length']) {
        const value = res.headers.get(name);
        if (value) reply.header(name, value);
      }
      reply.header('Content-Disposition', attachmentHeader(fileName, assetId, type));
      reply.header('Cache-Control', 'private, no-store');
      reply.header('X-Content-Type-Options', 'nosniff');
      req.log.info({ requesterId: user.id, ownerId, assetId }, 'Origineel gedownload');
      return reply.send(Readable.fromWeb(res.body as WebReadableStream));
    }

    // A published photo is loaded with the key of whoever published it, if the user may see
    // that travel. A traveller can also load photos from their own library (photo picker).
    const source = sources.find((s) => s.userId === user.id) ?? sources[0];
    const client = source ? (immich.tryClient(source.userId) ?? own) : own;
    if (!client) throw notFound('Foto');

    const conditional: Record<string, string> = {};
    const inm = req.headers['if-none-match'];
    const ims = req.headers['if-modified-since'];
    if (typeof inm === 'string') conditional['if-none-match'] = inm;
    if (typeof ims === 'string') conditional['if-modified-since'] = ims;

    const res = await client.media(assetId, size, conditional);
    for (const name of FORWARD_HEADERS) {
      const value = res.headers.get(name);
      if (value) reply.header(name, value);
    }
    reply.header('Cache-Control', 'private, max-age=86400');
    reply.header('X-Content-Type-Options', 'nosniff');
    if (res.status === 304 || !res.body) {
      await res.body?.cancel();
      return reply.code(304).send();
    }
    return reply.send(Readable.fromWeb(res.body as WebReadableStream));
  });
}
