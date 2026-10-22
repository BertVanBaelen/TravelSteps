import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import {
  isTraveller,
  type Language,
  type PublicUser,
  type TrustedUsers,
} from '@travelsteps/shared';
import { api, errorMessage } from '../api';
import { useAuth, useUser } from '../auth/AuthContext';
import { useBlog } from '../blog/BlogContext';
import { Avatar } from '../components/Avatar';
import { useConfirm } from '../components/ConfirmDialog';
import { Alert, Field, SelectField } from '../components/Field';
import {
  BellIcon,
  DownloadIcon,
  GlobeIcon,
  ImageAddIcon,
  KeyIcon,
  LeaveIcon,
  LockIcon,
  PhotoIcon,
  ProfileIcon,
  SaveIcon,
  SettingsIcon,
  TrashIcon,
  UserPlusIcon,
  UsersIcon,
} from '../components/icons';
import { usePageTitle } from '../components/PageTitle';
import { LanguageSwitch } from '../components/LanguageSwitch';
import { PhotoPicker } from '../components/PhotoPicker';
import { PushToggle } from '../components/PushToggle';
import { SettingsMenu } from '../components/SettingsMenu';
import { messages, useChooseLanguage, useLanguage, useT } from '../i18n';
import { useInstall } from '../lib/install';
import { useOnline } from '../offline/db';
import { ChangePasswordForm } from './ChangePasswordPage';
const AVATAR_SIZE = 256;

/** Crops the image to a centred square and encodes it as a small JPEG (base64, no prefix). */
async function resizeAvatar(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error(messages().profile.avatarInvalid);
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
  const msg = useT();
  usePageTitle(msg.profile.title);
  const user = useUser();
  const { logout } = useAuth();
  const install = useInstall();
  const { travellers } = useBlog();
  const following = (travellers ?? []).filter((t) => t.id !== user.id && t.subscribed).length;
  const p = msg.profile.menu;
  const language = useLanguage();

  return (
    <section className="page">
      <div className="card profile-head">
        <Avatar user={user} size="l" />
        <div>
          <strong>{user.displayName}</strong>
          <div className="muted">
            {msg.profile.username}: {user.username} · {msg.profile.roles[user.role]}
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
            title: msg.profile.changePassword,
            summary: p.passwordSummary,
            to: '/profiel/wachtwoord',
          },
          ...(isTraveller(user.role)
            ? [
                {
                  icon: <KeyIcon />,
                  title: msg.profile.immichTitle,
                  summary: user.hasImmichKey ? msg.profile.immichSet : msg.profile.immichNone,
                  to: '/profiel/fotos',
                },
                {
                  icon: <UsersIcon />,
                  title: msg.profile.trustedTitle,
                  summary: p.trustedSummary,
                  to: '/profiel/vertrouwd',
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
            title: msg.notifications.title,
            summary: p.notificationsSummary(following),
            to: '/profiel/meldingen',
          },
          {
            icon: <GlobeIcon />,
            title: msg.language.title,
            summary: msg.language.names[language],
            to: '/profiel/taal',
          },
          ...(install.state !== 'installed' && install.state !== 'unavailable'
            ? [
                {
                  icon: <DownloadIcon />,
                  title: msg.install.title,
                  summary: msg.install.text,
                  to: '/profiel/app',
                },
              ]
            : []),
        ]}
      />
      {user.role === 'admin' && (
        <SettingsMenu
          title={msg.profile.admin}
          rows={[
            {
              icon: <UsersIcon />,
              title: msg.profile.manageUsers,
              summary: p.usersSummary,
              to: '/beheer/gebruikers',
            },
            {
              icon: <SettingsIcon />,
              title: msg.profile.settings,
              summary: p.settingsSummary,
              to: '/beheer/instellingen',
            },
          ]}
        />
      )}
      <SettingsMenu
        rows={[
          {
            icon: <LeaveIcon />,
            title: msg.profile.logout,
            onClick: () => void logout(),
            danger: true,
          },
        ]}
      />
    </section>
  );
}

const SECTIONS = {
  account: {
    title: () => messages().profile.menu.profile,
    Page: AccountSection,
    travellerOnly: false,
  },
  wachtwoord: {
    title: () => messages().profile.changePassword,
    Page: PasswordSection,
    travellerOnly: false,
  },
  fotos: { title: () => messages().profile.immichTitle, Page: ImmichSection, travellerOnly: true },
  vertrouwd: {
    title: () => messages().profile.trustedTitle,
    Page: TrustedSection,
    travellerOnly: true,
  },
  meldingen: {
    title: () => messages().notifications.title,
    Page: NotificationsSection,
    travellerOnly: false,
  },
  taal: { title: () => messages().language.title, Page: LanguageSection, travellerOnly: false },
  app: { title: () => messages().install.title, Page: InstallSection, travellerOnly: false },
} as const;

