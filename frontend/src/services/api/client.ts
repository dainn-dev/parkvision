/**
 * HTTP client for the FastAPI backend.
 * - Same-origin: requests go to /api/v1 which Vite proxies to the backend.
 * - Auth travels in HttpOnly cookies; mutations echo the vm_csrf cookie in X-CSRF-Token.
 * - Responses use either {data: ...} or a bare body; errors use {error: {code, message, details}}.
 * - On 401 the access token is refreshed once via /auth/refresh and the request retried.
 */

export interface ApiErrorShape {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  requestId?: string;
}

export class ApiError extends Error {
  code: string;
  status: number;
  details?: Record<string, unknown>;
  requestId?: string;

  constructor(status: number, shape: ApiErrorShape) {
    super(shape.message || shape.code || `HTTP ${status}`);
    this.status = status;
    this.code = shape.code ?? 'unknown';
    this.details = shape.details;
    this.requestId = shape.requestId;
  }
}

const readCookie = (name: string): string | null => {
  const m = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return m ? decodeURIComponent(m[1]) : null;
};

let refreshing: Promise<boolean> | null = null;

const refreshOnce = async (): Promise<boolean> => {
  if (!refreshing) {
    refreshing = fetch('/api/v1/auth/refresh', {
      method: 'POST',
      credentials: 'include',
      headers: { 'X-CSRF-Token': readCookie('vm_csrf') ?? '' },
    })
      .then((r) => r.ok)
      .catch(() => false)
      .finally(() => {
        setTimeout(() => {
          refreshing = null;
        }, 0);
      });
  }
  return refreshing;
};

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

async function request<T>(method: string, path: string, body?: unknown, opts?: { isForm?: boolean; retry?: boolean }): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined && !opts?.isForm) headers['Content-Type'] = 'application/json';
  if (MUTATING.has(method)) {
    const csrf = readCookie('vm_csrf');
    if (csrf) headers['X-CSRF-Token'] = csrf;
  }

  const res = await fetch(`/api/v1${path}`, {
    method,
    credentials: 'include',
    headers,
    body: body === undefined ? undefined : opts?.isForm ? (body as FormData) : JSON.stringify(body),
  });

  if (res.status === 401 && (opts?.retry ?? true) && !path.startsWith('/auth/')) {
    if (await refreshOnce()) return request<T>(method, path, body, { ...opts, retry: false });
  }

  const text = await res.text();
  let json: any = undefined;
  try {
    json = text ? JSON.parse(text) : undefined;
  } catch {
    json = undefined;
  }

  if (!res.ok) {
    const err = json?.error ?? { code: `http_${res.status}`, message: res.statusText };
    throw new ApiError(res.status, { ...err, requestId: json?.requestId });
  }

  // Some endpoints wrap payloads in {data: ...}; others return the body directly.
  // Paged responses come back as {data: [...], meta: {...}} — keep them whole.
  if (json && typeof json === 'object' && 'data' in json && !('meta' in json)) return json.data as T;
  return json as T;
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  postForm: <T>(path: string, form: FormData) => request<T>('POST', path, form, { isForm: true }),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
  del: <T>(path: string) => request<T>('DELETE', path),
};

export { readCookie };
