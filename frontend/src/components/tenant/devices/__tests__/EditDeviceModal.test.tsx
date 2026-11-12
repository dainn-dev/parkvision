// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '../../../../i18n';
import '../../../../test/stubMatchMedia';
import type { TenantEdgeDevice } from '../../../../types/tenant';
import { EditDeviceModal } from '../EditDeviceModal';

const platform = vi.hoisted(() => ({
  tenantSites: [] as { id: string; name: string }[],
  updateTenantDevice: vi.fn(),
}));

vi.mock('../../../../context/PlatformContext', () => ({
  usePlatform: () => platform,
}));

const ONE_SITE = [{ id: 'site-1', name: 'Main lot' }];
const TWO_SITES = [...ONE_SITE, { id: 'site-2', name: 'Annex' }];

const DEVICE: TenantEdgeDevice = {
  id: 'dev-1',
  siteId: 'site-1',
  siteName: 'Main lot',
  name: 'Barrier GW',
  deviceKey: 'edge-abc',
  status: 'ONLINE',
  cpuUsagePct: 0,
  ramUsagePct: 0,
  storageUsagePct: 0,
  createdAt: '2026-11-12T08:00:00Z',
};

const renderModal = (onClose = vi.fn()) => {
  render(<EditDeviceModal device={DEVICE} isOpen onClose={onClose} />);
  return onClose;
};

beforeEach(() => {
  platform.updateTenantDevice.mockReset();
  platform.updateTenantDevice.mockResolvedValue({ success: true });
});

afterEach(cleanup);

describe('EditDeviceModal', () => {
  test('does not show a site picker when the tenant has just one, and leaves the site alone on save', async () => {
    platform.tenantSites = ONE_SITE;
    const onClose = renderModal();

    expect(screen.queryByLabelText('Site')).toBeNull();

    const name = screen.getByLabelText('Device Name');
    await userEvent.clear(name);
    await userEvent.type(name, 'Renamed GW');
    await userEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

    await waitFor(() => expect(platform.updateTenantDevice).toHaveBeenCalledTimes(1));
    const [deviceId, payload] = platform.updateTenantDevice.mock.calls[0];
    expect(deviceId).toBe('dev-1');
    expect(payload).toMatchObject({ name: 'Renamed GW' });
    expect(payload).not.toHaveProperty('siteId');
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  test('keeps the site picker when the tenant has several sites', () => {
    platform.tenantSites = TWO_SITES;
    renderModal();

    expect(screen.getByLabelText('Site')).not.toBeNull();
  });
});
