import { describe, expect, it } from 'vitest';
import { PUBLIC_ROUTES, shouldResetToLanding, viewFromPath, type PublicViewType } from '../publicRoutes';

describe('publicRoutes', () => {
  it('round-trips every view through its path', () => {
    for (const view of Object.keys(PUBLIC_ROUTES) as PublicViewType[]) {
      expect(viewFromPath(PUBLIC_ROUTES[view])).toBe(view);
    }
  });

  it('ignores trailing slash and case', () => {
    expect(viewFromPath('/download/')).toBe('download');
    expect(viewFromPath('/DOWNLOAD')).toBe('download');
  });

  it('falls back to landing for unknown or empty paths', () => {
    expect(viewFromPath('/nope')).toBe('landing');
    expect(viewFromPath('')).toBe('landing');
  });
});

describe('shouldResetToLanding', () => {
  it('is false when not authenticated', () => {
    expect(shouldResetToLanding({ isAuthenticated: false, isPreviewing: false, pathname: '/login' })).toBe(false);
  });
  it('is false when authenticated at the landing path', () => {
    expect(shouldResetToLanding({ isAuthenticated: true, isPreviewing: false, pathname: '/' })).toBe(false);
  });
  it('is true when authenticated off the landing path and not previewing', () => {
    expect(shouldResetToLanding({ isAuthenticated: true, isPreviewing: false, pathname: '/download' })).toBe(true);
    expect(shouldResetToLanding({ isAuthenticated: true, isPreviewing: false, pathname: '/login' })).toBe(true);
  });
  it('is false while an authenticated admin previews the public site', () => {
    expect(shouldResetToLanding({ isAuthenticated: true, isPreviewing: true, pathname: '/download' })).toBe(false);
  });
});
