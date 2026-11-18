/**
 * Pure helpers for the tenant Payments / Memberships screens. Kept free of
 * React so they can be unit-tested directly.
 */
import { ApiError } from '../services/api/client';

/** 422 code the membership activate endpoint returns when a paid plan has no
 * paid payment and the request carries no reason. */
export const ACTIVATION_REASON_REQUIRED_CODE = 'activation_reason_required';

export const isActivationReasonRequired = (e: unknown): boolean =>
  e instanceof ApiError && e.code === ACTIVATION_REASON_REQUIRED_CODE;

/** Bounds of `note` on POST .../mark-refunded-externally. */
export const EXTERNAL_REFUND_NOTE_MIN = 3;
export const EXTERNAL_REFUND_NOTE_MAX = 300;

export const isValidExternalRefundNote = (note: string): boolean => {
  const n = note.trim().length;
  return n >= EXTERNAL_REFUND_NOTE_MIN && n <= EXTERNAL_REFUND_NOTE_MAX;
};

export type PaymentFlag =
  | { kind: 'activation_failed'; detail: string }
  | { kind: 'late_payment' }
  | { kind: 'amount_mismatch' }
  | { kind: 'refunded_externally' };

interface PaymentFlagSource {
  activationError?: string | null;
  latePayment?: boolean;
  amountMismatch?: boolean;
  refundedExternally?: boolean;
}

/** Operator-facing flags for a payment row, in display order. */
export const paymentFlags = (p: PaymentFlagSource): PaymentFlag[] => {
  const flags: PaymentFlag[] = [];
  if (p.activationError) flags.push({ kind: 'activation_failed', detail: p.activationError });
  if (p.latePayment) flags.push({ kind: 'late_payment' });
  if (p.amountMismatch) flags.push({ kind: 'amount_mismatch' });
  if (p.refundedExternally) flags.push({ kind: 'refunded_externally' });
  return flags;
};

interface ExternalRefundSource extends PaymentFlagSource {
  status: string;
  kind: string;
}

/** Mirrors the backend rule for POST .../mark-refunded-externally: a paid
 * non-topup payment, or a non-paid one the provider still collected money for
 * (late payment / amount mismatch) that is not refunded yet. */
export const canMarkRefundedExternally = (p: ExternalRefundSource): boolean => {
  if (p.kind === 'topup' || p.status === 'refunded') return false;
  if (p.status === 'paid') return true;
  return Boolean(p.latePayment || p.amountMismatch);
};
