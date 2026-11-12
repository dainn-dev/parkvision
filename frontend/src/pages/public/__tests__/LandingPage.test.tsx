// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import '../../../i18n';
import { publicApi } from '../../../services/api';
import { LandingPage } from '../LandingPage';

const NAVBAR_ANCHORS = ['simulator', 'features', 'how-it-works', 'solutions', 'apps', 'pricing', 'faq'];

// Renders the page and lets the pricing request settle so state updates land inside act().
const renderPage = async (onNavigate = vi.fn()) => {
  const result = render(
    <MemoryRouter>
      <LandingPage onNavigate={onNavigate} />
    </MemoryRouter>,
  );
  await act(async () => {});
  return result;
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('LandingPage', () => {
  test('primary CTA navigates to register', async () => {
    vi.spyOn(publicApi, 'plans').mockResolvedValue([]);
    const onNavigate = vi.fn();
    await renderPage(onNavigate);

    await userEvent.click(screen.getByRole('button', { name: 'Start 14-day free trial' }));

    expect(onNavigate).toHaveBeenCalledWith('register');
  });

  test('apps section links to /download', async () => {
    vi.spyOn(publicApi, 'plans').mockResolvedValue([]);
    const { container } = await renderPage();

    const apps = container.querySelector('#apps');
    expect(apps).not.toBeNull();
    const links = Array.from(apps!.querySelectorAll('a')).map((a) => a.getAttribute('href'));
    expect(links).toContain('/download');
  });

  test('landing exposes every anchor id used by the navbar', async () => {
    vi.spyOn(publicApi, 'plans').mockResolvedValue([]);
    const { container } = await renderPage();

    for (const id of NAVBAR_ANCHORS) {
      expect(container.querySelector(`#${id}`), `missing #${id}`).not.toBeNull();
    }
  });

  test('contains no unsourced claims', async () => {
    vi.spyOn(publicApi, 'plans').mockResolvedValue([]);
    const { container } = await renderPage();

    const text = container.textContent ?? '';
    for (const claim of ['250+', '99.8%', '99.9%', 'Sunrise Tower']) {
      expect(text.includes(claim), `found "${claim}"`).toBe(false);
    }
    const remoteImages = Array.from(container.querySelectorAll('img')).filter((img) =>
      (img.getAttribute('src') ?? '').includes('unsplash'),
    );
    expect(remoteImages).toHaveLength(0);
  });

  test('demo flags a typed blocklisted plate', async () => {
    vi.spyOn(publicApi, 'plans').mockResolvedValue([]);
    await renderPage();
    const user = userEvent.setup();

    await user.clear(screen.getByLabelText('Or type any plate'));
    await user.type(screen.getByLabelText('Or type any plate'), '30A-666.01');
    await user.click(screen.getByRole('button', { name: 'Scan' }));

    expect(await screen.findByText('Blocked: flagged')).not.toBeNull();
    expect(screen.getByText('30A-666.01')).not.toBeNull();
  });

  test('still renders pricing cards when the plans request fails', async () => {
    vi.spyOn(publicApi, 'plans').mockRejectedValue(new Error('network down'));
    const { container } = await renderPage();

    expect(await screen.findByRole('heading', { name: 'Business' })).not.toBeNull();
    const pricing = container.querySelector('#pricing');
    for (const name of ['Starter', 'Business', 'Enterprise']) {
      expect(pricing?.textContent?.includes(name), `missing ${name}`).toBe(true);
    }
  });
});
