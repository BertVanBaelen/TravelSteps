import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { PASSWORD_MIN_LENGTH, isTraveller, type AdminUser, type Role } from '@travelsteps/shared';
import { useUser } from '../auth/AuthContext';
import { api, errorMessage } from '../api';
import { useConfirm } from '../components/ConfirmDialog';
import { Alert, Field, SelectField } from '../components/Field';
import { usePageTitle } from '../components/PageTitle';
import { nl } from '../i18n/nl';

/** Readable temporary password without ambiguous characters. */
function generatePassword(length = 14): string {
  const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const values = crypto.getRandomValues(new Uint32Array(length));
  return Array.from(values, (v) => chars[v % chars.length]).join('');
}

type AssignableRole = Exclude<Role, 'admin'>;
const ASSIGNABLE: AssignableRole[] = ['traveller', 'viewer'];

/** Value of the per-travel choice: 'delete' or the id of the new owner. */
const DELETE = 'delete';

function DeleteUserDialog({
  user,
  onCancel,
  onDone,
}: {
  user: AdminUser;
  onCancel: () => void;
  onDone: (notice: string | null) => void;
}) {
  const [mode, setMode] = useState<'travels' | 'disable'>('travels');
  const [choice, setChoice] = useState<Record<string, string>>(() =>
    Object.fromEntries(user.ownedTravels.map((t) => [t.id, DELETE])),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === 'disable') {
        await api(`/users/${user.id}`, { method: 'DELETE', body: { mode: 'disable' } });
        onDone(nl.users.disabledInstead(user.displayName));
        return;
      }
      const transfers = Object.fromEntries(Object.entries(choice).filter(([, v]) => v !== DELETE));
      const body = Object.keys(transfers).length > 0 ? { mode: 'transfer', transfers } : { mode: 'delete' };
      await api(`/users/${user.id}`, { method: 'DELETE', body });
      onDone(null);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <div className="dialog-backdrop" onClick={onCancel}>
      <form
        className="dialog card stack"
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-user-title"
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
      >
        <h2 id="delete-user-title">{nl.users.deleteTitle(user.displayName)}</h2>
        <p>{nl.users.deleteIntro(user.displayName, user.ownedTravels.length)}</p>
        <label className="check">
          <input type="radio" name="mode" checked={mode === 'travels'} onChange={() => setMode('travels')} />
          <span>{nl.users.modeTravels}</span>
        </label>
        {mode === 'travels' && (
          <ul className="transfer-list">
            {user.ownedTravels.map((t) => (
              <li key={t.id}>
                <SelectField
                  label={t.name}
                  name={`travel-${t.id}`}
                  value={choice[t.id] ?? DELETE}
                  onChange={(e) => setChoice((c) => ({ ...c, [t.id]: e.target.value }))}
                >
                  <option value={DELETE}>{nl.users.optionDelete}</option>
                  {t.members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {nl.users.optionTransfer(m.displayName)}
                    </option>
                  ))}
                </SelectField>
                {t.members.length === 0 && <p className="muted small">{nl.users.noMembers}</p>}
              </li>
            ))}
          </ul>
        )}
        <label className="check">
          <input type="radio" name="mode" checked={mode === 'disable'} onChange={() => setMode('disable')} />
          <span>{nl.users.modeDisable}</span>
        </label>
        {mode === 'travels' && <p className="muted small">{nl.users.deleteHint}</p>}
        {error && <Alert kind="error">{error}</Alert>}
        <div className="row-actions">
          <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={busy}>
            {nl.common.cancel}
          </button>
          <button type="submit" className="btn btn-danger" disabled={busy}>
            {mode === 'disable' ? nl.users.confirmDisable : nl.users.confirmDelete}
          </button>
        </div>
      </form>
    </div>
  );
}

