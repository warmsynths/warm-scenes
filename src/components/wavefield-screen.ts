import { LitElement, html, css } from 'lit';
import { customElement, query, state } from 'lit/decorators.js';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

@customElement('wavefield-screen')
export class WavefieldScreen extends LitElement {
  @query('.canvas-container')
  container!: HTMLDivElement;

  @query('#audio')
  audioElement!: HTMLAudioElement;

  @state()
  private isPlaying = false;

  @state()
  private audioInitialized = false;

  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private renderer!: THREE.WebGLRenderer;
  private composer!: EffectComposer;
  private animationFrameId: number | null = null;
  private resizeObserver!: ResizeObserver;

  // Web Audio
  private audioCtx!: AudioContext;
  private analyser!: AnalyserNode;
  private dataArray!: Uint8Array;

  // 3D Objects
  private waveLines: { line: THREE.Line, curtain: THREE.Mesh }[] = [];
  private proxyGroup!: THREE.Group;

  // Animation State
  private currentWeight = 0;
  private time = 0;

  @state()
  private mode: 'full' | 'joy' = 'full';

  @state()
  private rippleDir: 'down' | 'up' = 'down';

  @state()
  private scrollSpeed: number = 8.0;

  @state()
  private device: 'sp404' | 'circuit' | 'guitar' | 'bass' | 'drum' = 'sp404';

  @state()
  private theme: 'noir' | 'synthwave' | 'firework' = 'noir';

  @state()
  private lineGap: number = 1;

  @state()
  private gridHeight: number = 100;

  static styles = css`
    :host {
      display: block;
      width: 100%;
      height: 100%;
      background-color: #000;
      position: relative;
    }
    .canvas-container {
      width: 100%;
      height: 100%;
      position: absolute;
      top: 0;
      left: 0;
      z-index: 1;
    }
    .ui-panel {
      position: absolute;
      bottom: 40px;
      right: 40px;
      background: rgba(0, 0, 0, 0.8);
      border: 1px solid #333;
      padding: 20px;
      border-radius: 8px;
      display: flex;
      flex-direction: column;
      gap: 15px;
      font-family: monospace;
      color: #fff;
      z-index: 10;
      min-width: 250px;
    }
    .controls-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 10px;
    }
    .btn {
      background: transparent;
      border: 1px solid #fff;
      color: #fff;
      padding: 8px 12px;
      cursor: pointer;
      flex: 1;
      text-align: center;
      text-transform: uppercase;
      font-size: 0.8rem;
      transition: all 0.2s;
    }
    .btn:hover {
      background: #fff;
      color: #000;
    }
    select {
      background: transparent;
      color: #fff;
      border: 1px solid #555;
      padding: 6px;
      font-family: monospace;
      flex: 1;
    }
    select option {
      background: #000;
    }
    .status {
      font-size: 0.8rem;
      opacity: 0.7;
      text-align: center;
      margin-top: 5px;
    }
    input[type="file"] {
      display: none;
    }
  `;

  updated(changedProperties: Map<string, any>) {
    if (changedProperties.has('theme')) {
      this.updateThemeColors();
    }
  }

  private updateThemeColors() {
    const numLines = this.waveLines.length;
    for (let i = 0; i < numLines; i++) {
      const { line } = this.waveLines[i];
      const mat = line.material as THREE.LineBasicMaterial;
      const t = i / (numLines - 1);
      
      // Use a deterministic seeded pseudo-random value [0, 1] based on line index
      // so colors are stable and don't flash frantically every frame
      const rand = (Math.sin(i * 12.9898) * 43758.5453) % 1;
      const uRand = rand < 0 ? rand + 1 : rand;
      
      if (this.theme === 'noir') {
        mat.color.setHex(0xffffff); // Pure white
      } else if (this.theme === 'synthwave') {
        // Synthwave: Smooth gradient from Cyan in the back, to Hot Pink, to Deep Purple in the front
        const color = new THREE.Color();
        if (t < 0.5) {
          color.lerpColors(new THREE.Color(0x00ffff), new THREE.Color(0xff007f), t * 2.0); // Cyan to Pink
        } else {
          color.lerpColors(new THREE.Color(0xff007f), new THREE.Color(0x8a2be2), (t - 0.5) * 2.0); // Pink to Purple
        }
        mat.color.copy(color);
      } else if (this.theme === 'firework') {
        // Firework: Stable random HSL rainbow hue per line
        const color = new THREE.Color();
        color.setHSL(uRand, 1.0, 0.5); 
        mat.color.copy(color);
      }
    }
  }

