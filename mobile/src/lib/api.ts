const BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "/api/v1";

// Legacy storage. Sessions created before the cookie rollout still live here
// until migrateStoredDriverTokens() exchanges them for HttpOnly cookies.
const ACCESS_KEY = "pv_driver_access";
const REFRESH_KEY = "pv_driver_refresh";

const AUTH_MODE_HEADER = "X-Auth-Mode";
const CSRF_COOKIE = "pv_driver_csrf";
const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/** Only the CSRF cookie is script-readable; access/refresh cookies are HttpOnly. */
const readCookie = (name: string): string | null => {
  const m = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return m ? decodeURIComponent(m[1]) : null;
};

const csrfToken = (): string | null => readCookie(CSRF_COOKIE);
const hasCookieAuth = (): boolean => csrfToken() !== null;

export const tokenStore = {
  get(): { access: string | null; refresh: string | null } {
    return {
      access: localStorage.getItem(ACCESS_KEY),
      refresh: localStorage.getItem(REFRESH_KEY),
    };
  },
  set(t: { accessToken: string; refreshToken: string }): void {
    // Once HttpOnly cookies carry the session, never persist tokens where XSS can read them.
    if (hasCookieAuth()) {
      tokenStore.clear();
      return;
    }
    localStorage.setItem(ACCESS_KEY, t.accessToken);
    localStorage.setItem(REFRESH_KEY, t.refreshToken);
  },
  clear(): void {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
  },
  /** True when a session exists as a cookie or as a legacy stored token. */
  hasAuth(): boolean {
    return hasCookieAuth() || !!localStorage.getItem(ACCESS_KEY) || !!localStorage.getItem(REFRESH_KEY);
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

/** Ask the backend to answer in cookie mode (HttpOnly cookies, no tokens in the body). */
const COOKIE_MODE_PATHS = new Set(["/driver/auth/login", "/driver/auth/register"]);

async function refreshTokens(): Promise<boolean> {
  const { refresh } = tokenStore.get();
  if (!hasCookieAuth() && !refresh) return false;
  try {
    const headers = new Headers({ "Content-Type": "application/json", [AUTH_MODE_HEADER]: "cookie" });
    const csrf = csrfToken();
    if (csrf) headers.set("X-CSRF-Token", csrf);
    const res = await fetch(`${BASE_URL}/driver/auth/refresh`, {
      method: "POST",
      credentials: "include",
      headers,
      // A legacy refresh token is sent once so the backend can move the session into cookies.
      body: JSON.stringify(refresh ? { refreshToken: refresh } : {}),
    });
    if (!res.ok) return false;
    const body = await res.json().catch(() => null);
    if (body?.accessToken && body?.refreshToken) {
      // Backend answered in bearer mode: the old refresh token is spent, keep the rotated pair.
      tokenStore.set({ accessToken: body.accessToken, refreshToken: body.refreshToken });
    } else {
      // Cookie mode: the session now lives in HttpOnly cookies; drop the legacy copies.
      tokenStore.clear();
    }
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

/** One-time upgrade of a pre-cookie session: swap stored tokens for HttpOnly cookies. */
export async function migrateStoredDriverTokens(): Promise<boolean> {
  if (hasCookieAuth()) {
    tokenStore.clear();
    return true;
  }
  const { access, refresh } = tokenStore.get();
  if (!access && !refresh) return false;
  if (refresh && (await refreshOnce()) && hasCookieAuth()) return true;

  // Never keep using an exposed legacy token if the cookie exchange fails.
  tokenStore.clear();
  window.dispatchEvent(new Event("pv:logout"));
  return false;
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
    if (hasCookieAuth() || COOKIE_MODE_PATHS.has(path)) {
      headers.set(AUTH_MODE_HEADER, "cookie");
      const csrf = csrfToken();
      if (csrf && MUTATING.has((init?.method ?? "GET").toUpperCase())) {
        headers.set("X-CSRF-Token", csrf);
      }
    } else {
      const { access } = tokenStore.get();
      if (useAuth && access) headers.set("Authorization", `Bearer ${access}`);
    }
    const { auth: _auth, ...rest } = init ?? {};
    return fetch(`${BASE_URL}${path}`, { ...rest, headers, credentials: "include" });
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

/** WS URL carrying a single-use ticket (30 s TTL) instead of a long-lived credential. */
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
    // Older backend without the ticket endpoint: legacy bearer sessions only.
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
