import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Look-development for the tour: procedural PBR surfaces (no texture downloads),
 * a physical sky that also lights the scene through an environment map, and
 * material upgrades keyed by the material names authored in Blender.
 */

// ---------------------------------------------------------------------------
// Tileable value noise
// ---------------------------------------------------------------------------

function hash(x: number, y: number, seed: number) {
  let h = (x * 374761393 + y * 668265263 + seed * 982451653) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

/** Value noise on a lattice that wraps every `period` cells, so the result tiles. */
function vnoise(x: number, y: number, period: number, seed: number) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const x0 = ((xi % period) + period) % period;
  const y0 = ((yi % period) + period) % period;
  const x1 = (x0 + 1) % period;
  const y1 = (y0 + 1) % period;
  const a = hash(x0, y0, seed);
  const b = hash(x1, y0, seed);
  const c = hash(x0, y1, seed);
  const d = hash(x1, y1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/** Fractal noise in 0..1 over a texture of `size` px whose base lattice has `cells` cells. */
function fbm(px: number, py: number, size: number, cells: number, octaves: number, seed: number) {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  let c = cells;
  for (let o = 0; o < octaves; o++) {
    sum += amp * vnoise((px / size) * c, (py / size) * c, c, seed + o * 17);
    norm += amp;
    amp *= 0.5;
    c *= 2;
  }
  return sum / norm;
}

// ---------------------------------------------------------------------------
// Procedural surfaces
// ---------------------------------------------------------------------------

export type SurfaceKind = 'asphalt' | 'lotAsphalt' | 'concrete' | 'sidewalk' | 'grass' | 'facade';

interface Surface {
  map: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
  normalMap: THREE.CanvasTexture;
}

interface Spec {
  base: [number, number, number];
  /** colour variation from low-frequency mottling and fine grain */
  mottle: number;
  grain: number;
  rough: number;
  roughVar: number;
  normal: number;
  speckles?: number;
  stains?: number;
  joints?: number;
  grass?: boolean;
}

const SPECS: Record<SurfaceKind, Spec> = {
  asphalt: { base: [84, 86, 90], mottle: 14, grain: 14, rough: 0.9, roughVar: 0.08, normal: 1.6, speckles: 0.012, stains: 0.25 },
  lotAsphalt: { base: [92, 94, 98], mottle: 16, grain: 12, rough: 0.86, roughVar: 0.1, normal: 1.5, speckles: 0.01, stains: 0.45 },
  concrete: { base: [158, 157, 150], mottle: 18, grain: 10, rough: 0.82, roughVar: 0.1, normal: 1.4, speckles: 0.01 },
  sidewalk: { base: [140, 139, 133], mottle: 14, grain: 10, rough: 0.85, roughVar: 0.08, normal: 1.4, speckles: 0.008, joints: 2 },
  grass: { base: [70, 90, 50], mottle: 20, grain: 22, rough: 0.97, roughVar: 0.04, normal: 2.6, grass: true },
  facade: { base: [214, 216, 220], mottle: 8, grain: 5, rough: 0.75, roughVar: 0.08, normal: 0.8 },
};

function canvasTexture(canvas: HTMLCanvasElement, srgb: boolean) {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  return t;
}

export function makeSurface(kind: SurfaceKind, size = 512): Surface {
  const s = SPECS[kind];
  const seed = kind.length * 101;
  const height = new Float32Array(size * size);
  const col = document.createElement('canvas');
  const rgh = document.createElement('canvas');
  const nrm = document.createElement('canvas');
  for (const c of [col, rgh, nrm]) c.width = c.height = size;
  const cctx = col.getContext('2d')!;
  const rctx = rgh.getContext('2d')!;
  const nctx = nrm.getContext('2d')!;
  const cImg = cctx.createImageData(size, size);
  const rImg = rctx.createImageData(size, size);
  const nImg = nctx.createImageData(size, size);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const low = fbm(x, y, size, 4, 3, seed);
      const fine = fbm(x, y, size, 64, 3, seed + 7);
      let h = fine;
      let shade = (low - 0.5) * s.mottle + (fine - 0.5) * s.grain;
      let rough = s.rough + (fine - 0.5) * s.roughVar;
      let [r, g, b] = s.base;

      if (s.speckles && hash(x, y, seed + 3) < s.speckles) {
        // aggregate stones
        const lift = 18 + hash(x, y, seed + 4) * 34;
        shade += lift;
        h += 0.5;
      }
      if (s.stains) {
        const st = fbm(x, y, size, 3, 4, seed + 11);
        const k = Math.max(0, (st - (1 - s.stains * 0.6)) / 0.2);
        if (k > 0) {
          const m = Math.min(1, k);
          shade -= 18 * m;
          rough -= 0.3 * m; // oil is shinier
        }
      }
      if (s.joints) {
        const step = size / s.joints;
        if (x % step < 2 || y % step < 2) {
          shade -= 40;
          h -= 0.6;
        }
      }
      if (s.grass) {
        const blades = fbm(x, y, size, 128, 2, seed + 21);
        const dry = fbm(x, y, size, 6, 3, seed + 31);
        shade += (blades - 0.5) * 34;
        h = blades;
        if (dry > 0.6) {
          const k = Math.min(1, (dry - 0.6) / 0.25);
          r += 22 * k;
          g += 8 * k;
          b += 4 * k;
        }
      }

      height[i] = h;
      const o = i * 4;
      cImg.data[o] = Math.max(0, Math.min(255, r + shade));
      cImg.data[o + 1] = Math.max(0, Math.min(255, g + shade));
      cImg.data[o + 2] = Math.max(0, Math.min(255, b + shade * (s.grass ? 0.5 : 1)));
      cImg.data[o + 3] = 255;
      const rv = Math.max(0, Math.min(255, rough * 255));
      rImg.data[o] = rImg.data[o + 1] = rImg.data[o + 2] = rv;
      rImg.data[o + 3] = 255;
    }
  }
  // normal map from the height field (wrapping, so it tiles)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const l = height[y * size + ((x - 1 + size) % size)];
      const rr = height[y * size + ((x + 1) % size)];
      const u = height[((y - 1 + size) % size) * size + x];
      const d = height[((y + 1) % size) * size + x];
      let nx = (l - rr) * s.normal;
      let ny = (d - u) * s.normal;
      let nz = 1;
      const len = Math.hypot(nx, ny, nz);
      nx /= len;
      ny /= len;
      nz /= len;
      const o = (y * size + x) * 4;
      nImg.data[o] = (nx * 0.5 + 0.5) * 255;
      nImg.data[o + 1] = (ny * 0.5 + 0.5) * 255;
      nImg.data[o + 2] = (nz * 0.5 + 0.5) * 255;
      nImg.data[o + 3] = 255;
    }
  }
  cctx.putImageData(cImg, 0, 0);
  rctx.putImageData(rImg, 0, 0);
  nctx.putImageData(nImg, 0, 0);
  return { map: canvasTexture(col, true), roughnessMap: canvasTexture(rgh, false), normalMap: canvasTexture(nrm, false) };
}