export function AdminUsersPage() {
  usePageTitle(nl.users.title, { back: '/' });
  const me = useUser();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<AdminUser | null>(null);
  const confirm = useConfirm();

  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [role, setRole] = useState<AssignableRole>('viewer');
  const [temporaryPassword, setTemporaryPassword] = useState(generatePassword);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await api<{ users: AdminUser[] }>('/users');
      setUsers(r.users);
    } catch (err) {
      setError(errorMessage(err));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function run(action: () => Promise<void>) {
    setError(null);
    setNotice(null);
    try {
      await action();
      await load();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function create(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    await run(async () => {
      const r = await api<{ user: AdminUser }>('/users', {
        method: 'POST',
        body: { username, displayName, temporaryPassword, role },
      });
      setNotice(nl.users.created(r.user.displayName, temporaryPassword));
      setUsername('');
      setDisplayName('');
      setRole('viewer');
      setTemporaryPassword(generatePassword());
    });
    setBusy(false);
  }

  const toggleDisabled = (u: AdminUser) =>
    run(async () => {
      await api(`/users/${u.id}`, { method: 'PATCH', body: { disabled: !u.disabled } });
    });

  const changeRole = (u: AdminUser, next: AssignableRole) =>
    run(async () => {
      await api(`/users/${u.id}`, { method: 'PATCH', body: { role: next } });
    });

  const resetPassword = async (u: AdminUser) => {
    if (!(await confirm(nl.users.confirmReset(u.displayName)))) return;
    const pw = generatePassword();
    void run(async () => {
      await api(`/users/${u.id}/reset-password`, {
        method: 'POST',
        body: { temporaryPassword: pw },
      });
      setNotice(nl.users.resetDone(u.displayName, pw));
    });
  };

  const setImmichKey = (u: AdminUser) => {
    const value = window.prompt(nl.users.immichPrompt(u.displayName));
    if (value === null) return;
    void run(async () => {
      await api(`/users/${u.id}/immich-key`, { method: 'PUT', body: { apiKey: value.trim() || null } });
      setNotice(nl.users.immichSaved(u.displayName));
    });
  };

  const remove = async (u: AdminUser) => {
    if (u.ownedTravels.length > 0) {
      setDeleting(u);
      return;
    }
    if (!(await confirm({ message: nl.users.confirmRemove(u.displayName), confirmLabel: nl.common.delete, danger: true }))) {
      return;
    }
    void run(async () => {
      await api(`/users/${u.id}`, { method: 'DELETE', body: { mode: 'delete' } });
    });
  };

  return (
    <section className="page">
      {error && <Alert kind="error">{error}</Alert>}
      {notice && <Alert kind="success">{notice}</Alert>}

      <ul className="user-list">
        {users.map((u) => (
          <li key={u.id} className="card user-item">
            <div className="user-info">
              <strong>
                {u.displayName}
                {u.id === me.id && <span className="muted"> ({nl.users.you})</span>}
              </strong>
              <span className="muted">
                {u.username} · {nl.profile.roles[u.role]}
              </span>
              <span className="badges">
                {u.disabled && <span className="badge badge-off">{nl.users.disabled}</span>}
                {u.mustChangePassword && <span className="badge">{nl.users.mustChange}</span>}
                {isTraveller(u.role) && u.hasImmichKey && <span className="badge">{nl.users.hasKey}</span>}
              </span>
            </div>
            <div className="user-actions">
              {u.role !== 'admin' && (
                <select
                  className="select-small"
                  aria-label={nl.users.role}
                  value={u.role}
                  onChange={(e) => void changeRole(u, e.target.value as AssignableRole)}
                >
                  {ASSIGNABLE.map((r) => (
                    <option key={r} value={r}>
                      {nl.profile.roles[r]}
                    </option>
                  ))}
                </select>
              )}
              {isTraveller(u.role) && (
                <button className="btn btn-small" onClick={() => setImmichKey(u)}>
                  {nl.users.immichKey}
                </button>
              )}
              {u.role !== 'admin' && (
                <>
                  <button className="btn btn-small" onClick={() => void toggleDisabled(u)}>
                    {u.disabled ? nl.users.enable : nl.users.disable}
                  </button>
                  <button className="btn btn-small" onClick={() => void resetPassword(u)}>
                    {nl.users.resetPassword}
                  </button>
                  <button className="btn btn-small btn-danger" onClick={() => void remove(u)}>
                    {nl.users.remove}
                  </button>
                </>
              )}
            </div>
          </li>
        ))}
      </ul>

      <form className="card stack" onSubmit={create}>
        <h2>{nl.users.add}</h2>
        <Field
          label={nl.users.username}
          name="username"
          autoCapitalize="none"
          autoComplete="off"
          required
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
        <Field
          label={nl.users.displayName}
          name="displayName"
          required
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
        />
        <SelectField
          label={nl.users.role}
          name="role"
          value={role}
          onChange={(e) => setRole(e.target.value as AssignableRole)}
        >
          {ASSIGNABLE.map((r) => (
            <option key={r} value={r}>
              {nl.profile.roles[r]}
            </option>
          ))}
        </SelectField>
        <div className="field-row">
          <Field
            label={nl.users.temporaryPassword}
            name="temporaryPassword"
            autoComplete="off"
            minLength={PASSWORD_MIN_LENGTH}
            required
            value={temporaryPassword}
            onChange={(e) => setTemporaryPassword(e.target.value)}
          />
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setTemporaryPassword(generatePassword())}
          >
            {nl.users.generate}
          </button>
        </div>
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {nl.users.create}
        </button>
      </form>

      {deleting && (
        <DeleteUserDialog
          user={deleting}
          onCancel={() => setDeleting(null)}
          onDone={(message) => {
            setDeleting(null);
            void run(async () => {
              if (message) setNotice(message);
            });
          }}
        />
      )}
    </section>
  );
}
