import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import QRCode from 'qrcode';
import modelUrl from './assets/parkvision-lot.glb?url';
import {
  CHASES,
  LEGS,
  PACKETS,
  PLATES,
  SCRIPTED_BAYS,
  START_BAY,
  STAY_C,
  activeRead,
  barrierEntry,
  barrierExit,
  bayOccupied,
  cameraAt,
  carVisible,
  entryLed,
  exitLed,
  fsmState,
  isOffline,
  kioskQrVisible,
  readStage,
  slotCenter,
  span,
  windowed,
  zoneBHighlight,
  zoneLabels,
  type AnprStage,
  type CarId,
  type FsmState,
  type LedState,
  type PathLeg,
  type Read,
  type Row,
} from './timeline';
import { FONT, MONO, brandSign, ledPanel, plateTexture, signTexture } from './textures';
import {
  SURFACE_MATERIALS,
  applyWorldUVs,
  carPaint,
  makeSurface,
  organicFoliage,
  setupSky,
  upgradeMaterial,
  type SurfaceKind,
} from './realism';

/**
 * Render quality. `high` adds ambient occlusion and bloom, `medium` bloom only,
 * `low` renders straight to the screen. Starts high on wide screens and steps
 * down if frames get slow; `?quality=` in the URL pins a level.
 */
export type Quality = 'high' | 'medium' | 'low';
const QUALITY_ORDER: Quality[] = ['high', 'medium', 'low'];

/** Blender (x, y, z-up) → three.js (x, y-up, -z). The model was exported with +Y up. */
const B = (x: number, y: number, z = 0) => new THREE.Vector3(x, z, -y);
/** Yaw for a car whose nose is three.js -Z, heading along Blender direction (dx, dy). */
const yawOf = (dx: number, dy: number) => Math.atan2(-dx, dy);

export interface SceneLabels {
  welcome: string;
  thanks: string;
  checking: string;
  member: string;
  notRegistered: string;
  walkIn: string;
  paid: string;
  remote: string;
  freeBays: string;
  offline: string;
  zone: string;
}

export interface PipInfo {
  visible: boolean;
  /** which camera the picture-in-picture shows */
  cam: Read['cam'] | null;
  /** css px, relative to the container */
  rect: { x: number; y: number; w: number; h: number };
  /** detection box, 0..1 relative to the pip rect; null when not in frame */
  box: { x: number; y: number; w: number; h: number } | null;
  stage: AnprStage;
  car: CarId | null;
}

export interface FrameInfo {
  progress: number;
  fsmEntry: FsmState;
  fsmExit: FsmState;
  free: number;
  total: number;
  pip: PipInfo;
}

export interface HoverInfo {
  plate: string;
  bay: string;
  x: number;
  y: number;
}

type LedKey = 'entry' | 'exit' | 'guide' | 'pylon';
type Led = ReturnType<typeof ledPanel>;

interface Slot {
  id: string;
  pos: readonly [number, number];
  heading: number; // yaw
  car: THREE.Object3D | null;
  scripted: CarId | null;
}

interface LegCurve {
  leg: PathLeg;
  curve: THREE.CatmullRomCurve3;
}

const PAINTS = [0xd9dde3, 0x1d1f24, 0x8a9099, 0xb3261e, 0x1f4fa8, 0xf1f1ee, 0x2f5d50, 0x5b6470, 0xc58b2a, 0x3b3f8f];
const PROVINCES = ['29', '30', '51', '59', '43', '92', '15', '36', '74', '61', '65', '47'];
const LETTERS = 'ABCDEFGHKLMNPSTUVXYZ';
const CAST: Record<CarId, { kind: 'sedan' | 'suv'; paint: number; route: number }> = {
  A: { kind: 'sedan', paint: 0x1f5fd6, route: 0x58a6ff },
  B: { kind: 'suv', paint: 0xe9ebee, route: 0xf0b429 },
  C: { kind: 'sedan', paint: 0xe3a41c, route: 0xff7b72 },
  D: { kind: 'suv', paint: 0x2f7d5a, route: 0x3fb950 },
};
const TONES: Record<LedState['tone'], string> = { brand: '#58a6ff', warn: '#ffb02e', ok: '#3fff6a', bad: '#ff4d4d' };
const BOOTH_TOP = B(0, -20, 3);
const MONITOR_TOP = B(1.3, 9.4, 5.6);

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function lerpAngle(a: number, b: number, t: number) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

export class ParkingScene {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(42, 1, 0.1, 900);
  private readonly pipCam = new THREE.PerspectiveCamera(24, 1.6, 0.1, 120);
  private readonly raycaster = new THREE.Raycaster();
  private composer!: EffectComposer;
  private gtao!: GTAOPass;
  private bloom!: UnrealBloomPass;
  private quality: Quality = 'high';
  private qualityPinned = false;
  private frameTimes: number[] = [];
  private readonly disposables: { dispose(): void }[] = [];

  private lastTime = 0;
  private elapsed = 0;
  private targetProgress = 0;
  private progress = 0;
  private pointer = new THREE.Vector2();
  private pointerSmoothed = new THREE.Vector2();
  private pointerInside = false;
  private running = false;
  private raf = 0;
  private width = 1;
  private height = 1;
  private reducedMotion = false;

