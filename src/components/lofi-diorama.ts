import { LitElement, html, css } from 'lit';
import { customElement, property, query } from 'lit/decorators.js';
import * as THREE from 'three';

import { AudioManager } from '../utils/audio-manager';
import { TrackerScreen } from '../utils/tracker-screen';

@customElement('lofi-diorama')
export class LofiDiorama extends LitElement {
  @property({ type: Object })
  audioManager: AudioManager | null = null;

  @property({ type: String })
  weather: 'sunny' | 'rainy' = 'sunny';

  @query('.canvas-container')
  container!: HTMLDivElement;

  private scene!: THREE.Scene;
  private camera!: THREE.OrthographicCamera;
  private renderer!: THREE.WebGLRenderer;
  
  private resizeObserver!: ResizeObserver;
  private animationFrameId: number | null = null;
  
  // Scene targets
  private trackerScreen!: TrackerScreen;
  private tapeSpools: THREE.Mesh[] = [];
  private circuitPads: THREE.Mesh[] = [];
  private lampBulb!: THREE.Mesh;
  private deskLight!: THREE.PointLight;
  
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

    // Lighting — warm and clear
    const ambient = new THREE.AmbientLight(0xfff0e0, 0.5);
    this.scene.add(ambient);

    // Hemisphere light for natural sky/ground bounce
    const hemiLight = new THREE.HemisphereLight(0x87ceeb, 0x6b4f3a, 0.4);
    this.scene.add(hemiLight);

