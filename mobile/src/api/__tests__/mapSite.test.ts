import { describe, expect, it } from 'vitest';
import { mapSite } from '../public';
import { PublicSiteOut } from '../types';

const baseSite: PublicSiteOut = {
  id: 'site-1',
  tenantId: 'tenant-1',
  tenantSlug: 'acme-parking',
  name: 'Acme Parking',
  address: '1 Main St',
  city: 'Ho Chi Minh City',
  latitude: 10.73,
  longitude: 106.72,
  distanceMeters: 420,
  capacity: 100,
  occupied: 80,
  available: 20,
  capacityStatus: 'LIMITED',
  operatingHours: { open: '06:00', close: '23:00' },
  contactPhone: '0901234567',
  profile: {
    listed: true,
    description: 'Covered parking',
    imageUrl: 'https://example.com/img.jpg',
    parkingType: 'covered',
    facilities: ['CCTV', 'Security'],
    pricing: {
      hourlyFrom: 20000,
      dailyFrom: null,
      overnightFrom: 80000,
      monthlyFrom: null,
      graceMinutes: 0,
      blockMinutes: 60,
      overnightStartHour: 22,
      overnightEndHour: 6,
    },
  },
  isFavorite: false,
  supportsMembership: false,
  membershipPriceFrom: null,
  updatedAt: '2026-01-01T00:00:00Z',
};

describe('mapSite', () => {
  it('maps profile/pricing/capacity fields to the Tenant UI model', () => {
    const t = mapSite(baseSite);
    expect(t.id).toBe('site-1');
    expect(t.siteId).toBe('site-1');
    expect(t.tenantSlug).toBe('acme-parking');
    expect(t.pricing.hourlyFrom).toBe(20000);
    expect(t.pricing.dailyFrom).toBeNull();
    expect(t.capacity.status).toBe('LIMITED');
    expect(t.capacity.available).toBe(20);
    expect(t.facilities).toEqual(['CCTV', 'Security']);
    expect(t.parkingType).toBe('covered');
    expect(t.image).toBe('https://example.com/img.jpg');
    expect(t.description).toBe('Covered parking');
    expect(t.phone).toBe('0901234567');
    expect(typeof t.openNow).toBe('boolean');
    expect(t.operatingHours).toBe('06:00–23:00');
    expect(t.membershipPlans).toEqual([]);
    expect(t.supportsMembership).toBe(false);
    expect(t.membershipPriceFrom).toBeNull();
    expect(t.distanceMeters).toBe(420);
  });

  it('maps membership support flags from the site payload', () => {
    const t = mapSite({ ...baseSite, supportsMembership: true, membershipPriceFrom: 900000 });
    expect(t.supportsMembership).toBe(true);
    expect(t.membershipPriceFrom).toBe(900000);
  });

  it('leaves missing backend fields empty instead of fabricating them', () => {
    const t = mapSite({
      ...baseSite,
      latitude: null,
      longitude: null,
      distanceMeters: null,
      contactPhone: null,
      profile: {
        listed: true,
        description: null,
        imageUrl: null,
        parkingType: null,
        facilities: [],
        pricing: {
          hourlyFrom: null,
          dailyFrom: null,
          overnightFrom: null,
          monthlyFrom: null,
          graceMinutes: 0,
          blockMinutes: 60,
          overnightStartHour: 22,
          overnightEndHour: 6,
        },
      },
    });
    expect(t.lat).toBeNull();
    expect(t.distanceMeters).toBeNull();
    expect(t.image).toBeUndefined();
    expect(t.description).toBeUndefined();
    expect(t.phone).toBeUndefined();
    expect(t.parkingType).toBeNull();
    expect(t.pricing.hourlyFrom).toBeNull();
    expect(t.rating).toBeUndefined();
  });

  it('treats 00:00-23:59 operating hours as 24/7', () => {
    const t = mapSite({ ...baseSite, operatingHours: { open: '00:00', close: '23:59' } });
    expect(t.operatingHours).toBe('24/7');
    expect(t.openNow).toBe(true);
  });
});
