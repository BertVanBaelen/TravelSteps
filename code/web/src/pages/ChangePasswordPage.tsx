import { useState, type FormEvent } from 'react';
import { PASSWORD_MIN_LENGTH, type PublicUser } from '@travelsteps/shared';
import { useAuth } from '../auth/AuthContext';
import { api, errorMessage } from '../api';
import { Alert, Field } from '../components/Field';
import { StaticBanner } from '../components/PageTitle';
import { useT } from '../i18n';

export function ChangePasswordForm({
  onDone,
  forced = false,
}: {
  onDone?: () => void;
  forced?: boolean;
}) {
  const msg = useT();
  const { setUser } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (newPassword !== confirm) {
      setError(msg.credentials.mismatch);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ user: PublicUser }>('/auth/change-password', {
        method: 'POST',
        body: forced ? { newPassword } : { currentPassword, newPassword },
      });
      setCurrentPassword('');
      setNewPassword('');
      setConfirm('');
      setUser(r.user);
      onDone?.();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="stack" onSubmit={submit}>
      {error && <Alert kind="error">{error}</Alert>}
      {!forced && (
        <Field
          label={msg.credentials.currentPassword}
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          required
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
        />
      )}
      <Field
        label={msg.credentials.newPassword}
        name="newPassword"
        type="password"
        autoComplete="new-password"
        minLength={PASSWORD_MIN_LENGTH}
        required
        hint={msg.credentials.passwordHint(PASSWORD_MIN_LENGTH)}
        value={newPassword}
        onChange={(e) => setNewPassword(e.target.value)}
      />
      <Field
        label={msg.credentials.confirmPassword}
        name="confirmPassword"
        type="password"
        autoComplete="new-password"
        required
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
      />
      <button type="submit" className="btn btn-primary" disabled={busy}>
        {msg.credentials.submit}
      </button>
    </form>
  );
}

/** Forced for viewers that received a temporary password. */
export function ForcedPasswordPage() {
  const msg = useT();
  const { logout } = useAuth();
  return (
    <>
    <StaticBanner title={msg.forcedPassword.title} />
    <div className="auth-screen">
      <div className="card auth-card">
        <p className="muted">{msg.forcedPassword.intro}</p>
        <ChangePasswordForm forced />
        <button type="button" className="btn btn-link" onClick={() => void logout()}>
          {msg.profile.logout}
        </button>
      </div>
    </div>
    </>
  );
}
