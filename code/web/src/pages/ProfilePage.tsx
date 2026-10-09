import { useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { isTraveller, type PublicUser } from '@travelsteps/shared';
import { api, errorMessage } from '../api';
import { useAuth, useUser } from '../auth/AuthContext';
import { useBlog } from '../blog/BlogContext';
import { Avatar } from '../components/Avatar';
import { useConfirm } from '../components/ConfirmDialog';
import { Alert, Field } from '../components/Field';
import { usePageTitle } from '../components/PageTitle';
import { PhotoPicker } from '../components/PhotoPicker';
import { PushToggle } from '../components/PushToggle';
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

export function ProfilePage() {
  usePageTitle(nl.profile.title);
  const user = useUser();
  const { setUser } = useAuth();
  const online = useOnline();
  const install = useInstall();
  const confirm = useConfirm();
  const fileRef = useRef<HTMLInputElement>(null);
  const [displayName, setDisplayName] = useState(user.displayName);
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: 'error' | 'success'; text: string } | null>(null);
  const [changed, setChanged] = useState(false);
  const [immichKey, setImmichKey] = useState('');
  const [immichMessage, setImmichMessage] = useState<{
    kind: 'error' | 'success';
    text: string;
  } | null>(null);
  const { travellers, setSubscribed } = useBlog();
  const others = (travellers ?? []).filter((t) => t.id !== user.id);
  const traveller = isTraveller(user.role);

  async function saveImmichKey(apiKey: string | null) {
    setBusy(true);
    setImmichMessage(null);
    try {
      const r = await api<{ user: PublicUser }>('/profile/immich-key', {
        method: 'PUT',
        body: { apiKey },
      });
      setUser(r.user);
      setImmichKey('');
      setImmichMessage({
        kind: 'success',
        text: apiKey ? nl.profile.immichSaved : nl.profile.immichRemoved,
      });
    } catch (err) {
      setImmichMessage({ kind: 'error', text: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  }

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
    <section className="page">
      <div className="card stack">
        <div className="profile-head">
          <Avatar user={user} size="large" />
          <div>
            <strong>{user.displayName}</strong>
            <div className="muted">
              {nl.profile.username}: {user.username} · {nl.profile.roles[user.role]}
            </div>
          </div>
        </div>
        <div className="row-actions">
          <button
            type="button"
            className="btn btn-small btn-secondary"
            onClick={() => fileRef.current?.click()}
            disabled={busy || !online}
          >
            {nl.profile.uploadAvatar}
          </button>
          {traveller && user.hasImmichKey && (
            <button
              type="button"
              className="btn btn-small btn-secondary"
              onClick={() => setPicking(true)}
              disabled={busy || !online}
            >
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
              {nl.profile.removeAvatar}
            </button>
          )}
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={onFile} />
        </div>
        <form className="inline-form" onSubmit={saveName}>
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
            className="btn btn-secondary"
            disabled={
              busy || !online || displayName.trim() === user.displayName || !displayName.trim()
            }
          >
            {nl.common.save}
          </button>
        </form>
        {message && <Alert kind={message.kind}>{message.text}</Alert>}
      </div>

      {traveller && (
        <form
          className="card stack"
          onSubmit={(e) => {
            e.preventDefault();
            if (immichKey.trim()) void saveImmichKey(immichKey.trim());
          }}
        >
          <h2>{nl.profile.immichTitle}</h2>
          <p className="muted">{nl.profile.immichHint}</p>
          <p>{user.hasImmichKey ? nl.profile.immichSet : nl.profile.immichNone}</p>
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
              className="btn btn-secondary"
              disabled={busy || !online || !immichKey.trim()}
            >
              {nl.profile.immichSave}
            </button>
            {user.hasImmichKey && (
              <button
                type="button"
                className="btn btn-danger"
                disabled={busy || !online}
                onClick={() => {
                  void confirm({
                    message: nl.profile.confirmImmichRemove,
                    confirmLabel: nl.profile.immichRemove,
                    danger: true,
                  }).then((ok) => {
                    if (ok) void saveImmichKey(null);
                  });
                }}
              >
                {nl.profile.immichRemove}
              </button>
            )}
          </div>
          {immichMessage && <Alert kind={immichMessage.kind}>{immichMessage.text}</Alert>}
        </form>
      )}

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
                  <Avatar user={t} size="tiny" />
                  <span>{t.displayName}</span>
                </label>
              </li>
            ))}
          </ul>
        )}
      </div>

      <PushToggle />

      {install.state !== 'installed' && install.state !== 'unavailable' && (
        <div className="card stack">
          <h2>{nl.install.title}</h2>
          {install.state === 'prompt' ? (
            <>
              <p className="muted">{nl.install.text}</p>
              <button
                type="button"
                className="btn btn-primary align-start"
                onClick={() => void install.install()}
              >
                {nl.install.button}
              </button>
            </>
          ) : (
            <p className="muted">{nl.install.ios}</p>
          )}
        </div>
      )}

      <div className="card">
        <h2>{nl.profile.changePassword}</h2>
        {changed && <Alert kind="success">{nl.profile.passwordChanged}</Alert>}
        <ChangePasswordForm onDone={() => setChanged(true)} />
      </div>

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
    </section>
  );
}
