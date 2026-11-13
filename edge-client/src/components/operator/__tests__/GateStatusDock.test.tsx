import { render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import GateStatusDock from '../GateStatusDock';

const gate = (direction: 'entry' | 'exit', state: 'closed' | 'locked' = 'closed') => ({
  gateId: direction, direction, gateState: state, armAngleDeg: 0, motorTempC: 32,
  loopActive: false, upsBattery: 98, barrierLinkOk: true, lastPlate: '30A-123.45',
  lastDecision: 'allow', lastReason: null,
});

describe('GateStatusDock', () => {
  test('shows direction, decision, barrier state and compact telemetry', () => {
    render(<GateStatusDock gates={[gate('entry'), gate('exit', 'locked')]} />);
    expect(screen.getByText('CỔNG VÀO')).toBeTruthy();
    expect(screen.getByText('CỔNG RA')).toBeTruthy();
    expect(screen.getAllByText('30A-123.45')).toHaveLength(2);
    expect(screen.getByText('locked')).toBeTruthy();
    expect(screen.getAllByText('98%')).toHaveLength(2);
  });
});
