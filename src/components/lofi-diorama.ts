import { LitElement, html, css } from 'lit';
import { customElement, property, state, query } from 'lit/decorators.js';
import * as THREE from 'three';
import ufoPosterImg from '../assets/posters/iwanttobelieve_.jpg';
import tr808PosterImg from '../assets/posters/tr808.png';
import mpcPosterImg from '../assets/posters/mpc.jpg';
import greenRugImg from '../assets/rugs/green_arched_rug.png';
import pinkRugImg from '../assets/rugs/pink_arched_rug.png';
import whiteRugImg from '../assets/rugs/white_arched_rug.png';
import yellowWallpaperImg from '../assets/textures/yellow_wallpaper.png';
import dampCarpetImg from '../assets/textures/damp_carpet.png';
import backroomsAlbedoImg from '../assets/backrooms_albedo.png';
import backroomsEmissionImg from '../assets/backrooms_emission.png';
import backroomsRoughnessImg from '../assets/backrooms_roughness.png';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { SSAOPass } from 'three/examples/jsm/postprocessing/SSAOPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { CSS3DRenderer, CSS3DObject } from 'three/examples/jsm/renderers/CSS3DRenderer.js';

import { AudioManager } from '../utils/audio-manager';
import { TrackerScreen } from '../utils/tracker-screen';
import { M8Screen } from '../utils/m8-screen';
import { QuantumCube } from '../utils/quantum-cube';
import { GearRegistry } from '../utils/gear-registry';
import type { DioramaSceneState } from '../types/diorama';

const MM_TO_UNITS = 0.018;
const GET_GEAR_SIZE = (wMm: number, dMm: number, hMm: number) => {
  return {
    w: wMm * MM_TO_UNITS,
    d: dMm * MM_TO_UNITS,
    h: hMm * MM_TO_UNITS
  };
};

@customElement('lofi-diorama')
export class LofiDiorama extends LitElement {
  @property({ type: Object })
  audioManager: AudioManager | null = null;

  @property({ type: Object })
  audioDirector: any | null = null;

  @property({ type: Object })
  sceneState: DioramaSceneState | null = null;

  get weather(): 'sunny' | 'rainy' | 'thunderstorm' {
    return this.sceneState?.environment.weather ?? 'sunny';
  }

  get timeOfDay(): 'day' | 'sunset' | 'night' {
    return this.sceneState?.environment.timeOfDay ?? 'day';
  }

  get sceneMode(): 'normal' | 'liminal' {
    return this.sceneState?.environment.sceneMode ?? 'normal';
  }

  get celestialPosition(): number {
    return this.sceneState?.environment.celestialPosition ?? 50;
  }

  get rainIntensity(): number {
    return this.sceneState?.environment.rainIntensity ?? 50;
  }

  get lightningIntensity(): number {
    return this.sceneState?.environment.lightningIntensity ?? 50;
  }

  get activeGear(): string[] {
    return this.sceneState?.gear.activeGear ?? ['polyend', 'circuit_tracks', 'mood', 'blooper', 'generation_loss', 'sp404', 'm8', 'poster_believe', 'poster_808', 'poster_mpc', 'lamp', 'cup', 'succulent_echeveria', 'succulent_moonstones', 'succulent_haworthia', 'succulent_pearls', 'succulent_jade'];
  }

  private _primaryArrayOverride: string[] | null = null;
  private _secondaryArrayOverride: string[] | null = null;
  private _macroShotsOverride: any[] | null = null;
  private _microCutsOverride: any[] | null = null;

  get primaryArray(): string[] {
    return this._primaryArrayOverride ?? this.sceneState?.gear.primaryArray ?? [];
  }
  set primaryArray(val: string[]) {
    this._primaryArrayOverride = val;
  }

  get secondaryArray(): string[] {
    return this._secondaryArrayOverride ?? this.sceneState?.gear.secondaryArray ?? [];
  }
  set secondaryArray(val: string[]) {
    this._secondaryArrayOverride = val;
  }

  get macroShots(): any[] {
    return this._macroShotsOverride ?? this.sceneState?.gear.macroShots ?? [];
  }
  set macroShots(val: any[]) {
    this._macroShotsOverride = val;
  }

  get microCuts(): any[] {
    return this._microCutsOverride ?? this.sceneState?.gear.microCuts ?? [];
  }
  set microCuts(val: any[]) {
    this._microCutsOverride = val;
  }

  @query('.canvas-container')
  container!: HTMLDivElement;

  @state()
  private hoveredSynth: THREE.Object3D | null = null;

  @state()
  private hoverPosX: number = 0;

  @state()
  private hoverPosY: number = 0;

  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private renderer!: THREE.WebGLRenderer;
  private cssRenderer!: CSS3DRenderer;
  private composer!: EffectComposer;
  private gearGroup!: THREE.Group;
  private clutterGroup!: THREE.Group;
  private cosyRoomGroup!: THREE.Group;
  private backroomsGroup!: THREE.Group;
  private backroomsWallMeshes: THREE.Mesh[] = [];
  private bloomPass!: UnrealBloomPass;

  @state()
  private activeConfigDevice: THREE.Object3D | null = null;
  private configPanelObj: CSS3DObject | null = null;

  private resizeObserver!: ResizeObserver;
  private animationFrameId: number | null = null;

  // Scene targets
  private trackerScreen!: TrackerScreen;
  private m8Screen!: M8Screen;
  private quantumCube!: QuantumCube;
  private tapeSpools: THREE.Object3D[] = [];
  private posters: THREE.Object3D[] = [];
  private rugs: THREE.Object3D[] = [];
  private circuitPads: THREE.Mesh[] = [];
  private lampBulb!: THREE.Mesh;
  private deskLight!: THREE.PointLight;
  private windowLight!: THREE.DirectionalLight;
  private ambientLight!: THREE.AmbientLight;
  private hemiLight!: THREE.HemisphereLight;

  // Click/raycasting properties
  private clickableObjects: THREE.Object3D[] = [];
  private draggableObjects: THREE.Object3D[] = [];
  private shelfObjects: THREE.Object3D[] = [];
  private staticCollisionObjects: THREE.Object3D[] = [];
  private surfaceObjects: THREE.Object3D[] = [];
  private dragObject: THREE.Object3D | null = null;
  private dragOffset: THREE.Vector3 = new THREE.Vector3();
  private dragPlane: THREE.Plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private intersectionPoint: THREE.Vector3 = new THREE.Vector3();

  private hermanMillerChair: THREE.Group | null = null;
  private targetChairRotation: number = 0;

  // Live Sequencer
  private sequencerActive = false;

  private lastMacroId: string | null = null;

  // 1.5s Transition State
  private transitionStartTime = 0;
  private transitionDuration = 1500;
  private isTransitioning = false;
  private sourceCameraPos = new THREE.Vector3();
  private sourceCameraTarget = new THREE.Vector3();
  private targetCameraPos = new THREE.Vector3();
  private targetCameraTarget = new THREE.Vector3();

  // HyperFrames Render Mode State
  private isRenderMode = false;
  private offlineAudioBuffer: Float32Array | null = null;
  private offlineSampleRate = 44100;
  private renderCurrentTime = 0;

  private controls!: OrbitControls;

  private raycaster = new THREE.Raycaster();
  private mouse = new THREE.Vector2();
  private boundOnPointerMove = this.onPointerMove.bind(this);
  private boundOnPointerDown = this.onPointerDown.bind(this);
  private boundOnPointerUp = this.onPointerUp.bind(this);
  private boundOnWheel = this.onWheel.bind(this);
  private lastTouchDistance: number | null = null;
  private boundOnTouchStart = this.onTouchStart.bind(this);
  private boundOnTouchMove = this.onTouchMove.bind(this);
  private boundOnTouchEnd = this.onTouchEnd.bind(this);

  // Weather
  private rainDrops!: THREE.Points;
  private clouds: THREE.Mesh[] = [];
  private skyMat!: THREE.MeshBasicMaterial;
  private lightningLight!: THREE.PointLight;
  private targetLightningIntensity: number = 0;
  private currentLightningIntensity: number = 0;

  // Yard
  private yardGroup!: THREE.Group;

  static styles = css`
    :host {
      display: block;
      width: 100%;
      height: 100%;
      position: relative;
      border-radius: 16px;
      overflow: hidden;
      background-color: #1a1520;
      box-shadow: inset 0 0 60px rgba(0, 0, 0, 0.8);
      border: 1px solid rgba(255, 255, 255, 0.05);
    }

    .canvas-container {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      overflow: hidden;
      touch-action: none;
    }

    .canvas-container canvas {
      display: block;
      width: 100% !important;
      height: 100% !important;
    }

    .recenter-btn {
      position: absolute;
      bottom: 24px;
      right: 24px;
      background: rgba(255, 255, 255, 0.1);
      border: 1px solid rgba(255, 255, 255, 0.2);
      border-radius: 8px;
      color: white;
      padding: 8px 16px;
      font-family: inherit;
      font-size: 14px;
      cursor: pointer;
      backdrop-filter: blur(4px);
      transition: all 0.2s ease;
      z-index: 10;
    }

    .recenter-btn:hover {
      background: rgba(255, 255, 255, 0.2);
      border-color: rgba(255, 255, 255, 0.4);
    }

    .edit-toggle {
      position: absolute;
      background: rgba(0, 0, 0, 0.6);
      border: 1px solid rgba(255, 255, 255, 0.2);
      border-radius: 50%;
      width: 32px;
      height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      cursor: pointer;
      transform: translate(-50%, -50%);
      backdrop-filter: blur(4px);
      transition: background 0.2s, transform 0.1s;
      z-index: 20;
    }
    
    .edit-toggle:hover {
      background: rgba(255, 255, 255, 0.3);
      transform: translate(-50%, -50%) scale(1.1);
    }
    
    .edit-toggle svg {
      width: 16px;
      height: 16px;
      fill: currentColor;
    }

    .config-panel {
      background: rgba(20, 15, 25, 0.85);
      border: 1px solid rgba(255, 255, 255, 0.15);
      border-radius: 12px;
      padding: 16px;
      color: white;
      font-family: inherit;
      width: 200px;
      backdrop-filter: blur(8px);
      pointer-events: auto;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
      display: flex;
      flex-direction: column;
      gap: 12px;
      user-select: none;
    }

    .config-panel h3 {
      margin: 0;
      font-size: 14px;
      font-weight: 600;
      border-bottom: 1px solid rgba(255,255,255,0.1);
      padding-bottom: 8px;
      text-transform: capitalize;
    }

    .config-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 12px;
    }

    .config-row input[type=range] {
      width: 100px;
      accent-color: #ffaa77;
    }

    .config-row label {
      display: flex;
      align-items: center;
      gap: 8px;
      cursor: pointer;
    }

    .config-row input[type=checkbox] {
      accent-color: #ffaa77;
      cursor: pointer;
    }

    .config-btn {
      background: rgba(255, 170, 119, 0.2);
      border: 1px solid rgba(255, 170, 119, 0.5);
      color: #ffaa77;
      border-radius: 4px;
      padding: 6px 12px;
      font-size: 11px;
      font-weight: 600;
      cursor: pointer;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      transition: all 0.2s;
    }
    .config-btn:hover {
      background: rgba(255, 170, 119, 0.4);
    }
  `;