  firstUpdated() {
    this.initThreeJS();
    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(this.container);
    this.startLoop();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
    }
    
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    }
    
    if (this.scene) {
      this.scene.traverse((object: any) => {
        if (object.isMesh || object.isLineSegments || object.isLine) {
          if (object.geometry) object.geometry.dispose();
          if (object.material) {
            if (Array.isArray(object.material)) {
              object.material.forEach((material: any) => material.dispose());
            } else {
              object.material.dispose();
            }
          }
        }
      });
      this.scene.clear();
    }
    
    if (this.renderer) {
      this.renderer.dispose();
      this.renderer.forceContextLoss();
    }

    if (this.audioCtx && this.audioCtx.state !== 'closed') {
      this.audioCtx.close();
    }
  }

  private initThreeJS() {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x000000);
    // Removed fog to prevent fading at the top of the screen in Joy mode

    // Camera angled to look across the flat wavefield (close and steep enough)
    this.camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 1000);
    this.camera.position.set(0, 20, 40);
    this.camera.lookAt(0, 0, 0);

    this.renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.container.appendChild(this.renderer.domElement);

    const renderScene = new RenderPass(this.scene, this.camera);
    const bloomPass = new UnrealBloomPass(new THREE.Vector2(width, height), 0.35, 0.4, 0.1);
    
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(renderScene);
    this.composer.addPass(bloomPass);

    this.buildWavefield();
    this.buildProxySP404();
  }

  private buildWavefield() {
    const numLines = 200;
    const numPoints = 300;
    const width = 120;
    const depth = 120;

    const baseLineMaterial = new THREE.LineBasicMaterial({
      color: 0xffffff, // Base white
      transparent: false,
      opacity: 1.0,
      blending: THREE.NormalBlending
    });
    
    // Solid black material to occlude lines behind it
    const curtainMaterial = new THREE.MeshBasicMaterial({
      color: 0x000000,
      side: THREE.FrontSide,
      polygonOffset: true,
      polygonOffsetFactor: 1, // Push slightly back to prevent Z-fighting with the bright line
      polygonOffsetUnits: 1
    });

    for (let i = 0; i < numLines; i++) {
      const z = (i / (numLines - 1)) * depth - depth / 2;
      
      // Top glowing line
      const positions = new Float32Array(numPoints * 3);
      for (let j = 0; j < numPoints; j++) {
        const x = (j / (numPoints - 1)) * width - width / 2;
        positions[j * 3] = x;
        positions[j * 3 + 1] = 0; // y
        positions[j * 3 + 2] = z; // z
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      const lineMat = baseLineMaterial.clone(); // Clone so each line can have its own gradient color
      const line = new THREE.Line(geo, lineMat);
      
      // Black curtain mesh for occlusion
      const curtainPositions = new Float32Array(numPoints * 2 * 3);
      const indices = [];
      for (let j = 0; j < numPoints - 1; j++) {
        indices.push(j * 2, j * 2 + 1, j * 2 + 2);
        indices.push(j * 2 + 1, j * 2 + 3, j * 2 + 2);
      }
      const curtainGeo = new THREE.BufferGeometry();
      curtainGeo.setAttribute('position', new THREE.BufferAttribute(curtainPositions, 3));
      curtainGeo.setIndex(indices);
      const curtain = new THREE.Mesh(curtainGeo, curtainMaterial);

      this.waveLines.push({ line, curtain });
      this.scene.add(line);
      this.scene.add(curtain);
    }
    
    // Apply initial colors
    this.updateThemeColors();
  }

  private buildProxySP404() {
    this.proxyGroup = new THREE.Group();
    this.proxyGroup.position.set(0, 0, 0);
    this.proxyGroup.scale.set(4, 4, 4);
    this.proxyGroup.visible = false; 
    
    // Chassis
    const chassis = new THREE.Mesh(new THREE.BoxGeometry(14, 2, 20), new THREE.MeshBasicMaterial({ color: 0xff0000 }));
    chassis.position.y = 1; 
    this.proxyGroup.add(chassis);

    // 4x4 Pads
    for (let px = 0; px < 4; px++) {
      for (let pz = 0; pz < 4; pz++) {
        const pad = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.5, 1.6), new THREE.MeshBasicMaterial({ color: 0x00ff00 }));
        pad.position.set(-4.5 + px * 3, 2.25, 1 + pz * 2.5);
        this.proxyGroup.add(pad);
      }
    }

    // Top circular screen
    const screen = new THREE.Mesh(new THREE.CylinderGeometry(3, 3, 0.4, 32), new THREE.MeshBasicMaterial({ color: 0x0000ff }));
    screen.position.set(0, 2.2, -4);
    this.proxyGroup.add(screen);
    
    // Knobs (top left)
    for (let k = 0; k < 4; k++) {
      const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.8, 16), new THREE.MeshBasicMaterial({ color: 0xffff00 }));
      const knobX = -5 + (k % 2) * 2;
      const knobZ = -8 + Math.floor(k / 2) * 2.5;
      knob.position.set(knobX, 2.4, knobZ);
      this.proxyGroup.add(knob);
    }

    this.scene.add(this.proxyGroup);
  }

  private handleResize() {
    if (!this.container || !this.renderer || !this.camera) return;
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
    if (this.composer) {
      this.composer.setSize(width, height);
    }
  }

  // --- Web Audio API ---

  private async initAudio() {
    if (this.audioInitialized) {
      this.togglePlay();
      return;
    }

    try {
      this.audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      this.analyser = this.audioCtx.createAnalyser();
      this.analyser.fftSize = 256;
      this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);

      // Connect media element
      const source = this.audioCtx.createMediaElementSource(this.audioElement);
      source.connect(this.analyser);
      this.analyser.connect(this.audioCtx.destination);

      this.audioInitialized = true;
      this.togglePlay();
    } catch (e) {
      console.error("Audio Context failed to initialize:", e);
    }
  }

  private togglePlay() {
    if (this.isPlaying) {
      this.audioElement.pause();
      this.isPlaying = false;
    } else {
      // If audio context is suspended (autoplay policy), resume it
      if (this.audioCtx.state === 'suspended') {
        this.audioCtx.resume();
      }
      this.audioElement.play().then(() => {
        this.isPlaying = true;
      }).catch(err => {
        console.warn("Autoplay blocked:", err);
      });
    }
  }

  private handleFileSelect(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      this.audioElement.src = url;
      // If already initialized, play immediately
      if (this.audioInitialized) {
        this.audioElement.play();
        this.isPlaying = true;
      }
    }
  }

  // --- Render Loop ---

  private startLoop() {
    const loop = () => {
      this.renderScene();
      this.animationFrameId = requestAnimationFrame(loop);
    };
    this.animationFrameId = requestAnimationFrame(loop);
  }

  private renderScene() {
    if (!this.renderer || !this.scene || !this.camera) return;
    
    this.time += 0.05;
    let targetWeight = 0;
    let volumeRipple = 0;

    if (this.audioInitialized && this.isPlaying) {
      this.analyser.getByteFrequencyData(this.dataArray as any);
      
      // Isolate low-end bass frequencies (first few bins)
      let bassSum = 0;
      const bassBins = 4;
      for (let i = 0; i < bassBins; i++) {
        bassSum += this.dataArray[i];
      }
      const bassAvg = bassSum / bassBins;
      
      // Threshold logic for the "Drape" over the SP-404 proxy
      const peakThreshold = 235; // Increased so it only triggers on the hardest bass hits 
      if (bassAvg > peakThreshold) {
        targetWeight = 1.0;
      } else {
        targetWeight = 0.0;
      }

      // Overall volume for subtle ripple
      let totalSum = 0;
      for (let i = 0; i < this.dataArray.length; i++) {
        totalSum += this.dataArray[i];
      }
      const totalAvg = totalSum / this.dataArray.length;
      volumeRipple = totalAvg / 255.0;
    }

    // Lerp currentWeight towards targetWeight
    this.currentWeight += (targetWeight - this.currentWeight) * 0.15;

    // Displace wavefield vertices
    if (this.waveLines.length > 0) {
      const numLines = 200;
      const numPoints = 300;
      const width = 120;
      const depth = 120;
      
      const step = Math.floor(this.lineGap);
      const heightScale = this.gridHeight / 100.0;
      
      for (let i = 0; i < numLines; i++) {
        const { line, curtain } = this.waveLines[i];
        
        if (i % step !== 0) {
          line.visible = false;
          curtain.visible = false;
          continue;
        }
        line.visible = true;
        curtain.visible = true;
        
        const positions = line.geometry.attributes.position.array as Float32Array;
        const curtainPositions = curtain.geometry.attributes.position.array as Float32Array;
        
        // baseZ dynamically scales the total Z footprint (Height on screen) without affecting gap logic
        const baseZ = ((i / (numLines - 1)) * depth - depth / 2) * heightScale;
        const unscaledZ = baseZ / heightScale; // Used for noise/proxy math to prevent stretching shapes
        
        for (let j = 0; j < numPoints; j++) {
          const baseX = (j / (numPoints - 1)) * width - width / 2;
          const baseY = 0;
          
          // Scale coordinate system down by 2 to make the proxy appear 2x larger (reduced from 4x for better proportion)
          const proxyScale = 2.0;
          const px = baseX / proxyScale;
          const pz = unscaledZ / proxyScale;
          
          let addedHeight = 0;
          
          if (this.device === 'sp404') {
            // SP-404 Math
            const dxChassis = Math.max(0, Math.abs(px) - 7);
            const dzChassis = Math.max(0, Math.abs(pz) - 10);
            addedHeight = Math.max(addedHeight, 2 * Math.exp(-(dxChassis*dxChassis + dzChassis*dzChassis) * 0.5));
            for (let py_ix = 0; py_ix < 4; py_ix++) {
              for (let pz_ix = 0; pz_ix < 4; pz_ix++) {
                const dxPad = Math.max(0, Math.abs(px - (-4.5 + py_ix * 3)) - 0.8);
                const dzPad = Math.max(0, Math.abs(pz - (1 + pz_ix * 2.5)) - 0.8);
                addedHeight = Math.max(addedHeight, 4 * Math.exp(-(dxPad*dxPad + dzPad*dzPad) * 2.0));
              }
            }
            const distScreen = Math.max(0, Math.sqrt(Math.pow(px, 2) + Math.pow(pz - (-4), 2)) - 3);
            addedHeight = Math.max(addedHeight, 3 * Math.exp(-distScreen*distScreen * 1.5));
            for (let k = 0; k < 4; k++) {
              const knobX = -5 + (k % 2) * 2;
              const knobZ = -8 + Math.floor(k / 2) * 2.5;
              const distKnob = Math.max(0, Math.sqrt(Math.pow(px - knobX, 2) + Math.pow(pz - knobZ, 2)) - 0.5);
              addedHeight = Math.max(addedHeight, 4.5 * Math.exp(-distKnob*distKnob * 3.0));
            }
          } 
          else if (this.device === 'circuit') {
            // Circuit Tracks Math (Wider box, 2x8 grid)
            const dxChassis = Math.max(0, Math.abs(px) - 12);
            const dzChassis = Math.max(0, Math.abs(pz) - 8);
            addedHeight = Math.max(addedHeight, 2 * Math.exp(-(dxChassis*dxChassis + dzChassis*dzChassis) * 0.5));
            for (let py_ix = 0; py_ix < 8; py_ix++) {
              for (let pz_ix = 0; pz_ix < 2; pz_ix++) {
                const dxPad = Math.max(0, Math.abs(px - (-10 + py_ix * 2.8)) - 1.0);
                const dzPad = Math.max(0, Math.abs(pz - (2 + pz_ix * 2.8)) - 1.0);
                addedHeight = Math.max(addedHeight, 3.5 * Math.exp(-(dxPad*dxPad + dzPad*dzPad) * 2.0));
              }
            }
            for (let k = 0; k < 8; k++) {
              const distKnob = Math.max(0, Math.sqrt(Math.pow(px - (-10 + k * 2.8), 2) + Math.pow(pz - (-4), 2)) - 0.5);
              addedHeight = Math.max(addedHeight, 4 * Math.exp(-distKnob*distKnob * 3.0));
            }
          }
          else if (this.device === 'guitar' || this.device === 'bass') {
            // Guitar / Bass Math (Neck and Body)
            const isBass = this.device === 'bass';
            const neckLen = isBass ? 18 : 15;
            const dxNeck = Math.max(0, Math.abs(px) - 1.5);
            const dzNeck = Math.max(0, Math.abs(pz - (-5)) - neckLen);
            addedHeight = Math.max(addedHeight, 2.5 * Math.exp(-(dxNeck*dxNeck + dzNeck*dzNeck) * 0.8));
            
            const bodyZ = 12;
            const distBodyTop = Math.sqrt(Math.pow(px, 2) + Math.pow(pz - bodyZ, 2));
            const distBodyBot = Math.sqrt(Math.pow(px, 2) + Math.pow(pz - (bodyZ + 8), 2));
            const distBody = Math.max(0, Math.min(distBodyTop, distBodyBot) - 7);
            addedHeight = Math.max(addedHeight, 3 * Math.exp(-distBody*distBody * 0.4));
          }
          else if (this.device === 'drum') {
            // Snare Drum Math
            const distDrum = Math.max(0, Math.sqrt(px*px + pz*pz) - 12);
            addedHeight = Math.max(addedHeight, 4 * Math.exp(-distDrum*distDrum * 0.3));
            
            // Raised outer rim
            const rimDist = Math.abs(Math.sqrt(px*px + pz*pz) - 12);
            addedHeight = Math.max(addedHeight, 5 * Math.exp(-rimDist*rimDist * 1.5));
          }
          
          // Scale height back up
          addedHeight *= proxyScale;

          // To prevent spatial aliasing (where the waves appear to stop or jitter on large gaps), 
          // we stretch the physical length of the wave along the Z-axis proportionally to the gap.
          const zPhaseDist = unscaledZ / this.lineGap;
          const zPhaseTime = this.time * this.scrollSpeed;
          const zPhase = (this.rippleDir === 'down') ? (zPhaseDist - zPhaseTime) : (zPhaseDist + zPhaseTime);
          
          // Joy Division style jagged peaks concentrated in the center
          // Split X and Z math completely to eliminate any diagonal left/right drifting
          const n1 = Math.sin(baseX * 0.5) * Math.cos(zPhase * 0.4);
          const n2 = Math.sin(baseX * 1.2 + 1.0) * Math.sin(zPhase * 0.9 + 2.0);
          const n3 = Math.cos(baseX * 2.5 + 3.0) * Math.sin(zPhase * 1.5 + 1.0);
          const rawNoise = n1 + n2 * 0.5 + n3 * 0.25;
          
          // Falloff from center (X=0) - tightened to ensure black space on the sides
          const centerFalloff = Math.exp(-Math.pow(baseX * 0.06, 2));
          
          // Only positive peaks, strictly going UP, scaled strongly by volume
          const rippleHeight = Math.max(0, rawNoise) * centerFalloff;
          const scaledRipple = rippleHeight * (volumeRipple * 15.0 + 0.1);
          
          // Combine the ambient jagged peaks with the SP-404 proxy drape reveal
          const finalY = baseY + scaledRipple + (addedHeight * this.currentWeight);
          
          positions[j * 3 + 1] = finalY;
          positions[j * 3 + 2] = baseZ; // Update Z coordinate dynamically based on lineGap
          
          // Update black occlusion curtain
          // Top vertex matches the glowing line
          curtainPositions[j * 2 * 3] = baseX;
          curtainPositions[j * 2 * 3 + 1] = finalY;
          curtainPositions[j * 2 * 3 + 2] = baseZ;
          // Bottom vertex drops down to occlude background lines
          curtainPositions[j * 2 * 3 + 3] = baseX;
          curtainPositions[j * 2 * 3 + 4] = -20; 
          curtainPositions[j * 2 * 3 + 5] = baseZ;
        }
        
        line.geometry.attributes.position.needsUpdate = true;
        curtain.geometry.attributes.position.needsUpdate = true;
      }
    }
    
    // Dynamically animate camera framing based on mode
    if (this.mode === 'joy') {
      // Pull camera significantly further back and higher to isolate the wavefield with black margins all around
      this.camera.position.lerp(new THREE.Vector3(0, 80, 160), 0.05);
    } else {
      // Full screen immersive perspective mode
      this.camera.position.lerp(new THREE.Vector3(0, 20, 40), 0.05);
    }
    this.camera.lookAt(0, 0, 0);

    // Render pipeline switch based on config
    if (this.mode === 'full' && this.composer) {
      this.composer.render(); // Render with neon bloom
    } else {
      this.renderer.render(this.scene, this.camera); // Pure crisp B&W (Joy Mode)
    }
  }

  render() {
    return html`
      <div class="canvas-container"></div>
      
      <div class="ui-panel">
        <div class="controls-row">
          <button class="btn" @click="${this.initAudio}">
            ${this.isPlaying ? 'Pause' : 'Play Audio'}
          </button>
          <button class="btn" @click="${() => this.shadowRoot?.getElementById('file-input')?.click()}">
            Load Track
          </button>
        </div>
        
        <div class="controls-row">
          <label>Mode:</label>
          <select @change="${(e: any) => this.mode = e.target.value}">
            <option value="full">Full Screen (Glow)</option>
            <option value="joy">Joy Mode (Pure B&W)</option>
          </select>
        </div>
        
        <div class="controls-row">
          <label>Theme:</label>
          <select @change="${(e: any) => this.theme = e.target.value}">
            <option value="noir">Noir (B&W)</option>
            <option value="synthwave">Synthwave (Pink/Cyan)</option>
            <option value="firework">Firework (Rainbow)</option>
          </select>
        </div>
        
        <div class="controls-row">
          <label>Ripple:</label>
          <select @change="${(e: any) => this.rippleDir = e.target.value}">
            <option value="down">Top to Bottom</option>
            <option value="up">Bottom to Top</option>
          </select>
        </div>

        <div class="controls-row">
          <label>Device:</label>
          <select @change="${(e: any) => this.device = e.target.value}">
            <option value="sp404">SP-404 MKII</option>
            <option value="circuit">Circuit Tracks</option>
            <option value="guitar">Electric Guitar</option>
            <option value="bass">Bass Guitar</option>
            <option value="drum">Snare Drum</option>
          </select>
        </div>

        <div class="controls-row">
          <label>Speed:</label>
          <input type="range" min="1" max="30" .value="${this.scrollSpeed}" @input="${(e: any) => this.scrollSpeed = parseFloat(e.target.value)}" style="flex: 1" />
        </div>
        
        <div class="controls-row">
          <label>Gap:</label>
          <input type="range" min="1" max="20" step="1" .value="${this.lineGap}" @input="${(e: any) => this.lineGap = parseInt(e.target.value)}" style="flex: 1" />
        </div>

        <div class="controls-row">
          <label>Height:</label>
          <input type="range" min="10" max="200" step="10" .value="${this.gridHeight}" @input="${(e: any) => this.gridHeight = parseInt(e.target.value)}" style="flex: 1" />
        </div>
        
        <div class="status">
          ${this.audioInitialized ? 'Audio active (Hard bass triggers reveal)' : 'Waiting for audio...'}
        </div>
        
        <input id="file-input" type="file" accept="audio/*" @change="${this.handleFileSelect}" />
        <!-- Hidden audio element. A generic looping placeholder is used if no file loaded. -->
        <audio id="audio" src="${import.meta.env.BASE_URL}sample.wav" loop hidden></audio>
      </div>
    `;
  }
}
