// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import '../../../i18n';
import { publicApi, type LatestReleaseOut } from '../../../services/api';
import { DownloadPage } from '../DownloadPage';

const edge: LatestReleaseOut = {
  channel: 'edge-windows-x86_64',
  version: '1.2.0',
  versionCode: null,
  notes: 'Edge notes',
  sizeBytes: 48211456,
  sha256: 'a'.repeat(64),
  publishedAt: '2026-11-10T08:00:00Z',
};
const android: LatestReleaseOut = {
  channel: 'android',
  version: '2.0.1',
  versionCode: 21,
  notes: 'Android notes',
  sizeBytes: 10485760,
  sha256: 'b'.repeat(64),
  publishedAt: '2026-11-09T08:00:00Z',
};

const renderPage = () =>
  render(
    <MemoryRouter>
      <DownloadPage />
    </MemoryRouter>,
  );

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('DownloadPage', () => {
  test('shows a loading status while the request is pending', () => {
    vi.spyOn(publicApi, 'latestReleases').mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(screen.getByRole('status', { name: 'Loading releases' })).not.toBeNull();
  });

  test('renders both releases with size, sha256 and download links', async () => {
    vi.spyOn(publicApi, 'latestReleases').mockResolvedValue([edge, android]);
    renderPage();
    expect(await screen.findByText('1.2.0')).not.toBeNull();
    expect(screen.getByText('2.0.1')).not.toBeNull();
    expect(screen.getByText('46.0 MB')).not.toBeNull();
    expect(screen.getByText('a'.repeat(64))).not.toBeNull();
    const hrefs = screen.getAllByRole('link', { name: /Download/ }).map((a) => a.getAttribute('href'));
    expect(hrefs.some((h) => h?.endsWith('/api/v1/updates/download/edge-windows-x86_64'))).toBe(true);
    expect(hrefs.some((h) => h?.endsWith('/api/v1/updates/download/android'))).toBe(true);
  });

  test('shows "No published release yet" only on the channel that is missing', async () => {
    vi.spyOn(publicApi, 'latestReleases').mockResolvedValue([edge]);
    renderPage();
    await screen.findByText('1.2.0');
    expect(screen.getAllByText('No published release yet')).toHaveLength(1);
  });

  test('shows "No published release yet" on both cards when releases is empty', async () => {
    vi.spyOn(publicApi, 'latestReleases').mockResolvedValue([]);
    renderPage();
    expect(await screen.findAllByText('No published release yet')).toHaveLength(2);
  });

  test('shows one error alert with a retry button and recovers on retry', async () => {
    const spy = vi
      .spyOn(publicApi, 'latestReleases')
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValue([edge, android]);
    renderPage();
    expect(await screen.findAllByRole('alert')).toHaveLength(1);
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('1.2.0')).not.toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(spy).toHaveBeenCalledTimes(2);
  });

  test('renders notes containing a script tag as text', async () => {
    vi.spyOn(publicApi, 'latestReleases').mockResolvedValue([
      { ...edge, notes: '<script>alert(1)</script>' },
      android,
    ]);
    renderPage();
    expect(await screen.findByText('<script>alert(1)</script>')).not.toBeNull();
    expect(document.querySelector('script')).toBeNull();
  });

  test('copy button does not throw when navigator.clipboard is undefined', async () => {
    vi.spyOn(publicApi, 'latestReleases').mockResolvedValue([edge, android]);
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
    renderPage();
    await screen.findByText('1.2.0');
    await userEvent.click(screen.getAllByRole('button', { name: 'Copy SHA-256' })[0]);
    await waitFor(() => expect(screen.getByText('Copy failed, select the hash manually')).not.toBeNull());
  });
});
