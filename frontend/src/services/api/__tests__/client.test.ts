import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError, MFA_ENROLLMENT_REQUIRED_EVENT } from '../client';

const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('api client: mfa_enrollment_required', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('fires the enrollment event and still rejects with the ApiError', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(403, { error: { code: 'mfa_enrollment_required', message: 'Enroll MFA first' } }))
    );
    const listener = vi.fn();
    window.addEventListener(MFA_ENROLLMENT_REQUIRED_EVENT, listener);
    try {
      const err = (await api.get('/platform/tenants').catch((e: unknown) => e)) as ApiError;
      expect(err).toBeInstanceOf(ApiError);
      expect(err.code).toBe('mfa_enrollment_required');
      expect(err.status).toBe(403);
      expect(listener).toHaveBeenCalledTimes(1);
    } finally {
      window.removeEventListener(MFA_ENROLLMENT_REQUIRED_EVENT, listener);
    }
  });

  it('does not fire for other 403s', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(403, { error: { code: 'forbidden', message: 'no' } })));
    const listener = vi.fn();
    window.addEventListener(MFA_ENROLLMENT_REQUIRED_EVENT, listener);
    try {
      await expect(api.get('/platform/tenants')).rejects.toBeInstanceOf(ApiError);
      expect(listener).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener(MFA_ENROLLMENT_REQUIRED_EVENT, listener);
    }
  });
});
