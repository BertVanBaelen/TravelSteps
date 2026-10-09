import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ROUTED_MODES, routePreviewSchema, type RoutePreview } from '@travelsteps/shared';
import { currentUser, requireTraveller } from '../auth/guard.js';
import { PostRouting, sumSegments } from '../routing/posts.js';

const searchQuerySchema = z.object({ q: z.string().trim().min(2).max(200) });
const reverseQuerySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
});

/** Traveller-only helpers for the location editor: route preview and place search (proxied). */
export async function routingRoutes(app: FastifyInstance): Promise<void> {
  const { content, routing } = app.ctx;
  const postRouting = new PostRouting(content, routing);
  app.addHook('preHandler', requireTraveller);

  app.post(
    '/preview',
    { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } },
    async (req): Promise<RoutePreview> => {
      const input = routePreviewSchema.parse(req.body);
      const segments = await routing.segments(input.locations, input.segments);
      const me = currentUser(req);
      const requested = input.travelId ?? content.defaultTravelFor(me.id)?.id;
      // The previous post is only looked up in travels the user may see.
      const travelId = requested && content.canView(me, requested) ? requested : undefined;
      const arrival = travelId
        ? await postRouting.arrival(
            travelId,
            input.date ?? new Date().toISOString(),
            input.postId,
            input.locations,
            input.arrival,
          )
        : null;
      return {
        segments,
        arrival,
        ...sumSegments(segments),
        fallback: [...segments, ...(arrival?.geometry ? [arrival] : [])].some(
          (s) => ROUTED_MODES.includes(s.mode) && s.source !== 'route',
        ),
      };
    },
  );

  app.get(
    '/search',
    { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
    async (req) => ({ results: await routing.search(searchQuerySchema.parse(req.query).q) }),
  );

  app.get(
    '/reverse',
    { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } },
    async (req) => {
      const { lat, lng } = reverseQuerySchema.parse(req.query);
      return { name: await routing.reverse(lat, lng) };
    },
  );
}
