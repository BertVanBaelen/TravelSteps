import { useCallback, useEffect, useState, type FormEvent } from 'react';
import type { Comment } from '@travelsteps/shared';
import { api, errorMessage } from '../api';
import { nl } from '../i18n/nl';
import { formatDateTime, formatRelative } from '../lib/format';
import { useConfirm } from './ConfirmDialog';
import { Alert } from './Field';
import { Avatar } from './Avatar';

export function Comments({ postId, onCountChange }: { postId: string; onCountChange?: (n: number) => void }) {
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
    if (!(await confirm({ message: nl.comments.confirmDelete, confirmLabel: nl.common.delete, danger: true }))) return;
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
      <h2>{nl.comments.title}</h2>
      {error && <Alert kind="error">{error}</Alert>}
      {comments === null && !error && <p className="muted">{nl.loading}</p>}
      {comments?.length === 0 && <p className="muted">{nl.comments.empty}</p>}
      {comments && comments.length > 0 && (
        <ul className="comment-list">
          {comments.map((c) => (
            <li key={c.id} className="comment">
              <Avatar user={c.author} size="small" />
              <div className="comment-body">
                <div className="comment-head">
                  <strong>{c.author.displayName}</strong>
                  <time className="muted" dateTime={c.createdAt} title={formatDateTime(c.createdAt)}>
                    {formatRelative(c.createdAt)}
                    {c.updatedAt !== c.createdAt && ` · ${nl.post.edited}`}
                  </time>
                </div>
                {editing?.id === c.id ? (
                  <form className="stack" onSubmit={saveEdit}>
                    <textarea
                      value={editing.text}
                      maxLength={2000}
                      rows={3}
                      onChange={(e) => setEditing({ id: c.id, text: e.target.value })}
                      aria-label={nl.common.edit}
                    />
                    <div className="row-actions">
                      <button className="btn btn-small btn-primary" type="submit">
                        {nl.common.save}
                      </button>
                      <button className="btn btn-small" type="button" onClick={() => setEditing(null)}>
                        {nl.common.cancel}
                      </button>
                    </div>
                  </form>
                ) : (
                  <p className="comment-text">{c.text}</p>
                )}
                {editing?.id !== c.id && (c.canEdit || c.canDelete) && (
                  <div className="row-actions">
                    {c.canEdit && (
                      <button type="button" className="btn-text" onClick={() => setEditing({ id: c.id, text: c.text })}>
                        {nl.common.edit}
                      </button>
                    )}
                    {c.canDelete && (
                      <button type="button" className="btn-text btn-danger" onClick={() => void remove(c)}>
                        {nl.common.delete}
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
          placeholder={nl.comments.placeholder}
          aria-label={nl.comments.placeholder}
          maxLength={2000}
          rows={2}
          required
        />
        <button className="btn btn-primary" type="submit" disabled={busy || !text.trim()}>
          {nl.comments.send}
        </button>
      </form>
    </section>
  );
}
