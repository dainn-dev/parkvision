import { useCallback, useEffect, useState } from 'react';
import { publicApi, type LatestReleaseOut } from '../../../services/api';

interface State {
  releases: LatestReleaseOut[] | null;
  isLoading: boolean;
  hasError: boolean;
}

export function useLatestReleases() {
  const [state, setState] = useState<State>({ releases: null, isLoading: true, hasError: false });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState({ releases: null, isLoading: true, hasError: false });
    publicApi
      .latestReleases()
      .then((releases) => {
        if (!cancelled) setState({ releases, isLoading: false, hasError: false });
      })
      .catch(() => {
        if (!cancelled) setState({ releases: null, isLoading: false, hasError: true });
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { ...state, retry };
}
