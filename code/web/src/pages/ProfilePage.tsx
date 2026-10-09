import { useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { isTraveller, type PublicUser } from '@travelsteps/shared';
import { api, errorMessage } from '../api';
import { useAuth, useUser } from '../auth/AuthContext';
import { useBlog } from '../blog/BlogContext';
import { Avatar } from '../components/Avatar';
import { useConfirm } from '../components/ConfirmDialog';
import { Alert, Field } from '../components/Field';
import {
  BellIcon,
  DownloadIcon,
  ImageAddIcon,
  KeyIcon,
  LeaveIcon,
  LockIcon,
  PhotoIcon,
  ProfileIcon,
  SaveIcon,
  SettingsIcon,
  TrashIcon,
  UsersIcon,
} from '../components/icons';
import { usePageTitle } from '../components/PageTitle';
import { PhotoPicker } from '../components/PhotoPicker';
import { PushToggle } from '../components/PushToggle';
import { SettingsMenu } from '../components/SettingsMenu';
import { nl } from '../i18n/nl';
import { useInstall } from '../lib/install';
import { useOnline } from '../offline/db';
import { ChangePasswordForm } from './ChangePasswordPage';
const AVATAR_SIZE = 256;

/** Crops the image to a centred square and encodes it as a small JPEG (base64, no prefix). */
async function resizeAvatar(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error(nl.profile.avatarInvalid);
  });
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = AVATAR_SIZE;
  canvas.height = AVATAR_SIZE;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(
    bitmap,
    (bitmap.width - side) / 2,
    (bitmap.height - side) / 2,
    side,
    side,
    0,
    0,
    AVATAR_SIZE,
    AVATAR_SIZE,
  );
  bitmap.close();
  return canvas.toDataURL('image/jpeg', 0.85).split(',')[1]!;
}

/** `/profiel`: overview of all profile and app settings, each opening its own sub page. */
export function ProfilePage() {
  usePageTitle(nl.profile.title);
  const user = useUser();
  const { logout } = useAuth();
  const install = useInstall();
  const { travellers } = useBlog();
  const following = (travellers ?? []).filter((t) => t.id !== user.id && t.subscribed).length;
  const p = nl.profile.menu;

  return (
    <section className="page">
      <div className="card profile-head">
        <Avatar user={user} size="l" />
        <div>
          <strong>{user.displayName}</strong>
          <div className="muted">
            {nl.profile.username}: {user.username} · {nl.profile.roles[user.role]}
          </div>
        </div>
      </div>
      <SettingsMenu
        title={p.account}
        rows={[
          {
            icon: <ProfileIcon />,
            title: p.profile,
            summary: p.profileSummary,
            to: '/profiel/account',
          },
          {
            icon: <LockIcon />,
            title: nl.profile.changePassword,
            summary: p.passwordSummary,
            to: '/profiel/wachtwoord',
          },
          ...(isTraveller(user.role)
            ? [
                {
                  icon: <KeyIcon />,
                  title: nl.profile.immichTitle,
                  summary: user.hasImmichKey ? nl.profile.immichSet : nl.profile.immichNone,
                  to: '/profiel/fotos',
                },
              ]
            : []),
        ]}
      />
      <SettingsMenu
        title={p.app}
        rows={[
          {
            icon: <BellIcon />,
            title: nl.notifications.title,
            summary: p.notificationsSummary(following),
            to: '/profiel/meldingen',
          },
          ...(install.state !== 'installed' && install.state !== 'unavailable'
            ? [{ icon: <DownloadIcon />, title: nl.install.title, summary: nl.install.text, to: '/profiel/app' }]
            : []),
        ]}
      />
      {user.role === 'admin' && (
        <SettingsMenu
          title={nl.profile.admin}
          rows={[
            {
              icon: <UsersIcon />,
              title: nl.profile.manageUsers,
              summary: p.usersSummary,
              to: '/beheer/gebruikers',
            },
            {
              icon: <SettingsIcon />,
              title: nl.profile.settings,
              summary: p.settingsSummary,
              to: '/beheer/instellingen',
            },
          ]}
        />
      )}
      <SettingsMenu
        rows={[{ icon: <LeaveIcon />, title: nl.profile.logout, onClick: () => void logout(), danger: true }]}
      />
    </section>
  );
}

