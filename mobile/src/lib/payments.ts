import type { DriverPayment, ParkingHistoryItem, PaymentMethod } from '../types';
import { ApiError } from './api';

/** Mirrors backend `paid_exit_grace_minutes` (config.py): after a session is
 * paid the driver must exit within this window, or the extra time is owed. */
export const PAID_EXIT_GRACE_MINUTES = 15;

/** True when creating a gateway (MoMo) payment failed because the deployment
 * has no payment provider configured (503 payments_not_configured). */
export const isPaymentsNotConfigured = (e: unknown): boolean =>
  e instanceof ApiError && (e.code === 'payments_not_configured' || e.status === 503);

export interface MethodAvailability {
  method: PaymentMethod;
  enabled: boolean;
  reason?: 'insufficient_balance' | 'not_configured';
}

/** Which payment methods the chooser offers for `amountVnd`. Wallet needs
 * enough balance; MoMo is disabled once the server said it isn't configured. */
export function paymentMethodAvailability(opts: {
  amountVnd: number;
  walletBalanceVnd: number | null | undefined;
  momoUnavailable: boolean;
}): MethodAvailability[] {
  const walletOk = (opts.walletBalanceVnd ?? 0) >= opts.amountVnd;
  return [
    opts.momoUnavailable
      ? { method: 'momo', enabled: false, reason: 'not_configured' }
      : { method: 'momo', enabled: true },
    walletOk
      ? { method: 'wallet', enabled: true }
      : { method: 'wallet', enabled: false, reason: 'insufficient_balance' },
  ];
}

export type SessionPaymentState =
  /** Nothing to pay (no fee estimate, or a completed session already paid). */
  | { kind: 'none' }
  /** A payment is in flight (status `created`). */
  | { kind: 'pending' }
  /** Paid and still inside the exit grace window. */
  | { kind: 'paid_in_grace'; exitBy: Date }
  /** Payable. `afterGrace` = a previous payment's grace expired, so this is
   * the remaining amount; `amountVnd` is a client estimate (null = unknown),
   * the server prices the new payment. */
  | { kind: 'payable'; amountVnd: number | null; afterGrace: boolean };

/** Decide how a parking session can be paid. A session may have several
 * paid payments: when the driver stays past the grace window after paying,
 * a new payment for the remaining amount is allowed. */
export function sessionPaymentState(
  session: Pick<ParkingHistoryItem, 'id' | 'status' | 'currentFeeVnd'>,
  payments: DriverPayment[],
  now: Date = new Date(),
  graceMinutes: number = PAID_EXIT_GRACE_MINUTES
): SessionPaymentState {
  const mine = payments.filter((p) => p.kind === 'session' && p.sessionId === session.id);
  if (mine.some((p) => p.status === 'created')) return { kind: 'pending' };

  const paid = mine.filter((p) => p.status === 'paid');
  const fee = session.currentFeeVnd ?? 0;
  if (paid.length === 0) {
    return fee > 0 ? { kind: 'payable', amountVnd: fee, afterGrace: false } : { kind: 'none' };
  }

  // Already exited: the paid amount settled the stay.
  if (session.status === 'COMPLETED') return { kind: 'none' };

  const lastPaidAt = paid
    .map((p) => (p.paidAt ? new Date(p.paidAt).getTime() : new Date(p.createdAt).getTime()))
    .reduce((a, b) => Math.max(a, b), 0);
  const exitBy = new Date(lastPaidAt + graceMinutes * 60_000);
  if (now.getTime() < exitBy.getTime()) return { kind: 'paid_in_grace', exitBy };

  const paidTotal = paid.reduce((sum, p) => sum + p.amountVnd, 0);
  const remaining = fee - paidTotal;
  return { kind: 'payable', amountVnd: remaining > 0 ? remaining : null, afterGrace: true };
}
