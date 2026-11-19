import * as THREE from 'three';
import { applyWorldUVs } from './realism';

/**
 * Neighbourhood around the plot: a row of buildings across the street, blocks on either side
 * and behind, and a few distant towers for a skyline. Facades are procedural window textures
 * whose glass is smooth and partly metallic, so it picks up the sky reflections.
 */

/** Blender plot coordinates (x right, y north, z up) → three.js. */
const P = (x: number, y: number, z = 0) => new THREE.Vector3(x, z, -y);

/** Every facade texture covers this many metres square: 4 bays × 4 floors of 3 m. */
const TILE = 12;

type Style = 'glass' | 'apartment' | 'brick' | 'cream';

interface Facade {
  map: THREE.CanvasTexture;
  /** G = roughness, B = metalness (glTF convention, read by both maps) */
  orm: THREE.CanvasTexture;
}

function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function canvas(size: number) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return [c, c.getContext('2d')!] as const;
}

function tex(c: HTMLCanvasElement, srgb: boolean) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = 8;
  return t;
}

const hex = (r: number, g: number, b: number) => `rgb(${r | 0},${g | 0},${b | 0})`;

/** Paint one 12 × 12 m facade tile. `px` = pixels per metre. */
function makeFacade(style: Style, seed: number): Facade {
  const S = 768;
  const px = S / TILE;
  const [cc, c] = canvas(S);
  const [oc, o] = canvas(S);
  const r = rng(seed);
  const orm = (rough: number, metal: number) => hex(255, rough * 255, metal * 255);
  const glass = () => {
    // panes differ a little in tint and in how much sky they catch
    const k = r();
    return hex(38 + k * 26, 52 + k * 28, 64 + k * 30);
  };
  // the canvas y axis runs down; floor 0 is at the bottom of the tile
  const rect = (ctx: CanvasRenderingContext2D, x: number, yFromBottom: number, w: number, h: number) =>
    ctx.fillRect(x * px, S - (yFromBottom + h) * px, w * px, h * px);

  if (style === 'glass') {
    c.fillStyle = '#7e868d'; // aluminium frame colour
    c.fillRect(0, 0, S, S);
    o.fillStyle = orm(0.45, 0.85);
    o.fillRect(0, 0, S, S);
    for (let f = 0; f < 4; f++) {
      // spandrel band hiding the slab, then a full-height glazed strip
      c.fillStyle = '#3d454d';
      rect(c, 0, f * 3, TILE, 0.75);
      o.fillStyle = orm(0.35, 0.3);
      rect(o, 0, f * 3, TILE, 0.75);
      for (let m = 0; m < 8; m++) {
        c.fillStyle = glass();
        rect(c, m * 1.5 + 0.05, f * 3 + 0.8, 1.4, 2.15);
        o.fillStyle = orm(0.04 + r() * 0.05, 0.55);
        rect(o, m * 1.5 + 0.05, f * 3 + 0.8, 1.4, 2.15);
      }
    }
  } else {
    const wall =
      style === 'brick' ? [136, 76, 58] : style === 'cream' ? [205, 196, 176] : [214, 214, 208];
    c.fillStyle = hex(wall[0], wall[1], wall[2]);
    c.fillRect(0, 0, S, S);
    o.fillStyle = orm(0.88, 0);
    o.fillRect(0, 0, S, S);
    // weathering: streaks under the windows and a little mottling
    for (let i = 0; i < 900; i++) {
      const d = (r() - 0.5) * (style === 'brick' ? 26 : 16);
      c.fillStyle = hex(wall[0] + d, wall[1] + d, wall[2] + d);
      c.fillRect(r() * S, r() * S, 2 + r() * 6, 2 + r() * 6);
    }
    if (style === 'brick') {
      // mortar courses
      c.fillStyle = 'rgba(210,200,185,0.35)';
      for (let y = 0; y < S; y += Math.round(px * 0.075)) c.fillRect(0, y, S, 1);
    }
    const winW = style === 'apartment' ? 1.5 : 1.3;
    const winH = style === 'cream' ? 1.9 : 1.6;
    for (let f = 0; f < 4; f++) {
      // slab line between floors
      c.fillStyle = 'rgba(0,0,0,0.09)';
      rect(c, 0, f * 3, TILE, 0.18);
      for (let b = 0; b < 4; b++) {
        const x = b * 3 + (3 - winW) / 2;
        const y = f * 3 + 0.9;
        c.fillStyle = 'rgba(40,40,40,0.35)'; // reveal shadow around the opening
        rect(c, x - 0.06, y - 0.08, winW + 0.12, winH + 0.14);
        // some blinds down, in the neutral tones real blinds come in
        const k = 150 + r() * 45;
        c.fillStyle = r() < 0.14 ? hex(k, k * 0.97, k * 0.92) : glass();
        rect(c, x, y, winW, winH);
        c.fillStyle = '#d8d8d4'; // mullion
        rect(c, x + winW / 2 - 0.03, y, 0.06, winH);
        o.fillStyle = orm(0.06, 0.45);
        rect(o, x, y, winW, winH);
        if (style === 'apartment' && b % 2 === 1 && f > 0) {
          c.fillStyle = 'rgba(70,72,74,0.9)'; // balcony rail
          rect(c, x - 0.4, y - 0.15, winW + 0.8, 0.12);
        }
      }
    }
  }
  return { map: tex(cc, true), orm: tex(oc, false) };
}

