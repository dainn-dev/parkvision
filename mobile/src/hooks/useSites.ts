import { useCallback, useEffect, useRef, useState } from 'react';
import { listSites } from '../api/public';
import { Tenant, UserLocation } from '../types';

const POLL_MS = 15000;
const DEBOUNCE_MS = 300;

export function useSites({
  location,
  keyword,
  enabled = true,
}: {
  location: UserLocation;
  keyword: string;
  enabled?: boolean;
}) {
  const [sites, setSites] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const [debouncedKeyword, setDebouncedKeyword] = useState(keyword);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedKeyword(keyword), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [keyword]);

  const fetchRef = useRef<() => Promise<void>>(async () => {});
  fetchRef.current = async () => {
    try {
      const data = await listSites({
        lat: location.lat,
        lng: location.lng,
        radiusKm: 50,
        q: debouncedKeyword || undefined,
      });
      setSites(data);
      setError(null);
      setLastUpdatedAt(new Date());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'network_error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!enabled) return;
    setLoading(true);
    void fetchRef.current();
    const interval = setInterval(() => void fetchRef.current(), POLL_MS);
    return () => clearInterval(interval);
  }, [enabled, location.lat, location.lng, debouncedKeyword]);

  const refetch = useCallback(() => fetchRef.current(), []);

  return { sites, loading, error, lastUpdatedAt, refetch };
}