const SECTIONS = {
  account: { title: () => nl.profile.menu.profile, Page: AccountSection, travellerOnly: false },
  wachtwoord: { title: () => nl.profile.changePassword, Page: PasswordSection, travellerOnly: false },
  fotos: { title: () => nl.profile.immichTitle, Page: ImmichSection, travellerOnly: true },
  meldingen: { title: () => nl.notifications.title, Page: NotificationsSection, travellerOnly: false },
  app: { title: () => nl.install.title, Page: InstallSection, travellerOnly: false },
} as const;

/** `/profiel/:section`: one group of settings. */
export function ProfileSectionPage() {
  const { section = '' } = useParams();
  const user = useUser();
  const entry = Object.hasOwn(SECTIONS, section) ? SECTIONS[section as keyof typeof SECTIONS] : null;
  usePageTitle(entry ? entry.title() : nl.profile.title, { back: '/profiel' });
  if (!entry || (entry.travellerOnly && !isTraveller(user.role))) return <Navigate to="/profiel" replace />;
  return (
    <section className="page settings-page">
      <entry.Page />
    </section>
  );
}

function AccountSection() {
  const user = useUser();
  const { setUser } = useAuth();
  const online = useOnline();
  const fileRef = useRef<HTMLInputElement>(null);
  const [displayName, setDisplayName] = useState(user.displayName);
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: 'error' | 'success'; text: string } | null>(null);

  async function run(action: () => Promise<{ user: PublicUser }>, success: string) {
    setBusy(true);
    setMessage(null);
    try {
      const r = await action();
      setUser(r.user);
      setMessage({ kind: 'success', text: success });
    } catch (err) {
      setMessage({
        kind: 'error',
        text: err instanceof Error && !('status' in err) ? err.message : errorMessage(err),
      });
    } finally {
      setBusy(false);
    }
  }

  function saveName(e: FormEvent) {
    e.preventDefault();
    void run(
      () => api('/profile', { method: 'PATCH', body: { displayName } }),
      nl.profile.nameSaved,
    );
  }

  function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    void run(async () => {
      const image = await resizeAvatar(file);
      return api('/profile/avatar', { method: 'PUT', body: { image } });
    }, nl.profile.avatarSaved);
  }

  return (
    <>
      <div className="card stack">
        <h2>{nl.profile.avatarTitle}</h2>
        <div className="profile-head">
          <Avatar user={user} size="l" />
          <div className="row-actions">
            <button
              type="button"
              className="btn btn-small btn-secondary"
              onClick={() => fileRef.current?.click()}
              disabled={busy || !online}
            >
              <ImageAddIcon />
              {nl.profile.uploadAvatar}
            </button>
            {isTraveller(user.role) && user.hasImmichKey && (
              <button
                type="button"
                className="btn btn-small btn-secondary"
                onClick={() => setPicking(true)}
                disabled={busy || !online}
              >
                <PhotoIcon />
                {nl.profile.immichAvatar}
              </button>
            )}
            {user.avatarUrl && (
              <button
                type="button"
                className="btn btn-small btn-danger"
                onClick={() =>
                  void run(
                    () => api('/profile/avatar', { method: 'DELETE' }),
                    nl.profile.avatarRemoved,
                  )
                }
                disabled={busy || !online}
              >
                <TrashIcon />
                {nl.profile.removeAvatar}
              </button>
            )}
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={onFile} />
          </div>
        </div>
      </div>
      <form className="card stack" onSubmit={saveName}>
        <p className="muted">
          {nl.profile.username}: {user.username} · {nl.profile.role}: {nl.profile.roles[user.role]}
        </p>
        <div className="inline-form">
          <Field
            label={nl.profile.displayName}
            name="displayName"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            maxLength={50}
            required
          />
          <button
            type="submit"
            className="btn btn-primary"
            disabled={
              busy || !online || displayName.trim() === user.displayName || !displayName.trim()
            }
          >
            <SaveIcon />
            {nl.common.save}
          </button>
        </div>
      </form>
      {message && <Alert kind={message.kind}>{message.text}</Alert>}
      {picking && (
        <PhotoPicker
          initial={[]}
          max={1}
          onClose={() => setPicking(false)}
          onDone={(ids) => {
            setPicking(false);
            if (ids[0]) {
              void run(
                () => api('/profile/avatar', { method: 'PUT', body: { assetId: ids[0] } }),
                nl.profile.avatarSaved,
              );
            }
          }}
        />
      )}
    </>
  );
}

