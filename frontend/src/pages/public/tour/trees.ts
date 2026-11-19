import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import islandTreeUrl from './assets/env/island_tree_01.glb?url';
import smallTreeUrl from './assets/env/tree_small_02.glb?url';
import islandImpostorUrl from './assets/env/island_tree_01_impostor.webp?url';
import smallImpostorUrl from './assets/env/tree_small_02_impostor.webp?url';

/**
 * Photoscanned trees from Poly Haven (CC0): island_tree_01 and tree_small_02, reduced from
 * 1.6–2 M triangles to ~30–45 k (a share of the leaves kept and enlarged, branches and trunk
 * decimated), plus side renders of each used as billboards for the distant forest.
 */

/** Blender plot coordinates → three.js. */
const P = (x: number, y: number, z = 0) => new THREE.Vector3(x, z, -y);

/** Where the plot's trees and planter bushes stand (the authored layout, Blender x/y). */
export const PLOT_TREES: readonly (readonly [number, number])[] = [
  ...[-6, 0, 6, 12, 18, 24, 30].map((y) => [-40, y] as const),
  ...[-6, 0, 6, 12, 18, 24, 30].map((y) => [40, y] as const),
  ...[-34, -26, -18, 18, 26, 34].map((x) => [x, -14] as const),
  ...[-34, -24, -14, 14, 24, 34].map((x) => [x, -36] as const),
];
export const PLANTERS: readonly (readonly [number, number])[] = [-36, -30, -12].flatMap((y) => [
  [-10.6, y] as const,
  [10.6, y] as const,
]);

export interface TreeAssets {
  island: THREE.Object3D;
  small: THREE.Object3D;
  impostors: THREE.Texture[];
  disposables: { dispose(): void }[];
}

export async function loadTrees(): Promise<TreeAssets> {
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const tl = new THREE.TextureLoader();
  const [island, small, imp1, imp2] = await Promise.all([
    loader.loadAsync(islandTreeUrl),
    loader.loadAsync(smallTreeUrl),
    tl.loadAsync(islandImpostorUrl),
    tl.loadAsync(smallImpostorUrl),
  ]);
  const disposables: { dispose(): void }[] = [];
  for (const g of [island, small]) {
    g.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const mat = m.material as THREE.MeshStandardMaterial;
      // leaves are cut-outs: test alpha instead of blending, and light both faces
      if (mat.map && (mat.transparent || mat.alphaTest > 0 || /leaves|branch/i.test(mat.name))) {
        mat.transparent = false;
        mat.alphaTest = 0.45;
        mat.side = THREE.DoubleSide;
        // Mipmaps average the leaf alpha toward the background, so from a distance it drops under
        // the cut-off and the canopy vanishes (trees look bare). Sample the full-size cut-out instead.
        if (mat.map) {
          mat.map.generateMipmaps = false;
          mat.map.minFilter = THREE.LinearFilter;
          mat.map.needsUpdate = true;
        }
        m.userData.cutout = true;
      }
      mat.envMapIntensity = 0.8;
      disposables.push(m.geometry, mat);
      for (const t of [mat.map, mat.normalMap, mat.roughnessMap, mat.metalnessMap, mat.aoMap]) if (t) disposables.push(t);
    });
  }
  for (const t of [imp1, imp2]) {
    t.colorSpace = THREE.SRGBColorSpace;
    disposables.push(t);
  }
  return { island: island.scene, small: small.scene, impostors: [imp1, imp2], disposables };
}

interface Placement {
  pos: THREE.Vector3;
  yaw: number;
  scale: number;
}

/** One InstancedMesh per primitive of `model`, placed at every placement. */
function instance(model: THREE.Object3D, placements: Placement[], shadows: boolean): THREE.Group {
  const g = new THREE.Group();
  if (!placements.length) return g;
  g.userData.placements = placements;
  model.updateMatrixWorld(true);
  const rootInv = new THREE.Matrix4().copy(model.matrixWorld).invert();
  const world = new THREE.Matrix4();
  const place = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  model.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const local = new THREE.Matrix4().multiplyMatrices(rootInv, mesh.matrixWorld);
    const im = new THREE.InstancedMesh(mesh.geometry, mesh.material, placements.length);
    im.userData.cutout = !!mesh.userData.cutout;
    placements.forEach((p, i) => {
      place.compose(p.pos, q.setFromAxisAngle(up, p.yaw), new THREE.Vector3().setScalar(p.scale));
      im.setMatrixAt(i, world.multiplyMatrices(place, local));
    });
    im.castShadow = shadows;
    im.receiveShadow = true;
    im.userData.local = local;
    im.frustumCulled = false; // instances move between LODs; the group bounds would go stale
    g.add(im);
  });
  return g;
}

const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

/** Show or hide one instance in every primitive of an `instance()` group. */
function setInstance(g: THREE.Group, i: number, on: boolean) {
  const p = (g.userData.placements as Placement[])[i];
  const place = new THREE.Matrix4().compose(
    p.pos,
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), p.yaw),
    new THREE.Vector3().setScalar(p.scale),
  );
  for (const im of g.children as THREE.InstancedMesh[]) {
    im.setMatrixAt(i, on ? new THREE.Matrix4().multiplyMatrices(place, im.userData.local as THREE.Matrix4) : ZERO);
    im.instanceMatrix.needsUpdate = true;
  }
}

function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

/** The plot's trees and the bushes in the entrance planters. */
export interface PlotTrees {
  group: THREE.Group;
  /** swap each tree between the full mesh (near) and its billboard (far) for this camera */
  update(camera: THREE.Vector3): void;
  disposables: { dispose(): void }[];
}

/** Beyond this the leaves shrink under a pixel and drop out, so the billboard takes over. */
const MESH_RANGE = 22;

