import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError, tokenStore } from '../api';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('api client', () => {
  beforeEach(() => {
    tokenStore.clear();
    vi.restoreAllMocks();
  });

  it('attaches bearer token and parses JSON', async () => {
    tokenStore.set({ accessToken: 'a1', refreshToken: 'r1' });
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse(200, { ok: true }));

    const out = await api<{ ok: boolean }>('/driver/auth/me');

    expect(out).toEqual({ ok: true });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Headers).get('Authorization')).toBe('Bearer a1');
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

  it('refreshes once on concurrent 401s and retries both', async () => {
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
    // both retried with the new token
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
