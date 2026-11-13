// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '../../../../i18n';
import '../../../../test/stubMatchMedia';
import { EdgeSetupWizard } from '../EdgeSetupWizard';

const platform = vi.hoisted(() => ({
  tenantSites: [] as { id: string; name: string }[],
  setupTenantEdge: vi.fn(),
}));

vi.mock('../../../../context/PlatformContext', () => ({
  usePlatform: () => platform,
}));

const RESULT = {
  site: { id: 'site-1', name: 'Main lot', timezone: 'Asia/Ho_Chi_Minh' },
  device: { id: 'device-1', name: 'Main Edge' },
  gate: { id: 'gate-1', name: 'Main Entry' },
  activation: { code: 'ABCD-EFGH-JKLM', expiresAt: '2026-11-14T10:00:00Z', allowedIp: null },
  nextSteps: ['Open ParkVision Edge on the gate PC', 'Enter this activation code', 'Wait until the device shows Activated']
};

const ONE_SITE = [{ id: 'site-1', name: 'Main lot' }];
const TWO_SITES = [...ONE_SITE, { id: 'site-2', name: 'Annex' }];

beforeEach(() => {
  platform.setupTenantEdge.mockReset();
  platform.setupTenantEdge.mockResolvedValue({ success: true, data: RESULT });
});
afterEach(cleanup);

describe('EdgeSetupWizard', () => {
  test('skips location selection for a single-site tenant', () => {
    platform.tenantSites = ONE_SITE;
    render(<EdgeSetupWizard isOpen onClose={vi.fn()} />);
    expect(screen.getByText('Your only location will be used automatically.')).not.toBeNull();
    expect(screen.queryByLabelText('Location')).toBeNull();
  });

  test('shows location selection for a multi-site tenant', () => {
    platform.tenantSites = TWO_SITES;
    render(<EdgeSetupWizard isOpen onClose={vi.fn()} />);
    expect(screen.getByLabelText('Location')).not.toBeNull();
  });

  test('submits human-facing setup fields and shows the activation code', async () => {
    platform.tenantSites = ONE_SITE;
    render(<EdgeSetupWizard isOpen onClose={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await userEvent.type(screen.getByLabelText('Edge PC name'), 'Main Edge');
    await userEvent.type(screen.getByLabelText('Gate name'), 'Main Entry');
    await userEvent.click(screen.getByRole('button', { name: 'Create and show activation code' }));

    expect(await screen.findByText('ABCD-EFGH-JKLM')).not.toBeNull();
    expect(platform.setupTenantEdge).toHaveBeenCalledWith({
      deviceName: 'Main Edge',
      gateName: 'Main Entry',
      gateDirection: 'entry',
      gateType: 'barrier',
    });
  });

  test('keeps technical fields out of the normal setup request', async () => {
    platform.tenantSites = ONE_SITE;
    render(<EdgeSetupWizard isOpen onClose={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await userEvent.type(screen.getByLabelText('Edge PC name'), 'Main Edge');
    await userEvent.type(screen.getByLabelText('Gate name'), 'Main Entry');
    await userEvent.click(screen.getByRole('button', { name: 'Create and show activation code' }));
    const payload = platform.setupTenantEdge.mock.calls[0][0];
    expect(payload).not.toHaveProperty('mqttClientId');
    expect(payload).not.toHaveProperty('ipAddress');
    expect(payload).not.toHaveProperty('mac');
  });
});