/**
 * The plot's trees and the bushes in the entrance planters, with a two-level LOD: the scanned
 * mesh up close, and a billboard of the same tree once its leaves would be sub-pixel.
 */
export function plotTrees(trees: TreeAssets): PlotTrees {
  const r = rng(29);
  // sink the scans a little: their bases carry a pale patch of scanned ground
  const SINK = -0.15;
  const island: Placement[] = [];
  const small: Placement[] = [];
  PLOT_TREES.forEach(([x, y], i) => {
    const p = {
      pos: P(x + (r() - 0.5) * 1.2, y + (r() - 0.5) * 1.2, SINK),
      yaw: r() * Math.PI * 2,
      scale: 1.25 + r() * 0.45,
    };
    (i % 3 === 1 ? small : island).push(p);
  });
  const bushes = PLANTERS.map(([x, y]) => ({ pos: P(x, y, 0.5 + SINK * 0.35), yaw: r() * Math.PI * 2, scale: 0.34 + r() * 0.06 }));
  const smallAll = [...small, ...bushes];

  const meshIsland = instance(trees.island, island, true);
  const meshSmall = instance(trees.small, smallAll, true);
  const frame = (model: THREE.Object3D) => {
    const size = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());
    return Math.max(size.x, size.y, size.z) * 1.04; // the impostor renders frame the tree this way
  };
  const spot = (p: Placement, side: number) => ({ pos: p.pos.clone(), height: (side * p.scale) / 1.05, yaw: p.yaw });
  const farIsland = forestBillboards([trees.impostors[0]], island.map((p) => spot(p, frame(trees.island))));
  const farSmall = forestBillboards([trees.impostors[1]], smallAll.map((p) => spot(p, frame(trees.small))));
  const bbIsland = farIsland.group.children[0] as THREE.InstancedMesh;
  const bbSmall = farSmall.group.children[0] as THREE.InstancedMesh;
  const bbMatrices = (im: THREE.InstancedMesh) =>
    Array.from({ length: im.count }, (_, i) => {
      const m = new THREE.Matrix4();
      im.getMatrixAt(i, m);
      return m;
    });
  const bbIslandM = bbMatrices(bbIsland);
  const bbSmallM = bbMatrices(bbSmall);
  for (const im of [bbIsland, bbSmall]) im.frustumCulled = false;

  const group = new THREE.Group();
  group.name = 'PlotTrees';
  group.add(meshIsland, meshSmall, farIsland.group, farSmall.group);

  const near = { island: island.map(() => true), small: smallAll.map(() => true) };
  const apply = (
    list: Placement[],
    state: boolean[],
    mesh: THREE.Group,
    bb: THREE.InstancedMesh,
    bbM: THREE.Matrix4[],
    camera: THREE.Vector3,
  ) => {
    list.forEach((p, i) => {
      const isNear = p.pos.distanceTo(camera) < MESH_RANGE * Math.max(1, p.scale);
      if (isNear === state[i]) return;
      state[i] = isNear;
      setInstance(mesh, i, isNear);
      bb.setMatrixAt(i, isNear ? ZERO : bbM[i]);
      bb.instanceMatrix.needsUpdate = true;
    });
  };
  const update = (camera: THREE.Vector3) => {
    apply(island, near.island, meshIsland, bbIsland, bbIslandM, camera);
    apply(smallAll, near.small, meshSmall, bbSmall, bbSmallM, camera);
  };
  // everything starts as a mesh; hide the billboards until the first update decides
  for (const im of [bbIsland, bbSmall]) {
    for (let i = 0; i < im.count; i++) im.setMatrixAt(i, ZERO);
    im.instanceMatrix.needsUpdate = true;
  }
  return { group, update, disposables: [...farIsland.disposables, ...farSmall.disposables] };
}

/**
 * Distant forest as crossed billboards (two quads each) using the side renders. Unlit: the
 * render already carries the sun, and the scene's fog fades them into the haze.
 */
export function forestBillboards(
  impostors: THREE.Texture[],
  spots: readonly { pos: THREE.Vector3; height: number; yaw: number }[],
): { group: THREE.Group; disposables: { dispose(): void }[] } {
  const quad = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);
  const crossed = new THREE.BufferGeometry();
  {
    const a = quad.clone();
    const b = quad.clone().rotateY(Math.PI / 2);
    const pos = new Float32Array([...a.attributes.position.array, ...b.attributes.position.array]);
    const uv = new Float32Array([...a.attributes.uv.array, ...b.attributes.uv.array]);
    const idxA = Array.from(a.index!.array);
    const idx = [...idxA, ...idxA.map((i) => i + a.attributes.position.count)];
    crossed.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    crossed.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    crossed.setIndex(idx);
  }
  const group = new THREE.Group();
  group.name = 'ForestBillboards';
  const disposables: { dispose(): void }[] = [crossed, quad];
  impostors.forEach((tex, k) => {
    const mine = spots.filter((_, i) => i % impostors.length === k);
    const mat = new THREE.MeshBasicMaterial({ map: tex, alphaTest: 0.22, side: THREE.DoubleSide, color: 0xbac3b4 });
    const im = new THREE.InstancedMesh(crossed, mat, mine.length);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    mine.forEach((s, i) => {
      // the renders frame the tree with a little margin; width matches height
      m.compose(s.pos, q.setFromAxisAngle(up, s.yaw), new THREE.Vector3(s.height * 1.05, s.height * 1.05, s.height * 1.05));
      im.setMatrixAt(i, m);
    });
    im.computeBoundingSphere();
    im.userData.cutout = true;
    group.add(im);
    disposables.push(mat);
  });
  return { group, disposables };
}
