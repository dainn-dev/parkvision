import { apiRequest } from './client';
import type {
  AuthSession,
  LoginResponse,
  MfaVerifyResponse,
  RegisterTenantInput,
  RegisterTenantResponse,
} from './types';

export function login(email: string, password: string, tenantSlug?: string): Promise<LoginResponse> {
  return apiRequest<LoginResponse>('/auth/login', {
    method: 'POST',
    body: { email, password, tenantSlug },
    retryAuth: false,
    skipRefresh: true,
  });
}

export function verifyMfa(code: string): Promise<MfaVerifyResponse> {
  return apiRequest<MfaVerifyResponse>('/auth/mfa/verify', {
    method: 'POST',
    body: { code },
    retryAuth: false,
    skipRefresh: true,
  });
}

export function getSession(): Promise<AuthSession> {
  return apiRequest<AuthSession>('/auth/me', { skipRefresh: true });
}

export function refresh(): Promise<{ data: { csrfToken: string; expiresIn: number } }> {
  return apiRequest<{ data: { csrfToken: string; expiresIn: number } }>('/auth/refresh', {
    method: 'POST',
    retryAuth: false,
    skipRefresh: true,
  });
}

export function logout(): Promise<{ message: string }> {
  return apiRequest<{ message: string }>('/auth/logout', {
    method: 'POST',
    retryAuth: false,
    skipRefresh: true,
  });
}

export function registerTenant(input: RegisterTenantInput): Promise<RegisterTenantResponse> {
  return apiRequest<RegisterTenantResponse>('/register', {
    method: 'POST',
    body: input,
    retryAuth: false,
    skipRefresh: true,
  });
}
