import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError, migrateStoredDriverTokens, tokenStore } from '../api';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function setCookie(value: string) {
  Object.defineProperty(document, 'cookie', { configurable: true, value });
}

describe('api client', () => {
  beforeEach(() => {
    tokenStore.clear();
    setCookie('');
    vi.restoreAllMocks();
  });

  afterEach(() => {
    setCookie('');
  });

  it('attaches bearer token and parses JSON for legacy clients', async () => {
    tokenStore.set({ accessToken: 'a1', refreshToken: 'r1' });
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(200, { ok: true }));

    const out = await api<{ ok: boolean }>('/driver/auth/me');

    expect(out).toEqual({ ok: true });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Headers).get('Authorization')).toBe('Bearer a1');
    expect(init.credentials).toBe('include');
  });

  it('parses backend error envelope into ApiError', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(409, { error: { code: 'conflict', message: 'Email taken', details: {} } })
    );

    const err = await api('/driver/auth/register', { auth: false }).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    const apiErr = err as ApiError;
    expect(apiErr.status).toBe(409);
    expect(apiErr.code).toBe('conflict');
    expect(apiErr.message).toBe('Email taken');
  });

  it('requests cookie mode for login and does not store returned null tokens', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(200, { accessToken: null, refreshToken: null, expiresIn: 900 })
    );

    await api('/driver/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'synthetic@example.com', password: 'synthetic' }),
      auth: false,
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Headers).get('X-Auth-Mode')).toBe('cookie');
    expect(tokenStore.get()).toEqual({ access: null, refresh: null });
  });

  it('sends CSRF and cookies for cookie-authenticated mutations, never bearer', async () => {
    setCookie('pv_driver_csrf=csrf-test');
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(200, { ok: true }));

    await api('/driver/auth/me', { method: 'PATCH', body: JSON.stringify({ fullName: 'Synthetic' }) });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Headers;
    expect(headers.get('X-Auth-Mode')).toBe('cookie');
    expect(headers.get('X-CSRF-Token')).toBe('csrf-test');
    expect(headers.get('Authorization')).toBeNull();
    expect(init.credentials).toBe('include');
  });

  it('migrates legacy refresh credentials and clears readable token storage', async () => {
    tokenStore.set({ accessToken: 'legacy-access', refreshToken: 'legacy-refresh' });
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
      expect((init?.headers as Headers).get('X-Auth-Mode')).toBe('cookie');
      setCookie('pv_driver_csrf=migrated-csrf');
      return jsonResponse(200, { accessToken: null, refreshToken: null, expiresIn: 900 });
    });

    await expect(migrateStoredDriverTokens()).resolves.toBe(true);

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(tokenStore.get()).toEqual({ access: null, refresh: null });
  });

  it('clears legacy tokens after failed migration', async () => {
    tokenStore.set({ accessToken: 'legacy-access', refreshToken: 'legacy-refresh' });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(401, { error: { code: 'unauthorized' } })
    );

    await expect(migrateStoredDriverTokens()).resolves.toBe(false);
    expect(tokenStore.get()).toEqual({ access: null, refresh: null });
  });

  it('refreshes once on concurrent 401s and retries both legacy requests', async () => {
    tokenStore.set({ accessToken: 'a1', refreshToken: 'r1' });
    const calls: { url: string; auth: string | null }[] = [];

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
      const auth = (init?.headers as Headers | undefined)?.get?.('Authorization') ?? null;
      calls.push({ url: String(url), auth });
      if (String(url).endsWith('/driver/auth/refresh')) {
        return jsonResponse(200, { accessToken: 'a2', refreshToken: 'r2', expiresIn: 900 });
      }
      if (auth === 'Bearer a1') return jsonResponse(401, { error: { code: 'unauthorized' } });
      return jsonResponse(200, { ok: true });
    });

    await Promise.all([api('/x'), api('/y')]);

    expect(calls.filter((c) => c.url.endsWith('/driver/auth/refresh'))).toHaveLength(1);
    expect(tokenStore.get().access).toBe('a2');
    expect(calls.filter((c) => c.auth === 'Bearer a2')).toHaveLength(2);
  });

  it('clears tokens and emits pv:logout when refresh fails', async () => {
    tokenStore.set({ accessToken: 'a1', refreshToken: 'r1' });
    const logout = vi.fn();
    window.addEventListener('pv:logout', logout);

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      if (String(url).endsWith('/driver/auth/refresh')) {
        return jsonResponse(401, { error: { code: 'unauthorized' } });
      }
      return jsonResponse(401, { error: { code: 'unauthorized' } });
    });

    await expect(api('/x')).rejects.toBeInstanceOf(ApiError);
    expect(tokenStore.get()).toEqual({ access: null, refresh: null });
    expect(logout).toHaveBeenCalledOnce();
    window.removeEventListener('pv:logout', logout);
  });
});
