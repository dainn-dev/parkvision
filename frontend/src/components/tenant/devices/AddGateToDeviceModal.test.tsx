// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '../../../i18n';
import '../../../test/stubMatchMedia';
import { AddGateToDeviceModal } from './AddGateToDeviceModal';

const platform = vi.hoisted(() => ({ createTenantGate: vi.fn() }));
vi.mock('../../../context/PlatformContext', () => ({ usePlatform: () => platform }));

afterEach(cleanup);
beforeEach(() => platform.createTenantGate.mockReset());

describe('AddGateToDeviceModal', () => {
  test('creates a second gate bound to the selected Edge device without activation', async () => {
    platform.createTenantGate.mockImplementation(() => {});
    render(<AddGateToDeviceModal isOpen onClose={vi.fn()} site={{ id: 'site-1', name: 'Main lot' }} device={{ id: 'device-1', name: 'Gate PC' }} />);
    await userEvent.type(screen.getByLabelText('Gate name'), 'Exit gate');
    await userEvent.click(screen.getByRole('button', { name: 'Add gate' }));
    expect(platform.createTenantGate).toHaveBeenCalledWith('site-1', expect.objectContaining({
      name: 'Exit gate', edgeDeviceId: 'device-1', laneId: null,
    }));
  });
});
