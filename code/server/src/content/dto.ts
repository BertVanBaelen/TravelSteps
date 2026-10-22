import type { Travel, TravelSummary, UserRef } from '@travelsteps/shared';
import type { AppContext } from '../context.js';
import type { Actor, TravelRecord } from './store.js';

const DELETED_USER: UserRef = { id: '', displayName: 'Verwijderde gebruiker', avatarUrl: null };

/** Travel as seen by `actor` (members, permissions; viewer list only for managers). */
export function toTravel(
  ctx: AppContext,
  t: TravelRecord,
  actor: Actor,
  refs: Map<string, UserRef> = ctx.users.refs(),
): Travel {
  const { content } = ctx;
  const canManage = content.canManage(actor, t.id);
  return {
    id: t.id,
    slug: t.slug,
    name: t.name,
    description: t.description,
    startDate: t.startDate,
    endDate: t.endDate,
    coverAssetId: t.coverAssetId,
    owner: refs.get(t.ownerId) ?? DELETED_USER,
    members: [...content.members(t.id)]
      .filter(([id]) => refs.has(id))
      .map(([id, m]) => ({ ...refs.get(id)!, status: m.status })),
    viewerIds: canManage ? [...content.viewers(t.id)] : [],
    myRole: content.roleIn(t.id, actor.id),
    canManage,
    canPost: content.canPost(actor, t.id),
    canDownloadOriginal: Boolean(t.coverAssetId) && ctx.canUseAuthorRights(actor, t.ownerId, t.id),
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
  };
}

export function toTravelSummary(
  ctx: AppContext,
  t: TravelRecord,
  actor: Actor,
  refs?: Map<string, UserRef>,
): TravelSummary {
  return {
    ...toTravel(ctx, t, actor, refs),
    ...ctx.content.postCounts(t.id),
    ...ctx.content.travelStats(t.id),
  };
}