/**
 * The Blender boxes carry no UVs; project world-space coordinates instead
 * (top faces use x/z, walls use whichever horizontal axis they run along).
 */
export function applyWorldUVs(mesh: THREE.Mesh, metersPerTile: number) {
  const g = mesh.geometry;
  const pos = g.getAttribute('position');
  const nor = g.getAttribute('normal');
  if (!pos || !nor) return;
  mesh.updateWorldMatrix(true, false);
  const nm = new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld);
  const uv = new Float32Array(pos.count * 2);
  const p = new THREE.Vector3();
  const n = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
    n.fromBufferAttribute(nor, i).applyMatrix3(nm).normalize();
    let u: number;
    let v: number;
    if (Math.abs(n.y) > 0.6) {
      u = p.x;
      v = p.z;
    } else if (Math.abs(n.x) > Math.abs(n.z)) {
      u = p.z;
      v = p.y;
    } else {
      u = p.x;
      v = p.y;
    }
    uv[i * 2] = u / metersPerTile;
    uv[i * 2 + 1] = v / metersPerTile;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  // explicit tangents: screen-space derivative TBNs are unreliable on these planar projections
  if (g.index) g.computeTangents();
}

// ---------------------------------------------------------------------------
// Sky + image-based lighting
// ---------------------------------------------------------------------------

