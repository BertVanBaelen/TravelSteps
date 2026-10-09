import { useState, type FormEvent } from 'react';
import { useAuth } from '../auth/AuthContext';
import { errorMessage } from '../api';
import { Alert, Field } from '../components/Field';
import { StaticBanner } from '../components/PageTitle';
import { db, useLiveQuery } from '../offline/db';
import { nl } from '../i18n/nl';

export function LoginPage() {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const unsent = useLiveQuery(async () => (await db.outbox.count()) + (await db.drafts.count()), []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(username, password);
    } catch (err) {
      setError(errorMessage(err));
      setPassword('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
    <StaticBanner title={nl.login.title} />
    <div className="auth-screen">
      <form className="card auth-card" onSubmit={submit}>
        <img src="/favicon.svg" alt="" className="auth-logo" />
        <p className="muted">{nl.login.subtitle}</p>
        {!!unsent && <Alert kind="info">{nl.sync.loginNotice(unsent)}</Alert>}
        {error && <Alert kind="error">{error}</Alert>}
        <Field
          label={nl.login.username}
          name="username"
          autoComplete="username"
          autoCapitalize="none"
          required
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
        <Field
          label={nl.login.password}
          name="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? nl.login.busy : nl.login.submit}
        </button>
      </form>
    </div>
    </>
  );
}
