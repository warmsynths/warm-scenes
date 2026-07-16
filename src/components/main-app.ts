import { LitElement, html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import './diorama-screen';
import './wavefield-screen';
import { exportConfigAsJSON, exportDirectorConfig } from '../utils/exportConfig';
import type { AudioDirector } from './AudioDirector/AudioDirector';

@customElement('main-app')
export class MainApp extends LitElement {
  @state()
  private activeScreen: 'diorama' | 'wavefield' = 'diorama';

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
    this.activeScreen = select.value as 'diorama' | 'wavefield';
  }

  private handleExportConfig() {
    if (this.activeScreen === 'wavefield') {
      // Try the new director-based export first
      const wavefieldScreen = this.shadowRoot?.querySelector('wavefield-screen') as any;
      const director = wavefieldScreen?.shadowRoot?.querySelector('audio-director') as AudioDirector | null;
      
      if (director) {
        exportDirectorConfig(director);
      } else if (wavefieldScreen) {
        // Fallback to legacy export
        const script = wavefieldScreen.activeScriptEvents || [];
        let exportData: any[] = [];
        
        if (script.length === 0) {
          const state = wavefieldScreen.currentState;
          exportData = [
            { time: 0, type: 'theme', value: state.theme },
            { time: 0, type: 'device', value: state.device },
            { time: 0, type: 'speed', value: state.speed },
            { time: 0, type: 'gap', value: state.gap },
            { time: 0, type: 'height', value: state.height },
            { time: 0, type: 'mode', value: state.mode },
            { time: 0, type: 'rippleDir', value: state.rippleDir }
          ];
        } else {
          exportData = script.map((evt: any) => ({
            time: evt.time,
            type: evt.config.target,
            value: evt.config.amount
          }));
        }
        
        exportConfigAsJSON(exportData);
      }
    } else {
      // Diorama export - will be fully wired in Phase 2
      const dioramaScreen = this.shadowRoot?.querySelector('diorama-screen') as any;
      const dashboard = dioramaScreen?.shadowRoot?.querySelector('lofi-dashboard') as any;
      const director = dashboard?.shadowRoot?.querySelector('audio-director') as AudioDirector | null;
      
      if (director) {
        exportDirectorConfig(director, {
          primaryArray: dashboard.primaryArray || [],
          secondaryArray: dashboard.secondaryArray || [],
        });
      } else {
        alert("Load an audio file in the Diorama timeline first.");
      }
    }
  }

  render() {
    return html`
      <select class="screen-switcher" @change="${this.handleScreenChange}">
        <option value="diorama" ?selected="${this.activeScreen === 'diorama'}">Diorama Screen</option>
        <option value="wavefield" ?selected="${this.activeScreen === 'wavefield'}">Wavefield Screen</option>
      </select>

      <button id="export-config-btn" class="export-btn" @click="${this.handleExportConfig}">
        Export Config
      </button>
      
      <div class="screen-container">
        ${this.activeScreen === 'diorama' 
          ? html`<diorama-screen></diorama-screen>` 
          : html`<wavefield-screen></wavefield-screen>`}
      </div>
    `;
  }
}
