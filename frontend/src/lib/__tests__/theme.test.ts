/**
 * UI-TC-001: Saved light theme applies before first paint and toggle persists after reload.
 * UI-TC-002: Missing or unknown theme preference defaults to dark without script failure.
 *
 * These tests verify the index.html inline boot script and the theme
 * state-init / effect logic duplicated from PlatformContext.
 */
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { afterEach, describe, expect, it } from 'vitest';

/** Extract the first inline <script> from index.html (the pre-paint boot). */
function loadBootScript(): string {
  const html = readFileSync(new URL('../../../index.html', import.meta.url), 'utf8');
  const match = html.match(/<script>([\s\S]*?)<\/script>/);
  if (!match?.[1]) throw new Error('Boot script not found in index.html');
  return match[1];
}

/** Create a JSDOM that executes the boot script with optional seeded localStorage. */
function bootDom(script: string, seed?: Record<string, string>, breakStorage = false): JSDOM {
  return new JSDOM(
    `<!doctype html><html><head><script>${script}</script></head><body></body></html>`,
    {
      runScripts: 'dangerously',
      url: 'https://parkvision.test/',
      beforeParse(window) {
        if (breakStorage) {
          Object.defineProperty(window, 'localStorage', {
            configurable: true,
            get() {
              throw new Error('storage unavailable');
            },
          });
          return;
        }
        if (seed) {
          for (const [k, v] of Object.entries(seed)) {
            window.localStorage.setItem(k, v);
          }
        }
      },
    },
  );
}

/** Mirrors the PlatformContext state initializer: readSavedTheme. */
function readSavedTheme(storage: Pick<Storage, 'getItem'>): 'dark' | 'light' {
  return storage.getItem('theme') === 'light' ? 'light' : 'dark';
}

/** Mirrors the PlatformContext effect: applyTheme. */
function applyTheme(
  theme: 'dark' | 'light',
  root: Pick<HTMLElement, 'classList'>,
  storage: Pick<Storage, 'setItem'>,
): void {
  root.classList.remove('dark', 'light');
  root.classList.add(theme);
  storage.setItem('theme', theme);
}

describe('landing theme', () => {
  afterEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove('dark', 'light');
  });

  it('UI-TC-001: saved light theme applies before first paint and toggle persists after reload', () => {
    const script = loadBootScript();

    // 1. First paint with saved 'light' preference.
    const firstPaint = bootDom(script, { theme: 'light' });
    expect(firstPaint.window.document.documentElement.classList.contains('light')).toBe(true);
    expect(firstPaint.window.document.documentElement.classList.contains('dark')).toBe(false);
    firstPaint.window.close();

    // 2. Simulate toggle: user clicks toggle, context flips light -> dark.
    localStorage.setItem('theme', 'light');
    const theme = readSavedTheme(localStorage) === 'dark' ? 'light' : 'dark';
    applyTheme(theme, document.documentElement, localStorage);
    expect(theme).toBe('dark');
    expect(localStorage.getItem('theme')).toBe('dark');

    // 3. Simulate reload — boot script picks up the persisted 'dark'.
    const afterReload = bootDom(script, { theme: 'dark' });
    expect(afterReload.window.document.documentElement.classList.contains('dark')).toBe(true);
    expect(afterReload.window.document.documentElement.classList.contains('light')).toBe(false);
    afterReload.window.close();
  });

  it.each([undefined, 'sepia', 'LIGHT', ''])(
    'UI-TC-002: defaults to dark for absent or unknown preference (%s)',
    (storedTheme) => {
      const script = loadBootScript();
      const seed = storedTheme !== undefined ? { theme: storedTheme } : undefined;
      const dom = bootDom(script, seed);

      expect(dom.window.document.documentElement.classList.contains('dark')).toBe(true);
      expect(dom.window.document.documentElement.classList.contains('light')).toBe(false);

      // PlatformContext state init should also default to dark.
      const fakeStorage = { getItem: () => storedTheme ?? null };
      expect(readSavedTheme(fakeStorage)).toBe('dark');
      dom.window.close();
    },
  );

  it('UI-TC-002: falls back to dark when localStorage access throws', () => {
    const script = loadBootScript();
    const dom = bootDom(script, undefined, true);

    expect(dom.window.document.documentElement.classList.contains('dark')).toBe(true);
    expect(dom.window.document.documentElement.classList.contains('light')).toBe(false);
    dom.window.close();
  });
});