interface Block {
  x: number;
  y: number;
  w: number; // along x
  d: number; // along y
  h: number;
  style: Style;
}

/** The layout: hand-placed nearby blocks plus a scattered skyline. */
function layout(): Block[] {
  const r = rng(91);
  const out: Block[] = [];
  const styles: Style[] = ['glass', 'apartment', 'brick', 'cream'];
  const pick = () => styles[Math.floor(r() * styles.length)];
  const floors = (lo: number, hi: number) => (lo + Math.floor(r() * (hi - lo + 1))) * 3;

  // across the street, set back behind a verge
  for (let x = -230; x < 230; ) {
    const w = 22 + r() * 22;
    const d = 18 + r() * 14;
    out.push({ x: x + w / 2, y: -64 - d / 2 - r() * 6, w, d, h: floors(3, 7), style: pick() });
    x += w + 7 + r() * 10;
  }
  // second row behind it
  for (let x = -260; x < 260; ) {
    const w = 26 + r() * 28;
    const d = 22 + r() * 16;
    out.push({ x: x + w / 2, y: -122 - d / 2 - r() * 10, w, d, h: floors(6, 18), style: pick() });
    x += w + 10 + r() * 14;
  }
  // west and east of the plot
  for (const side of [-1, 1]) {
    for (let y = -30; y < 150; ) {
      const d = 22 + r() * 22;
      const w = 20 + r() * 18;
      out.push({ x: side * (102 + w / 2 + r() * 8), y: y + d / 2, w, d, h: floors(3, 10), style: pick() });
      y += d + 8 + r() * 10;
    }
  }
  // behind the office building
  for (let x = -90; x < 90; ) {
    const w = 24 + r() * 20;
    out.push({ x: x + w / 2, y: 112 + r() * 14, w, d: 20 + r() * 12, h: floors(5, 14), style: pick() });
    x += w + 9 + r() * 10;
  }
  // skyline: towers well beyond, mostly to the south and north where the wide shots look
  for (let i = 0; i < 34; i++) {
    const ang = r() * Math.PI * 2;
    const rad = 280 + r() * 260;
    const w = 26 + r() * 26;
    out.push({
      x: Math.cos(ang) * rad,
      y: Math.sin(ang) * rad,
      w,
      d: w * (0.8 + r() * 0.5),
      h: floors(14, 34),
      style: r() < 0.55 ? 'glass' : pick(),
    });
  }
  return out;
}

export interface City {
  group: THREE.Group;
  /** true where a building stands (Blender x/y), so trees can stay out of it */
  occupied(x: number, y: number): boolean;
  disposables: { dispose(): void }[];
}

/**
 * `keepClear`: camera positions (Blender x/y/z) the tour flies through. Buildings that would
 * contain or loom over one are dropped or cut down, so no shot starts inside a wall.
 */
