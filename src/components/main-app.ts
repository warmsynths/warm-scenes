import { LitElement, html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import gsap from 'gsap';
import './lofi-dashboard';
import './wavefield-screen';
import './cinematic-credits';
import type { ExportableScreen } from '../types/screen';

// HyperFrames composition contract: register one paused GSAP timeline at
// window.__timelines['<composition-id>'], built synchronously at page load.
// Uses the app's own bundled GSAP instead of a render-time CDN script so
// renders don't depend on network access. No-op outside a HyperFrames render
// (there's no #composition element in the normal dev/preview app).
const compositionEl = document.getElementById('composition');
if (compositionEl) {
  const compositionId = compositionEl.getAttribute('data-composition-id');
  if (compositionId) {
    (window as any).__timelines = (window as any).__timelines || {};
    if (!(window as any).__timelines[compositionId]) {
      (window as any).__timelines[compositionId] = gsap.timeline({ paused: true });
    }
  }
}

@customElement('main-app')
export class MainApp extends LitElement {
  @state()
  private activeScreen: 'diorama' | 'wavefield' | 'credits' = 'diorama';

  static styles = css`
    :host {
      display: block;
      width: 100vw;
      height: 100vh;
      position: relative;
    }
    
    .screen-switcher {
      position: absolute;
      top: 20px;
      right: 20px;
      z-index: 100;
      padding: 8px 12px;
      background: rgba(0, 0, 0, 0.7);
      color: white;
      border: 1px solid rgba(255, 255, 255, 0.2);
      border-radius: 8px;
      font-family: monospace;
      outline: none;
      cursor: pointer;
    }
    
    .export-btn {
      position: absolute;
      top: 20px;
      right: 200px;
      z-index: 100;
      padding: 8px 12px;
      background: rgba(0, 0, 0, 0.7);
      color: white;
      border: 1px solid rgba(255, 255, 255, 0.2);
      border-radius: 8px;
      font-family: monospace;
      outline: none;
      cursor: pointer;
    }
    
    .screen-container {
      width: 100%;
      height: 100%;
    }
  `;

  private handleScreenChange(e: Event) {
    const select = e.target as HTMLSelectElement;
    this.activeScreen = select.value as 'diorama' | 'wavefield' | 'credits';
  }

  private handleExportConfig() {
    const selector = this.activeScreen === 'diorama' 
      ? 'lofi-dashboard' 
      : this.activeScreen === 'wavefield' 
        ? 'wavefield-screen' 
        : 'cinematic-credits';
    const activeScreenEl = this.shadowRoot?.querySelector(selector) as (Element & ExportableScreen) | null;
    if (activeScreenEl && typeof activeScreenEl.exportConfig === 'function') {
      activeScreenEl.exportConfig();
    }
  }

  render() {
    return html`
      <select class="screen-switcher" @change="${this.handleScreenChange}">
        <option value="diorama" ?selected="${this.activeScreen === 'diorama'}">Diorama Screen</option>
        <option value="wavefield" ?selected="${this.activeScreen === 'wavefield'}">Wavefield Screen</option>
        <option value="credits" ?selected="${this.activeScreen === 'credits'}">Cinematic Credits</option>
      </select>

      <button id="export-config-btn" class="export-btn" @click="${this.handleExportConfig}">
        Export Config
      </button>
      
      <div class="screen-container">
        ${this.activeScreen === 'diorama' 
          ? html`<lofi-dashboard></lofi-dashboard>` 
          : this.activeScreen === 'wavefield'
            ? html`<wavefield-screen></wavefield-screen>`
            : html`<cinematic-credits></cinematic-credits>`}
      </div>
    `;
  }
}
