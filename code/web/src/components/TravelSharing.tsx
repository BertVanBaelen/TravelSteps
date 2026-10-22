import { useEffect, useMemo, useState } from 'react';
import type { DirectoryUser, TravelSummary } from '@travelsteps/shared';
import { api, errorMessage } from '../api';
import { useT } from '../i18n';
import { Avatar } from './Avatar';
import { useConfirm } from './ConfirmDialog';
import { Alert, SelectField } from './Field';
import { UserPlusIcon } from './icons';

/** Members (co-authors) and viewers of a travel; only shown to those who may manage it. */
export function TravelSharing({ travel, onChange }: { travel: TravelSummary; onChange: (t: TravelSummary) => void }) {
  const msg = useT();
  const [directory, setDirectory] = useState<DirectoryUser[] | null>(null);
  const [invitee, setInvitee] = useState('');
  const [viewers, setViewers] = useState<Set<string>>(() => new Set(travel.viewerIds));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const confirm = useConfirm();

  useEffect(() => {
    api<{ users: DirectoryUser[] }>('/directory')
      .then((r) => setDirectory(r.users))
      .catch((err) => setError(errorMessage(err)));
  }, []);

  const involved = useMemo(
    () => new Set([travel.owner.id, ...travel.members.map((m) => m.id)]),
    [travel.owner.id, travel.members],
  );
  const candidates = (directory ?? []).filter((u) => u.role !== 'viewer' && !involved.has(u.id));
  /** Admin, owner and members always see the travel. */
  const possibleViewers = (directory ?? []).filter((u) => u.role !== 'admin' && !involved.has(u.id));

  async function run(action: () => Promise<{ travel: TravelSummary }>, success: string | null) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const r = await action();
      onChange(r.travel);
      if (success) setNotice(success);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  function invite() {
    const user = candidates.find((u) => u.id === invitee);
    if (!user) return;
    void run(
      () => api(`/travels/${travel.id}/members`, { method: 'POST', body: { userId: user.id } }),
      msg.sharing.invitedDone(user.displayName),
    ).then(() => setInvitee(''));
  }

  async function removeMember(id: string, name: string) {
    if (!(await confirm({ title: msg.sharing.removeTitle, message: msg.sharing.confirmRemove(name), confirmLabel: msg.common.delete, danger: true }))) return;
    void run(() => api(`/travels/${travel.id}/members/${id}`, { method: 'DELETE' }), null);
  }

  function toggleViewer(id: string, on: boolean) {
    setViewers((s) => {
      const next = new Set(s);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  const visibleViewerIds = possibleViewers.filter((u) => viewers.has(u.id)).map((u) => u.id);
  const viewersChanged =
    visibleViewerIds.length !== travel.viewerIds.filter((id) => possibleViewers.some((u) => u.id === id)).length ||
    visibleViewerIds.some((id) => !travel.viewerIds.includes(id));

  return (
    <>
      <div className="card stack">
        <h2>{msg.sharing.membersTitle}</h2>
        <p className="muted">{msg.sharing.membersHint}</p>
        <ul className="member-list">
          <li>
            <Avatar user={travel.owner} size="xs" />
            <span>{travel.owner.displayName}</span>
            <span className="badge">{msg.sharing.owner}</span>
          </li>
          {travel.members.map((m) => (
            <li key={m.id}>
              <Avatar user={m} size="xs" />
              <span>{m.displayName}</span>
              {m.status === 'invited' && <span className="badge">{msg.sharing.invitedStatus}</span>}
              <button
                type="button"
                className="btn btn-small btn-danger member-remove"
                disabled={busy}
                onClick={() => removeMember(m.id, m.displayName)}
              >
                {msg.sharing.remove(m.displayName)}
              </button>
            </li>
          ))}
        </ul>
        {directory &&
          (candidates.length === 0 ? (
            <p className="muted">{msg.sharing.noCandidates}</p>
          ) : (
            <div className="field-row">
              <SelectField
                label={msg.sharing.invite}
                name="invitee"
                value={invitee}
                onChange={setInvitee}
                options={[
                  {
                    id: '',
                    label: msg.sharing.choose,
                    icon: (
                      <span className="picker-icon picker-icon-muted">
                        <UserPlusIcon />
                      </span>
                    ),
                  },
                  ...candidates.map((u) => ({ id: u.id, label: u.displayName, icon: <Avatar user={u} size="s" /> })),
                ]}
              />
              <button type="button" className="btn btn-secondary" disabled={busy || !invitee} onClick={invite}>
                <UserPlusIcon />
                {msg.sharing.invite}
              </button>
            </div>
          ))}
      </div>

      <div className="card stack">
        <h2>{msg.sharing.viewersTitle}</h2>
        <p className="muted">{msg.sharing.viewersHint}</p>
        {possibleViewers.length > 0 && (
          <>
            <div className="row-actions">
              <button
                type="button"
                className="btn btn-small"
                onClick={() => setViewers(new Set(possibleViewers.map((u) => u.id)))}
              >
                {msg.sharing.all}
              </button>
              <button type="button" className="btn btn-small" onClick={() => setViewers(new Set())}>
                {msg.sharing.none}
              </button>
            </div>
            <ul className="check-list">
              {possibleViewers.map((u) => (
                <li key={u.id}>
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={viewers.has(u.id)}
                      onChange={(e) => toggleViewer(u.id, e.target.checked)}
                    />
                    <Avatar user={u} size="xs" />
                    <span>{u.displayName}</span>
                  </label>
                </li>
              ))}
            </ul>
            <button
              type="button"
              className="btn btn-secondary align-start"
              disabled={busy || !viewersChanged}
              onClick={() =>
                void run(
                  () => api(`/travels/${travel.id}/viewers`, { method: 'PUT', body: { userIds: visibleViewerIds } }),
                  msg.sharing.viewersSaved,
                )
              }
            >
              {msg.sharing.saveViewers}
            </button>
          </>
        )}
      </div>
      {error && <Alert kind="error">{error}</Alert>}
      {notice && <Alert kind="success">{notice}</Alert>}
    </>
  );
}
