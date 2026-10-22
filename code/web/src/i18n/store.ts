import { DEFAULT_LANGUAGE, isLanguage, type Language } from '@travelsteps/shared';
import { en } from './locales/en';
import { nl, type Messages } from './locales/nl';

export type { Messages };

const MESSAGES: Record<Language, Messages> = { nl, en };
const LOCALES: Record<Language, string> = { nl: 'nl-NL', en: 'en-GB' };
const STORAGE_KEY = 'travelsteps.language';

/** First browser language starting with "en" → English, anything else → Dutch. */
export function browserLanguage(): Language {
  const list =
    typeof navigator === 'undefined'
      ? []
      : navigator.languages?.length
        ? navigator.languages
        : [navigator.language];
  return list[0]?.toLowerCase().startsWith('en') ? 'en' : DEFAULT_LANGUAGE;
}

function storedLanguage(): Language | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return isLanguage(value) ? value : null;
  } catch {
    return null;
  }
}

let current: Language = storedLanguage() ?? browserLanguage();
const listeners = new Set<() => void>();

function applyDocument(): void {
  if (typeof document !== 'undefined') document.documentElement.lang = current;
}
applyDocument();

export const getLanguage = (): Language => current;
export const messagesFor = (language: Language): Messages => MESSAGES[language];
/** Texts in the current language, for code outside React components. */
export const messages = (): Messages => MESSAGES[current];
/** BCP 47 locale for dates and numbers. */
export const currentLocale = (): string => LOCALES[current];

export function subscribeLanguage(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Switches the UI language and remembers it on this device. */
export function setLanguage(language: Language): void {
  try {
    localStorage.setItem(STORAGE_KEY, language);
  } catch {
    // Storage unavailable (private mode): the choice lasts until the page is closed.
  }
  if (language === current) return;
  current = language;
  applyDocument();
  listeners.forEach((l) => l());
}
