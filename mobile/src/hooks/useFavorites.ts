import { useCallback, useEffect, useState } from 'react';
import { favorites as favoritesApi } from '../api/driver';

export function useFavorites(enabled = true) {
  const [ids, setIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!enabled) {
      setIds(new Set());
      return;
    }
    favoritesApi
      .listIds()
      .then((list) => setIds(new Set(list)))
      .catch(() => {});
  }, [enabled]);

  const toggle = useCallback(
    async (siteId: string) => {
      const wasFavorite = ids.has(siteId);
      // optimistic update, revert on error
      setIds((prev) => {
        const next = new Set(prev);
        if (wasFavorite) next.delete(siteId);
        else next.add(siteId);
        return next;
      });
      try {
        if (wasFavorite) await favoritesApi.remove(siteId);
        else await favoritesApi.add(siteId);
      } catch {
        setIds((prev) => {
          const next = new Set(prev);
          if (wasFavorite) next.add(siteId);
          else next.delete(siteId);
          return next;
        });
      }
    },
    [ids]
  );

  return { ids, toggle };
}