  firstUpdated() {
    this.initThreeJS();
    this.applySceneMode();
    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(this.container);
    this.startLoop();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this.resizeObserver) this.resizeObserver.disconnect();
    if (this.animationFrameId !== null) cancelAnimationFrame(this.animationFrameId);
    if (this.renderer) {
      if (this.renderer.domElement) {
        this.renderer.domElement.removeEventListener('pointermove', this.boundOnPointerMove);
        this.renderer.domElement.removeEventListener('pointerdown', this.boundOnPointerDown);
        this.renderer.domElement.removeEventListener('wheel', this.boundOnWheel);
        window.removeEventListener('pointerup', this.boundOnPointerUp);
        this.renderer.domElement.removeEventListener('touchstart', this.boundOnTouchStart);
        this.renderer.domElement.removeEventListener('touchmove', this.boundOnTouchMove);
        this.renderer.domElement.removeEventListener('touchend', this.boundOnTouchEnd);
        this.renderer.domElement.removeEventListener('touchcancel', this.boundOnTouchEnd);
      }
      this.renderer.dispose();
      const gl = this.renderer.getContext();
      const ext = gl.getExtension('WEBGL_lose_context');
      if (ext) ext.loseContext();
    }
    if (this.controls) this.controls.dispose();
    if (this.scene) this.scene.clear();
  }

  updated(changedProperties: Map<string, unknown>) {
    if ((changedProperties.has('weather') ||
      changedProperties.has('timeOfDay') ||
      changedProperties.has('celestialPosition') ||
      changedProperties.has('rainIntensity') ||
      changedProperties.has('lightningIntensity')) && this.scene) {
      this.updateEnvironment();
    }
    if (changedProperties.has('activeGear') && this.scene) {
      this.updateGear();
    }
    if (changedProperties.has('sceneMode') && this.scene) {
      this.applySceneMode();
    }
  }

  private initThreeJS() {
    const width = this.container.clientWidth || 800;
    const height = this.container.clientHeight || 600;

    // Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x1a1520);

    // Perspective camera — Diorama/Miniature view (Narrow FOV)
    const aspect = width / height;
    this.camera = new THREE.PerspectiveCamera(15, aspect, 0.1, 1000);
    this.camera.position.set(150, 100, 150);
    this.camera.lookAt(14, 5.6, 0);

    // Crisp, clean renderer with transparent background
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setSize(width, height, false);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    // Soften the tone mapping slightly
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.container.appendChild(this.renderer.domElement);

    // CSS3D Renderer for 3D HTML UI
    this.cssRenderer = new CSS3DRenderer();
    this.cssRenderer.setSize(width, height);
    this.cssRenderer.domElement.style.position = 'absolute';
    this.cssRenderer.domElement.style.top = '0px';
    this.cssRenderer.domElement.style.left = '0px';
    this.cssRenderer.domElement.style.overflow = 'hidden';
    this.cssRenderer.domElement.style.pointerEvents = 'none'; // clicks pass through unless on child elements
    this.container.appendChild(this.cssRenderer.domElement);

    // Set up Post-Processing for SSAO
    this.composer = new EffectComposer(this.renderer);
    const renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(renderPass);

    const ssaoPass = new SSAOPass(this.scene, this.camera, width, height);
    ssaoPass.kernelRadius = 16.0;
    ssaoPass.minDistance = 0.005;
    ssaoPass.maxDistance = 5.0;
    this.composer.addPass(ssaoPass);

    this.bloomPass = new UnrealBloomPass(
        new THREE.Vector2(width, height),
        0.15,  // strength (subtle ambient glow for warm lights and screens)
        0.4,   // radius
        0.85   // threshold
    );
    this.composer.addPass(this.bloomPass);

    const outputPass = new OutputPass();
    this.composer.addPass(outputPass);

    // Add OrbitControls for standard 3D interaction (zoom, pan, rotate)
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.enableZoom = false;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.05; // We handle zoom manually for cursor centering
    this.controls.enablePan = true;
    this.controls.target.set(14, 5.6, 0); // Center on the whole room

    // Diorama view constraints
    this.controls.minDistance = 20;
    this.controls.maxDistance = 250;
    this.controls.maxPolarAngle = Math.PI / 2 + 0.1;
    this.controls.minAzimuthAngle = 0;
    this.controls.maxAzimuthAngle = Math.PI / 2;

    // Bind pointer events for clickable elements
    this.renderer.domElement.addEventListener('pointermove', this.boundOnPointerMove);
    this.renderer.domElement.addEventListener('pointerdown', this.boundOnPointerDown);
    this.renderer.domElement.addEventListener('wheel', this.boundOnWheel, { passive: false });
    window.addEventListener('pointerup', this.boundOnPointerUp);

    // Bind touch events for mobile pinch-to-zoom
    this.renderer.domElement.addEventListener('touchstart', this.boundOnTouchStart, { passive: false });
    this.renderer.domElement.addEventListener('touchmove', this.boundOnTouchMove, { passive: false });
    this.renderer.domElement.addEventListener('touchend', this.boundOnTouchEnd, { passive: false });
    this.renderer.domElement.addEventListener('touchcancel', this.boundOnTouchEnd, { passive: false });

    // Lighting — warm and clear
    this.ambientLight = new THREE.AmbientLight(0xfff0e0, 0.3); // Lowered for stronger shadows
    this.scene.add(this.ambientLight);

    // Hemisphere light for softer, baked-like shadows
    this.hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.8);
    this.scene.add(this.hemiLight);

    // Desk lamp — warm spot light for dramatic soft pool
    this.deskLight = new THREE.SpotLight(0xffddaa, 80, 50, Math.PI / 4, 0.5, 2) as unknown as THREE.PointLight;
    this.deskLight.castShadow = true;
    this.deskLight.shadow.mapSize.width = 2048;
    this.deskLight.shadow.mapSize.height = 2048;
    this.deskLight.shadow.bias = -0.001;

    // Window daylight
    this.windowLight = new THREE.DirectionalLight(0xffffff, 1.5);
    this.windowLight.position.set(0, 20, -30);
    this.windowLight.castShadow = true;
    this.windowLight.shadow.mapSize.width = 2048;
    this.windowLight.shadow.mapSize.height = 2048;
    this.windowLight.shadow.camera.left = -20;
    this.windowLight.shadow.camera.right = 20;
    this.windowLight.shadow.camera.top = 20;
    this.windowLight.shadow.camera.bottom = -10;
    this.windowLight.shadow.bias = -0.0005;
    this.scene.add(this.windowLight);

    // Build scene
    this.cosyRoomGroup = new THREE.Group();
    this.backroomsGroup = new THREE.Group();
    this.backroomsGroup.visible = false;
    this.scene.add(this.cosyRoomGroup);
    this.scene.add(this.backroomsGroup);

    this.buildBackrooms();
    this.buildRoom();
    this.buildWindow();
    this.buildDesk();
    this.buildFurniture();
    this.buildPosters();
    this.buildRugs();

    this.gearGroup = new THREE.Group();
    this.scene.add(this.gearGroup);
    this.clutterGroup = new THREE.Group();
    this.cosyRoomGroup.add(this.clutterGroup);
    this.updateGear();

    this.buildClutter();
    this.buildWeather();
  }

  private buildBackrooms() {
    const textureLoader = new THREE.TextureLoader();
    this.backroomsWallMeshes = [];

    // Load textures for GLB diorama model
    const wallTex = textureLoader.load(yellowWallpaperImg);
    wallTex.wrapS = THREE.RepeatWrapping;
    wallTex.wrapT = THREE.RepeatWrapping;
    wallTex.repeat.set(4, 4);

    const carpetTex = textureLoader.load(dampCarpetImg);
    carpetTex.wrapS = THREE.RepeatWrapping;
    carpetTex.wrapT = THREE.RepeatWrapping;
    carpetTex.repeat.set(6, 6);

    const modelAlbedoTex = textureLoader.load(backroomsAlbedoImg);
    const modelEmissionTex = textureLoader.load(backroomsEmissionImg);
    const modelRoughnessTex = textureLoader.load(backroomsRoughnessImg);
    modelAlbedoTex.colorSpace = THREE.SRGBColorSpace;

    // Load custom backrooms GLB diorama model
    const gltfLoader = new GLTFLoader();
    gltfLoader.load(
      import.meta.env.BASE_URL + 'models/backrooms-diorama.glb',
      (gltf) => {
        const model = gltf.scene;
        model.name = 'backroomsDioramaGLB';
        model.scale.set(12, 12, 12);
        model.position.set(14, -5.9, 0);

        model.traverse((child) => {
          if ((child as THREE.Mesh).isMesh) {
            const mesh = child as THREE.Mesh;
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            const name = mesh.name.toLowerCase();

            if (name.includes('carpetfloor') || name.includes('carpet')) {
              mesh.material = new THREE.MeshStandardMaterial({
                map: carpetTex,
                roughness: 0.9,
                metalness: 0.05
              });
              this.surfaceObjects.push(mesh);
            } else if (name.includes('wall') || name.includes('pillar')) {
              const wallMat = new THREE.MeshStandardMaterial({
                map: wallTex,
                roughness: 0.75,
                metalness: 0.0,
                bumpMap: wallTex,
                bumpScale: 0.02
              });
              mesh.material = wallMat;
              this.backroomsWallMeshes.push(mesh);
            } else if (name.includes('fixturetube') || name.includes('tube')) {
              mesh.material = new THREE.MeshBasicMaterial({ color: 0xfff5cc });
              const pointLight = new THREE.PointLight(0xfff5cc, 2.5, 30);
              mesh.add(pointLight);
            } else if (name.includes('fixture') || name.includes('housing')) {
              mesh.material = new THREE.MeshStandardMaterial({
                color: 0x222222,
                metalness: 0.8,
                roughness: 0.3
              });
            } else if (name.includes('chair')) {
              mesh.material = new THREE.MeshStandardMaterial({
                color: 0x3d4852,
                metalness: 0.5,
                roughness: 0.4
              });
            } else if (name.includes('door')) {
              mesh.material = new THREE.MeshStandardMaterial({
                color: 0x4a3728,
                roughness: 0.7,
                metalness: 0.1
              });
            } else if (name.includes('stain')) {
              mesh.material = new THREE.MeshStandardMaterial({
                color: 0x2b2214,
                transparent: true,
                opacity: 0.6,
                roughness: 1.0
              });
            } else if (name.includes('baseboard')) {
              mesh.material = new THREE.MeshStandardMaterial({
                color: 0x2b2b2b,
                roughness: 0.6
              });
            } else if (mesh.material) {
              const m = mesh.material as THREE.MeshStandardMaterial;
              if (modelAlbedoTex) m.map = modelAlbedoTex;
              if (modelRoughnessTex) m.roughnessMap = modelRoughnessTex;
              if (modelEmissionTex) {
                m.emissiveMap = modelEmissionTex;
                m.emissive = new THREE.Color(0xffffff);
                m.emissiveIntensity = 0.6;
              }
            }
          }
        });

        this.backroomsGroup.add(model);
      },
      undefined,
      (err) => {
        console.warn('Could not load backrooms-diorama.glb model:', err);
      }
    );

    // Ambient light specifically for the backrooms GLB diorama
    const backroomsAmbient = new THREE.AmbientLight(0xcccc99, 1.2);
    this.backroomsGroup.add(backroomsAmbient);
  }

  private buildRoom() {
    this.staticCollisionObjects = [];
    this.surfaceObjects = [];

    // Floor
    const textureLoader = new THREE.TextureLoader();
    const floorTex = textureLoader.load(import.meta.env.BASE_URL + 'dark_wood_floor.png');
    floorTex.wrapS = THREE.MirroredRepeatWrapping;
    floorTex.wrapT = THREE.MirroredRepeatWrapping;
    floorTex.repeat.set(3.5, 3.5);

    // Thick cut-out Floor
    const floorGeo = new THREE.BoxGeometry(72.5, 2, 40);
    const floorMat = new THREE.MeshStandardMaterial({
      map: floorTex,
      roughness: 1.0,
      metalness: 0.0
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.position.set(14, -6.01, 0); // Top surface is at Y=-5.01 to prevent z-fighting with bed (Y=-5)
    floor.receiveShadow = true;
    this.cosyRoomGroup.add(floor);
    this.surfaceObjects.push(floor);

    // Back wall (behind the window)
    const wallTex = textureLoader.load(import.meta.env.BASE_URL + 'warm_retro_wallpaper.png');
    wallTex.wrapS = THREE.RepeatWrapping;
    wallTex.wrapT = THREE.RepeatWrapping;
    wallTex.repeat.set(6.6, 4);
    wallTex.colorSpace = THREE.SRGBColorSpace;



    // Wall sections around window - thickened to look like a diorama model block

    // Left of window
    const texLeft = wallTex.clone();
    texLeft.repeat.set(14.0 / 4.5, 4);
    const wallLeft = new THREE.Mesh(new THREE.BoxGeometry(14.0, 45, 2), new THREE.MeshStandardMaterial({ map: texLeft, roughness: 0.85 }));
    wallLeft.position.set(-15.25, 17.5, -21);
    wallLeft.receiveShadow = true;
    this.cosyRoomGroup.add(wallLeft);

    // Right of window
    const texRight = wallTex.clone();
    texRight.repeat.set(41.75 / 4.5, 4);
    const wallRight = new THREE.Mesh(new THREE.BoxGeometry(41.75, 45, 2), new THREE.MeshStandardMaterial({ map: texRight, roughness: 0.85 }));
    wallRight.position.set(29.125, 17.5, -21);
    wallRight.receiveShadow = true;
    this.cosyRoomGroup.add(wallRight);

    // Above window
    const texAbove = wallTex.clone();
    texAbove.repeat.set(16.5 / 4.5, 4);
    const wallAbove = new THREE.Mesh(new THREE.BoxGeometry(16.5, 19.6, 2), new THREE.MeshStandardMaterial({ map: texAbove, roughness: 0.85 }));
    wallAbove.position.set(0, 30.2, -21);
    wallAbove.receiveShadow = true;
    this.cosyRoomGroup.add(wallAbove);

    // Below window
    const texBelow = wallTex.clone();
    texBelow.repeat.set(16.5 / 4.5, 4);
    const wallBelow = new THREE.Mesh(new THREE.BoxGeometry(16.5, 17.0, 2), new THREE.MeshStandardMaterial({ map: texBelow, roughness: 0.85 }));
    wallBelow.position.set(0, 3.5, -21);
    wallBelow.receiveShadow = true;
    this.cosyRoomGroup.add(wallBelow);

    // Solid Left Wall - Thickened
    const sideWallTex = wallTex.clone();
    sideWallTex.repeat.set(40 / 4.5, 4);

    const sideWallMat = new THREE.MeshStandardMaterial({
      map: sideWallTex,
      color: 0xdddddd,
      roughness: 0.9
    });
    const leftWall = new THREE.Mesh(new THREE.BoxGeometry(2, 45, 40), sideWallMat);
    leftWall.position.set(-23.25, 17.5, 0);
    leftWall.receiveShadow = true;
    this.cosyRoomGroup.add(leftWall);

    this.staticCollisionObjects.push(wallLeft, wallRight, wallAbove, wallBelow, leftWall);
  }

  private buildRugs() {
    const buildRug = (img: string, id: string, defaultZ: number) => {
      const textureLoader = new THREE.TextureLoader();
      textureLoader.load(img, (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;

        const width = 16;
        const height = 24;

        const group = new THREE.Group();
        group.name = id;
        group.userData.isRug = true;

        const rugGeo = new THREE.BoxGeometry(width, 0.05, height);
        const rugMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 1.0, color: 0xdddddd });
        const rug = new THREE.Mesh(rugGeo, rugMat);
        rug.position.set(0, 0, 0);
        rug.receiveShadow = true;
        group.add(rug);

        const savedPos = localStorage.getItem(`lofi_pos_${this.sceneMode}_${id}`);
        if (savedPos) {
          try {
            const pos = JSON.parse(savedPos);
            group.position.set(pos.x, pos.y, pos.z);
            if (pos.rY !== undefined) group.rotation.y = pos.rY;
          } catch (e) { }
        } else {
          group.position.set(4, -4.95, defaultZ);
        }

        this.cosyRoomGroup.add(group);
        this.draggableObjects.push(group);
        this.clickableObjects.push(group);
        this.rugs.push(group);

        group.visible = this.activeGear.includes(id);
      });
    };

    buildRug(greenRugImg, 'rug_green_arched', 0);
    buildRug(pinkRugImg, 'rug_pink_arched', 0);
    buildRug(whiteRugImg, 'rug_white_arched', 0);
  }

  private buildPosters() {
    const textureLoader = new THREE.TextureLoader();

    // Poster 1: I Want to Believe
    textureLoader.load(ufoPosterImg, (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      const aspect = tex.image.width / tex.image.height;
      const height = 12;
      const width = height * aspect;
      this.createPosterObject(tex, width, height, 'left', -22.05, 20, 0, 'poster_believe');
    });

    // Poster 2: TR808
    textureLoader.load(tr808PosterImg, (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      const aspect = tex.image.width / tex.image.height;
      const height = 8;
      const width = height * aspect;
      this.createPosterObject(tex, width, height, 'back', 20, 20, -19.8, 'poster_808');
    });

    // Poster 3: MPC
    textureLoader.load(mpcPosterImg, (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      const aspect = tex.image.width / tex.image.height;
      const height = 9;
      const width = height * aspect;
      this.createPosterObject(tex, width, height, 'back', -5, 22, -19.8, 'poster_mpc');
    });
  }

  private createPosterObject(texture: THREE.Texture, width: number, height: number, wall: 'left' | 'back', startX: number, startY: number, startZ: number, name: string) {
    const group = new THREE.Group();
    group.name = name;
    group.userData.isPoster = true;
    group.userData.wall = wall;

    // Frame
    const frameDepth = 0.5;
    const frameWidth = 0.4;
    const frameGeo = new THREE.BoxGeometry(width + frameWidth * 2, height + frameWidth * 2, frameDepth);
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x2b1d12, roughness: 0.6 }); // dark wood
    const frame = new THREE.Mesh(frameGeo, frameMat);
    frame.userData.isFrame = true;
    frame.castShadow = true;
    group.add(frame);

    // Matte
    const matteDepth = 0.2;
    const matteBorder = 0.8;
    const matteGeo = new THREE.BoxGeometry(width + matteBorder * 2, height + matteBorder * 2, matteDepth);
    const matteMat = new THREE.MeshStandardMaterial({ color: 0xf5f5dc, roughness: 1.0 }); // off-white
    const matte = new THREE.Mesh(matteGeo, matteMat);
    matte.position.z = frameDepth / 2 + matteDepth / 2 - 0.1;
    group.add(matte);

    // Canvas/Image
    const canvasGeo = new THREE.PlaneGeometry(width, height);
    const canvasMat = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.5 });
    const canvas = new THREE.Mesh(canvasGeo, canvasMat);
    canvas.position.z = frameDepth / 2 + matteDepth + 0.01;
    group.add(canvas);

    // Rotate if on left wall
    if (wall === 'left') {
      group.rotation.y = Math.PI / 2;
    }

    // Load saved position or use default
    const savedPos = localStorage.getItem(`lofi_pos_${this.sceneMode}_${name}`);
    if (savedPos) {
      const pos = JSON.parse(savedPos);
      group.position.set(pos.x, pos.y, pos.z);
      if (pos.wall) {
        group.userData.wall = pos.wall;
        group.rotation.y = pos.wall === 'left' ? Math.PI / 2 : 0;
      }
    } else {
      group.position.set(startX, startY, startZ);
    }

    this.cosyRoomGroup.add(group);
    this.draggableObjects.push(group);
    this.clickableObjects.push(group);
    this.posters.push(group);
  }


  private buildFurniture() {
    this.buildBed();
    this.buildChair();
    this.buildShelf();
  }

  private buildBed() {
    const bedGroup = new THREE.Group();
    bedGroup.position.set(38, -5.1, -5); // Right side, near the back

    // Wooden Frame
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x3d2817, roughness: 0.9 });
    const frame = new THREE.Mesh(new RoundedBoxGeometry(16, 3, 26, 4, 0.2), woodMat);
    frame.position.set(0, 1.5, 0);
    frame.castShadow = true;
    frame.receiveShadow = true;
    bedGroup.add(frame);

    // Headboard
    const headboard = new THREE.Mesh(new RoundedBoxGeometry(16, 10, 1, 4, 0.2), woodMat);
    headboard.position.set(0, 5, -12.5);
    headboard.castShadow = true;
    headboard.receiveShadow = true;
    bedGroup.add(headboard);

    // Mattress
    const mattressMat = new THREE.MeshStandardMaterial({ color: 0xeeeeee, roughness: 1.0 });
    const mattress = new THREE.Mesh(new RoundedBoxGeometry(15, 4, 25, 6, 0.5), mattressMat);
    mattress.position.set(0, 5, 0);
    mattress.castShadow = true;
    mattress.receiveShadow = true;
    bedGroup.add(mattress);
    this.surfaceObjects.push(mattress);

    // Pillow
    const pillowMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1.0 });
    const pillow = new THREE.Mesh(new RoundedBoxGeometry(9, 1.5, 5, 8, 0.6), pillowMat);
    pillow.position.set(0, 7.5, -9);
    pillow.rotation.x = 0.2;
    pillow.castShadow = true;
    bedGroup.add(pillow);

    // Blanket (Tidy)
    const blanketMat = new THREE.MeshStandardMaterial({ color: 0x5a7065, roughness: 0.9 });
    const blanket = new THREE.Mesh(new RoundedBoxGeometry(15.2, 4.2, 16.2, 6, 0.5), blanketMat);
    blanket.position.set(0, 5, 4.6);
    blanket.castShadow = true;
    blanket.receiveShadow = true;
    bedGroup.add(blanket);

    this.cosyRoomGroup.add(bedGroup);
    this.staticCollisionObjects.push(frame, headboard, mattress);
  }

  private buildChair() {
    const chairGroup = new THREE.Group();
    chairGroup.name = 'herman_miller_chair';
    chairGroup.position.set(2, -5.0, 7); // In front of desk, slightly to the right
    chairGroup.scale.set(1.5, 1.5, 1.5);

    // Facing desk (-Z) but turned slightly out
    this.targetChairRotation = -Math.PI / 5;
    chairGroup.rotation.y = this.targetChairRotation;

    this.hermanMillerChair = chairGroup;

    const darkMeshMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.9, metalness: 0.1 }); // Mesh back
    const darkPlasticMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.7, metalness: 0.2 }); // Frame
    const metalMat = new THREE.MeshStandardMaterial({ color: 0x999999, roughness: 0.4, metalness: 0.8 }); // Base/Column

    // Central Column
    const column = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 4, 16), metalMat);
    column.position.set(0, 2, 0);
    column.castShadow = true;
    chairGroup.add(column);

    // 5-Star Base
    const baseGroup = new THREE.Group();
    baseGroup.position.set(0, 0.5, 0);
    for (let i = 0; i < 5; i++) {
      const angle = (i * Math.PI * 2) / 5;
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 4.5), metalMat);
      leg.position.set(Math.sin(angle) * 2.25, 0, Math.cos(angle) * 2.25);
      leg.rotation.y = angle;
      leg.castShadow = true;
      baseGroup.add(leg);

      // Caster (wheel)
      const caster = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.4, 12), darkPlasticMat);
      caster.rotation.z = Math.PI / 2;
      caster.position.set(Math.sin(angle) * 4.2, -0.2, Math.cos(angle) * 4.2);
      caster.castShadow = true;
      baseGroup.add(caster);
    }
    chairGroup.add(baseGroup);

    // Seat Platform
    const seatBase = new THREE.Mesh(new RoundedBoxGeometry(5, 0.6, 5, 4, 0.2), darkPlasticMat);
    seatBase.position.set(0, 4.2, 0);
    seatBase.castShadow = true;
    chairGroup.add(seatBase);

    // Seat Cushion (Mesh look)
    const seatCushion = new THREE.Mesh(new RoundedBoxGeometry(4.8, 0.4, 4.8, 4, 0.2), darkMeshMat);
    seatCushion.position.set(0, 4.6, -0.2); // Shifted slightly forward (towards desk at -Z)
    seatCushion.castShadow = true;
    chairGroup.add(seatCushion);

    // Backrest Spine
    const spine = new THREE.Mesh(new THREE.BoxGeometry(0.6, 6, 0.6), metalMat);
    spine.position.set(0, 7.5, 2.5); // Back of the chair is +Z
    spine.rotation.x = -0.15; // Lean back slightly
    spine.castShadow = true;
    chairGroup.add(spine);

    // Backrest Frame
    const backFrame = new THREE.Mesh(new RoundedBoxGeometry(4.5, 6.5, 0.4, 4, 0.1), darkPlasticMat);
    backFrame.position.set(0, 8.5, 2.2);
    backFrame.rotation.x = -0.15;
    backFrame.castShadow = true;
    chairGroup.add(backFrame);

    // Backrest Mesh
    const backMesh = new THREE.Mesh(new RoundedBoxGeometry(4.1, 6.1, 0.5, 4, 0.1), darkMeshMat);
    backMesh.position.set(0, 8.5, 2.15); // Slightly inset towards the front
    backMesh.rotation.x = -0.15;
    backMesh.castShadow = true;
    chairGroup.add(backMesh);

    // Armrests
    const armGeo = new THREE.BoxGeometry(0.5, 0.3, 3.5);
    const armSupportGeo = new THREE.BoxGeometry(0.4, 2.5, 0.4);

    const armL = new THREE.Mesh(armGeo, darkPlasticMat);
    armL.position.set(-2.8, 6.5, 0);
    armL.castShadow = true;
    chairGroup.add(armL);

    const armSupportL = new THREE.Mesh(armSupportGeo, metalMat);
    armSupportL.position.set(-2.6, 5.2, 0);
    armSupportL.castShadow = true;
    chairGroup.add(armSupportL);

    const armR = new THREE.Mesh(armGeo, darkPlasticMat);
    armR.position.set(2.8, 6.5, 0);
    armR.castShadow = true;
    chairGroup.add(armR);

    const armSupportR = new THREE.Mesh(armSupportGeo, metalMat);
    armSupportR.position.set(2.6, 5.2, 0);
    armSupportR.castShadow = true;
    chairGroup.add(armSupportR);

    this.cosyRoomGroup.add(chairGroup);
    this.staticCollisionObjects.push(seatBase, backFrame);
    this.clickableObjects.push(chairGroup);
  }

  private buildShelf() {
    const shelfGroup = new THREE.Group();
    shelfGroup.position.set(-21, 15, -4); // Left wall, multi-tier

    // Warm mid-tone walnut material to harmonize with the desk and room
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x7f4f24, roughness: 0.95 });

    // Shelves
    const shelfGeo = new RoundedBoxGeometry(2, 0.4, 20, 4, 0.1); // Width 2, Length 20 along Z

    const shelf1 = new THREE.Mesh(shelfGeo, woodMat);
    shelf1.position.set(0, 1, 0);
    shelf1.castShadow = true;
    shelfGroup.add(shelf1);
    this.surfaceObjects.push(shelf1);

    const shelf2 = new THREE.Mesh(shelfGeo, woodMat);
    shelf2.position.set(0, -3.5, 0);
    shelf2.castShadow = true;
    shelfGroup.add(shelf2);
    this.surfaceObjects.push(shelf2);

    // Create the ribbed arch backboard
    const createArchBackboard = () => {
      const archGroup = new THREE.Group();
      const numArches = 6;
      const numRidges = 6;
      const shelfLength = 20;
      const archWidth = shelfLength / numArches;
      const tube = shelfLength / (numArches * numRidges * 4); // ~0.139

      for (let i = 0; i < numArches; i++) {
        const archCenterZ = -shelfLength / 2 + archWidth / 2 + i * archWidth;

        for (let j = 0; j < numRidges; j++) {
          const r = tube + j * (tube * 2);
          const torusGeo = new THREE.TorusGeometry(r, tube, 16, 48, Math.PI);
          const torus = new THREE.Mesh(torusGeo, woodMat);
          torus.castShadow = true;

          torus.rotation.y = Math.PI / 2;
          torus.position.set(-0.9, 0.2, archCenterZ); // 0.2 is half of shelf thickness

          archGroup.add(torus);
        }
      }
      return archGroup;
    };

    shelf1.add(createArchBackboard());
    shelf2.add(createArchBackboard());

    this.cosyRoomGroup.add(shelfGroup);
    this.staticCollisionObjects.push(shelf1, shelf2);
  }

  private buildDesk() {
    // Desk surface
    const textureLoader = new THREE.TextureLoader();
    const deskTex = textureLoader.load(import.meta.env.BASE_URL + 'polished_desk_wood.png');
    deskTex.wrapS = THREE.RepeatWrapping;
    deskTex.wrapT = THREE.RepeatWrapping;
    deskTex.repeat.set(1.5, 1.0);
    deskTex.colorSpace = THREE.SRGBColorSpace;

    const deskMat = new THREE.MeshStandardMaterial({
      map: deskTex,
      roughness: 0.4,
      metalness: 0.05
    });
    const deskTop = new THREE.Mesh(new RoundedBoxGeometry(32, 0.8, 20, 4, 0.1), deskMat);
    deskTop.position.set(0, 5.6, -7);
    deskTop.castShadow = true;
    deskTop.receiveShadow = true;
    this.cosyRoomGroup.add(deskTop);
    this.surfaceObjects.push(deskTop);

    // Desk Shelf (Tier)
    const shelfTop = new THREE.Mesh(new RoundedBoxGeometry(32, 0.8, 8, 4, 0.1), deskMat);
    shelfTop.position.set(0, 7.5, -13);
    shelfTop.castShadow = true;
    shelfTop.receiveShadow = true;
    this.cosyRoomGroup.add(shelfTop);
    this.surfaceObjects.push(shelfTop);

    // Shelf legs
    const shelfLegGeo = new RoundedBoxGeometry(0.8, 1.1, 0.8, 4, 0.1);
    const shelfLegPositions = [[-14, 6.55, -10], [14, 6.55, -10], [-14, 6.55, -16], [14, 6.55, -16]];
    for (const pos of shelfLegPositions) {
      const leg = new THREE.Mesh(shelfLegGeo, deskMat);
      leg.position.set(pos[0], pos[1], pos[2]);
      leg.castShadow = true;
      this.cosyRoomGroup.add(leg);
    }

    // Desk legs
    const legMat = new THREE.MeshStandardMaterial({ color: 0x3a2518, roughness: 0.5 });
    const legGeo = new RoundedBoxGeometry(0.8, 10.6, 0.8, 4, 0.1);
    const legPositions = [[-15, 0.3, 1.5], [15, 0.3, 1.5], [-15, 0.3, -15.5], [15, 0.3, -15.5]];
    for (const pos of legPositions) {
      const leg = new THREE.Mesh(legGeo, legMat);
      leg.position.set(pos[0], pos[1], pos[2]);
      leg.castShadow = true;
      this.cosyRoomGroup.add(leg);
    }
  }

  private loadOrPlaceObject(obj: THREE.Object3D, name: string, defaultX: number, defaultY: number, defaultZ: number) {
    obj.name = name;

    // Initial position to calculate box
    obj.position.set(defaultX, defaultY, defaultZ);
    obj.updateMatrixWorld(true);

    const saved = localStorage.getItem(`lofi_pos_${this.sceneMode}_${name}`);
    if (saved) {
      try {
        const { x, y, z, rY } = JSON.parse(saved);
        obj.position.set(x, y, z);
        if (rY !== undefined) obj.rotation.y = rY;
        obj.updateMatrixWorld(true);

        // Restore headphone rotation based on proximity to hook
        if (name === 'headphones') {
          const hookPos = new THREE.Vector3(16.6, 4.9, -5);
          const dist2D = Math.sqrt(Math.pow(x - hookPos.x, 2) + Math.pow(z - hookPos.z, 2));
          if (dist2D > 1.0) {
            obj.rotation.set(0, 0, 0);
          } else {
            obj.rotation.set(0, Math.PI / 2, 0);
          }
          obj.updateMatrixWorld(true);
        }
      } catch (e) {
        console.error('Failed to load position', e);
      }
    } else {
      // Find empty spot dynamically
      this.resolveOverlap(obj);
    }

    // Check and apply stand state
    const savedStand = localStorage.getItem(`lofi_stand_${this.sceneMode}_${name}`);
    if (savedStand) {
      obj.userData.hasStand = JSON.parse(savedStand);
      this.applySynthStand(obj, obj.userData.hasStand);
    }

    // Check and apply rotation state
    const savedRot = localStorage.getItem(`lofi_rot_${this.sceneMode}_${name}`);
    if (savedRot) {
      const rot = parseFloat(savedRot);
      if (!isNaN(rot)) {
        obj.userData.rotationY = rot;
        obj.rotation.y = rot;
        obj.updateMatrixWorld(true);
      }
    }

    // Always ensure synths are flush on a surface on load, 
    // fixing any bad cached Y coordinates from previous bugs.
    if (this.activeGear.includes(name)) {
      this.dropToSurface(obj);
    }

    this.draggableObjects.push(obj);
  }

  private applySynthStand(synth: THREE.Object3D, hasStand: boolean) {
    if (hasStand) {
      const tiltAngle = 0.3; // tilt forward (positive X rotation tilts top towards viewer)

      if (!synth.getObjectByName('standBracketLeft')) {
        // Reset all rotations temporarily to get accurate local dimensions
        const oldRot = synth.rotation.clone();
        synth.rotation.set(0, 0, 0);
        synth.updateMatrixWorld(true);

        const box = new THREE.Box3().setFromObject(synth, true);
        const size = new THREE.Vector3();
        box.getSize(size);

        // Find local Y minimum so we place the top of the bracket perfectly flush
        const worldCenter = new THREE.Vector3();
        box.getCenter(worldCenter);
        const bottomWorld = new THREE.Vector3(worldCenter.x, box.min.y, worldCenter.z);
        const bottomLocal = synth.worldToLocal(bottomWorld);
        const localMinY = bottomLocal.y;

        // Restore original rotation and apply tilt
        synth.rotation.copy(oldRot);
        synth.rotation.x = tiltAngle;
        synth.updateMatrixWorld(true);

        // Calculate wedge dimensions so the bottom sits perfectly flat on the desk
        const bracketLength = size.z * 0.8;
        const baseThickness = 0.3; // Extra thickness to clear the synth's front overhang
        const slopeHeight = bracketLength * Math.tan(tiltAngle);
        const backHeight = baseThickness + slopeHeight;

        // Create a wedge: flat top, sloped bottom with a front lip thickness
        const shape = new THREE.Shape();
        shape.moveTo(0, 0); // bottom back
        shape.lineTo(0, backHeight); // top back
        shape.lineTo(bracketLength, backHeight); // top front
        shape.lineTo(bracketLength, backHeight - baseThickness); // bottom front
        shape.lineTo(0, 0);

        const extrudeSettings = { depth: 0.2, bevelEnabled: false };
        const geo = new THREE.ExtrudeGeometry(shape, extrudeSettings);

        // Center the wedge: align top to y=0, center length on origin, center thickness
        geo.translate(-bracketLength / 2, -backHeight, -0.1);
        geo.rotateY(-Math.PI / 2);
        geo.computeBoundingBox();
        geo.computeBoundingSphere();

        const mat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.8 });

        // Place brackets on the left and right underside of the synth
        // We use localMinY to get to the true bottom of the synth mesh.

        const bracketL = new THREE.Mesh(geo, mat);
        bracketL.name = 'standBracketLeft';
        bracketL.position.set(-size.x / 2 + 0.5, localMinY, 0);
        synth.add(bracketL);

        const bracketR = new THREE.Mesh(geo, mat);
        bracketR.name = 'standBracketRight';
        bracketR.position.set(size.x / 2 - 0.5, localMinY, 0);
        synth.add(bracketR);
      }
      // Ensure rotation order prevents roll when panning
      synth.rotation.order = 'YXZ';
    } else {
      synth.rotation.x = 0;
      const bracketL = synth.getObjectByName('standBracketLeft');
      const bracketR = synth.getObjectByName('standBracketRight');
      if (bracketL) {
        bracketL.removeFromParent();
      }
      if (bracketR) {
        bracketR.removeFromParent();
      }
    }
  }

  private applySynthRotation(synth: THREE.Object3D, rotationY: number) {
    synth.rotation.y = rotationY;
    synth.updateMatrixWorld(true);
  }

  private closeConfigPanel() {
    if (this.configPanelObj) {
      if (this.configPanelObj.parent) {
        this.configPanelObj.parent.remove(this.configPanelObj);
      }
      this.configPanelObj = null;
    }
    this.activeConfigDevice = null;
    this.requestUpdate();
  }

  private openConfigPanel() {
    if (!this.hoveredSynth) return;

    // Close existing if any
    this.closeConfigPanel();

    this.activeConfigDevice = this.hoveredSynth;
    const name = this.activeConfigDevice.name;

    // Create DOM element for config
    const panelDiv = document.createElement('div');
    panelDiv.className = 'config-panel';

    // Disable interactions propagating to OrbitControls
    panelDiv.addEventListener('pointerdown', (e) => e.stopPropagation());
    panelDiv.addEventListener('wheel', (e) => e.stopPropagation());
    panelDiv.addEventListener('pointermove', (e) => e.stopPropagation());

    // Header
    const title = document.createElement('h3');
    title.innerText = name.replace('_', ' ');
    panelDiv.appendChild(title);

    // Rotation Slider
    const rotRow = document.createElement('div');
    rotRow.className = 'config-row';
    const rotLabel = document.createElement('label');
    rotLabel.innerText = 'Rotation';
    const rotSlider = document.createElement('input');
    rotSlider.type = 'range';
    rotSlider.min = '-180';
    rotSlider.max = '180';
    rotSlider.step = '1';

    const currentRot = this.activeConfigDevice.userData.rotationY || 0;
    rotSlider.value = (currentRot * (180 / Math.PI)).toString();

    rotSlider.addEventListener('input', (e) => {
      if (!this.activeConfigDevice) return;
      let deg = parseFloat((e.target as HTMLInputElement).value);

      // Snap to common angles (detents)
      const snapAngles = [0, 90, -90, 180, -180];
      for (const angle of snapAngles) {
        if (Math.abs(deg - angle) < 12) {
          deg = angle;
          (e.target as HTMLInputElement).value = angle.toString();
          break;
        }
      }

      const rad = deg * (Math.PI / 180);
      this.activeConfigDevice.userData.rotationY = rad;
      localStorage.setItem(`lofi_rot_${this.sceneMode}_${name}`, rad.toString());
      this.applySynthRotation(this.activeConfigDevice, rad);
    });

    rotRow.appendChild(rotLabel);
    rotRow.appendChild(rotSlider);
    panelDiv.appendChild(rotRow);

    // Stand Toggle
    const standRow = document.createElement('div');
    standRow.className = 'config-row';
    const standLabel = document.createElement('label');
    standLabel.innerText = 'Stand';
    const standToggle = document.createElement('input');
    standToggle.type = 'checkbox';
    standToggle.checked = !!this.activeConfigDevice.userData.hasStand;

    standLabel.prepend(standToggle);
    standRow.appendChild(standLabel);

    standToggle.addEventListener('change', (e) => {
      if (!this.activeConfigDevice) return;
      const checked = (e.target as HTMLInputElement).checked;
      this.activeConfigDevice.userData.hasStand = checked;
      localStorage.setItem(`lofi_stand_${this.sceneMode}_${name}`, JSON.stringify(checked));
      this.applySynthStand(this.activeConfigDevice, checked);
      this.dropToSurface(this.activeConfigDevice);
    });

    panelDiv.appendChild(standRow);

    // Location Toggle Button
    const locRow = document.createElement('div');
    locRow.className = 'config-row';
    locRow.style.justifyContent = 'center';
    locRow.style.marginTop = '8px';
    const locBtn = document.createElement('button');
    locBtn.className = 'config-btn';

    const isOnDesk = this.activeGear.includes(name);
    locBtn.innerText = isOnDesk ? 'Put on Shelf' : 'Put on Desk';

    locBtn.addEventListener('click', () => {
      this.dispatchEvent(new CustomEvent('toggle-gear', {
        detail: { gear: name },
        bubbles: true,
        composed: true
      }));
      this.closeConfigPanel();
    });

    locRow.appendChild(locBtn);
    panelDiv.appendChild(locRow);

    this.configPanelObj = new CSS3DObject(panelDiv);
    // Scale it down to fit the diorama scale properly
    this.configPanelObj.scale.set(0.035, 0.035, 0.035);

    // Add to scene instead of device so it doesn't spin when the device rotates
    this.scene.add(this.configPanelObj);

    this.requestUpdate();
  }

  private resolveOverlap(obj: THREE.Object3D) {
    const box = new THREE.Box3().setFromObject(obj, true);
    let radius = 0;
    let angle = 0;
    const defaultX = obj.position.x;
    const defaultZ = obj.position.z;

    const allColliders = [...this.draggableObjects, ...this.clickableObjects, ...this.staticCollisionObjects];
    let overlapping = true;
    let attempts = 0;

    while (overlapping && attempts < 100) {
      overlapping = false;
      for (const other of allColliders) {
        if (other !== obj && other.visible) {
          other.updateMatrixWorld(true);
          const otherBox = new THREE.Box3().setFromObject(other, true);
          // Shrink slightly to avoid false positives from touching edges
          otherBox.expandByScalar(-0.1);
          box.expandByScalar(-0.1);

          if (box.intersectsBox(otherBox)) {
            overlapping = true;
            box.expandByScalar(0.1);
            break;
          }
          box.expandByScalar(0.1);
        }
      }

      if (overlapping) {
        attempts++;
        radius += 0.2; // Expand search radius
        angle += 1.0;  // Rotate search direction
        obj.position.x = defaultX + Math.cos(angle) * radius;
        obj.position.z = defaultZ + Math.sin(angle) * radius;
        obj.updateMatrixWorld(true);
        box.setFromObject(obj, true);
      }
    }
  }

  private saveLayout() {
    for (const obj of this.draggableObjects) {
      if (obj.name) {
        const data: any = {
          x: obj.position.x,
          y: obj.position.y,
          z: obj.position.z,
          rY: obj.rotation.y
        };
        if (obj.userData.isPoster) {
          data.wall = obj.userData.wall;
        }
        localStorage.setItem(`lofi_pos_${this.sceneMode}_${obj.name}`, JSON.stringify(data));
      }
    }
  }

  private updateGear() {
    if (!this.gearGroup) return;

    // Clear old gear
    this.draggableObjects = this.draggableObjects.filter(obj => !this.gearGroup.children.includes(obj));
    this.shelfObjects = [];
    this.gearGroup.clear();
    this.tapeSpools = [];
    this.circuitPads = [];

    this.buildPolyend(this.activeGear.includes('polyend'));
    this.buildCircuitTracks(this.activeGear.includes('circuit_tracks'));
    this.buildMood(this.activeGear.includes('mood'));
    this.buildBlooper(this.activeGear.includes('blooper'));
    this.buildGenerationLoss(this.activeGear.includes('generation_loss'));
    this.buildSP404(this.activeGear.includes('sp404'));
    this.buildStrat(this.activeGear.includes('strat'));
    this.buildM8(this.activeGear.includes('m8'));

    // Update poster visibility
    this.posters.forEach(poster => {
      poster.visible = this.activeGear.includes(poster.name);
    });
    // Update rug visibility
    this.rugs.forEach(rug => {
      rug.visible = this.activeGear.includes(rug.name);
    });
    if (this.clutterGroup) {
      const clutterItems = ['lamp', 'cup', 'headphones', 'succulent_echeveria', 'succulent_moonstones', 'succulent_haworthia', 'succulent_pearls', 'succulent_jade'];
      this.clutterGroup.children.forEach(child => {
        if (clutterItems.includes(child.name)) {
          child.visible = this.activeGear.includes(child.name);
        }
      });
    }
  }

  private buildPolyend(isActive: boolean) {
    this.trackerScreen = new TrackerScreen();
    const textureLoader = new THREE.TextureLoader();
    const topTex = textureLoader.load(import.meta.env.BASE_URL + 'tracker_ref.png');
    topTex.colorSpace = THREE.SRGBColorSpace;
    // Crop white border out using UVs
    topTex.repeat.set(0.85, 0.85); // Zoom in 15%
    topTex.offset.set(0.075, 0.075); // Shift to center

    const sideMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.8 });
    const topMat = new THREE.MeshStandardMaterial({
      map: topTex,
      roughness: 0.3,
      metalness: 0.1
    });

    // Box faces: right, left, top, bottom, front, back
    const trackerMats = [sideMat, sideMat, topMat, sideMat, sideMat, sideMat];

    const tSize = GET_GEAR_SIZE(282, 207, 33); // 28.2 cm W x 20.7 cm D x 3.3 cm H
    const trackerBody = new THREE.Mesh(new THREE.BoxGeometry(tSize.w, tSize.h, tSize.d), trackerMats);
    trackerBody.name = 'polyend';
    trackerBody.castShadow = true;
    trackerBody.receiveShadow = true;

    if (isActive) {
      trackerBody.rotation.y = 0.05;
      this.loadOrPlaceObject(trackerBody, 'polyend', -3.5, 6.47, -8);
    } else {
      trackerBody.position.set(-21, 18.06, -7.5); // Shelf slot, facing out
      trackerBody.rotation.set(Math.PI / 2, 0.15, -Math.PI / 2);
      this.shelfObjects.push(trackerBody);
    }

    // Tracker Screen Overlay (Dynamic)
    const screenMat = new THREE.MeshStandardMaterial({
      map: this.trackerScreen.texture,
      emissiveMap: this.trackerScreen.texture,
      emissive: 0xffffff,
      emissiveIntensity: 1.5,
      transparent: true,
      opacity: 0.85
    });

    const wFactor = tSize.w / 8.5;
    const dFactor = tSize.d / 6.2;
    const screenOverlay = new THREE.Mesh(new THREE.PlaneGeometry(3.6 * wFactor, 2.0 * dFactor), screenMat);
    screenOverlay.rotation.x = -Math.PI / 2;
    // Positioned over the screen area in the photo
    screenOverlay.position.set(-1.8 * wFactor, tSize.h / 2 + 0.002, -1.2 * dFactor);
    trackerBody.add(screenOverlay);

    this.gearGroup.add(trackerBody);
  }

  private buildCircuitTracks(isActive: boolean) {
    const textureLoader = new THREE.TextureLoader();
    const topTex = textureLoader.load(import.meta.env.BASE_URL + 'circuit_ref.png');
    topTex.colorSpace = THREE.SRGBColorSpace;
    // Crop white border out using UVs
    topTex.repeat.set(0.85, 0.85); // Zoom in 15%
    topTex.offset.set(0.075, 0.075); // Shift to center

    const sideMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.8, metalness: 0.2 });
    const topMat = new THREE.MeshStandardMaterial({
      map: topTex,
      roughness: 0.3,
      metalness: 0.1
    });

    const ctMats = [sideMat, sideMat, topMat, sideMat, sideMat, sideMat];
    const ctSize = GET_GEAR_SIZE(240, 210, 30); // 24.0 cm W x 21.0 cm D x 3.0 cm H
    const ctBody = new THREE.Mesh(new THREE.BoxGeometry(ctSize.w, ctSize.h, ctSize.d), ctMats);
    ctBody.name = 'circuit_tracks';
    ctBody.castShadow = true;
    ctBody.receiveShadow = true;

    if (isActive) {
      ctBody.rotation.y = -0.08;
      this.loadOrPlaceObject(ctBody, 'circuit_tracks', 3.5, 6.43, -4);
    } else {
      ctBody.position.set(-21, 18.09, -2.5); // Shelf slot, facing out
      ctBody.rotation.set(Math.PI / 2, 0.15, -Math.PI / 2);
      this.shelfObjects.push(ctBody);
    }

    // Circuit Tracks Pads Overlay (Dynamic Additive Blending)
    const padMatBase = new THREE.MeshStandardMaterial({
      color: 0x000000,
      emissive: 0x000000,
      transparent: true,
      opacity: 0.7,
      blending: THREE.AdditiveBlending
    });

    const wFactor = ctSize.w / 5.5;
    const dFactor = ctSize.d / 5.1;

    // Pads (4x8 Grid)
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 8; col++) {
        // Clone material so each pad animates uniquely
        const padOverlay = new THREE.Mesh(new THREE.PlaneGeometry(0.5 * wFactor, 0.42 * dFactor), padMatBase.clone());
        padOverlay.rotation.x = -Math.PI / 2;
        // Positioned perfectly over the bottom half pad grid
        padOverlay.position.set((-1.925 + col * 0.55) * wFactor, ctSize.h / 2 + 0.002, (0.14 + row * 0.58) * dFactor);
        if (isActive) {
          this.circuitPads.push(padOverlay); // Adds back dynamic lighting capability
        }
        ctBody.add(padOverlay);
      }
    }
    this.gearGroup.add(ctBody);
  }

  private buildMood(isActive: boolean) {
    const pGroup = this.buildBasePedal(isActive, 0xffa07a, -7.5, -5, 0.1, 'mood', import.meta.env.BASE_URL + 'mood_texture.png', -7.5); // Salmon Peach
    this.gearGroup.add(pGroup);
  }

  private buildBlooper(isActive: boolean) {
    const pGroup = this.buildBasePedal(isActive, 0xa4c8e1, -9.5, -5, -0.05, 'blooper', import.meta.env.BASE_URL + 'blooper_texture.png', -5); // Pastel Blue
    this.gearGroup.add(pGroup);
  }

  private buildGenerationLoss(isActive: boolean) {
    const pGroup = this.buildBasePedal(isActive, 0x6e90a6, -11.5, -5, 0.05, 'generation_loss', import.meta.env.BASE_URL + 'generation_loss_texture.png', -2.5); // Slate Blue/Grey
    this.gearGroup.add(pGroup);
  }

  private buildBasePedal(isActive: boolean, colorHex: number, x: number, z: number, rotY: number, name: string, topTexturePath: string | undefined, shelfZ: number) {
    const pedal = new THREE.Group();
    pedal.name = name;

    if (isActive) {
      pedal.rotation.y = rotY;
      this.loadOrPlaceObject(pedal, name, x, 6.86, z); // Sits exactly on the desk (Y=6.0)
    } else {
      pedal.position.set(-21, 12.81, shelfZ); // Lower shelf, facing out
      pedal.rotation.set(Math.PI / 2, 0.15, -Math.PI / 2);
      this.shelfObjects.push(pedal);
    }

    const pSize = GET_GEAR_SIZE(64, 124, 60); // 64mm W x 124mm D x 60mm H
    const sideMat = new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.3, metalness: 0.4 });
    let bodyMat: THREE.Material | THREE.Material[] = sideMat;

    if (topTexturePath) {
      const textureLoader = new THREE.TextureLoader();
      const topTex = textureLoader.load(topTexturePath);
      topTex.colorSpace = THREE.SRGBColorSpace;

      // Let's set some default cropping for Chase Bliss pedal texture (which has grey margins).
      // Zooming in slightly and centering crops out the jacks and background border:
      topTex.repeat.set(0.92, 0.95);
      topTex.offset.set(0.04, 0.025);

      const topMat = new THREE.MeshStandardMaterial({
        map: topTex,
        roughness: 0.25,
        metalness: 0.3
      });
      // Box faces order: right, left, top, bottom, front, back
      bodyMat = [sideMat, sideMat, topMat, sideMat, sideMat, sideMat];
    }

    const body = new THREE.Mesh(new THREE.BoxGeometry(pSize.w, pSize.h, pSize.d), bodyMat);
    body.castShadow = true;
    body.receiveShadow = true;
    pedal.add(body);

    const wFactor = pSize.w / 2;
    const dFactor = pSize.d / 3;
    const hFactor = pSize.h / 1.2;

    // Silver metallic knobs
    const knobMat = new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0.8, roughness: 0.3 });
    for (let i = 0; i < 3; i++) {
      const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.2 * wFactor, 0.2 * wFactor, 0.25 * hFactor, 16), knobMat);
      knob.position.set((-0.6 + i * 0.6) * wFactor, pSize.h / 2 + 0.125 * hFactor, -1.0 * dFactor);
      pedal.add(knob);
    }
    for (let i = 0; i < 3; i++) {
      const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.2 * wFactor, 0.2 * wFactor, 0.25 * hFactor, 16), knobMat);
      knob.position.set((-0.6 + i * 0.6) * wFactor, pSize.h / 2 + 0.125 * hFactor, -0.4 * dFactor);
      pedal.add(knob);
    }

    // 3 small toggle switches
    const toggleMat = new THREE.MeshStandardMaterial({ color: 0xeeeeee, metalness: 1.0 });
    for (let i = 0; i < 3; i++) {
      const tog = new THREE.Mesh(new THREE.CylinderGeometry(0.04 * wFactor, 0.04 * wFactor, 0.25 * hFactor), toggleMat);
      tog.position.set((-0.6 + i * 0.6) * wFactor, pSize.h / 2 + 0.125 * hFactor, 0.1 * dFactor);
      pedal.add(tog);
    }

    // Footswitches
    const switchMat = new THREE.MeshStandardMaterial({ color: 0xdddddd, metalness: 0.9, roughness: 0.1 });
    const fs1 = new THREE.Mesh(new THREE.CylinderGeometry(0.18 * wFactor, 0.18 * wFactor, 0.3 * hFactor, 16), switchMat);
    fs1.position.set(-0.6 * wFactor, pSize.h / 2 + 0.15 * hFactor, 1.15 * dFactor);
    pedal.add(fs1);

    const fs2 = new THREE.Mesh(new THREE.CylinderGeometry(0.18 * wFactor, 0.18 * wFactor, 0.3 * hFactor, 16), switchMat);
    fs2.position.set(0.6 * wFactor, pSize.h / 2 + 0.15 * hFactor, 1.15 * dFactor);
    pedal.add(fs2);

    return pedal;
  }



  private buildSP404(isActive: boolean) {
    const textureLoader = new THREE.TextureLoader();
    const topTex = textureLoader.load(import.meta.env.BASE_URL + 'sp404_ref.png');
    topTex.colorSpace = THREE.SRGBColorSpace;
    // Crop white border out using UVs
    topTex.repeat.set(0.82, 0.82); // Zoom in 18%
    topTex.offset.set(0.09, 0.09); // Shift to center

    const sideMat = new THREE.MeshStandardMaterial({ color: 0x1f1f1f, roughness: 0.6, metalness: 0.4 });
    const topMat = new THREE.MeshStandardMaterial({
      map: topTex,
      roughness: 0.3,
      metalness: 0.1
    });

    const spMats = [sideMat, sideMat, topMat, sideMat, sideMat, sideMat];
    // Adjusted dimensions to match SP-404 aspect ratio
    const spSize = GET_GEAR_SIZE(177.5, 275.8, 70.5); // 17.75 cm W x 27.58 cm D x 7.05 cm H
    const spBody = new THREE.Mesh(new THREE.BoxGeometry(spSize.w, spSize.h, spSize.d), spMats);
    spBody.name = 'sp404';
    spBody.castShadow = true;
    spBody.receiveShadow = true;

    if (isActive) {
      spBody.rotation.y = -0.03;
      this.loadOrPlaceObject(spBody, 'sp404', -3.5, 7.0, -2.5);
    } else {
      spBody.position.set(-21, 18.68, 2.5); // Shelf slot, facing out
      spBody.rotation.set(Math.PI / 2, 0.15, -Math.PI / 2);
      this.shelfObjects.push(spBody);
    }

    // SP-404 Pads Overlay (Dynamic Additive Blending)
    const padMatBase = new THREE.MeshStandardMaterial({
      color: 0x000000,
      emissive: 0x000000,
      transparent: true,
      opacity: 0.7,
      blending: THREE.AdditiveBlending
    });

    const wFactor = spSize.w / 4.5;
    const dFactor = spSize.d / 7.0;

    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 4; col++) {
        // Clone material so each pad animates uniquely
        const padOverlay = new THREE.Mesh(new THREE.PlaneGeometry(0.7 * wFactor, 0.55 * dFactor), padMatBase.clone());
        padOverlay.rotation.x = -Math.PI / 2;
        padOverlay.position.set((-1.35 + col * 0.9) * wFactor, spSize.h / 2 + 0.002, (0.5 + row * 0.7) * dFactor);
        if (isActive) {
          this.circuitPads.push(padOverlay); // Add back dynamic lighting capability
        }
        spBody.add(padOverlay);
      }
    }

    this.gearGroup.add(spBody);
  }

  private stratModel: THREE.Group | null = null;
  private stratLoading = false;

  private buildM8(isActive: boolean) {
    const m8Group = new THREE.Group();
    m8Group.name = 'm8';

    if (isActive) {
      m8Group.rotation.y = 0.15;
      this.loadOrPlaceObject(m8Group, 'm8', -8.5, 6.43, -2.5);
    } else {
      m8Group.position.set(-21, 12.9, -10); // Lower shelf, facing out
      m8Group.rotation.set(Math.PI / 2, 0.15, -Math.PI / 2);
      this.shelfObjects.push(m8Group);
    }

    // M8 Dimensions: 96mm × 133mm × 20mm
    const mSize = GET_GEAR_SIZE(96, 133, 20);
    const wFactor = mSize.w;
    const dFactor = mSize.d;
    const hFactor = mSize.h;

    // Main Body
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x18181a, roughness: 0.8, metalness: 0.2 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(wFactor, hFactor, dFactor), bodyMat);
    body.castShadow = true;
    body.receiveShadow = true;
    m8Group.add(body);

    // Screen Base
    const screenW = wFactor * 0.90;
    const screenD = dFactor * 0.44;
    const screenMat = new THREE.MeshStandardMaterial({ color: 0x050508, roughness: 0.2, metalness: 0.8 });
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(screenW, screenD), screenMat);
    screen.rotation.x = -Math.PI / 2;
    screen.position.set(0, hFactor / 2 + 0.001, -dFactor * 0.23);
    m8Group.add(screen);

    // Screen UI (Dynamic Canvas)
    this.m8Screen = new M8Screen();
    const uiMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0xffffff,
      emissiveIntensity: 1.0,
      map: this.m8Screen.texture,
      emissiveMap: this.m8Screen.texture,
      transparent: true,
      opacity: 0.9,
    });
    const uiMesh = new THREE.Mesh(new THREE.PlaneGeometry(screenW, screenD), uiMat);
    uiMesh.rotation.x = -Math.PI / 2;
    uiMesh.position.set(0, hFactor / 2 + 0.002, -dFactor * 0.23);
    m8Group.add(uiMesh);

    // M8 Logo
    const logoCanvas = document.createElement('canvas');
    logoCanvas.width = 128;
    logoCanvas.height = 64;
    const lctx = logoCanvas.getContext('2d')!;
    lctx.fillStyle = '#ffffff';
    lctx.font = 'bold 44px "Arial", sans-serif';
    lctx.fillText('M8', 30, 55);
    lctx.fillRect(30, 10, 22, 10);
    lctx.fillRect(56, 10, 22, 10);
    const logoTex = new THREE.CanvasTexture(logoCanvas);
    const logoMat = new THREE.MeshStandardMaterial({
      map: logoTex,
      transparent: true,
      roughness: 0.8,
      metalness: 0.1
    });
    const logoMesh = new THREE.Mesh(new THREE.PlaneGeometry(wFactor * 0.20, wFactor * 0.10), logoMat);
    logoMesh.rotation.x = -Math.PI / 2;
    logoMesh.position.set(-0.35 * wFactor, hFactor / 2 + 0.001, 0.08 * dFactor);
    m8Group.add(logoMesh);

    // Keys
    const keyMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.7, metalness: 0.1 });
    const kw = wFactor * 0.16;
    const kd = dFactor * 0.115;
    const kh = hFactor * 0.25;
    const keyGeo = new THREE.BoxGeometry(kw, kh, kd);

    // Grid: 5 columns, 3 rows
    const colX = [-0.36, -0.18, 0.00, 0.18, 0.36];
    const rowZ = [0.09, 0.23, 0.39];

    const keyPositions = [
      { x: colX[1], z: rowZ[0] }, // UP
      { x: colX[3], z: rowZ[0] }, // OPT
      { x: colX[4], z: rowZ[0] }, // EDIT
      { x: colX[0], z: rowZ[1] }, // LT
      { x: colX[1], z: rowZ[1] }, // DN
      { x: colX[2], z: rowZ[1] }, // RT
      { x: colX[1], z: rowZ[2] }, // SHIFT
      { x: colX[2], z: rowZ[2] }, // PLAY
    ];

    keyPositions.forEach(pos => {
      const key = new THREE.Mesh(keyGeo, keyMat);
      key.position.set(pos.x * wFactor, hFactor / 2 + kh / 2, pos.z * dFactor);
      key.castShadow = true;
      m8Group.add(key);
    });

    // Speaker Grills
    const grillMat = new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.9 });
    const grillGeo = new THREE.PlaneGeometry(kw * 0.7, kd * 1.2);

    const leftGrill = new THREE.Mesh(grillGeo, grillMat);
    leftGrill.rotation.x = -Math.PI / 2;
    leftGrill.position.set(colX[0] * wFactor, hFactor / 2 + 0.001, rowZ[2] * dFactor);
    m8Group.add(leftGrill);

    const rightGrill = new THREE.Mesh(grillGeo, grillMat);
    rightGrill.rotation.x = -Math.PI / 2;
    rightGrill.position.set(colX[4] * wFactor, hFactor / 2 + 0.001, rowZ[2] * dFactor);
    m8Group.add(rightGrill);

    this.gearGroup.add(m8Group);
  }

  private buildStrat(isActive: boolean) {
    // Prevent duplicate loading from hot-reloads or fast property changes
    if (this.stratModel) {
      if (!this.gearGroup.children.includes(this.stratModel)) {
        this.stratModel.name = 'strat';
        if (isActive) {
          this.loadOrPlaceObject(this.stratModel, 'strat', -14, 12, -5);
        } else {
          this.stratModel.position.set(-20, 12, 10);
          this.stratModel.rotation.set(-0.2, Math.PI / 2, 0);
          this.shelfObjects.push(this.stratModel);
        }
        this.gearGroup.add(this.stratModel);
      }
      return;
    }
    if (this.stratLoading) return;
    this.stratLoading = true;

    const loader = new FBXLoader();
    loader.load(import.meta.env.BASE_URL + 'guitar/stratocaster.FBX', (object) => {
      this.stratLoading = false;

      // Normalize scale (950mm real world length)
      const targetLength = 950 * MM_TO_UNITS;
      const box = new THREE.Box3().setFromObject(object);
      const size = box.getSize(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z);

      const scale = targetLength / maxDim;
      object.scale.setScalar(scale);

      // Center the object geometry relative to its pivot
      box.setFromObject(object);
      const center = box.getCenter(new THREE.Vector3());
      object.position.sub(center);

      const stratGroup = new THREE.Group();
      stratGroup.add(object);

      object.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          const mesh = child as THREE.Mesh;
          mesh.castShadow = true;
          mesh.receiveShadow = true;

          if (mesh.material) {
            const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
            materials.forEach((mat: any) => {
              if (mat.color) {
                const hsl = { h: 0, s: 0, l: 0 };
                mat.color.getHSL(hsl);

                if (!mat.map) {
                  // Dark parts -> Body (Birch Green, High Gloss Polyurethane)
                  if (hsl.l < 0.15) {
                    mat.color.setHex(0xccddcc);
                    mat.metalness = 0.1;
                    mat.roughness = 0.15;
                  }
                  // White parts -> Pickguard (Glossy Plastic)
                  else if (hsl.s < 0.1 && hsl.l > 0.6) {
                    mat.metalness = 0.05;
                    mat.roughness = 0.3;
                  }
                  // Grey parts -> Hardware, Bridge, Tuners (Chrome)
                  else if (hsl.s < 0.1 && hsl.l >= 0.15 && hsl.l <= 0.6) {
                    mat.metalness = 0.9;
                    mat.roughness = 0.2;
                  }
                } else {
                  // Textured parts (e.g. Wood Neck) shouldn't be too shiny
                  mat.roughness = 0.6;
                  mat.metalness = 0.05;
                }
              }
            });
          }
        }
      });

      // Leaning against left wall if active, otherwise leaning near shelf
      if (isActive) {
        stratGroup.rotation.x = -0.2;
        stratGroup.rotation.y = 0.6;
        stratGroup.rotation.z = -0.15;
        this.loadOrPlaceObject(stratGroup, 'strat', -14, 12, -5);
      } else {
        stratGroup.rotation.set(-0.2, Math.PI / 2, 0);
        stratGroup.position.set(-20, 12, 10);
        this.shelfObjects.push(stratGroup);
      }

      this.stratModel = stratGroup;
      this.gearGroup.add(stratGroup);
    }, undefined, (error) => {
      this.stratLoading = false;
      console.error('Error loading stratocaster model:', error);
    });
  }

  private buildClutter() {
    this.clickableObjects = []; // Reset on rebuild

    // Desk lamp — left side
    const lampGroup = new THREE.Group();
    const brassMat = new THREE.MeshStandardMaterial({ color: 0xb5a642, metalness: 0.8, roughness: 0.2 });

    const lampBase = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.0, 0.3, 32), brassMat);
    lampBase.position.set(0, 0.15, 0);
    lampBase.castShadow = true;
    lampGroup.add(lampBase);

    const lampArm = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 6, 8), brassMat);
    lampArm.position.set(0, 3.15, 0);
    lampArm.rotation.z = -0.15;
    lampArm.castShadow = true;
    lampGroup.add(lampArm);

    const lampHead = new THREE.Mesh(new THREE.ConeGeometry(1.2, 1.8, 32), brassMat);
    lampHead.position.set(0.5, 6.15, 0);
    lampHead.rotation.z = Math.PI + 0.3;
    lampHead.castShadow = true;
    lampGroup.add(lampHead);

    const bulbMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffcc77, emissiveIntensity: 2.0 });
    this.lampBulb = new THREE.Mesh(new THREE.SphereGeometry(0.4, 16, 16), bulbMat);
    this.lampBulb.position.set(0.5, 5.15, 0);
    lampGroup.add(this.lampBulb);

    if (this.deskLight) {
      this.deskLight.position.set(0.5, 6.15, 2); // Position relative to lamp head
      lampGroup.add(this.deskLight);
    }

    lampGroup.visible = this.activeGear.includes('lamp');
    lampGroup.name = 'lamp';
    this.clutterGroup.add(lampGroup);
    this.loadOrPlaceObject(lampGroup, 'lamp', -8.5, 6.0, -11);

    // Coffee mug
    const mugGroup = new THREE.Group();
    const mugMat = new THREE.MeshStandardMaterial({ color: 0xf0f0f0, roughness: 0.3 });
    const mug = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.4, 1.0, 32), mugMat);
    mug.position.set(0, 0.5, 0);
    mug.castShadow = true;
    mugGroup.add(mug);

    const coffeeMat = new THREE.MeshStandardMaterial({ color: 0x3a2010, roughness: 0.2 });
    const coffee = new THREE.Mesh(new THREE.CircleGeometry(0.45, 32), coffeeMat);
    coffee.rotation.x = -Math.PI / 2;
    coffee.position.set(0, 1.0, 0);
    mugGroup.add(coffee);

    mugGroup.visible = this.activeGear.includes('cup');
    mugGroup.name = 'cup';
    this.clutterGroup.add(mugGroup);
    this.loadOrPlaceObject(mugGroup, 'mug', -7.5, 6.0, -3);

    // Helper to make a standard pot and soil
    const createPot = () => {
      const group = new THREE.Group();
      const potMat = new THREE.MeshStandardMaterial({ color: 0xf5f5dc, roughness: 0.7 });
      const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.5, 0.6, 24), potMat);
      pot.position.set(0, 0.3, 0);
      pot.castShadow = true;
      group.add(pot);

      // Lighter, warmer brown so it doesn't look black
      const soilMat = new THREE.MeshStandardMaterial({ color: 0x5a3a22, roughness: 1.0 });
      // Using a cylinder for soil gives it volume and completely stops z-fighting with the pot's top face
      const soil = new THREE.Mesh(new THREE.CylinderGeometry(0.66, 0.66, 0.05, 24), soilMat);
      soil.position.set(0, 0.61, 0);
      soil.receiveShadow = true;
      group.add(soil);
      return group;
    };

    // 1. Echeveria (Mint Green Rosette)
    const echevGroup = createPot();
    const mintMat = new THREE.MeshStandardMaterial({ color: 0x88d49e, roughness: 0.6 });
    for (let i = 0; i < 6; i++) {
      const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.25, 12, 12), mintMat);
      leaf.scale.set(1, 0.3, 1.5);
      const angle = (i / 6) * Math.PI * 2;
      leaf.position.set(Math.cos(angle) * 0.25, 0.7, Math.sin(angle) * 0.25);
      leaf.rotation.y = -angle;
      leaf.rotation.x = 0.4;
      leaf.castShadow = true;
      echevGroup.add(leaf);
    }
    const mintCenter = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 12), mintMat);
    mintCenter.scale.set(1, 0.5, 1);
    mintCenter.position.set(0, 0.75, 0);
    echevGroup.add(mintCenter);
    echevGroup.visible = this.activeGear.includes('succulent_echeveria');
    this.clutterGroup.add(echevGroup);
    this.loadOrPlaceObject(echevGroup, 'succulent_echeveria', 10.0, 6.0, -6);

    // 2. Moonstones (Pink Chubby)
    const moonGroup = createPot();
    const pinkMat = new THREE.MeshStandardMaterial({ color: 0xff6b81, roughness: 0.5 });
    for (let i = 0; i < 5; i++) {
      const chubby = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 12), pinkMat);
      chubby.scale.set(0.9, 1.1, 0.9);
      const angle = (i / 5) * Math.PI * 2;
      chubby.position.set(Math.cos(angle) * 0.2, 0.75, Math.sin(angle) * 0.2);
      chubby.rotation.x = Math.cos(angle) * 0.3;
      chubby.rotation.z = Math.sin(angle) * 0.3;
      chubby.castShadow = true;
      moonGroup.add(chubby);
    }
    moonGroup.visible = this.activeGear.includes('succulent_moonstones');
    this.clutterGroup.add(moonGroup);
    this.loadOrPlaceObject(moonGroup, 'succulent_moonstones', 11.5, 6.0, -6);

    // 3. Haworthia (Purple Spiky)
    const hawGroup = createPot();
    const purpleMat = new THREE.MeshStandardMaterial({ color: 0xa29bfe, roughness: 0.4 });
    for (let i = 0; i < 5; i++) {
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.7, 6), purpleMat);
      const angle = (i / 5) * Math.PI * 2;
      spike.position.set(Math.cos(angle) * 0.15, 0.85, Math.sin(angle) * 0.15);
      spike.rotation.x = Math.sin(angle) * 0.2;
      spike.rotation.z = -Math.cos(angle) * 0.2;
      spike.castShadow = true;
      hawGroup.add(spike);
    }
    hawGroup.visible = this.activeGear.includes('succulent_haworthia');
    this.clutterGroup.add(hawGroup);
    this.loadOrPlaceObject(hawGroup, 'succulent_haworthia', 10.0, 6.0, -4.5);

    // 4. String of Pearls (Cascading green balls)
    const pearlGroup = createPot();
    const pearlMat = new THREE.MeshStandardMaterial({ color: 0x55aa66, roughness: 0.6 });
    for (let j = 0; j < 4; j++) {
      const angle = (j / 4) * Math.PI * 2;
      for (let i = 0; i < 6; i++) {
        const pearl = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 8), pearlMat);
        const dist = 0.3 + (i * 0.15);
        const yDrop = 0.7 - (i * 0.15);
        pearl.position.set(Math.cos(angle) * dist, yDrop, Math.sin(angle) * dist);
        pearl.castShadow = true;
        pearlGroup.add(pearl);
      }
    }
    pearlGroup.visible = this.activeGear.includes('succulent_pearls');
    this.clutterGroup.add(pearlGroup);
    this.loadOrPlaceObject(pearlGroup, 'succulent_pearls', 11.5, 6.0, -4.5);

    // 5. Jade Plant (Tree-like)
    const jadeGroup = createPot();
    const jadeMat = new THREE.MeshStandardMaterial({ color: 0x448844, roughness: 0.5 });
    const stemMat = new THREE.MeshStandardMaterial({ color: 0x887755, roughness: 0.8 });
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.15, 0.8, 8), stemMat);
    stem.position.set(0, 0.9, 0);
    jadeGroup.add(stem);
    for (let i = 0; i < 8; i++) {
      const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 8), jadeMat);
      leaf.scale.set(1, 0.3, 1.2);
      const y = 0.8 + (i * 0.1);
      const angle = i * 2.4; // golden angle approx
      leaf.position.set(Math.cos(angle) * 0.2, y, Math.sin(angle) * 0.2);
      leaf.rotation.y = -angle;
      leaf.rotation.x = 0.2;
      leaf.castShadow = true;
      jadeGroup.add(leaf);
    }
    jadeGroup.visible = this.activeGear.includes('succulent_jade');
    this.clutterGroup.add(jadeGroup);
    this.loadOrPlaceObject(jadeGroup, 'succulent_jade', 10.75, 6.0, -7.5);

    // Headphones on the desk (right side) - Sennheiser HD 280 Pro style
    const hpGroup = new THREE.Group();
    const hpInner = new THREE.Group();
    hpInner.position.z = 0.4; // Offset so they rest on the desk when laid flat
    hpGroup.add(hpInner);

    // Materials
    const plasticMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.7, metalness: 0.1 });
    const padMat = new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.9 });
    const detailMat = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.4, metalness: 0.5 });

    // Headband Core
    const headbandGeo = new THREE.TorusGeometry(1.05, 0.12, 16, 64, Math.PI);
    const headband = new THREE.Mesh(headbandGeo, plasticMat);
    headband.position.set(0, 0.6, 0);
    headband.castShadow = true;
    hpInner.add(headband);

    // Headband Padding
    const paddingGeo = new THREE.TorusGeometry(1.05, 0.22, 16, 64, Math.PI * 0.5);
    const padding = new THREE.Mesh(paddingGeo, padMat);
    padding.rotation.z = Math.PI * 0.25;
    padding.position.set(0, 0.6, 0);
    padding.castShadow = true;
    hpInner.add(padding);

    // Ear Cups (Oval)
    const cupGeo = new THREE.CylinderGeometry(0.4, 0.4, 0.3, 32);
    const earPadGeo = new THREE.TorusGeometry(0.35, 0.15, 16, 32);
    const logoPlateGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.32, 16);

    // Left Cup
    const cupLGroup = new THREE.Group();
    cupLGroup.position.set(-1.1, 0.4, 0);
    cupLGroup.rotation.z = Math.PI / 2 - 0.15; // Angled in

    const cupL = new THREE.Mesh(cupGeo, plasticMat);
    cupL.scale.set(1.4, 1, 1);
    cupL.castShadow = true;
    cupLGroup.add(cupL);

    const padL = new THREE.Mesh(earPadGeo, padMat);
    padL.rotation.x = Math.PI / 2;
    padL.scale.set(1.4, 1, 1);
    padL.position.y = 0.15; // Towards head
    padL.castShadow = true;
    cupLGroup.add(padL);

    const logoPlateL = new THREE.Mesh(logoPlateGeo, detailMat);
    logoPlateL.scale.set(1.4, 1, 1);
    logoPlateL.position.y = -0.05;
    logoPlateL.castShadow = true;
    cupLGroup.add(logoPlateL);

    hpInner.add(cupLGroup);

    // Right Cup
    const cupRGroup = new THREE.Group();
    cupRGroup.position.set(1.1, 0.4, 0);
    cupRGroup.rotation.z = -(Math.PI / 2 - 0.15); // Angled in

    const cupR = new THREE.Mesh(cupGeo, plasticMat);
    cupR.scale.set(1.4, 1, 1);
    cupR.castShadow = true;
    cupRGroup.add(cupR);

    const padR = new THREE.Mesh(earPadGeo, padMat);
    padR.rotation.x = Math.PI / 2;
    padR.scale.set(1.4, 1, 1);
    padR.position.y = 0.15; // Towards head
    padR.castShadow = true;
    cupRGroup.add(padR);

    const logoPlateR = new THREE.Mesh(logoPlateGeo, detailMat);
    logoPlateR.scale.set(1.4, 1, 1);
    logoPlateR.position.y = -0.05;
    logoPlateR.castShadow = true;
    cupRGroup.add(logoPlateR);

    hpInner.add(cupRGroup);

    // Headphone hook on the right side of the desk
    const hookGeo = new THREE.BoxGeometry(1.2, 0.1, 0.6);
    const hookMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.6 });
    const hook = new THREE.Mesh(hookGeo, hookMat);
    hook.position.set(16 + 0.6, 5.8 - 0.2 - 0.05, -5); // right side of desk (16), just below desk surface
    hook.castShadow = true;
    hook.receiveShadow = true;
    this.gearGroup.add(hook);

    // Cable
    const cableGeo = new THREE.CylinderGeometry(0.04, 0.04, 2, 8);
    const cable = new THREE.Mesh(cableGeo, plasticMat);
    cable.position.set(-1.1, -0.6, 0);
    cable.rotation.z = 0.2;
    cable.castShadow = true;
    hpInner.add(cable);

    // Hang vertically on the hook
    hpGroup.rotation.set(0, Math.PI / 2, 0);

    this.gearGroup.add(hpGroup);
    this.loadOrPlaceObject(hpGroup, 'headphones', 16.6, 4.9, -5);

    // Quantum Cube Toy
    this.quantumCube = new QuantumCube();
    this.gearGroup.add(this.quantumCube.sprite);
    this.loadOrPlaceObject(this.quantumCube.sprite, 'quantum_cube', -10, 6.2, 2);
    this.quantumCube.sprite.castShadow = false;
  }



  private buildWindow() {
    // Window frame
    const textureLoader = new THREE.TextureLoader();
    const frameTex = textureLoader.load(import.meta.env.BASE_URL + 'painted_cream_wood.png');
    frameTex.wrapS = THREE.RepeatWrapping;
    frameTex.wrapT = THREE.RepeatWrapping;
    frameTex.repeat.set(2, 2);
    frameTex.colorSpace = THREE.SRGBColorSpace;

    const frameMat = new THREE.MeshStandardMaterial({
      map: frameTex,
      roughness: 0.5
    });

    // Outer frame
    const frameTop = new THREE.Mesh(new THREE.BoxGeometry(16.5, 0.8, 1), frameMat);
    frameTop.position.set(0, 20.4, -19.8);
    this.cosyRoomGroup.add(frameTop);

    const frameBottom = new THREE.Mesh(new THREE.BoxGeometry(16.5, 0.8, 1.5), frameMat);
    frameBottom.position.set(0, 12.0, -19.6);
    this.cosyRoomGroup.add(frameBottom);

    const frameL = new THREE.Mesh(new THREE.BoxGeometry(0.8, 9, 1), frameMat);
    frameL.position.set(-8, 16.2, -19.8);
    this.cosyRoomGroup.add(frameL);

    const frameR = new THREE.Mesh(new THREE.BoxGeometry(0.8, 9, 1), frameMat);
    frameR.position.set(8, 16.2, -19.8);
    this.cosyRoomGroup.add(frameR);

    // Window sill
    const sillMat = new THREE.MeshStandardMaterial({
      map: frameTex,
      roughness: 0.5
    });
    const sill = new THREE.Mesh(new THREE.BoxGeometry(17, 0.4, 2), sillMat);
    sill.position.set(0, 12.4, -19);
    sill.castShadow = true;
    this.cosyRoomGroup.add(sill);
    this.surfaceObjects.push(sill);

    this.staticCollisionObjects.push(frameTop, frameBottom, frameL, frameR, sill);
  }

  private buildWeather() {
    // Stylized Sky Backdrop (behind the window, keeping the diorama contained)
    const skyColor = this.weather === 'sunny' ? 0x87ceeb : 0x6b7b8d;
    this.skyMat = new THREE.MeshBasicMaterial({ color: skyColor, fog: false });
    const skyGeo = new THREE.PlaneGeometry(120, 80);
    const sky = new THREE.Mesh(skyGeo, this.skyMat);
    sky.position.set(0, 15, -35);
    this.cosyRoomGroup.add(sky);

    // Clouds
    const cloudMat = new THREE.MeshBasicMaterial({
      color: this.weather === 'sunny' ? 0xffffff : 0x555566,
      transparent: true, opacity: 0.7
    });

    const cloudPositions = [
      [-6, 18.5, -24], [2, 19, -24], [8, 18, -24],
      [-3, 17.5, -23.5], [6, 19.5, -23.5]
    ];

    for (const pos of cloudPositions) {
      const cloudGroup = new THREE.Group();
      const numPuffs = 3 + Math.floor(Math.random() * 3);
      for (let i = 0; i < numPuffs; i++) {
        const puffSize = 0.6 + Math.random() * 0.8;
        const puff = new THREE.Mesh(new THREE.SphereGeometry(puffSize, 12, 12), cloudMat);
        puff.position.set(i * 0.7 - numPuffs * 0.35, (Math.random() - 0.5) * 0.3, 0);
        puff.scale.y = 0.5;
        cloudGroup.add(puff);
      }
      cloudGroup.position.set(pos[0], pos[1], pos[2]);
      cloudGroup.name = 'cloud';
      this.clouds.push(cloudGroup as unknown as THREE.Mesh);
      this.cosyRoomGroup.add(cloudGroup);
    }

    // Rain particles (hidden if sunny)
    const rainCount = 1000;
    const rainGeo = new THREE.BufferGeometry();
    const rainPositions = new Float32Array(rainCount * 3);
    for (let i = 0; i < rainCount; i++) {
      rainPositions[i * 3] = (Math.random() - 0.5) * 20; // X from -10 to 10
      rainPositions[i * 3 + 1] = Math.random() * 25 - 5;
      rainPositions[i * 3 + 2] = -28.5 + Math.random() * 6; // Z from -28.5 to -22.5 (tight outside window)
    }
    rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPositions, 3));

    const rainMat = new THREE.PointsMaterial({
      color: 0x99aabb,
      size: 0.35,
      transparent: true,
      opacity: 0.9,
    });

    this.rainDrops = new THREE.Points(rainGeo, rainMat);
    this.rainDrops.visible = this.weather === 'rainy' || this.weather === 'thunderstorm';
    this.cosyRoomGroup.add(this.rainDrops);

    // Lightning light
    this.lightningLight = new THREE.PointLight(0xffffff, 0, 250);
    this.lightningLight.position.set(0, 30, -30);
    this.cosyRoomGroup.add(this.lightningLight);

    // Yard (Grass, Fence, Trees) - shrunk to a tiny floating diorama chunk!
    this.yardGroup = new THREE.Group();
    this.cosyRoomGroup.add(this.yardGroup);

    // Small Ground Chunk
    const grassMat = new THREE.MeshStandardMaterial({ color: 0x3b5e2b, roughness: 1.0, metalness: 0.0 });
    const groundGeo = new THREE.BoxGeometry(16.5, 2, 8);
    const ground = new THREE.Mesh(groundGeo, grassMat);
    ground.position.set(0, -6, -25);
    ground.receiveShadow = true;
    this.yardGroup.add(ground);

    // Small Fence Chunk
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x5c4033, roughness: 0.9, metalness: 0.1 });
    const fenceZ = -28.5;
    for (let i = -8; i <= 8; i += 2) {
      const picket = new THREE.Mesh(new THREE.BoxGeometry(0.5, 4, 0.2), woodMat);
      picket.position.set(i, -3, fenceZ);
      picket.castShadow = true;
      picket.receiveShadow = true;
      this.yardGroup.add(picket);
    }
    const beam1 = new THREE.Mesh(new THREE.BoxGeometry(16.5, 0.3, 0.3), woodMat);
    beam1.position.set(0, -2, fenceZ + 0.15);
    beam1.castShadow = true;
    this.yardGroup.add(beam1);
    const beam2 = new THREE.Mesh(new THREE.BoxGeometry(16.5, 0.3, 0.3), woodMat);
    beam2.position.set(0, -4, fenceZ + 0.15);
    beam2.castShadow = true;
    this.yardGroup.add(beam2);

    // Single Pine Tree
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x2e4c23, roughness: 0.9, metalness: 0.0 });
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4a3728, roughness: 1.0, metalness: 0.0 });

    const treePositions = [
      [-4, -26], [4, -27], [0, -24] // Small cluster of trees outside window
    ];

    treePositions.forEach(pos => {
      const treeGroup = new THREE.Group();

      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.6, 2, 8), trunkMat);
      trunk.position.y = -4;
      trunk.castShadow = true;
      trunk.receiveShadow = true;
      treeGroup.add(trunk);

      const leaves1 = new THREE.Mesh(new THREE.ConeGeometry(3, 4, 8), leafMat);
      leaves1.position.y = -1.5;
      leaves1.castShadow = true;
      leaves1.receiveShadow = true;
      treeGroup.add(leaves1);

      const leaves2 = new THREE.Mesh(new THREE.ConeGeometry(2.2, 3, 8), leafMat);
      leaves2.position.y = 0.5;
      leaves2.castShadow = true;
      leaves2.receiveShadow = true;
      treeGroup.add(leaves2);

      const leaves3 = new THREE.Mesh(new THREE.ConeGeometry(1.5, 2, 8), leafMat);
      leaves3.position.y = 2;
      leaves3.castShadow = true;
      leaves3.receiveShadow = true;
      treeGroup.add(leaves3);

      treeGroup.position.set(pos[0], 0, pos[1]);
      treeGroup.rotation.y = Math.random() * Math.PI;
      const scale = 0.7 + Math.random() * 0.6;
      treeGroup.scale.set(scale, scale, scale);

      this.yardGroup.add(treeGroup);
    });
  }

  private updateEnvironment() {
    const isSunny = this.weather === 'sunny';
    const isRainy = this.weather === 'rainy' || this.weather === 'thunderstorm';
    const isStormy = this.weather === 'thunderstorm';

    // Sky colors based on time of day and weather
    let skyColorHex = 0x87ceeb; // Day
    if (this.timeOfDay === 'sunset') skyColorHex = 0xffa07a;
    if (this.timeOfDay === 'night') skyColorHex = 0x0a1020;
    if (isStormy) skyColorHex = this.timeOfDay === 'night' ? 0x050510 : 0x222233;
    else if (this.weather === 'rainy') skyColorHex = this.timeOfDay === 'night' ? 0x101a2a : 0x6b7b8d;

    if (this.skyMat) {
      this.skyMat.color.setHex(skyColorHex);
    }

    // Cloud color
    this.clouds.forEach((cloud) => {
      cloud.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          const mat = (child as THREE.Mesh).material as THREE.MeshBasicMaterial;
          let cloudColor = 0xffffff;
          if (this.timeOfDay === 'sunset') cloudColor = 0xffd0b0;
          if (this.timeOfDay === 'night') cloudColor = 0x222233;
          if (isStormy) cloudColor = this.timeOfDay === 'night' ? 0x111118 : 0x333344;
          else if (this.weather === 'rainy') cloudColor = this.timeOfDay === 'night' ? 0x1a2a3a : 0x555566;

          mat.color.setHex(cloudColor);
          mat.opacity = isSunny ? 0.7 : 0.85;
        }
      });
    });

    // Rain visibility and intensity
    if (this.rainDrops) {
      this.rainDrops.visible = isRainy;
      const mat = this.rainDrops.material as THREE.PointsMaterial;
      mat.opacity = (this.rainIntensity / 100) * 0.9;
    }

    // Celestial body position (Arc from left to right)
    if (this.windowLight) {
      const p = this.celestialPosition / 100; // 0 to 1
      const x = -40 + (p * 80);
      const y = 5 + (25 * Math.sin(p * Math.PI));
      this.windowLight.position.set(x, y, -30);

      // Window Light color and intensity
      let lightColor = 0xffffff;
      let lightIntensity = 1.5;

      if (this.timeOfDay === 'sunset') {
        lightColor = 0xffaa55;
        lightIntensity = 1.0;
      } else if (this.timeOfDay === 'night') {
        lightColor = 0x4466aa;
        lightIntensity = 0.4;
      }

      if (isStormy) {
        lightIntensity *= 0.1;
        lightColor = 0x667788;
      } else if (isRainy) {
        lightIntensity *= 0.4;
        lightColor = 0x8899aa;
      }

      this.windowLight.color.setHex(lightColor);
      this.windowLight.intensity = lightIntensity;
    }

    // Ambient/Hemisphere lighting
    this.scene.traverse((obj) => {
      if (obj instanceof THREE.AmbientLight) {
        let ambColor = 0xfff0e0;
        let ambIntensity = 0.5;
        if (this.timeOfDay === 'sunset') { ambColor = 0xffe0c0; ambIntensity = 0.4; }
        if (this.timeOfDay === 'night') { ambColor = 0x203050; ambIntensity = 0.2; }

        if (isStormy) { ambColor = 0x606070; ambIntensity *= 0.3; }
        else if (isRainy) { ambColor = 0xc0c0d0; ambIntensity *= 0.7; }

        obj.color.setHex(ambColor);
        obj.intensity = ambIntensity;
      }
      if (obj instanceof THREE.HemisphereLight) {
        let hemiColor = 0x87ceeb;
        if (this.timeOfDay === 'sunset') hemiColor = 0xffaa77;
        if (this.timeOfDay === 'night') hemiColor = 0x102040;

        if (isStormy) hemiColor = 0x223344;
        else if (isRainy) hemiColor = 0x556677;

        obj.color.setHex(hemiColor);
      }
    });
  }

  private handleResize() {
    if (!this.container || !this.renderer || !this.camera) return;
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    if (width === 0 || height === 0) return;

    const aspect = width / height;
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
    this.cssRenderer.setSize(width, height);
    this.composer.setSize(width, height);
  }

  private startLoop() {
    // Detect HyperFrames offline rendering mode
    if (window.hasOwnProperty('__timelines') || document.querySelector('.macro-shot') || document.querySelector('.micro-cut')) {
      this.isRenderMode = true;
      console.log('[Diorama] HyperFrames render mode detected');

      // Parse macro shots from DOM
      const macroEls = document.querySelectorAll('.macro-shot');
      this.macroShots = Array.from(macroEls).map((el, i) => ({
        id: `macro-${i}`,
        target: el.getAttribute('data-target') || '',
        startTime: parseFloat(el.getAttribute('data-start') || '0'),
        duration: parseFloat(el.getAttribute('data-duration') || '10'),
        mood: el.getAttribute('data-mood') || 'balanced',
      }));

      // Parse micro cuts from DOM
      const microEls = document.querySelectorAll('.micro-cut');
      this.microCuts = Array.from(microEls).map((el, i) => ({
        id: `micro-${i}`,
        target: el.getAttribute('data-target') || '',
        time: parseFloat(el.getAttribute('data-start') || '0'),
      }));

      // Parse primary/secondary arrays from host element
      const dioramaHost = document.querySelector('lofi-dashboard') || document.querySelector('diorama-screen');
      if (dioramaHost) {
        const primaryStr = dioramaHost.getAttribute('data-primary-array') || '';
        const secondaryStr = dioramaHost.getAttribute('data-secondary-array') || '';
        if (primaryStr) this.primaryArray = primaryStr.split(',').filter(s => s);
        if (secondaryStr) this.secondaryArray = secondaryStr.split(',').filter(s => s);
      }

      console.log(`[Diorama] Loaded ${this.macroShots.length} macro shots, ${this.microCuts.length} micro cuts`);
      console.log(`[Diorama] Primary: [${this.primaryArray}], Secondary: [${this.secondaryArray}]`);

      // Load offline audio buffer for deterministic analysis
      this.loadOfflineAudio();

      // Listen for HyperFrames seek events
      window.addEventListener('hf-seek', (e: any) => {
        this.renderCurrentTime = e.detail.time;
        this.renderScene();
      });

      // Initial render
      this.renderScene();
    } else {
      // Normal browser mode with requestAnimationFrame
      const loop = () => {
        this.renderScene();
        this.animationFrameId = requestAnimationFrame(loop);
      };
      this.animationFrameId = requestAnimationFrame(loop);
    }
  }

  private async loadOfflineAudio() {
    // Try audio.wav first (render mode: HyperFrames serves relative to the project root,
    // matching the <audio id="main-audio"> src in render.js). Fall back to ../audio.wav
    // for older/alternate serving setups.
    const paths = ['audio.wav', '../audio.wav'];
    for (const audioPath of paths) {
      try {
        const response = await fetch(audioPath);
        if (!response.ok) continue;
        const arrayBuffer = await response.arrayBuffer();
        const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
        this.offlineAudioBuffer = audioBuffer.getChannelData(0);
        this.offlineSampleRate = audioBuffer.sampleRate;
        console.log(`[Diorama] Loaded offline audio from '${audioPath}': ${audioBuffer.duration.toFixed(1)}s @ ${this.offlineSampleRate}Hz`);
        return;
      } catch (e) {
        // Try next path
      }
    }
    console.warn('[Diorama] Could not load offline audio from any path');
  }

  /**
   * Compute deterministic audio data from the offline buffer at a given time.
   * Used during HyperFrames render mode instead of the real-time AudioManager.
   */
  private getOfflineAudioData(time: number): { amplitude: number; bass: number; freqs: number[] } {
    if (!this.offlineAudioBuffer) {
      return { amplitude: 0, bass: 0, freqs: new Array(8).fill(0) };
    }

    const sampleIndex = Math.floor(time * this.offlineSampleRate);
    const windowSize = 2048;
    const startIdx = Math.max(0, sampleIndex - windowSize);
    const endIdx = Math.min(this.offlineAudioBuffer.length, sampleIndex);

    // RMS amplitude
    let rms = 0;
    let bassRms = 0;
    let count = 0;
    for (let i = startIdx; i < endIdx; i++) {
      const val = this.offlineAudioBuffer[i];
      rms += val * val;
      // Low-pass approximation for bass
      if ((i - startIdx) % 4 === 0) bassRms += val * val;
      count++;
    }
    const amplitude = count > 0 ? Math.sqrt(rms / count) : 0;
    const bass = count > 0 ? Math.min(1.0, Math.sqrt(bassRms / (count / 4)) * 3.0) : 0;

    // Frequency band approximation (8 bands)
    const freqs: number[] = [];
    const bandSize = Math.floor(count / 8);
    for (let band = 0; band < 8; band++) {
      let bandSum = 0;
      const bStart = startIdx + band * bandSize;
      const bEnd = Math.min(bStart + bandSize, endIdx);
      for (let i = bStart; i < bEnd; i++) {
        bandSum += Math.abs(this.offlineAudioBuffer[i]);
      }
      freqs.push(bandSize > 0 ? Math.min(1.0, (bandSum / bandSize) * 5.0) : 0);
    }

    return { amplitude, bass, freqs };
  }

  private renderScene() {
    if (!this.renderer || !this.scene || !this.camera) return;

    let amplitude = 0;
    let bass = 0;
    let freqs: number[] = new Array(8).fill(0);

    if (this.sceneMode === 'liminal' && Math.random() < 0.02) {
      this.backroomsGroup.children.forEach(child => {
        if (child instanceof THREE.RectAreaLight) {
          child.intensity = Math.random() > 0.5 ? 5 : 0.5;
        }
        if (child.userData && child.userData.isFluoro) {
          ((child as THREE.Mesh).material as THREE.MeshBasicMaterial).color.setHex(Math.random() > 0.5 ? 0xffffff : 0x555555);
        }
      });
    } else if (this.sceneMode === 'liminal') {
      this.backroomsGroup.children.forEach(child => {
        if (child instanceof THREE.RectAreaLight) {
          child.intensity = 5;
        }
        if (child.userData && child.userData.isFluoro) {
          ((child as THREE.Mesh).material as THREE.MeshBasicMaterial).color.setHex(0xffffff);
        }
      });
    }

    // Camera raycast wall occlusion in liminal mode
    if (this.sceneMode === 'liminal' && this.backroomsWallMeshes.length > 0 && this.camera && this.controls) {
      // Default target opacity to 1.0 for all walls
      this.backroomsWallMeshes.forEach(w => {
        w.userData.targetOpacity = 1.0;
      });

      const camPos = this.camera.position.clone();
      const targetPos = this.controls.target.clone();
      const dir = targetPos.clone().sub(camPos);
      const dist = dir.length();

      if (dist > 0.001) {
        dir.normalize();

        const up = new THREE.Vector3(0, 1, 0);
        const right = new THREE.Vector3().crossVectors(dir, up).normalize();
        const camUp = new THREE.Vector3().crossVectors(right, dir).normalize();

        const offsetDist = Math.min(6.0, dist * 0.1);
        const rayOrigins = [
          camPos,
          camPos.clone().addScaledVector(right, offsetDist),
          camPos.clone().addScaledVector(right, -offsetDist),
          camPos.clone().addScaledVector(camUp, offsetDist),
          camPos.clone().addScaledVector(camUp, -offsetDist)
        ];

        const raycaster = new THREE.Raycaster();
        raycaster.far = dist;

        rayOrigins.forEach((origin, index) => {
          const rayDir = targetPos.clone().sub(origin).normalize();
          raycaster.set(origin, rayDir);
          const hits = raycaster.intersectObjects(this.backroomsWallMeshes, false);

          hits.forEach(hit => {
            if (hit.object instanceof THREE.Mesh) {
              const targetOp = index === 0 ? 0.15 : 0.3;
              hit.object.userData.targetOpacity = Math.min(
                hit.object.userData.targetOpacity ?? 1.0,
                targetOp
              );
            }
          });
        });
      }

      // Smoothly animate opacity and set depthWrite
      this.backroomsWallMeshes.forEach(w => {
        const mat = w.material as THREE.MeshStandardMaterial;
        if (mat) {
          const targetOp = w.userData.targetOpacity ?? 1.0;
          mat.opacity += (targetOp - mat.opacity) * 0.15;
          mat.depthWrite = mat.opacity > 0.9;
        }
      });
    }

    // --- Audio data source selection ---
    if (this.isRenderMode) {
      // HyperFrames render mode: compute deterministic audio from offline buffer
      const data = this.getOfflineAudioData(this.renderCurrentTime);
      amplitude = data.amplitude;
      bass = data.bass;
      freqs = data.freqs;
    } else if (this.audioManager && this.audioManager.isLoaded) {
      if (this.audioManager.isPlaying) {
        const rt = this.audioManager.getRealTimeData();
        amplitude = rt.amplitude;
        let bassSum = 0;
        for (let i = 0; i < 4; i++) bassSum += (rt.frequencies[i] || 0);
        bass = (bassSum / 4) / 255.0;
        for (let i = 0; i < 8; i++) freqs[i] = (rt.frequencies[i * 10] || 0) / 255.0;
      } else if (this.audioDirector && this.audioDirector.isPlaying) {
        // Audio Director uses WaveSurfer — drive visuals from deterministic buffer data
        const time = this.audioDirector.getCurrentTime();
        const det = this.audioManager.getDeterministicData(time);
        amplitude = det.amplitude;
        bass = det.frequencies[0] || 0;
        freqs = det.frequencies;
      } else {
        const time = this.audioManager.getCurrentTime();
        const det = this.audioManager.getDeterministicData(time);
        amplitude = det.amplitude;
        bass = det.frequencies[0] || 0;
        freqs = det.frequencies;
      }
    }

    // Lamp flicker with music
    if (this.lampBulb && this.deskLight) {
      const flicker = 1.0 + (amplitude * 0.15);
      (this.lampBulb.material as THREE.MeshStandardMaterial).emissiveIntensity = 2.0 * flicker;
      this.deskLight.intensity = 60 * flicker;
    }

    // Tracker screen
    if (this.trackerScreen && this.activeGear.includes('polyend')) {
      GearRegistry.updateTrackerScreen(amplitude, bass);
    }

    if (this.m8Screen && this.activeGear.includes('m8')) {
      GearRegistry.updateM8Screen(amplitude, bass, freqs);
    }

    // Circuit pad LEDs
    this.circuitPads.forEach((pad, index) => {
      const mat = pad.material as THREE.MeshStandardMaterial;
      const freqIdx = index % 8;
      const val = freqs[freqIdx] || 0;
      const colorHex = index < 8 ? 0xf43f5e : (index < 16 ? 0xf59e0b : 0x10b981);
      if (val > 0.4 + (Math.random() * 0.2)) {
        mat.emissive.setHex(colorHex);
        mat.emissiveIntensity = val * 2.5;
      } else {
        mat.emissive.setHex(0x000000);
      }
    });

    // Tape spools
    if (bass > 0.6) {
      this.tapeSpools.forEach(spool => spool.rotation.z -= (bass * 0.6));
    } else {
      this.tapeSpools.forEach(spool => spool.rotation.z -= 0.01);
    }

    // Cloud drift
    // const time = Date.now() * 0.0001;
    this.clouds.forEach((cloud, i) => {
      cloud.position.x += 0.003 * (i % 2 === 0 ? 1 : -0.7);
      if (cloud.position.x > 14) cloud.position.x = -14;
      if (cloud.position.x < -14) cloud.position.x = 14;
    });

    // Rain animation
    if (this.rainDrops && this.rainDrops.visible) {
      const positions = this.rainDrops.geometry.attributes.position.array as Float32Array;
      for (let i = 0; i < positions.length / 3; i++) {
        positions[i * 3 + 1] -= 0.15;
        if (positions[i * 3 + 1] < -5) {
          positions[i * 3 + 1] = 22;
          positions[i * 3] = (Math.random() - 0.5) * 40;
        }
      }
      this.rainDrops.geometry.attributes.position.needsUpdate = true;
    }

    // Lightning animation
    if (this.weather === 'thunderstorm' && this.lightningLight) {
      // 0 to 100 maps to 0.002 to 0.04 probability per frame
      const probability = 0.002 + (this.lightningIntensity / 100) * 0.038;
      if (Math.random() < probability) {
        this.targetLightningIntensity = 80 + Math.random() * 100;
      } else {
        this.targetLightningIntensity = 0;
      }
      this.currentLightningIntensity += (this.targetLightningIntensity - this.currentLightningIntensity) * 0.4;
      this.lightningLight.intensity = this.currentLightningIntensity;
    } else if (this.lightningLight) {
      this.lightningLight.intensity = 0;
      this.targetLightningIntensity = 0;
      this.currentLightningIntensity = 0;
    }

    if (this.quantumCube) {
      GearRegistry.updateQuantumCube(this.renderer, this.camera);
    }

    if (this.controls) {
      this.controls.update();
    }

    if (this.hermanMillerChair) {
      // Smoothly interpolate towards target rotation
      this.hermanMillerChair.rotation.y += (this.targetChairRotation - this.hermanMillerChair.rotation.y) * 0.08;
    }

    if (this.configPanelObj && this.activeConfigDevice) {
      // Keep panel floating above device and always facing the camera (billboarding)
      this.configPanelObj.position.copy(this.activeConfigDevice.position).add(new THREE.Vector3(0, 5, 0));
      this.configPanelObj.quaternion.copy(this.camera.quaternion);
    }

    const isTimelinePlaying = this.audioDirector && this.audioDirector.isPlaying;
    const isGlobalPlaying = this.audioManager && this.audioManager.isPlaying;

    if (this.isRenderMode || isTimelinePlaying || isGlobalPlaying) {
      this.updateCameraSequencer();
    } else if (this.sequencerActive) {
      // Release camera to orbit controls
      this.sequencerActive = false;
      this.controls.enabled = true;
    }

    // Use composer for post-processing instead of standard renderer
    this.composer.render();
    if (this.cssRenderer) this.cssRenderer.render(this.scene, this.camera);
  }

  private onPointerMove(event: PointerEvent) {
    if (!this.renderer) return;
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, this.camera);

    if (this.dragObject) {
      if (this.dragObject.userData.isPoster) {
        const leftWallPlane = new THREE.Plane(new THREE.Vector3(1, 0, 0), 21.55);
        const backWallPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 19.3);

        const leftPoint = new THREE.Vector3();
        const backPoint = new THREE.Vector3();

        this.raycaster.ray.intersectPlane(leftWallPlane, leftPoint);
        this.raycaster.ray.intersectPlane(backWallPlane, backPoint);

        let targetPos = new THREE.Vector3();
        let targetWall = this.dragObject.userData.wall;

        const leftZMin = -18, leftZMax = 18;
        const backXMin = -14, backXMax = 42;
        const yMin = 5, yMax = 40;

        const inLeftWall = leftPoint && leftPoint.z >= leftZMin && leftPoint.z <= leftZMax && leftPoint.y >= yMin && leftPoint.y <= yMax;
        const inBackWall = backPoint && backPoint.x >= backXMin && backPoint.x <= backXMax && backPoint.y >= yMin && backPoint.y <= yMax;

        if (inLeftWall && !inBackWall) {
          targetPos.copy(leftPoint);
          targetWall = 'left';
        } else if (inBackWall && !inLeftWall) {
          targetPos.copy(backPoint);
          targetWall = 'back';
        } else if (inLeftWall && inBackWall) {
          if (this.camera.position.distanceTo(leftPoint) < this.camera.position.distanceTo(backPoint)) {
            targetPos.copy(leftPoint);
            targetWall = 'left';
          } else {
            targetPos.copy(backPoint);
            targetWall = 'back';
          }
        } else {
          // Out of bounds, clamp to the current wall
          if (this.dragObject.userData.wall === 'left' && leftPoint) {
            targetPos.copy(leftPoint);
            targetPos.z = Math.max(leftZMin, Math.min(leftZMax, targetPos.z));
            targetPos.y = Math.max(yMin, Math.min(yMax, targetPos.y));
          } else if (backPoint) {
            targetPos.copy(backPoint);
            targetPos.x = Math.max(backXMin, Math.min(backXMax, targetPos.x));
            targetPos.y = Math.max(yMin, Math.min(yMax, targetPos.y));
          } else {
            targetPos.copy(this.dragObject.position);
          }
        }

        this.dragObject.userData.wall = targetWall;
        this.dragObject.position.copy(targetPos);
        this.dragObject.rotation.y = targetWall === 'left' ? Math.PI / 2 : 0;
        this.dragObject.updateMatrixWorld(true);

        const updatedBox = new THREE.Box3().setFromObject(this.dragObject, true);
        updatedBox.expandByScalar(-0.2);

        let collision = false;
        for (const other of this.posters) {
          if (other !== this.dragObject && other.visible) {
            other.updateMatrixWorld(true);
            const otherBox = new THREE.Box3().setFromObject(other, true);
            otherBox.expandByScalar(-0.2);
            if (updatedBox.intersectsBox(otherBox)) {
              collision = true;
              break;
            }
          }
        }

        if (collision) {
          this.dragObject.children.forEach((child: any) => {
            if (child.material && child.userData.isFrame) {
              child.material.emissive.setHex(0xff0000);
              child.material.emissiveIntensity = 0.5;
            }
          });
          this.dragObject.userData.colliding = true;
        } else {
          this.dragObject.children.forEach((child: any) => {
            if (child.material && child.userData.isFrame) {
              child.material.emissive.setHex(0x000000);
              child.material.emissiveIntensity = 0;
            }
          });
          this.dragObject.userData.colliding = false;
          this.dragObject.userData.lastValidPos = targetPos.clone();
          this.dragObject.userData.lastValidWall = targetWall;
        }
        return;
      }

      this.raycaster.ray.intersectPlane(this.dragPlane, this.intersectionPoint);
      const newPos = this.intersectionPoint.clone().sub(this.dragOffset);

      // Clamp to room bounds to prevent dragging through walls
      // Floor is 72.5 x 40 centered at x=14, z=0
      const floorHalfW = 72.5 / 2;
      const floorHalfD = 40 / 2;
      const margin = 1.0;

      newPos.x = Math.max(14 - floorHalfW + margin, Math.min(14 + floorHalfW - margin, newPos.x));
      newPos.z = Math.max(-floorHalfD + margin, Math.min(floorHalfD - margin, newPos.z));

      const oldPos = this.dragObject.position.clone();
      this.dragObject.position.x = newPos.x;
      this.dragObject.position.z = newPos.z;

      let snapped = false;
      if (this.dragObject.name === 'headphones') {
        const hookPos = new THREE.Vector3(16.6, 4.9, -5);
        const dist2D = Math.sqrt(Math.pow(newPos.x - hookPos.x, 2) + Math.pow(newPos.z - hookPos.z, 2));
        if (dist2D < 2.0) {
          this.dragObject.position.copy(hookPos);
          this.dragObject.rotation.set(0, Math.PI / 2, 0);
          snapped = true;
        } else {
          this.dragObject.rotation.set(0, 0, 0);
        }
      }

      // Dynamically hover the object above the surface directly under it
      if (!snapped && this.scene) {
        this.scene.updateMatrixWorld(true);
        const hoverRaycaster = new THREE.Raycaster();
        hoverRaycaster.set(new THREE.Vector3(newPos.x, 30, newPos.z), new THREE.Vector3(0, -1, 0));
        const intersects = hoverRaycaster.intersectObjects(this.surfaceObjects, false);
        if (intersects.length > 0) {
          const topIntersect = intersects[0];
          this.dragObject.updateMatrixWorld(true);
          const box = new THREE.Box3().setFromObject(this.dragObject, true);
          if (!box.isEmpty()) {
            const currentMinY = box.min.y;
            const offset = (topIntersect.point.y + 0.5) - currentMinY;
            this.dragObject.position.y += offset;
          }
        }
      }

      // Update matrices to ensure bounding boxes are perfectly accurate
      this.dragObject.updateMatrixWorld(true);
      const updatedBox = new THREE.Box3().setFromObject(this.dragObject, true);

      let collision = false;
      const allColliders = [
        ...this.draggableObjects,
        ...this.clickableObjects,
        ...this.staticCollisionObjects
      ];

      for (const other of allColliders) {
        if (other !== this.dragObject && other.visible) {
          other.updateMatrixWorld(true);
          const otherBox = new THREE.Box3().setFromObject(other, true);

          // Shrink bounding boxes slightly to allow adjacent placement without snagging
          updatedBox.expandByScalar(-0.2);
          otherBox.expandByScalar(-0.2);

          if (updatedBox.intersectsBox(otherBox)) {
            collision = true;
            break;
          }
        }
      }

      if (collision) {
        this.dragObject.position.copy(oldPos); // Snap back to last valid frame
      }
      return; // Skip hover state if we are dragging
    }

    const intersects = this.raycaster.intersectObjects([...this.clickableObjects, ...this.draggableObjects, ...this.shelfObjects], true);
    if (intersects.length > 0) {
      this.renderer.domElement.style.cursor = 'pointer';

      const object = intersects[0].object;
      let target: THREE.Object3D | null = object;
      while (target && !this.draggableObjects.includes(target) && !this.shelfObjects.includes(target) && target !== this.scene) {
        target = target.parent;
      }

      if (target && (this.draggableObjects.includes(target) || this.shelfObjects.includes(target))) {
        if (!target.userData.isPoster) {
          this.hoveredSynth = target;

          const center = new THREE.Vector3();
          new THREE.Box3().setFromObject(target).getCenter(center);
          center.y += 1.0; // Place icon closer to the synth

          center.project(this.camera);
          this.hoverPosX = (center.x * 0.5 + 0.5) * rect.width;
          this.hoverPosY = (-(center.y * 0.5) + 0.5) * rect.height;
        }
      } else {
        if (this.hoveredSynth) {
          // If we move off the synth, keep UI active if we are moving towards the button
          const mouseX = event.clientX - rect.left;
          const mouseY = event.clientY - rect.top;
          const dx = mouseX - this.hoverPosX;
          const dy = mouseY - this.hoverPosY;
          if (dx * dx + dy * dy > 8100) { // ~90px radius leeway
            this.hoveredSynth = null;
          }
        }
      }
    } else {
      this.renderer.domElement.style.cursor = 'default';

      // Also check distance when hitting nothing (e.g. background)
      if (this.hoveredSynth) {
        const mouseX = event.clientX - rect.left;
        const mouseY = event.clientY - rect.top;
        const dx = mouseX - this.hoverPosX;
        const dy = mouseY - this.hoverPosY;
        if (dx * dx + dy * dy > 8100) {
          this.hoveredSynth = null;
        }
      }
    }
  }

  private onPointerDown(event: PointerEvent) {
    if (!this.renderer) return;
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, this.camera);
    const intersects = this.raycaster.intersectObjects([...this.clickableObjects, ...this.draggableObjects, ...this.shelfObjects], true);

    // Close config panel if clicking elsewhere
    if (this.activeConfigDevice) {
      let clickedDevice = false;
      if (intersects.length > 0) {
        let target: THREE.Object3D | null = intersects[0].object;
        while (target && target !== this.scene) {
          if (target === this.activeConfigDevice) clickedDevice = true;
          target = target.parent;
        }
      }
      if (!clickedDevice) {
        this.closeConfigPanel();
      }
    }

    if (intersects.length > 0) {
      const object = intersects[0].object;

      // Bubble up to find if it's a draggable or shelf gear
      let dragTarget: THREE.Object3D | null = object;
      while (dragTarget && !this.draggableObjects.includes(dragTarget) && !this.shelfObjects.includes(dragTarget) && dragTarget !== this.scene) {
        dragTarget = dragTarget.parent;
      }

      if (dragTarget && this.shelfObjects.includes(dragTarget)) {
        // Direct click on a shelf item -> Move it back to desk!
        this.dispatchEvent(new CustomEvent('toggle-gear', {
          detail: { gear: dragTarget.name },
          bubbles: true,
          composed: true
        }));
        return;
      }

      if (dragTarget && this.draggableObjects.includes(dragTarget)) {
        this.dragObject = dragTarget;

        // Disable orbit controls while dragging
        if (this.controls) this.controls.enabled = false;

        if (this.dragObject.userData.isPoster) {
          this.dragObject.userData.startPos = this.dragObject.position.clone();
          this.dragObject.userData.lastValidPos = this.dragObject.position.clone();
          this.dragObject.userData.startWall = this.dragObject.userData.wall;
          this.dragObject.userData.lastValidWall = this.dragObject.userData.wall;
        } else {
          // Normal gear lift
          const liftHeight = Math.max(dragTarget.position.y + 0.5, 7.5);
          this.dragPlane.setComponents(0, 1, 0, -liftHeight);
          dragTarget.position.y = liftHeight;
          this.raycaster.ray.intersectPlane(this.dragPlane, this.intersectionPoint);
          this.dragOffset.copy(this.intersectionPoint).sub(this.dragObject.position);
        }
      } else {
        // Check if we clicked the Herman Miller chair
        let chairTarget: THREE.Object3D | null = object;
        while (chairTarget && chairTarget.name !== 'herman_miller_chair' && chairTarget !== this.scene) {
          chairTarget = chairTarget.parent;
        }

        if (chairTarget && chairTarget.name === 'herman_miller_chair') {
          // Add a full 360 spin (2 PI radians) to the target rotation
          this.targetChairRotation += Math.PI * 2;
          return;
        }

        // Toggle settings ONLY if we click on clutter (like the lamp, cup, etc.)
        this.dispatchEvent(new CustomEvent('toggle-settings', { bubbles: true, composed: true }));
      }
    }
  }

  private dropToSurface(obj: THREE.Object3D) {
    if (!this.scene) return;
    this.scene.updateMatrixWorld(true);

    const raycaster = new THREE.Raycaster();
    obj.updateMatrixWorld(true);

    // Compute the bounds to align the bottom properly
    const box = new THREE.Box3().setFromObject(obj, true);
    if (box.isEmpty()) return;

    // Raycast downwards starting above the bounding box top to reliably hit the surface beneath it
    const center = new THREE.Vector3();
    box.getCenter(center);
    const rayOrigin = new THREE.Vector3(center.x, Math.max(center.y + 1.0, box.max.y + 0.2), center.z);
    raycaster.set(rayOrigin, new THREE.Vector3(0, -1, 0));

    const intersects = raycaster.intersectObjects(this.surfaceObjects, false);

    if (intersects.length > 0) {
      // Find the topmost surface intersected
      const topIntersect = intersects[0];

      // Align the bottom of the bounding box with the surface
      const currentMinY = box.min.y;
      const offset = topIntersect.point.y - currentMinY;

      obj.position.y += offset;
      obj.updateMatrixWorld(true);
    }
  }

  private onPointerUp() {
    if (this.dragObject) {
      if (this.dragObject.userData.isPoster) {
        if (this.dragObject.userData.colliding) {
          this.dragObject.position.copy(this.dragObject.userData.startPos);
          this.dragObject.userData.wall = this.dragObject.userData.startWall;
          this.dragObject.children.forEach((child: any) => {
            if (child.material && child.userData.isFrame) {
              child.material.emissive.setHex(0x000000);
              child.material.emissiveIntensity = 0;
            }
          });
          this.dragObject.userData.colliding = false;
        } else if (this.dragObject.userData.lastValidPos) {
          this.dragObject.position.copy(this.dragObject.userData.lastValidPos);
          this.dragObject.userData.wall = this.dragObject.userData.lastValidWall;
        }

        this.dragObject.rotation.y = this.dragObject.userData.wall === 'left' ? Math.PI / 2 : 0;

        // Remove hover offset to snap back to the physical wall
        if (this.dragObject.userData.wall === 'left') {
          this.dragObject.position.x = -22.05;
        } else {
          this.dragObject.position.z = -19.8;
        }

        this.dragObject.updateMatrixWorld(true);
      } else {
        let snapped = false;
        if (this.dragObject.name === 'headphones') {
          const hookPos = new THREE.Vector3(16.6, 4.9, -5);
          const dist2D = Math.sqrt(Math.pow(this.dragObject.position.x - hookPos.x, 2) + Math.pow(this.dragObject.position.z - hookPos.z, 2));
          if (dist2D < 2.0) {
            this.dragObject.position.copy(hookPos);
            this.dragObject.rotation.set(0, Math.PI / 2, 0);
            this.dragObject.updateMatrixWorld(true);
            snapped = true;
          }
        }

        if (!snapped) {
          this.dropToSurface(this.dragObject);
          // If dropped onto another object, bounce it to the nearest free space
          this.resolveOverlap(this.dragObject);
        }
      }

      this.saveLayout();
    }

    // Re-enable orbit controls
    if (this.controls) this.controls.enabled = true;

    this.dragObject = null;
  }

  private onWheel(event: WheelEvent) {
    if (!this.renderer || !this.camera || !this.controls) return;
    event.preventDefault();

    const rect = this.renderer.domElement.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1
    );

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, this.camera);

    const allColliders = [
      ...this.draggableObjects,
      ...this.clickableObjects,
      ...this.staticCollisionObjects,
      ...this.surfaceObjects
    ];

    const intersects = raycaster.intersectObjects(allColliders, true);

    const P = new THREE.Vector3();
    if (intersects.length > 0) {
      P.copy(intersects[0].point);
    } else {
      // Fallback to target plane if pointing at empty space
      const normal = new THREE.Vector3();
      this.camera.getWorldDirection(normal);
      const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, this.controls.target);
      raycaster.ray.intersectPlane(plane, P);
      if (!P) return;
    }

    // Calculate zoom factor (OrbitControls default-like feel)
    const zoomScale = Math.pow(0.95, 2.0);
    const zoomFactor = event.deltaY > 0 ? (1 / zoomScale) : zoomScale;

    // Clamp based on OrbitControls min/max distance
    const currentDist = this.camera.position.distanceTo(this.controls.target);
    let newDist = currentDist * zoomFactor;

    if (newDist < this.controls.minDistance) {
      newDist = this.controls.minDistance;
    } else if (newDist > this.controls.maxDistance) {
      newDist = this.controls.maxDistance;
    }
    const actualZoomFactor = newDist / currentDist;

    // Scale camera position and target around P
    this.camera.position.sub(P).multiplyScalar(actualZoomFactor).add(P);
    this.controls.target.sub(P).multiplyScalar(actualZoomFactor).add(P);

    this.controls.update();
  }

  private onTouchStart(event: TouchEvent) {
    if (event.touches.length === 2) {
      event.preventDefault();

      // If we were dragging an object, drop it cleanly before starting pinch-zoom
      if (this.dragObject) {
        this.onPointerUp();
      }

      const touch1 = event.touches[0];
      const touch2 = event.touches[1];
      const dx = touch1.clientX - touch2.clientX;
      const dy = touch1.clientY - touch2.clientY;
      this.lastTouchDistance = Math.sqrt(dx * dx + dy * dy);
    } else {
      this.lastTouchDistance = null;
    }
  }

  private onTouchMove(event: TouchEvent) {
    if (event.touches.length === 2) {
      event.preventDefault();
      if (!this.renderer || !this.camera || !this.controls) return;

      const touch1 = event.touches[0];
      const touch2 = event.touches[1];
      const dx = touch1.clientX - touch2.clientX;
      const dy = touch1.clientY - touch2.clientY;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (this.lastTouchDistance !== null && this.lastTouchDistance > 0) {
        const zoomFactor = this.lastTouchDistance / distance;

        const rect = this.renderer.domElement.getBoundingClientRect();
        const midX = (touch1.clientX + touch2.clientX) / 2;
        const midY = (touch1.clientY + touch2.clientY) / 2;

        const mouse = new THREE.Vector2(
          ((midX - rect.left) / rect.width) * 2 - 1,
          -((midY - rect.top) / rect.height) * 2 + 1
        );

        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(mouse, this.camera);

        const allColliders = [
          ...this.draggableObjects,
          ...this.clickableObjects,
          ...this.staticCollisionObjects,
          ...this.surfaceObjects
        ];

        const intersects = raycaster.intersectObjects(allColliders, true);

        const P = new THREE.Vector3();
        if (intersects.length > 0) {
          P.copy(intersects[0].point);
        } else {
          const normal = new THREE.Vector3();
          this.camera.getWorldDirection(normal);
          const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, this.controls.target);
          raycaster.ray.intersectPlane(plane, P);
        }

        if (P) {
          const currentDist = this.camera.position.distanceTo(this.controls.target);
          let newDist = currentDist * zoomFactor;

          if (newDist < this.controls.minDistance) {
            newDist = this.controls.minDistance;
          } else if (newDist > this.controls.maxDistance) {
            newDist = this.controls.maxDistance;
          }
          const actualZoomFactor = newDist / currentDist;

          this.camera.position.sub(P).multiplyScalar(actualZoomFactor).add(P);
          this.controls.target.sub(P).multiplyScalar(actualZoomFactor).add(P);

          this.controls.update();
        }
      }

      this.lastTouchDistance = distance;
    } else {
      if (!this.dragObject && this.controls) {
        this.controls.enabled = true;
      }
      this.lastTouchDistance = null;
    }
  }

  private onTouchEnd(event: TouchEvent) {
    if (event.touches.length === 2) {
      const touch1 = event.touches[0];
      const touch2 = event.touches[1];
      const dx = touch1.clientX - touch2.clientX;
      const dy = touch1.clientY - touch2.clientY;
      this.lastTouchDistance = Math.sqrt(dx * dx + dy * dy);
    } else {
      if (!this.dragObject && this.controls) {
        this.controls.enabled = true;
      }
      this.lastTouchDistance = null;
    }
  }


  private recenterCamera() {
    if (!this.camera || !this.controls) return;

    // Snap back to original diorama position (centered on whole room)
    this.camera.position.set(150, 100, 150);
    this.camera.zoom = 1;
    this.camera.updateProjectionMatrix();

    this.controls.target.set(14, 5.6, 0);
    this.controls.update();
  }

  private findGearObject(id: string): THREE.Object3D | null {
    if (!id) return null;
    const cleanId = id.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!cleanId) return null;

    let exactMatch: THREE.Object3D | null = null;
    let partialMatch: THREE.Object3D | null = null;

    this.gearGroup.children.forEach(child => {
      if (exactMatch) return; // Already found exact match, skip remaining
      const childName = child.name || '';
      if (!childName) return; // Skip unnamed objects

      const cleanChildName = childName.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (!cleanChildName) return; // Skip objects with effectively empty names

      if (cleanChildName === cleanId) {
        exactMatch = child;
        return;
      }

      // Only do partial matching if both strings are substantial
      if (cleanChildName.length >= 3 && cleanId.length >= 3) {
        if (cleanChildName.includes(cleanId) || cleanId.includes(cleanChildName)) {
          partialMatch = child;
        }
      }
    });

    if (exactMatch) return exactMatch;
    if (partialMatch) return partialMatch;

    // Deep recursive search as final fallback
    let deepMatch: THREE.Object3D | null = null;
    this.gearGroup.traverse(child => {
      if (deepMatch) return;
      const childName = child.name || '';
      if (!childName) return;
      const cleanChildName = childName.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (cleanChildName === cleanId) {
        deepMatch = child;
      }
    });
    return deepMatch;
  }

  public getCameraState() {
    return { pos: this.camera.position.clone(), target: this.controls.target.clone() };
  }

  private resolveCameraTransform(shot: { target?: string; mood?: string; cameraPos?: any; cameraLookAt?: any }) {
    if (shot.cameraPos && shot.cameraLookAt) {
      return {
        pos: new THREE.Vector3(shot.cameraPos.x, shot.cameraPos.y, shot.cameraPos.z),
        target: new THREE.Vector3(shot.cameraLookAt.x, shot.cameraLookAt.y, shot.cameraLookAt.z)
      };
    }

    let targetPosition = new THREE.Vector3(0, 5.6, -7);
    let cameraOffset = new THREE.Vector3(0, 10, 10);

    if (shot.target) {
      const targetObj = this.findGearObject(shot.target);
      if (targetObj) {
        targetObj.getWorldPosition(targetPosition);
      } else {
        console.warn(`[CameraSeq] Target '${shot.target}' unresolvable. Falling back to desk center.`);
      }
    }

    switch (shot.mood) {
      case 'balanced':
        cameraOffset.set(0, 15, 12);
        break;
      case 'submerged':
        cameraOffset.set(-4, 6, 6);
        break;
      case 'chaotic':
        cameraOffset.set(0, 7, 0.5);
        break;
      case 'ambient':
        targetPosition.set(0, 16, -19);
        cameraOffset.set(3, 2, 28);
        break;
      default:
        cameraOffset.set(0, 10, 10);
    }

    const pos = targetPosition.clone().add(cameraOffset);
    return { pos, target: targetPosition };
  }

  public snapToCamera(markerId: string) {
    if (!this.macroShots) return;
    const shot = this.macroShots.find((m: any) => m.id === markerId);
    if (!shot) return;

    const transform = this.resolveCameraTransform(shot);
    this.camera.position.copy(transform.pos);
    this.controls.target.copy(transform.target);
    this.camera.lookAt(this.controls.target);
    
    this.isTransitioning = false;
    this.lastMacroId = markerId; 
    
    this.sequencerActive = false;
    this.controls.enabled = true;
  }

  private updateCameraSequencer() {
    if (!this.macroShots || this.macroShots.length === 0) return;

    let time = 0;
    if (this.isRenderMode) {
      time = this.renderCurrentTime;
    } else if (this.audioDirector && this.audioDirector.isPlaying) {
      time = this.audioDirector.getCurrentTime();
    } else if (this.audioManager && this.audioManager.isPlaying) {
      time = this.audioManager.getCurrentTime();
    } else {
      if (this.lastMacroId !== null) {
        this.lastMacroId = null;
        this.isTransitioning = false;
      }
      return;
    }

    // 1. Find active macro shot
    const activeMacro = this.macroShots.find(m => time >= m.startTime && time < (m.startTime + m.duration));

    // 2. Check for micro cut override
    let activeMicro: any = null;
    if (this.microCuts && this.microCuts.length > 0) {
      activeMicro = this.microCuts.find(m => time >= m.time && time < (m.time + 0.2));
    }

    if (!activeMacro && !activeMicro) {
      this.lastMacroId = null;
      this.isTransitioning = false;
      return;
    }

    // Handle new macro shot event
    if (activeMacro && activeMacro.id !== this.lastMacroId) {
      this.lastMacroId = activeMacro.id;

      const transform = this.resolveCameraTransform(activeMacro);
      this.targetCameraPos.copy(transform.pos);
      this.targetCameraTarget.copy(transform.target);

      const isCut = (activeMacro as any).transitionType === 'cut';
      
      if (isCut) {
        this.camera.position.copy(this.targetCameraPos);
        this.controls.target.copy(this.targetCameraTarget);
        this.isTransitioning = false;
      } else {
        this.sourceCameraPos.copy(this.camera.position);
        this.sourceCameraTarget.copy(this.controls.target);
        this.transitionStartTime = performance.now();
        this.isTransitioning = true;
        this.transitionDuration = (activeMacro as any).transitionType === 'whip-pan' ? 400 : 1500;
      }
    }

    this.sequencerActive = true;
    this.controls.enabled = false;

    // Micro Cut Override: Instantly snap to top-down view of specific target
    if (activeMicro) {
      const microTargetPos = new THREE.Vector3();
      const microObj = this.findGearObject(activeMicro.target);
      if (microObj) {
        microObj.getWorldPosition(microTargetPos);
      }
      const microOffset = new THREE.Vector3(0, 14, 0.1);

      this.camera.position.copy(microTargetPos).add(microOffset);
      this.controls.target.copy(microTargetPos);
      this.camera.lookAt(this.controls.target);
      return;
    }

    // Apply Macro Transition / Lock
    if (this.isTransitioning) {
      const elapsed = performance.now() - this.transitionStartTime;
      let t = Math.min(1.0, elapsed / this.transitionDuration);

      // Smooth cubic easing
      t = t * t * (3 - 2 * t);

      this.camera.position.lerpVectors(this.sourceCameraPos, this.targetCameraPos, t);
      this.controls.target.lerpVectors(this.sourceCameraTarget, this.targetCameraTarget, t);

      if (elapsed >= this.transitionDuration) {
        this.isTransitioning = false;
      }
    } else {
      // Solid lock - no drift, no panning
      this.camera.position.copy(this.targetCameraPos);
      this.controls.target.copy(this.targetCameraTarget);
    }

    this.camera.lookAt(this.controls.target);
  }

  private applySceneMode() {
    const overlay = document.createElement('div');
    overlay.style.position = 'absolute';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.width = '100vw';
    overlay.style.height = '100vh';
    overlay.style.backgroundColor = 'black';
    overlay.style.zIndex = '9999';
    overlay.style.opacity = '0';
    overlay.style.transition = 'opacity 0.5s ease';
    overlay.style.pointerEvents = 'none';
    this.shadowRoot!.appendChild(overlay);

    // Fade out
    requestAnimationFrame(() => {
      overlay.style.opacity = '1';
    });

    setTimeout(() => {
      // Swap scenes
      this.cosyRoomGroup.visible = (this.sceneMode === 'normal');
      this.backroomsGroup.visible = (this.sceneMode === 'liminal');

      // Update gear positions for the new room
      this.gearGroup.children.forEach(child => {
        if (child.name && child.name !== 'dragPlane') {
          const saved = localStorage.getItem(`lofi_pos_${this.sceneMode}_${child.name}`);
          if (saved) {
            const data = JSON.parse(saved);
            child.position.set(data.x, data.y, data.z);
            if (data.ry !== undefined) {
              child.rotation.y = data.ry;
            } else {
              const savedRot = localStorage.getItem(`lofi_rot_${this.sceneMode}_${child.name}`);
              if (savedRot && !isNaN(parseFloat(savedRot))) {
                child.rotation.y = parseFloat(savedRot);
              }
            }
          } else {
            // Default position if no save for this mode
            const defaultY = this.sceneMode === 'liminal' ? -4.4 : 5.6;
            child.position.set(14 + (Math.random() * 10 - 5), defaultY, (Math.random() * 10 - 5));
          }
        }
      });

      // Lighting adjustments
      if (this.sceneMode === 'liminal') {
        this.deskLight.intensity = 0;
        this.windowLight.intensity = 0;
        this.scene.background = new THREE.Color(0x999999);
      } else {
        this.updateEnvironment(); // Restore normal lighting
        this.scene.background = new THREE.Color(0x1a1520);
      }

      // Fade in
      overlay.style.opacity = '0';
      setTimeout(() => overlay.remove(), 500);
    }, 500);
  }

  render() {
    return html`
      <div class="canvas-container" @dblclick=${this.recenterCamera}></div>
      ${this.hoveredSynth && !this.activeConfigDevice ? html`
        <div 
          class="edit-toggle" 
          style="left: ${this.hoverPosX}px; top: ${this.hoverPosY}px;"
          @click=${this.openConfigPanel}
          title="Configure Device"
        >
          <!-- Gear Icon -->
          <svg viewBox="0 0 24 24"><path d="M19.14,12.94c0.04-0.3,0.06-0.61,0.06-0.94c0-0.32-0.02-0.64-0.06-0.94l2.03-1.58c0.18-0.14,0.23-0.41,0.12-0.61 l-1.92-3.32c-0.12-0.22-0.37-0.29-0.59-0.22l-2.39,0.96c-0.5-0.38-1.03-0.7-1.62-0.94L14.4,2.81c-0.04-0.24-0.24-0.41-0.48-0.41 h-3.84c-0.24,0-0.43,0.17-0.47,0.41L9.25,5.35C8.66,5.59,8.12,5.92,7.63,6.29L5.24,5.33c-0.22-0.08-0.47,0-0.59,0.22L2.73,8.87 C2.62,9.08,2.66,9.34,2.86,9.48l2.03,1.58C4.84,11.36,4.8,11.69,4.8,12s0.02,0.64,0.06,0.94l-2.03,1.58 c-0.18,0.14-0.23,0.41-0.12,0.61l1.92,3.32c0.12,0.22,0.37,0.29,0.59,0.22l2.39-0.96c0.5,0.38,1.03,0.7,1.62,0.94l0.36,2.54 c0.05,0.24,0.24,0.41,0.48,0.41h3.84c0.24,0,0.44-0.17,0.47-0.41l0.36-2.54c0.59-0.24,1.13-0.56,1.62-0.94l2.39,0.96 c0.22,0.08,0.47,0,0.59-0.22l1.92-3.32c0.12-0.22,0.07-0.49-0.12-0.61L19.14,12.94z M12,15.6c-1.98,0-3.6-1.62-3.6-3.6 s1.62-3.6,3.6-3.6s3.6,1.62,3.6,3.6S13.98,15.6,12,15.6z" stroke="white" fill="none" stroke-width="1.5"/></svg>
        </div>
      ` : ''}
    `;
  }
}
