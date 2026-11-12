// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import '../../../i18n';
import '../../../test/stubMatchMedia';
import type { TenantEdgeDevice } from '../../../types/tenant';
import { TenantEdgeDevicesPage } from '../TenantEdgeDevicesPage';

const DEVICE: TenantEdgeDevice = {
  id: 'dev-1',
  siteId: 'site-1',
  siteName: 'Main lot',
  name: 'Barrier GW',
  deviceKey: 'edge-abc',
  status: 'ONLINE',
  cpuUsagePct: 10,
  ramUsagePct: 20,
  storageUsagePct: 30,
  createdAt: '2026-11-12T08:00:00Z',
};

const ONE_SITE = [{ id: 'site-1', name: 'Main lot' }];
const TWO_SITES = [...ONE_SITE, { id: 'site-2', name: 'Annex' }];

const platform = vi.hoisted(() => ({
  tenantDevices: [] as unknown[],
  tenantDevicesTotal: 1,
  tenantSites: [] as { id: string; name: string }[],
  currentUser: { rawRole: 'owner' },
}));

vi.mock('../../../context/PlatformContext', () => ({
  usePlatform: () => platform,
}));

const renderPage = (sites: { id: string; name: string }[]) => {
  platform.tenantDevices = [DEVICE];
  platform.tenantSites = sites;
  render(<TenantEdgeDevicesPage />);
};

afterEach(cleanup);

describe('TenantEdgeDevicesPage', () => {
  test('talks about one location, not about sites, when the tenant has a single site', () => {
    renderPage(ONE_SITE);

    expect(screen.getByText('Barrier GW')).not.toBeNull();
    expect(screen.queryByText('Site: All')).toBeNull();
    expect(screen.queryByRole('columnheader', { name: 'Site' })).toBeNull();
    expect(screen.queryByText('Main lot')).toBeNull();
    expect(screen.queryByText('Across all sites')).toBeNull();
    expect(screen.getByText('At your location')).not.toBeNull();
    expect(screen.getByPlaceholderText('Search by name, serial, MAC, IP, or MQTT client...')).not.toBeNull();
  });

  test('keeps the site filter, column and wording when the tenant has several sites', () => {
    renderPage(TWO_SITES);

    expect(screen.getByText('Site: All')).not.toBeNull();
    expect(screen.getByRole('columnheader', { name: 'Site' })).not.toBeNull();
    expect(screen.getByText('Main lot', { selector: 'td' })).not.toBeNull();
    expect(screen.getByText('Across all sites')).not.toBeNull();
    expect(
      screen.getByPlaceholderText('Search by name, serial, MAC, IP, MQTT client, or site...'),
    ).not.toBeNull();
  });
});
