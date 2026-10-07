import { useCallback, useEffect, useState } from 'react';
import { sessions } from '../api/driver';
import { ParkingHistoryItem } from '../types';

const PAGE_SIZE = 20;

export function useParkingHistory(enabled = true) {
  const [items, setItems] = useState<ParkingHistoryItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!enabled) return;
    setLoading(true);
    sessions
      .history(1, PAGE_SIZE)
      .then((r) => {
        setItems(r.items);
        setTotal(r.total);
        setPage(1);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [enabled]);

  const loadMore = useCallback(async () => {
    const nextPage = page + 1;
    const r = await sessions.history(nextPage, PAGE_SIZE);
    setItems((prev) => [...prev, ...r.items]);
    setTotal(r.total);
    setPage(nextPage);
  }, [page]);

  return { items, loading, loadMore, hasMore: items.length < total };
}