export function setupSky(renderer: THREE.WebGLRenderer, scene: THREE.Scene, sunDir: THREE.Vector3) {
  const sky = new Sky();
  // drawn first and never depth-tested, so it sits behind everything however far the ground reaches
  sky.scale.setScalar(1000);
  sky.renderOrder = -1;
  sky.frustumCulled = false;
  sky.material.depthTest = false;
  // The visible sky is HDR. Bloom input is capped in ParkingScene, so it can stay a clear blue.
  sky.material.uniforms.skyGain = { value: 0.2 };
  sky.material.fragmentShader = sky.material.fragmentShader
    .replace('uniform float showSunDisc;', 'uniform float showSunDisc;\nuniform float skyGain;')
    // Grade: keep the pale band at the horizon, but deepen to a clear blue within a few degrees
    // above it; otherwise the low, wide views only ever show the washed-out bottom of the sky.
    .replace(
      'gl_FragColor = vec4( texColor, 1.0 );',
      `float skyUp = smoothstep( 0.0, 0.22, direction.y );
      vec3 deepSky = texColor * vec3( 0.5, 0.76, 1.24 );
      texColor = mix( texColor, deepSky, skyUp * 0.9 );
      gl_FragColor = vec4( texColor * skyGain, 1.0 );`,
    );
  const u = sky.material.uniforms;
  // clear, dry day: strong Rayleigh (blue) and almost no Mie haze, so neither the sun side nor
  // the horizon washes out to white
  u.turbidity.value = 1.7;
  u.rayleigh.value = 2.6;
  u.mieCoefficient.value = 0.0004;
  u.mieDirectionalG.value = 0.6;
  // The sky is drawn with the sun raised to ~60° (same azimuth as the light). A low sun puts its
  // glow on the horizon right where the wide shots look; the lighting keeps the real, lower sun.
  const skySun = sunDir.clone().setY(0).normalize().multiplyScalar(Math.cos(Math.PI / 3));
  skySun.y = Math.sin(Math.PI / 3);
  u.sunPosition.value.copy(skySun);
  // the disc is so bright that the bloom pass turns it into a veil over the whole frame
  u.showSunDisc.value = 0;
  // a few soft clouds; heavier coverage streaks badly near the horizon at this cloud scale
  u.cloudCoverage.value = 0.18;
  u.cloudDensity.value = 0.25;
  u.cloudScale.value = 0.00012;
  scene.add(sky);

  // environment: the same sky over a dusty ground, prefiltered for PBR reflections
  const envScene = new THREE.Scene();
  // no sun disc here: the disc is a second, shadowless sun in the diffuse lighting
  const envSky = new Sky();
  const eu = envSky.material.uniforms;
  for (const k of Object.keys(eu)) {
    const v = u[k].value;
    eu[k].value = v instanceof THREE.Vector3 ? v.clone() : v;
  }
  eu.showSunDisc.value = 0;
  // Light the scene from the real sky, not the graded backdrop: the raised sun and the extra
  // Rayleigh that make the backdrop blue would otherwise wash everything in a blue cast.
  eu.sunPosition.value.copy(sunDir);
  eu.rayleigh.value = 1.3;
  eu.turbidity.value = 2.6;
  envScene.add(envSky);
  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(80, 32).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0x3c4038 }),
  );
  ground.position.y = -2;
  envScene.add(ground);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(envScene, 0.02, 0.1, 200);
  scene.environment = env.texture;
  pmrem.dispose();
  ground.geometry.dispose();
  (ground.material as THREE.Material).dispose();
  envSky.geometry.dispose();
  return { sky, env };
}

// ---------------------------------------------------------------------------
// Material upgrades
// ---------------------------------------------------------------------------

/** Textured surfaces and the world size of one texture tile. */
export const SURFACE_MATERIALS: Record<string, { kind: SurfaceKind; tile: number }> = {
  Asphalt: { kind: 'asphalt', tile: 4 },
  LotAsphalt: { kind: 'lotAsphalt', tile: 4 },
  Concrete: { kind: 'concrete', tile: 3 },
  FenceWall: { kind: 'concrete', tile: 3 },
  Sidewalk: { kind: 'sidewalk', tile: 3 },
  Grass: { kind: 'grass', tile: 5 },
  Facade: { kind: 'facade', tile: 4 },
  BoothWall: { kind: 'facade', tile: 2 },
};

const colorOf = (m: THREE.Material) => ((m as THREE.MeshStandardMaterial).color ?? new THREE.Color(1, 1, 1)).clone();

