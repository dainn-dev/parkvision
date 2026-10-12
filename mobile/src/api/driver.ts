import { api, tokenStore } from '../lib/api';
import {
  ActiveParkingSession,
  DriverMembership,
  DriverPayment,
  DriverProfile,
  DriverVehicle,
  ParkingHistoryItem,
} from '../types';
import {
  AuthSessionOut,
  DriverMembershipOut,
  DriverOut,
  DriverPaymentOut,
  DriverSessionOut,
  DriverTokenOut,
  DriverVehicleOut,
  Page,
} from './types';

// ---------- auth ----------

function storeTokens(t: DriverTokenOut): void {
  tokenStore.set({ accessToken: t.accessToken, refreshToken: t.refreshToken });
}

export async function register(body: {
  email: string;
  password: string;
  fullName: string;
  phone?: string;
}): Promise<DriverProfile> {
  const tokens = await api<DriverTokenOut>('/driver/auth/register', {
    method: 'POST',
    body: JSON.stringify(body),
    auth: false,
  });
  storeTokens(tokens);
  return me();
}

export async function login(email: string, password: string): Promise<DriverProfile> {
  const tokens = await api<DriverTokenOut>('/driver/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
    auth: false,
  });
  storeTokens(tokens);
  return me();
}

export async function logout(): Promise<void> {
  const { refresh } = tokenStore.get();
  try {
    if (refresh) {
      await api('/driver/auth/logout', {
        method: 'POST',
        body: JSON.stringify({ refreshToken: refresh }),
      });
    }
  } finally {
    tokenStore.clear();
  }
}

// ---------- profile ----------

function mapDriver(d: DriverOut): DriverProfile {
  return {
    id: d.id,
    email: d.email,
    fullName: d.fullName,
    phone: d.phone,
    avatarUrl: d.avatarUrl,
  };
}

export async function me(): Promise<DriverProfile> {
  return mapDriver(await api<DriverOut>('/driver/auth/me'));
}

export async function updateMe(body: {
  fullName?: string;
  phone?: string | null;
  avatarUrl?: string | null;
}): Promise<DriverProfile> {
  return mapDriver(
    await api<DriverOut>('/driver/auth/me', { method: 'PATCH', body: JSON.stringify(body) })
  );
}

export async function changePassword(
  currentPassword: string,
  newPassword: string
): Promise<void> {
  await api('/driver/auth/password', {
    method: 'POST',
    body: JSON.stringify({ currentPassword, newPassword }),
  });
}

// ---------- auth sessions (device list) ----------

export async function listAuthSessions(): Promise<AuthSessionOut[]> {
  return api<AuthSessionOut[]>('/driver/auth/sessions');
}

export async function revokeAuthSession(id: string): Promise<void> {
  await api(`/driver/auth/sessions/${id}`, { method: 'DELETE' });
}

// ---------- vehicles ----------

function mapVehicle(v: DriverVehicleOut): DriverVehicle {
  return {
    id: v.id,
    plateNumber: v.plateNumber,
    plateNormalized: v.plateNormalized,
    label: v.label,
    vehicleType: v.vehicleType,
    isPrimary: v.isPrimary,
  };
}

