import { CSRF_HEADER, CSRF_VALUE, DEFAULT_LANGUAGE, type ApiErrorBody } from '@travelsteps/shared';
import { getLanguage, messages } from './i18n/store';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    /** The message came from the server (always Dutch). */
    public readonly fromServer = false,
  ) {
    super(message);
  }
}

type Listener = (err: ApiError) => void;
const unauthorizedListeners = new Set<Listener>();

/** Called whenever the server reports the session is gone (401). */
export function onUnauthorized(listener: Listener): () => void {
  unauthorizedListeners.add(listener);
  return () => unauthorizedListeners.delete(listener);
}

export async function api<T>(
  path: string,
  options: { method?: string; body?: unknown } = {},
): Promise<T> {
  const headers: Record<string, string> = { [CSRF_HEADER]: CSRF_VALUE };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';

  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method: options.method ?? 'GET',
      credentials: 'same-origin',
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'NETWORK', messages().errors.network);
  }

  if (res.status === 204) return undefined as T;
  const data = (await res.json().catch(() => null)) as (T & Partial<ApiErrorBody>) | null;
  if (!res.ok) {
    const err = new ApiError(
      res.status,
      data?.error ?? 'UNKNOWN',
      data?.message ?? messages().errors.generic,
      typeof data?.message === 'string',
    );
    if (res.status === 401 && path !== '/auth/login') {
      unauthorizedListeners.forEach((l) => l(err));
    }
    throw err;
  }
  return data as T;
}

/** Text for an error in the current language: by error code, the server message as fallback. */
export function errorMessage(err: unknown): string {
  const m = messages().errors;
  if (!(err instanceof ApiError)) return m.generic;
  if (err.status === 0) return m.network;
  // Server texts are Dutch and sometimes more specific (validation details, waiting time).
  if (err.fromServer && getLanguage() === DEFAULT_LANGUAGE) return err.message;
  const codes: Record<string, string | undefined> = m.codes;
  return (err.status === 429 ? codes[err.code] ?? m.codes.TOO_MANY_REQUESTS : codes[err.code]) ?? m.generic;
}
