import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  isTraveller,
  travelMemberInputSchema,
  travelViewersInputSchema,
  type TravelInput,
} from '@travelsteps/shared';
import { currentUser, requireTraveller } from '../auth/guard.js';
import { HttpError, forbidden, notFound } from '../errors.js';
import { toTravelSummary } from '../content/dto.js';
import type { Actor } from '../content/store.js';

type IdParams = { Params: { id: string } };
type MemberParams = { Params: { id: string; userId: string } };

const listQuerySchema = z.object({ traveller: z.string().uuid().optional() });

export async function travelRoutes(app: FastifyInstance): Promise<void> {
  const ctx = app.ctx;
  const { content, users, notifications } = ctx;
  const traveller = { preHandler: requireTraveller };

  /** The travel, if the current user may see it (otherwise 404, so IDs don't leak). */
  const visibleTravel = (id: string, actor: Actor) => {
    const travel = content.getTravel(id);
    if (!travel || !content.canView(actor, id)) throw notFound('Reis');
    return travel;
  };

  const managedTravel = (id: string, req: Parameters<typeof currentUser>[0]) => {
    const me = currentUser(req);
    const travel = visibleTravel(id, me);
    if (!content.canManage(me, id)) throw forbidden();
    return travel;
  };

  app.get('/', async (req) => {
    const me = currentUser(req);
    const q = listQuerySchema.parse(req.query);
    const refs = users.refs();
    return {
      travels: content
        .listTravels(content.visibleTravelIds(me, q.traveller))
        .map((t) => toTravelSummary(ctx, t, me, refs)),
    };
  });

  app.get<IdParams>('/:id', async (req) => {
    const me = currentUser(req);
    return { travel: toTravelSummary(ctx, visibleTravel(req.params.id, me), me) };
  });

  app.post('/', traveller, async (req, reply) => {
    const me = currentUser(req);
    const travel = content.createTravel(req.body as TravelInput, me.id);
    req.log.info({ travelId: travel.id }, 'Reis aangemaakt');
    return reply.code(201).send({ travel: toTravelSummary(ctx, travel, me) });
  });

  app.put<IdParams>('/:id', async (req) => {
    const me = currentUser(req);
    managedTravel(req.params.id, req);
    const travel = content.updateTravel(req.params.id, req.body as TravelInput);
    return { travel: toTravelSummary(ctx, travel, me) };
  });

  app.delete<IdParams>('/:id', async (req, reply) => {
    managedTravel(req.params.id, req);
    content.deleteTravel(req.params.id);
    req.log.info({ travelId: req.params.id }, 'Reis verwijderd');
    return reply.code(204).send();
  });

  // ---------- Members ----------

  /** Invites a traveller as co-author; they get a notification to accept. */
  app.post<IdParams>('/:id/members', async (req, reply) => {
    const me = currentUser(req);
    const travel = managedTravel(req.params.id, req);
    const { userId } = travelMemberInputSchema.parse(req.body);
    const invitee = users.findById(userId);
    if (!invitee || invitee.disabled) throw notFound('Gebruiker');
    if (!isTraveller(invitee.role)) {
      throw new HttpError(400, 'NOT_TRAVELLER', 'Alleen reizigers kunnen meeschrijven.');
    }
    if (content.invite(travel.id, invitee.id, me.id)) {
      notifications.notify([invitee.id], { type: 'invite', actorId: me.id, travelId: travel.id });
    }
    return reply.code(201).send({ travel: toTravelSummary(ctx, travel, me) });
  });

  /** Removes a member (manager) or leaves / declines (the member themselves). */
  app.delete<MemberParams>('/:id/members/:userId', async (req) => {
    const me = currentUser(req);
    const travel = visibleTravel(req.params.id, me);
    if (req.params.userId !== me.id && !content.canManage(me, travel.id)) throw forbidden();
    content.removeMember(travel.id, req.params.userId);
    return content.canView(me, travel.id)
      ? { travel: toTravelSummary(ctx, travel, me) }
      : { travel: null };
  });

  app.post<IdParams>('/:id/invitation/accept', async (req) => {
    const me = currentUser(req);
    const travel = visibleTravel(req.params.id, me);
    if (!isTraveller(me.role)) throw forbidden();
    content.acceptInvitation(travel.id, me.id);
    return { travel: toTravelSummary(ctx, travel, me) };
  });

  // ---------- Viewers ----------

  app.put<IdParams>('/:id/viewers', async (req) => {
    const me = currentUser(req);
    const travel = managedTravel(req.params.id, req);
    const { userIds } = travelViewersInputSchema.parse(req.body);
    const known = userIds.filter((id) => users.findById(id));
    content.setViewers(travel.id, known);
    return { travel: toTravelSummary(ctx, travel, me) };
  });
}
