export interface ApiErrorPayload {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
  requestId?: string;
}

export interface PageMeta {
  page: number;
  limit: number;
  total: number;
}

export interface Page<T> {
  data: T[];
  meta: PageMeta;
}

export type UserType = 'platform_admin' | 'tenant_user';

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  role: string;
  status: string;
  mfaEnabled: boolean;
  tenantId?: string | null;
  lastLoginAt?: string | null;
}

export interface AuthSession {
  user: AuthUser;
  userType: UserType;
  tenantId?: string | null;
  tenantSlug?: string | null;
  mfaVerified: boolean;
  sessionId: string;
  csrfToken: string;
}

export interface LoginResponse {
  data: {
    mfaRequired: boolean;
    csrfToken?: string;
  };
}

export interface MfaVerifyResponse {
  data: {
    mfaRequired: false;
    csrfToken: string;
  };
}

export interface RegisterTenantInput {
  tenantName: string;
  slug: string;
  planCode: string;
  contactEmail: string;
  ownerEmail: string;
  ownerFullName: string;
  ownerPassword: string;
}

export interface RegisterTenantResponse {
  tenantId: string;
  ownerUserId: string;
  message: string;
}
