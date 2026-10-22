import { useEffect, useRef, useState } from 'react';
import { useT } from '../i18n';
import { CheckIcon, CopyIcon } from './icons';

/** Copies text; falls back to a hidden textarea where the Clipboard API is unavailable (plain http). */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to the legacy way
  }
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.position = 'fixed';
  area.style.opacity = '0';
  document.body.appendChild(area);
  area.select();
  const ok = document.execCommand('copy');
  area.remove();
  return ok;
}

/** Button that copies `value` and briefly shows "Gekopieerd". */
export function CopyButton({
  value,
  label,
  className = 'btn btn-secondary',
}: {
  value: string;
  label?: string;
  className?: string;
}) {
  const msg = useT();
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  async function copy() {
    if (!(await copyText(value))) return;
    setCopied(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied(false), 2000);
  }

  return (
    <button
      type="button"
      className={`${className}${copied ? ' copied' : ''}`}
      onClick={() => void copy()}
      aria-live="polite"
    >
      {copied ? <CheckIcon /> : <CopyIcon />}
      {copied ? msg.users.copied : (label ?? msg.users.copy)}
    </button>
  );
}
