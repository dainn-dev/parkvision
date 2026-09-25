import type { ApiErrorPayload } from './types';

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, '') ?? '/api/v1';
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function getCookie(name: string): string | undefined {
  const encodedName = `${encodeURIComponent(name)}=`;
  const value = document.cookie
    .split('; ')
    .find((entry) => entry.startsWith(encodedName))
    ?.slice(encodedName.length);
  return value ? decodeURIComponent(value) : undefined;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: Record<string, unknown>;
  readonly requestId?: string;

  constructor(status: number, payload?: Partial<ApiErrorPayload>, fallbackMessage?: string) {
    super(payload?.error?.message ?? fallbackMessage ?? `Request failed with status ${status}`);
    this.name = 'ApiError';
    this.status = status;
    this.code = payload?.error?.code ?? 'request_failed';
    this.details = payload?.error?.details;
    this.requestId = payload?.requestId;
  }
}

interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  retryAuth?: boolean;
  skipRefresh?: boolean;
}

async function parseBody(response: Response): Promise<unknown> {
  if (response.status === 204) return undefined;
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) return response.json();
  const text = await response.text();
  return text || undefined;
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const method = (options.method ?? 'GET').toUpperCase();
  const headers = new Headers(options.headers);
  headers.set('Accept', 'application/json');

  let body: BodyInit | undefined;
  if (options.body instanceof FormData || typeof options.body === 'string') {
    body = options.body;
  } else if (options.body !== undefined) {
    headers.set('Content-Type', 'application/json');
    body = JSON.stringify(options.body);
  }

  if (!SAFE_METHODS.has(method)) {
    const csrfToken = getCookie('vm_csrf');
    if (csrfToken) headers.set('X-CSRF-Token', csrfToken);
  }

  const { retryAuth, skipRefresh = false, ...fetchOptions } = options;
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...fetchOptions,
    method,
    body,
    headers,
    credentials: 'include',
  });

  if (response.status === 401 && !skipRefresh && retryAuth !== false && path !== '/auth/refresh') {
    try {
      await apiRequest('/auth/refresh', {
        method: 'POST',
        retryAuth: false,
        skipRefresh: true,
      });
      return apiRequest<T>(path, { ...options, retryAuth: false });
    } catch (refreshError) {
      if (!(refreshError instanceof ApiError) || refreshError.status !== 401) throw refreshError;
    }
  }

  const payload = await parseBody(response);
  if (!response.ok) {
    throw new ApiError(
      response.status,
      typeof payload === 'object' && payload !== null ? (payload as Partial<ApiErrorPayload>) : undefined,
      typeof payload === 'string' ? payload : response.statusText,
    );
  }

  return payload as T;
}
