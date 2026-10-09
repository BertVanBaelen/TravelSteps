import { useCallback, useEffect, useState, type FormEvent, type ReactElement } from 'react';
import { PASSWORD_MIN_LENGTH, isTraveller, type AdminUser, type Role } from '@travelsteps/shared';
import { useUser } from '../auth/AuthContext';
import { api, errorMessage } from '../api';
import { Avatar } from '../components/Avatar';
import { useConfirm } from '../components/ConfirmDialog';
import { Alert, Field, SelectField } from '../components/Field';
import { usePageTitle } from '../components/PageTitle';
import { nl } from '../i18n/nl';
import { Listbox, type ListboxOption } from '../components/Listbox';
import { CopyButton } from '../components/CopyButton';
import {
  BanIcon,
  CloseIcon,
  KeyIcon,
  PhotoIcon,
  ProfileIcon,
  RefreshIcon,
  SaveIcon,
  TrashIcon,
  TravelIcon,
  UserPlusIcon,
} from '../components/icons';

/** Readable temporary password without ambiguous characters. */
function generatePassword(length = 14): string {
  const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const values = crypto.getRandomValues(new Uint32Array(length));
  return Array.from(values, (v) => chars[v % chars.length]).join('');
}

type AssignableRole = Exclude<Role, 'admin'>;
const ASSIGNABLE: AssignableRole[] = ['traveller', 'viewer'];
const ROLE_ICONS: Record<AssignableRole, ReactElement> = { traveller: <TravelIcon />, viewer: <ProfileIcon /> };
const roleOptions: ListboxOption[] = ASSIGNABLE.map((r) => ({
  id: r,
  label: nl.profile.roles[r],
  meta: nl.users.roleHint[r],
  icon: <span className="picker-icon">{ROLE_ICONS[r]}</span>,
}));

/** Duration of the closing animation (matches `.confirm-dialog.closing`). */
const CLOSE_MS = 180;