/** Physically based replacement for a material exported from Blender, or null to keep it. */
export function upgradeMaterial(src: THREE.Material, surfaces: (kind: SurfaceKind) => Surface): THREE.Material | null {
  const std = src as THREE.MeshStandardMaterial;
  const name = src.name;
  const surf = SURFACE_MATERIALS[name];
  if (surf) {
    const s = surfaces(surf.kind);
    return new THREE.MeshStandardMaterial({
      name,
      map: s.map,
      roughnessMap: s.roughnessMap,
      normalMap: s.normalMap,
      normalScale: new THREE.Vector2(0.9, 0.9),
      roughness: 1,
      metalness: 0,
      color: name === 'BoothWall' ? 0xf4f5f7 : 0xffffff,
    });
  }
  switch (name) {
    case 'LineWhite':
    case 'LineYellow':
      return new THREE.MeshStandardMaterial({ name, color: colorOf(src).multiplyScalar(0.82), roughness: 0.62 });
    case 'Steel':
      return new THREE.MeshStandardMaterial({ name, color: 0xb8bcc2, metalness: 1, roughness: 0.32 });
    case 'Rim':
      // painted alloy, not polished chrome
      return new THREE.MeshStandardMaterial({ name, color: 0x9da2a8, metalness: 0.85, roughness: 0.42 });
    case 'Chrome':
      return new THREE.MeshStandardMaterial({ name, color: 0xb9bdc3, metalness: 1, roughness: 0.3 });
    case 'Caliper':
      return new THREE.MeshPhysicalMaterial({ name, color: 0xb3150f, roughness: 0.35, clearcoat: 0.8, clearcoatRoughness: 0.2 });
    case 'DarkMetal':
      return new THREE.MeshStandardMaterial({ name, color: 0x23262b, metalness: 0.6, roughness: 0.42 });
    case 'BrandBlue':
    case 'EVGreen':
      return new THREE.MeshPhysicalMaterial({ name, color: colorOf(src), roughness: 0.3, clearcoat: 0.6, clearcoatRoughness: 0.15 });
    case 'BarrierWhite':
    case 'BarrierRed':
    case 'CamBody':
      return new THREE.MeshPhysicalMaterial({ name, color: colorOf(src), roughness: 0.38, clearcoat: 0.5, clearcoatRoughness: 0.2 });
    case 'Glass':
      return new THREE.MeshPhysicalMaterial({
        name,
        color: 0x9fb8c8,
        metalness: 0,
        roughness: 0.03,
        transparent: true,
        opacity: 0.32,
        envMapIntensity: 2,
        depthWrite: false,
      });
    case 'Windows':
      return new THREE.MeshPhysicalMaterial({ name, color: 0x2a3a48, metalness: 0.85, roughness: 0.06, envMapIntensity: 1.4 });
    case 'CarGlass':
      // tinted glass: dark interior behind a dielectric surface that only reflects at grazing angles
      return new THREE.MeshPhysicalMaterial({ name, color: 0x141b22, metalness: 0, roughness: 0.06, ior: 1.5, specularIntensity: 1, envMapIntensity: 1.15 });
    case 'Lens':
      return new THREE.MeshPhysicalMaterial({ name, color: 0x050608, metalness: 0.2, roughness: 0.02, clearcoat: 1 });
    case 'Tyre':
      return new THREE.MeshStandardMaterial({ name, color: 0x1b1b1c, roughness: 0.86 });
    case 'Trim':
      // textured black plastic (bumpers, gaskets, grille)
      return new THREE.MeshStandardMaterial({ name, color: 0x141518, roughness: 0.72 });
    case 'Bark':
      return new THREE.MeshStandardMaterial({ name, color: 0x4a3426, roughness: 0.95 });
    case 'Leaf':
    case 'Leaf2':
      // foliage absorbs most light: darker, less saturated than the authored swatch
      {
        const c = colorOf(src);
        const hsl = c.getHSL({ h: 0, s: 0, l: 0 });
        // pull the hue toward yellow-green; the authored swatches drift cyan once darkened
        c.setHSL(hsl.h - (name === 'Leaf2' ? 0.035 : 0.05), hsl.s * 0.72, hsl.l * 0.62);
        return new THREE.MeshStandardMaterial({ name, color: c, roughness: 0.95 });
      }
    case 'Headlight':
    case 'Taillight':
    case 'LampGlow':
    case 'IRLed': {
      // daytime: lenses read as lit glass, not light sources (only LEDs and status lamps bloom)
      // fairly rough: the lenses face up into the sun and a mirror finish glints straight into the bloom
      // unlit lamp units: a clear lens over a reflector reads as pale grey, not a white block
      const lens = name === 'Headlight' ? new THREE.Color(0x8d9399) : colorOf(src).multiplyScalar(0.7);
      const m = new THREE.MeshPhysicalMaterial({ name, color: lens, metalness: 0.3, roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.08 });
      m.emissive.copy(std.emissive ?? new THREE.Color(1, 1, 1));
      m.emissiveIntensity = name === 'Taillight' ? 0.25 : name === 'IRLed' ? 0.8 : name === 'LampGlow' ? 0.45 : 0.06;
      return m;
    }
    default:
      return null;
  }
}