  private cars = {} as Record<CarId, THREE.Object3D>;
  private legs = {} as Record<CarId, LegCurve[]>;
  private routes: { mesh: THREE.Mesh; w: readonly [number, number, number, number]; car: CarId; toBay: boolean }[] = [];
  private streetCars: { obj: THREE.Object3D; speed: number; offset: number }[] = [];
  private slots: Slot[] = [];
  private bays!: THREE.InstancedMesh;
  private bayMat!: THREE.MeshBasicMaterial;
  private parkedGroup = new THREE.Group();
  private entryPivot?: THREE.Object3D;
  private exitPivot?: THREE.Object3D;
  private entryLamp!: THREE.Mesh;
  private exitLamp!: THREE.Mesh;
  private leds = {} as Record<LedKey, Led>;
  private ledKeys: Record<LedKey, string> = { entry: '', exit: '', guide: '', pylon: '' };
  private frustum!: THREE.Mesh;
  private plateFrame!: THREE.LineSegments;
  private beam!: THREE.Mesh;
  private packets: THREE.Mesh[] = [];
  private offlineSprite!: THREE.Sprite;
  private zoneSprites: THREE.Sprite[] = [];
  private zoneOutline!: THREE.LineLoop;
  private kioskQr!: THREE.Mesh;
  private eyes = { entry: new THREE.Vector3(), exit: new THREE.Vector3(), monitor: new THREE.Vector3() };
  private prevLift = { entry: 0, exit: 0 };
  private parkedCount = 0;
  private hovered: THREE.Object3D | null = null;
  private chasePos: THREE.Vector3 | null = null;

