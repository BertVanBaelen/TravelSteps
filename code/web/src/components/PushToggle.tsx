import { useCallback, useEffect, useState } from 'react';
import { errorMessage } from '../api';
import { nl } from '../i18n/nl';
import { isIos, isStandalone } from '../lib/install';
import {
  currentPushSubscription,
  disablePush,
  enablePush,
  pushDeniedMessage,
  pushSupported,
  readPermission,
} from '../lib/push';
import { Alert } from './Field';

/** Turns Web Push on or off for this device. */
export function PushToggle() {
  const [on, setOn] = useState<boolean | null>(null);
  const [permission, setPermission] = useState<NotificationPermission | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const supported = pushSupported();

  // Re-read on return to the app: the user may have changed the permission in the settings.
  const refresh = useCallback(async () => {
    if (!supported) return;
    const p = await readPermission();
    setPermission(p);
    const sub = await currentPushSubscription().catch(() => null);
    setOn(sub !== null && p === 'granted');
  }, [supported]);

  useEffect(() => {
    void refresh();
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    let status: PermissionStatus | null = null;
    navigator.permissions
      ?.query({ name: 'notifications' })
      .then((s) => {
        status = s;
        s.onchange = () => void refresh();
      })
      .catch(() => undefined);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
      if (status) status.onchange = null;
    };
  }, [refresh]);

  async function toggle() {
    setBusy(true);
    setError(null);
    try {
      if (on) await disablePush();
      else await enablePush();
      setOn(!on);
    } catch (err) {
      setError(err instanceof Error && !('status' in err) ? err.message : errorMessage(err));
    } finally {
      setBusy(false);
      void readPermission().then(setPermission);
    }
  }

  const denied = permission === 'denied';

  return (
    <div className="card stack">
      <h2>{nl.notifications.pushTitle}</h2>
      {!supported ? (
        <p className="muted">
          {isIos() && !isStandalone() ? nl.notifications.pushIos : nl.notifications.pushUnsupported}
        </p>
      ) : (
        <>
          <p className="muted">
            {denied ? pushDeniedMessage() : on ? nl.notifications.pushOn : nl.notifications.pushHint}
          </p>
          {on !== null && !denied && (
            <button
              type="button"
              className={`btn ${on ? 'btn-secondary' : 'btn-primary'} align-start`}
              disabled={busy}
              onClick={() => void toggle()}
            >
              {on ? nl.notifications.pushDisable : nl.notifications.pushEnable}
            </button>
          )}
          {denied && (
            <button
              type="button"
              className="btn btn-secondary align-start"
              onClick={() => void refresh()}
            >
              {nl.notifications.pushRecheck}
            </button>
          )}
        </>
      )}
      {error && !denied && <Alert kind="error">{error}</Alert>}
    </div>
  );
}