/** Glossy automotive paint. Light colours read better with less metal flake. */
export function carPaint(hex: number) {
  const c = new THREE.Color(hex);
  const hsl = c.getHSL({ h: 0, s: 0, l: 0 });
  // Real paint albedo tops out near 0.8 and solid colours are a little less saturated than
  // the swatches; full-strength values are what read as toy plastic under a strong sun.
  c.setHSL(hsl.h, hsl.s * 0.82, Math.min(hsl.l, 0.78) * 0.92);
  const metallic = hsl.l < 0.6 && hsl.s > 0.25;
  return new THREE.MeshPhysicalMaterial({
    name: 'CarPaint',
    color: c,
    // a dielectric base (metallic flake only for saturated mid tones) under a clear coat
    metalness: metallic ? 0.28 : 0.04,
    roughness: metallic ? 0.38 : 0.5,
    clearcoat: 0.85,
    clearcoatRoughness: 0.18,
    envMapIntensity: 0.85,
  });
}

/** Turn the icosphere crowns into lumpy, smooth foliage (deterministic per position). */
export function organicFoliage(mesh: THREE.Mesh) {
  let g = mesh.geometry;
  g.deleteAttribute('normal');
  g.deleteAttribute('uv');
  g = mergeVertices(g, 1e-4);
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  const p = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i);
    const n1 = vnoise(p.x * 1.3 + 50, p.z * 1.3 + 50, 4096, 5) - 0.5;
    const n2 = vnoise(p.y * 1.7 + 80, p.x * 1.1 + 20, 4096, 9) - 0.5;
    const n3 = vnoise(p.z * 1.5 + 30, p.y * 1.4 + 60, 4096, 13) - 0.5;
    pos.setXYZ(i, p.x + n1 * 0.55, p.y + n2 * 0.5, p.z + n3 * 0.55);
  }
  g.computeVertexNormals();
  mesh.geometry.dispose();
  mesh.geometry = g;
}

// ---------------------------------------------------------------------------
// Surroundings: the model is a 180 × 170 m plot; this carries the ground, the
// street and a scatter of trees out to the horizon so the plot never ends in a void.
// ---------------------------------------------------------------------------

interface SurroundingMaterials {
  grass: THREE.Material;
  asphalt: THREE.Material;
  sidewalk: THREE.Material;
  line: THREE.Material;
  leaf: THREE.Material;
  leaf2: THREE.Material;
  bark: THREE.Material;
}

/** Blender plot coordinates (x right, y north, z up) → three.js. */
const P = (x: number, y: number, z = 0) => new THREE.Vector3(x, z, -y);

