import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { AppNotification, NotificationPage } from '@travelsteps/shared';
import { api, errorMessage } from '../api';
import { useUser } from '../auth/AuthContext';
import { useBlog } from '../blog/BlogContext';
import { Avatar } from '../components/Avatar';
import { useCelebrate } from '../components/Celebration';
import { EmptyState } from '../components/EmptyState';
import { Alert } from '../components/Field';
import { BellIcon, CheckIcon, CloseIcon } from '../components/icons';
import { SkeletonCards } from '../components/Skeleton';
import { PageActions, usePageTitle } from '../components/PageTitle';
import { PushToggle } from '../components/PushToggle';
import { messages, useT } from '../i18n';
import { formatDateTime, formatRelative } from '../lib/format';

function text(n: AppNotification): string {
  const actor = n.actor?.displayName ?? messages().blog.deletedUser;
  const title = n.postTitle ?? '';
  const travel = n.travelName ?? '';
  switch (n.type) {
    case 'post':
      return messages().notifications.post(actor, title, travel);
    case 'like':
      return messages().notifications.like(actor, title);
    case 'comment':
      return messages().notifications.comment(actor, title);
    case 'invite':
      return messages().notifications.invite(actor, travel);
  }
}

function link(n: AppNotification): string | null {
  if (n.postId) return n.type === 'comment' ? `/post/${n.postId}#reacties` : `/post/${n.postId}`;
  if (n.travelId) return `/reizen/${n.travelId}`;
  return null;
}

export function NotificationsPage() {
  const msg = useT();
  usePageTitle(msg.notifications.title);
  const me = useUser();
  const navigate = useNavigate();
  const celebrate = useCelebrate();
  const { setUnread, reloadTravellers } = useBlog();
  const [items, setItems] = useState<AppNotification[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  /** Invitations handled on this page (accepted or declined). */
  const [handled, setHandled] = useState<Set<number>>(new Set());

  const load = useCallback(() => {
    api<NotificationPage>('/notifications')
      .then((r) => {
        setItems(r.items);
        setUnread(r.unread);
      })
      .catch((err) => setError(errorMessage(err)));
  }, [setUnread]);

  useEffect(load, [load]);

  async function markRead(id?: number) {
    const r = await api<{ unread: number }>('/notifications/read', {
      method: 'POST',
      body: id ? { id } : {},
    });
    setUnread(r.unread);
    setItems(
      (list) =>
        list?.map((n) => (id === undefined || n.id === id ? { ...n, read: true } : n)) ?? null,
    );
  }

  function open(n: AppNotification) {
    if (!n.read) void markRead(n.id).catch(() => undefined);
    const to = link(n);
    if (to) navigate(to);
  }

  async function answer(n: AppNotification, accept: boolean) {
    if (!n.travelId) return;
    setError(null);
    setNotice(null);
    try {
      if (accept) await api(`/travels/${n.travelId}/invitation/accept`, { method: 'POST' });
      else await api(`/travels/${n.travelId}/members/${me.id}`, { method: 'DELETE' });
      setHandled((s) => new Set(s).add(n.id));
      if (accept) void celebrate('invite');
      setNotice(accept ? msg.notifications.accepted : msg.notifications.declined);
      if (!n.read) await markRead(n.id);
      reloadTravellers();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <section className="page">
      {items?.some((n) => !n.read) && (
        <PageActions>
          <button
            type="button"
            className="btn btn-small"
            onClick={() => void markRead().catch(() => undefined)}
          >
            <CheckIcon />
            {msg.notifications.markAll}
          </button>
        </PageActions>
      )}
      {error && <Alert kind="error">{error}</Alert>}
      {notice && <Alert kind="success">{notice}</Alert>}
      {items === null && !error && <SkeletonCards count={4} />}
      {items?.length === 0 && <EmptyState icon={<BellIcon />} text={msg.notifications.empty} />}
      {items && items.length > 0 && (
        <ul className="notification-list card">
          {items.map((n) => (
            <li key={n.id} className={n.read ? 'notification' : 'notification unread'}>
              <Avatar user={n.actor} size="s" />
              <div className="notification-body">
                <button type="button" className="notification-text" onClick={() => open(n)}>
                  {text(n)}
                  {n.excerpt && (
                    <span
                      className={
                        n.type === 'comment' ? 'notification-excerpt quote' : 'notification-excerpt'
                      }
                    >
                      {n.excerpt}
                    </span>
                  )}
                </button>
                <time className="muted" dateTime={n.createdAt} title={formatDateTime(n.createdAt)}>
                  {formatRelative(n.createdAt)}
                </time>
                {n.type === 'invite' && n.travelId && !handled.has(n.id) && (
                  <div className="row-actions">
                    <button
                      type="button"
                      className="btn btn-small btn-primary"
                      onClick={() => void answer(n, true)}
                    >
                      <CheckIcon />
                      {msg.notifications.accept}
                    </button>
                    <button
                      type="button"
                      className="btn btn-small"
                      onClick={() => void answer(n, false)}
                    >
                      <CloseIcon />
                      {msg.notifications.decline}
                    </button>
                    <Link to={`/reizen/${n.travelId}`} className="btn-text">
                      {n.travelName}
                    </Link>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      <PushToggle />
    </section>
  );
}
