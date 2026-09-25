import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import * as authApi from '../api/auth';
import { ApiError } from '../api/client';
import type { AuthSession, RegisterTenantInput } from '../api/types';

type AuthStatus = 'loading' | 'anonymous' | 'authenticated';

interface AuthContextValue {
  status: AuthStatus;
  session: AuthSession | null;
  login: (email: string, password: string, tenantSlug?: string) => Promise<{ requiresMfa: boolean }>;
  verifyMfa: (code: string) => Promise<void>;
  register: (input: RegisterTenantInput) => Promise<void>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<AuthSession | null>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [session, setSession] = useState<AuthSession | null>(null);

  const refreshSession = useCallback(async () => {
    try {
      const currentSession = await authApi.getSession();
      setSession(currentSession);
      setStatus('authenticated');
      return currentSession;
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 401) throw error;
      try {
        await authApi.refresh();
        const currentSession = await authApi.getSession();
        setSession(currentSession);
        setStatus('authenticated');
        return currentSession;
      } catch (refreshError) {
        if (!(refreshError instanceof ApiError) || refreshError.status !== 401) throw refreshError;
        setSession(null);
        setStatus('anonymous');
        return null;
      }
    }
  }, []);

  useEffect(() => {
    void refreshSession().catch(() => {
      setSession(null);
      setStatus('anonymous');
    });
  }, [refreshSession]);

  const login = useCallback(async (email: string, password: string, tenantSlug?: string) => {
    const response = await authApi.login(email, password, tenantSlug);
    if (!response.data.mfaRequired) await refreshSession();
    return { requiresMfa: response.data.mfaRequired };
  }, [refreshSession]);

  const verifyMfa = useCallback(async (code: string) => {
    await authApi.verifyMfa(code);
    await refreshSession();
  }, [refreshSession]);

  const register = useCallback(async (input: RegisterTenantInput) => {
    await authApi.registerTenant(input);
    await login(input.ownerEmail, input.ownerPassword, input.slug);
  }, [login]);

  const logout = useCallback(async () => {
    let logoutError: unknown;
    try {
      await authApi.logout();
    } catch (error) {
      logoutError = error;
    } finally {
      setSession(null);
      setStatus('anonymous');
    }
    if (logoutError) throw logoutError;
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    status,
    session,
    login,
    verifyMfa,
    register,
    logout,
    refreshSession,
  }), [status, session, login, verifyMfa, register, logout, refreshSession]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
