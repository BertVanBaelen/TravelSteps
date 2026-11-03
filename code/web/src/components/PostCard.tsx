import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { PostSummary, UserRef } from '@travelsteps/shared';
import { useUser } from '../auth/AuthContext';
import { useT } from '../i18n';
import { formatTime } from '../lib/format';
import { dominantMode } from '../lib/travel';
import { Avatar } from './Avatar';
import { Carousel } from './Gallery';
import { CommentIcon } from './icons';
import { LikeButton } from './LikeButton';
import { MapView } from './MapView';
import { ModeIcon } from './ModeIcon';
import { DayBadge, LikersLine, PlaceLine, StatChips, useTravelOf } from './Step';

const MAX_LIKERS = 3;

/** DOM id of a step card; the desktop map scrolls the feed to it. */
export const cardId = (postId: string) => `stap-${postId}`;

/**
 * Step card (V3-3): photo first, then day, author, title, places, excerpt, figures, a mini map
 * when the step has a route, and labelled Leuk / Reageer buttons.
 */
export function PostCard({
  post,
  showTravel = false,
  active = false,
}: {
  post: PostSummary;
  /** The feed mixes travels: name the travel in the author line. */
  showTravel?: boolean;
  /** The step the desktop map shows. */
  active?: boolean;
}) {
  const msg = useT();
  const me = useUser();
  const navigate = useNavigate();
  const travel = useTravelOf(post.travelId);
  const link = `/post/${post.id}`;
  const [likers, setLikers] = useState<UserRef[]>(post.likers);
  const [likeCount, setLikeCount] = useState(post.likeCount);
  const mapPosts = useMemo(() => [post], [post]);
  const mode = dominantMode(post.segments);
  const titleId = `${cardId(post.id)}-titel`;

  function onLike(state: { likeCount: number; likedByMe: boolean }) {
    setLikeCount(state.likeCount);
    setLikers((list) => {
      const others = list.filter((u) => u.id !== me.id);
      return state.likedByMe && others.length < MAX_LIKERS
        ? [...others, { id: me.id, displayName: me.displayName, avatarUrl: me.avatarUrl }]
        : others;
    });
  }

  return (
    <article
      id={cardId(post.id)}
      className={`step-card${active ? ' is-active' : ''}`}
      aria-labelledby={titleId}
      data-post-id={post.id}
    >
      {post.photos.length > 0 && (
        <Carousel
          photos={post.photos}
          alt={post.title}
          fit="cover"
          indicator="dots"
          onSelect={() => navigate(link)}
        />
      )}
      <div className="step-card-body">
        <div className="step-card-meta">
          <DayBadge travel={travel} date={post.date} />
          <span className="step-author">
            <Avatar user={post.author} size="xs" />
            <span>
              {post.author?.displayName ?? msg.blog.deletedUser} · {formatTime(post.date)}
              {showTravel && (
                <>
                  {' · '}
                  <Link to={`/reizen/${post.travelId}`} className="post-travel">
                    {post.travelName}
                  </Link>
                </>
              )}
            </span>
          </span>
        </div>
        <h2 id={titleId} className="step-title">
          <Link to={link}>{post.title}</Link>
        </h2>
        <PlaceLine locations={post.locations} />
        {post.excerpt && <p className="step-excerpt">{post.excerpt}</p>}
        <StatChips stats={post.stats} segments={post.segments} />
        {post.locations.length >= 2 && (
          <Link to={link} className="step-map" aria-label={msg.map.openPost(post.title)}>
            <MapView posts={mapPosts} interactive={false} className="mini-map" />
            <span className="step-map-caption">
              {mode && <ModeIcon mode={mode} />}
              {msg.post.route(post.locations.length, mode ? msg.routeKinds[mode] : null)}
            </span>
          </Link>
        )}
      </div>
      <footer className="step-card-foot">
        <LikersLine likers={likers} likeCount={likeCount} />
        <div className="step-actions">
          <LikeButton
            postId={post.id}
            likeCount={post.likeCount}
            likedByMe={post.likedByMe}
            onChange={onLike}
            labelled
          />
          <Link to={`${link}#reageren`} className="pill-btn">
            <CommentIcon />
            <span>{msg.comments.reply(post.commentCount)}</span>
          </Link>
        </div>
      </footer>
    </article>
  );
}
