import { useEffect, useRef, type ReactNode, type RefObject } from 'react';

/** Closes a popup on Escape or a pointer press outside `ref`. */
export function useDismiss(open: boolean, ref: RefObject<HTMLElement | null>, close: () => void) {
  const closeRef = useRef(close);
  closeRef.current = close;
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) closeRef.current();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeRef.current();
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, ref]);
}

/**
 * Popup panel: a dropdown under its trigger on wide screens, a bottom sheet with a
 * backdrop on phones (see `.sheet` in styles.css).
 */
export function Sheet({ open, className, children }: { open: boolean; className?: string; children: ReactNode }) {
  if (!open) return null;
  return (
    <>
      <div className="sheet-backdrop" aria-hidden />
      <div className={`sheet${className ? ` ${className}` : ''}`}>{children}</div>
    </>
  );
}