function PasswordSection() {
  const [changed, setChanged] = useState(false);
  return (
    <div className="card">
      {changed && <Alert kind="success">{nl.profile.passwordChanged}</Alert>}
      <ChangePasswordForm onDone={() => setChanged(true)} />
    </div>
  );
}

function ImmichSection() {
  const user = useUser();
  const { setUser } = useAuth();
  const online = useOnline();
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);
  const [immichKey, setImmichKey] = useState('');
  const [message, setMessage] = useState<{ kind: 'error' | 'success'; text: string } | null>(null);

  async function saveImmichKey(apiKey: string | null) {
    setBusy(true);
    setMessage(null);
    try {
      const r = await api<{ user: PublicUser }>('/profile/immich-key', {
        method: 'PUT',
        body: { apiKey },
      });
      setUser(r.user);
      setImmichKey('');
      setMessage({
        kind: 'success',
        text: apiKey ? nl.profile.immichSaved : nl.profile.immichRemoved,
      });
    } catch (err) {
      setMessage({ kind: 'error', text: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className="card stack"
      onSubmit={(e) => {
        e.preventDefault();
        if (immichKey.trim()) void saveImmichKey(immichKey.trim());
      }}
    >
      <p className="muted">{nl.profile.immichHint}</p>
      <p>
        <span className={`badge${user.hasImmichKey ? '' : ' badge-off'}`}>
          {user.hasImmichKey ? nl.profile.immichSet : nl.profile.immichNone}
        </span>
      </p>
      <Field
        label={nl.profile.immichKey}
        name="immichKey"
        type="password"
        autoComplete="off"
        value={immichKey}
        onChange={(e) => setImmichKey(e.target.value)}
      />
      <div className="row-actions">
        <button
          type="submit"
          className="btn btn-primary"
          disabled={busy || !online || !immichKey.trim()}
        >
          <KeyIcon />
          {nl.profile.immichSave}
        </button>
        {user.hasImmichKey && (
          <button
            type="button"
            className="btn btn-secondary btn-danger"
            disabled={busy || !online}
            onClick={() => {
              void confirm({
                title: nl.profile.immichRemoveTitle,
                message: nl.profile.confirmImmichRemove,
                confirmLabel: nl.profile.immichRemove,
                danger: true,
              }).then((ok) => {
                if (ok) void saveImmichKey(null);
              });
            }}
          >
            <TrashIcon />
            {nl.profile.immichRemove}
          </button>
        )}
      </div>
      {message && <Alert kind={message.kind}>{message.text}</Alert>}
    </form>
  );
}

function NotificationsSection() {
  const user = useUser();
  const online = useOnline();
  const { travellers, setSubscribed } = useBlog();
  const others = (travellers ?? []).filter((t) => t.id !== user.id);
  return (
    <>
      <PushToggle />
      <div className="card stack">
        <h2>{nl.notifications.subscriptionsTitle}</h2>
        <p className="muted">{nl.notifications.subscriptionsHint}</p>
        {others.length === 0 ? (
          <p className="muted">{nl.notifications.noTravellers}</p>
        ) : (
          <ul className="check-list">
            {others.map((t) => (
              <li key={t.id}>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={t.subscribed}
                    disabled={!online}
                    onChange={(e) => void setSubscribed(t.id, e.target.checked)}
                  />
                  <Avatar user={t} size="xs" />
                  <span>{t.displayName}</span>
                </label>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

function InstallSection() {
  const install = useInstall();
  if (install.state === 'installed') return <Alert kind="success">{nl.install.installed}</Alert>;
  return (
    <div className="card stack">
      {install.state === 'prompt' ? (
        <>
          <p className="muted">{nl.install.text}</p>
          <button
            type="button"
            className="btn btn-primary align-start"
            onClick={() => void install.install()}
          >
            <DownloadIcon />
            {nl.install.button}
          </button>
        </>
      ) : (
        <p className="muted">{install.state === 'ios' ? nl.install.ios : nl.install.android}</p>
      )}
    </div>
  );
}