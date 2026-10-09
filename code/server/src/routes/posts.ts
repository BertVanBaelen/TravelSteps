import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  commentInputSchema,
  isTraveller,
  type Comment,
  type FeedPage,
  type MapPost,
  type Post,
  type PostDetail,
  type PostInput,
  type PostPermissions,
  type PostSummary,
  type UserRef,
} from '@travelsteps/shared';
import { currentUser, requireTraveller } from '../auth/guard.js';
import { HttpError, forbidden, notFound } from '../errors.js';
import type { AppContext } from '../context.js';
import type { Actor } from '../content/store.js';
import type { CommentRecord } from '../social/repository.js';
import { PostRouting, liteSegment } from '../routing/posts.js';

type IdParams = { Params: { id: string } };

const FEED_LIKERS = 3;
const FEED_COMMENTS = 2;
/** Geometry tolerance in degrees: ~50 m for mini maps, ~10 m for the map screen. */
const FEED_TOLERANCE = 0.0005;
const MAP_TOLERANCE = 0.0001;

const feedQuerySchema = z.object({
  travelId: z.string().uuid().optional(),
  /** Only this traveller's blog (travels they own or co-write). */
  traveller: z.string().uuid().optional(),
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

const mapQuerySchema = z.object({
  travelId: z.string().uuid().optional(),
  traveller: z.string().uuid().optional(),
});

export { excerpt } from '../content/excerpt.js';
import { excerpt } from '../content/excerpt.js';

const encodeCursor = (p: Post) => Buffer.from(`${p.date}|${p.id}`).toString('base64url');

function decodeCursor(cursor: string): { date: string; id: string } {
  const [date, id] = Buffer.from(cursor, 'base64url').toString('utf8').split('|');
  if (!date || !id) throw new HttpError(400, 'BAD_CURSOR', 'Ongeldige cursor.');
  return { date, id };
}

/** Post permissions: edit by the author; delete by the author or whoever manages the travel. */
export function postPermissions(ctx: AppContext, post: Post, me: Actor): PostPermissions {
  const isAuthor = post.authorId === me.id && isTraveller(me.role);
  return {
    canEdit: isAuthor,
    canDelete: isAuthor || ctx.content.canManage(me, post.travelId),
  };
}

/** Comment as DTO; deletable by its writer, the post author, the travel owner or an admin. */
export function toCommentDto(ctx: AppContext, c: CommentRecord, me: Actor): Comment {
  const post = ctx.content.getPost(c.postId);
  return {
    id: c.id,
    postId: c.postId,
    author: { id: c.userId, displayName: c.authorName, avatarUrl: c.authorAvatarUrl },
    text: c.text,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    canEdit: c.userId === me.id,
    canDelete:
      c.userId === me.id ||
      Boolean(post && (post.authorId === me.id || ctx.content.canManage(me, post.travelId))),
  };
}

export async function postRoutes(app: FastifyInstance): Promise<void> {
  const ctx: AppContext = app.ctx;
  const { content, social, users, notifications } = ctx;
  const traveller = { preHandler: requireTraveller };
  const postRouting = new PostRouting(content, ctx.routing);

  /** The post, if the user may see its travel (otherwise 404). */
  const visiblePost = (id: string, me: Actor): Post => {
    const post = content.getPost(id);
    if (!post || !content.canView(me, post.travelId)) throw notFound('Stap');
    return post;
  };

  const travelName = (id: string) => content.getTravel(id)?.name ?? '';
  const author = (refs: Map<string, UserRef>, id: string | null) =>
    (id && refs.get(id)) || null;

  const toDetail = (post: Post, me: Actor): PostDetail => ({
    ...post,
    ...social.countsFor(post.id, me.id),
    ...postPermissions(ctx, post, me),
    travelName: travelName(post.travelId),
    author: users.ref(post.authorId),
  });

  /** Travels the request asks for, limited to what the user may see. */
  const requestedTravels = (me: Actor, q: { travelId?: string; traveller?: string }) => {
    const ids = content.visibleTravelIds(me, q.traveller);
    if (!q.travelId) return ids;
    return ids.has(q.travelId) ? new Set([q.travelId]) : new Set<string>();
  };

  /** A travel the user may post in: the requested one or their default travel. */
  const postableTravel = (me: Actor, requested: string | undefined): string => {
    const travelId = requested ?? content.defaultTravelFor(me.id)?.id;
    if (!travelId) throw new HttpError(400, 'NO_TRAVEL', 'Maak eerst een reis aan.');
    if (!content.canView(me, travelId)) throw notFound('Reis');
    if (!content.canPost(me, travelId)) {
      throw new HttpError(403, 'FORBIDDEN', 'Je kunt geen stappen plaatsen in deze reis.');
    }
    return travelId;
  };

  app.get('/', async (req): Promise<FeedPage> => {
    const me = currentUser(req);
    const q = feedQuerySchema.parse(req.query);
    let posts = content.listPosts(requestedTravels(me, q));
    if (q.cursor) {
      const c = decodeCursor(q.cursor);
      posts = posts.filter((p) => p.date < c.date || (p.date === c.date && p.id < c.id));
    }
    const page = posts.slice(0, q.limit);
    const ids = page.map((p) => p.id);
    const counts = social.counts(ids, me.id);
    const likers = social.likersFor(ids, FEED_LIKERS);
    const comments = social.latestComments(ids, FEED_COMMENTS);
    const refs = users.refs();
    const items: PostSummary[] = page.map((p) => ({
      id: p.id,
      travelId: p.travelId,
      travelName: travelName(p.travelId),
      author: author(refs, p.authorId),
      title: p.title,
      date: p.date,
      excerpt: excerpt(p.body),
      coverAssetId: p.photos[0] ?? null,
      photoCount: p.photos.length,
      photos: p.photos,
      stats: p.stats,
      locations: p.locations,
      segments: p.segments.map((s) => liteSegment(s, FEED_TOLERANCE)),
      arrival: p.arrival && liteSegment(p.arrival, FEED_TOLERANCE),
      likers: likers.get(p.id)!,
      latestComments: comments.get(p.id)!.map((c) => toCommentDto(ctx, c, me)),
      updatedAt: p.updatedAt,
      ...counts.get(p.id)!,
      ...postPermissions(ctx, p, me),
    }));
    return {
      items,
      nextCursor: posts.length > q.limit ? encodeCursor(page[page.length - 1]!) : null,
    };
  });

  /** All visible posts with locations, for the map screen. */
  app.get('/map', async (req): Promise<{ posts: MapPost[] }> => {
    const me = currentUser(req);
    const q = mapQuerySchema.parse(req.query);
    const refs = users.refs();
    return {
      posts: content
        .listPosts(requestedTravels(me, q))
        .filter((p) => p.locations.length > 0)
        .map((p) => ({
          id: p.id,
          travelId: p.travelId,
          author: author(refs, p.authorId),
          title: p.title,
          date: p.date,
          coverAssetId: p.photos[0] ?? null,
          locations: p.locations,
          segments: p.segments.map((s) => liteSegment(s, MAP_TOLERANCE)),
          arrival: p.arrival && liteSegment(p.arrival, MAP_TOLERANCE),
        })),
    };
  });

  app.get<IdParams>('/:id', async (req) => {
    const me = currentUser(req);
    return { post: toDetail(visiblePost(req.params.id, me), me) };
  });

  app.post('/', traveller, async (req, reply) => {
    const me = currentUser(req);
    // A retried (offline) upload with the same client ID returns the already created post.
    const body = (req.body ?? {}) as { id?: unknown; travelId?: unknown };
    const existing = typeof body.id === 'string' ? content.getPost(body.id) : undefined;
    if (existing) {
      if (existing.authorId !== me.id) throw new HttpError(409, 'POST_EXISTS', 'Deze stap bestaat al.');
      return reply.code(200).send({ post: toDetail(existing, me) });
    }
    const travelId = postableTravel(me, typeof body.travelId === 'string' ? body.travelId : undefined);
    const post = content.createPost(await postRouting.prepare(req.body as PostInput, travelId), me.id);
    await postRouting.refreshArrivals([post.travelId]);
    req.log.info({ postId: post.id }, 'Post aangemaakt');
    notifications.notify(notifications.postRecipients(post.travelId, me.id), {
      type: 'post',
      actorId: me.id,
      travelId: post.travelId,
      postId: post.id,
    });
    return reply.code(201).send({ post: toDetail(post, me) });
  });

  app.put<IdParams>('/:id', traveller, async (req) => {
    const me = currentUser(req);
    const existing = visiblePost(req.params.id, me);
    if (!postPermissions(ctx, existing, me).canEdit) throw forbidden();
    const requested = (req.body as { travelId?: unknown } | null)?.travelId;
    const travelId =
      typeof requested === 'string' && requested !== existing.travelId
        ? postableTravel(me, requested)
        : existing.travelId;
    const oldTravelId = existing.travelId;
    const data = await postRouting.prepare(req.body as PostInput, travelId, existing);
    const post = content.updatePost(req.params.id, data);
    await postRouting.refreshArrivals([oldTravelId, post.travelId]);
    return { post: toDetail(post, me) };
  });

  app.delete<IdParams>('/:id', async (req, reply) => {
    const me = currentUser(req);
    const post = visiblePost(req.params.id, me);
    if (!postPermissions(ctx, post, me).canDelete) throw forbidden();
    content.deletePost(post.id);
    await postRouting.refreshArrivals([post.travelId]);
    req.log.info({ postId: post.id }, 'Post verwijderd');
    return reply.code(204).send();
  });

  // ---------- Likes ----------

  app.put<IdParams>('/:id/like', async (req) => {
    const me = currentUser(req);
    const post = visiblePost(req.params.id, me);
    if (social.like(post.id, me.id) && post.authorId) {
      notifications.notify([post.authorId], {
        type: 'like',
        actorId: me.id,
        travelId: post.travelId,
        postId: post.id,
      });
    }
    const { likeCount, likedByMe } = social.countsFor(post.id, me.id);
    return { likeCount, likedByMe };
  });

  app.delete<IdParams>('/:id/like', async (req) => {
    const me = currentUser(req);
    const post = visiblePost(req.params.id, me);
    social.unlike(post.id, me.id);
    const { likeCount, likedByMe } = social.countsFor(post.id, me.id);
    return { likeCount, likedByMe };
  });

  app.get<IdParams>('/:id/likes', async (req) => ({
    users: social.likers(visiblePost(req.params.id, currentUser(req)).id),
  }));

  // ---------- Comments ----------

  app.get<IdParams>('/:id/comments', async (req) => {
    const me = currentUser(req);
    return {
      comments: social
        .listComments(visiblePost(req.params.id, me).id)
        .map((c) => toCommentDto(ctx, c, me)),
    };
  });

  app.post<IdParams>(
    '/:id/comments',
    { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } },
    async (req, reply) => {
      const me = currentUser(req);
      const post = visiblePost(req.params.id, me);
      const { text } = commentInputSchema.parse(req.body);
      const comment = social.addComment(post.id, me.id, text);
      if (post.authorId) {
        notifications.notify([post.authorId], {
          type: 'comment',
          actorId: me.id,
          travelId: post.travelId,
          postId: post.id,
          commentId: comment.id,
        });
      }
      return reply.code(201).send({ comment: toCommentDto(ctx, comment, me) });
    },
  );
}

export async function commentRoutes(app: FastifyInstance): Promise<void> {
  const ctx: AppContext = app.ctx;
  const { social, content } = ctx;

  const getComment = (id: string, req: FastifyRequest) => {
    const me = currentUser(req);
    const comment = social.getComment(id);
    const post = comment && content.getPost(comment.postId);
    if (!comment || !post || !content.canView(me, post.travelId)) throw notFound('Reactie');
    return comment;
  };

  app.patch<IdParams>('/:id', async (req) => {
    const me = currentUser(req);
    const comment = getComment(req.params.id, req);
    if (comment.userId !== me.id) throw forbidden();
    const { text } = commentInputSchema.parse(req.body);
    return { comment: toCommentDto(ctx, social.updateComment(comment.id, text), me) };
  });

  app.delete<IdParams>('/:id', async (req, reply) => {
    const me = currentUser(req);
    const comment = getComment(req.params.id, req);
    if (!toCommentDto(ctx, comment, me).canDelete) throw forbidden();
    social.deleteComment(comment.id);
    return reply.code(204).send();
  });
}
