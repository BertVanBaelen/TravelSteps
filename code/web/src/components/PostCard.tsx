import { useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { Comment, PostSummary, UserRef } from '@travelsteps/shared';
import { api, errorMessage } from '../api';
import { useUser } from '../auth/AuthContext';
import { useT } from '../i18n';
import { formatDateTime, formatRelative } from '../lib/format';
import { Avatar, AvatarStack } from './Avatar';
import { Carousel } from './Gallery';
import { CommentIcon } from './icons';
import { LikeButton } from './LikeButton';
import { MapView } from './MapView';
import { StatsView } from './StatsView';

const MAX_LIKERS = 3;

export function PostCard({ post }: { post: PostSummary }) {
  const msg = useT();
  const me = useUser();
  const navigate = useNavigate();
  const link = `/post/${post.id}`;
  const [likers, setLikers] = useState<UserRef[]>(post.likers);
  const [likeCount, setLikeCount] = useState(post.likeCount);
  const [comments, setComments] = useState<Comment[]>(post.latestComments);
  const [commentCount, setCommentCount] = useState(post.commentCount);
  const mapPosts = useMemo(() => [post], [post]);

  function onLike(state: { likeCount: number; likedByMe: boolean }) {
    setLikeCount(state.likeCount);
    setLikers((list) => {
      const others = list.filter((u) => u.id !== me.id);
      return state.likedByMe && others.length < MAX_LIKERS
        ? [...others, { id: me.id, displayName: me.displayName, avatarUrl: me.avatarUrl }]
        : others;
    });
  }

  function onComment(c: Comment) {
    setComments((list) => [...list, c].slice(-2));
    setCommentCount((n) => n + 1);
  }

  return (
    <article className="card post-card">
      <header className="post-meta">
        <span className="post-author">
          <Avatar user={post.author} size="xs" />
          <span>{post.author?.displayName ?? msg.blog.deletedUser}</span>
          <span aria-hidden>·</span>
          <Link to={`/reizen/${post.travelId}`} className="post-travel">
            {post.travelName}
          </Link>
        </span>
        <time dateTime={post.date} title={formatDateTime(post.date)}>
          {formatRelative(post.date)}
        </time>
      </header>
      <Link to={link} className="post-link">
        <h2>{post.title}</h2>
        {post.excerpt && <p className="post-excerpt">{post.excerpt}</p>}
      </Link>
      <StatsView stats={post.stats} compact />
      {post.photos.length > 0 && (
        <Carousel
          photos={post.photos}
          alt={post.title}
          fit="cover"
          onSelect={() => navigate(link)}
        />
      )}
      {post.locations.length > 0 && (
        <Link to={link} className="mini-map-link" aria-label={msg.map.openPost(post.title)}>
          <MapView posts={mapPosts} interactive={false} className="mini-map" />
        </Link>
      )}
      <footer className="post-actions">
        <LikeButton
          postId={post.id}
          likeCount={post.likeCount}
          likedByMe={post.likedByMe}
          onChange={onLike}
        />
        <Link to={`${link}#reacties`} className="action-btn" aria-label={msg.comments.title}>
          <CommentIcon />
          <span>{commentCount}</span>
        </Link>
      </footer>
      {likeCount > 0 && likers.length > 0 && (
        <p className="muted likers">
          <AvatarStack users={likers} />
          {msg.likes.likedBy(
            likers.map((u) => (u.id === me.id ? msg.likes.you : u.displayName)),
            likeCount - likers.length,
          )}
        </p>
      )}
      {comments.length > 0 && (
        <ul className="card-comments">
          {comments.map((c) => (
            <li key={c.id}>
              <Avatar user={c.author} size="xs" />
              <p>
                <strong>{c.author.displayName}</strong> {c.text}
              </p>
            </li>
          ))}
        </ul>
      )}
      {commentCount > comments.length && (
        <Link to={`${link}#reacties`} className="btn-text all-comments">
          {msg.comments.viewAll(commentCount)}
        </Link>
      )}
      <QuickComment postId={post.id} onAdded={onComment} />
    </article>
  );
}

function QuickComment({ postId, onAdded }: { postId: string; onAdded: (c: Comment) => void }) {
  const msg = useT();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ comment: Comment }>(`/posts/${postId}/comments`, {
        method: 'POST',
        body: { text },
      });
      onAdded(r.comment);
      setText('');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="quick-comment" onSubmit={submit}>
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={msg.comments.placeholder}
        aria-label={msg.comments.placeholder}
        maxLength={2000}
        enterKeyHint="send"
      />
      {text.trim() && (
        <button className="btn-text" type="submit" disabled={busy}>
          {msg.comments.send}
        </button>
      )}
      {error && <span className="quick-comment-error">{error}</span>}
    </form>
  );
}
