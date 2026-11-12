import { describe, expect, it } from 'vitest';
import { PUBLIC_ROUTES, viewFromPath, type PublicViewType } from '../publicRoutes';

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
