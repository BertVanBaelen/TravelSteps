import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import type { Comment } from '@travelsteps/shared';
import { api, errorMessage } from '../api';
import { useUser } from '../auth/AuthContext';
import { useT } from '../i18n';
import { formatDateTime, formatShortDateTime } from '../lib/format';
import { useConfirm } from './ConfirmDialog';
import { Alert } from './Field';
import { Avatar } from './Avatar';
import { CommentSkeleton } from './Skeleton';

import { CommentIcon, SendIcon } from './icons';

/**
 * Comments of a step as a conversation (V3-4): others on the left, your own on the right, and a
 * labelled field with a big send button. `#reacties` scrolls to the section, `#reageren` to the
 * field (the timeline's "Reageer" button).
 */
export function Comments({
  postId,
  authorName = null,
  onCountChange,
}: {
  postId: string;
  /** Author of the step, for the field label "Jouw reactie aan Lies" (null = you or unknown). */
  authorName?: string | null;
  onCountChange?: (n: number) => void;
}) {
  const msg = useT();
  const me = useUser();
  const [comments, setComments] = useState<Comment[] | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
  const confirm = useConfirm();
  const section = useRef<HTMLElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const scrolled = useRef(false);
  const fieldId = `reactie-${postId}`;

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

  // Scroll to the comments once they are loaded, so the place no longer moves.
  useEffect(() => {
    if (comments === null || scrolled.current) return;
    scrolled.current = true;
    if (window.location.hash === '#reageren') form.current?.scrollIntoView({ block: 'center' });
    else if (window.location.hash === '#reacties') section.current?.scrollIntoView();
  }, [comments]);

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
    <section className="comments" id="reacties" ref={section} aria-labelledby="reacties-titel">
      <header className="comments-head">
        <span className="comments-icon" aria-hidden>
          <CommentIcon />
        </span>
        <h2 id="reacties-titel">{msg.comments.title}</h2>
        {comments && comments.length > 0 && (
          <span className="count-pill">
            <span className="sr-only">: </span>
            {comments.length}
          </span>
        )}
      </header>
      {error && <Alert kind="error">{error}</Alert>}
      {comments === null && !error && <CommentSkeleton />}
      {comments?.length === 0 && <p className="muted">{msg.comments.empty}</p>}
      {comments && comments.length > 0 && (
        <ul className="comment-list">
          {comments.map((c) => {
            const own = c.author.id === me.id;
            return (
              <li key={c.id} className={`comment${own ? ' comment-own' : ''}`}>
                {!own && <Avatar user={c.author} size="s" />}
                <div className="comment-body">
                  <p className="comment-head">
                    <strong>{own ? msg.comments.you : c.author.displayName}</strong>
                    {' · '}
                    <time dateTime={c.createdAt} title={formatDateTime(c.createdAt)}>
                      {formatShortDateTime(c.createdAt)}
                      {c.updatedAt !== c.createdAt && ` · ${msg.post.edited}`}
                    </time>
                  </p>
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
                    <p className="comment-bubble">{c.text}</p>
                  )}
                  {editing?.id !== c.id && (c.canEdit || c.canDelete) && (
                    <div className="row-actions comment-actions">
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
            );
          })}
        </ul>
      )}
      <form className="comment-form" id="reageren" ref={form} onSubmit={add}>
        <label className="field-label" htmlFor={fieldId}>
          {msg.comments.yourReply(authorName)}
        </label>
        <textarea
          id={fieldId}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={msg.comments.messagePlaceholder}
          maxLength={2000}
          rows={3}
          required
        />
        <button className="btn btn-primary btn-block" type="submit" disabled={busy || !text.trim()}>
          <SendIcon />
          {msg.comments.send}
        </button>
      </form>
    </section>
  );
}
