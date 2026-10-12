import { api } from '../lib/api';
import { Tenant } from '../types';
import {
  PublicLocateOut,
  PublicMapLevelOut,
  PublicPlanOut,
  PublicSiteDetailOut,
  PublicSiteOut,
} from './types';

export type { PublicMapLevelOut, PublicMapZoneOut } from './types';

export interface SiteQuery {
  lat?: number;
  lng?: number;
  radiusKm?: number;
  q?: string;
}

export function mapSite(s: PublicSiteOut): Tenant {
  return {
    id: s.id,
    siteId: s.id,
    tenantId: s.tenantId,
    tenantSlug: s.tenantSlug,
    name: s.name,
    address: s.address ?? '',
    district: s.city ?? '',
    lat: s.latitude,
    lng: s.longitude,
    distanceMeters: s.distanceMeters,
    capacity: {
      total: s.capacity,
      occupied: s.occupied,
      available: s.available,
      status: s.capacityStatus,
      lastUpdatedAt: s.updatedAt,
    },
    pricing: {
      hourlyFrom: s.profile.pricing.hourlyFrom,
      dailyFrom: s.profile.pricing.dailyFrom,
      overnightFrom: s.profile.pricing.overnightFrom,
      monthlyFrom: s.profile.pricing.monthlyFrom,
    },
    openNow: isOpenNow(s.operatingHours),
    operatingHours: formatOperatingHours(s.operatingHours),
    supportsMembership: s.supportsMembership,
    parkingType: s.profile.parkingType,
    facilities: s.profile.facilities,
    image: s.profile.imageUrl ?? undefined,
    phone: s.contactPhone ?? undefined,
    description: s.profile.description ?? undefined,
    membershipPlans: [],
    membershipPriceFrom: s.membershipPriceFrom,
    floors: [],
    zones: [],
    isFavorite: s.isFavorite,
  };
}

function hoursOf(operatingHours: Record<string, unknown>): {
  open?: string;
  close?: string;
} {
  return {
    open: typeof operatingHours.open === 'string' ? operatingHours.open : undefined,
    close: typeof operatingHours.close === 'string' ? operatingHours.close : undefined,
  };
}

function formatOperatingHours(operatingHours: Record<string, unknown>): string {
  if (operatingHours['24/7'] === true || operatingHours.mode === '24/7') return '24/7';
  const { open, close } = hoursOf(operatingHours);
  if (open && close) return open === '00:00' && close === '23:59' ? '24/7' : `${open}–${close}`;
  return '';
}

function isOpenNow(operatingHours: Record<string, unknown>): boolean {
  const { open, close } = hoursOf(operatingHours);
  if (!open || !close) return true; // no published hours → don't claim closed
  const now = new Date();
  const cur = now.getHours() * 60 + now.getMinutes();
  const [oh, om] = open.split(':').map(Number);
  const [ch, cm] = close.split(':').map(Number);
  if ([oh, om, ch, cm].some(Number.isNaN)) return true;
  const openMin = oh * 60 + om;
  const closeMin = ch * 60 + cm;
  return closeMin > openMin
    ? cur >= openMin && cur <= closeMin
    : cur >= openMin || cur <= closeMin; // overnight window
}

export async function listSites(params: SiteQuery = {}): Promise<Tenant[]> {
  const search = new URLSearchParams();
  if (params.lat != null) search.set('lat', String(params.lat));
  if (params.lng != null) search.set('lng', String(params.lng));
  if (params.radiusKm != null) search.set('radiusKm', String(params.radiusKm));
  if (params.q) search.set('q', params.q);
  const qs = search.toString();
  const sites = await api<PublicSiteOut[]>(`/public/sites${qs ? `?${qs}` : ''}`);
  return sites.map(mapSite);
}

export async function getSite(
  id: string
): Promise<Tenant & { levels: PublicMapLevelOut[] }> {
  const s = await api<PublicSiteDetailOut>(`/public/sites/${id}`);
  return { ...mapSite(s), levels: s.levels };
}

export async function listSitePlans(siteId: string): Promise<PublicPlanOut[]> {
  return api<PublicPlanOut[]>(`/public/sites/${siteId}/plans`);
}

export async function locatePlate(
  tenantSlug: string,
  plate: string
): Promise<PublicLocateOut> {
  return api<PublicLocateOut>(
    `/public/tenants/${encodeURIComponent(tenantSlug)}/parking/locate?plate=${encodeURIComponent(plate)}`
  );
}
