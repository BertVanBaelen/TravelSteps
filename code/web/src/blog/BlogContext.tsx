import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { isTraveller, type Traveller, type TravelSummary } from '@travelsteps/shared';
import { api } from '../api';
import { useUser } from '../auth/AuthContext';
import { isAuthorOf } from '../lib/travel';

/** '' = everyone's blog. */
export const EVERYONE = '';
/** '' = all travels of the selected blog. */
export const ALL_TRAVELS = '';

interface BlogState {
  /** Blogs (travellers) the user can see; null while loading. */
  travellers: Traveller[] | null;
  /** Selected traveller id, or EVERYONE. */
  selected: string;
  select: (id: string) => void;
  /** Every travel the user may see; null while loading. */
  allTravels: TravelSummary[] | null;
  /** Travels of the selected blog (all of them for EVERYONE); null while loading. */
  travels: TravelSummary[] | null;
  /** Selected travel id within the selected blog, or ALL_TRAVELS. */
  travelId: string;
  selectTravel: (id: string) => void;
  reloadTravels: () => void;
  /** Turns notifications about a traveller's blog on or off. */
  setSubscribed: (id: string, on: boolean) => Promise<void>;
  reloadTravellers: () => void;
  unread: number;
  refreshUnread: () => void;
  setUnread: (n: number) => void;
}

const Ctx = createContext<BlogState | null>(null);

const storageKey = (userId: string) => `travelsteps.blog.${userId}`;
const travelKey = (userId: string) => `travelsteps.travel.${userId}`;
const UNREAD_POLL_MS = 60_000;

function readStored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStored(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Private mode: the choice lasts for this page only.
  }
}

export function BlogProvider({ children }: { children: ReactNode }) {
  const user = useUser();
  const [travellers, setTravellers] = useState<Traveller[] | null>(null);
  const [stored, setStored] = useState<string | null>(() => readStored(storageKey(user.id)));
  const [allTravels, setAllTravels] = useState<TravelSummary[] | null>(null);
  const [storedTravel, setStoredTravel] = useState<string>(
    () => readStored(travelKey(user.id)) ?? ALL_TRAVELS,
  );
  const [unread, setUnread] = useState(0);

  const reloadTravellers = useCallback(() => {
    api<{ travellers: Traveller[] }>('/travellers')
      .then((r) => setTravellers(r.travellers))
      .catch(() => setTravellers((t) => t ?? []));
  }, []);

  const reloadTravels = useCallback(() => {
    api<{ travels: TravelSummary[] }>('/travels')
      .then((r) => setAllTravels(r.travels))
      .catch(() => setAllTravels((t) => t ?? []));
  }, []);

  const refreshUnread = useCallback(() => {
    api<{ unread: number }>('/notifications/unread')
      .then((r) => setUnread(r.unread))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    setStored(readStored(storageKey(user.id)));
    setStoredTravel(readStored(travelKey(user.id)) ?? ALL_TRAVELS);
    reloadTravellers();
    reloadTravels();
    refreshUnread();
  }, [user.id, reloadTravellers, reloadTravels, refreshUnread]);

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
    if (
      stored !== null &&
      (stored === EVERYONE || travellers === null || travellers.some((t) => t.id === stored))
    ) {
      return stored;
    }
    return isTraveller(user.role) && travellers?.some((t) => t.id === user.id) ? user.id : EVERYONE;
  }, [stored, travellers, user.id, user.role]);

  const select = useCallback(
    (id: string) => {
      setStored(id);
      writeStored(storageKey(user.id), id);
    },
    [user.id],
  );

  const travels = useMemo(
    () => allTravels?.filter((t) => selected === EVERYONE || isAuthorOf(t, selected)) ?? null,
    [allTravels, selected],
  );

  // A travel that is not (or no longer) in the selected blog falls back to all travels.
  const travelId =
    storedTravel !== ALL_TRAVELS && (travels === null || travels.some((t) => t.id === storedTravel))
      ? storedTravel
      : ALL_TRAVELS;

  const selectTravel = useCallback(
    (id: string) => {
      setStoredTravel(id);
      writeStored(travelKey(user.id), id);
    },
    [user.id],
  );

  const setSubscribed = useCallback(async (id: string, on: boolean) => {
    await api(`/travellers/${id}/subscription`, { method: on ? 'PUT' : 'DELETE' });
    setTravellers((list) => list?.map((t) => (t.id === id ? { ...t, subscribed: on } : t)) ?? null);
  }, []);

  return (
    <Ctx.Provider
      value={{
        travellers,
        selected,
        select,
        allTravels,
        travels,
        travelId,
        selectTravel,
        reloadTravels,
        setSubscribed,
        reloadTravellers,
        unread,
        refreshUnread,
        setUnread,
      }}
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