/** `/profiel/:section`: one group of settings. */
export function ProfileSectionPage() {
  const msg = useT();
  const { section = '' } = useParams();
  const user = useUser();
  const entry = Object.hasOwn(SECTIONS, section)
    ? SECTIONS[section as keyof typeof SECTIONS]
    : null;
  usePageTitle(entry ? entry.title() : msg.profile.title, { back: '/profiel' });
  if (!entry || (entry.travellerOnly && !isTraveller(user.role)))
    return <Navigate to="/profiel" replace />;
  return (
    <section className="page settings-page">
      <entry.Page />
    </section>
  );
}

function AccountSection() {
  const msg = useT();
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
      msg.profile.nameSaved,
    );
  }

  function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    void run(async () => {
      const image = await resizeAvatar(file);
      return api('/profile/avatar', { method: 'PUT', body: { image } });
    }, msg.profile.avatarSaved);
  }

  return (
    <>
      <div className="card stack">
        <h2>{msg.profile.avatarTitle}</h2>
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
              {msg.profile.uploadAvatar}
            </button>
            {isTraveller(user.role) && user.hasImmichKey && (
              <button
                type="button"
                className="btn btn-small btn-secondary"
                onClick={() => setPicking(true)}
                disabled={busy || !online}
              >
                <PhotoIcon />
                {msg.profile.immichAvatar}
              </button>
            )}
            {user.avatarUrl && (
              <button
                type="button"
                className="btn btn-small btn-danger"
                onClick={() =>
                  void run(
                    () => api('/profile/avatar', { method: 'DELETE' }),
                    msg.profile.avatarRemoved,
                  )
                }
                disabled={busy || !online}
              >
                <TrashIcon />
                {msg.profile.removeAvatar}
              </button>
            )}
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={onFile} />
          </div>
        </div>
      </div>
      <form className="card stack" onSubmit={saveName}>
        <p className="muted">
          {msg.profile.username}: {user.username} · {msg.profile.role}:{' '}
          {msg.profile.roles[user.role]}
        </p>
        <div className="inline-form">
          <Field
            label={msg.profile.displayName}
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
            {msg.common.save}
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
                msg.profile.avatarSaved,
              );
            }
          }}
        />
      )}
    </>
  );
}

function PasswordSection() {
  const msg = useT();
  const [changed, setChanged] = useState(false);
  return (
    <div className="card">
      {changed && <Alert kind="success">{msg.profile.passwordChanged}</Alert>}
      <ChangePasswordForm onDone={() => setChanged(true)} />
    </div>
  );
}

function ImmichSection() {
  const msg = useT();
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
        text: apiKey ? msg.profile.immichSaved : msg.profile.immichRemoved,
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
      <p className="muted">{msg.profile.immichHint}</p>
      <p>
        <span className={`badge${user.hasImmichKey ? '' : ' badge-off'}`}>
          {user.hasImmichKey ? msg.profile.immichSet : msg.profile.immichNone}
        </span>
      </p>
      <Field
        label={msg.profile.immichKey}
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
          {msg.profile.immichSave}
        </button>
        {user.hasImmichKey && (
          <button
            type="button"
            className="btn btn-secondary btn-danger"
            disabled={busy || !online}
            onClick={() => {
              void confirm({
                title: msg.profile.immichRemoveTitle,
                message: msg.profile.confirmImmichRemove,
                confirmLabel: msg.profile.immichRemove,
                danger: true,
              }).then((ok) => {
                if (ok) void saveImmichKey(null);
              });
            }}
          >
            <TrashIcon />
            {msg.profile.immichRemove}
          </button>
        )}
      </div>
      {message && <Alert kind={message.kind}>{message.text}</Alert>}
    </form>
  );
}

