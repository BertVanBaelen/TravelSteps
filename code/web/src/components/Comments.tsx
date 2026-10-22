import { useCallback, useEffect, useState, type FormEvent } from 'react';
import type { Comment } from '@travelsteps/shared';
import { api, errorMessage } from '../api';
import { useT } from '../i18n';
import { formatDateTime, formatRelative } from '../lib/format';
import { useConfirm } from './ConfirmDialog';
import { Alert } from './Field';
import { Avatar } from './Avatar';
import { CommentSkeleton } from './Skeleton';

import { SendIcon } from './icons';

export function Comments({
  postId,
  onCountChange,
}: {
  postId: string;
  onCountChange?: (n: number) => void;
}) {
  const msg = useT();
  const [comments, setComments] = useState<Comment[] | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
  const confirm = useConfirm();

  const update = useCallback(
    (list: Comment[]) => {
      setComments(list);
      onCountChange?.(list.length);
    },
    [onCountChange],
  );

  useEffect(() => {
    api<{ comments: Comment[] }>(`/posts/${postId}/comments`)
      .then((r) => update(r.comments))
      .catch((err) => setError(errorMessage(err)));
  }, [postId, update]);

  async function add(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ comment: Comment }>(`/posts/${postId}/comments`, {
        method: 'POST',
        body: { text },
      });
      update([...(comments ?? []), r.comment]);
      setText('');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function saveEdit(e: FormEvent) {
    e.preventDefault();
    if (!editing) return;
    setError(null);
    try {
      const r = await api<{ comment: Comment }>(`/comments/${editing.id}`, {
        method: 'PATCH',
        body: { text: editing.text },
      });
      update((comments ?? []).map((c) => (c.id === r.comment.id ? r.comment : c)));
      setEditing(null);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function remove(c: Comment) {
    if (
      !(await confirm({
        title: msg.comments.deleteTitle,
        message: msg.comments.confirmDelete,
        confirmLabel: msg.common.delete,
        danger: true,
      }))
    )
      return;
    setError(null);
    try {
      await api(`/comments/${c.id}`, { method: 'DELETE' });
      update((comments ?? []).filter((x) => x.id !== c.id));
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <section className="card stack" id="reacties">
      <h2>{msg.comments.title}</h2>
      {error && <Alert kind="error">{error}</Alert>}
      {comments === null && !error && <CommentSkeleton />}
      {comments?.length === 0 && <p className="muted">{msg.comments.empty}</p>}
      {comments && comments.length > 0 && (
        <ul className="comment-list">
          {comments.map((c) => (
            <li key={c.id} className="comment">
              <Avatar user={c.author} size="s" />
              <div className="comment-body">
                <div className="comment-head">
                  <strong>{c.author.displayName}</strong>
                  <time
                    className="muted"
                    dateTime={c.createdAt}
                    title={formatDateTime(c.createdAt)}
                  >
                    {formatRelative(c.createdAt)}
                    {c.updatedAt !== c.createdAt && ` · ${msg.post.edited}`}
                  </time>
                </div>
                {editing?.id === c.id ? (
                  <form className="stack" onSubmit={saveEdit}>
                    <textarea
                      value={editing.text}
                      maxLength={2000}
                      rows={3}
                      onChange={(e) => setEditing({ id: c.id, text: e.target.value })}
                      aria-label={msg.common.edit}
                    />
                    <div className="row-actions">
                      <button className="btn btn-small btn-primary" type="submit">
                        {msg.common.save}
                      </button>
                      <button
                        className="btn btn-small"
                        type="button"
                        onClick={() => setEditing(null)}
                      >
                        {msg.common.cancel}
                      </button>
                    </div>
                  </form>
                ) : (
                  <p className="comment-text">{c.text}</p>
                )}
                {editing?.id !== c.id && (c.canEdit || c.canDelete) && (
                  <div className="row-actions">
                    {c.canEdit && (
                      <button
                        type="button"
                        className="btn-text"
                        onClick={() => setEditing({ id: c.id, text: c.text })}
                      >
                        {msg.common.edit}
                      </button>
                    )}
                    {c.canDelete && (
                      <button
                        type="button"
                        className="btn-text btn-danger"
                        onClick={() => void remove(c)}
                      >
                        {msg.common.delete}
                      </button>
                    )}
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      <form className="comment-form" onSubmit={add}>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={msg.comments.placeholder}
          aria-label={msg.comments.placeholder}
          maxLength={2000}
          rows={2}
          required
        />
        <button className="btn btn-primary" type="submit" disabled={busy || !text.trim()}>
          <SendIcon />
          {msg.comments.send}
        </button>
      </form>
    </section>
  );
}
