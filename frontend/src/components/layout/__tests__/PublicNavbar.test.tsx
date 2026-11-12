// @vitest-environment jsdom
import type React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import '../../../i18n';
import { PublicNavbar } from '../PublicNavbar';

vi.mock('../../../context/PlatformContext', () => ({
  usePlatform: () => ({ isAuthenticated: false, theme: 'dark', toggleTheme: vi.fn() }),
}));

// vitest.config.ts has no '@' alias, so the shadcn-backed ui barrel cannot load here.
vi.mock('../../ui', () => ({
  Button: ({ children, onClick }: { children?: React.ReactNode; onClick?: () => void }) => (
    <button onClick={onClick}>{children}</button>
  ),
  Badge: ({ children }: { children?: React.ReactNode }) => <span>{children}</span>,
}));

vi.mock('../../common/LanguageSwitcher', () => ({ LanguageSwitcher: () => null }));

afterEach(cleanup);

function renderNavbar(onNavigate = vi.fn(), currentView: 'landing' | 'download' = 'landing') {
  render(
    <MemoryRouter initialEntries={[currentView === 'download' ? '/download' : '/']}>
      <PublicNavbar currentView={currentView} onNavigate={onNavigate} onScrollToSection={vi.fn()} />
    </MemoryRouter>,
  );
  return onNavigate;
}

describe('PublicNavbar', () => {
  it('shows the ParkVision brand and no ANPR.CLOUD text', () => {
    renderNavbar();
    const text = document.body.textContent ?? '';
    expect(text).toContain('ParkVision');
    expect(text).not.toContain('ANPR.CLOUD');
    expect(text).not.toContain('SaaS v4.8');
  });

  it('has a Download link to /download', () => {
    renderNavbar();
    const links = Array.from(document.querySelectorAll('a')).filter(
      (a) => a.getAttribute('href') === '/download',
    );
    expect(links.length).toBeGreaterThan(0);
  });

  it('clicking a section link while on /download navigates to landing first', () => {
    const onNavigate = renderNavbar(vi.fn(), 'download');
    const button = screen
      .getAllByRole('button')
      .find((b) => /features|tính năng/i.test(b.textContent ?? ''));
    expect(button).toBeTruthy();
    fireEvent.click(button!);
    expect(onNavigate).toHaveBeenCalledWith('landing');
  });
});
