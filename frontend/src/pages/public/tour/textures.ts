import * as THREE from 'three';

const FONT = '"Geist Variable", "Segoe UI", system-ui, sans-serif';
const MONO = 'ui-monospace, "Cascadia Mono", Consolas, monospace';

function makeCanvas(w: number, h: number) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');
  return { canvas, ctx };
}

function toTexture(canvas: HTMLCanvasElement) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** One-line Vietnamese passenger plate (white, black border and glyphs). */
export function plateTexture(text: string, hi = false): THREE.CanvasTexture {
  const w = hi ? 512 : 256;
  const h = Math.round(w * 0.215);
  const { canvas, ctx } = makeCanvas(w, h);
  ctx.fillStyle = '#f4f4f0';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#111';
  ctx.lineWidth = w * 0.014;
  ctx.strokeRect(w * 0.012, w * 0.012, w - w * 0.024, h - w * 0.024);
  ctx.fillStyle = '#111';
  ctx.font = `700 ${Math.round(h * 0.74)}px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, w / 2, h / 2 + h * 0.04, w * 0.92);
  return toTexture(canvas);
}

/** Paints into an existing canvas texture; returns a function that redraws it. */
export function ledPanel(w = 384, h = 208) {
  const { canvas, ctx } = makeCanvas(w, h);
  const texture = toTexture(canvas);
  const draw = (lines: { text: string; color: string; size: number }[]) => {
    ctx.fillStyle = '#050607';
    ctx.fillRect(0, 0, w, h);
    // dot-matrix texture
    ctx.fillStyle = 'rgba(255,255,255,0.035)';
    for (let y = 0; y < h; y += 6) for (let x = 0; x < w; x += 6) ctx.fillRect(x, y, 3, 3);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const total = lines.reduce((s, l) => s + l.size * 1.25, 0);
    let y = (h - total) / 2;
    for (const l of lines) {
      y += l.size * 0.625;
      ctx.font = `700 ${l.size}px ${MONO}`;
      ctx.fillStyle = l.color;
      ctx.shadowColor = l.color;
      ctx.shadowBlur = 12;
      ctx.fillText(l.text, w / 2, y, w * 0.92);
      y += l.size * 0.625;
    }
    ctx.shadowBlur = 0;
    texture.needsUpdate = true;
  };
  return { texture, draw };
}

export function signTexture(
  w: number,
  h: number,
  paint: (ctx: CanvasRenderingContext2D, w: number, h: number) => void,
): THREE.CanvasTexture {
  const { canvas, ctx } = makeCanvas(w, h);
  paint(ctx, w, h);
  return toTexture(canvas);
}

export function brandSign(text: string, sub?: string) {
  return signTexture(1024, 128, (ctx, w, h) => {
    ctx.fillStyle = '#1f6feb';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `800 ${Math.round(h * 0.5)}px ${FONT}`;
    ctx.fillText(sub ? `${text}  ·  ${sub}` : text, w / 2, h / 2 + 4, w * 0.94);
  });
}

export { FONT, MONO };