function TrustedSection() {
  const msg = useT();
  const user = useUser();
  const online = useOnline();
  const confirm = useConfirm();
  const [data, setData] = useState<TrustedUsers | null>(null);
  const [choice, setChoice] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: 'error' | 'success'; text: string } | null>(null);

  useEffect(() => {
    api<TrustedUsers>('/profile/trusted')
      .then(setData)
      .catch((err) => setMessage({ kind: 'error', text: errorMessage(err) }));
  }, []);

  async function change(method: 'PUT' | 'DELETE', id: string, success: string) {
    setBusy(true);
    setMessage(null);
    try {
      setData(await api<TrustedUsers>(`/profile/trusted/${id}`, { method }));
      setChoice('');
      setMessage({ kind: 'success', text: success });
    } catch (err) {
      setMessage({ kind: 'error', text: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  }

  const candidates = (data?.candidates ?? []).filter(
    (c) => c.id !== user.id && !data?.trusted.some((t) => t.id === c.id),
  );
  const chosen = candidates.find((c) => c.id === choice);

  return (
    <div className="card stack">
      <p className="muted">{msg.profile.trustedHint}</p>
      {data && (
        <>
          {data.trusted.length === 0 ? (
            <p className="muted">{msg.profile.trustedNone}</p>
          ) : (
            <ul className="member-list">
              {data.trusted.map((u) => (
                <li key={u.id}>
                  <Avatar user={u} size="xs" />
                  <span>{u.displayName}</span>
                  <button
                    type="button"
                    className="btn btn-small btn-danger member-remove"
                    disabled={busy || !online}
                    onClick={() => {
                      void confirm({
                        title: msg.profile.trustedRemoveTitle,
                        message: msg.profile.trustedConfirmRemove(u.displayName),
                        confirmLabel: msg.profile.trustedRemove,
                        danger: true,
                      }).then((ok) => {
                        if (ok)
                          void change('DELETE', u.id, msg.profile.trustedRemoved(u.displayName));
                      });
                    }}
                  >
                    {msg.profile.trustedRemove}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {candidates.length === 0 ? (
            <p className="muted">{msg.profile.trustedNoCandidates}</p>
          ) : (
            <div className="field-row">
              <SelectField
                label={msg.profile.trustedAdd}
                name="trusted"
                value={choice}
                onChange={setChoice}
                disabled={busy || !online}
                options={[
                  {
                    id: '',
                    label: msg.profile.trustedChoose,
                    icon: (
                      <span className="picker-icon picker-icon-muted">
                        <UserPlusIcon />
                      </span>
                    ),
                  },
                  ...candidates.map((u) => ({
                    id: u.id,
                    label: u.displayName,
                    icon: <Avatar user={u} size="s" />,
                  })),
                ]}
              />
              <button
                type="button"
                className="btn btn-secondary"
                disabled={busy || !online || !chosen}
                onClick={() =>
                  chosen &&
                  void change('PUT', chosen.id, msg.profile.trustedAdded(chosen.displayName))
                }
              >
                <UserPlusIcon />
                {msg.profile.trustedAdd}
              </button>
            </div>
          )}
        </>
      )}
      {message && <Alert kind={message.kind}>{message.text}</Alert>}
    </div>
  );
}

function NotificationsSection() {
  const msg = useT();
  const user = useUser();
  const online = useOnline();
  const { travellers, setSubscribed } = useBlog();
  const others = (travellers ?? []).filter((t) => t.id !== user.id);
  return (
    <>
      <PushToggle />
      <div className="card stack">
        <h2>{msg.notifications.subscriptionsTitle}</h2>
        <p className="muted">{msg.notifications.subscriptionsHint}</p>
        {others.length === 0 ? (
          <p className="muted">{msg.notifications.noTravellers}</p>
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

function LanguageSection() {
  const msg = useT();
  const choose = useChooseLanguage();
  const [status, setStatus] = useState<{ kind: 'success' | 'info' | 'error'; text: string } | null>(
    null,
  );
  const [busy, setBusy] = useState(false);

  async function change(language: Language) {
    setBusy(true);
    setStatus(null);
    try {
      const saved = await choose(language);
      setStatus(
        saved
          ? { kind: 'success', text: messages().language.saved }
          : { kind: 'info', text: messages().language.offline },
      );
    } catch (err) {
      setStatus({ kind: 'error', text: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card stack">
      <p className="muted">{msg.language.hint}</p>
      <LanguageSwitch onChange={(l) => void change(l)} disabled={busy} className="segmented-wide" />
      {status && <Alert kind={status.kind}>{status.text}</Alert>}
    </div>
  );
}

function InstallSection() {
  const msg = useT();
  const install = useInstall();
  if (install.state === 'installed') return <Alert kind="success">{msg.install.installed}</Alert>;
  return (
    <div className="card stack">
      {install.state === 'prompt' ? (
        <>
          <p className="muted">{msg.install.text}</p>
          <button
            type="button"
            className="btn btn-primary align-start"
            onClick={() => void install.install()}
          >
            <DownloadIcon />
            {msg.install.button}
          </button>
        </>
      ) : (
        <p className="muted">{install.state === 'ios' ? msg.install.ios : msg.install.android}</p>
      )}
    </div>
  );
}
