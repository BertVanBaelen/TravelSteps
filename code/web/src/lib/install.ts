import { useEffect, useState } from 'react';

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

// Registered at start-up (imported from main.tsx): the event fires only once, early.
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferred = e as InstallPromptEvent;
  notify();
});
window.addEventListener('appinstalled', () => {
  deferred = null;
  notify();
});

export const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

export const isIos = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export const isAndroid = () => /android/i.test(navigator.userAgent);

export type InstallState = 'installed' | 'prompt' | 'ios' | 'unavailable';

export function useInstall(): { state: InstallState; install: () => Promise<void> } {
  const [, force] = useState(0);
  useEffect(() => {
    const l = () => force((n) => n + 1);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);
  const state: InstallState = isStandalone() ? 'installed' : deferred ? 'prompt' : isIos() ? 'ios' : 'unavailable';
  return {
    state,
    install: async () => {
      if (!deferred) return;
      await deferred.prompt();
      await deferred.userChoice;
      deferred = null;
      notify();
    },
  };
}
