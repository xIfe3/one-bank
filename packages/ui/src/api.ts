export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export interface ApiOptions {
  baseUrl: string;
  /** e.g. /auth/refresh or /admin/auth/refresh */
  refreshPath: string;
  onUnauthorized?: () => void;
  onMaintenance?: (message: string) => void;
}

function readCookie(name: string): string | undefined {
  if (typeof document === 'undefined') return undefined;
  return document.cookie
    .split('; ')
    .find((c) => c.startsWith(name + '='))
    ?.split('=')[1];
}

/**
 * Fetch wrapper: cookies, double-submit CSRF, single-flight token refresh on 401,
 * and a normalised ApiError carrying the API's stable error codes.
 */
export function createApi(opts: ApiOptions) {
  let csrfPromise: Promise<string> | null = null;
  let refreshPromise: Promise<boolean> | null = null;

  async function csrf(): Promise<string> {
    const existing = readCookie('ob_csrf');
    if (existing) return existing;
    csrfPromise ??= fetch(`${opts.baseUrl}/csrf`, { credentials: 'include' })
      .then((r) => r.json())
      .then((j: { csrfToken: string }) => j.csrfToken)
      .finally(() => {
        csrfPromise = null;
      });
    return csrfPromise;
  }

  async function refresh(): Promise<boolean> {
    refreshPromise ??= fetch(`${opts.baseUrl}${opts.refreshPath}`, { method: 'POST', credentials: 'include', headers: { 'x-csrf-token': await csrf() } })
      .then((r) => r.ok)
      .catch(() => false)
      .finally(() => {
        setTimeout(() => (refreshPromise = null), 0);
      });
    return refreshPromise;
  }

  async function raw(method: string, path: string, body?: unknown, retry = true): Promise<Response> {
    const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
    const headers: Record<string, string> = {};
    if (!isForm && body !== undefined) headers['Content-Type'] = 'application/json';
    if (method !== 'GET') headers['x-csrf-token'] = await csrf();
    const res = await fetch(`${opts.baseUrl}${path}`, {
      method,
      credentials: 'include',
      headers,
      body: body === undefined ? undefined : isForm ? (body as FormData) : JSON.stringify(body),
    });
    if (res.status === 401 && retry && !path.includes('/auth/')) {
      if (await refresh()) return raw(method, path, body, false);
      opts.onUnauthorized?.();
    }
    if (res.status === 403) {
      // CSRF cookie may have rotated/expired: fetch a new one and retry once.
      const clone = res.clone();
      const j = await clone.json().catch(() => null);
      if (retry && j?.error?.message?.includes('CSRF')) {
        document.cookie = 'ob_csrf=; Max-Age=0; path=/';
        return raw(method, path, body, false);
      }
    }
    return res;
  }

  async function request<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
    let res: Response;
    try {
      res = await raw(method, path, body);
    } catch {
      throw new ApiError(0, 'NETWORK', 'Unable to reach One Bank. Check your connection and try again.');
    }
    const ct = res.headers.get('content-type') ?? '';
    const data = ct.includes('application/json') ? await res.json() : await res.text();
    if (!res.ok) {
      const err = (data as { error?: { code: string; message: string; details?: unknown } })?.error;
      if (res.status === 503 && err?.code === 'MAINTENANCE') opts.onMaintenance?.(err.message);
      throw new ApiError(res.status, err?.code ?? 'UNKNOWN', err?.message ?? 'Something went wrong', err?.details);
    }
    return data as T;
  }

  async function download(method: string, path: string, body: unknown, filename: string) {
    const res = await raw(method, path, body);
    if (!res.ok) {
      const j = await res.json().catch(() => null);
      throw new ApiError(res.status, j?.error?.code ?? 'UNKNOWN', j?.error?.message ?? 'Download failed');
    }
    const ct = res.headers.get('content-type') ?? '';
    if (ct.includes('application/json')) return res.json();
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    return null;
  }

  /** Open a binary resource (PDF/image) in a new tab via an authenticated fetch. */
  async function open(path: string) {
    const res = await raw('GET', path);
    if (!res.ok) throw new ApiError(res.status, 'UNKNOWN', 'Could not open file');
    const url = URL.createObjectURL(await res.blob());
    window.open(url, '_blank', 'noopener');
  }

  return {
    get: <T = unknown>(p: string) => request<T>('GET', p),
    post: <T = unknown>(p: string, b?: unknown) => request<T>('POST', p, b ?? {}),
    put: <T = unknown>(p: string, b?: unknown) => request<T>('PUT', p, b ?? {}),
    patch: <T = unknown>(p: string, b?: unknown) => request<T>('PATCH', p, b ?? {}),
    del: <T = unknown>(p: string) => request<T>('DELETE', p),
    download,
    open,
    baseUrl: opts.baseUrl,
  };
}

export type Api = ReturnType<typeof createApi>;

export const newIdempotencyKey = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36));

export function qs(params: Record<string, string | number | boolean | undefined | null>) {
  const s = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') s.set(k, String(v));
  });
  const str = s.toString();
  return str ? `?${str}` : '';
}