/** Modal to set, replace or remove a traveller's Immich API key. */
function ImmichKeyDialog({
  user,
  onClose,
  onSave,
}: {
  user: AdminUser;
  onClose: () => void;
  onSave: (apiKey: string | null) => Promise<void>;
}) {
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);

  const close = useCallback(() => {
    setClosing(true);
    window.setTimeout(onClose, CLOSE_MS);
  }, [onClose]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close]);

  async function save(apiKey: string | null) {
    setBusy(true);
    setError(null);
    try {
      await onSave(apiKey);
      close();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <div className={`dialog-backdrop confirm-backdrop${closing ? ' closing' : ''}`} onClick={close}>
      <form
        className={`dialog dialog-small card confirm-dialog key-dialog${closing ? ' closing' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="key-title"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          if (key.trim()) void save(key.trim());
        }}
      >
        <span className="confirm-icon" aria-hidden>
          <PhotoIcon />
        </span>
        <h2 id="key-title">{nl.users.immichDialogTitle(user.displayName)}</h2>
        <p>{nl.users.immichDialogHint(user.displayName, user.hasImmichKey)}</p>
        <Field
          label={nl.profile.immichKey}
          name="immichKey"
          type="password"
          autoComplete="off"
          spellCheck={false}
          autoFocus
          value={key}
          onChange={(e) => setKey(e.target.value)}
        />
        {error && <Alert kind="error">{error}</Alert>}
        <div className="confirm-actions">
          <button type="button" className="btn btn-secondary" onClick={close}>
            <CloseIcon />
            {nl.common.cancel}
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy || !key.trim()}>
            <SaveIcon />
            {nl.profile.immichSave}
          </button>
        </div>
        {user.hasImmichKey && (
          <button type="button" className="btn-text btn-danger key-remove" disabled={busy} onClick={() => void save(null)}>
            <TrashIcon />
            {nl.profile.immichRemove}
          </button>
        )}
      </form>
    </div>
  );
}

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
                  onChange={(id) => setChoice((c) => ({ ...c, [t.id]: id }))}
                  options={[
                    {
                      id: DELETE,
                      label: nl.users.optionDelete,
                      icon: (
                        <span className="picker-icon picker-icon-danger">
                          <TrashIcon />
                        </span>
                      ),
                    },
                    ...t.members.map((m) => ({
                      id: m.id,
                      label: nl.users.optionTransfer(m.displayName),
                      icon: <Avatar user={{ ...m, avatarUrl: null }} size="s" />,
                    })),
                  ]}
                />
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
  const [keyUser, setKeyUser] = useState<AdminUser | null>(null);
  /** Password shown in the notice, with a copy button. */
  const [noticeCopy, setNoticeCopy] = useState<string | null>(null);
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
    setNoticeCopy(null);
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
      setNoticeCopy(temporaryPassword);
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
    if (!(await confirm({ title: nl.users.resetTitle, message: nl.users.confirmReset(u.displayName), icon: <KeyIcon /> }))) return;
    const pw = generatePassword();
    void run(async () => {
      await api(`/users/${u.id}/reset-password`, {
        method: 'POST',
        body: { temporaryPassword: pw },
      });
      setNotice(nl.users.resetDone(u.displayName, pw));
      setNoticeCopy(pw);
    });
  };

  async function saveImmichKey(u: AdminUser, apiKey: string | null) {
    await api(`/users/${u.id}/immich-key`, { method: 'PUT', body: { apiKey } });
    setError(null);
    setNoticeCopy(null);
    setNotice(nl.users.immichSaved(u.displayName));
    await load();
  }

  const remove = async (u: AdminUser) => {
    if (u.ownedTravels.length > 0) {
      setDeleting(u);
      return;
    }
    if (!(await confirm({ title: nl.users.removeTitle, message: nl.users.confirmRemove(u.displayName), confirmLabel: nl.common.delete, danger: true }))) {
      return;
    }
    void run(async () => {
      await api(`/users/${u.id}`, { method: 'DELETE', body: { mode: 'delete' } });
    });
  };

  return (
    <section className="page">
      {error && <Alert kind="error">{error}</Alert>}
      {notice && (
        <div className="notice-copy">
          <Alert kind="success">{notice}</Alert>
          {noticeCopy && <CopyButton value={noticeCopy} label={nl.users.copyPassword} className="btn btn-small btn-secondary" />}
        </div>
      )}

      <ul className="user-list">
        {users.map((u) => (
          <li key={u.id} className="card user-item">
            <Avatar user={u} size="m" />
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
                <Listbox
                  variant="compact"
                  title={nl.users.role}
                  selected={u.role}
                  onSelect={(id) => void changeRole(u, id as AssignableRole)}
                  options={roleOptions}
                />
              )}
              {isTraveller(u.role) && (
                <button className="btn btn-small" onClick={() => setKeyUser(u)}>
                  <KeyIcon />
                  {nl.users.immichKey}
                </button>
              )}
              {u.role !== 'admin' && (
                <>
                  <button className="btn btn-small" onClick={() => void toggleDisabled(u)}>
                    <BanIcon />
                    {u.disabled ? nl.users.enable : nl.users.disable}
                  </button>
                  <button className="btn btn-small" onClick={() => void resetPassword(u)}>
                    <RefreshIcon />
                    {nl.users.resetPassword}
                  </button>
                  <button className="btn btn-small btn-danger" onClick={() => void remove(u)}>
                    <TrashIcon />
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
          onChange={(id) => setRole(id as AssignableRole)}
          options={roleOptions}
        />
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
          <div className="field-row-actions">
            <CopyButton value={temporaryPassword} />
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setTemporaryPassword(generatePassword())}
            >
              <RefreshIcon />
              {nl.users.generate}
            </button>
          </div>
        </div>
        <button type="submit" className="btn btn-primary" disabled={busy}>
          <UserPlusIcon />
          {nl.users.create}
        </button>
      </form>

      {keyUser && (
        <ImmichKeyDialog user={keyUser} onClose={() => setKeyUser(null)} onSave={(k) => saveImmichKey(keyUser, k)} />
      )}
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