export const vehicles = {
  async list(): Promise<DriverVehicle[]> {
    const rows = await api<DriverVehicleOut[]>('/driver/vehicles');
    return rows.map(mapVehicle);
  },
  async add(body: {
    plateNumber: string;
    label?: string;
    vehicleType?: 'car' | 'motorcycle';
    isPrimary?: boolean;
  }): Promise<DriverVehicle> {
    const v = await api<DriverVehicleOut>('/driver/vehicles', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    return mapVehicle(v);
  },
  async update(
    id: string,
    body: Partial<{
      plateNumber: string;
      label: string | null;
      vehicleType: 'car' | 'motorcycle';
      isPrimary: boolean;
    }>
  ): Promise<DriverVehicle> {
    const v = await api<DriverVehicleOut>(`/driver/vehicles/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
    return mapVehicle(v);
  },
  async remove(id: string): Promise<void> {
    await api(`/driver/vehicles/${id}`, { method: 'DELETE' });
  },
};

// ---------- favorites ----------

export const favorites = {
  async listIds(): Promise<string[]> {
    const rows = await api<{ id: string }[]>('/driver/favorites');
    return rows.map((r) => r.id);
  },
  async add(siteId: string): Promise<void> {
    await api(`/driver/favorites/${siteId}`, { method: 'PUT' });
  },
  async remove(siteId: string): Promise<void> {
    await api(`/driver/favorites/${siteId}`, { method: 'DELETE' });
  },
};

// ---------- parking sessions ----------

function mapSession(s: DriverSessionOut): ParkingHistoryItem {
  return {
    id: s.id,
    vehiclePlate: s.plateNumber,
    tenantId: s.siteId,
    tenantName: s.siteName,
    tenantSlug: s.tenantSlug,
    floor: s.levelName ?? undefined,
    zone: s.zoneName ?? undefined,
    entryTime: s.enteredAt,
    durationSeconds: s.durationSeconds,
    currentFeeVnd: s.feeVnd,
    status: s.status,
    entrancePhotoUrl: s.entryImageUrl ?? undefined,
    anprConfidence: s.confidence ?? undefined,
  };
}

export const sessions = {
  async active(): Promise<ActiveParkingSession[]> {
    const rows = await api<DriverSessionOut[]>('/driver/sessions/active');
    return rows.map(mapSession);
  },
  async history(
    page = 1,
    limit = 20
  ): Promise<{ items: ParkingHistoryItem[]; total: number }> {
    const p = await api<Page<DriverSessionOut>>(
      `/driver/sessions/history?page=${page}&limit=${limit}`
    );
    return { items: p.data.map(mapSession), total: p.meta.total };
  },
};

// ---------- memberships ----------

function mapMembership(m: DriverMembershipOut): DriverMembership {
  return {
    id: m.id,
    siteId: m.siteId,
    siteName: m.siteName,
    tenantSlug: m.tenantSlug,
    plateNumber: m.plateNumber,
    plan: m.plan,
    status: m.status,
    startsAt: m.startsAt,
    endsAt: m.endsAt,
    createdAt: m.createdAt,
  };
}

export const memberships = {
  async list(): Promise<DriverMembership[]> {
    const rows = await api<DriverMembershipOut[]>('/driver/memberships');
    return rows.map(mapMembership);
  },
  async request(planId: string, vehicleId: string): Promise<DriverMembership> {
    const m = await api<DriverMembershipOut>('/driver/memberships', {
      method: 'POST',
      body: JSON.stringify({ planId, vehicleId }),
    });
    return mapMembership(m);
  },
  async cancel(id: string): Promise<DriverMembership> {
    const m = await api<DriverMembershipOut>(`/driver/memberships/${id}/cancel`, {
      method: 'POST',
    });
    return mapMembership(m);
  },
};

// ---------- payments ----------

function mapPayment(p: DriverPaymentOut): DriverPayment {
  return { ...p };
}

export const payments = {
  async list(): Promise<DriverPayment[]> {
    const rows = await api<DriverPaymentOut[]>('/driver/payments');
    return rows.map(mapPayment);
  },
  async get(id: string): Promise<DriverPayment> {
    return mapPayment(await api<DriverPaymentOut>(`/driver/payments/${id}`));
  },
  async create(
    body: { kind: 'membership'; membershipId: string } | { kind: 'session'; sessionId: string }
  ): Promise<DriverPayment> {
    return mapPayment(
      await api<DriverPaymentOut>('/driver/payments', {
        method: 'POST',
        body: JSON.stringify(body),
      })
    );
  },
  async cancel(id: string): Promise<DriverPayment> {
    return mapPayment(
      await api<DriverPaymentOut>(`/driver/payments/${id}/cancel`, { method: 'POST' })
    );
  },
};
