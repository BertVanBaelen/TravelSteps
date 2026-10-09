import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { nl } from '../i18n/nl';

export interface ConfirmOptions {
  message: string;
  title?: string;
  /** Label of the confirm button (default "OK"). */
  confirmLabel?: string;
  /** Red confirm button, for destructive actions. */
  danger?: boolean;
}

type Confirm = (options: ConfirmOptions | string) => Promise<boolean>;

const ConfirmContext = createContext<Confirm | null>(null);

interface Pending extends ConfirmOptions {
  resolve: (ok: boolean) => void;
}

/** In-app replacement for window.confirm, in the style of the app. */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null);
  const confirmButton = useRef<HTMLButtonElement>(null);

  const confirm = useCallback<Confirm>(
    (options) =>
      new Promise<boolean>((resolve) => {
        const opts = typeof options === 'string' ? { message: options } : options;
        setPending((current) => {
          current?.resolve(false);
          return { ...opts, resolve };
        });
      }),
    [],
  );

  const close = useCallback(
    (ok: boolean) => {
      pending?.resolve(ok);
      setPending(null);
    },
    [pending],
  );

  useEffect(() => {
    if (!pending) return;
    confirmButton.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pending, close]);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {pending && (
        <div className="dialog-backdrop" onClick={() => close(false)}>
          <div
            className="dialog dialog-small card stack"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby={pending.title ? 'confirm-title' : undefined}
            aria-describedby="confirm-message"
            onClick={(e) => e.stopPropagation()}
          >
            {pending.title && <h2 id="confirm-title">{pending.title}</h2>}
            <p id="confirm-message">{pending.message}</p>
            <div className="row-actions">
              <button type="button" className="btn btn-secondary" onClick={() => close(false)}>
                {nl.common.cancel}
              </button>
              <button
                ref={confirmButton}
                type="button"
                className={`btn ${pending.danger ? 'btn-danger' : 'btn-primary'}`}
                onClick={() => close(true)}
              >
                {pending.confirmLabel ?? nl.common.ok}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

/** Returns a function that shows a confirm dialog and resolves to the user's choice. */
export function useConfirm(): Confirm {
  const confirm = useContext(ConfirmContext);
  if (!confirm) throw new Error('useConfirm must be used inside ConfirmProvider');
  return confirm;
}
