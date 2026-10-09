import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { PublicUser } from '@travelsteps/shared';
import { ApiError, api, onUnauthorized } from '../api';
import { disablePush } from '../lib/push';

interface AuthState {
  user: PublicUser | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  setUser: (user: PublicUser) => void;
}

const AuthContext = createContext<AuthState | null>(null);

const USER_KEY = 'travelsteps.user';

function cachedUser(): PublicUser | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as PublicUser) : null;
  } catch {
    return null;
  }
}

function storeUser(user: PublicUser | null): void {
  try {
    if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
    else localStorage.removeItem(USER_KEY);
  } catch {
    // Storage unavailable (private mode): only offline start-up is affected.
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUserRaw] = useState<PublicUser | null>(null);
  const [loading, setLoading] = useState(true);

  const setUserState = useCallback((u: PublicUser | null) => {
    storeUser(u);
    setUserRaw(u);
  }, []);

  useEffect(() => {
    api<{ user: PublicUser }>('/auth/me')
      .then((r) => setUserState(r.user))
      .catch((err) => {
        // Offline: keep using the app with the last known user (content comes from the cache).
        if (err instanceof ApiError && err.status === 0) {
          setUserRaw(cachedUser());
          return;
        }
        if (!(err instanceof ApiError && err.status === 401)) console.error(err);
        setUserState(null);
      })
      .finally(() => setLoading(false));
    return onUnauthorized(() => setUserState(null));
  }, [setUserState]);

  const login = useCallback(async (username: string, password: string) => {
    const r = await api<{ user: PublicUser }>('/auth/login', {
      method: 'POST',
      body: { username, password },
    });
    setUserState(r.user);
  }, [setUserState]);

  const logout = useCallback(async () => {
    // Stop push messages to this device while it is still authenticated.
    await disablePush().catch(() => undefined);
    try {
      await api('/auth/logout', { method: 'POST' });
    } finally {
      setUserState(null);
      // Cached API responses contain per-user data (likedByMe); media and tiles may stay.
      if ('caches' in window) void caches.delete('travelsteps-api').catch(() => undefined);
    }
  }, [setUserState]);

  const setUser = useCallback((u: PublicUser) => setUserState(u), [setUserState]);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, setUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth moet binnen AuthProvider gebruikt worden');
  return ctx;
}

/** Same as useAuth but asserts a logged-in user. */
export function useUser(): PublicUser {
  const { user } = useAuth();
  if (!user) throw new Error('Geen ingelogde gebruiker');
  return user;
}
