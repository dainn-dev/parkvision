import { describe, expect, it } from 'vitest';
import { ApiError } from '../api';
import {
  isPaymentsNotConfigured,
  paymentMethodAvailability,
  sessionPaymentState,
  PAID_EXIT_GRACE_MINUTES,
} from '../payments';
import type { DriverPayment } from '../../types';

const NOW = new Date('2026-11-18T10:00:00Z');

function payment(over: Partial<DriverPayment>): DriverPayment {
  return {
    id: 'p1',
    kind: 'session',
    membershipId: null,
    sessionId: 's1',
    siteId: 'site',
    siteName: 'Lot',
    plateNumber: '51A12345',
    amountVnd: 20000,
    currency: 'VND',
    provider: 'momo',
    method: 'momo',
    status: 'paid',
    payUrl: null,
    paidAt: null,
    refundedAt: null,
    expiresAt: null,
    createdAt: NOW.toISOString(),
    ...over,
  };
}

const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000).toISOString();
const parked = { id: 's1', status: 'PARKED' as const, currentFeeVnd: 30000 };

describe('paymentMethodAvailability', () => {
  it('enables both methods when balance covers the amount', () => {
    expect(paymentMethodAvailability({ amountVnd: 100, walletBalanceVnd: 100, momoUnavailable: false })).toEqual([
      { method: 'momo', enabled: true },
      { method: 'wallet', enabled: true },
    ]);
  });

  it('disables wallet on insufficient balance and momo when not configured', () => {
    expect(paymentMethodAvailability({ amountVnd: 100, walletBalanceVnd: 99, momoUnavailable: true })).toEqual([
      { method: 'momo', enabled: false, reason: 'not_configured' },
      { method: 'wallet', enabled: false, reason: 'insufficient_balance' },
    ]);
    expect(paymentMethodAvailability({ amountVnd: 1, walletBalanceVnd: null, momoUnavailable: false })[1].enabled).toBe(false);
  });
});

describe('isPaymentsNotConfigured', () => {
  it('matches the 503 payments_not_configured error only', () => {
    expect(isPaymentsNotConfigured(new ApiError(503, 'payments_not_configured', 'x'))).toBe(true);
    expect(isPaymentsNotConfigured(new ApiError(400, 'bad_request', 'x'))).toBe(false);
    expect(isPaymentsNotConfigured(new Error('payments_not_configured'))).toBe(false);
  });
});

describe('sessionPaymentState', () => {
  it('is payable for the full fee with no payments', () => {
    expect(sessionPaymentState(parked, [], NOW)).toEqual({ kind: 'payable', amountVnd: 30000, afterGrace: false });
  });

  it('has nothing to pay without a fee estimate', () => {
    expect(sessionPaymentState({ ...parked, currentFeeVnd: null }, [], NOW)).toEqual({ kind: 'none' });
  });

  it('is pending while a payment is created', () => {
    expect(sessionPaymentState(parked, [payment({ status: 'created' })], NOW)).toEqual({ kind: 'pending' });
  });

  it('is paid_in_grace inside the exit window', () => {
    const state = sessionPaymentState(parked, [payment({ paidAt: minutesAgo(5) })], NOW);
    expect(state.kind).toBe('paid_in_grace');
    if (state.kind === 'paid_in_grace') {
      expect(state.exitBy.toISOString()).toBe(new Date(NOW.getTime() + (PAID_EXIT_GRACE_MINUTES - 5) * 60_000).toISOString());
    }
  });

  it('becomes payable again for the remaining amount once grace expired', () => {
    expect(sessionPaymentState(parked, [payment({ paidAt: minutesAgo(20), amountVnd: 20000 })], NOW)).toEqual({
      kind: 'payable',
      amountVnd: 10000,
      afterGrace: true,
    });
  });

  it('keeps the pay action (amount unknown) when the estimate has not caught up', () => {
    expect(sessionPaymentState(parked, [payment({ paidAt: minutesAgo(20), amountVnd: 30000 })], NOW)).toEqual({
      kind: 'payable',
      amountVnd: null,
      afterGrace: true,
    });
  });

  it('uses the latest paid payment for the grace window and sums all paid amounts', () => {
    const ps = [
      payment({ id: 'a', paidAt: minutesAgo(60), amountVnd: 10000 }),
      payment({ id: 'b', paidAt: minutesAgo(3), amountVnd: 5000 }),
    ];
    expect(sessionPaymentState(parked, ps, NOW).kind).toBe('paid_in_grace');
    const later = new Date(NOW.getTime() + 30 * 60_000);
    expect(sessionPaymentState(parked, ps, later)).toEqual({ kind: 'payable', amountVnd: 15000, afterGrace: true });
  });

  it('ignores payments of other sessions and completed paid sessions', () => {
    expect(sessionPaymentState(parked, [payment({ sessionId: 'other', paidAt: minutesAgo(1) })], NOW).kind).toBe('payable');
    expect(sessionPaymentState({ ...parked, status: 'COMPLETED' }, [payment({ paidAt: minutesAgo(60) })], NOW)).toEqual({
      kind: 'none',
    });
  });
});
