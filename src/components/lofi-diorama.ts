import { LitElement, html, css } from 'lit';
import { customElement, property, query } from 'lit/decorators.js';
import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';

import { AudioManager } from '../utils/audio-manager';
import { TrackerScreen } from '../utils/tracker-screen';

const MM_TO_UNITS = 0.0285;
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

  @property({ type: String })
  weather: 'sunny' | 'rainy' = 'sunny';

  @property({ type: Array })
  activeGear: string[] = ['polyend', 'circuit_tracks', 'mood', 'blooper', 'sp404'];

  @query('.canvas-container')
  container!: HTMLDivElement;

  private scene!: THREE.Scene;
  private camera!: THREE.OrthographicCamera;
  private renderer!: THREE.WebGLRenderer;
  private gearGroup!: THREE.Group;
  
  private resizeObserver!: ResizeObserver;
  private animationFrameId: number | null = null;
  
  // Scene targets
  private trackerScreen!: TrackerScreen;
  private tapeSpools: THREE.Object3D[] = [];
  private circuitPads: THREE.Mesh[] = [];
  private lampBulb!: THREE.Mesh;
  private deskLight!: THREE.PointLight;
  
  // Click/raycasting properties
  private clickableObjects: THREE.Object3D[] = [];
  private draggableObjects: THREE.Object3D[] = [];
  private staticCollisionObjects: THREE.Object3D[] = [];
  private surfaceObjects: THREE.Object3D[] = [];
  private dragObject: THREE.Object3D | null = null;
  private dragOffset: THREE.Vector3 = new THREE.Vector3();
  private dragPlane: THREE.Plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private intersectionPoint: THREE.Vector3 = new THREE.Vector3();

  private raycaster = new THREE.Raycaster();
  private mouse = new THREE.Vector2();
  private boundOnPointerMove = this.onPointerMove.bind(this);
  private boundOnPointerDown = this.onPointerDown.bind(this);
  private boundOnPointerUp = this.onPointerUp.bind(this);
  
  // Weather
  private rainDrops!: THREE.Points;
  private clouds: THREE.Mesh[] = [];
  private sunGlow!: THREE.Mesh;
  private skyMat!: THREE.MeshBasicMaterial;

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
    }

    .canvas-container canvas {
      display: block;
      width: 100% !important;
      height: 100% !important;
    }
  `;

  firstUpdated() {
    this.initThreeJS();
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
        window.removeEventListener('pointerup', this.boundOnPointerUp);
      }
      this.renderer.dispose();
      const gl = this.renderer.getContext();
      const ext = gl.getExtension('WEBGL_lose_context');
      if (ext) ext.loseContext();
    }
    if (this.scene) this.scene.clear();
  }

  updated(changedProperties: Map<string, unknown>) {
    if (changedProperties.has('weather') && this.scene) {
      this.updateWeather();
    }
    if (changedProperties.has('activeGear') && this.scene) {
      this.updateGear();
    }
  }

  private initThreeJS() {
    const width = this.container.clientWidth || 800;
    const height = this.container.clientHeight || 600;

    // Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x1a1520);

    // Orthographic camera — Isometric view
    const aspect = width / height;
    const d = 14;
    this.camera = new THREE.OrthographicCamera(-d * aspect, d * aspect, d, -d, 0.1, 1000);
    this.camera.position.set(20, 25, 13);
    this.camera.lookAt(0, 5, -7);

    // Crisp, clean renderer — Pixar-style
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setSize(width, height, false);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.2;
    this.container.appendChild(this.renderer.domElement);
    
    // Bind pointer events for clickable elements
    this.renderer.domElement.addEventListener('pointermove', this.boundOnPointerMove);
    this.renderer.domElement.addEventListener('pointerdown', this.boundOnPointerDown);
    window.addEventListener('pointerup', this.boundOnPointerUp);

    // Lighting — warm and clear
    const ambient = new THREE.AmbientLight(0xfff0e0, 0.5);
    this.scene.add(ambient);

    // Hemisphere light for natural sky/ground bounce
    const hemiLight = new THREE.HemisphereLight(0x87ceeb, 0x6b4f3a, 0.4);
    this.scene.add(hemiLight);

    // Desk lamp — warm point light
    this.deskLight = new THREE.PointLight(0xffcc77, 60, 40, 2);
    this.deskLight.castShadow = true;
    this.deskLight.shadow.mapSize.width = 2048;
    this.deskLight.shadow.mapSize.height = 2048;
    this.deskLight.shadow.bias = -0.001;

    // Window daylight
    const windowLight = new THREE.DirectionalLight(0xffffff, 1.5);
    windowLight.position.set(0, 20, -30);
    windowLight.castShadow = true;
    windowLight.shadow.mapSize.width = 2048;
    windowLight.shadow.mapSize.height = 2048;
    windowLight.shadow.camera.left = -20;
    windowLight.shadow.camera.right = 20;
    windowLight.shadow.camera.top = 20;
    windowLight.shadow.camera.bottom = -10;
    this.scene.add(windowLight);

    // Build scene
    this.buildRoom();
    this.buildDesk();
    
    this.gearGroup = new THREE.Group();
    this.scene.add(this.gearGroup);
    this.updateGear();
    
    this.buildClutter();
    this.buildWindow();
    this.buildWeather();
  }

  private buildRoom() {
    this.staticCollisionObjects = [];
    this.surfaceObjects = [];

    // Floor
    const textureLoader = new THREE.TextureLoader();
    const floorTex = textureLoader.load('/dark_wood_floor.png');
    floorTex.wrapS = THREE.MirroredRepeatWrapping;
    floorTex.wrapT = THREE.MirroredRepeatWrapping;
    floorTex.repeat.set(2, 2);
    
    const floorGeo = new THREE.PlaneGeometry(120, 120);
    const floorMat = new THREE.MeshStandardMaterial({ 
      map: floorTex, 
      roughness: 1.0, 
      metalness: 0.0
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0;
    floor.receiveShadow = true;
    this.scene.add(floor);
    this.surfaceObjects.push(floor);

    // Back wall (behind the window)
    const wallTex = textureLoader.load('/warm_retro_wallpaper.png');
    wallTex.wrapS = THREE.RepeatWrapping;
    wallTex.wrapT = THREE.RepeatWrapping;
    wallTex.repeat.set(6.6, 4);
    wallTex.colorSpace = THREE.SRGBColorSpace;
    
    const wallMat = new THREE.MeshStandardMaterial({ 
      map: wallTex,
      roughness: 0.85 
    });
    
    // Wall sections around window
    // Left of window
    const wallLeft = new THREE.Mesh(new THREE.BoxGeometry(10, 40, 0.5), wallMat);
    wallLeft.position.set(-13, 20, -15);
    wallLeft.receiveShadow = true;
    this.scene.add(wallLeft);
    
    // Right of window - extended to cover the entire right side
    const wallRight = new THREE.Mesh(new THREE.BoxGeometry(40, 40, 0.5), wallMat);
    wallRight.position.set(28, 20, -15);
    wallRight.receiveShadow = true;
    this.scene.add(wallRight);
    
    // Above window
    const wallAbove = new THREE.Mesh(new THREE.BoxGeometry(16.5, 23.6, 0.5), wallMat);
    wallAbove.position.set(0, 28.2, -15);
    wallAbove.receiveShadow = true;
    this.scene.add(wallAbove);
    
    // Below window (window sill area)
    const wallBelow = new THREE.Mesh(new THREE.BoxGeometry(16.5, 8.0, 0.5), wallMat);
    wallBelow.position.set(0, 4.0, -15);
    wallBelow.receiveShadow = true;
    this.scene.add(wallBelow);

    // Side walls (fading into periphery)
    const sideWallTex = wallTex.clone();
    sideWallTex.repeat.set(12, 4);
    
    const sideWallMat = new THREE.MeshStandardMaterial({ 
      map: sideWallTex,
      color: 0xdddddd, // slightly shadowed/dimmer for depth
      roughness: 0.9 
    });
    const leftWall = new THREE.Mesh(new THREE.BoxGeometry(0.5, 40, 120), sideWallMat);
    leftWall.position.set(-18, 20, 30);
    leftWall.receiveShadow = true;
    this.scene.add(leftWall);
    
    this.staticCollisionObjects.push(wallLeft, wallRight, wallAbove, wallBelow, leftWall);
  }

  private buildDesk() {
    // Desk surface
    const textureLoader = new THREE.TextureLoader();
    const deskTex = textureLoader.load('/polished_desk_wood.png');
    deskTex.wrapS = THREE.RepeatWrapping;
    deskTex.wrapT = THREE.RepeatWrapping;
    deskTex.repeat.set(1.5, 1.0);
    deskTex.colorSpace = THREE.SRGBColorSpace;

    const deskMat = new THREE.MeshStandardMaterial({ 
      map: deskTex, 
      roughness: 0.4, 
      metalness: 0.05 
    });
    const deskTop = new THREE.Mesh(new THREE.BoxGeometry(22, 0.8, 14), deskMat);
    deskTop.position.set(0, 5.6, -7);
    deskTop.castShadow = true;
    deskTop.receiveShadow = true;
    this.scene.add(deskTop);
    this.surfaceObjects.push(deskTop);

    // Desk legs
    const legMat = new THREE.MeshStandardMaterial({ color: 0x3a2518, roughness: 0.5 });
    const legGeo = new THREE.BoxGeometry(0.8, 5.6, 0.8);
    const legPositions = [[-10, 2.8, -1], [10, 2.8, -1], [-10, 2.8, -13], [10, 2.8, -13]];
    for (const pos of legPositions) {
      const leg = new THREE.Mesh(legGeo, legMat);
      leg.position.set(pos[0], pos[1], pos[2]);
      leg.castShadow = true;
      this.scene.add(leg);
    }
  }

  private loadOrPlaceObject(obj: THREE.Object3D, name: string, defaultX: number, defaultY: number, defaultZ: number) {
    obj.name = name;
    
    // Initial position to calculate box
    obj.position.set(defaultX, defaultY, defaultZ);
    obj.updateMatrixWorld(true);
    
    const saved = localStorage.getItem(`lofi_pos_${name}`);
    if (saved) {
      try {
        const {x, y, z} = JSON.parse(saved);
        obj.position.set(x, y, z);
        obj.updateMatrixWorld(true);
      } catch (e) {
        console.error('Failed to load position', e);
      }
    } else {
      // Find empty spot dynamically
      this.resolveOverlap(obj);
    }
    
    this.draggableObjects.push(obj);
  }

  private resolveOverlap(obj: THREE.Object3D) {
    const box = new THREE.Box3().setFromObject(obj);
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
          const otherBox = new THREE.Box3().setFromObject(other);
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
        box.setFromObject(obj);
      }
    }
  }

  private saveLayout() {
    for (const obj of this.draggableObjects) {
      if (obj.name) {
        localStorage.setItem(`lofi_pos_${obj.name}`, JSON.stringify({
          x: obj.position.x,
          y: obj.position.y,
          z: obj.position.z
        }));
      }
    }
  }

  private updateGear() {
    if (!this.gearGroup) return;

    // Clear old gear
    this.draggableObjects = this.draggableObjects.filter(obj => !this.gearGroup.children.includes(obj));
    this.gearGroup.clear(); 
    this.tapeSpools = [];
    this.circuitPads = [];
    
    if (this.activeGear.includes('polyend')) this.buildPolyend();
    if (this.activeGear.includes('circuit_tracks')) this.buildCircuitTracks();
    if (this.activeGear.includes('mood')) this.buildMood();
    if (this.activeGear.includes('blooper')) this.buildBlooper();
    if (this.activeGear.includes('reel')) this.buildReel();
    if (this.activeGear.includes('sp404')) this.buildSP404();
    if (this.activeGear.includes('strat')) this.buildStrat();
  }

  private buildPolyend() {
    this.trackerScreen = new TrackerScreen();
    const textureLoader = new THREE.TextureLoader();
    const topTex = textureLoader.load('/tracker_ref.png');
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
    trackerBody.rotation.y = 0.05;
    trackerBody.castShadow = true;
    trackerBody.receiveShadow = true;
    this.loadOrPlaceObject(trackerBody, 'polyend', -3.5, 6.47, -8);
    
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

  private buildCircuitTracks() {
    const textureLoader = new THREE.TextureLoader();
    const topTex = textureLoader.load('/circuit_ref.png');
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
    ctBody.rotation.y = -0.08;
    ctBody.castShadow = true;
    ctBody.receiveShadow = true;
    this.loadOrPlaceObject(ctBody, 'circuit_tracks', 3.5, 6.43, -4);

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
        this.circuitPads.push(padOverlay); // Adds back dynamic lighting capability
        ctBody.add(padOverlay);
      }
    }
    this.gearGroup.add(ctBody);
  }

  private buildMood() {
    const pGroup = this.buildBasePedal(0xffa07a, -7.5, -5, 0.1, 'mood', '/mood_texture.png'); // Salmon Peach
    this.gearGroup.add(pGroup);
  }

  private buildBlooper() {
    const pGroup = this.buildBasePedal(0xa4c8e1, -9.5, -5, -0.05, 'blooper', '/blooper_texture.png'); // Pastel Blue
    this.gearGroup.add(pGroup);
  }

  private buildBasePedal(colorHex: number, x: number, z: number, rotY: number, name: string, topTexturePath?: string) {
    const pedal = new THREE.Group();
    pedal.rotation.y = rotY;
    this.loadOrPlaceObject(pedal, name, x, 6.86, z); // Sits exactly on the desk (Y=6.0)

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
    for(let i = 0; i < 3; i++) {
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

  private buildReel() {
    const reelGroup = new THREE.Group();
    reelGroup.rotation.y = -0.2;
    this.loadOrPlaceObject(reelGroup, 'reel', 8.5, 8.25, -10);

    // Wood sides
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x4a3018, roughness: 0.8, metalness: 0.1 });
    const sideL = new THREE.Mesh(new THREE.BoxGeometry(0.3, 4.5, 1.5), woodMat);
    sideL.position.set(-1.6, 0, 0);
    reelGroup.add(sideL);
    
    const sideR = new THREE.Mesh(new THREE.BoxGeometry(0.3, 4.5, 1.5), woodMat);
    sideR.position.set(1.6, 0, 0);
    reelGroup.add(sideR);

    // Silver Faceplate
    const faceMat = new THREE.MeshStandardMaterial({ color: 0xd0d0d0, metalness: 0.8, roughness: 0.3 });
    const face = new THREE.Mesh(new THREE.BoxGeometry(2.9, 4.5, 1.3), faceMat);
    face.position.set(0, 0, 0);
    reelGroup.add(face);

    // Tape Spools
    const spoolMat = new THREE.MeshStandardMaterial({ color: 0xc0c0c0, metalness: 0.9, roughness: 0.2 });
    const tapeMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.8 });
    
    const createSpool = (x: number, y: number) => {
      const spoolGroup = new THREE.Group();
      spoolGroup.position.set(x, y, 0.75);
      
      const flange = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.0, 0.05, 32), spoolMat);
      flange.rotation.x = Math.PI / 2;
      spoolGroup.add(flange);
      
      const tape = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.85, 0.06, 32), tapeMat);
      tape.rotation.x = Math.PI / 2;
      spoolGroup.add(tape);

      return spoolGroup;
    };

    const spool1 = createSpool(-0.75, 0.8);
    const spool2 = createSpool(0.75, 0.8);
    reelGroup.add(spool1, spool2);
    this.tapeSpools.push(spool1, spool2);

    // Head stack block
    const headMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.5 });
    const headStack = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.6, 0.2), headMat);
    headStack.position.set(0, -0.6, 0.75);
    reelGroup.add(headStack);

    // VU Meters
    const vuMat = new THREE.MeshStandardMaterial({ color: 0xeeeedd, emissive: 0x333322 });
    const vu1 = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.4, 0.1), vuMat);
    vu1.position.set(-0.4, -1.5, 0.7);
    reelGroup.add(vu1);
    
    const vu2 = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.4, 0.1), vuMat);
    vu2.position.set(0.4, -1.5, 0.7);
    reelGroup.add(vu2);

    reelGroup.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });

    this.gearGroup.add(reelGroup);
  }

  private buildSP404() {
    const textureLoader = new THREE.TextureLoader();
    const topTex = textureLoader.load('/sp404_ref.png');
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
    spBody.rotation.y = -0.03;
    spBody.castShadow = true;
    spBody.receiveShadow = true;
    this.loadOrPlaceObject(spBody, 'sp404', -3.5, 7.0, -2.5);

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
        this.circuitPads.push(padOverlay); // Add back dynamic lighting capability
        spBody.add(padOverlay);
      }
    }

    this.gearGroup.add(spBody);
  }

  private stratModel: THREE.Group | null = null;
  private stratLoading = false;

  private buildStrat() {
    // Prevent duplicate loading from hot-reloads or fast property changes
    if (this.stratModel) {
      if (!this.gearGroup.children.includes(this.stratModel)) {
        this.loadOrPlaceObject(this.stratModel, 'strat', -14, 12, -5);
        this.gearGroup.add(this.stratModel);
      }
      return;
    }
    if (this.stratLoading) return;
    this.stratLoading = true;

    const loader = new FBXLoader();
    loader.load('/guitar/stratocaster.FBX', (object) => {
      this.stratLoading = false;

      // Normalize scale (950mm real world length)
      const MM_TO_UNITS = 0.0285;
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

      // Leaning against left wall
      stratGroup.rotation.x = -0.2; 
      stratGroup.rotation.y = 0.6;  
      stratGroup.rotation.z = -0.15;
      
      this.stratModel = stratGroup;
      
      if (this.activeGear.includes('strat')) {
        this.loadOrPlaceObject(stratGroup, 'strat', -14, 12, -5);
        this.gearGroup.add(stratGroup);
      }
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

    this.scene.add(lampGroup);
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
    
    this.scene.add(mugGroup);
    this.loadOrPlaceObject(mugGroup, 'mug', -7.5, 6.0, -3);

    // Small plant on right side of desk
    const plantGroup = new THREE.Group();
    const potMat = new THREE.MeshStandardMaterial({ color: 0xcc6633, roughness: 0.85 });
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.4, 1.0, 16), potMat);
    pot.position.set(0, 0.5, 0);
    pot.castShadow = true;
    plantGroup.add(pot);

    const soilMat = new THREE.MeshStandardMaterial({ color: 0x3a2a1a, roughness: 0.9 });
    const soil = new THREE.Mesh(new THREE.CircleGeometry(0.55, 16), soilMat);
    soil.rotation.x = -Math.PI / 2;
    soil.position.set(0, 1.0, 0);
    plantGroup.add(soil);

    const leafMat = new THREE.MeshStandardMaterial({ color: 0x3a7a2a, roughness: 0.5 });
    for (let i = 0; i < 5; i++) {
      const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.4, 8, 8), leafMat);
      leaf.scale.set(1, 0.2, 1.2);
      leaf.position.set(
        (Math.random() - 0.5) * 0.5,
        1.4 + Math.random() * 0.6,
        (Math.random() - 0.5) * 0.5
      );
      leaf.rotation.set(Math.random(), Math.random(), Math.random());
      plantGroup.add(leaf);
    }
    this.scene.add(plantGroup);
    this.loadOrPlaceObject(plantGroup, 'plant', 10.0, 6.0, -6);

    // Headphones on the desk (right side)
    const hpGroup = new THREE.Group();
    const hpMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.3, metalness: 0.5 });
    const headband = new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.12, 8, 32, Math.PI), hpMat);
    headband.position.set(0, 0.6, -0.5);
    headband.rotation.x = Math.PI / 2;
    headband.rotation.z = 0.3;
    headband.castShadow = true;
    hpGroup.add(headband);
    
    const cupMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.4 });
    const cup1 = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.3, 16), cupMat);
    cup1.position.set(-0.9, 0.3, -0.7);
    cup1.rotation.x = Math.PI / 2;
    cup1.castShadow = true;
    hpGroup.add(cup1);
    
    const cup2 = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.3, 16), cupMat);
    cup2.position.set(0.9, 0.3, 0);
    cup2.rotation.x = Math.PI / 2;
    cup2.castShadow = true;
    hpGroup.add(cup2);
    
    this.scene.add(hpGroup);
    this.loadOrPlaceObject(hpGroup, 'headphones', 9.5, 6.0, -1.5);
  }

  private buildWindow() {
    // Window frame
    const textureLoader = new THREE.TextureLoader();
    const frameTex = textureLoader.load('/painted_cream_wood.png');
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
    frameTop.position.set(0, 16.4, -14.8);
    this.scene.add(frameTop);
    
    const frameBottom = new THREE.Mesh(new THREE.BoxGeometry(16.5, 0.8, 1.5), frameMat);
    frameBottom.position.set(0, 8.0, -14.6);
    this.scene.add(frameBottom);
    
    const frameL = new THREE.Mesh(new THREE.BoxGeometry(0.8, 9, 1), frameMat);
    frameL.position.set(-8, 12.2, -14.8);
    this.scene.add(frameL);
    
    const frameR = new THREE.Mesh(new THREE.BoxGeometry(0.8, 9, 1), frameMat);
    frameR.position.set(8, 12.2, -14.8);
    this.scene.add(frameR);
    
    // Center cross dividers
    const frameMidH = new THREE.Mesh(new THREE.BoxGeometry(15.5, 0.5, 0.8), frameMat);
    frameMidH.position.set(0, 12.2, -14.8);
    this.scene.add(frameMidH);
    
    const frameMidV = new THREE.Mesh(new THREE.BoxGeometry(0.5, 9, 0.8), frameMat);
    frameMidV.position.set(0, 12.2, -14.8);
    this.scene.add(frameMidV);

    // Window sill
    const sillMat = new THREE.MeshStandardMaterial({ 
      map: frameTex, 
      roughness: 0.5 
    });
    const sill = new THREE.Mesh(new THREE.BoxGeometry(17, 0.4, 2), sillMat);
    sill.position.set(0, 8.4, -14);
    sill.castShadow = true;
    this.scene.add(sill);

    this.staticCollisionObjects.push(frameTop, frameBottom, frameL, frameR, frameMidH, frameMidV, sill);
  }

  private buildWeather() {
    // Sky backdrop behind the window
    const skyColor = this.weather === 'sunny' ? 0x87ceeb : 0x6b7b8d;
    this.skyMat = new THREE.MeshBasicMaterial({ color: skyColor, fog: false });
    const skyGeo = new THREE.PlaneGeometry(40, 20);
    const sky = new THREE.Mesh(skyGeo, this.skyMat);
    sky.position.set(0, 12.2, -20);
    sky.name = 'sky';
    this.scene.add(sky);

    // Sun glow
    const sunMat = new THREE.MeshBasicMaterial({ color: 0xffffcc, transparent: true, opacity: 0.9 });
    this.sunGlow = new THREE.Mesh(new THREE.CircleGeometry(2.5, 32), sunMat);
    this.sunGlow.position.set(4, 14, -19.5);
    this.sunGlow.name = 'sunGlow';
    this.sunGlow.visible = this.weather === 'sunny';
    this.scene.add(this.sunGlow);
    
    // Sun halo
    const haloMat = new THREE.MeshBasicMaterial({ color: 0xffeedd, transparent: true, opacity: 0.3 });
    const halo = new THREE.Mesh(new THREE.CircleGeometry(4.5, 32), haloMat);
    halo.position.set(4, 14, -19.6);
    halo.name = 'sunHalo';
    halo.visible = this.weather === 'sunny';
    this.scene.add(halo);

    // Clouds
    const cloudMat = new THREE.MeshBasicMaterial({ 
      color: this.weather === 'sunny' ? 0xffffff : 0x555566, 
      transparent: true, opacity: 0.7 
    });
    
    const cloudPositions = [
      [-6, 14.5, -19], [2, 15, -19], [8, 14, -19],
      [-3, 13.5, -18.5], [6, 15.5, -18.5]
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
      this.scene.add(cloudGroup);
    }

    // Rain particles (hidden if sunny)
    const rainCount = 500;
    const rainGeo = new THREE.BufferGeometry();
    const rainPositions = new Float32Array(rainCount * 3);
    for (let i = 0; i < rainCount; i++) {
      rainPositions[i * 3] = (Math.random() - 0.5) * 16;
      rainPositions[i * 3 + 1] = Math.random() * 10 + 8;
      rainPositions[i * 3 + 2] = -15 + Math.random() * 3;
    }
    rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPositions, 3));
    
    const rainMat = new THREE.PointsMaterial({
      color: 0x8899bb,
      size: 0.08,
      transparent: true,
      opacity: 0.7,
    });
    
    this.rainDrops = new THREE.Points(rainGeo, rainMat);
    this.rainDrops.visible = this.weather === 'rainy';
    this.scene.add(this.rainDrops);
  }

  private updateWeather() {
    const isSunny = this.weather === 'sunny';
    
    // Sky color
    if (this.skyMat) {
      this.skyMat.color.setHex(isSunny ? 0x87ceeb : 0x6b7b8d);
    }
    
    // Sun visibility
    this.scene.traverse((obj) => {
      if (obj.name === 'sunGlow' || obj.name === 'sunHalo') {
        obj.visible = isSunny;
      }
    });
    
    // Cloud color
    this.clouds.forEach((cloud) => {
      cloud.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          const mat = (child as THREE.Mesh).material as THREE.MeshBasicMaterial;
          mat.color.setHex(isSunny ? 0xffffff : 0x555566);
          mat.opacity = isSunny ? 0.7 : 0.85;
        }
      });
    });
    
    // Rain visibility
    if (this.rainDrops) {
      this.rainDrops.visible = !isSunny;
    }

    // Update ambient tone
    this.scene.traverse((obj) => {
      if (obj instanceof THREE.AmbientLight) {
        obj.color.setHex(isSunny ? 0xfff0e0 : 0xc0c0d0);
        obj.intensity = isSunny ? 0.5 : 0.35;
      }
      if (obj instanceof THREE.HemisphereLight) {
        obj.color.setHex(isSunny ? 0x87ceeb : 0x556677);
      }
      if (obj instanceof THREE.DirectionalLight) {
        obj.intensity = isSunny ? 1.5 : 0.6;
        obj.color.setHex(isSunny ? 0xffffff : 0x8899aa);
      }
    });
  }

  private handleResize() {
    if (!this.container || !this.renderer || !this.camera) return;
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    if (width === 0 || height === 0) return;

    const aspect = width / height;
    const d = 14;
    this.camera.left = -d * aspect;
    this.camera.right = d * aspect;
    this.camera.top = d;
    this.camera.bottom = -d;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }

  private startLoop() {
    const loop = () => {
      this.renderScene();
      this.animationFrameId = requestAnimationFrame(loop);
    };
    this.animationFrameId = requestAnimationFrame(loop);
  }

  private renderScene() {
    if (!this.renderer || !this.scene || !this.camera) return;

    let amplitude = 0;
    let bass = 0;
    let freqs: number[] = new Array(8).fill(0);
    
    if (this.audioManager && this.audioManager.isLoaded) {
      if (this.audioManager.isPlaying) {
        const rt = this.audioManager.getRealTimeData();
        amplitude = rt.amplitude;
        let bassSum = 0;
        for (let i = 0; i < 4; i++) bassSum += (rt.frequencies[i] || 0);
        bass = (bassSum / 4) / 255.0;
        for (let i = 0; i < 8; i++) freqs[i] = (rt.frequencies[i * 10] || 0) / 255.0;
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
      this.trackerScreen.update(amplitude, bass);
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
        if (positions[i * 3 + 1] < 8) {
          positions[i * 3 + 1] = 18;
          positions[i * 3] = (Math.random() - 0.5) * 16;
        }
      }
      this.rainDrops.geometry.attributes.position.needsUpdate = true;
    }

    this.renderer.render(this.scene, this.camera);
  }

  private onPointerMove(event: PointerEvent) {
    if (!this.renderer) return;
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, this.camera);

    if (this.dragObject) {
      this.raycaster.ray.intersectPlane(this.dragPlane, this.intersectionPoint);
      const newPos = this.intersectionPoint.clone().sub(this.dragOffset);
      
      const oldPos = this.dragObject.position.clone();
      this.dragObject.position.x = newPos.x;
      this.dragObject.position.z = newPos.z;
      
      // Update matrices to ensure bounding boxes are perfectly accurate
      this.dragObject.updateMatrixWorld(true);
      const updatedBox = new THREE.Box3().setFromObject(this.dragObject);
      
      let collision = false;
      const allColliders = [
        ...this.draggableObjects,
        ...this.clickableObjects,
        ...this.staticCollisionObjects
      ];

      for (const other of allColliders) {
        if (other !== this.dragObject && other.visible) {
          other.updateMatrixWorld(true);
          const otherBox = new THREE.Box3().setFromObject(other);
          
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

    const intersects = this.raycaster.intersectObjects([...this.clickableObjects, ...this.draggableObjects], true);
    if (intersects.length > 0) {
      this.renderer.domElement.style.cursor = 'pointer';
    } else {
      this.renderer.domElement.style.cursor = 'default';
    }
  }

  private onPointerDown(event: PointerEvent) {
    if (!this.renderer) return;
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, this.camera);
    const intersects = this.raycaster.intersectObjects([...this.clickableObjects, ...this.draggableObjects], true);

    if (intersects.length > 0) {
      const object = intersects[0].object;
      
      // Bubble up to find if it's a draggable gear
      let dragTarget: THREE.Object3D | null = object;
      while (dragTarget && !this.draggableObjects.includes(dragTarget) && dragTarget !== this.scene) {
        dragTarget = dragTarget.parent;
      }
      
      if (dragTarget && this.draggableObjects.includes(dragTarget)) {
        this.dragObject = dragTarget;
        
        // Lift the object slightly into the air to feel like dragging
        const liftHeight = Math.max(dragTarget.position.y + 0.5, 7.5);
        this.dragPlane.constant = -liftHeight;
        
        // Physically lift it so it renders above other objects while dragging
        dragTarget.position.y = liftHeight;
        
        this.raycaster.ray.intersectPlane(this.dragPlane, this.intersectionPoint);
        this.dragOffset.copy(this.intersectionPoint).sub(dragTarget.position);
      } else {
        // Toggle settings ONLY if we click on clutter (like the lamp, cup, etc.)
        this.dispatchEvent(new CustomEvent('toggle-settings', { bubbles: true, composed: true }));
      }
    }
  }

  private onPointerUp() {
    if (this.dragObject) {
      // Cast a ray straight down from the object's center to find the surface (Desk or Floor)
      const raycaster = new THREE.Raycaster();
      this.dragObject.updateMatrixWorld(true);
      
      // Compute the height of the object (to know how much to offset its Y position)
      const box = new THREE.Box3().setFromObject(this.dragObject);
      const objectHeight = box.max.y - box.min.y;
      
      // Raycast downwards from the center of the bounding box
      const center = new THREE.Vector3();
      box.getCenter(center);
      raycaster.set(center, new THREE.Vector3(0, -1, 0));
      
      const intersects = raycaster.intersectObjects(this.surfaceObjects, false);
      
      if (intersects.length > 0) {
        // Find the topmost surface intersected
        const topIntersect = intersects[0];
        // The object's Y position should be the surface's Y point plus half the object's height
        const newY = topIntersect.point.y + (objectHeight / 2);
        
        this.dragObject.position.y = newY;
        this.dragObject.updateMatrixWorld(true);
      }
      
      // If dropped onto another object, bounce it to the nearest free space
      this.resolveOverlap(this.dragObject);
      
      this.saveLayout();
    }

    this.dragObject = null;
  }

  render() {
    return html`<div class="canvas-container"></div>`;
  }
}
