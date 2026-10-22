import type { FastifyInstance } from 'fastify';
import {
  createUserSchema,
  deleteUserSchema,
  immichKeySchema,
  isTraveller,
  resetPasswordSchema,
  updateUserSchema,
  type AdminUser,
  type DirectoryUser,
} from '@travelsteps/shared';
import { HttpError, notFound } from '../errors.js';
import { hashPassword } from '../auth/password.js';
import { currentUser, requireAdmin, requireTraveller } from '../auth/guard.js';
import { avatarUrl, toPublicUser, type UserRecord } from '../users/repository.js';
import type { AppContext } from '../context.js';
import { removeAvatarFile, verifyImmichKey } from './profile.js';

type IdParams = { Params: { id: string } };

export function toAdminUser(ctx: AppContext, user: UserRecord): AdminUser {
  const refs = ctx.users.refs();
  return {
    ...toPublicUser(user),
    ownedTravels: ctx.content.ownedTravels(user.id).map((t) => ({
      id: t.id,
      name: t.name,
      members: [...ctx.content.members(t.id)]
        .filter(([id, m]) => m.status === 'accepted' && refs.has(id))
        .map(([id]) => ({ id, displayName: refs.get(id)!.displayName })),
    })),
  };
}

export async function userRoutes(app: FastifyInstance): Promise<void> {
  const ctx = app.ctx;
  app.addHook('preHandler', requireAdmin);

  const getTarget = (id: string): UserRecord => {
    const user = ctx.users.findById(id);
    if (!user) throw notFound('Gebruiker');
    return user;
  };

  const assertNotAdmin = (user: UserRecord, message: string) => {
    if (user.role === 'admin') throw new HttpError(400, 'ADMIN_PROTECTED', message);
  };

  app.get('/', async () => ({ users: ctx.users.list().map((u) => toAdminUser(ctx, u)) }));

  app.post('/', async (req, reply) => {
    const body = createUserSchema.parse(req.body);
    if (ctx.users.findByUsername(body.username)) {
      throw new HttpError(409, 'USERNAME_TAKEN', 'Deze gebruikersnaam is al in gebruik.');
    }
    const user = ctx.users.create({
      username: body.username,
      displayName: body.displayName,
      passwordHash: await hashPassword(body.temporaryPassword),
      role: body.role,
      mustChangePassword: true,
    });
    req.log.info({ userId: user.id, by: currentUser(req).id }, 'Gebruiker aangemaakt');
    return reply.code(201).send({ user: toAdminUser(ctx, user) });
  });

  app.patch<IdParams>('/:id', async (req) => {
    const target = getTarget(req.params.id);
    const body = updateUserSchema.parse(req.body);
    if (body.disabled !== undefined) {
      assertNotAdmin(target, 'De beheerder kan niet worden uitgeschakeld.');
    }
    if (body.role !== undefined) {
      assertNotAdmin(target, 'De rol van de beheerder kan niet worden gewijzigd.');
    }
    const updated = ctx.users.update(target.id, body);
    if (body.disabled) ctx.sessions.revokeAllForUser(target.id);
    return { user: toAdminUser(ctx, updated) };
  });

  /** Sets or removes a traveller's personal Immich key. */
  app.put<IdParams>('/:id/immich-key', async (req) => {
    const target = getTarget(req.params.id);
    if (!isTraveller(target.role)) {
      throw new HttpError(400, 'NOT_TRAVELLER', 'Alleen reizigers hebben een Immich-sleutel.');
    }
    const { apiKey } = immichKeySchema.parse(req.body);
    if (apiKey) await verifyImmichKey(ctx, apiKey);
    ctx.immich.setKey(target.id, apiKey);
    req.log.info({ userId: target.id, by: currentUser(req).id }, 'Immich-sleutel gewijzigd');
    return { user: toAdminUser(ctx, getTarget(target.id)) };
  });

  app.post<IdParams>('/:id/reset-password', async (req) => {
    const target = getTarget(req.params.id);
    assertNotAdmin(
      target,
      'Het wachtwoord van de beheerder kan alleen via het profiel worden gewijzigd.',
    );
    const body = resetPasswordSchema.parse(req.body);
    const updated = ctx.users.update(target.id, {
      passwordHash: await hashPassword(body.temporaryPassword),
      mustChangePassword: true,
    });
    ctx.sessions.revokeAllForUser(target.id);
    req.log.info({ userId: target.id, by: currentUser(req).id }, 'Wachtwoord gereset');
    return { user: toPublicUser(updated) };
  });

  /**
   * Deletes a user. Travels they own are deleted (with all posts), transferred to a new owner
   * per travel, or – mode 'disable' – the user is only disabled and everything stays.
   */
  app.delete<IdParams>('/:id', async (req, reply) => {
    const target = getTarget(req.params.id);
    assertNotAdmin(target, 'De beheerder kan niet worden verwijderd.');
    const { mode, transfers } = deleteUserSchema.parse(req.body ?? {});
    const owned = ctx.content.ownedTravels(target.id);
    const by = currentUser(req).id;

    if (owned.length > 0 && mode === 'disable') {
      const updated = ctx.users.update(target.id, { disabled: true });
      ctx.sessions.revokeAllForUser(target.id);
      req.log.info({ userId: target.id, by }, 'Gebruiker uitgeschakeld in plaats van verwijderd');
      return reply.code(200).send({ user: toAdminUser(ctx, updated) });
    }

    if (owned.length > 0 && mode === 'transfer') {
      // Validate everything first, so nothing changes when one transfer is invalid.
      for (const travel of owned) {
        const targetId = transfers[travel.id];
        if (!targetId) continue;
        const newOwner = ctx.users.findById(targetId);
        if (
          !newOwner ||
          newOwner.id === target.id ||
          newOwner.disabled ||
          !isTraveller(newOwner.role)
        ) {
          throw new HttpError(
            400,
            'INVALID_TRANSFER',
            `Kies een reiziger als nieuwe eigenaar van "${travel.name}".`,
          );
        }
      }
      // Travels without a new owner are deleted (the admin chose "verwijderen" for them).
      for (const travel of owned) {
        const targetId = transfers[travel.id];
        if (targetId) ctx.content.transferTravel(travel.id, targetId);
        else ctx.content.deleteTravel(travel.id, { withPosts: true });
      }
    } else {
      for (const travel of owned) ctx.content.deleteTravel(travel.id, { withPosts: true });
    }

    ctx.users.delete(target.id);
    removeAvatarFile(ctx, target.avatar);
    // Memberships, viewer rights and post authorship changed through the database cascades.
    ctx.content.load();
    req.log.info({ userId: target.id, by, mode, travels: owned.length }, 'Gebruiker verwijderd');
    return reply.code(204).send();
  });
}

/** Everyone a traveller can add as co-author or viewer of a travel. */
export async function directoryRoutes(app: FastifyInstance): Promise<void> {
  const { users } = app.ctx;
  app.addHook('preHandler', requireTraveller);

  app.get('/', async (): Promise<{ users: DirectoryUser[] }> => ({
    users: users
      .list()
      .filter((u) => !u.disabled)
      .map((u) => ({
        id: u.id,
        displayName: u.displayName,
        avatarUrl: avatarUrl(u.id, u.avatar),
        role: u.role,
      })),
  }));
}
