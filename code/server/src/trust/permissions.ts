import type { Actor } from '../content/store.js';

export interface AuthorRightsDeps {
  canView(actor: Actor, travelId: string): boolean;
  isTrusted(ownerId: string, trustedId: string): boolean;
}

export function canUseAuthorRights(
  deps: AuthorRightsDeps,
  requester: Actor,
  authorId: string | null,
  travelId: string,
): boolean {
  if (requester.role === 'admin') return true;
  if (!authorId) return false;
  if (requester.id === authorId) return true;
  return deps.isTrusted(authorId, requester.id) && deps.canView(requester, travelId);
}
