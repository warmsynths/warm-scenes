import { LitElement, html, css } from 'lit';
import { customElement, query } from 'lit/decorators.js';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { FilmPass } from 'three/examples/jsm/postprocessing/FilmPass.js';

@customElement('cinematic-credits')
export class CinematicCredits extends LitElement {
  static styles = css`
    :host {
      display: block;
      width: 100%;
      height: 100%;
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
      height: 15%;
      background: black;
      z-index: 10;
      pointer-events: none;
    }
    .letterbox.top { top: 0; }
    .letterbox.bottom { bottom: 0; }
  `;

  @query('canvas')
  private canvas!: HTMLCanvasElement;

  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private composer!: EffectComposer;
  
  private animationFrameId: number = 0;
  private clock = new THREE.Clock();
  
  private backgroundUniforms: any;
  private creditsCanvas!: HTMLCanvasElement;
  private creditsCtx!: CanvasRenderingContext2D;
  private creditsTexture!: THREE.CanvasTexture;
  private creditsOffset = 0;

  firstUpdated() {
    this.initScene();
    this.createBackground();
    this.createCowboy();
    this.createCredits();
    this.setupPostProcessing();
    
    window.addEventListener('resize', this.handleResize);
    
    this.clock.start();
    this.renderLoop();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    cancelAnimationFrame(this.animationFrameId);
    window.removeEventListener('resize', this.handleResize);
    this.renderer?.dispose();
    this.creditsTexture?.dispose();
  }

