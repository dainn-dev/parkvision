import { useCallback, useEffect, useRef, useState } from 'react';
import { payments as paymentsApi } from '../api/driver';
import { DriverPayment } from '../types';

const POLL_MS = 4000;
const POLL_TIMEOUT_MS = 120000;

/** Payments list + create/cancel. `payAndWatch` creates a payment, opens
 * the provider's payUrl in a new tab, and polls the status endpoint until
 * the payment reaches a terminal state (the backend refreshes from the
 * gateway's query API, so sandbox works without a public IPN URL). */
export function usePayments(enabled: boolean) {
  const [payments, setPayments] = useState<DriverPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const refetch = useCallback(async () => {
    try {
      setPayments(await paymentsApi.list());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      setPayments([]);
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

  /** Create + open payUrl + watch. Resolves the created payment; throws
   * ApiError('payments_not_configured') when the deployment has no
   * gateway — callers should render the honest coming-soon state. */
  const payAndWatch = useCallback(
    async (
      body: { kind: 'membership'; membershipId: string } | { kind: 'session'; sessionId: string },
      onDone?: (p: DriverPayment) => void
    ): Promise<DriverPayment> => {
      const p = await paymentsApi.create(body);
      setPayments((prev) => [p, ...prev]);
      if (p.payUrl) window.open(p.payUrl, '_blank', 'noopener');
      setBusyId(p.id);
      watchUntilTerminal(p.id, onDone);
      return p;
    },
    [watchUntilTerminal]
  );

  const cancel = useCallback(
    async (id: string) => {
      await paymentsApi.cancel(id);
      await refetch();
    },
    [refetch]
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

  return { payments, loading, busyId, refetch, payAndWatch, cancel, hasPaymentFor };
}
