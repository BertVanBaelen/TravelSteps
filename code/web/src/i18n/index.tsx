import { useCallback, useEffect, useSyncExternalStore, type ReactNode } from 'react';
import type { Language, PublicUser } from '@travelsteps/shared';
import { ApiError, api } from '../api';
import { useAuth } from '../auth/AuthContext';
import { getLanguage, messagesFor, setLanguage, subscribeLanguage, type Messages } from './store';

export {
  browserLanguage,
  currentLocale,
  getLanguage,
  messages,
  setLanguage,
  type Messages,
} from './store';

/** A choice made offline that still has to be stored on the server (value: user id). */
const PENDING_KEY = 'travelsteps.language.pending';

function pendingFor(): string | null {
  try {
    return localStorage.getItem(PENDING_KEY);
  } catch {
    return null;
  }
}

function setPending(userId: string | null): void {
  try {
    if (userId) localStorage.setItem(PENDING_KEY, userId);
    else localStorage.removeItem(PENDING_KEY);
  } catch {
    // Storage unavailable: the choice is sent again the next time it is changed.
  }
}

export const useLanguage = (): Language => useSyncExternalStore(subscribeLanguage, getLanguage);

/** Texts in the current language; the component re-renders when the language changes. */
export const useT = (): Messages => messagesFor(useLanguage());

async function sendLanguage(language: Language): Promise<PublicUser> {
  const r = await api<{ user: PublicUser }>('/profile', { method: 'PATCH', body: { language } });
  return r.user;
}

/**
 * Changes the language of the logged-in user: applied at once on this device, stored on the
 * server (or later, when offline). Resolves to false when it is waiting for a connection.
 */
export function useChooseLanguage(): (language: Language) => Promise<boolean> {
  const { user, setUser } = useAuth();
  return useCallback(
    async (language: Language) => {
      setLanguage(language);
      if (!user) return true;
      setPending(user.id);
      try {
        setUser(await sendLanguage(language));
        setPending(null);
        return true;
      } catch (err) {
        if (err instanceof ApiError && err.status === 0) return false;
        setPending(null);
        throw err;
      }
    },
    [user, setUser],
  );
}

/** Follows the user's saved language and sends a choice made offline once back online. */
export function I18nProvider({ children }: { children: ReactNode }) {
  const { user, setUser } = useAuth();

  useEffect(() => {
    if (!user) return;
    const pending = pendingFor();
    if (pending && pending !== user.id) setPending(null);
    if (pending !== user.id) {
      if (user.language) setLanguage(user.language);
      return;
    }
    const flush = () => {
      if (pendingFor() !== user.id || !navigator.onLine) return;
      sendLanguage(getLanguage())
        .then((u) => {
          setPending(null);
          setUser(u);
        })
        .catch((err) => {
          if (!(err instanceof ApiError && err.status === 0)) setPending(null);
        });
    };
    flush();
    window.addEventListener('online', flush);
    return () => window.removeEventListener('online', flush);
  }, [user, setUser]);

  return children;
}
