import { useState, type FormEvent } from 'react';
import { PASSWORD_MIN_LENGTH, type PublicUser } from '@travelsteps/shared';
import { useAuth, useUser } from '../auth/AuthContext';
import { api, errorMessage } from '../api';
import { Alert, Field } from '../components/Field';
import { StaticBanner } from '../components/PageTitle';
import { nl } from '../i18n/nl';

/** Forced on the admin's first login: new username + password. */
export function ChangeCredentialsPage() {
  const user = useUser();
  const { setUser, logout } = useAuth();
  const [newUsername, setNewUsername] = useState('');
  const [displayName, setDisplayName] = useState(user.displayName);
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (newPassword !== confirm) {
      setError(nl.credentials.mismatch);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ user: PublicUser }>('/auth/change-credentials', {
        method: 'POST',
        body: { newUsername, newPassword, displayName },
      });
      setUser(r.user);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
    <StaticBanner title={nl.credentials.title} />
    <div className="auth-screen">
      <form className="card auth-card" onSubmit={submit}>
        <p className="muted">{nl.credentials.intro}</p>
        {error && <Alert kind="error">{error}</Alert>}
        <Field
          label={nl.credentials.newUsername}
          name="newUsername"
          autoComplete="username"
          autoCapitalize="none"
          required
          value={newUsername}
          onChange={(e) => setNewUsername(e.target.value)}
        />
        <Field
          label={nl.credentials.displayName}
          name="displayName"
          required
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
        />
        <Field
          label={nl.credentials.newPassword}
          name="newPassword"
          type="password"
          autoComplete="new-password"
          minLength={PASSWORD_MIN_LENGTH}
          required
          hint={nl.credentials.passwordHint(PASSWORD_MIN_LENGTH)}
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
        />
        <Field
          label={nl.credentials.confirmPassword}
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          required
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {nl.credentials.submit}
        </button>
        <button type="button" className="btn btn-link" onClick={() => void logout()}>
          {nl.profile.logout}
        </button>
      </form>
    </div>
    </>
  );
}
