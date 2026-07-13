import { LitElement, html, css } from 'lit';
import { customElement, property, query } from 'lit/decorators.js';
import * as THREE from 'three';
import { createGearModel } from '../utils/gear-builder';

@customElement('gear-preview')
export class GearPreview extends LitElement {
  @property({ type: String })
  gear: string = '';

  @query('.preview-container')
  container!: HTMLDivElement;

  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private renderer!: THREE.WebGLRenderer;
  private model!: THREE.Object3D;
  private animationFrameId: number | null = null;
  private resizeObserver!: ResizeObserver;

  static styles = css`
    :host {
      display: block;
      width: 100%;
      height: 100%;
      min-width: 48px;
      min-height: 48px;
    }
    .preview-container {
      width: 100%;
      height: 100%;
      pointer-events: none;
    }
  `;

  firstUpdated() {
    this.initThree();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this.animationFrameId !== null) cancelAnimationFrame(this.animationFrameId);
    if (this.resizeObserver) this.resizeObserver.disconnect();
    if (this.renderer) {
      this.renderer.dispose();
      const gl = this.renderer.getContext();
      const ext = gl.getExtension('WEBGL_lose_context');
      if (ext) ext.loseContext();
    }
  }

  private async initThree() {
    const width = this.container.clientWidth || 64;
    const height = this.container.clientHeight || 64;

    this.scene = new THREE.Scene();
    
    // Isometric-ish camera
    this.camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    this.camera.position.set(20, 20, 20); 
    this.camera.lookAt(0, 0, 0);

    this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.container.appendChild(this.renderer.domElement);

    const ambient = new THREE.AmbientLight(0xffffff, 1.2);
    this.scene.add(ambient);

    const directional = new THREE.DirectionalLight(0xffffff, 2.0);
    directional.position.set(10, 20, 10);
    this.scene.add(directional);

    this.model = await createGearModel(this.gear);
    
    // Center the model
    const box = new THREE.Box3().setFromObject(this.model);
    const center = box.getCenter(new THREE.Vector3());
    this.model.position.sub(center);
    
    // Scale model to fit within viewing frustum
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    if (maxDim > 0) {
      const scale = 28 / maxDim; // 28 makes the device fill most of the view
      this.model.scale.setScalar(scale);
    }

    // Add a slight tilt for better viewing angle
    this.model.rotation.x = 0.2;

    this.scene.add(this.model);

    this.resizeObserver = new ResizeObserver(() => {
      const w = this.container.clientWidth;
      const h = this.container.clientHeight;
      if (w === 0 || h === 0) return;
      this.renderer.setSize(w, h);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
    });
    this.resizeObserver.observe(this.container);

    this.renderLoop();
  }

  private renderLoop = () => {
    this.animationFrameId = requestAnimationFrame(this.renderLoop);
    if (this.model) {
      this.model.rotation.y += 0.01;
    }
    this.renderer.render(this.scene, this.camera);
  }

  render() {
    return html`<div class="preview-container"></div>`;
  }
}
