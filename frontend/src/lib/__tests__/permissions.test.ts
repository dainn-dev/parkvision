import { describe, expect, it } from 'vitest';
import { canManagePlatformOps, canRefundTenantPayments, canTenantWrite } from '../permissions';

describe('permissions', () => {
  it('limits platform ops (create tenant, impersonate, status change, reboot edge) to super_admin and ops', () => {
    expect(canManagePlatformOps('super_admin')).toBe(true);
    expect(canManagePlatformOps('ops')).toBe(true);
    expect(canManagePlatformOps('support')).toBe(false);
    expect(canManagePlatformOps('')).toBe(false);
  });

  it('limits payment refund / mark-refunded-externally to owner and admin', () => {
    expect(canRefundTenantPayments('owner')).toBe(true);
    expect(canRefundTenantPayments('admin')).toBe(true);
    expect(canRefundTenantPayments('operator')).toBe(false);
    expect(canRefundTenantPayments('viewer')).toBe(false);
    // operators still write elsewhere (memberships), just not refunds
    expect(canTenantWrite('operator')).toBe(true);
  });
});
