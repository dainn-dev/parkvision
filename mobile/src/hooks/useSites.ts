import { useCallback, useEffect, useRef, useState } from 'react';
import { listSites } from '../api/public';
import { Tenant, UserLocation } from '../types';

// Tightened from 15s: tenant admin updates occupancy instantly over
// WebSocket, so the list view should not lag behind it by more than a
// few seconds. The currently open site detail (TenantDetailModal) polls
// on its own faster interval on top of this.
const POLL_MS = 8000;
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

  // Timers are throttled/suspended while a mobile tab is backgrounded, so a
  // user returning from another app can otherwise stare at a number that's
  // been stale for minutes. Refetch immediately on return to foreground
  // instead of waiting for the next regular poll tick.
  useEffect(() => {
    if (!enabled) return;
    const onVisible = () => {
      if (document.visibilityState === 'visible') void fetchRef.current();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [enabled]);

  const refetch = useCallback(() => fetchRef.current(), []);

  return { sites, loading, error, lastUpdatedAt, refetch };
}
