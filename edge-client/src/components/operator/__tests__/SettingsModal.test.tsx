import { render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import SettingsModal from '../SettingsModal';

vi.mock('../../../screens/BarrierSettingsScreen', () => ({ default: () => <div>Barrier form</div> }));
vi.mock('../../UpdateButton', () => ({ default: () => <button>Update</button> }));

const cfg = { gates: [] } as any;
const gate = { gateId: 'g1', direction: 'entry', cameras: [] } as any;

describe('SettingsModal', () => {
  test('shows one surface with device and camera settings', () => {
    render(<SettingsModal cfg={cfg} gate={gate} mqttConnected onResync={vi.fn()} onLock={vi.fn()} onSaved={vi.fn()} onClose={vi.fn()} notify={vi.fn()} lastSyncAt={null} />);
    expect(screen.getByRole('heading', { name: 'Cài đặt Edge Client' })).toBeInTheDocument();
    expect(screen.getAllByText('Thiết bị')).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Camera' })).toBeInTheDocument();
  });
});