    // Desk lamp — warm point light
    this.deskLight = new THREE.PointLight(0xffcc77, 60, 40, 2);
    this.deskLight.position.set(-8.5, 12, 2);
    this.deskLight.castShadow = true;
    this.deskLight.shadow.mapSize.width = 2048;
    this.deskLight.shadow.mapSize.height = 2048;
    this.deskLight.shadow.bias = -0.001;
    this.scene.add(this.deskLight);

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
    this.buildGear();
    this.buildClutter();
    this.buildWindow();
    this.buildWeather();
  }

  private buildRoom() {
    // Floor
    const textureLoader = new THREE.TextureLoader();
    const floorTex = textureLoader.load('/dark_wood_floor.png');
    floorTex.wrapS = THREE.RepeatWrapping;
    floorTex.wrapT = THREE.RepeatWrapping;
    floorTex.repeat.set(4, 4);
    
    const floorGeo = new THREE.PlaneGeometry(60, 60);
    const floorMat = new THREE.MeshStandardMaterial({ 
      map: floorTex, roughness: 0.6, metalness: 0.05
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0;
    floor.receiveShadow = true;
    this.scene.add(floor);

    // Back wall (behind the window)
    const wallMat = new THREE.MeshStandardMaterial({ color: 0xc8a882, roughness: 0.85 });
    
    // Wall sections around window
    // Left of window
    const wallLeft = new THREE.Mesh(new THREE.BoxGeometry(10, 24, 0.5), wallMat);
    wallLeft.position.set(-13, 12, -15);
    wallLeft.receiveShadow = true;
    this.scene.add(wallLeft);
    
    // Right of window
    const wallRight = new THREE.Mesh(new THREE.BoxGeometry(10, 24, 0.5), wallMat);
    wallRight.position.set(13, 12, -15);
    wallRight.receiveShadow = true;
    this.scene.add(wallRight);
    
    // Above window
    const wallAbove = new THREE.Mesh(new THREE.BoxGeometry(16.5, 7.6, 0.5), wallMat);
    wallAbove.position.set(0, 20.2, -15);
    wallAbove.receiveShadow = true;
    this.scene.add(wallAbove);
    
    // Below window (window sill area)
    const wallBelow = new THREE.Mesh(new THREE.BoxGeometry(16.5, 8.0, 0.5), wallMat);
    wallBelow.position.set(0, 4.0, -15);
    wallBelow.receiveShadow = true;
    this.scene.add(wallBelow);

    // Side walls (fading into periphery)
    const sideWallMat = new THREE.MeshStandardMaterial({ color: 0xb89878, roughness: 0.9 });
    const leftWall = new THREE.Mesh(new THREE.BoxGeometry(0.5, 24, 30), sideWallMat);
    leftWall.position.set(-18, 12, 0);
    leftWall.receiveShadow = true;
    this.scene.add(leftWall);
    
    const rightWall = new THREE.Mesh(new THREE.BoxGeometry(0.5, 24, 30), sideWallMat);
    rightWall.position.set(18, 12, 0);
    rightWall.receiveShadow = true;
    this.scene.add(rightWall);
  }

  private buildDesk() {
    // Desk surface
    const deskMat = new THREE.MeshStandardMaterial({ color: 0x5c3d2e, roughness: 0.4, metalness: 0.05 });
    const deskTop = new THREE.Mesh(new THREE.BoxGeometry(22, 0.8, 14), deskMat);
    deskTop.position.set(0, 5.6, -7);
    deskTop.castShadow = true;
    deskTop.receiveShadow = true;
    this.scene.add(deskTop);

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

  private buildGear() {
    // Polyend Tracker — center of desk
    this.trackerScreen = new TrackerScreen();
    
    const trackerBodyMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.15, metalness: 0.85 });
    const trackerBody = new THREE.Mesh(new THREE.BoxGeometry(7, 0.5, 8), trackerBodyMat);
    trackerBody.position.set(-2, 6.2, -7);
    trackerBody.rotation.y = 0.05;
    trackerBody.castShadow = true;
    trackerBody.receiveShadow = true;
    
    // Screen
    const screenMat = new THREE.MeshStandardMaterial({
      map: this.trackerScreen.texture, emissiveMap: this.trackerScreen.texture,
      emissive: 0xffffff, emissiveIntensity: 1.5,
    });
    const screen = new THREE.Mesh(new THREE.BoxGeometry(5.5, 0.1, 3.2), screenMat);
    screen.position.set(-0.3, 0.4, -1.8);
    screen.rotation.x = 0.1;
    trackerBody.add(screen);

    // Jog wheel
    const wheelMat = new THREE.MeshStandardMaterial({ color: 0xc0c0c0, metalness: 0.9, roughness: 0.15 });
    const jogWheel = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 0.3, 32), wheelMat);
    jogWheel.position.set(2.8, 0.35, -1.8);
    jogWheel.rotation.x = 0.1;
    jogWheel.castShadow = true;
    trackerBody.add(jogWheel);

    // Pad grid
    const keyMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.4 });
    for (let x = 0; x < 4; x++) {
      for (let y = 0; y < 8; y++) {
        const key = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.2, 0.3), keyMat);
        key.position.set(-2.5 + x * 1.4, 0.3, 0.5 + y * 0.4);
        trackerBody.add(key);
      }
    }
    this.scene.add(trackerBody);

    // Circuit Tracks — right of Polyend
    const ctBodyMat = new THREE.MeshStandardMaterial({ color: 0x181a20, roughness: 0.25, metalness: 0.65 });
    const ctBody = new THREE.Mesh(new THREE.BoxGeometry(8, 0.5, 5), ctBodyMat);
    ctBody.position.set(6, 6.2, -6);
    ctBody.rotation.y = -0.08;
    ctBody.castShadow = true;
    ctBody.receiveShadow = true;

    // Knobs
    const ctKnobMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.2, metalness: 0.9 });
    for (let i = 0; i < 8; i++) {
      const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.3, 16), ctKnobMat);
      knob.position.set(-2.8 + i * 0.78, 0.35, -1.8);
      ctBody.add(knob);
    }

    // Pads
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 8; col++) {
        const padMat = new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0x000000 });
        const pad = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.1, 0.65), padMat);
        pad.position.set(-2.8 + col * 0.78, 0.3, -0.5 + row * 0.75);
        this.circuitPads.push(pad);
        ctBody.add(pad);
      }
    }
    this.scene.add(ctBody);

    // Chase Bliss pedals — left side of desk
    const buildPedal = (colorHex: number, x: number, z: number, rot: number) => {
      const pMat = new THREE.MeshStandardMaterial({ color: colorHex, metalness: 0.7, roughness: 0.25 });
      const pedal = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.8, 2.5), pMat);
      pedal.position.set(x, 6.4, z);
      pedal.rotation.y = rot;
      pedal.castShadow = true;
      pedal.receiveShadow = true;

      const knobMat = new THREE.MeshStandardMaterial({ color: 0x111111 });
      for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 2; j++) {
          const k = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.15, 16), knobMat);
          k.position.set(-0.4 + i * 0.4, 0.5, -0.8 + j * 0.5);
          pedal.add(k);
        }
      }

      const stompMat = new THREE.MeshStandardMaterial({ color: 0xdddddd, metalness: 1.0 });
      const s1 = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.25, 16), stompMat);
      s1.position.set(-0.4, 0.5, 0.8); pedal.add(s1);
      const s2 = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.25, 16), stompMat);
      s2.position.set(0.4, 0.5, 0.8); pedal.add(s2);
      
      this.scene.add(pedal);
    };

    buildPedal(0xcc7777, -7.5, -5, 0.1);  // MOOD
    buildPedal(0x4a6ea8, -9.5, -5, -0.05); // Blooper

    // Reel-to-reel (Templo)
    const reelMat = new THREE.MeshStandardMaterial({ color: 0xa0a0a0, metalness: 0.9, roughness: 0.2 });
    const reel = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.8, 3), reelMat);
    reel.position.set(8.5, 6.4, -10);
    reel.rotation.y = 0.15;
    reel.castShadow = true;
    reel.receiveShadow = true;

    const spoolMat = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.15 });
    const spool1 = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 0.15, 32), spoolMat);
    spool1.position.set(-0.6, 0.45, -0.5); reel.add(spool1);
    const spool2 = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 0.15, 32), spoolMat);
    spool2.position.set(0.6, 0.45, 0.5); reel.add(spool2);
    this.tapeSpools.push(spool1, spool2);
    this.scene.add(reel);
  }

  private buildClutter() {
    // Desk lamp — left side
    const brassMat = new THREE.MeshStandardMaterial({ color: 0xb5a642, metalness: 0.8, roughness: 0.2 });
    const lampBase = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.0, 0.3, 32), brassMat);
    lampBase.position.set(-8.5, 6.15, -11);
    lampBase.castShadow = true;
    this.scene.add(lampBase);
    
    const lampArm = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 6, 8), brassMat);
    lampArm.position.set(-8.5, 9.2, -11);
    lampArm.rotation.z = -0.15;
    lampArm.castShadow = true;
    this.scene.add(lampArm);
    
    const lampHead = new THREE.Mesh(new THREE.ConeGeometry(1.2, 1.8, 32), brassMat);
    lampHead.position.set(-8.0, 12.2, -11);
    lampHead.rotation.z = Math.PI + 0.3;
    lampHead.castShadow = true;
    this.scene.add(lampHead);

    const bulbMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffcc77, emissiveIntensity: 2.0 });
    this.lampBulb = new THREE.Mesh(new THREE.SphereGeometry(0.4, 16, 16), bulbMat);
    this.lampBulb.position.set(-8.0, 11.2, -11);
    this.scene.add(this.lampBulb);

    // Coffee mug
    const mugMat = new THREE.MeshStandardMaterial({ color: 0xf0f0f0, roughness: 0.3 });
    const mug = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.4, 1.0, 32), mugMat);
    mug.position.set(3, 6.5, -3);
    mug.castShadow = true;
    this.scene.add(mug);
    // Coffee surface
    const coffeeMat = new THREE.MeshStandardMaterial({ color: 0x3a2010, roughness: 0.2 });
    const coffee = new THREE.Mesh(new THREE.CircleGeometry(0.45, 32), coffeeMat);
    coffee.rotation.x = -Math.PI / 2;
    coffee.position.set(3, 7.0, -3);
    this.scene.add(coffee);

    // Small plant on right side of desk
    const potMat = new THREE.MeshStandardMaterial({ color: 0xcc6633, roughness: 0.85 });
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.4, 1.0, 16), potMat);
    pot.position.set(9.5, 6.5, -3.5);
    pot.castShadow = true;
    this.scene.add(pot);

    // Soil
    const soilMat = new THREE.MeshStandardMaterial({ color: 0x3a2a1a, roughness: 0.9 });
    const soil = new THREE.Mesh(new THREE.CircleGeometry(0.55, 16), soilMat);
    soil.rotation.x = -Math.PI / 2;
    soil.position.set(9.5, 7.0, -3.5);
    this.scene.add(soil);

    // Little plant leaves
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x3a7a2a, roughness: 0.5 });
    for (let i = 0; i < 5; i++) {
      const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.4, 8, 8), leafMat);
      leaf.scale.set(1, 0.2, 1.2);
      leaf.position.set(
        9.5 + (Math.random() - 0.5) * 0.5,
        7.4 + Math.random() * 0.6,
        -3.5 + (Math.random() - 0.5) * 0.5
      );
      leaf.rotation.set(Math.random(), Math.random(), Math.random());
      this.scene.add(leaf);
    }

    // Headphones on the desk (right side)
    const hpMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.3, metalness: 0.5 });
    // Headband arc
    const headband = new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.12, 8, 32, Math.PI), hpMat);
    headband.position.set(7.5, 6.6, -2);
    headband.rotation.x = Math.PI / 2;
    headband.rotation.z = 0.3;
    headband.castShadow = true;
    this.scene.add(headband);
    // Ear cups
    const cupMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.4 });
    const cup1 = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.3, 16), cupMat);
    cup1.position.set(6.6, 6.3, -2.2);
    cup1.rotation.x = Math.PI / 2;
    cup1.castShadow = true;
    this.scene.add(cup1);
    const cup2 = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.3, 16), cupMat);
    cup2.position.set(8.4, 6.3, -1.5);
    cup2.rotation.x = Math.PI / 2;
    cup2.castShadow = true;
    this.scene.add(cup2);
  }

  private buildWindow() {
    // Window frame
    const frameMat = new THREE.MeshStandardMaterial({ color: 0xf0ead6, roughness: 0.5 });
    
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
    const sillMat = new THREE.MeshStandardMaterial({ color: 0xf5eed8, roughness: 0.5 });
    const sill = new THREE.Mesh(new THREE.BoxGeometry(17, 0.4, 2), sillMat);
    sill.position.set(0, 8.4, -14);
    sill.castShadow = true;
    this.scene.add(sill);
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
    if (this.trackerScreen) {
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
      this.tapeSpools.forEach(spool => spool.rotation.y -= (bass * 0.6));
    } else {
      this.tapeSpools.forEach(spool => spool.rotation.y -= 0.01);
    }

    // Cloud drift
    const time = Date.now() * 0.0001;
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

  render() {
    return html`<div class="canvas-container"></div>`;
  }
}
