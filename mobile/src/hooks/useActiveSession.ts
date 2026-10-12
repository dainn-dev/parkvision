import { useCallback, useEffect, useState } from 'react';
import { sessions } from '../api/driver';
import { ActiveParkingSession } from '../types';
import { useSessionHints } from './useSessionHints';

const POLL_MS = 20000;

export function useActiveSession(enabled: boolean) {
  const [session, setSession] = useState<ActiveParkingSession | null>(null);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    try {
      const rows = await sessions.active();
      setSession(rows.find((s) => s.status === 'PARKED') ?? null);
    } catch {
      // keep last known session on transient errors
    } finally {
      setLoading(false);
    }
  }, []);

  useSessionHints(enabled, refetch);

  useEffect(() => {
    if (!enabled) {
      setSession(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    void refetch();
    const interval = setInterval(() => void refetch(), POLL_MS);
    return () => clearInterval(interval);
  }, [enabled, refetch]);

  return { session, loading, refetch };
}
