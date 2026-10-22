import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { FootprintIcon, HeartIcon, PlaneIcon } from './icons';

export type CelebrationKind = 'step' | 'travel' | 'like' | 'invite';

interface Celebration {
  id: number;
  kind: CelebrationKind;
  /** Centre of the element that triggered it (like button), in viewport pixels. */
  x?: number;
  y?: number;
}

/** Resolves once the main part of the animation has played (immediately with reduced motion). */
type Celebrate = (kind: CelebrationKind, anchor?: Element | null) => Promise<void>;

const Ctx = createContext<Celebrate>(() => Promise.resolve());

/**
 * Shows an animation for something the user just did. Never rejects. Await it to let the
 * animation play before the action happens (creating a travel or step).
 */
export function useCelebrate(): Celebrate {
  return useContext(Ctx);
}

/** How long the overlay stays, and after how long the returned promise resolves. */
const TIMING: Record<CelebrationKind, { total: number; resolve: number }> = {
  travel: { total: 1300, resolve: 1000 },
  step: { total: 1300, resolve: 1000 },
  like: { total: 900, resolve: 0 },
  invite: { total: 1700, resolve: 0 },
};
const REDUCE = '(prefers-reduced-motion: reduce)';

function usePrefersReducedMotion(): boolean {
  const [reduce, setReduce] = useState(() => {
    try {
      return window.matchMedia(REDUCE).matches;
    } catch {
      return false;
    }
  });
  useEffect(() => {
    let mq: MediaQueryList;
    try {
      mq = window.matchMedia(REDUCE);
    } catch {
      return;
    }
    const onChange = (e: MediaQueryListEvent) => setReduce(e.matches);
    mq.addEventListener?.('change', onChange);
    return () => mq.removeEventListener?.('change', onChange);
  }, []);
  return reduce;
}

/**
 * Overlay for celebration animations. Mounted once around the routes so an animation keeps
 * playing while the page navigates away (e.g. right after publishing).
 */
export function CelebrationProvider({ children }: { children: ReactNode }) {
  const reduce = usePrefersReducedMotion();
  const reduceRef = useRef(reduce);
  reduceRef.current = reduce;
  const [items, setItems] = useState<Celebration[]>([]);
  const next = useRef(1);

  const celebrate = useCallback<Celebrate>((kind, anchor) => {
    try {
      if (reduceRef.current) return Promise.resolve();
      const item: Celebration = { id: next.current++, kind };
      if (anchor) {
        const r = anchor.getBoundingClientRect();
        item.x = r.left + r.width / 2;
        item.y = r.top + r.height / 2;
      }
      setItems((list) => [...list.slice(-3), item]);
      const { total, resolve } = TIMING[kind];
      window.setTimeout(
        () => setItems((list) => list.filter((i) => i.id !== item.id)),
        total + 100,
      );
      return new Promise<void>((done) => window.setTimeout(done, resolve));
    } catch {
      // A failed animation must never affect the action itself.
      return Promise.resolve();
    }
  }, []);

  return (
    <Ctx.Provider value={celebrate}>
      {children}
      {items.length > 0 && !reduce && (
        <div className="celebration-layer" aria-hidden>
          {items.map((c) => (
            <Animation key={c.id} c={c} />
          ))}
        </div>
      )}
    </Ctx.Provider>
  );
}

const CONFETTI_COLORS = ['var(--brand)', '#f59e0b', '#0284c7', 'var(--like)', '#7c3aed'];

function Animation({ c }: { c: Celebration }) {
  switch (c.kind) {
    case 'step':
      return (
        <div className="celebrate-full celebrate-steps">
          <span className="celebrate-flash" />
          {Array.from({ length: 10 }, (_, i) => (
            <span
              key={i}
              className={`footprint ${i % 2 ? 'right' : 'left'}`}
              style={
                { '--i': i, left: `${2 + i * 9.6}%`, top: `${78 - i * 6.6}%` } as CSSProperties
              }
            >
              <FootprintIcon />
            </span>
          ))}
        </div>
      );
    case 'travel':
      return (
        <div className="celebrate-full celebrate-plane">
          <span className="celebrate-flash sky" />
          {[0, 1, 2].map((i) => (
            <span key={i} className="cloud" style={{ '--i': i } as CSSProperties} />
          ))}
          <span className="plane">
            <span className="plane-body">
              <span className="plane-trail" />
              <PlaneIcon />
            </span>
          </span>
        </div>
      );
    case 'like':
      return (
        <>
          <div className="celebrate-full">
            <span className="big-heart">
              <HeartIcon filled />
            </span>
          </div>
          <div
            className="celebrate-hearts"
            style={{ left: c.x ?? window.innerWidth / 2, top: c.y ?? window.innerHeight / 2 }}
          >
            {Array.from({ length: 8 }, (_, i) => (
              <span
                key={i}
                className="burst-heart"
                style={{ '--a': `${i * 45}deg` } as CSSProperties}
              >
                <HeartIcon filled />
              </span>
            ))}
          </div>
        </>
      );
    case 'invite':
      return (
        <div className="celebrate-full celebrate-confetti">
          <span className="celebrate-flash party" />
          {Array.from({ length: 70 }, (_, i) => (
            <span
              key={i}
              className="confetti"
              style={
                {
                  left: `${(i * 37) % 100}%`,
                  width: `${6 + (i % 4) * 2}px`,
                  background: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
                  '--d': `${(i % 10) * 45}ms`,
                  '--x': `${((i * 53) % 120) - 60}px`,
                  '--r': `${(i * 97) % 720}deg`,
                } as CSSProperties
              }
            />
          ))}
        </div>
      );
  }
}
