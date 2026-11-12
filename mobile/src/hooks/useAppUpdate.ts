import { useEffect, useState } from 'react';
import { checkAndroidUpdate, type AndroidUpdate } from '../lib/appUpdater';

/**
 * Checks the self-hosted update channel once per app launch. A no-op on web
 * (checkAndroidUpdate resolves to null off the native platform).
 */
export function useAppUpdate() {
  const [update, setUpdate] = useState<AndroidUpdate | null>(null);

  useEffect(() => {
    let cancelled = false;
    checkAndroidUpdate()
      .then((result) => {
        if (!cancelled && result?.updateAvailable) setUpdate(result);
      })
      .catch(() => {
        // Update checks are best-effort; a failed check never blocks the app.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return update;
}
