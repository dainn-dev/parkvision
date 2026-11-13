import { render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import CameraWorkspace from '../CameraWorkspace';

const camera = (id: string, purpose: string) => ({
  cameraId: id,
  purpose,
  streamUrl: `rtsp://${id}/stream`,
});

describe('CameraWorkspace', () => {
  test('renders two camera tiles with live previews and purpose labels', () => {
    render(<CameraWorkspace cameras={[camera('entry', 'plate'), camera('exit', 'overview')]} camLive={{
      entry: { jpeg: 'entry-jpeg', state: 'live' },
      exit: { jpeg: 'exit-jpeg', state: 'live' },
    }} />);
    expect(screen.getByAltText('CAM BIỂN SỐ — TRỰC TIẾP')).toBeTruthy();
    expect(screen.getByAltText('CAM TOÀN CẢNH — TRỰC TIẾP')).toBeTruthy();
    expect(screen.getAllByRole('img')).toHaveLength(2);
  });

  test('shows a readable fallback when the stream has no preview', () => {
    render(<CameraWorkspace cameras={[camera('entry', 'plate')]} camLive={{ entry: { state: 'worker_error', detail: 'camera offline' } }} />);
    expect(screen.getByText('camera offline')).toBeTruthy();
  });

  test('calls selection callback for a thumbnail', () => {
    const onSelect = vi.fn();
    render(<CameraWorkspace cameras={[camera('entry', 'plate'), camera('exit', 'overview'), camera('wide', 'overview'), camera('north', 'overview'), camera('south', 'overview')]} camLive={{}} onSelectCamera={onSelect} />);
    screen.getAllByRole('button', { name: /overview/i })[0].click();
    expect(onSelect).toHaveBeenCalledWith('exit');
  });
});
