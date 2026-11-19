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

// ---------------------------------------------------------------------------
// Street grid
// ---------------------------------------------------------------------------

/** A straight road. `axis: 'x'` runs east–west at y = `at`; `'y'` runs north–south at x = `at`. */
export interface Road {
  axis: 'x' | 'y';
  at: number;
  from: number;
  to: number;
  width: number;
}

const SIDEWALK = 2.5;
const REACH = 1250;

/**
 * The plot sits in the block bounded by the main street (y = -46, drawn by the plot model
 * between x = ±90), the avenues at x = ±100 and the road at y = 100.
 */
export const ROADS: readonly Road[] = [
  // the main street beyond the plot model
  { axis: 'x', at: -46, from: -REACH, to: -90, width: 12 },
  { axis: 'x', at: -46, from: 90, to: REACH, width: 12 },
  // other east–west roads
  ...[-200, -112, 100, 200].map((at) => ({ axis: 'x' as const, at, from: -REACH, to: REACH, width: 10 })),
  // north–south avenues
  ...[-300, -200, -100, 100, 200, 300].map((at) => ({ axis: 'y' as const, at, from: -REACH, to: REACH, width: 10 })),
  // the side streets on the plot's axis stop at the roads either side of it
  { axis: 'y', at: 0, from: -REACH, to: -112, width: 10 },
  { axis: 'y', at: 0, from: 100, to: REACH, width: 10 },
];

/** Grid lines that bound the city blocks (the plot's block is left out). */
const XS = [-300, -200, -100, 0, 100, 200, 300];
const YS = [-200, -112, -46, 100, 200];

const crosses = (r: Road, along: number) => along >= r.from && along <= r.to;

/** Distance-based test: is (x, y) on a road or its sidewalks (plus `margin`)? */
export function onRoad(x: number, y: number, margin = 0): boolean {
  return ROADS.some((r) => {
    const half = r.width / 2 + SIDEWALK + margin;
    return r.axis === 'x'
      ? Math.abs(y - r.at) < half && x > r.from - half && x < r.to + half
      : Math.abs(x - r.at) < half && y > r.from - half && y < r.to + half;
  });
}

/** [start, end) intervals of `road` that stay outside every crossing road's corridor at `lineAt`. */
function openIntervals(road: Road, lineAt: number, pad: number): [number, number][] {
  const cuts = ROADS.filter((o) => o.axis !== road.axis && o.at > road.from - 1 && o.at < road.to + 1 && crosses(o, lineAt))
    .map((o) => [o.at - o.width / 2 - pad, o.at + o.width / 2 + pad] as [number, number])
    .sort((a, b) => a[0] - b[0]);
  const out: [number, number][] = [];
  let start = road.from;
  for (const [a, b] of cuts) {
    if (a > start) out.push([start, Math.min(a, road.to)]);
    start = Math.max(start, b);
  }
  if (start < road.to) out.push([start, road.to]);
  return out.filter(([a, b]) => b - a > 0.5);
}

export interface StreetMaterials {
  asphalt: THREE.Material;
  sidewalk: THREE.Material;
  line: THREE.Material;
  tiles: { asphalt: number; sidewalk: number };
}