export function buildSurroundings(
  materials: SurroundingMaterials,
  tiles: { grass: number; asphalt: number; sidewalk: number } = { grass: 5, asphalt: 4, sidewalk: 3 },
  /** builds the distant forest from tree spots; without it the trees are simple low-poly crowns */
  forest?: (spots: { pos: THREE.Vector3; height: number; yaw: number }[]) => THREE.Object3D,
  /** keeps trees out of building footprints (Blender x/y) */
  blocked?: (x: number, y: number) => boolean,
  radius = 1400,
): THREE.Group {
  const g = new THREE.Group();
  g.name = 'Surroundings';
  const meshes: THREE.Mesh[] = [];
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, tile?: number) => {
    const m = new THREE.Mesh(geo, mat);
    m.receiveShadow = true;
    g.add(m);
    if (tile) meshes.push(Object.assign(m, { userData: { tile } }));
    return m;
  };

  // ground just under the plot's own grass so the plot wins where they overlap
  const ground = add(new THREE.CircleGeometry(radius, 96).rotateX(-Math.PI / 2), materials.grass, tiles.grass);
  ground.position.y = -0.03;

  // the street (Blender y = -46) and its sidewalks, continued past both ends of the plot
  const PLOT_X = 90;
  const len = radius - PLOT_X;
  for (const side of [-1, 1]) {
    const cx = side * (PLOT_X + len / 2);
    const street = add(new THREE.BoxGeometry(len, 0.04, 12), materials.asphalt, tiles.asphalt);
    street.position.copy(P(cx, -46, 0.02));
    for (const sy of [-38.75, -53.25]) {
      const walk = add(new THREE.BoxGeometry(len, 0.2, 2.5), materials.sidewalk, tiles.sidewalk);
      walk.position.copy(P(cx, sy, 0.1));
    }
  }
  // centre-line dashes
  const dashGeo = new THREE.PlaneGeometry(2, 0.15).rotateX(-Math.PI / 2);
  const dashCount = Math.floor(len / 4) * 2;
  const dashes = new THREE.InstancedMesh(dashGeo, materials.line, dashCount);
  const m4 = new THREE.Matrix4();
  let d = 0;
  for (const side of [-1, 1]) {
    for (let x = PLOT_X + 2; x < radius && d < dashCount; x += 4) {
      m4.makeTranslation(P(side * x, -46, 0.045));
      dashes.setMatrixAt(d++, m4);
    }
  }
  dashes.count = d;
  dashes.receiveShadow = true;
  g.add(dashes);

  for (const m of meshes) applyWorldUVs(m, m.userData.tile as number);

  // a scatter of trees thinning out with distance, clear of the plot and the street
  let seed = 7;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
  const crownGeo = new THREE.IcosahedronGeometry(1, 2);
  const trunkGeo = new THREE.CylinderGeometry(0.16, 0.22, 1, 7).translate(0, 0.5, 0);
  const COUNT = 900;
  const crownsA = new THREE.InstancedMesh(crownGeo, materials.leaf, COUNT);
  const crownsB = new THREE.InstancedMesh(crownGeo, materials.leaf2, COUNT);
  const trunks = new THREE.InstancedMesh(trunkGeo, materials.bark, COUNT * 2);
  let a = 0;
  let b = 0;
  let t = 0;
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const spots: { pos: THREE.Vector3; height: number; yaw: number }[] = [];
  for (let tries = 0; tries < COUNT * 6 && a + b < COUNT * 2 - 2; tries++) {
    const r = 105 + Math.pow(rnd(), 1.6) * (radius * 0.75 - 105);
    const ang = rnd() * Math.PI * 2;
    const x = Math.cos(ang) * r;
    const y = Math.sin(ang) * r;
    if (Math.abs(y + 46) < 14) continue; // street + verges
    if (Math.abs(x) < 95 && y > -60 && y < 90) continue; // the plot
    if (blocked?.(x, y)) continue;
    const h = 4 + rnd() * 6;
    const w = h * (0.34 + rnd() * 0.12);
    const pos = P(x, y, 0);
    if (forest) {
      spots.push({ pos, height: h * 1.15, yaw: rnd() * Math.PI });
      a++;
      continue;
    }
    s.set(0.9 + rnd() * 0.5, h * 0.42, 0.9 + rnd() * 0.5);
    m4.compose(pos, q, s);
    trunks.setMatrixAt(t++, m4);
    s.set(w, w * (1.05 + rnd() * 0.35), w);
    m4.compose(pos.clone().setY(h * 0.62), q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rnd() * 6.28), s);
    if (rnd() < 0.5) crownsA.setMatrixAt(a++, m4);
    else crownsB.setMatrixAt(b++, m4);
  }
  if (forest) {
    for (const im of [crownsA, crownsB, trunks]) im.dispose();
    g.add(forest(spots));
    return g;
  }
  crownsA.count = a;
  crownsB.count = b;
  trunks.count = t;
  for (const im of [crownsA, crownsB, trunks]) {
    im.castShadow = false;
    im.receiveShadow = true;
    g.add(im);
  }
  return g;
}
