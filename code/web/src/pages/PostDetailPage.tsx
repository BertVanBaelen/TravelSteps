import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { PostDetail, UserRef } from '@travelsteps/shared';
import { api, errorMessage } from '../api';
import { useUser } from '../auth/AuthContext';
import { Avatar, AvatarStack } from '../components/Avatar';
import { Comments } from '../components/Comments';
import { useConfirm } from '../components/ConfirmDialog';
import { Alert } from '../components/Field';
import { Gallery } from '../components/Gallery';
import { LikeButton } from '../components/LikeButton';
import { MapView } from '../components/MapView';
import { Markdown } from '../components/Markdown';
import { usePageTitle } from '../components/PageTitle';
import { StatsView } from '../components/StatsView';
import { FabMenu } from '../components/Fab';
import { CommentIcon, PencilIcon, TrashIcon } from '../components/icons';
import { SkeletonCards } from '../components/Skeleton';
import { nl } from '../i18n/nl';

import { formatDateTime, formatNumber } from '../lib/format';

export function PostDetailPage() {
  const { id = '' } = useParams();
  const user = useUser();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const [post, setPost] = useState<PostDetail | null>(null);
  const [likers, setLikers] = useState<UserRef[]>([]);
  const [commentCount, setCommentCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  usePageTitle(post?.title ?? (error ? nl.post.notFound : nl.loading), { back: '/' });

  const loadLikers = useCallback(() => {
    api<{ users: UserRef[] }>(`/posts/${id}/likes`)
      .then((r) => setLikers(r.users))
      .catch(() => undefined);
  }, [id]);

  useEffect(() => {
    setPost(null);
    api<{ post: PostDetail }>(`/posts/${id}`)
      .then((r) => {
        setPost(r.post);
        setCommentCount(r.post.commentCount);
      })
      .catch((err) => setError(errorMessage(err)));
    loadLikers();
  }, [id, loadLikers]);

  useEffect(() => {
    if (post && window.location.hash === '#reacties') {
      document.getElementById('reacties')?.scrollIntoView();
    }
  }, [post]);

  const mapPosts = useMemo(
    () => (post ? [{ ...post, coverAssetId: post.photos[0] ?? null }] : []),
    [post],
  );

  async function remove() {
    if (!(await confirm({ title: nl.post.deleteTitle, message: nl.post.confirmDelete, confirmLabel: nl.common.delete, danger: true }))) return;
    try {
      await api(`/posts/${id}`, { method: 'DELETE' });
      navigate('/', { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  if (error && !post) return <Alert kind="error">{error}</Alert>;
  if (!post) return <SkeletonCards count={1} media />;

  const routeKm = post.segments.reduce((sum, s) => sum + (s.distanceKm ?? 0), 0);

  return (
    <article className="page">
      {(post.canEdit || post.canDelete) && (
        <FabMenu
          label={nl.post.actions}
          actions={[
            ...(post.canEdit
              ? [{ icon: <PencilIcon />, label: nl.editor.editTitle, to: `/posts/${post.id}/bewerken` }]
              : []),
            ...(post.canDelete
              ? [{ icon: <TrashIcon />, label: nl.post.delete, onClick: () => void remove(), danger: true }]
              : []),
          ]}
        />
      )}
      {error && <Alert kind="error">{error}</Alert>}
      <div className="card stack">
        <div className="post-meta">
          <span className="post-author">
            <Avatar user={post.author} size="xs" />
            <span>{post.author?.displayName ?? nl.blog.deletedUser}</span>
            <span aria-hidden>·</span>
            <Link to={`/reizen/${post.travelId}`} className="post-travel">
              {post.travelName}
            </Link>
          </span>
          <time dateTime={post.date}>{formatDateTime(post.date)}</time>
        </div>
        <Gallery photos={post.photos} alt={post.title} allowOriginal={post.authorId === user.id} />
        <StatsView stats={post.stats} />
        {post.body && <Markdown>{post.body}</Markdown>}
        {post.locations.length > 0 && (
          <div className="stack-tight">
            <MapView posts={mapPosts} arrivals className="detail-map" />
            <p className="muted map-caption">
              {post.locations
                .map((l) => l.name)
                .filter(Boolean)
                .join(' → ')}
              {routeKm > 0 && ` · ${formatNumber(routeKm)} km`}
            </p>
          </div>
        )}
        <footer className="post-actions">
          <LikeButton
            postId={post.id}
            likeCount={post.likeCount}
            likedByMe={post.likedByMe}
            onChange={loadLikers}
          />
          <a href="#reacties" className="action-btn" aria-label={nl.comments.title}>
            <CommentIcon />
            <span>{commentCount}</span>
          </a>
        </footer>
        {likers.length > 0 && (
          <p className="muted likers">
            <AvatarStack users={likers} />
            {nl.likes.likedBy(
              likers.map((u) => (u.id === user.id ? nl.likes.you : u.displayName)),
              0,
            )}
          </p>
        )}
      </div>
      <Comments postId={post.id} onCountChange={setCommentCount} />
    </article>
  );
}
