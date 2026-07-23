import { LitElement, html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import './lofi-dashboard';
import './wavefield-screen';
import './cinematic-credits';
import type { ExportableScreen } from '../types/screen';

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