function buildStreets(m: StreetMaterials, disposables: { dispose(): void }[]): THREE.Group {
  const g = new THREE.Group();
  g.name = 'Streets';
  const slab = (axis: 'x' | 'y', at: number, a: number, b: number, width: number, h: number, mat: THREE.Material, tile: number) => {
    const len = b - a;
    const [sx, sz] = axis === 'x' ? [len, width] : [width, len];
    // carriageways are flat planes: box side faces would show as hairlines where slabs abut
    const flat = h < 0.1;
    const geo = flat ? new THREE.PlaneGeometry(sx, sz).rotateX(-Math.PI / 2) : new THREE.BoxGeometry(sx, h, sz);
    const mesh = new THREE.Mesh(geo, mat);
    const mid = (a + b) / 2;
    const y = flat ? h : h / 2;
    mesh.position.copy(axis === 'x' ? P(mid, at, y) : P(at, mid, y));
    mesh.receiveShadow = true;
    applyWorldUVs(mesh, tile);
    g.add(mesh);
    disposables.push(geo);
  };
  const dashGeo = new THREE.PlaneGeometry(2, 0.15).rotateX(-Math.PI / 2);
  const dashMatrices: THREE.Matrix4[] = [];
  const q = new THREE.Quaternion();
  const one = new THREE.Vector3(1, 1, 1);
  for (const road of ROADS) {
    // carriageway: north–south roads run through every junction; east–west ones stop at each
    // crossing, so no two slabs overlap (overlapping coplanar slabs z-fight)
    const spans = road.axis === 'y' ? [[road.from, road.to] as [number, number]] : openIntervals(road, road.at, 0);
    for (const [a, b] of spans) slab(road.axis, road.at, a, b, road.width, 0.04, m.asphalt, m.tiles.asphalt);
    // sidewalks, cut open where another road crosses that side
    for (const side of [-1, 1]) {
      const lineAt = road.at + side * (road.width / 2 + SIDEWALK / 2);
      for (const [a, b] of openIntervals(road, lineAt, SIDEWALK)) {
        slab(road.axis, lineAt, a, b, SIDEWALK, 0.2, m.sidewalk, m.tiles.sidewalk);
      }
    }
    // centre-line dashes, kept out of the junctions
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), road.axis === 'x' ? 0 : Math.PI / 2);
    for (const [a, b] of openIntervals(road, road.at, 1)) {
      for (let t = a + 2; t < b - 2; t += 4) {
        const pos = road.axis === 'x' ? P(t, road.at, 0.05) : P(road.at, t, 0.05);
        dashMatrices.push(new THREE.Matrix4().compose(pos, q, one));
      }
    }
  }
  // corner squares: where both roads carry on into a quadrant, pave where their sidewalks meet
  for (const a of ROADS.filter((r) => r.axis === 'x')) {
    for (const b of ROADS.filter((r) => r.axis === 'y')) {
      if (b.at < a.from - 1 || b.at > a.to + 1 || !crosses(b, a.at)) continue;
      for (const sx of [-1, 1]) {
        for (const sy of [-1, 1]) {
          const aGoes = sx < 0 ? a.from < b.at - 1 : a.to > b.at + 1;
          const bGoes = sy < 0 ? b.from < a.at - 1 : b.to > a.at + 1;
          if (!aGoes || !bGoes) continue;
          const cx = b.at + sx * (b.width / 2 + SIDEWALK / 2);
          const cy = a.at + sy * (a.width / 2 + SIDEWALK / 2);
          slab('x', cy, cx - SIDEWALK / 2, cx + SIDEWALK / 2, SIDEWALK, 0.2, m.sidewalk, m.tiles.sidewalk);
        }
      }
    }
  }
  const dashes = new THREE.InstancedMesh(dashGeo, m.line, dashMatrices.length);
  dashMatrices.forEach((mx, i) => dashes.setMatrixAt(i, mx));
  dashes.receiveShadow = true;
  dashes.computeBoundingSphere();
  g.add(dashes);
  disposables.push(dashGeo);
  return g;
}

// ---------------------------------------------------------------------------
// Blocks and buildings
// ---------------------------------------------------------------------------

interface Block {
  x: number;
  y: number;
  w: number; // along x
  d: number; // along y
  h: number;
  style: Style;
}

