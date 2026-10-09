import { CSRF_HEADER, CSRF_VALUE, type ApiErrorBody } from '@travelsteps/shared';
import { nl } from './i18n/nl';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
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
    throw new ApiError(0, 'NETWORK', nl.errors.network);
  }

  if (res.status === 204) return undefined as T;
  const data = (await res.json().catch(() => null)) as (T & Partial<ApiErrorBody>) | null;
  if (!res.ok) {
    const err = new ApiError(
      res.status,
      data?.error ?? 'UNKNOWN',
      data?.message ?? nl.errors.generic,
    );
    if (res.status === 401 && path !== '/auth/login') {
      unauthorizedListeners.forEach((l) => l(err));
    }
    throw err;
  }
  return data as T;
}

export function errorMessage(err: unknown): string {
  return err instanceof ApiError ? err.message : nl.errors.generic;
}
