import { render, screen } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import QuickActions from './QuickActions';

const gate = { gateId: 'g1', gateState: 'locked', direction: 'entry' } as any;
test('disables open and close when gate is locked', () => {
  render(<QuickActions gate={gate} onAction={vi.fn()} />);
  expect(screen.getByRole('button', { name: 'Mở barrier' })).toBeDisabled();
  expect(screen.getByRole('button', { name: /đóng/i })).toBeDisabled();
});