  constructor(
    private readonly container: HTMLElement,
    private readonly labels: SceneLabels,
    private readonly onFrame: (f: FrameInfo) => void,
    private readonly onHover: (h: HoverInfo | null) => void,
  ) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.68;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.renderer.domElement.setAttribute('aria-hidden', 'true');
    container.appendChild(this.renderer.domElement);
    this.reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    const pinned = new URLSearchParams(window.location.search).get('quality');
    if (pinned === 'high' || pinned === 'medium' || pinned === 'low') {
      this.quality = pinned;
      this.qualityPinned = true;
    } else {
      this.quality = container.clientWidth < 768 ? 'medium' : 'high';
    }
    this.setupWorld();
    this.setupPost();
    this.resize();
  }

  private setupPost() {
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.gtao = new GTAOPass(this.scene, this.camera, 512, 512);
    this.gtao.updateGtaoMaterial({ radius: 1.2, distanceExponent: 1.4, thickness: 1.5, scale: 1.1, samples: 16 });
    this.gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 16 });
    this.gtao.blendIntensity = 0.9;
    this.composer.addPass(this.gtao);
    // only HDR highlights (lamps, LEDs, the sun) cross this threshold
    this.bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), 0.22, 0.12, 4.5);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.applyQuality();
  }

  private applyQuality() {
    this.gtao.enabled = this.quality === 'high';
    this.bloom.enabled = this.quality !== 'low';
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.quality === 'low' ? 1 : 1.5));
    this.resize();
  }

  /** Step down a quality level when the last couple of seconds averaged under ~25 fps. */
  private watchFrameTime(dt: number) {
    if (this.qualityPinned || this.quality === 'low') return;
    this.frameTimes.push(dt);
    if (this.frameTimes.length < 90) return;
    const avg = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
    this.frameTimes = [];
    if (avg > 0.04) {
      this.quality = QUALITY_ORDER[QUALITY_ORDER.indexOf(this.quality) + 1];
      this.applyQuality();
    }
  }

  // ------------------------------------------------------------------ setup

  private setupWorld() {
    this.scene.fog = new THREE.Fog(0xbfd0e2, 220, 650);
    this.scene.add(new THREE.HemisphereLight(0xdfe9f5, 0x3d4632, 0.05));
    const sun = new THREE.DirectionalLight(0xfff0d8, 11);
    // low morning sun from the east-north-east: long side shadows, and no backlight in the south-facing gate shots
    sun.position.copy(B(80, 22, 58));
    sun.target.position.copy(B(0, -6, 0));
    const sky = setupSky(this.renderer, this.scene, sun.position.clone().sub(sun.target.position).normalize());
    this.track(sky.env, sky.sky.geometry, sky.sky.material);
    this.scene.environmentIntensity = 0.3;
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -75, right: 75, top: 75, bottom: -75, near: 10, far: 260 });
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.03;
    this.scene.add(sun, sun.target, this.parkedGroup);
  }

  private track<T extends { dispose(): void }>(first: T, ...rest: { dispose(): void }[]): T {
    this.disposables.push(first, ...rest);
    return first;
  }

  async load(): Promise<void> {
    const gltf = await new GLTFLoader().loadAsync(modelUrl);
    const root = gltf.scene;

    // physically based look: procedural surfaces, metals, glass, emissives
    const surfaces = new Map<SurfaceKind, ReturnType<typeof makeSurface>>();
    const surfaceOf = (kind: SurfaceKind) => {
      let s = surfaces.get(kind);
      if (!s) {
        s = makeSurface(kind);
        surfaces.set(kind, s);
        this.track(s.map, s.roughnessMap, s.normalMap);
      }
      return s;
    };
    const upgraded = new Map<string, THREE.Material | null>();
    root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.receiveShadow = true;
      m.castShadow = !o.name.startsWith('Static_Ground');
      const src = m.material as THREE.Material;
      if (!upgraded.has(src.name)) upgraded.set(src.name, upgradeMaterial(src, surfaceOf));
      const next = upgraded.get(src.name);
      if (next) {
        m.material = next;
        const surf = SURFACE_MATERIALS[src.name];
        if (surf) applyWorldUVs(m, surf.tile);
      }
      if (src.name === 'Leaf' || src.name === 'Leaf2') organicFoliage(m);
      this.track(m.geometry, src);
    });
    for (const mat of upgraded.values()) if (mat) this.track(mat);

    const sedan = root.getObjectByName('Car_Sedan');
    const suv = root.getObjectByName('Car_SUV');
    if (!sedan || !suv) throw new Error('car prototypes missing from model');
    for (const t of [sedan, suv]) {
      t.removeFromParent();
      t.position.set(0, 0, 0);
    }
    this.scene.add(root);

    this.entryPivot = root.getObjectByName('Barrier_Entry_Pivot');
    this.exitPivot = root.getObjectByName('Barrier_Exit_Pivot');
    root.updateMatrixWorld(true);
    root.getObjectByName('ANPR_Entry_Eye')?.getWorldPosition(this.eyes.entry);
    root.getObjectByName('ANPR_Exit_Eye')?.getWorldPosition(this.eyes.exit);
    root.getObjectByName('MonCam_B1_Eye')?.getWorldPosition(this.eyes.monitor);

    const templates = { sedan, suv };
    const paintCache = new Map<number, THREE.Material>();
    const plateGeo = this.track(new THREE.PlaneGeometry(0.52, 0.112));
    const makeCar = (kind: 'sedan' | 'suv', paint: number, plate: string, hi = false) => {
      const car = templates[kind].clone(true);
      let paintMat: THREE.Material | undefined = paintCache.get(paint);
      const plateTex = plateTexture(plate, hi);
      const plateMat = new THREE.MeshStandardMaterial({ map: plateTex, roughness: 0.45, metalness: 0 });
      this.track(plateTex, plateMat);
      const anchors: THREE.Object3D[] = [];
      car.traverse((o) => {
        if (o.name.endsWith('PlateAnchorF') || o.name.endsWith('PlateAnchorR')) anchors.push(o);
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        m.castShadow = true;
        if ((m.material as THREE.Material).name === 'CarPaint') {
          if (!paintMat) {
            paintMat = this.track(carPaint(paint));
            paintCache.set(paint, paintMat);
          }
          m.material = paintMat;
        }
      });
      for (const a of anchors) {
        const pm = new THREE.Mesh(plateGeo, plateMat);
        pm.name = a.name.endsWith('F') ? 'PlateFront' : 'PlateRear';
        // front plate faces the nose (-Z), rear plate faces +Z
        if (a.name.endsWith('F')) pm.rotation.y = Math.PI;
        a.add(pm);
      }
      car.userData.plate = plate;
      return car;
    };

    const toCurve = (leg: PathLeg): LegCurve => ({
      leg,
      curve: new THREE.CatmullRomCurve3(
        leg.points.map(([x, y]) => B(x, y, 0)),
        false,
        'centripetal',
      ),
    });
    for (const id of Object.keys(CAST) as CarId[]) {
      const c = CAST[id];
      this.cars[id] = makeCar(c.kind, c.paint, PLATES[id], true);
      this.scene.add(this.cars[id]);
      this.legs[id] = LEGS[id].map(toCurve);
    }

    this.buildSlots(makeCar);

    // ambient street traffic on the far lane
    for (let i = 0; i < 4; i++) {
      const plate = `${PROVINCES[i + 3]}${LETTERS[i * 3]}-${400 + i * 37}.${10 + i * 21}`;
      const car = makeCar(i % 2 ? 'suv' : 'sedan', PAINTS[(i * 3 + 1) % PAINTS.length], plate);
      this.scene.add(car);
      this.streetCars.push({ obj: car, speed: 9 + i * 1.7, offset: i * 47 });
    }

    this.buildGateProps(root);
    this.buildOverlays();
    await this.buildKioskQr();
  }

  private buildSlots(makeCar: (k: 'sedan' | 'suv', paint: number, plate: string) => THREE.Object3D) {
    const r = rng(20261119);
    const add = (row: Row, k: number, dir: 1 | -1) => {
      const prefix = { A_W: 'AW', A_E: 'AE', B: 'B', C: 'C', D: 'D' }[row];
      const id = `${prefix}-${String(k + 1).padStart(2, '0')}`;
      this.slots.push({ id, pos: slotCenter(row, k), heading: yawOf(0, dir), car: null, scripted: null });
    };
    for (let k = 0; k < 7; k++) add('A_W', k, -1);
    for (let k = 0; k < 7; k++) add('A_E', k, -1);
    for (let k = 0; k < 23; k++) add('B', k, 1);
    for (let k = 0; k < 23; k++) add('C', k, -1);
    for (let k = 0; k < 23; k++) add('D', k, 1);

    const keepClear = new Set<number>();
    for (const car of Object.keys(SCRIPTED_BAYS) as CarId[]) {
      const i = this.slots.findIndex((s) => s.id === SCRIPTED_BAYS[car]);
      this.slots[i].scripted = car;
      // neighbours stay empty so the manoeuvres read clearly
      keepClear.add(i - 1).add(i).add(i + 1);
    }

    this.slots.forEach((slot, i) => {
      if (keepClear.has(i) || r() > 0.68) return;
      const plate = `${PROVINCES[Math.floor(r() * PROVINCES.length)]}${LETTERS[Math.floor(r() * LETTERS.length)]}-${String(Math.floor(r() * 900) + 100)}.${String(Math.floor(r() * 90) + 10)}`;
      const car = makeCar(r() > 0.6 ? 'suv' : 'sedan', PAINTS[Math.floor(r() * PAINTS.length)], plate);
      const flip = r() > 0.85 ? Math.PI : 0; // a few drivers back in
      car.position.copy(B(slot.pos[0] + (r() - 0.5) * 0.2, slot.pos[1] + (r() - 0.5) * 0.25, 0));
      car.rotation.y = slot.heading + flip + (r() - 0.5) * 0.05;
      car.userData.bay = slot.id;
      slot.car = car;
      this.parkedGroup.add(car);
      this.parkedCount++;
    });
    for (const id of Object.keys(SCRIPTED_BAYS) as CarId[]) this.cars[id].userData.bay = SCRIPTED_BAYS[id];

    // bay occupancy overlay (digital twin)
    const geo = this.track(new THREE.PlaneGeometry(2.25, 4.7));
    geo.rotateX(-Math.PI / 2);
    this.bayMat = this.track(new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.2, depthWrite: false }));
    this.bays = new THREE.InstancedMesh(geo, this.bayMat, this.slots.length);
    const m = new THREE.Matrix4();
    const green = new THREE.Color(0x3fb950);
    this.slots.forEach((s, i) => {
      m.makeTranslation(B(s.pos[0], s.pos[1], 0.075));
      this.bays.setMatrixAt(i, m);
      this.bays.setColorAt(i, green);
    });
    this.bays.renderOrder = 1;
    this.scene.add(this.bays);
  }

  private buildGateProps(root: THREE.Object3D) {
    const place = (anchorName: string, w: number, h: number, tex: THREE.Texture, emissive = true) => {
      const anchor = root.getObjectByName(anchorName);
      if (!anchor) return;
      const geo = new THREE.PlaneGeometry(w, h);
      const mat = emissive
        ? new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color().setScalar(4) }) // HDR so LEDs bloom
        : new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.z = 0.005;
      anchor.add(mesh);
      this.track(geo, mat, tex);
    };

    this.leds = { entry: ledPanel(), exit: ledPanel(), guide: ledPanel(768, 176), pylon: ledPanel(256, 404) };
    place('Anchor_LED_Entry', 1.2, 0.65, this.leds.entry.texture);
    place('Anchor_LED_Exit', 1.2, 0.65, this.leds.exit.texture);
    place('Anchor_Guide', 4.8, 1.1, this.leds.guide.texture);
    place('Anchor_Pylon', 1.9, 3.0, this.leds.pylon.texture);
    place('Anchor_FasciaSign', 9, 0.6, brandSign('ParkVision', 'ANPR GATE'), false);
    place(
      'Anchor_BuildingSign',
      14,
      1.75,
      signTexture(1024, 128, (ctx, w, h) => {
        ctx.fillStyle = '#f4f6fa';
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = '#1f6feb';
        ctx.font = `800 ${Math.round(h * 0.62)}px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('ParkVision', w / 2, h / 2 + 5);
      }),
      false,
    );

    const lampGeo = this.track(new THREE.SphereGeometry(0.09, 16, 12));
    const mkLamp = (name: string) => {
      const mat = this.track(new THREE.MeshBasicMaterial({ color: 0xff3b30, toneMapped: false }));
      const lamp = new THREE.Mesh(lampGeo, mat);
      root.getObjectByName(name)?.add(lamp);
      return lamp;
    };
    this.entryLamp = mkLamp('Anchor_Entry_Lamp');
    this.exitLamp = mkLamp('Anchor_Exit_Lamp');
  }

  private labelSprite(text: string, color: string, bg: string, w = 512, h = 128, scale = 4) {
    const tex = signTexture(w, h, (ctx) => {
      ctx.fillStyle = bg;
      const r = h * 0.28;
      ctx.beginPath();
      ctx.roundRect(4, 4, w - 8, h - 8, r);
      ctx.fill();
      ctx.fillStyle = color;
      ctx.font = `800 ${Math.round(h * 0.5)}px ${MONO}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, w / 2, h / 2 + 3, w * 0.9);
    });
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, toneMapped: false });
    this.track(tex, mat);
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(scale, (scale * h) / w, 1);
    sprite.renderOrder = 10;
    return sprite;
  }

  private buildOverlays() {
    // scan frustum: apex at the camera eye, base around the plate / car (updated per frame)
    const fg = new THREE.BufferGeometry();
    fg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(5 * 3), 3));
    fg.setIndex([0, 1, 2, 0, 2, 3, 0, 3, 4, 0, 4, 1]);
    const fm = new THREE.MeshBasicMaterial({
      color: 0xff5a4e,
      transparent: true,
      opacity: 0.14,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.frustum = new THREE.Mesh(fg, fm);
    this.frustum.frustumCulled = false;

    const pf = new THREE.EdgesGeometry(new THREE.PlaneGeometry(0.7, 0.24));
    const pfm = new THREE.LineBasicMaterial({ color: 0x3fb950, toneMapped: false });
    this.plateFrame = new THREE.LineSegments(pf, pfm);
    this.scene.add(this.frustum, this.plateFrame);
    this.track(fg, fm, pf, pfm);

    // planned routes on the ground
    const route = (car: CarId, leg: number, w: readonly [number, number, number, number], toBay: boolean) => {
      const curve = this.legs[car][leg].curve;
      const color = CAST[car].route;
      const lifted = new THREE.CatmullRomCurve3(curve.points.map((p) => p.clone().setY(0.09)), false, 'centripetal');
      const g = new THREE.TubeGeometry(lifted, 120, 0.09, 6, false);
      const m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, toneMapped: false, depthWrite: false });
      const mesh = new THREE.Mesh(g, m);
      this.scene.add(mesh);
      this.track(g, m);
      this.routes.push({ mesh, w, car, toBay });
    };
    route('A', 1, [0.195, 0.205, 0.275, 0.29], true);
    route('C', 1, [0.49, 0.5, 0.54, 0.555], true);
    route('B', 1, [0.605, 0.615, 0.638, 0.65], false);
    route('C', 3, [0.712, 0.72, 0.738, 0.75], false);
    route('D', 1, [0.855, 0.865, 0.885, 0.9], true);

    // MQTT link from the gatehouse to the cloud, with travelling packets
    const bg = new THREE.CylinderGeometry(0.04, 0.04, 40, 8, 1, true);
    bg.translate(0, 20, 0);
    const bm = new THREE.MeshBasicMaterial({ color: 0x58a6ff, transparent: true, opacity: 0, toneMapped: false, depthWrite: false });
    this.beam = new THREE.Mesh(bg, bm);
    this.beam.position.copy(BOOTH_TOP);
    const pg = new THREE.SphereGeometry(0.16, 16, 12);
    const pm = new THREE.MeshBasicMaterial({ color: 0x9cd0ff, toneMapped: false });
    for (let i = 0; i < 3; i++) {
      const pk = new THREE.Mesh(pg, pm);
      pk.visible = false;
      this.packets.push(pk);
      this.scene.add(pk);
    }
    this.scene.add(this.beam);
    this.track(bg, bm, pg, pm);

    this.offlineSprite = this.labelSprite(`✕ ${this.labels.offline}`, '#ffffff', 'rgba(218,54,51,0.92)', 512, 112, 3.6);
    this.offlineSprite.position.copy(B(0, -20, 7.2));
    this.scene.add(this.offlineSprite);

    // zones
    const zones: [string, number, number][] = [
      ['A', -20.8, -5.4],
      ['A', 20.8, -5.4],
      ['B', -20, 6.8],
      ['C', -20, 12],
      ['D', -20, 24.2],
    ];
    for (const [z, x, y] of zones) {
      const s = this.labelSprite(`${this.labels.zone} ${z}`, '#ffffff', z === 'B' ? 'rgba(31,111,235,0.92)' : 'rgba(13,17,23,0.85)', 512, 128, 3.4);
      s.position.copy(B(x, y, 3.2));
      this.zoneSprites.push(s);
      this.scene.add(s);
    }
    const og = new THREE.BufferGeometry().setFromPoints([
      B(-30, 4.1, 0.12),
      B(30, 4.1, 0.12),
      B(30, 9.5, 0.12),
      B(-30, 9.5, 0.12),
    ]);
    const om = new THREE.LineBasicMaterial({ color: 0x58a6ff, transparent: true, opacity: 0, toneMapped: false });
    this.zoneOutline = new THREE.LineLoop(og, om);
    this.scene.add(this.zoneOutline);
    this.track(og, om);
  }

  private async buildKioskQr() {
    // Demo payload only — not a real VietQR/NAPAS string or bank account.
    const canvas = document.createElement('canvas');
    await QRCode.toCanvas(canvas, `PARKVISION-DEMO|${STAY_C.sessionId}|${PLATES.C}`, { margin: 1, width: 256 });
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const geo = new THREE.PlaneGeometry(0.3, 0.3);
    const mat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
    this.kioskQr = new THREE.Mesh(geo, mat);
    this.kioskQr.position.copy(B(1.285, -16.2, 1.35));
    this.kioskQr.rotation.y = Math.PI / 2; // faces +X, toward the exit lane
    this.kioskQr.visible = false;
    this.scene.add(this.kioskQr);
    this.track(tex, geo, mat);
  }

  // ------------------------------------------------------------------ public API

  setProgress(p: number) {
    this.targetProgress = Math.min(1, Math.max(0, p));
  }

  setPointer(clientX: number, clientY: number, inside: boolean) {
    const r = this.container.getBoundingClientRect();
    this.pointer.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    this.pointerInside = inside;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    const loop = () => {
      if (!this.running) return;
      this.frame();
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  resize() {
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    this.width = w;
    this.height = h;
    this.camera.aspect = w / h;
    this.camera.fov = w < 640 ? 58 : 42;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
    if (this.composer) {
      this.composer.setPixelRatio(this.renderer.getPixelRatio());
      this.composer.setSize(w, h);
    }
  }

  dispose() {
    this.stop();
    for (const d of this.disposables) d.dispose();
    this.composer.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }

  // ------------------------------------------------------------------ per frame

  private poseCar(id: CarId, p: number) {
    const car = this.cars[id];
    const legs = this.legs[id];
    car.visible = carVisible(id, p);
    const startBay = START_BAY[id];
    if (startBay && p < legs[0].leg.from) {
      const s = this.slots.find((sl) => sl.id === startBay);
      if (s) {
        car.position.copy(B(s.pos[0], s.pos[1], 0));
        car.rotation.y = s.heading;
      }
      return;
    }
    let legIdx = legs.findIndex((l) => p < l.leg.to);
    if (legIdx === -1) legIdx = legs.length - 1;
    const { leg } = legs[legIdx];
    // between legs: hold at the end of the previous one
    if (p < leg.from && legIdx > 0) {
      this.placeAt(car, legs[legIdx - 1], 1);
      return;
    }
    const t = span(p, leg.from, leg.to);
    this.placeAt(car, legs[legIdx], t);
    if (legIdx > 0 && t < 0.15) {
      const prev = new THREE.Object3D();
      this.placeAt(prev, legs[legIdx - 1], 1);
      car.rotation.y = lerpAngle(prev.rotation.y, car.rotation.y, t / 0.15);
    }
  }

  private placeAt(car: THREE.Object3D, { leg, curve }: LegCurve, t: number) {
    const u = Math.min(0.9999, Math.max(0.0001, t));
    car.position.copy(curve.getPointAt(t));
    const tan = curve.getTangentAt(u);
    // tangent is in three.js space: Blender dx = tan.x, dy = -tan.z
    const dir = leg.reverse ? -1 : 1;
    car.rotation.y = yawOf(tan.x * dir, -tan.z * dir);
  }

  private frame() {
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.lastTime) / 1000);
    this.watchFrameTime(dt);
    this.lastTime = now;
    this.elapsed += dt;
    const time = this.elapsed;
    const k = this.reducedMotion ? 1 : 1 - Math.exp(-dt * 5.5);
    this.progress += (this.targetProgress - this.progress) * k;
    if (Math.abs(this.targetProgress - this.progress) < 1e-5) this.progress = this.targetProgress;
    const p = this.progress;
    const pulse = 0.5 + 0.5 * Math.sin(time * 6);

    for (const id of Object.keys(CAST) as CarId[]) this.poseCar(id, p);

    this.updateCamera(p, dt);

    // street traffic (time based, loops)
    for (const c of this.streetCars) {
      const x = ((time * c.speed + c.offset) % 160) - 80;
      c.obj.position.copy(B(x, -48.5, 0));
      c.obj.rotation.y = yawOf(1, 0);
    }

    // barriers
    const liftIn = barrierEntry(p);
    const liftOut = barrierExit(p);
    const maxA = THREE.MathUtils.degToRad(86);
    if (this.entryPivot) this.entryPivot.rotation.z = -liftIn * maxA;
    if (this.exitPivot) this.exitPivot.rotation.z = liftOut * maxA;
    const fsmEntry = fsmState(liftIn, this.prevLift.entry);
    const fsmExit = fsmState(liftOut, this.prevLift.exit);
    this.prevLift = { entry: liftIn, exit: liftOut };
    (this.entryLamp.material as THREE.MeshBasicMaterial).color.setHex(liftIn > 0.02 ? 0x3fff6a : 0xff3b30).multiplyScalar(5);
    (this.exitLamp.material as THREE.MeshBasicMaterial).color.setHex(liftOut > 0.02 ? 0x3fff6a : 0xff3b30).multiplyScalar(5);

    for (const r of this.routes) {
      const o = 0.85 * windowed(p, ...r.w);
      (r.mesh.material as THREE.MeshBasicMaterial).opacity = o;
      r.mesh.visible = o > 0.01;
    }

    // occupancy
    let occupied = this.parkedCount;
    for (const id of Object.keys(SCRIPTED_BAYS) as CarId[]) if (bayOccupied(id, p)) occupied++;
    const total = this.slots.length;
    const free = total - occupied;
    const mapFocus = windowed(p, 0.355, 0.37, 0.395, 0.405);
    this.bayMat.opacity = 0.16 + 0.45 * mapFocus;
    const col = new THREE.Color();
    const zoneB = zoneBHighlight(p);
    this.slots.forEach((s, i) => {
      const occ = s.scripted ? bayOccupied(s.scripted, p) : !!s.car;
      const car = s.scripted;
      const awaited = !!car && !occ && this.routes.some((r) => r.car === car && r.toBay && r.mesh.visible);
      if (car && awaited) col.setHex(CAST[car].route).multiplyScalar(0.6 + 0.6 * pulse);
      else col.setHex(occ ? 0xf85149 : 0x3fb950);
      if (zoneB > 0 && s.id.startsWith('B-')) col.lerp(new THREE.Color(0x58a6ff), 0.45 * zoneB);
      this.bays.setColorAt(i, col);
    });
    if (this.bays.instanceColor) this.bays.instanceColor.needsUpdate = true;
    if (zoneB > 0) this.bayMat.opacity = Math.max(this.bayMat.opacity, 0.16 + 0.3 * zoneB);

    // zones
    const zl = zoneLabels(p);
    for (const s of this.zoneSprites) {
      s.visible = zl > 0.01;
      s.material.opacity = zl;
    }
    (this.zoneOutline.material as THREE.LineBasicMaterial).opacity = zoneB;
    this.zoneOutline.visible = zoneB > 0.01;

    // MQTT link
    const offline = isOffline(p);
    this.offlineSprite.visible = offline;
    if (offline) this.offlineSprite.material.opacity = 0.75 + 0.25 * pulse;
    const beamMat = this.beam.material as THREE.MeshBasicMaterial;
    beamMat.color.setHex(offline ? 0xff4d4d : 0x58a6ff);
    let beamOp = offline ? 0.25 + 0.2 * pulse : 0;
    for (const pk of this.packets) pk.visible = false;
    for (const pkt of PACKETS) {
      if (p < pkt.a - 0.004 || p > pkt.b + 0.004) continue;
      const t = span(p, pkt.a, pkt.b);
      const origin = pkt.from === 'booth' ? BOOTH_TOP : MONITOR_TOP;
      this.beam.position.copy(origin);
      beamOp = 0.35;
      const n = pkt.count ?? 1;
      for (let i = 0; i < n; i++) {
        const ti = Math.min(1, Math.max(0, t * (1 + 0.5 * (n - 1)) - i * 0.25));
        const h = (pkt.dir === 'up' ? ti : 1 - ti) * 38;
        const pk = this.packets[i];
        pk.visible = ti > 0 && ti < 1;
        pk.position.copy(origin).add(new THREE.Vector3(0, h, 0));
        (pk.material as THREE.MeshBasicMaterial).color.setHex(pkt.dir === 'up' ? 0x9cd0ff : 0xffd27a).multiplyScalar(5);
      }
    }
    if (!PACKETS.some((pkt) => p >= pkt.a - 0.004 && p <= pkt.b + 0.004 && pkt.from === 'monitor')) this.beam.position.copy(BOOTH_TOP);
    beamMat.opacity = beamOp;
    this.beam.visible = beamOp > 0;

    this.kioskQr.visible = kioskQrVisible(p);

    // LEDs and signs (redraw only when the text changes)
    this.drawLed('entry', entryLed(p));
    this.drawLed('exit', exitLed(p));
    this.redraw('guide', [{ text: `${this.labels.freeBays}  ▸  ${free}`, color: free > 10 ? '#3fff6a' : '#ffb02e', size: 96 }]);
    this.redraw('pylon', [
      { text: 'P', color: '#58a6ff', size: 170 },
      { text: this.labels.freeBays, color: '#ffffff', size: 30 },
      { text: String(free), color: '#3fff6a', size: 92 },
    ]);

    // scans (ANPR at the gates, monitor camera in the lot)
    const read = activeRead(p);
    const stage = read ? readStage(read, p) : { step: 0 as const, text: '', confidence: 0 };
    const target = read ? this.cars[read.car] : null;
    let corners: THREE.Vector3[] = [];
    let frameCorners: THREE.Vector3[] = [];
    const center = new THREE.Vector3();
    if (read && target && stage.step > 0) {
      if (read.cam === 'monitor') {
        const box = new THREE.Box3().setFromObject(target);
        const { min, max } = box;
        corners = [
          new THREE.Vector3(min.x, max.y, min.z),
          new THREE.Vector3(max.x, max.y, min.z),
          new THREE.Vector3(max.x, max.y, max.z),
          new THREE.Vector3(min.x, max.y, max.z),
        ];
        frameCorners = [...corners, ...corners.map((c) => c.clone().setY(min.y))];
        box.getCenter(center);
        this.plateFrame.visible = false;
      } else {
        const plate = target.getObjectByName(read.cam === 'entry' ? 'PlateFront' : 'PlateRear') as THREE.Mesh | undefined;
        if (plate) {
          plate.updateWorldMatrix(true, false);
          const hw = 0.26;
          const hh = 0.056;
          corners = [
            new THREE.Vector3(-hw, -hh, 0),
            new THREE.Vector3(hw, -hh, 0),
            new THREE.Vector3(hw, hh, 0),
            new THREE.Vector3(-hw, hh, 0),
          ].map((v) => v.applyMatrix4(plate.matrixWorld));
          frameCorners = corners;
          plate.getWorldPosition(center);
          this.plateFrame.visible = stage.step >= 2;
          this.plateFrame.position.copy(center);
          this.plateFrame.quaternion.copy(plate.getWorldQuaternion(new THREE.Quaternion()));
          this.plateFrame.position.add(new THREE.Vector3(0, 0, 0.02).applyQuaternion(this.plateFrame.quaternion));
          (this.plateFrame.material as THREE.LineBasicMaterial).color.setHex(stage.step === 4 ? 0x3fb950 : 0xf0b429);
        }
      }
    } else {
      this.plateFrame.visible = false;
    }
    const eye = read ? this.eyes[read.cam] : this.eyes.entry;
    this.frustum.visible = corners.length > 0;
    if (corners.length) {
      const attr = this.frustum.geometry.getAttribute('position') as THREE.BufferAttribute;
      attr.setXYZ(0, eye.x, eye.y, eye.z);
      const spread = read?.cam === 'monitor' ? 1.15 : stage.step >= 2 ? 1.6 : 6;
      corners.forEach((c, i) => {
        const v = c.clone().sub(center).multiplyScalar(spread).add(center);
        attr.setXYZ(i + 1, v.x, v.y, v.z);
      });
      attr.needsUpdate = true;
      this.frustum.geometry.computeBoundingSphere();
      const fm = this.frustum.material as THREE.MeshBasicMaterial;
      fm.color.setHex(read?.cam === 'monitor' ? 0x58a6ff : 0xff5a4e);
      fm.opacity = 0.1 + 0.06 * pulse;
    }

    // render main view
    this.renderer.setScissorTest(false);
    this.renderer.setViewport(0, 0, this.width, this.height);
    if (this.quality === 'low') this.renderer.render(this.scene, this.camera);
    else this.composer.render(dt);

    // picture-in-picture from the scanning camera
    const narrow = this.width < 640;
    const pw = Math.round(narrow ? this.width * 0.5 : Math.min(360, this.width * 0.3));
    const ph = Math.round(pw * 0.6);
    const rect = { x: this.width - pw - 16, y: narrow ? 16 : this.height - ph - 16, w: pw, h: ph };
    const pip: PipInfo = { visible: false, cam: read?.cam ?? null, rect, box: null, stage, car: read?.car ?? null };
    if (read && target && stage.step > 0 && frameCorners.length) {
      pip.visible = true;
      this.pipCam.aspect = pw / ph;
      this.pipCam.fov = read.cam === 'entry' ? 24 : read.cam === 'exit' ? 26 : 34;
      this.pipCam.updateProjectionMatrix();
      this.pipCam.position.copy(eye);
      // gate cameras are fixed (aimed at the stop line); the monitor camera frames the bay
      this.pipCam.lookAt(
        read.cam === 'entry' ? B(-5, -19.5, 0.75) : read.cam === 'exit' ? B(5, -16.8, 0.8) : center,
      );
      const hidden = [this.frustum, this.plateFrame, ...this.zoneSprites, this.offlineSprite].filter((o) => o.visible);
      for (const o of hidden) o.visible = false;
      this.renderer.setScissorTest(true);
      const yGl = this.height - rect.y - ph;
      this.renderer.setScissor(rect.x, yGl, pw, ph);
      this.renderer.setViewport(rect.x, yGl, pw, ph);
      this.renderer.render(this.scene, this.pipCam);
      this.renderer.setScissorTest(false);
      for (const o of hidden) o.visible = true;
      if (stage.step >= 2) {
        const pts = frameCorners.map((c) => c.clone().project(this.pipCam));
        const xs = pts.map((v) => (v.x + 1) / 2);
        const ys = pts.map((v) => (1 - v.y) / 2);
        const x0 = Math.min(...xs);
        const y0 = Math.min(...ys);
        const box = { x: x0, y: y0, w: Math.max(...xs) - x0, h: Math.max(...ys) - y0 };
        if (box.x > -0.2 && box.x < 1.2 && box.y > -0.2 && box.y < 1.2) pip.box = box;
      }
    }

    this.updateHover();
    this.onFrame({ progress: p, fsmEntry, fsmExit, free, total, pip });
  }

  private updateCamera(p: number, dt: number) {
    this.pointerSmoothed.lerp(this.pointerInside ? this.pointer : new THREE.Vector2(), 1 - Math.exp(-dt * 3));
    const cam = cameraAt(p);
    const pos = B(...cam.pos);
    const target = B(...cam.target);
    let best: { car: CarId; w: number } | null = null;
    for (const c of CHASES) {
      const w = windowed(p, ...c.w);
      if (w > 0 && (!best || w > best.w)) best = { car: c.car, w };
    }
    if (best) {
      const car = this.cars[best.car];
      const back = new THREE.Vector3(Math.sin(car.rotation.y), 0, Math.cos(car.rotation.y)); // opposite the nose
      const ideal = car.position.clone().addScaledVector(back, 9).add(new THREE.Vector3(0, 5.5, 0));
      const k2 = this.reducedMotion || !this.chasePos ? 1 : 1 - Math.exp(-dt * 3);
      this.chasePos = (this.chasePos ?? ideal.clone()).lerp(ideal, k2);
      pos.lerp(this.chasePos, best.w);
      target.lerp(car.position.clone().setY(0.8), best.w);
    } else {
      this.chasePos = null;
    }
    const fwd = target.clone().sub(pos).normalize();
    const right = new THREE.Vector3().crossVectors(fwd, this.camera.up).normalize();
    const par = this.reducedMotion ? 0 : Math.min(2.2, pos.distanceTo(target) * 0.06);
    pos.addScaledVector(right, this.pointerSmoothed.x * par).addScaledVector(this.camera.up, this.pointerSmoothed.y * par * 0.5);
    this.camera.position.copy(pos);
    this.camera.lookAt(target);
  }

  private drawLed(key: 'entry' | 'exit', s: LedState) {
    const msg = s.msg === 'raw' ? (s.text ?? '') : this.labels[s.msg];
    const top = s.top === 'PARKVISION';
    this.redraw(key, [
      { text: s.top, color: top ? '#58a6ff' : '#ffffff', size: top ? 48 : 54 },
      { text: msg, color: top && s.tone === 'brand' ? '#ffffff' : TONES[s.tone], size: 40 },
    ]);
  }

  private redraw(key: LedKey, lines: { text: string; color: string; size: number }[]) {
    const k = lines.map((l) => l.text + l.color).join('|');
    if (this.ledKeys[key] === k) return;
    this.ledKeys[key] = k;
    this.leds[key].draw(lines);
  }

  private updateHover() {
    if (!this.pointerInside) {
      if (this.hovered) {
        this.hovered = null;
        this.onHover(null);
      }
      return;
    }
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const targets = [...this.parkedGroup.children, ...Object.values(this.cars).filter((c) => c.visible)];
    const hits = this.raycaster.intersectObjects(targets, true);
    let obj: THREE.Object3D | null = hits[0]?.object ?? null;
    while (obj && !obj.userData.plate) obj = obj.parent;
    this.hovered = obj;
    if (!obj) {
      this.onHover(null);
      return;
    }
    const screen = obj.position.clone().setY(1.8).project(this.camera);
    const scripted = (Object.keys(this.cars) as CarId[]).find((id) => this.cars[id] === obj);
    const parkedNow = scripted ? bayOccupied(scripted, this.progress) : true;
    this.onHover({
      plate: obj.userData.plate as string,
      bay: parkedNow ? ((obj.userData.bay as string | undefined) ?? '') : '',
      x: ((screen.x + 1) / 2) * this.width,
      y: ((1 - screen.y) / 2) * this.height,
    });
  }
}
