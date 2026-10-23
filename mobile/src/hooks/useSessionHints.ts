import { useEffect, useRef } from 'react';
import { driverSessionsWsUrl } from '../lib/api';

const RETRY_MS = 8000;

/** Subscribes to `/ws/driver/sessions` and fires `onHint` whenever the
 * backend relays an access-event hint for one of the driver's plates.
 * Hints are opaque — callers refetch over REST, so a dropped socket only
 * means slower updates (the normal poll interval still runs). */
export function useSessionHints(enabled: boolean, onHint: () => void) {
  const cb = useRef(onHint);
  cb.current = onHint;

  useEffect(() => {
    if (!enabled) return;
    let ws: WebSocket | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let closed = false;

    const connect = () => {
      driverSessionsWsUrl()
        .then((url) => {
          if (closed) return;
          try {
            ws = new WebSocket(url);
          } catch {
            retry = setTimeout(connect, RETRY_MS);
            return;
          }
          ws.onmessage = (ev) => {
            try {
              const msg = JSON.parse(String(ev.data));
              if (msg?.type === 'session_event') cb.current();
            } catch {
              // non-JSON heartbeat / malformed frame — ignore
            }
          };
          ws.onclose = () => {
            if (!closed) retry = setTimeout(connect, RETRY_MS);
          };
        })
        .catch(() => {
          if (!closed) retry = setTimeout(connect, RETRY_MS);
        });
    };
    connect();
    return () => {
      closed = true;
      if (retry) clearTimeout(retry);
      ws?.close();
    };
  }, [enabled]);
}
