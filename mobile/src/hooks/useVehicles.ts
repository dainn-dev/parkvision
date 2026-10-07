import { useCallback, useEffect, useState } from 'react';
import { vehicles as vehiclesApi } from '../api/driver';
import { DriverVehicle } from '../types';

export function useVehicles(enabled = true) {
  const [vehicles, setVehicles] = useState<DriverVehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    try {
      setVehicles(await vehiclesApi.list());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'network_error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    void refetch();
  }, [enabled, refetch]);

  const add = useCallback(
    async (body: Parameters<typeof vehiclesApi.add>[0]) => {
      const v = await vehiclesApi.add(body);
      await refetch();
      return v;
    },
    [refetch]
  );

  const update = useCallback(
    async (id: string, body: Parameters<typeof vehiclesApi.update>[1]) => {
      const v = await vehiclesApi.update(id, body);
      await refetch();
      return v;
    },
    [refetch]
  );

  const remove = useCallback(
    async (id: string) => {
      await vehiclesApi.remove(id);
      await refetch();
    },
    [refetch]
  );

  return { vehicles, loading, error, refetch, add, update, remove };
}
