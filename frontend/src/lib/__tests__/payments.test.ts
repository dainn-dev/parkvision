import { describe, expect, it } from 'vitest';
import { ApiError } from '../../services/api/client';
import {
  canMarkRefundedExternally,
  isActivationReasonRequired,
  isValidExternalRefundNote,
  paymentFlags,
} from '../payments';

describe('payments helpers', () => {
  it('detects the activation_reason_required error code', () => {
    expect(isActivationReasonRequired(new ApiError(422, { code: 'activation_reason_required', message: 'x' }))).toBe(true);
    expect(isActivationReasonRequired(new ApiError(422, { code: 'validation_error', message: 'x' }))).toBe(false);
    expect(isActivationReasonRequired(new Error('activation_reason_required'))).toBe(false);
  });

  it('validates the external refund note length (3..300, trimmed)', () => {
    expect(isValidExternalRefundNote('ab')).toBe(false);
    expect(isValidExternalRefundNote('   ab   ')).toBe(false);
    expect(isValidExternalRefundNote('abc')).toBe(true);
    expect(isValidExternalRefundNote('a'.repeat(300))).toBe(true);
    expect(isValidExternalRefundNote('a'.repeat(301))).toBe(false);
  });

  it('builds operator flags from the payment feed fields', () => {
    expect(paymentFlags({ activationError: null, latePayment: false, refundedExternally: false })).toEqual([]);
    expect(paymentFlags({})).toEqual([]);
    expect(paymentFlags({ activationError: 'plate taken', latePayment: true, refundedExternally: true })).toEqual([
      { kind: 'activation_failed', detail: 'plate taken' },
      { kind: 'late_payment' },
      { kind: 'refunded_externally' },
    ]);
  });
});

describe('canMarkRefundedExternally', () => {
  it('allows paid non-topup payments', () => {
    expect(canMarkRefundedExternally({ status: 'paid', kind: 'membership' })).toBe(true);
    expect(canMarkRefundedExternally({ status: 'paid', kind: 'session' })).toBe(true);
  });

  it('never allows top-ups or already refunded payments', () => {
    expect(canMarkRefundedExternally({ status: 'paid', kind: 'topup' })).toBe(false);
    expect(canMarkRefundedExternally({ status: 'refunded', kind: 'membership', latePayment: true })).toBe(false);
  });

  it('allows non-paid payments only when the provider still collected money', () => {
    expect(canMarkRefundedExternally({ status: 'cancelled', kind: 'membership' })).toBe(false);
    expect(canMarkRefundedExternally({ status: 'cancelled', kind: 'membership', latePayment: true })).toBe(true);
    expect(canMarkRefundedExternally({ status: 'created', kind: 'session', amountMismatch: true })).toBe(true);
  });

  it('flags an amount mismatch', () => {
    expect(paymentFlags({ amountMismatch: true })).toEqual([{ kind: 'amount_mismatch' }]);
  });
});
