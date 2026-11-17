// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import i18n from '../../../i18n';
import '../../../test/stubMatchMedia';
import type { TenantLocation } from '../../../types/tenant';
import { EditLocationSheet } from '../EditLocationSheet';

const LOCATION = {
  id: 's1',
  tenantId: 't1',
  tenantName: 'T',
  name: 'Main lot',
  code: 'ML',
  status: 'ACTIVE',
  address: { line1: '1 Le Loi', line2: '', city: 'HCM', province: '', postalCode: '', country: 'Vietnam' },
  timezone: 'Asia/Ho_Chi_Minh',
  latitude: 10.7,
  longitude: 106.7,
  phone: '',
  email: '',
  operatingHours: { timezone: 'Asia/Ho_Chi_Minh', isOpen24_7: true, days: [] },
  createdAt: '',
  updatedAt: '',
} as unknown as TenantLocation;

beforeAll(async () => {
  await i18n.changeLanguage('vi');
});
afterEach(cleanup);

const setup = () => {
  const onSave = vi.fn();
  render(<EditLocationSheet isOpen onClose={() => {}} location={LOCATION} onSave={onSave} />);
  return onSave;
};
const type = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
const submit = () => fireEvent.submit(screen.getByLabelText('Mã ngân hàng (BIN)').closest('form') as HTMLFormElement);

describe('EditLocationSheet bank account', () => {
  test('bank account with only a BIN filled is rejected', async () => {
    const onSave = setup();
    expect(screen.getByText('Tài khoản nhận chuyển khoản')).not.toBeNull();
    type('Mã ngân hàng (BIN)', '970436');
    submit();

    expect(await screen.findByText('Nhập đủ cả ba trường hoặc để trống cả ba.')).not.toBeNull();
    await new Promise((r) => setTimeout(r, 600));
    expect(onSave).not.toHaveBeenCalled();
  });

  test('all three empty saves no bank account; all filled saves it', async () => {
    const onSave = setup();
    submit();
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][0].bankAccount).toBeNull();

    cleanup();
    const onSave2 = setup();
    type('Mã ngân hàng (BIN)', '970436');
    type('Số tài khoản', '0123456789');
    type('Tên tài khoản', 'nguyen van a');
    submit();
    await waitFor(() => expect(onSave2).toHaveBeenCalledTimes(1));
    expect(onSave2.mock.calls[0][0].bankAccount).toEqual({
      bin: '970436',
      accountNumber: '0123456789',
      accountName: 'NGUYEN VAN A',
    });
  });
});
