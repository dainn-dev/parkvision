import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// vitest runs from frontend/ (see theme.test.ts); import.meta.url is not a file: URL under jsdom
// LF like the Linux image build that serves the file; a Windows checkout may have CRLF
const read = (f: string) => readFileSync(path.join(process.cwd(), f), 'utf8').replace(/\r\n/g, '\n');
const csp = () => {
  const m = read('nginx.conf.template').match(/Content-Security-Policy "([^"]+)"/);
  if (!m) throw new Error('no CSP header in nginx.conf.template');
  return Object.fromEntries(
    m[1].split(';').map((d) => {
      const [name, ...values] = d.trim().split(/\s+/);
      return [name, values];
    }),
  ) as Record<string, string[]>;
};

describe('nginx Content-Security-Policy', () => {
  it('allows the inline theme script in index.html by its exact hash', () => {
    const inline = [...read('index.html').matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
    expect(inline.length).toBeGreaterThan(0);
    const scriptSrc = csp()['script-src'];
    for (const body of inline) {
      const hash = createHash('sha256').update(body, 'utf8').digest('base64');
      expect(scriptSrc, 'update the sha256 in nginx.conf.template').toContain(`'sha256-${hash}'`);
    }
    expect(scriptSrc).not.toContain("'unsafe-inline'");
  });

  it('lets the 3D tour decode meshes and load textures embedded in .glb files', () => {
    const p = csp();
    expect(p['script-src']).toContain("'wasm-unsafe-eval'");
    expect(p['script-src']).not.toContain("'unsafe-eval'");
    expect(p['connect-src']).toContain('blob:');
    expect(p['img-src']).toContain('blob:');
  });
});
