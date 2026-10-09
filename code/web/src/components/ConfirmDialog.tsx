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
import { AlertIcon, CheckIcon, CloseIcon, InfoIcon, TrashIcon } from './icons';

export interface ConfirmOptions {
  message: string;
  /** Dialog title; defaults to a generic question. */
  title?: string;
  /** Label of the confirm button (default "OK"). */
  confirmLabel?: string;
  /** Red confirm button, for destructive actions. */
  danger?: boolean;
  /** Icon on the confirm button (default: trash for danger, check otherwise). */
  icon?: ReactNode;
}

type Confirm = (options: ConfirmOptions | string) => Promise<boolean>;

const ConfirmContext = createContext<Confirm | null>(null);

interface Pending extends ConfirmOptions {
  resolve: (ok: boolean) => void;
}

/** Duration of the closing animation; keep in sync with `.confirm-*.closing` in styles.css. */
const CLOSE_MS = 180;

/** In-app replacement for window.confirm, in the style of the app. */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null);
  const [closing, setClosing] = useState(false);
  const confirmButton = useRef<HTMLButtonElement>(null);
  const closeTimer = useRef<number | undefined>(undefined);

  const confirm = useCallback<Confirm>(
    (options) =>
      new Promise<boolean>((resolve) => {
        const opts = typeof options === 'string' ? { message: options } : options;
        window.clearTimeout(closeTimer.current);
        setClosing(false);
        setPending((current) => {
          current?.resolve(false);
          return { ...opts, resolve };
        });
      }),
    [],
  );

  const close = useCallback(
    (ok: boolean) => {
      if (!pending || closing) return;
      pending.resolve(ok);
      setClosing(true);
      closeTimer.current = window.setTimeout(() => {
        setPending(null);
        setClosing(false);
      }, CLOSE_MS);
    },
    [pending, closing],
  );

  useEffect(() => () => window.clearTimeout(closeTimer.current), []);

  useEffect(() => {
    if (!pending || closing) return;
    confirmButton.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pending, closing, close]);

  const title = pending?.title ?? (pending?.danger ? nl.confirm.dangerTitle : nl.confirm.title);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {pending && (
        <div
          className={`dialog-backdrop confirm-backdrop${closing ? ' closing' : ''}`}
          onClick={() => close(false)}
        >
          <div
            className={`dialog dialog-small card confirm-dialog${pending.danger ? ' danger' : ''}${closing ? ' closing' : ''}`}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
            aria-describedby="confirm-message"
            onClick={(e) => e.stopPropagation()}
          >
            <span className="confirm-icon" aria-hidden>
              {pending.danger ? <AlertIcon /> : <InfoIcon />}
            </span>
            <h2 id="confirm-title">{title}</h2>
            <p id="confirm-message">{pending.message}</p>
            <div className="confirm-actions">
              <button type="button" className="btn btn-secondary" onClick={() => close(false)}>
                <CloseIcon />
                {nl.common.cancel}
              </button>
              <button
                ref={confirmButton}
                type="button"
                className={`btn ${pending.danger ? 'btn-danger' : 'btn-primary'}`}
                onClick={() => close(true)}
              >
                {pending.icon ?? (pending.danger ? <TrashIcon /> : <CheckIcon />)}
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
