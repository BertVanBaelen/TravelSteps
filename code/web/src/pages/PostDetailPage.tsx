import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { PostDetail, PostNeighbour, Travel, UserRef } from '@travelsteps/shared';
import { api, errorMessage } from '../api';
import { useUser } from '../auth/AuthContext';
import { Avatar } from '../components/Avatar';
import { Comments } from '../components/Comments';
import { Alert } from '../components/Field';
import { Gallery } from '../components/Gallery';
import { ChevronRight, CommentIcon, FootprintIcon, PencilIcon } from '../components/icons';
import { LikeButton } from '../components/LikeButton';
import { MapView } from '../components/MapView';
import { Markdown } from '../components/Markdown';
import { ModeIcon } from '../components/ModeIcon';
import { PageActions, usePageTitle } from '../components/PageTitle';
import { SkeletonCards } from '../components/Skeleton';
import { DayBadge, FigureTiles, LikersLine, PlaceLine, useTravelOf } from '../components/Step';
import { useT } from '../i18n';
import { mediaUrl } from '../lib/format';
import { dominantMode, stepDay } from '../lib/travel';

/**
 * A step as a diary page (V3-4): photos, day and title, figures, the story in a reading column,
 * map, likes, the conversation and the steps before and after it. Two panels on wide screens.
 */
export function PostDetailPage() {
  const msg = useT();
  const me = useUser();
  const { id = '' } = useParams();
  const [post, setPost] = useState<PostDetail | null>(null);
  const [likers, setLikers] = useState<UserRef[]>([]);
  const [likeCount, setLikeCount] = useState(0);
  const [commentCount, setCommentCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const travel = useTravelOf(post?.travelId);
  usePageTitle(post?.title ?? (error ? msg.post.notFound : msg.loading), {
    back: post ? `/reizen/${post.travelId}` : '/',
    backLabel: post?.travelName,
  });

  const loadLikers = useCallback(() => {
    api<{ users: UserRef[] }>(`/posts/${id}/likes`)
      .then((r) => setLikers(r.users))
      .catch(() => undefined);
  }, [id]);

  useEffect(() => {
    setPost(null);
    setError(null);
    api<{ post: PostDetail }>(`/posts/${id}`)
      .then((r) => {
        setPost(r.post);
        setLikeCount(r.post.likeCount);
        setCommentCount(r.post.commentCount);
      })
      .catch((err) => setError(errorMessage(err)));
    loadLikers();
  }, [id, loadLikers]);

  const mapPosts = useMemo(
    () => (post ? [{ ...post, coverAssetId: post.photos[0] ?? null }] : []),
    [post],
  );

  if (error && !post) return <Alert kind="error">{error}</Alert>;
  if (!post) return <SkeletonCards count={1} media />;

  const mode = dominantMode(post.segments);
  const authorName = post.author?.displayName ?? msg.blog.deletedUser;

  return (
    <article className="page step-page" aria-labelledby="stap-titel">
      {post.canEdit && (
        <PageActions>
          <Link to={`/posts/${post.id}/bewerken`} className="btn btn-outline">
            <PencilIcon />
            {msg.common.edit}
          </Link>
        </PageActions>
      )}
      <div className="step-layout">
        <div className="step-col">
          {post.photos.length > 0 && (
            <div className="step-photos">
              <Gallery
                photos={post.photos}
                alt={post.title}
                canDownload={post.canDownloadOriginal}
                thumbnails
              />
            </div>
          )}
          <header className="step-head">
            <div className="step-card-meta">
              <DayBadge travel={travel} date={post.date} time />
              <span className="step-author">
                <Avatar user={post.author} size="xs" />
                <span>{msg.post.by(authorName)}</span>
              </span>
            </div>
            <h1 id="stap-titel" className="step-page-title">
              {post.title}
            </h1>
            <PlaceLine locations={post.locations} />
          </header>
          {post.body && (
            <section className="card story" aria-label={msg.post.story}>
              <Markdown>{post.body}</Markdown>
            </section>
          )}
          <div className="step-comments">
            <Comments
              postId={post.id}
              authorName={post.author && post.author.id !== me.id ? authorName : null}
              onCountChange={setCommentCount}
            />
          </div>
        </div>
        <div className="step-col step-facts">
          <div className="step-figures">
            <FigureTiles stats={post.stats} segments={post.segments} headingId="cijfers" />
          </div>
          {post.locations.length > 0 && (
            <figure className="card step-map-card">
              <MapView posts={mapPosts} arrivals className="detail-map" />
              <figcaption>
                <span className="step-map-caption">
                  {mode && post.locations.length >= 2 && <ModeIcon mode={mode} />}
                  {msg.post.route(
                    post.locations.length,
                    mode && post.locations.length >= 2 ? msg.routeKinds[mode] : null,
                  )}
                </span>
                <Link to={`/kaart?reis=${post.travelId}&post=${post.id}`} className="text-link">
                  {msg.post.bigMap}
                  <ChevronRight />
                </Link>
              </figcaption>
            </figure>
          )}
          <section className="card step-likes" aria-label={msg.likes.like}>
            <LikersLine likers={likers} likeCount={likeCount} />
            <div className="step-actions">
              <LikeButton
                postId={post.id}
                likeCount={post.likeCount}
                likedByMe={post.likedByMe}
                onChange={(s) => {
                  setLikeCount(s.likeCount);
                  loadLikers();
                }}
                labelled
              />
              <a href="#reageren" className="pill-btn">
                <CommentIcon />
                <span>{msg.comments.reply(commentCount)}</span>
              </a>
            </div>
          </section>
          <Neighbours post={post} travel={travel} />
        </div>
      </div>
    </article>
  );
}

/** "Vorige stap · Dag 2" and "Volgende stap" cards, in the travel's order. */
function Neighbours({ post, travel }: { post: PostDetail; travel: Travel | null }) {
  const msg = useT();
  const n = post.neighbours;
  if (!n || (!n.previous && !n.next)) return null;

  const item = (p: PostNeighbour, kind: 'previous' | 'next') => {
    const day = travel ? stepDay(travel, p.date) : null;
    return (
      <li>
        <Link to={`/post/${p.id}`} className={`neighbour neighbour-${kind}`}>
          {p.coverAssetId ? (
            <img src={mediaUrl(p.coverAssetId, 'thumbnail')} alt="" loading="lazy" />
          ) : (
            <span className="neighbour-thumb" aria-hidden>
              <FootprintIcon />
            </span>
          )}
          <span className="neighbour-text">
            <span>
              {kind === 'previous' ? msg.post.previous : msg.post.next}
              {day !== null && ` · ${msg.context.day(day)}`}
            </span>
            <strong>{p.title}</strong>
          </span>
          {kind === 'next' && <ChevronRight />}
        </Link>
      </li>
    );
  };

  return (
    <nav className="neighbours step-neighbours" aria-labelledby="andere-stappen">
      <h2 id="andere-stappen" className="section-title">
        {msg.post.neighbours}
      </h2>
      <ul>
        {n.previous && item(n.previous, 'previous')}
        {n.next && item(n.next, 'next')}
      </ul>
    </nav>
  );
}
