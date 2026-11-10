/**
 * Frontend mirror of the backend role gates in `backend/app/api/deps.py` and
 * `backend/app/core/enums.py`. Every boundary here must stay in sync with its
 * backend counterpart — these functions only drive UI affordances (hiding a
 * menu item, disabling a button); the API call still enforces the real rule.
 *
 * Tenant roles read from `currentUser.rawRole` are lowercase, matching
 * `TenantUserRole` (owner | admin | operator | viewer). Platform roles are
 * lowercase, matching `PlatformAdminRole` (super_admin | ops | support).
 */

export type TenantRawRole = 'owner' | 'admin' | 'operator' | 'viewer' | string;
export type PlatformRawRole = 'super_admin' | 'ops' | 'support' | string;

// Mirrors `WRITE_ROLES` in deps.py — vehicles, rules, memberships, sites,
// gates, cameras, events/incidents, parking, tenant settings.
const TENANT_WRITE_ROLES: ReadonlySet<string> = new Set(['owner', 'admin', 'operator']);

// Mirrors `ADMIN_ROLES` in deps.py — tenant user invite/update/deactivate,
// audit log export.
const TENANT_ADMIN_ROLES: ReadonlySet<string> = new Set(['owner', 'admin']);

export const canTenantWrite = (role: TenantRawRole): boolean => TENANT_WRITE_ROLES.has(role);

export const canManageTenantUsers = (role: TenantRawRole): boolean => TENANT_ADMIN_ROLES.has(role);

export const canExportTenantAudit = (role: TenantRawRole): boolean => TENANT_ADMIN_ROLES.has(role);

// Mirrors the per-route `require_platform_admin((...))` role tuples in
// app/api/v1/platform.py.
const PLATFORM_SUPER_ONLY: ReadonlySet<string> = new Set(['super_admin']);
const PLATFORM_OPS_ROLES: ReadonlySet<string> = new Set(['super_admin', 'ops']);
const PLATFORM_SUPPORT_ROLES: ReadonlySet<string> = new Set(['super_admin', 'support']);

/** Create/update tenant, impersonate, reboot edge device, issue/rotate/revoke
 * API credential, platform settings & feature flags writes. */
export const canManagePlatformOps = (role: PlatformRawRole): boolean => PLATFORM_OPS_ROLES.has(role);

/** Create/update platform admin, reset another admin's MFA. */
export const canManagePlatformAdmins = (role: PlatformRawRole): boolean => PLATFORM_SUPER_ONLY.has(role);

/** Revoke any session (admin or tenant user) from the platform console. */
export const canRevokePlatformSessions = (role: PlatformRawRole): boolean => PLATFORM_SUPPORT_ROLES.has(role);
