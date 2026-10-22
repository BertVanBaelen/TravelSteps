import { api } from '../api';
import { messages } from '../i18n/store';
import { isAndroid, isStandalone } from './install';

/** Explains how to unblock notifications on this platform (a page cannot ask again once blocked). */
export function pushDeniedMessage(): string {
  if (isAndroid()) {
    return isStandalone()
      ? messages().notifications.pushDeniedAndroidApp
      : messages().notifications.pushDeniedAndroid;
  }
  return isStandalone()
    ? messages().notifications.pushDenied
    : messages().notifications.pushDeniedDesktop;
}

/** Current permission; the Permissions API is preferred because some browsers update it sooner. */
export async function readPermission(): Promise<NotificationPermission> {
  try {
    const status = await navigator.permissions?.query({ name: 'notifications' });
    if (status) return status.state === 'prompt' ? 'default' : status.state;
  } catch {
    // Not supported for notifications in every browser.
  }
  return Notification.permission;
}

/** Web Push needs a service worker, PushManager and the Notification API (iOS: only as installed app). */
export const pushSupported = (): boolean =>
  'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

function keyToBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const padded = (base64url + '='.repeat((4 - (base64url.length % 4)) % 4))
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const raw = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

async function registration(): Promise<ServiceWorkerRegistration | null> {
  if (!pushSupported()) return null;
  return (await navigator.serviceWorker.getRegistration()) ?? null;
}

export async function currentPushSubscription(): Promise<PushSubscription | null> {
  const reg = await registration();
  return reg ? reg.pushManager.getSubscription() : null;
}

/**
 * Asks for notification permission. Some browsers still use the old callback form, and some
 * resolve before `Notification.permission` is updated, so the result is checked both ways.
 */
async function requestPermission(): Promise<NotificationPermission> {
  if (Notification.permission === 'granted') return 'granted';
  const result = await new Promise<NotificationPermission>((resolve) => {
    const maybePromise = Notification.requestPermission((r) => resolve(r));
    if (maybePromise) void maybePromise.then(resolve, () => resolve(Notification.permission));
  });
  return result === 'granted' || (Notification.permission as NotificationPermission) === 'granted'
    ? 'granted'
    : result;
}

function sameKey(a: ArrayBuffer | null | undefined, b: Uint8Array): boolean {
  if (!a) return false;
  const x = new Uint8Array(a);
  return x.length === b.length && x.every((v, i) => v === b[i]);
}

function timeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => window.setTimeout(() => reject(new Error(message)), ms)),
  ]);
}

/** Asks permission, subscribes this device and registers it with the server. */
export async function enablePush(): Promise<void> {
  if (!pushSupported()) throw new Error(messages().notifications.pushUnsupported);
  // Must be the first await: browsers only show the question in direct response to a tap.
  const permission = await requestPermission();
  if (permission === 'denied') throw new Error(pushDeniedMessage());
  if (permission !== 'granted') throw new Error(messages().notifications.pushDismissed);
  const { publicKey } = await api<{ publicKey: string | null }>('/push/key');
  if (!publicKey) throw new Error(messages().notifications.pushNoServer);
  const key = keyToBytes(publicKey);
  const reg = await timeout(
    navigator.serviceWorker.ready,
    10_000,
    messages().notifications.pushNoWorker,
  );
  let sub = await reg.pushManager.getSubscription();
  // A subscription made with another server key (e.g. a new data folder) cannot be reused.
  if (sub && !sameKey(sub.options.applicationServerKey, key)) {
    await sub.unsubscribe().catch(() => undefined);
    sub = null;
  }
  if (!sub) {
    try {
      sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
    } catch (err) {
      console.warn('Push subscription failed', err);
      throw new Error(
        messages().notifications.pushSubscribeFailed(
          err instanceof Error ? err.message : String(err),
        ),
      );
    }
  }
  const json = sub.toJSON();
  await api('/push/subscriptions', {
    method: 'POST',
    body: { endpoint: json.endpoint, keys: { p256dh: json.keys?.p256dh, auth: json.keys?.auth } },
  });
}

/** Removes this device's subscription (server first, so a failure keeps both in sync). */
export async function disablePush(): Promise<void> {
  const sub = await currentPushSubscription();
  if (!sub) return;
  await api('/push/subscriptions', { method: 'DELETE', body: { endpoint: sub.endpoint } }).catch(
    () => undefined,
  );
  await sub.unsubscribe();
}
