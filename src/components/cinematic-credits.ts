import { LitElement, html, css } from 'lit';
import { customElement, query, state } from 'lit/decorators.js';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { AudioManager } from '../utils/audio-manager';
import floatingCoupleImage from '../assets/couple_forward_silhouette.png';
import { exportConfigAsJSON } from '../utils/exportConfig';
import type { ExportableScreen } from '../types/screen';

const CinematicGrainShader = {
  uniforms: {
    'tDiffuse': { value: null },
    'uTime': { value: 0.0 },
    'uAmount': { value: 0.05 },
    'uLuminanceWeight': { value: 1.0 }
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uAmount;
    uniform float uLuminanceWeight;
    varying vec2 vUv;

    float hash(vec2 p) {
      p = fract(p * vec2(123.34, 456.21));
      p += dot(p, p + 45.32);
      return fract(p.x * p.y);
    }

    void main() {
      vec4 texColor = texture2D(tDiffuse, vUv);
      
      float luminance = dot(texColor.rgb, vec3(0.299, 0.587, 0.114));
      
      float weight = 1.0 - abs(luminance - 0.5) * 2.0; 
      weight = mix(1.0, weight, uLuminanceWeight);
      
      vec2 seed = vUv + fract(uTime * 1.3453);
      
      float noise = hash(seed) * 0.5 + hash(seed + vec2(0.123, 0.456)) * 0.25 + hash(seed - vec2(0.321, 0.654)) * 0.25;
      noise = (noise - 0.5) * 2.0;
      
      texColor.rgb += noise * (uAmount / 5.0) * weight;
      
      gl_FragColor = texColor;
    }
  `
};

@customElement('cinematic-credits')
export class CinematicCredits extends LitElement implements ExportableScreen {
  static styles = css`
    :host {
      display: block;
      width: 100%;
      height: 100%;
      position: relative;
      overflow: hidden;
      font-family: 'Nunito', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }
    canvas {
      display: block;
      width: 100%;
      height: 100%;
    }
    .letterbox {
      position: absolute;
      left: 0;
      width: 100%;
      height: 12%;
      background: black;
      z-index: 10;
      pointer-events: none;
    }
    .letterbox.top { top: 0; }
    .letterbox.bottom { bottom: 0; }

    /* Settings Panel Styles */
    .settings-toggle {
      position: absolute;
      top: 20px;
      left: 20px;
      z-index: 110;
      width: 40px;
      height: 40px;
      border-radius: 50%;
      background: rgba(18, 12, 24, 0.85);
      border: 1px solid rgba(255, 110, 60, 0.3);
      color: #ffe6db;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
    }
    .settings-toggle:hover {
      background: rgba(255, 110, 60, 0.2);
      border-color: #ff6e3c;
      transform: rotate(45deg);
      box-shadow: 0 0 15px rgba(255, 110, 60, 0.4);
    }
    .settings-toggle svg {
      width: 20px;
      height: 20px;
      fill: currentColor;
    }

    .settings-panel {
      position: absolute;
      left: 0;
      top: 0;
      width: 320px;
      height: 100%;
      background: rgba(18, 12, 24, 0.7);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      border-right: 1px solid rgba(255, 110, 60, 0.15);
      z-index: 100;
      transform: translateX(-100%);
      transition: transform 0.4s cubic-bezier(0.16, 1, 0.3, 1);
      box-shadow: 4px 0 24px rgba(0, 0, 0, 0.6);
      display: flex;
      flex-direction: column;
    }
    .settings-panel.open {
      transform: translateX(0);
    }
    
    .settings-header {
      padding: 24px 24px 16px 24px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    }
    .settings-title {
      font-size: 16px;
      font-weight: 800;
      letter-spacing: 2px;
      color: #ffe6db;
      text-transform: uppercase;
      margin: 0;
      text-shadow: 0 0 10px rgba(255, 110, 60, 0.2);
    }
    .close-btn {
      background: none;
      border: none;
      color: #a397b4;
      cursor: pointer;
      font-size: 20px;
      padding: 4px;
      line-height: 1;
      transition: color 0.2s;
    }
    .close-btn:hover {
      color: #ff6e3c;
    }

    .settings-content {
      flex: 1;
      overflow-y: auto;
      padding: 24px;
      display: flex;
      flex-direction: column;
      gap: 24px;
    }
    
    /* Scrollbar */
    .settings-content::-webkit-scrollbar {
      width: 6px;
    }
    .settings-content::-webkit-scrollbar-track {
      background: transparent;
    }
    .settings-content::-webkit-scrollbar-thumb {
      background: rgba(255, 110, 60, 0.2);
      border-radius: 3px;
    }
    .settings-content::-webkit-scrollbar-thumb:hover {
      background: rgba(255, 110, 60, 0.4);
    }

    .control-group {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .control-label {
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 1px;
      color: #a397b4;
      text-transform: uppercase;
      display: flex;
      justify-content: space-between;
    }
    .control-value {
      color: #ff6e3c;
      font-family: monospace;
    }

    /* Sliders */
    input[type="range"] {
      -webkit-appearance: none;
      width: 100%;
      height: 4px;
      border-radius: 2px;
      background: #3c2f4d;
      outline: none;
      margin: 8px 0;
    }
    input[type="range"]::-webkit-slider-thumb {
      -webkit-appearance: none;
      appearance: none;
      width: 14px;
      height: 14px;
      border-radius: 50%;
      background: #ff6e3c;
      cursor: pointer;
      box-shadow: 0 0 10px rgba(255, 110, 60, 0.8);
      transition: transform 0.1s ease;
    }
    input[type="range"]::-webkit-slider-thumb:hover {
      transform: scale(1.2);
    }

    /* Buttons and Action Elements */
    .btn-reset {
      background: rgba(255, 110, 60, 0.1);
      border: 1px solid rgba(255, 110, 60, 0.3);
      color: #ffe6db;
      padding: 8px 12px;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 700;
      cursor: pointer;
      transition: all 0.2s ease;
      text-align: center;
      margin-top: 4px;
    }
    .btn-reset:hover {
      background: rgba(255, 110, 60, 0.2);
      border-color: #ff6e3c;
      color: white;
    }

    /* Chips Selector */
    .chips-container {
      display: flex;
      gap: 6px;
      margin-top: 4px;
    }
    .chip {
      flex: 1;
      padding: 8px 6px;
      border-radius: 6px;
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid rgba(255, 255, 255, 0.08);
      color: #a397b4;
      cursor: pointer;
      font-size: 11px;
      font-weight: bold;
      text-align: center;
      transition: all 0.2s ease;
      text-transform: capitalize;
    }
    .chip.active {
      background: rgba(255, 110, 60, 0.15);
      border-color: #ff6e3c;
      color: #fff;
      box-shadow: 0 0 8px rgba(255, 110, 60, 0.25);
    }
    .chip:hover:not(.active) {
      background: rgba(255, 255, 255, 0.08);
      border-color: rgba(255, 255, 255, 0.15);
      color: #ffe6db;
    }

    /* Checkbox & Switch */
    .switch-container {
      display: flex;
      align-items: center;
      justify-content: space-between;
      cursor: pointer;
      padding: 4px 0;
    }
    .switch-label {
      font-size: 12px;
      color: #ffe6db;
      font-weight: 600;
    }
    .switch {
      position: relative;
      display: inline-block;
      width: 36px;
      height: 20px;
    }
    .switch input {
      opacity: 0;
      width: 0;
      height: 0;
    }
    .slider {
      position: absolute;
      cursor: pointer;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background-color: #3c2f4d;
      transition: .3s;
      border-radius: 20px;
    }
    .slider:before {
      position: absolute;
      content: "";
      height: 14px;
      width: 14px;
      left: 3px;
      bottom: 3px;
      background-color: #ffe6db;
      transition: .3s;
      border-radius: 50%;
    }
    input:checked + .slider {
      background-color: #ff6e3c;
    }
    input:checked + .slider:before {
      transform: translateX(16px);
      background-color: white;
    }

    /* Audio Uploader */
    .audio-uploader {
      border: 2px dashed rgba(255, 110, 60, 0.25);
      border-radius: 8px;
      padding: 16px;
      text-align: center;
      cursor: pointer;
      background: rgba(255, 255, 255, 0.01);
      transition: all 0.2s ease;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 6px;
      font-size: 12px;
      color: #a397b4;
    }
    .audio-uploader:hover {
      border-color: #ff6e3c;
      background: rgba(255, 110, 60, 0.05);
      color: #ffe6db;
    }
    .audio-uploader svg {
      width: 24px;
      height: 24px;
      fill: currentColor;
    }
    .audio-info-box {
      background: rgba(255, 255, 255, 0.02);
      border: 1px solid rgba(255, 255, 255, 0.05);
      border-radius: 6px;
      padding: 10px 12px;
      font-size: 12px;
    }
    .audio-title-text {
      font-weight: 700;
      color: #ffe6db;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 240px;
      margin-bottom: 8px;
    }
    .audio-controls {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 12px;
      margin-bottom: 8px;
    }
    .audio-btn {
      background: none;
      border: none;
      color: #ffe6db;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 6px;
      border-radius: 50%;
      background: rgba(255, 255, 255, 0.05);
      transition: all 0.2s;
    }
    .audio-btn:hover {
      background: rgba(255, 110, 60, 0.2);
      color: white;
      transform: scale(1.1);
    }
    .audio-btn svg {
      width: 16px;
      height: 16px;
      fill: currentColor;
    }
    .audio-progress-container {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 10px;
      color: #a397b4;
      font-family: monospace;
    }
    .audio-progress-bar {
      flex: 1;
      height: 4px;
      background: #3c2f4d;
      border-radius: 2px;
      position: relative;
      cursor: pointer;
    }
    .audio-progress-fill {
      position: absolute;
      left: 0;
      top: 0;
      height: 100%;
      background: #ff6e3c;
      border-radius: 2px;
      width: 0%;
    }
  `;

  @query('canvas')
  private canvas!: HTMLCanvasElement;

  @state() private showConfigPanel = false;
  @state() private sunSize = 0.4;
  @state() private sunGlowAmount = 1.0;
  @state() private grainAmount = 3.5; // Start with heavy 70s grain
  @state() private selectedFigure: 'couple' | 'cowboy' | 'chairs' = 'couple';
  @state() private sunsetSpeed = 0.015;
  @state() private sunsetManualProgress = 0.7; // Start halfway down the horizon
  @state() private creditsSpeed = 0.001;
  @state() private syncToAudio = false;
  @state() private isSunsetRunning = true;

  @state() private isAudioPlaying = false;
  @state() private audioName = '';
  @state() private audioTime = 0;
  @state() private audioDuration = 0;
  @state() private audioVolume = 0.5;
  @state() private audioLoop = false;

  private audioManager = new AudioManager();
  private customGrainPass!: ShaderPass;
  private lastFrameTime = 0;
  private sunY = -0.47; // Start lower

  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private composer!: EffectComposer;
  
  private animationFrameId: number = 0;
  private clock = new THREE.Clock();
  
  private backgroundUniforms: any;
  private silhouetteMesh!: THREE.Mesh;
  private silhouetteBaseY = 0.5;

  private isRenderMode = false;

  public getConfig() {
    return {
      engine: 'credits',
      duration: this.audioDuration || 60,
      sunSize: this.sunSize,
      sunGlowAmount: this.sunGlowAmount,
      grainAmount: this.grainAmount,
      selectedFigure: this.selectedFigure,
      sunsetSpeed: this.sunsetSpeed,
      creditsSpeed: this.creditsSpeed,
      syncToAudio: this.syncToAudio,
      sunsetManualProgress: this.sunsetManualProgress,
    };
  }

  public exportConfig() {
    exportConfigAsJSON(this.getConfig(), 'config.json');
  }

  private saveConfigToLocalStorage() {
    try {
      const config = this.getConfig();
      localStorage.setItem('cinematic_credits_config', JSON.stringify(config));
    } catch (e) {
      console.warn('Failed to save credits config to localStorage', e);
    }
  }

  private loadConfigFromLocalStorage() {
    try {
      const saved = localStorage.getItem('cinematic_credits_config');
      if (saved) {
        const config = JSON.parse(saved);
        if (typeof config.sunSize === 'number') this.sunSize = config.sunSize;
        if (typeof config.sunGlowAmount === 'number') this.sunGlowAmount = config.sunGlowAmount;
        if (typeof config.grainAmount === 'number') this.grainAmount = config.grainAmount;
        if (config.selectedFigure) this.selectedFigure = config.selectedFigure;
        if (typeof config.sunsetSpeed === 'number') this.sunsetSpeed = config.sunsetSpeed;
        if (typeof config.creditsSpeed === 'number') this.creditsSpeed = config.creditsSpeed;
        if (typeof config.syncToAudio === 'boolean') this.syncToAudio = config.syncToAudio;
        if (typeof config.sunsetManualProgress === 'number') this.sunsetManualProgress = config.sunsetManualProgress;
      }
    } catch (e) {
      console.warn('Failed to load credits config from localStorage', e);
    }
  }

  private fadeMesh!: THREE.Mesh;
  private fadeMaterial!: THREE.MeshBasicMaterial;

  private createFadeOverlay() {
    const geometry = new THREE.PlaneGeometry(100, 100);
    this.fadeMaterial = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.0,
      depthTest: false
    });
    this.fadeMesh = new THREE.Mesh(geometry, this.fadeMaterial);
    this.fadeMesh.position.set(0, 0, 4); // In front of all 3D content, behind camera at z=5
    this.scene.add(this.fadeMesh);
  }

  async firstUpdated() {
    this.isRenderMode = window.hasOwnProperty('__timelines') || 
                        this.hasAttribute('data-sun-size') || 
                        document.querySelector('#composition') !== null;

    if (this.isRenderMode) {
      if (this.hasAttribute('data-sun-size')) {
        this.sunSize = parseFloat(this.getAttribute('data-sun-size') || '0.4');
      }
      if (this.hasAttribute('data-sun-glow')) {
        this.sunGlowAmount = parseFloat(this.getAttribute('data-sun-glow') || '1.0');
      }
      if (this.hasAttribute('data-grain-amount')) {
        this.grainAmount = parseFloat(this.getAttribute('data-grain-amount') || '3.5');
      }
      if (this.hasAttribute('data-selected-figure')) {
        this.selectedFigure = (this.getAttribute('data-selected-figure') as any) || 'couple';
      }
      if (this.hasAttribute('data-sunset-speed')) {
        this.sunsetSpeed = parseFloat(this.getAttribute('data-sunset-speed') || '0.015');
      }
      if (this.hasAttribute('data-credits-speed')) {
        this.creditsSpeed = parseFloat(this.getAttribute('data-credits-speed') || '0.001');
      }
      if (this.hasAttribute('data-sync-to-audio')) {
        this.syncToAudio = this.getAttribute('data-sync-to-audio') === 'true';
      }
      if (this.hasAttribute('data-sunset-progress')) {
        this.sunsetManualProgress = parseFloat(this.getAttribute('data-sunset-progress') || '0.7');
      }
    } else {
      this.loadConfigFromLocalStorage();
    }

    this.initScene();
    this.createBackground();
    this.createSilhouette();
    this.loadSilhouette(this.selectedFigure);
    
    try {
      await document.fonts.load('bold 36px Chivo');
    } catch (e) {
      console.warn("Font loading failed", e);
    }
    
    this.createCredits();
    this.createFadeOverlay();
    this.setupPostProcessing();
    
    if (this.isRenderMode) {
      console.log('[Credits] HyperFrames render mode detected');
      const compEl = document.getElementById('composition');
      const compDuration = compEl ? parseFloat(compEl.getAttribute('data-duration') || '60') : (this.audioDuration || 60);
      const initialSunsetProgress = this.sunsetManualProgress;

      window.addEventListener('hf-seek', (e: any) => {
        const time = e.detail.time;
        this.renderFrameAtTime(time, compDuration, initialSunsetProgress);
      });

      this.renderFrameAtTime(0, compDuration, initialSunsetProgress);
    } else {
      window.addEventListener('resize', this.handleResize);
      this.clock.start();
      this.lastFrameTime = performance.now() / 1000;
      this.renderLoop();
    }
  }

  private renderFrameAtTime(
    time: number,
    duration: number,
    initialSunsetProgress: number
  ) {
    if (this.syncToAudio && duration > 0) {
      const progress = Math.max(0, Math.min(1, time / duration));
      this.sunsetManualProgress = progress;
    } else {
      this.sunsetManualProgress = Math.min(1.0, initialSunsetProgress + (this.sunsetSpeed * time) / 1.1);
    }
    const startSunY = 0.35;
    const endSunY = -0.55 - (this.sunSize * 1.25) - 0.25;
    this.sunY = startSunY + (endSunY - startSunY) * this.sunsetManualProgress;

    if (this.backgroundUniforms) {
      this.backgroundUniforms.uTime.value = time;
      this.backgroundUniforms.uSunY.value = this.sunY;
      this.backgroundUniforms.uSunSize.value = this.sunSize;
      this.backgroundUniforms.uSunGlowAmount.value = this.sunGlowAmount;
      this.backgroundUniforms.uSunsetProgress.value = this.sunsetManualProgress;
    }

    if (this.customGrainPass) {
      this.customGrainPass.uniforms.uTime.value = time;
      this.customGrainPass.uniforms.uAmount.value = this.grainAmount;
    }

    // 1. Roll progress: credits roll finishes 3.5s before end of video
    const rollDuration = Math.max(1.0, duration - 3.5);
    const rollProgress = Math.max(0, Math.min(1, time / rollDuration));
    if (this.creditsMesh && this.creditsStartY !== undefined && this.creditsEndY !== undefined) {
      this.creditsMesh.position.y = this.creditsStartY + rollProgress * (this.creditsEndY - this.creditsStartY);
    }

    // 2. Fade to black overlay in final 1.5 seconds of the video
    const fadeStartTime = Math.max(0, duration - 1.5);
    const fadeProgress = (duration > fadeStartTime) 
      ? Math.max(0, Math.min(1, (time - fadeStartTime) / (duration - fadeStartTime))) 
      : 0;
    if (this.fadeMaterial) {
      this.fadeMaterial.opacity = fadeProgress;
    }

    if (this.silhouetteMesh) {
      if (this.selectedFigure === 'couple') {
        const floatY = Math.sin(time * 0.4) * 0.03 + Math.sin(time * 0.15) * 0.02;
        const floatX = Math.cos(time * 0.3) * 0.02;
        this.silhouetteMesh.position.y = this.silhouetteBaseY + floatY;
        this.silhouetteMesh.position.x = -1.2 + floatX;
      } else {
        this.silhouetteMesh.position.y = this.silhouetteBaseY;
      }
    }

    this.composer.render();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    cancelAnimationFrame(this.animationFrameId);
    window.removeEventListener('resize', this.handleResize);
    this.renderer?.dispose();
    this.creditsTexture?.dispose();
    this.audioManager.stop();
    this.audioManager.clear();
  }

  private initScene() {
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: false });
    this.renderer.setSize(this.clientWidth, this.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;

    this.scene = new THREE.Scene();
    
    this.camera = new THREE.PerspectiveCamera(60, this.clientWidth / this.clientHeight, 0.1, 1000);
    this.camera.position.z = 5;
  }

  private createBackground() {
    // A shader material for a cinematic sunset
    this.backgroundUniforms = {
      uTime: { value: 0 },
      uResolution: { value: new THREE.Vector2(this.clientWidth, this.clientHeight) },
      uSunY: { value: this.sunY },
      uSunSize: { value: this.sunSize },
      uSunGlowAmount: { value: this.sunGlowAmount },
      uSunsetProgress: { value: this.sunsetManualProgress }
    };

    const vertexShader = `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `;

    const fragmentShader = `
      uniform float uTime;
      uniform vec2 uResolution;
      uniform float uSunY;
      uniform float uSunSize;
      uniform float uSunGlowAmount;
      uniform float uSunsetProgress;
      varying vec2 vUv;

      void main() {
        // Use screen coordinates so it's independent of plane size
        vec2 screenUv = gl_FragCoord.xy / uResolution.xy;
        vec2 p = screenUv * 2.0 - 1.0;
        p.x *= uResolution.x / uResolution.y;

        // Dynamic Sky Colors based on uSunsetProgress (0 = Golden Hour, 0.5 = Sunset, 1.0 = Deep Dusk/Twilight)
        float prog = clamp(uSunsetProgress, 0.0, 1.0);

        // 1. Horizon Colors (bottom of sky)
        vec3 horizonDay    = vec3(0.85, 0.42, 0.15); // Golden Amber
        vec3 horizonSunset = vec3(0.65, 0.20, 0.08); // Fiery Crimson Sunset
        vec3 horizonDusk   = vec3(0.28, 0.07, 0.14); // Deep Dusk Twilight Violet

        vec3 bottomColor = prog < 0.5 
          ? mix(horizonDay, horizonSunset, prog * 2.0)
          : mix(horizonSunset, horizonDusk, (prog - 0.5) * 2.0);

        // 2. Mid Sky Colors
        vec3 midDay    = vec3(0.45, 0.16, 0.22); // Rose Warmth
        vec3 midSunset = vec3(0.25, 0.07, 0.20); // Deep Purple
        vec3 midDusk   = vec3(0.07, 0.03, 0.12); // Night Indigo

        vec3 midColor = prog < 0.5 
          ? mix(midDay, midSunset, prog * 2.0)
          : mix(midSunset, midDusk, (prog - 0.5) * 2.0);

        // 3. Zenith Colors (top of sky)
        vec3 topDay    = vec3(0.12, 0.05, 0.18); // Deep Violet
        vec3 topSunset = vec3(0.06, 0.03, 0.12); // Dark Navy Purple
        vec3 topDusk   = vec3(0.02, 0.01, 0.05); // Midnight Dark Sky

        vec3 topColor = prog < 0.5 
          ? mix(topDay, topSunset, prog * 2.0)
          : mix(topSunset, topDusk, (prog - 0.5) * 2.0);

        // 3-stop sky gradient across screen height
        vec3 color = screenUv.y < 0.5 
          ? mix(bottomColor, midColor, screenUv.y * 2.0)
          : mix(midColor, topColor, (screenUv.y - 0.5) * 2.0);

        // Heat haze / rippling effect
        float heat = sin(p.y * 40.0 - uTime * 4.0) * 0.015;
        heat += sin(p.x * 30.0 + uTime * 2.5) * 0.01;

        // Sun (distinct but hazy orb)
        vec2 sunPos = vec2(0.0, uSunY);
        float d = length(p - sunPos + vec2(heat, 0.0));
        float sunMask = smoothstep(uSunSize, uSunSize - 0.02, d); // Distinct core
        float sunGlow = smoothstep(uSunSize * 3.0, uSunSize * 0.2, d); // Hazy glow
        
        // Sun color shifts warmer/redder as it sets
        vec3 sunColorDay = vec3(0.95, 0.55, 0.15);
        vec3 sunColorDusk = vec3(0.80, 0.25, 0.05);
        vec3 sunColor = mix(sunColorDay, sunColorDusk, prog);
        
        color += sunColor * sunGlow * 0.4 * uSunGlowAmount * (1.0 - prog * 0.5); // Add glow modulated by slider
        color = mix(color, sunColor, sunMask); // Solid distinct core

        // Silhouetted desert terrain
        float terrain = sin(p.x * 2.0) * 0.05 + sin(p.x * 5.5 + 2.0) * 0.02 - 0.55;
        if (p.y < terrain) {
          color = vec3(0.0);
        }

        gl_FragColor = vec4(color, 1.0);
      }
    `;

    const material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: this.backgroundUniforms,
      depthWrite: false,
    });

    // Fill the screen with a massive plane to ensure it never gets clipped on wide monitors
    const geometry = new THREE.PlaneGeometry(100, 100); 
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.z = -10;
    this.scene.add(mesh);
  }

  private createSilhouette() {
    // Create a fallback mesh immediately so it's guaranteed to be in the scene
    const height = 1.0;
    const geometry = new THREE.PlaneGeometry(height, height);
    const material = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.0 });
    this.silhouetteMesh = new THREE.Mesh(geometry, material);
    
    // Positioned floating in the sky near the sun
    this.silhouetteBaseY = 0.5;
    this.silhouetteMesh.position.set(-1.0, this.silhouetteBaseY, -2); 
    this.scene.add(this.silhouetteMesh);
  }

  private loadSilhouette(figure: 'couple' | 'cowboy' | 'chairs') {
    let path = '';
    if (figure === 'couple') {
      path = floatingCoupleImage;
    } else if (figure === 'cowboy') {
      path = import.meta.env.BASE_URL + 'cowboy_silhouette.png';
    } else if (figure === 'chairs') {
      path = import.meta.env.BASE_URL + 'empty_chairs_silhouette.png';
    }

    const textureLoader = new THREE.TextureLoader();
    textureLoader.load(
      path, 
      (texture) => {
        // Swap to the actual texture and correct aspect ratio
        const aspect = texture.image.width / texture.image.height;
        const height = figure === 'couple' ? 1.0 : (figure === 'cowboy' ? 1.0 : 0.8);
        this.silhouetteMesh.geometry.dispose();
        this.silhouetteMesh.geometry = new THREE.PlaneGeometry(height * aspect, height);
        
        // Custom shader to extract the black silhouette smoothly
        const shaderMaterial = new THREE.ShaderMaterial({
          uniforms: { tDiffuse: { value: texture } },
          vertexShader: `
            varying vec2 vUv;
            void main() {
              vUv = uv;
              gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
          `,
          fragmentShader: `
            uniform sampler2D tDiffuse;
            varying vec2 vUv;
            void main() {
              vec4 texel = texture2D(tDiffuse, vUv);
              
              // Handle both transparent PNGs and solid white backgrounds.
              // We want black pixels to be opaque (alpha=1) and white pixels to be transparent (alpha=0).
              float alpha = texel.a;
              if (alpha > 0.9) {
                // If it has a solid background, invert the brightness to get the alpha mask
                alpha = 1.0 - ((texel.r + texel.g + texel.b) / 3.0);
              }
              
              if (alpha < 0.05) discard;
              
              gl_FragColor = vec4(0.0, 0.0, 0.0, alpha);
            }
          `,
          transparent: true,
          depthTest: false
        });
        
        const oldMat = this.silhouetteMesh.material;
        this.silhouetteMesh.material = shaderMaterial;
        if (Array.isArray(oldMat)) {
          oldMat.forEach(m => m.dispose());
        } else {
          oldMat.dispose();
        }

        // Adjust positioning base on figure type
        if (figure === 'couple') {
          this.silhouetteBaseY = 0.5;
          this.silhouetteMesh.position.set(-1.2, this.silhouetteBaseY, -2);
        } else if (figure === 'cowboy') {
          this.silhouetteBaseY = -0.58;
          this.silhouetteMesh.position.set(-1.0, this.silhouetteBaseY, -2);
        } else if (figure === 'chairs') {
          this.silhouetteBaseY = -0.68;
          this.silhouetteMesh.position.set(-0.8, this.silhouetteBaseY, -2);
        }
      },
      undefined,
      (err) => {
        console.error("Failed to load silhouette texture:", err);
      }
    );
  }

  private creditsCanvas!: HTMLCanvasElement;
  private creditsCtx!: CanvasRenderingContext2D;
  private creditsTexture!: THREE.CanvasTexture;
  private creditsMesh!: THREE.Mesh;
  private creditsStartY = 0;
  private creditsEndY = 0;

  private createCredits(targetDuration?: number) {
    const duration = targetDuration || this.audioDuration || 60;
    
    // Remove existing mesh if rebuilding
    if (this.creditsMesh) {
      this.scene.remove(this.creditsMesh);
      this.creditsMesh.geometry.dispose();
      (this.creditsMesh.material as THREE.Material).dispose();
      if (this.creditsTexture) this.creditsTexture.dispose();
    }

    // Standard reading speed ~ 160px per second on canvas
    const textTargetHeight = Math.max(6000, Math.ceil(duration * 160));
    const canvasWidth = 1024;
    
    this.creditsCanvas = document.createElement('canvas');
    this.creditsCanvas.width = canvasWidth;
    
    // First pass to measure canvas height
    const { topY, bottomY, totalCanvasHeight } = this.drawCreditsText(textTargetHeight);
    
    this.creditsCanvas.height = totalCanvasHeight;
    this.creditsCtx = this.creditsCanvas.getContext('2d')!;
    
    // Final pass to draw onto correctly sized canvas
    this.drawCreditsText(textTargetHeight);

    this.creditsTexture = new THREE.CanvasTexture(this.creditsCanvas);
    this.creditsTexture.minFilter = THREE.LinearFilter;
    this.creditsTexture.magFilter = THREE.LinearFilter;
    this.creditsTexture.wrapS = THREE.ClampToEdgeWrapping;
    this.creditsTexture.wrapT = THREE.ClampToEdgeWrapping;

    const scale = 6.0 / 9.0;
    const planeWidth = 8 * scale;
    const planeHeight = (totalCanvasHeight / canvasWidth) * planeWidth;
    const geometry = new THREE.PlaneGeometry(planeWidth, planeHeight); 
    const material = new THREE.MeshBasicMaterial({
      map: this.creditsTexture,
      transparent: true,
      blending: THREE.NormalBlending,
      opacity: 0.9,
      depthTest: false
    });

    this.creditsMesh = new THREE.Mesh(geometry, material);
    this.creditsMesh.position.set(0, 0, -1);

    // Calculate startY and endY for 3D scrolling
    // Viewport height at z = -1 (distance 6, FOV 60) is ~6.928
    const viewportHeight = 2.0 * 6.0 * Math.tan(THREE.MathUtils.degToRad(30));
    
    // Local Y of pixel y on canvas: (planeHeight/2) - (y / totalCanvasHeight) * planeHeight
    const localTopY = (planeHeight / 2.0) - (topY / totalCanvasHeight) * planeHeight;
    const localBottomY = (planeHeight / 2.0) - (bottomY / totalCanvasHeight) * planeHeight;

    // At progress = 0: top of text is just below viewport bottom
    this.creditsStartY = - (viewportHeight / 2.0) - 0.5 - localTopY;
    
    // At progress = 1.0: bottom Warmer Bros block rests in lower-center of viewport
    this.creditsEndY = -0.5 - localBottomY;

    this.creditsMesh.position.y = this.creditsStartY;
    this.scene.add(this.creditsMesh);
  }

  private drawCreditsText(targetHeightPx: number): { topY: number; bottomY: number; totalCanvasHeight: number } {
    const ctx = this.creditsCtx;
    const width = 1024;
    
    if (ctx) {
      ctx.clearRect(0, 0, width, this.creditsCanvas.height || 8192);
    }

    let y = 600;
    const topY = y;
    const centerX = width / 2;

    const famousFirsts = [
      "Leonardo", "Brad", "Tom", "Meryl", "Denzel", "Scarlett", "Morgan",
      "Harrison", "Natalie", "Joaquin", "Charlize", "Christian", "Viola", 
      "Ryan", "Emma", "Chris", "Jennifer", "Samuel", "Cate", "Matthew",
      "Anne", "Hugh", "Julia", "Daniel", "Keanu", "Halle", "Cillian", "Florence",
      "Pedro", "Zendaya", "Timothée", "Margot", "Austin", "Ana", "Willem"
    ];

    const famousLasts = [
      "DiCaprio", "Pitt", "Hanks", "Streep", "Washington", "Johansson", "Freeman",
      "Ford", "Portman", "Phoenix", "Theron", "Bale", "Davis",
      "Gosling", "Stone", "Evans", "Lawrence", "Jackson", "Blanchett", "McConaughey",
      "Hathaway", "Jackman", "Roberts", "Day-Lewis", "Reeves", "Berry", "Murphy",
      "Pugh", "Pascal", "Coleman", "Chalamet", "Robbie", "Butler", "de Armas", "Dafoe"
    ];

    const characterFirsts = ["Adam", "Sarah", "John", "Emily", "Michael", "Jessica", "David", "Laura", "James", "Rachel", "Marcus", "Elena"];
    const characterColors = ["Red", "Green", "Black", "White", "Silver", "Gold", "Grey", "Brown", "Crimson", "Violet", "Amber", "Cobalt"];
    const characterNouns = ["stone", "wood", "water", "smith", "bridge", "field", "hill", "brook", "heart", "man", "vane", "cross"];

    const pseudoRandom = (seed: number) => {
      const x = Math.sin(seed * 9999.1234 + 123.456) * 43758.5453;
      return x - Math.floor(x);
    };

    const getActorName = (index: number) => {
      const fIdx = Math.floor(pseudoRandom(index * 13 + 1) * famousFirsts.length);
      const lIdx = Math.floor(pseudoRandom(index * 17 + 3) * famousLasts.length);
      return `${famousFirsts[fIdx]} ${famousLasts[lIdx]}`;
    };

    const getCharacterName = (index: number) => {
      const fIdx = Math.floor(pseudoRandom(index * 19 + 7) * characterFirsts.length);
      const cIdx = Math.floor(pseudoRandom(index * 23 + 11) * characterColors.length);
      const nIdx = Math.floor(pseudoRandom(index * 29 + 13) * characterNouns.length);
      return `${characterFirsts[fIdx]} ${characterColors[cIdx]}${characterNouns[nIdx]}`;
    };

    // Main Header
    if (ctx) {
      ctx.font = '900 54px "Chivo", sans-serif';
      ctx.fillStyle = 'rgba(255, 230, 190, 1.0)';
      ctx.textAlign = 'center';
      ctx.fillText('W A R M   S C E N E S', centerX, y);
      
      y += 65;
      ctx.font = 'bold 28px "Nunito", sans-serif';
      ctx.fillStyle = 'rgba(255, 180, 130, 0.9)';
      ctx.fillText('A CINEMATIC DIORAMA EXPERIENCE', centerX, y);

      y += 50;
      ctx.font = 'normal 22px "Nunito", sans-serif';
      ctx.fillStyle = 'rgba(255, 150, 100, 0.75)';
      ctx.fillText('A WARMER BROS. STUDIOS PRODUCTION', centerX, y);
    }
    y += 160;

    const baseDepartments = [
      { title: "DIRECTED BY", count: 1 },
      { title: "PRODUCED BY", count: 2 },
      { title: "EXECUTIVE PRODUCERS", count: 3 },
      { title: "WRITTEN BY", count: 2 },
      { title: "BASED ON THE NOVEL BY", count: 1 },
      { title: "MUSIC COMPOSED & PERFORMED BY", count: 1 },
      { title: "DIRECTOR OF PHOTOGRAPHY", count: 1 },
      { title: "EDITED BY", count: 2 },
      { title: "PRODUCTION DESIGNER", count: 1 },
      { title: "ART DIRECTOR", count: 2 },
      { title: "COSTUME DESIGNER", count: 1 },
      { title: "MAKEUP AND HAIR DESIGNER", count: 2 },
      { title: "SOUND MIXER & SOUND DESIGN", count: 2 },
      { title: "VISUAL EFFECTS SUPERVISOR", count: 1 },
      { title: "CAST", isCast: true },
      { title: "STUNT COORDINATOR", count: 1 },
      { title: "FIRST ASSISTANT DIRECTOR", count: 1 },
      { title: "SECOND ASSISTANT DIRECTOR", count: 2 },
      { title: "CAMERA OPERATORS", count: 4 },
      { title: "FIRST ASSISTANT CAMERA", count: 3 },
      { title: "GAFFER & CHIEF LIGHTING TECHNICIAN", count: 2 },
      { title: "BEST BOY ELECTRIC", count: 2 },
      { title: "KEY GRIP & DOLLEY GRIP", count: 3 },
      { title: "SET DECORATORS & PROPS", count: 4 },
      { title: "FOLEY ARTISTS & SOUND EDITORS", count: 4 },
      { title: "RE-RECORDING MIXERS", count: 2 },
      { title: "VISUAL EFFECTS ARTISTS", count: 6 },
      { title: "SUPERVISING ANIMATORS", count: 4 },
      { title: "COMPOSITING LEAD", count: 3 },
      { title: "DIGITAL COLORIST", count: 2 },
      { title: "LOCATION MANAGERS", count: 3 },
      { title: "STUNT TEAM", count: 6 },
      { title: "TRANSPORTATION COORDINATORS", count: 3 },
      { title: "CATERING & CRAFT SERVICES", count: 4 },
      { title: "PRODUCTION ACCOUNTANTS", count: 3 },
      { title: "POST PRODUCTION SUPERVISOR", count: 2 },
      { title: "MUSIC SUPERVISORS & CLEARANCES", count: 3 },
      { title: "SPECIAL THANKS", count: 6 },
    ];

    let nameCounter = 1;
    let sectionIdx = 0;
    
    // Fill out department listings until target height is met
    while (y < targetHeightPx - 800 || sectionIdx < baseDepartments.length) {
      const dept = baseDepartments[sectionIdx % baseDepartments.length];
      
      if (ctx) {
        ctx.font = 'bold 36px "Chivo", sans-serif'; 
        ctx.globalAlpha = 0.95;
        ctx.fillStyle = 'rgba(255, 200, 150, 1.0)';
        ctx.textAlign = 'center';
        
        const spacedJob = dept.title.split('').join(' ');
        ctx.fillText(spacedJob, centerX, y);
      }
      y += 60;

      if (dept.isCast) {
        const castCount = (targetHeightPx > 15000) ? 24 : 12;
        for (let i = 0; i < castCount; i++) {
          if (ctx) {
            ctx.font = 'normal 30px "Chivo", sans-serif';
            ctx.globalAlpha = 0.85;
            ctx.fillStyle = 'rgba(255, 220, 180, 0.9)';
            
            const actor = getActorName(nameCounter);
            const character = getCharacterName(nameCounter);
            
            ctx.textAlign = 'right';
            ctx.fillText(actor, centerX - 30, y);
            
            ctx.textAlign = 'left';
            ctx.fillText(character, centerX + 30, y);
          }
          nameCounter++;
          y += 48;
        }
      } else {
        const count = dept.count || 2;
        for (let i = 0; i < count; i++) {
          if (ctx) {
            ctx.font = 'normal 30px "Chivo", sans-serif'; 
            ctx.globalAlpha = 0.85;
            ctx.fillStyle = 'rgba(255, 220, 180, 0.9)';
            ctx.textAlign = 'center';
            ctx.fillText(getActorName(nameCounter), centerX, y);
          }
          nameCounter++;
          y += 48;
        }
      }

      y += 100;
      sectionIdx++;
    }

    // Warmer Bros Studios End Credits Block
    y += 60;
    if (ctx) {
      ctx.globalAlpha = 1.0;
      // Top decorative bar
      ctx.strokeStyle = 'rgba(255, 200, 150, 0.6)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(centerX - 350, y);
      ctx.lineTo(centerX + 350, y);
      ctx.stroke();

      y += 60;
      ctx.font = 'bold 36px "Chivo", sans-serif';
      ctx.fillStyle = 'rgba(255, 220, 180, 1.0)';
      ctx.textAlign = 'center';
      ctx.fillText('PRODUCED AND DISTRIBUTED BY', centerX, y);

      y += 55;
      ctx.font = '900 52px "Chivo", sans-serif';
      ctx.fillStyle = 'rgba(255, 240, 210, 1.0)';
      ctx.fillText('WARMER BROS. STUDIOS', centerX, y);

      y += 65;
      ctx.font = 'bold 26px "Nunito", sans-serif';
      ctx.fillStyle = 'rgba(255, 200, 150, 0.9)';
      ctx.fillText('COPYRIGHT © 2026 WARMER BROS. PICTURES INC.', centerX, y);

      y += 38;
      ctx.font = 'normal 22px "Nunito", sans-serif';
      ctx.fillStyle = 'rgba(230, 180, 140, 0.8)';
      ctx.fillText('ALL RIGHTS RESERVED.', centerX, y);

      y += 55;
      const disclaimerLines = [
        'THIS MOTION PICTURE IS PROTECTED UNDER THE LAWS OF THE UNITED STATES',
        'AND OTHER COUNTRIES. ANY UNAUTHORIZED DUPLICATION, DISTRIBUTION OR EXHIBITION',
        'MAY RESULT IN CIVIL LIABILITY AND CRIMINAL PROSECUTION.',
        '',
        'WARMER BROS. STUDIOS ® REG. U.S. PAT. OFF.',
        'WARM SCENES DIORAMA RENDER ENGINE v2.5',
        'FILMED ON LOCATION IN WARM SCENES VIRTUAL SOUNDSTAGE'
      ];

      disclaimerLines.forEach(line => {
        if (line === '') {
          y += 18;
          return;
        }
        ctx.font = 'bold 18px "Nunito", sans-serif';
        ctx.fillStyle = 'rgba(200, 160, 130, 0.75)';
        ctx.fillText(line, centerX, y);
        y += 30;
      });

      y += 25;
      // Bottom decorative bar
      ctx.strokeStyle = 'rgba(255, 200, 150, 0.6)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(centerX - 350, y);
      ctx.lineTo(centerX + 350, y);
      ctx.stroke();
    } else {
      y += 60 + 55 + 65 + 38 + 55 + (7 * 30) + 25;
    }

    const bottomY = y;
    const totalCanvasHeight = Math.ceil(bottomY + 1200);

    return { topY, bottomY, totalCanvasHeight };
  }

  private setupPostProcessing() {
    this.composer = new EffectComposer(this.renderer);
    
    const renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(renderPass);
    
    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(this.clientWidth, this.clientHeight),
      1.5, // strength
      0.5, // radius
      0.9  // threshold - Increased so sky doesn't bloom
    );
    this.composer.addPass(bloomPass);
    
    this.customGrainPass = new ShaderPass(CinematicGrainShader);
    this.customGrainPass.uniforms.uAmount.value = this.grainAmount;
    this.composer.addPass(this.customGrainPass);

    const outputPass = new OutputPass();
    this.composer.addPass(outputPass);
  }

  private handleResize = () => {
    this.camera.aspect = this.clientWidth / this.clientHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(this.clientWidth, this.clientHeight);
    this.composer.setSize(this.clientWidth, this.clientHeight);
    if (this.backgroundUniforms) {
      this.backgroundUniforms.uResolution.value.set(this.clientWidth, this.clientHeight);
    }
  };

  private renderLoop = () => {
    this.animationFrameId = requestAnimationFrame(this.renderLoop);
    
    const time = this.clock.getElapsedTime();
    const currentRealTime = performance.now() / 1000;
    const delta = this.lastFrameTime === 0 ? 0 : (currentRealTime - this.lastFrameTime);
    this.lastFrameTime = currentRealTime;

    // Track audio time if playing
    if (this.audioManager.isLoaded) {
      this.audioTime = this.audioManager.getCurrentTime();
      this.isAudioPlaying = this.audioManager.isPlaying;
    }

    const dur = this.audioDuration || 60;
    let currentTime = 0;

    if (this.syncToAudio && this.audioDuration > 0) {
      currentTime = this.audioTime;
      this.sunsetManualProgress = Math.max(0, Math.min(1, currentTime / dur));
    } else {
      if (this.isSunsetRunning) {
        this.sunsetManualProgress += (this.sunsetSpeed * delta) / 1.1;
        if (this.sunsetManualProgress > 1.0) {
          this.sunsetManualProgress = 1.0;
          this.isSunsetRunning = false;
        }
      }
      currentTime = this.sunsetManualProgress * dur;
    }

    const startSunY = 0.35;
    const endSunY = -0.55 - (this.sunSize * 1.25) - 0.25;
    this.sunY = startSunY + (endSunY - startSunY) * this.sunsetManualProgress;

    if (this.backgroundUniforms) {
      this.backgroundUniforms.uTime.value = time;
      this.backgroundUniforms.uSunY.value = this.sunY;
      this.backgroundUniforms.uSunSize.value = this.sunSize;
      this.backgroundUniforms.uSunGlowAmount.value = this.sunGlowAmount;
      this.backgroundUniforms.uSunsetProgress.value = this.sunsetManualProgress;
    }
    
    if (this.customGrainPass) {
      this.customGrainPass.uniforms.uTime.value = time;
    }
    
    // 1. Roll progress: credits roll finishes 3.5s before end of track
    const rollDuration = Math.max(1.0, dur - 3.5);
    const rollProgress = Math.max(0, Math.min(1, currentTime / rollDuration));
    if (this.creditsMesh && this.creditsStartY !== undefined && this.creditsEndY !== undefined) {
      this.creditsMesh.position.y = this.creditsStartY + rollProgress * (this.creditsEndY - this.creditsStartY);
    }

    // 2. Fade to black in final 1.5 seconds of track
    const fadeStartTime = Math.max(0, dur - 1.5);
    const fadeProgress = (dur > fadeStartTime) 
      ? Math.max(0, Math.min(1, (currentTime - fadeStartTime) / (dur - fadeStartTime))) 
      : 0;
    if (this.fadeMaterial) {
      this.fadeMaterial.opacity = fadeProgress;
    }
    
    // Animate floating couple
    if (this.silhouetteMesh) {
      if (this.selectedFigure === 'couple') {
        const floatY = Math.sin(time * 0.4) * 0.03 + Math.sin(time * 0.15) * 0.02;
        const floatX = Math.cos(time * 0.3) * 0.02;
        this.silhouetteMesh.position.y = this.silhouetteBaseY + floatY;
        this.silhouetteMesh.position.x = -1.2 + floatX;
      } else {
        this.silhouetteMesh.position.y = this.silhouetteBaseY;
      }
    }
    
    this.composer.render();
  };

  private toggleConfigPanel() {
    this.showConfigPanel = !this.showConfigPanel;
  }

  private handleSunSizeChange(e: Event) {
    const target = e.target as HTMLInputElement;
    this.sunSize = parseFloat(target.value);
    this.saveConfigToLocalStorage();
  }

  private handleGlowChange(e: Event) {
    const target = e.target as HTMLInputElement;
    this.sunGlowAmount = parseFloat(target.value);
    this.saveConfigToLocalStorage();
  }

  private handleGrainChange(e: Event) {
    const target = e.target as HTMLInputElement;
    this.grainAmount = parseFloat(target.value);
    if (this.customGrainPass) {
      this.customGrainPass.uniforms.uAmount.value = this.grainAmount;
    }
    this.saveConfigToLocalStorage();
  }

  private changeFigure(figure: 'couple' | 'cowboy' | 'chairs') {
    this.selectedFigure = figure;
    this.loadSilhouette(figure);
    this.saveConfigToLocalStorage();
  }

  private toggleSyncToAudio() {
    this.syncToAudio = !this.syncToAudio;
    if (this.syncToAudio) {
      this.isSunsetRunning = false;
    }
    this.saveConfigToLocalStorage();
  }

  private handleSunsetSpeedChange(e: Event) {
    const target = e.target as HTMLInputElement;
    this.sunsetSpeed = parseFloat(target.value);
    this.saveConfigToLocalStorage();
  }

  private handleCreditsSpeedChange(e: Event) {
    const target = e.target as HTMLInputElement;
    this.creditsSpeed = parseFloat(target.value);
    this.saveConfigToLocalStorage();
  }

  private handleSunsetProgressChange(e: Event) {
    const target = e.target as HTMLInputElement;
    this.sunsetManualProgress = parseFloat(target.value);
    this.isSunsetRunning = false;
    this.saveConfigToLocalStorage();
  }

  private toggleSunsetPlayState() {
    this.isSunsetRunning = !this.isSunsetRunning;
  }

  private resetSunset() {
    this.sunsetManualProgress = 0.0;
    this.isSunsetRunning = true;
    this.saveConfigToLocalStorage();
  }

  private triggerAudioUpload() {
    const input = this.shadowRoot?.getElementById('sunset-audio-loader') as HTMLInputElement | null;
    input?.click();
  }

  private async handleAudioUpload(e: Event) {
    const input = e.target as HTMLInputElement;
    if (input.files && input.files[0]) {
      const file = input.files[0];
      this.audioName = file.name;
      try {
        await this.audioManager.loadFile(file);
        this.audioDuration = this.audioManager.duration;
        this.audioTime = 0;
        this.audioVolume = this.audioManager.volume;
        this.audioLoop = this.audioManager.loop;
        
        // Rebuild credits canvas and scroll bounds for uploaded audio duration
        this.createCredits(this.audioDuration);

        // Auto play on upload
        this.audioManager.play();
        this.isAudioPlaying = true;
      } catch (err) {
        console.error("Error loading audio file:", err);
        alert("Failed to load audio file.");
      }
    }
  }

  private toggleAudioPlay() {
    if (this.audioManager.isLoaded) {
      if (this.audioManager.isPlaying) {
        this.audioManager.pause();
        this.isAudioPlaying = false;
      } else {
        this.audioManager.play();
        this.isAudioPlaying = true;
      }
    }
  }

  private stopAudio() {
    if (this.audioManager.isLoaded) {
      this.audioManager.stop();
      this.isAudioPlaying = false;
      this.audioTime = 0;
    }
  }

  private toggleAudioLoop() {
    if (this.audioManager.isLoaded) {
      this.audioLoop = !this.audioLoop;
      this.audioManager.loop = this.audioLoop;
    }
  }

  private handleVolumeChange(e: Event) {
    const target = e.target as HTMLInputElement;
    this.audioVolume = parseFloat(target.value);
    this.audioManager.volume = this.audioVolume;
  }

  private handleProgressClick(e: MouseEvent) {
    if (!this.audioDuration) return;
    const bar = e.currentTarget as HTMLDivElement;
    const rect = bar.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const percentage = clickX / rect.width;
    const seekTime = percentage * this.audioDuration;
    this.audioManager.seek(seekTime);
    this.audioTime = seekTime;
  }

  private clearAudio() {
    this.audioManager.clear();
    this.audioName = '';
    this.audioTime = 0;
    this.audioDuration = 0;
    this.isAudioPlaying = false;
    const input = this.shadowRoot?.getElementById('sunset-audio-loader') as HTMLInputElement | null;
    if (input) input.value = '';
  }

  private formatTime(seconds: number): string {
    if (isNaN(seconds) || seconds === 0) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  }

  render() {
    return html`
      <div class="letterbox top"></div>
      
      <!-- Settings Toggle Button -->
      <button class="settings-toggle" @click="${this.toggleConfigPanel}">
        <svg viewBox="0 0 24 24">
          <path d="M19.14,12.94c0.04-0.3,0.06-0.61,0.06-0.94c0-0.32-0.02-0.64-0.07-0.94l2.03-1.58c0.18-0.14,0.23-0.41,0.12-0.61 l-1.92-3.32c-0.12-0.22-0.37-0.29-0.59-0.22l-2.39,0.96c-0.5-0.38-1.03-0.7-1.62-0.94L14.4,2.81c-0.04-0.24-0.24-0.41-0.48-0.41 h-3.84c-0.24,0-0.43,0.17-0.47,0.41L9.25,5.35C8.66,5.59,8.12,5.92,7.63,6.29L5.24,5.33c-0.22-0.08-0.47,0-0.59,0.22L2.74,8.87 C2.62,9.08,2.66,9.34,2.86,9.48l2.03,1.58C4.84,11.36,4.8,11.69,4.8,12s0.02,0.64,0.07,0.94l-2.03,1.58 c-0.18,0.14-0.23,0.41-0.12,0.61l1.92,3.32c0.12,0.22,0.37,0.29,0.59,0.22l2.39-0.96c0.5,0.38,1.03,0.7,1.62,0.94l0.36,2.54 c0.05,0.24,0.24,0.41,0.48,0.41h3.84c0.24,0,0.44-0.17,0.47-0.41l0.36-2.54c0.59-0.24,1.13-0.56,1.62-0.94l2.39,0.96 c0.22,0.08,0.47,0,0.59-0.22l1.92-3.32c0.12-0.22,0.07-0.47-0.12-0.61L19.14,12.94z M12,15.6c-1.98,0-3.6-1.62-3.6-3.6 s1.62-3.6,3.6-3.6s3.6,1.62,3.6,3.6S13.98,15.6,12,15.6z"/>
        </svg>
      </button>

      <!-- Settings Panel -->
      <div class="settings-panel ${this.showConfigPanel ? 'open' : ''}">
        <div class="settings-header">
          <h2 class="settings-title">Sunset Config</h2>
          <button class="close-btn" @click="${this.toggleConfigPanel}">&times;</button>
        </div>

        <div class="settings-content">
          <!-- Sun Width Control -->
          <div class="control-group">
            <div class="control-label">
              <span>Sun Width</span>
              <span class="control-value">${this.sunSize.toFixed(2)}</span>
            </div>
            <input 
              type="range" 
              min="0.1" 
              max="1.5" 
              step="0.05" 
              .value="${this.sunSize}" 
              @input="${this.handleSunSizeChange}"
            />
          </div>

          <!-- Sun Glow Control -->
          <div class="control-group">
            <div class="control-label">
              <span>Sun Glow</span>
              <span class="control-value">${this.sunGlowAmount.toFixed(2)}</span>
            </div>
            <input 
              type="range" 
              min="0.0" 
              max="5.0" 
              step="0.1" 
              .value="${this.sunGlowAmount}" 
              @input="${this.handleGlowChange}"
            />
          </div>

          <!-- Film Grain Control -->
          <div class="control-group">
            <div class="control-label">
              <span>Film Grain</span>
              <span class="control-value">${this.grainAmount.toFixed(2)}</span>
            </div>
            <input 
              type="range" 
              min="0.0" 
              max="25.0" 
              step="0.1" 
              .value="${this.grainAmount}" 
              @input="${this.handleGrainChange}"
            />
          </div>

          <!-- Loaded Figure Selector -->
          <div class="control-group">
            <div class="control-label">Active Figure</div>
            <div class="chips-container">
              <button 
                class="chip ${this.selectedFigure === 'couple' ? 'active' : ''}" 
                @click="${() => this.changeFigure('couple')}"
              >
                Couple
              </button>
              <button 
                class="chip ${this.selectedFigure === 'cowboy' ? 'active' : ''}" 
                @click="${() => this.changeFigure('cowboy')}"
              >
                Cowboy
              </button>
              <button 
                class="chip ${this.selectedFigure === 'chairs' ? 'active' : ''}" 
                @click="${() => this.changeFigure('chairs')}"
              >
                Chairs
              </button>
            </div>
          </div>

          <!-- Sunset Mode -->
          <div class="control-group">
            <div class="switch-container" @click="${this.toggleSyncToAudio}">
              <span class="switch-label">Sync to Audio Length</span>
              <label class="switch">
                <input type="checkbox" .checked="${this.syncToAudio}" readonly />
                <span class="slider"></span>
              </label>
            </div>
          </div>

          <!-- Sunset Speed & Credits Speed (Only if not synced) -->
          ${!this.syncToAudio ? html`
            <div class="control-group">
              <div class="control-label">
                <span>Sunset Speed</span>
                <span class="control-value">${this.sunsetSpeed.toFixed(3)}</span>
              </div>
              <input 
                type="range" 
                min="0.0" 
                max="0.1" 
                step="0.005" 
                .value="${this.sunsetSpeed}" 
                @input="${this.handleSunsetSpeedChange}"
              />
            </div>
            
            <div class="control-group">
              <div class="control-label">
                <span>Credits Speed</span>
                <span class="control-value">${this.creditsSpeed.toFixed(4)}</span>
              </div>
              <input 
                type="range" 
                min="0.0" 
                max="0.01" 
                step="0.0001" 
                .value="${this.creditsSpeed}" 
                @input="${this.handleCreditsSpeedChange}"
              />
            </div>

            <!-- Sunset Timeline Slider -->
            <div class="control-group">
              <div class="control-label">
                <span>Sunset Progress</span>
                <span class="control-value">${Math.round(this.sunsetManualProgress * 100)}%</span>
              </div>
              <input 
                type="range" 
                min="0" 
                max="1" 
                step="0.01" 
                .value="${this.sunsetManualProgress}" 
                @input="${this.handleSunsetProgressChange}"
              />
              <div style="display: flex; gap: 8px;">
                <button class="btn-reset" style="flex: 1;" @click="${this.toggleSunsetPlayState}">
                  ${this.isSunsetRunning ? 'Pause' : 'Resume'}
                </button>
                <button class="btn-reset" style="flex: 1;" @click="${this.resetSunset}">
                  Reset
                </button>
              </div>
            </div>
          ` : ''}

          <!-- Audio Uploader / Player Section -->
          <div class="control-group">
            <div class="control-label">Audio Track</div>
            
            <input 
              type="file" 
              id="sunset-audio-loader" 
              accept="audio/*" 
              style="display: none;" 
              @change="${this.handleAudioUpload}" 
            />

            ${!this.audioName ? html`
              <div class="audio-uploader" @click="${this.triggerAudioUpload}">
                <svg viewBox="0 0 24 24">
                  <path d="M19.35,10.04C18.67,6.59,15.64,4,12,4C9.11,4,6.6,5.64,5.35,8.04C2.34,8.36,0,10.91,0,14c0,3.31,2.69,6,6,6h13 c2.76,0,5-2.24,5-5C24,12.36,21.95,10.22,19.35,10.04z M19,18H6c-2.21,0-4-1.79-4-4c0-2.05,1.53-3.76,3.56-3.97l1.07-0.11 l0.5-0.95C8.08,7.14,9.94,6,12,6c2.62,0,4.88,1.86,5.39,4.43l0.3,1.5l1.53,0.11c1.56,0.1,2.78,1.41,2.78,2.96 C22,16.79,20.66,18,19,18z M8,13h2.55v3h2.9v-3H16l-4-4L8,13z"/>
                </svg>
                <span>Click to Upload Audio</span>
              </div>
            ` : html`
              <div class="audio-info-box">
                <div class="audio-title-text" title="${this.audioName}">${this.audioName}</div>
                
                <div class="audio-controls">
                  <!-- Play / Pause Button -->
                  <button class="audio-btn" @click="${this.toggleAudioPlay}">
                    ${this.isAudioPlaying ? html`
                      <!-- Pause Icon -->
                      <svg viewBox="0 0 24 24"><path d="M6,19h4V5H6V19z M14,5v14h4V5H14z"/></svg>
                    ` : html`
                      <!-- Play Icon -->
                      <svg viewBox="0 0 24 24"><path d="M8,5v14l11-7L8,5z"/></svg>
                    `}
                  </button>

                  <!-- Stop Button -->
                  <button class="audio-btn" @click="${this.stopAudio}">
                    <!-- Stop Icon -->
                    <svg viewBox="0 0 24 24"><path d="M6,6h12v12H6V6z"/></svg>
                  </button>

                  <!-- Loop Button -->
                  <button class="audio-btn" style="${this.audioLoop ? 'color:#ff6e3c;' : ''}" @click="${this.toggleAudioLoop}">
                    <!-- Loop Icon -->
                    <svg viewBox="0 0 24 24"><path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46C19.54 15.03 20 13.57 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74C4.46 9.03 4 10.46 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z"/></svg>
                  </button>
                </div>

                <!-- Progress Bar -->
                <div class="audio-progress-container">
                  <span>${this.formatTime(this.audioTime)}</span>
                  <div class="audio-progress-bar" @click="${this.handleProgressClick}">
                    <div class="audio-progress-fill" style="width: ${(this.audioTime / this.audioDuration) * 100}%"></div>
                  </div>
                  <span>${this.formatTime(this.audioDuration)}</span>
                </div>

                <!-- Volume Bar -->
                <div class="control-group" style="margin-top: 10px;">
                  <div class="control-label" style="font-size: 10px;">
                    <span>Volume</span>
                    <span class="control-value">${Math.round(this.audioVolume * 100)}%</span>
                  </div>
                  <input 
                    type="range" 
                    min="0" 
                    max="1" 
                    step="0.05" 
                    .value="${this.audioVolume}" 
                    @input="${this.handleVolumeChange}"
                  />
                </div>

                <!-- Remove/Load New Button -->
                <button class="btn-reset" style="width: 100%; margin-top: 8px; font-size: 10px; padding: 6px 0;" @click="${this.clearAudio}">
                  Clear Audio
                </button>
              </div>
            `}
          </div>

          <!-- Export HyperFrames Config Button -->
          <div class="control-group" style="margin-top: 8px;">
            <button 
              class="btn-reset" 
              style="background: rgba(255, 110, 60, 0.25); border-color: #ff6e3c; color: #ffffff; padding: 10px; font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; width: 100%; cursor: pointer;"
              @click="${this.exportConfig}">
              Export HyperFrames Config
            </button>
          </div>

        </div>
      </div>

      <canvas></canvas>
      <div class="letterbox bottom"></div>
    `;
  }
}
