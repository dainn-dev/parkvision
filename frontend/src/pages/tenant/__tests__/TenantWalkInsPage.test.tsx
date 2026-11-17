// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import i18n from '../../../i18n';
import '../../../test/stubMatchMedia';
import { TenantWalkInsPage } from '../TenantWalkInsPage';

const api = vi.hoisted(() => ({
  walkIns: vi.fn(),
  walkInSummary: vi.fn(),
}));

vi.mock('../../../services/api', () => ({ tenantApi: api }));

vi.mock('../../../context/PlatformContext', () => ({
  usePlatform: () => ({
    activeTenantId: 'tenant-1',
    tenantSites: [{ id: 'site-1', name: 'Main lot' }],
  }),
}));

const SUMMARY = {
  cashCount: 3,
  cashTotalVnd: 150000,
  bankQrCount: 2,
  bankQrTotalVnd: 90000,
  waivedCount: 1,
  openCount: 4,
  mismatchCount: 1,
};

const row = (over: Record<string, unknown>) => ({
  id: 'w-1',
  siteId: 'site-1',
  plateNumber: '51A12345',
  payCode: 'PV1',
  status: 'paid',
  entryGateId: null,
  enteredAt: '2026-11-17T01:00:00Z',
  exitGateId: null,
  exitedAt: '2026-11-17T03:00:00Z',
  amountVnd: 20000,
  expectedAmountVnd: 20000,
  method: 'cash',
  confirmedBy: null,
  waiveReason: null,
  amountMismatch: false,
  ...over,
});

const ROWS = [
  row({}),
  row({ id: 'w-2', plateNumber: '30B99999', status: 'waived', method: null, amountVnd: 0, waiveReason: 'Xe công vụ' }),
  row({ id: 'w-3', plateNumber: '29C55555', method: 'bank_qr', amountVnd: 10000, expectedAmountVnd: 15000, amountMismatch: true }),
];

beforeAll(async () => {
  await i18n.changeLanguage('vi');
});

beforeEach(() => {
  api.walkIns.mockReset().mockResolvedValue({ data: ROWS, meta: { page: 1, limit: 20, total: 3 } });
  api.walkInSummary.mockReset().mockResolvedValue(SUMMARY);
});

afterEach(cleanup);

describe('TenantWalkInsPage', () => {
  test('summary tiles show counts and totals from the API', async () => {
    render(<TenantWalkInsPage />);

    const cash = await screen.findByTestId('tile-cash');
    expect(within(cash).getByText('Tiền mặt')).not.toBeNull();
    expect(cash.textContent).toContain('3');
    expect(cash.textContent).toContain((150000).toLocaleString('vi-VN'));
    const transfer = screen.getByTestId('tile-bank');
    expect(within(transfer).getByText('Chuyển khoản')).not.toBeNull();
    expect(transfer.textContent).toContain((90000).toLocaleString('vi-VN'));
    expect(screen.getByTestId('tile-waived').textContent).toContain('1');
    expect(screen.getByTestId('tile-open').textContent).toContain('4');
    expect(screen.getByTestId('tile-mismatch').textContent).toContain('1');
  });

  test('changing the date range refetches', async () => {
    render(<TenantWalkInsPage />);
    await screen.findByText('51A12345');
    expect(api.walkIns).toHaveBeenCalledTimes(1);
    const firstFrom = api.walkIns.mock.calls[0][1].from;

    fireEvent.change(screen.getByLabelText('Từ ngày'), { target: { value: '2026-01-05' } });

    await waitFor(() => expect(api.walkIns).toHaveBeenCalledTimes(2));
    expect(api.walkIns.mock.calls[1][1].from).not.toBe(firstFrom);
    expect(api.walkIns.mock.calls[1][1].from).toMatch(/^2026-01-0[45]T/);
    await waitFor(() => expect(api.walkInSummary).toHaveBeenCalledTimes(2));
    expect(api.walkInSummary.mock.calls[1][1].from).toBe(api.walkIns.mock.calls[1][1].from);
  });

  test('waived rows show their reason', async () => {
    render(<TenantWalkInsPage />);
    const plate = await screen.findByText('30B99999');
    const tr = plate.closest('tr') as HTMLElement;
    expect(within(tr).getByText('Xe công vụ')).not.toBeNull();
    expect(within(tr).getByText('Miễn phí')).not.toBeNull();
  });

  test('mismatched rows are flagged', async () => {
    render(<TenantWalkInsPage />);
    const flagged = (await screen.findByText('29C55555')).closest('tr') as HTMLElement;
    const clean = screen.getByText('51A12345').closest('tr') as HTMLElement;
    expect(within(flagged).getByText(/Lệch giá/)).not.toBeNull();
    expect(within(flagged).getByText(/15\.000/)).not.toBeNull();
    expect(within(clean).queryByText(/Lệch giá/)).toBeNull();
  });
});
