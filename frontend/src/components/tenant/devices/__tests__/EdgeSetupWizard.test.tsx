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
  gates: [{ id: 'gate-1', name: 'Main Entry' }],
  gate: { id: 'gate-1', name: 'Main Entry' },
  activation: { code: 'ABCD-EFGH-JKLM', expiresAt: '2026-11-14T10:00:00Z', allowedIp: null },
  nextSteps: ['Open ParkVision Edge on the gate PC', 'Enter this activation code', 'Wait until the device shows Activated']
};

const ONE_SITE = [{ id: 'site-1', name: 'Main lot' }];
const TWO_SITES = [...ONE_SITE, { id: 'site-2', name: 'Annex' }];

beforeEach(() => {
  platform.tenantSites = [];
  platform.setupTenantEdge.mockReset();
  platform.setupTenantEdge.mockResolvedValue({ success: true, data: RESULT });
});
afterEach(cleanup);

describe('EdgeSetupWizard', () => {
  test('skips location selection for a single-site tenant', () => {
    platform.tenantSites = ONE_SITE;
    render(<EdgeSetupWizard isOpen onClose={vi.fn()} />);
    expect(screen.getByText('Name your gatehouse')).not.toBeNull();
    expect(screen.queryByLabelText('Location')).toBeNull();
  });

  test('submits human-facing setup fields and shows the activation code', async () => {
    platform.tenantSites = ONE_SITE;
    render(<EdgeSetupWizard isOpen onClose={vi.fn()} />);
    await userEvent.type(screen.getByLabelText('Edge PC name'), 'Main Edge');
    expect(screen.getByText('Gate 2')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Create and show activation code' })).not.toBeNull();
    expect(platform.setupTenantEdge).not.toHaveBeenCalled();
  });

  test('keeps technical fields out of the normal setup request', async () => {
    platform.tenantSites = ONE_SITE;
    render(<EdgeSetupWizard isOpen onClose={vi.fn()} />);
    await userEvent.type(screen.getByLabelText('Edge PC name'), 'Main Edge');
    expect(screen.queryByLabelText('MQTT Client ID')).toBeNull();
    expect(screen.queryByLabelText('IP Address')).toBeNull();
    expect(screen.queryByLabelText('MAC Address')).toBeNull();
    expect(screen.getByText('Name your gatehouse')).not.toBeNull();
  });
});
