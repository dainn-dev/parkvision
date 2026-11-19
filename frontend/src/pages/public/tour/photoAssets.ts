import * as THREE from 'three';
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js';
import asphaltDiff from './assets/env/asphalt_04_diff.jpg?url';
import asphaltNor from './assets/env/asphalt_04_nor.jpg?url';
import asphaltRough from './assets/env/asphalt_04_rough.jpg?url';
import concreteDiff from './assets/env/concrete_floor_02_diff.jpg?url';
import concreteNor from './assets/env/concrete_floor_02_nor.jpg?url';
import concreteRough from './assets/env/concrete_floor_02_rough.jpg?url';
import grassDiff from './assets/env/leafy_grass_diff.jpg?url';
import grassNor from './assets/env/leafy_grass_nor.jpg?url';
import grassRough from './assets/env/leafy_grass_rough.jpg?url';
import skyBg from './assets/env/sky_bg.jpg?url';
import skyEnv from './assets/env/sky_env.hdr?url';

/**
 * Photographic surfaces and sky from Poly Haven (CC0, https://polyhaven.com):
 * asphalt_04, concrete_floor_02, leafy_grass and kloofendal_48d_partly_cloudy_puresky.
 * Re-encoded at 1k (textures), 512 px (lighting HDR) and 4k JPEG (visible sky).
 */

export type PhotoSurface = 'asphalt' | 'concrete' | 'grass';

export interface PhotoSet {
  map: THREE.Texture;
  normalMap: THREE.Texture;
  roughnessMap: THREE.Texture;
}

/** World size of one texture tile (metres) for each surface. */
export const PHOTO_TILE: Record<PhotoSurface, number> = { asphalt: 3.2, concrete: 2.4, grass: 2.6 };

/** Which authored Blender materials take which photographic surface. */
export const PHOTO_MATERIALS: Record<string, PhotoSurface> = {
  Asphalt: 'asphalt',
  LotAsphalt: 'asphalt',
  Concrete: 'concrete',
  FenceWall: 'concrete',
  Sidewalk: 'concrete',
  Grass: 'grass',
};

/** Sun in the HDRI: u of the brightest pixel and its elevation, measured from the 1k file. */
const HDRI_SUN = { u: 0.5952, elevationDeg: 48 };

export interface PhotoEnvironment {
  surfaces: Record<PhotoSurface, PhotoSet>;
  background: THREE.Texture;
  environment: THREE.Texture;
  /** apply to scene.backgroundRotation and scene.environmentRotation */
  rotation: THREE.Euler;
  /** unit vector toward the sun as it appears after `rotation` (three.js world space) */
  sunDir: THREE.Vector3;
  disposables: { dispose(): void }[];
}

/**
 * Load everything and orient the sky so its sun sits at `azimuth` (radians, atan2(z, x) in
 * three.js space), so shadows from the scene's directional light match the photographed sun.
 */
export async function loadPhotoEnvironment(
  renderer: THREE.WebGLRenderer,
  azimuth: number,
): Promise<PhotoEnvironment> {
  const tl = new THREE.TextureLoader();
  const anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const tex = async (url: string, srgb: boolean) => {
    const t = await tl.loadAsync(url);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.anisotropy = anisotropy;
    return t;
  };
  const set = async (d: string, n: string, r: string): Promise<PhotoSet> => {
    const [map, normalMap, roughnessMap] = await Promise.all([tex(d, true), tex(n, false), tex(r, false)]);
    return { map, normalMap, roughnessMap };
  };

  const [asphalt, concrete, grass, background, hdr] = await Promise.all([
    set(asphaltDiff, asphaltNor, asphaltRough),
    set(concreteDiff, concreteNor, concreteRough),
    set(grassDiff, grassNor, grassRough),
    tl.loadAsync(skyBg),
    new HDRLoader().loadAsync(skyEnv),
  ]);
  background.mapping = THREE.EquirectangularReflectionMapping;
  background.colorSpace = THREE.SRGBColorSpace;
  hdr.mapping = THREE.EquirectangularReflectionMapping;

  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromEquirectangular(hdr);
  pmrem.dispose();
  hdr.dispose();

  // three.js samples the sky along R⁻¹·d, so a feature at HDRI direction h shows up at R·h.
  // Its equirect lookup is u = atan2(z, x) / 2π + 0.5, v = asin(y) / π + 0.5.
  const phi = (HDRI_SUN.u - 0.5) * Math.PI * 2;
  const el = THREE.MathUtils.degToRad(HDRI_SUN.elevationDeg);
  const h = new THREE.Vector3(Math.cos(phi) * Math.cos(el), Math.sin(el), Math.sin(phi) * Math.cos(el));
  // rotating about Y by α lowers atan2(z, x) by α
  const rotation = new THREE.Euler(0, phi - azimuth, 0);
  const sunDir = h.clone().applyEuler(rotation).normalize();

  const surfaces = { asphalt, concrete, grass };
  const disposables: { dispose(): void }[] = [background, env];
  for (const s of Object.values(surfaces)) disposables.push(s.map, s.normalMap, s.roughnessMap);
  return { surfaces, background, environment: env.texture, rotation, sunDir, disposables };
}

/** PBR material for one of the photographic surfaces; UVs come from applyWorldUVs. */
export function photoMaterial(name: string, s: PhotoSet, tint = 0xffffff) {
  // Grass blades scatter light; they have almost no mirror-like sheen. With the default 4 %
  // specular, the grazing-angle Fresnel reflects the bright sky and distant lawns turn white.
  const grass = name === 'Grass';
  return new THREE.MeshPhysicalMaterial({
    name,
    map: s.map,
    normalMap: s.normalMap,
    normalScale: new THREE.Vector2(1, 1),
    roughnessMap: s.roughnessMap,
    roughness: 1,
    metalness: 0,
    color: tint,
    specularIntensity: grass ? 0.08 : 0.6,
    envMapIntensity: grass ? 0.7 : 1,
  });
}
