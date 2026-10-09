import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { pushSubscriptionSchema, type Traveller } from '@travelsteps/shared';
import { currentUser } from '../auth/guard.js';
import { notFound } from '../errors.js';

type IdParams = { Params: { id: string } };

/** The blogs (travellers) the user can choose in the header, with their subscription state. */
export async function travellerRoutes(app: FastifyInstance): Promise<void> {
  const { content, users, notifications } = app.ctx;

  app.get('/', async (req): Promise<{ travellers: Traveller[] }> => {
    const me = currentUser(req);
    const subscribed = notifications.subscribedTo(me.id);
    const refs = users.refs();
    const travellers = [...content.visibleTravellerIds(me)]
      .filter((id) => refs.has(id))
      .map((id) => ({
        ...refs.get(id)!,
        subscribed: subscribed.has(id),
        travelCount: content.visibleTravelIds(me, id).size,
      }))
      .sort((a, b) =>
        a.id === me.id ? -1 : b.id === me.id ? 1 : a.displayName.localeCompare(b.displayName, 'nl'),
      );
    return { travellers };
  });

  const visibleTraveller = (id: string, me: ReturnType<typeof currentUser>) => {
    if (!content.visibleTravellerIds(me).has(id)) throw notFound('Reiziger');
    return id;
  };

  app.put<IdParams>('/:id/subscription', async (req) => {
    const me = currentUser(req);
    notifications.subscribe(me.id, visibleTraveller(req.params.id, me));
    return { subscribed: true };
  });

  app.delete<IdParams>('/:id/subscription', async (req) => {
    const me = currentUser(req);
    notifications.unsubscribe(me.id, req.params.id);
    return { subscribed: false };
  });
}

const readSchema = z.object({ id: z.number().int().positive().optional() });

export async function notificationRoutes(app: FastifyInstance): Promise<void> {
  const { notifications } = app.ctx;

  app.get('/', async (req) => notifications.list(currentUser(req).id));

  app.get('/unread', async (req) => ({ unread: notifications.unreadCount(currentUser(req).id) }));

  /** Marks one notification (`{id}`) or all (`{}`) as read. */
  app.post('/read', async (req) => {
    const me = currentUser(req);
    notifications.markRead(me.id, readSchema.parse(req.body ?? {}).id);
    return { unread: notifications.unreadCount(me.id) };
  });
}

const endpointSchema = z.object({ endpoint: z.string().max(1000) });

/** Web Push: public VAPID key and the device subscriptions of the user. */
export async function pushRoutes(app: FastifyInstance): Promise<void> {
  const { notifications } = app.ctx;

  app.get('/key', async () => ({ publicKey: notifications.publicKey }));

  app.post(
    '/subscriptions',
    { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } },
    async (req, reply) => {
      notifications.addPushSubscription(currentUser(req).id, pushSubscriptionSchema.parse(req.body));
      return reply.code(204).send();
    },
  );

  app.delete('/subscriptions', async (req, reply) => {
    const { endpoint } = endpointSchema.parse(req.body);
    notifications.removePushSubscription(currentUser(req).id, endpoint);
    return reply.code(204).send();
  });
}