export function buildCity(roof: THREE.Material, keepClear: readonly (readonly [number, number, number])[] = []): City {
  const group = new THREE.Group();
  group.name = 'City';
  const disposables: { dispose(): void }[] = [];

  const facades = new Map<Style, THREE.MeshPhysicalMaterial>();
  const facadeMat = (style: Style) => {
    let m = facades.get(style);
    if (!m) {
      const f = makeFacade(style, style.length * 37 + 5);
      m = new THREE.MeshPhysicalMaterial({
        map: f.map,
        roughnessMap: f.orm,
        metalnessMap: f.orm,
        roughness: 1,
        metalness: 1,
        envMapIntensity: 1,
      });
      facades.set(style, m);
      disposables.push(f.map, f.orm, m);
    }
    return m;
  };
  const plant = new THREE.MeshStandardMaterial({ color: 0x8a8d90, roughness: 0.7, metalness: 0.3 });
  const base = new THREE.MeshStandardMaterial({ color: 0x5c5d5f, roughness: 0.85 });
  const trims: Partial<Record<Style, THREE.MeshStandardMaterial>> = {};
  const TRIM: Record<Style, number> = { glass: 0x6f767c, apartment: 0xc9c9c3, brick: 0x9a9289, cream: 0xbdb39c };
  const trim = (s: Style) => (trims[s] ??= new THREE.MeshStandardMaterial({ color: TRIM[s], roughness: 0.8 }));
  disposables.push(plant, base, { dispose: () => Object.values(trims).forEach((m) => m?.dispose()) });

  const blocks = layout().filter((b) => {
    for (const [cx, cy, cz] of keepClear) {
      const dx = Math.max(0, Math.abs(cx - b.x) - b.w / 2);
      const dy = Math.max(0, Math.abs(cy - b.y) - b.d / 2);
      const dist = Math.hypot(dx, dy);
      if (dist < 14) return false; // the camera would be in or against it
      if (dist < 70 && b.h > cz - 6) b.h = Math.max(9, Math.floor((cz - 6) / 3) * 3); // keep the view over it
    }
    return true;
  });
  const r = rng(5);
  for (const b of blocks) {
    const wall = facadeMat(b.style);
    // BoxGeometry face order: +x, -x, +y (roof), -y, +z, -z
    const geo = new THREE.BoxGeometry(b.w, b.h, b.d);
    const mesh = new THREE.Mesh(geo, [wall, wall, roof, roof, wall, wall]);
    mesh.position.copy(P(b.x, b.y, b.h / 2));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    applyWorldUVs(mesh, TILE);
    group.add(mesh);
    disposables.push(geo);
    // a parapet that overhangs a little and a darker plinth break up the plain box silhouette
    const parapet = new THREE.Mesh(new THREE.BoxGeometry(b.w + 0.5, 1.1, b.d + 0.5), trim(b.style));
    parapet.position.copy(P(b.x, b.y, b.h + 0.4));
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(b.w + 0.3, 0.9, b.d + 0.3), base);
    plinth.position.copy(P(b.x, b.y, 0.45));
    for (const m of [parapet, plinth]) {
      m.castShadow = true;
      m.receiveShadow = true;
      group.add(m);
      disposables.push(m.geometry);
    }
    // parapet and rooftop plant on the nearer, lower buildings
    if (b.h < 45) {
      const n = 1 + Math.floor(r() * 3);
      for (let i = 0; i < n; i++) {
        const g = new THREE.BoxGeometry(2 + r() * 4, 1.2 + r() * 1.6, 2 + r() * 4);
        const u = new THREE.Mesh(g, plant);
        u.position.copy(P(b.x + (r() - 0.5) * b.w * 0.6, b.y + (r() - 0.5) * b.d * 0.6, b.h + 0.8));
        u.castShadow = true;
        group.add(u);
        disposables.push(g);
      }
    }
  }

  const occupied = (x: number, y: number) =>
    blocks.some((b) => Math.abs(x - b.x) < b.w / 2 + 6 && Math.abs(y - b.y) < b.d / 2 + 6);
  return { group, occupied, disposables };
}
