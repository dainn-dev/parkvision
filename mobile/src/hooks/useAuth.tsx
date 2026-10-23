import { useCallback, useEffect, useState } from 'react';
import * as driverApi from '../api/driver';
import { migrateStoredDriverTokens, onLogout, tokenStore } from '../lib/api';
import { DriverProfile } from '../types';

const GUEST_KEY = 'pv_guest';

export type AuthStatus = 'loading' | 'guest' | 'authed' | 'unauthenticated';

export function useAuth() {
  const [user, setUser] = useState<DriverProfile | null>(null);
  const [status, setStatus] = useState<AuthStatus>('loading');

  useEffect(() => {
    let cancelled = false;
    if (tokenStore.hasAuth()) {
      // Exchange pre-cookie sessions first. Never send an old localStorage access
      // token if the refresh exchange failed.
      migrateStoredDriverTokens()
        .then((migrated) => (migrated ? driverApi.me() : null))
        .then((u) => {
          if (cancelled) return;
          if (u) {
            setUser(u);
            setStatus('authed');
          } else {
            setStatus('unauthenticated');
          }
        })
        .catch(() => {
          if (!cancelled) setStatus('unauthenticated');
        });
    } else {
      setStatus(localStorage.getItem(GUEST_KEY) === '1' ? 'guest' : 'unauthenticated');
    }
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(
    () =>
      onLogout(() => {
        setUser(null);
        setStatus('unauthenticated');
      }),
    []
  );

  const login = useCallback(async (email: string, password: string) => {
    const u = await driverApi.login(email, password);
    localStorage.removeItem(GUEST_KEY);
    setUser(u);
    setStatus('authed');
  }, []);

  const register = useCallback(
    async (body: { email: string; password: string; fullName: string; phone?: string }) => {
      const u = await driverApi.register(body);
      localStorage.removeItem(GUEST_KEY);
      setUser(u);
      setStatus('authed');
    },
    []
  );

  const logout = useCallback(async () => {
    await driverApi.logout();
    localStorage.removeItem(GUEST_KEY);
    setUser(null);
    setStatus('unauthenticated');
  }, []);

  const continueAsGuest = useCallback(() => {
    localStorage.setItem(GUEST_KEY, '1');
    setUser(null);
    setStatus('guest');
  }, []);

  const requireLogin = useCallback(() => {
    localStorage.removeItem(GUEST_KEY);
    setStatus('unauthenticated');
  }, []);

  const refreshUser = useCallback(async () => {
    setUser(await driverApi.me());
  }, []);

  return {
    user,
    status,
    login,
    register,
    logout,
    continueAsGuest,
    requireLogin,
    refreshUser,
  };
}
