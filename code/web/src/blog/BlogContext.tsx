import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { isTraveller, type Traveller } from '@travelsteps/shared';
import { api } from '../api';
import { useUser } from '../auth/AuthContext';

/** '' = everyone's blog. */
export const EVERYONE = '';

interface BlogState {
  /** Blogs (travellers) the user can see; null while loading. */
  travellers: Traveller[] | null;
  /** Selected traveller id, or EVERYONE. */
  selected: string;
  select: (id: string) => void;
  /** Turns notifications about a traveller's blog on or off. */
  setSubscribed: (id: string, on: boolean) => Promise<void>;
  reloadTravellers: () => void;
  unread: number;
  refreshUnread: () => void;
  setUnread: (n: number) => void;
}

const Ctx = createContext<BlogState | null>(null);

const storageKey = (userId: string) => `travelsteps.blog.${userId}`;
const UNREAD_POLL_MS = 60_000;

function readStored(userId: string): string | null {
  try {
    return localStorage.getItem(storageKey(userId));
  } catch {
    return null;
  }
}

export function BlogProvider({ children }: { children: ReactNode }) {
  const user = useUser();
  const [travellers, setTravellers] = useState<Traveller[] | null>(null);
  const [stored, setStored] = useState<string | null>(() => readStored(user.id));
  const [unread, setUnread] = useState(0);

  const reloadTravellers = useCallback(() => {
    api<{ travellers: Traveller[] }>('/travellers')
      .then((r) => setTravellers(r.travellers))
      .catch(() => setTravellers((t) => t ?? []));
  }, []);

  const refreshUnread = useCallback(() => {
    api<{ unread: number }>('/notifications/unread')
      .then((r) => setUnread(r.unread))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    setStored(readStored(user.id));
    reloadTravellers();
    refreshUnread();
  }, [user.id, reloadTravellers, refreshUnread]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') refreshUnread();
    }, UNREAD_POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') refreshUnread();
    };
    document.addEventListener('visibilitychange', onVisible);
    // The service worker tells open pages about a new push message.
    const onMessage = (e: MessageEvent) => {
      if ((e.data as { type?: string } | null)?.type === 'push') refreshUnread();
    };
    navigator.serviceWorker?.addEventListener('message', onMessage);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      navigator.serviceWorker?.removeEventListener('message', onMessage);
    };
  }, [refreshUnread]);

  // Travellers start on their own blog, viewers on everyone's; a stored choice wins while visible.
  const selected = useMemo(() => {
    if (stored !== null && (stored === EVERYONE || travellers === null || travellers.some((t) => t.id === stored))) {
      return stored;
    }
    return isTraveller(user.role) && travellers?.some((t) => t.id === user.id) ? user.id : EVERYONE;
  }, [stored, travellers, user.id, user.role]);

  const select = useCallback(
    (id: string) => {
      setStored(id);
      try {
        localStorage.setItem(storageKey(user.id), id);
      } catch {
        // Private mode: the choice lasts for this page only.
      }
    },
    [user.id],
  );

  const setSubscribed = useCallback(async (id: string, on: boolean) => {
    await api(`/travellers/${id}/subscription`, { method: on ? 'PUT' : 'DELETE' });
    setTravellers((list) => list?.map((t) => (t.id === id ? { ...t, subscribed: on } : t)) ?? null);
  }, []);

  return (
    <Ctx.Provider
      value={{ travellers, selected, select, setSubscribed, reloadTravellers, unread, refreshUnread, setUnread }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useBlog(): BlogState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('BlogProvider is missing');
  return ctx;
}

/** Adds `traveller=…` for the selected blog (nothing for everyone). */
export function withTraveller(q: URLSearchParams, selected: string): URLSearchParams {
  if (selected) q.set('traveller', selected);
  return q;
}
