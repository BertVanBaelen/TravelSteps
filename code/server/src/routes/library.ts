import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { LibraryPhoto } from '@travelsteps/shared';
import { currentUser } from '../auth/guard.js';

const querySchema = z.object({ traveller: z.string().uuid().optional() });

/** Fotobibliotheek: every visible photo used in a post (newest post first, photo order kept). */
export async function libraryRoutes(app: FastifyInstance): Promise<void> {
  const ctx = app.ctx;
  const { content } = ctx;

  app.get('/', async (req): Promise<{ photos: LibraryPhoto[] }> => {
    const me = currentUser(req);
    const { traveller } = querySchema.parse(req.query);
    const ids = content.visibleTravelIds(me, traveller);
    const names = new Map(content.listTravels(ids).map((t) => [t.id, t.name]));
    return {
      photos: content.listPosts(ids).flatMap((p) => {
        const canDownloadOriginal = ctx.canUseAuthorRights(me, p.authorId, p.travelId);
        return p.photos.map((assetId) => ({
          assetId,
          postId: p.id,
          postTitle: p.title,
          authorId: p.authorId,
          canDownloadOriginal,
          date: p.date,
          travelId: p.travelId,
          travelName: names.get(p.travelId) ?? '',
        }));
      }),
    };
  });
}
