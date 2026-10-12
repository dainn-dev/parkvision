import { useCallback, useEffect, useState } from 'react';
import { memberships as membershipsApi } from '../api/driver';
import { DriverMembership } from '../types';

export function useMemberships(enabled: boolean) {
  const [memberships, setMemberships] = useState<DriverMembership[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    try {
      setMemberships(await membershipsApi.list());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'network_error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      setMemberships([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    void refetch();
  }, [enabled, refetch]);

  const request = useCallback(
    async (planId: string, vehicleId: string) => {
      const m = await membershipsApi.request(planId, vehicleId);
      await refetch();
      return m;
    },
    [refetch]
  );

  const cancel = useCallback(
    async (id: string) => {
      await membershipsApi.cancel(id);
      await refetch();
    },
    [refetch]
  );

  const activeCount = memberships.filter((m) => m.status === 'active').length;

  return { memberships, loading, error, refetch, request, cancel, activeCount };
}