  private initScene() {
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: false });
    this.renderer.setSize(this.clientWidth, this.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    this.scene = new THREE.Scene();
    
    this.camera = new THREE.PerspectiveCamera(60, this.clientWidth / this.clientHeight, 0.1, 1000);
    this.camera.position.z = 5;
  }

  private createBackground() {
    // A shader material for a cinematic sunset
    this.backgroundUniforms = {
      uTime: { value: 0 },
      uResolution: { value: new THREE.Vector2(this.clientWidth, this.clientHeight) }
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
      varying vec2 vUv;

      void main() {
        // Since the plane is square (20x20), UVs are square. 
        // No aspect ratio adjustment needed here to keep the sun round in 3D.
        vec2 p = vUv * 2.0 - 1.0;

        // Background gradient (sunset sky)
        vec3 topColor = vec3(0.1, 0.05, 0.1); 
        vec3 bottomColor = vec3(0.5, 0.15, 0.05); // Darker so it doesn't bloom
        vec3 color = mix(bottomColor, topColor, vUv.y);

        // Heat haze / rippling effect
        float heat = sin(p.y * 40.0 - uTime * 4.0) * 0.015;
        heat += sin(p.x * 30.0 + uTime * 2.5) * 0.01;

        // Sun (glowing orb) - Much larger to dominate the frame
        vec2 sunPos = vec2(0.0, -0.7); // Low on the horizon
        float d = length(p - sunPos + vec2(heat, 0.0));
        float sunMask = smoothstep(0.4, 0.38, d); // Large core
        float sunGlow = smoothstep(1.2, 0.2, d);
        
        vec3 sunColor = vec3(2.0, 1.1, 0.2); // Warm intense sun
        
        color += sunColor * sunMask;
        color += sunColor * sunGlow * 0.5;

        // Horizon line/terrain base gradient
        if (vUv.y < 0.2) {
          color = mix(vec3(0.0), color, vUv.y / 0.2);
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

  private createCowboy() {
    const textureLoader = new THREE.TextureLoader();
    // Switched back to root path to ensure Vite dev server finds it reliably
    textureLoader.load('/cowboy_silhouette.png', (texture) => {
      // Custom shader to guarantee the white background becomes transparent and the black silhouette is drawn.
      const material = new THREE.ShaderMaterial({
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
            // The image is a black silhouette on a white background.
            if (texel.r > 0.5) {
              discard;
            }
            gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
          }
        `,
        transparent: true,
        depthTest: false
      });
      
      const aspect = texture.image.width / texture.image.height;
      const height = 2.5; // Adjusted for new Z depth
      const width = height * aspect;
      const geometry = new THREE.PlaneGeometry(width, height);
      
      const mesh = new THREE.Mesh(geometry, material);
      // Moved in front of credits (z = -2)
      mesh.position.set(0, -2.5, -2); 
      this.scene.add(mesh);
    });
  }

  private createCredits() {
    this.creditsCanvas = document.createElement('canvas');
    this.creditsCanvas.width = 1024;
    this.creditsCanvas.height = 4096;
    this.creditsCtx = this.creditsCanvas.getContext('2d')!;
    
    // Draw text onto the canvas
    this.drawCreditsText();

    this.creditsTexture = new THREE.CanvasTexture(this.creditsCanvas);
    this.creditsTexture.minFilter = THREE.LinearFilter;
    this.creditsTexture.magFilter = THREE.LinearFilter;
    this.creditsTexture.wrapS = THREE.ClampToEdgeWrapping;
    this.creditsTexture.wrapT = THREE.RepeatWrapping;

    const geometry = new THREE.PlaneGeometry(8, 32); 
    const material = new THREE.MeshBasicMaterial({
      map: this.creditsTexture,
      transparent: true,
      blending: THREE.NormalBlending,
      opacity: 0.9,
      depthTest: false
    });

    const mesh = new THREE.Mesh(geometry, material);
    // Pushed behind cowboy
    mesh.position.set(0, 0, -4);
    this.scene.add(mesh);
  }

  private drawCreditsText() {
    const ctx = this.creditsCtx;
    ctx.clearRect(0, 0, this.creditsCanvas.width, this.creditsCanvas.height);
    
    ctx.fillStyle = 'rgba(255, 200, 150, 1.0)';
    ctx.textAlign = 'center';
    
    let y = 500;
    const centerX = this.creditsCanvas.width / 2;
    
    const jobs = [
      "DIRECTED BY",
      "PRODUCED BY",
      "EXECUTIVE PRODUCERS",
      "WRITTEN BY",
      "MUSIC BY",
      "DIRECTOR OF PHOTOGRAPHY",
      "EDITED BY",
      "PRODUCTION DESIGNER",
      "CAST",
      "CREW"
    ];

    jobs.forEach(job => {
      ctx.font = 'bold 36px "Arial Narrow", "Helvetica Condensed", Helvetica, sans-serif'; 
      ctx.globalAlpha = 0.9;
      ctx.shadowBlur = 0;
      const spacedJob = job.split('').join(' ');
      ctx.fillText(spacedJob, centerX, y);
      y += 60;
      
      const numNames = Math.floor(Math.random() * 3) + 1;
      for (let i = 0; i < numNames; i++) {
        // Draw blurred, indistinct lines of varying lengths instead of legible names
        const lineWidth = Math.random() * 200 + 150; // Random length between 150 and 350
        
        ctx.globalAlpha = 0.8;
        ctx.fillStyle = 'rgba(255, 200, 150, 0.7)';
        ctx.shadowColor = 'rgba(255, 200, 150, 0.9)';
        ctx.shadowBlur = 12;
        
        ctx.beginPath();
        ctx.roundRect(centerX - lineWidth/2, y - 24, lineWidth, 24, 12);
        ctx.fill();
        
        ctx.shadowBlur = 0;
        ctx.fillStyle = 'rgba(255, 200, 150, 1.0)';
        y += 60;
      }
      y += 140;
    });
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
    
    const filmPass = new FilmPass(0.35, false);
    this.composer.addPass(filmPass);
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
    if (this.backgroundUniforms) {
      this.backgroundUniforms.uTime.value = time;
    }
    
    // Scroll credits
    if (this.creditsTexture) {
      this.creditsOffset += 0.001; 
      this.creditsTexture.offset.y = -this.creditsOffset; 
    }
    
    this.composer.render();
  };

  render() {
    return html`
      <div class="letterbox top"></div>
      <canvas></canvas>
      <div class="letterbox bottom"></div>
    `;
  }
}
