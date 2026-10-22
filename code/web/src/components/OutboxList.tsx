import { Link } from 'react-router-dom';
import { useT } from '../i18n';
import { db, useLiveQuery, useOnline, type Draft, type OutboxItem } from '../offline/db';
import { discardItem, keepMine, retryItem } from '../offline/sync';
import { formatRelative } from '../lib/format';
import { useConfirm } from './ConfirmDialog';
import { PencilIcon, RefreshIcon } from './icons';

type Row = { kind: 'draft'; item: Draft } | { kind: 'outbox'; item: OutboxItem };

function editLink(id: string, isNew: boolean): string {
  return isNew ? `/posts/nieuw?concept=${id}` : `/posts/${id}/bewerken`;
}

/** Local drafts and posts waiting to be published (admin only). */
export function OutboxList() {
  const msg = useT();
  const online = useOnline();
  const confirm = useConfirm();
  const rows = useLiveQuery<Row[]>(async () => {
    const [drafts, outbox] = await Promise.all([
      db.drafts.orderBy('savedAt').reverse().toArray(),
      db.outbox.orderBy('queuedAt').toArray(),
    ]);
    return [
      ...outbox.map((item) => ({ kind: 'outbox' as const, item })),
      ...drafts.map((item) => ({ kind: 'draft' as const, item })),
    ];
  }, []);

  if (!rows || rows.length === 0) return null;

  return (
    <section className="card stack outbox" aria-label={msg.sync.title}>
      <h2>{msg.sync.title}</h2>
      <ul className="outbox-list">
        {rows.map((row) => {
          const { item } = row;
          const title = item.input.title || msg.sync.untitled;
          const status =
            row.kind === 'draft'
              ? 'draft'
              : row.item.status === 'pending'
                ? 'pending'
                : row.item.status;
          return (
            <li key={`${row.kind}-${item.id}`}>
              <div className="outbox-head">
                <strong>{title}</strong>
                <span className={`badge badge-${status}`}>{msg.sync.status[status]}</span>
              </div>
              <span className="muted">
                {formatRelative(
                  new Date(
                    row.kind === 'draft' ? row.item.savedAt : row.item.queuedAt,
                  ).toISOString(),
                )}
                {status === 'pending' && online && ` · ${msg.sync.sending}`}
              </span>
              {row.kind === 'outbox' && row.item.error && (
                <span className="outbox-error">{row.item.error}</span>
              )}
              <div className="row-actions">
                {status === 'conflict' ? (
                  <>
                    <span className="muted">{msg.sync.conflict}</span>
                    <button
                      type="button"
                      className="btn btn-small btn-primary"
                      onClick={() => void keepMine(item.id)}
                    >
                      {msg.sync.keepMine}
                    </button>
                    <button
                      type="button"
                      className="btn btn-small"
                      onClick={() => {
                        void confirm({
                          title: msg.sync.takeServerTitle,
                          message: msg.sync.confirmTakeServer,
                        }).then((ok) => {
                          if (ok) void discardItem(item.id);
                        });
                      }}
                    >
                      {msg.sync.takeServer}
                    </button>
                  </>
                ) : (
                  <>
                    <Link to={editLink(item.id, item.isNew)} className="btn btn-small">
                      <PencilIcon />
                      {msg.common.edit}
                    </Link>
                    {status === 'error' && (
                      <button
                        type="button"
                        className="btn btn-small"
                        onClick={() => void retryItem(item.id)}
                      >
                        <RefreshIcon />
                        {msg.common.retry}
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn btn-small btn-danger"
                      onClick={() => {
                        void confirm({
                          title: msg.sync.discardTitle,
                          message: msg.sync.confirmDiscard,
                          confirmLabel: msg.sync.discard,
                          danger: true,
                        }).then((ok) => {
                          if (ok) void discardItem(item.id);
                        });
                      }}
                    >
                      {msg.sync.discard}
                    </button>
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
