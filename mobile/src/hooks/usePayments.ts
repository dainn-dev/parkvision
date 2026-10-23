import { useCallback, useEffect, useRef, useState } from 'react';
import { payments as paymentsApi, wallet as walletApi, PaymentCreateBody } from '../api/driver';
import { DriverPayment, DriverWallet, PaymentMethod } from '../types';

const POLL_MS = 4000;
const POLL_TIMEOUT_MS = 120000;

/** Payments list + create/cancel + driver wallet. `payAndWatch` creates a
 * payment, opens the provider's payUrl in a new tab (momo) or settles
 * instantly (wallet), and polls the status endpoint until the payment
 * reaches a terminal state. */
export function usePayments(enabled: boolean) {
  const [payments, setPayments] = useState<DriverPayment[]>([]);
  const [wallet, setWallet] = useState<DriverWallet | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  // Ids already watched this mount, so a payment still `created` after the
  // poll timeout is not re-watched forever.
  const watchedIds = useRef<Set<string>>(new Set());

  const refetch = useCallback(async () => {
    try {
      const [p, w] = await Promise.all([paymentsApi.list(), walletApi.get()]);
      setPayments(p);
      setWallet(w);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      setPayments([]);
      setWallet(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    void refetch();
  }, [enabled, refetch]);

  useEffect(
    () => () => {
      if (pollTimer.current) clearInterval(pollTimer.current);
    },
    []
  );

  const watchUntilTerminal = useCallback(
    (id: string, onDone?: (p: DriverPayment) => void) => {
      if (pollTimer.current) clearInterval(pollTimer.current);
      watchedIds.current.add(id);
      const started = Date.now();
      pollTimer.current = setInterval(() => {
        void (async () => {
          try {
            const p = await paymentsApi.get(id);
            if (p.status !== 'created' || Date.now() - started > POLL_TIMEOUT_MS) {
              if (pollTimer.current) clearInterval(pollTimer.current);
              pollTimer.current = null;
              setBusyId(null);
              await refetch();
              onDone?.(p);
            }
          } catch {
            // transient network error — keep polling until timeout
          }
        })();
      }, POLL_MS);
    },
    [refetch]
  );

  // Resume tracking a payment left `created` by a reload or a closed modal;
  // the gateway IPN may have settled it meanwhile.
  useEffect(() => {
    if (!enabled || pollTimer.current) return;
    const pending = payments.find((p) => p.status === 'created' && !watchedIds.current.has(p.id));
    if (!pending) return;
    setBusyId(pending.id);
    watchUntilTerminal(pending.id);
  }, [enabled, payments, watchUntilTerminal]);

  /** Create + open payUrl (momo) or settle instantly (wallet) + watch.
   * Throws ApiError('payments_not_configured') when the deployment has no
   * gateway — callers should render the honest coming-soon state. */
  const payAndWatch = useCallback(
    async (
      body: PaymentCreateBody,
      onDone?: (p: DriverPayment) => void
    ): Promise<DriverPayment> => {
      const p = await paymentsApi.create(body);
      setPayments((prev) => [p, ...prev]);
      if (p.payUrl) window.open(p.payUrl, '_blank', 'noopener');
      if (p.status === 'created') {
        setBusyId(p.id);
        watchUntilTerminal(p.id, onDone);
      } else {
        await refetch();
        onDone?.(p);
      }
      return p;
    },
    [watchUntilTerminal, refetch]
  );

  const cancel = useCallback(
    async (id: string) => {
      await paymentsApi.cancel(id);
      await refetch();
    },
    [refetch]
  );

  const canAfford = useCallback(
    (amountVnd: number, method: PaymentMethod) =>
      method === 'momo' || (wallet?.balanceVnd ?? 0) >= amountVnd,
    [wallet]
  );

  const hasPaymentFor = useCallback(
    (kind: 'membership' | 'session', refId: string) =>
      payments.some(
        (p) =>
          (kind === 'membership' ? p.membershipId === refId : p.sessionId === refId) &&
          (p.status === 'created' || p.status === 'paid')
      ),
    [payments]
  );

  return { payments, wallet, loading, busyId, refetch, payAndWatch, cancel, hasPaymentFor, canAfford };
}
