// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '../../../../i18n';
import '../../../../test/stubMatchMedia';
import { RegisterDeviceModal } from '../RegisterDeviceModal';

const platform = vi.hoisted(() => ({
  tenantSites: [] as { id: string; name: string }[],
  createTenantDevice: vi.fn(),
}));

vi.mock('../../../../context/PlatformContext', () => ({
  usePlatform: () => platform,
}));

const ONE_SITE = [{ id: 'site-1', name: 'Main lot' }];
const TWO_SITES = [...ONE_SITE, { id: 'site-2', name: 'Annex' }];

const renderModal = (onClose = vi.fn()) => {
  render(<RegisterDeviceModal isOpen onClose={onClose} />);
  return onClose;
};

const fillNameAndSubmit = async (name: string) => {
  await userEvent.type(screen.getByLabelText('Device Name'), name);
  await userEvent.click(screen.getByRole('button', { name: 'Register Device' }));
};

beforeEach(() => {
  platform.createTenantDevice.mockReset();
  platform.createTenantDevice.mockResolvedValue({ success: true });
});

afterEach(cleanup);

describe('RegisterDeviceModal', () => {
  test('does not ask for a site when the tenant has just one, and says what the device is for', async () => {
    platform.tenantSites = ONE_SITE;
    const onClose = renderModal();

    expect(screen.queryByLabelText('Site')).toBeNull();
    expect(screen.getByText('Provision a new edge gateway for your location')).not.toBeNull();

    await fillNameAndSubmit('Barrier GW');

    await waitFor(() => expect(platform.createTenantDevice).toHaveBeenCalledTimes(1));
    const payload = platform.createTenantDevice.mock.calls[0][0];
    expect(payload).toMatchObject({ name: 'Barrier GW' });
    expect(payload).not.toHaveProperty('siteId');
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  test('still asks which site when the tenant has several, and does not guess', async () => {
    platform.tenantSites = TWO_SITES;
    renderModal();

    expect(screen.getByLabelText('Site')).not.toBeNull();

    await fillNameAndSubmit('Barrier GW');

    expect(platform.createTenantDevice).not.toHaveBeenCalled();
  });

  test('explains a missing location in plain words instead of showing the raw server message', async () => {
    platform.tenantSites = ONE_SITE;
    platform.createTenantDevice.mockResolvedValue({
      success: false,
      message: 'This tenant has no site yet. Set up the location before registering a device.',
      code: 'no_site',
    });
    renderModal();

    await fillNameAndSubmit('Barrier GW');

    expect(await screen.findByText('Set up your location first, then register the device.')).not.toBeNull();
  });

  test('shows the server message for any other failure', async () => {
    platform.tenantSites = ONE_SITE;
    platform.createTenantDevice.mockResolvedValue({
      success: false,
      message: 'device_serial or mqtt_client_id already in use',
      code: 'conflict',
    });
    renderModal();

    await fillNameAndSubmit('Barrier GW');

    expect(await screen.findByText('device_serial or mqtt_client_id already in use')).not.toBeNull();
  });
});
