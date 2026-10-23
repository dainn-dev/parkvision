const BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "/api/v1";

const ACCESS_KEY = "pv_driver_access";
const REFRESH_KEY = "pv_driver_refresh";

export const tokenStore = {
  get(): { access: string | null; refresh: string | null } {
    return {
      access: localStorage.getItem(ACCESS_KEY),
      refresh: localStorage.getItem(REFRESH_KEY),
    };
  },
  set(t: { accessToken: string; refreshToken: string }): void {
    localStorage.setItem(ACCESS_KEY, t.accessToken);
    localStorage.setItem(REFRESH_KEY, t.refreshToken);
  },
  clear(): void {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
  },
};

export class ApiError extends Error {
  status: number;
  code: string;
  details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

let refreshInFlight: Promise<boolean> | null = null;

async function refreshTokens(): Promise<boolean> {
  const { refresh } = tokenStore.get();
  if (!refresh) return false;
  try {
    const res = await fetch(`${BASE_URL}/driver/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: refresh }),
    });
    if (!res.ok) return false;
    const body = await res.json();
    tokenStore.set({ accessToken: body.accessToken, refreshToken: body.refreshToken });
    return true;
  } catch {
    return false;
  }
}

function refreshOnce(): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = refreshTokens().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

export async function api<T>(
  path: string,
  init?: RequestInit & { auth?: boolean }
): Promise<T> {
  const useAuth = init?.auth !== false;

  const doFetch = () => {
    const headers = new Headers(init?.headers);
    if (init?.body && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }
    const { access } = tokenStore.get();
    if (useAuth && access) headers.set("Authorization", `Bearer ${access}`);
    const { auth: _auth, ...rest } = init ?? {};
    return fetch(`${BASE_URL}${path}`, { ...rest, headers });
  };

  let res = await doFetch();
  if (res.status === 401 && useAuth) {
    if (await refreshOnce()) {
      res = await doFetch();
    } else {
      tokenStore.clear();
      window.dispatchEvent(new Event("pv:logout"));
    }
  }

  if (res.status === 204) return undefined as T;

  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const env = body?.error;
    throw new ApiError(
      res.status,
      env?.code ?? "http_error",
      env?.message ?? res.statusText,
      env?.details
    );
  }
  return body as T;
}

/** Obtain a single-use WS ticket from the backend (30 s TTL).
 * Falls back to the long-lived JWT when the endpoint is unavailable. */
export async function driverSessionsWsUrl(): Promise<string> {
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  let base: URL;
  try {
    const http = new URL(BASE_URL, window.location.origin);
    base = new URL(`${proto}//${http.host}/ws/driver/sessions`);
  } catch {
    base = new URL(`${proto}//${window.location.host}/ws/driver/sessions`);
  }
  try {
    const res = await api<{ ticket: string }>("/driver/auth/ws-ticket", { method: "POST" });
    base.searchParams.set("ticket", res.ticket);
  } catch {
    // Endpoint unavailable (older backend) — fall back to JWT in query string.
    const { access } = tokenStore.get();
    if (access) base.searchParams.set("token", access);
  }
  return base.toString();
}

export const onLogout = (fn: () => void): (() => void) => {
  const handler = () => fn();
  window.addEventListener("pv:logout", handler);
  return () => window.removeEventListener("pv:logout", handler);
};
