import { Readable } from 'node:stream';
import type { ReadableStream as WebReadableStream } from 'node:stream/web';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { assetIdSchema, isTraveller, type MediaSize } from '@travelsteps/shared';
import { currentUser, requireTraveller } from '../auth/guard.js';
import { notFound } from '../errors.js';
import type { ImmichClient } from '../immich/client.js';

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

/** Image proxy: the browser never talks to Immich directly. */
export async function mediaRoutes(app: FastifyInstance): Promise<void> {
  const { immich, content } = app.ctx;

  app.get<{ Params: { assetId: string; size: string } }>('/:assetId/:size', async (req, reply) => {
    const parsed = assetIdSchema.safeParse(req.params.assetId);
    const size = req.params.size as MediaSize;
    if (!parsed.success || !MEDIA_SIZES.includes(size)) throw notFound('Foto');
    const assetId = parsed.data;
    const user = currentUser(req);
    const own = isTraveller(user.role) ? immich.tryClient(user.id) : null;

    // A published photo is loaded with the key of whoever published it, if the user may see
    // that travel. A traveller can also load photos from their own library (photo picker).
    // The original file (full EXIF/GPS metadata) only ever comes from the user's own library.
    let client: ImmichClient | null = null;
    if (size === 'original') {
      client = own;
    } else {
      const sources = content
        .assetSources(assetId)
        .filter((s) => s.userId && content.canView(user, s.travelId));
      const source = sources.find((s) => s.userId === user.id) ?? sources[0];
      client = source ? (immich.tryClient(source.userId) ?? own) : own;
    }
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