/** Fill every city block with buildings that front its streets, then scatter a far skyline. */
function layout(): Block[] {
  const r = rng(91);
  const out: Block[] = [];
  const styles: Style[] = ['glass', 'apartment', 'brick', 'cream'];
  const pick = () => styles[Math.floor(r() * styles.length)];
  const floors = (lo: number, hi: number) => (lo + Math.floor(r() * (hi - lo + 1))) * 3;
  // setback from the road centre line: half the road, the sidewalk and a front strip
  const SET = 5 + SIDEWALK + 3;

  /** Fill one rectangle with buildings in one or two rows along x. */
  const fill = (x0: number, x1: number, y0: number, y1: number, lo: number, hi: number) => {
    const depth = y1 - y0;
    const rows = depth > 58 ? 2 : 1;
    for (let row = 0; row < rows; row++) {
      // with two rows, one fronts the southern street and one the northern street
      const rowDepth = rows === 2 ? Math.min(28, depth / 2 - 4) : Math.min(30, depth);
      for (let x = x0; x < x1 - 12; ) {
        const w = Math.min(x1 - x, 18 + r() * 24);
        if (w < 12) break;
        const d = rowDepth * (0.7 + r() * 0.3);
        const y = rows === 1 ? (y0 + y1) / 2 : row === 0 ? y0 + d / 2 : y1 - d / 2;
        out.push({ x: x + w / 2, y, w, d, h: floors(lo, hi), style: pick() });
        x += w + 4 + r() * 6; // narrow gaps between neighbours, like an alley or a side yard
      }
    }
  };

  for (let i = 0; i < XS.length - 1; i++) {
    for (let j = 0; j < YS.length - 1; j++) {
      const [ax, bx, ay, by] = [XS[i], XS[i + 1], YS[j], YS[j + 1]];
      // the plot's own block, and the strip across the plot's axis where no road splits it
      if (ax >= -100 && bx <= 100 && ay >= -46 && by <= 100) continue;
      // the x = 0 side street only runs south of -112 and north of 100: in between, the two
      // halves either side of it are one block
      const unsplit = ay >= -112 && by <= 100;
      if (unsplit && ax === 0) continue;
      const right = unsplit && bx === 0 ? 100 : bx;
      const near = Math.max(Math.abs((ax + bx) / 2), Math.abs((ay + by) / 2)) < 160;
      fill(ax + SET, right - SET, ay + SET, by - SET, near ? 3 : 6, near ? 8 : 16);
    }
  }
  // skyline: towers further out, off the roads
  for (let i = 0, tries = 0; i < 40 && tries < 600; tries++) {
    const ang = r() * Math.PI * 2;
    const rad = 340 + r() * 280;
    const x = Math.cos(ang) * rad;
    const y = Math.sin(ang) * rad;
    const w = 24 + r() * 24;
    const d = w * (0.8 + r() * 0.4);
    if (onRoad(x, y, Math.max(w, d) / 2 + 2)) continue;
    if (out.some((b) => Math.abs(b.x - x) < (b.w + w) / 2 + 6 && Math.abs(b.y - y) < (b.d + d) / 2 + 6)) continue;
    out.push({ x, y, w, d, h: floors(14, 34), style: r() < 0.55 ? 'glass' : pick() });
    i++;
  }
  return out;
}

export interface City {
  group: THREE.Group;
  /** true where a building or a road is (Blender x/y), so trees stay off them */
  occupied(x: number, y: number): boolean;
  disposables: { dispose(): void }[];
}

/**
 * `keepClear`: camera positions (Blender x/y/z) the tour flies through. Buildings that would
 * contain or loom over one are dropped or cut down, so no shot starts inside a wall.
 */
export function buildCity(
  roof: THREE.Material,
  streets: StreetMaterials,
  keepClear: readonly (readonly [number, number, number])[] = [],
): City {
  const group = new THREE.Group();
  group.name = 'City';
  const disposables: { dispose(): void }[] = [];
  group.add(buildStreets(streets, disposables));

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
    onRoad(x, y, 3) || blocks.some((b) => Math.abs(x - b.x) < b.w / 2 + 6 && Math.abs(y - b.y) < b.d / 2 + 6);
  return { group, occupied, disposables };
}
