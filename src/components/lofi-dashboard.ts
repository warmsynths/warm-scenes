import { LitElement, html, css } from 'lit';
import { customElement, state, property } from 'lit/decorators.js';
import { AudioManager } from '../utils/audio-manager';
import './lofi-diorama';
import './gear-preview';

import ufoPosterImg from '../assets/posters/iwanttobelieve_.jpg';
import tr808PosterImg from '../assets/posters/tr808.png';
import mpcPosterImg from '../assets/posters/mpc.jpg';
import greenRugImg from '../assets/rugs/green_arched_rug.png';
import pinkRugImg from '../assets/rugs/pink_arched_rug.png';
import whiteRugImg from '../assets/rugs/white_arched_rug.png';

type Weather = 'sunny' | 'rainy' | 'thunderstorm';
type TimeOfDay = 'day' | 'sunset' | 'night';

@customElement('lofi-dashboard')
export class LofiDashboard extends LitElement {
  @state()
  private audioManager = new AudioManager();

  @state()
  private isDragOver = false;

  @state()
  private fileInfo: { name: string; size: string; duration: string } | null = null;

  @state()
  private currentTimeStr = '00:00';

  @state()
  private totalTimeStr = '00:00';

  @state()
  private progressPercent = 0;

  @state()
  private weather: Weather = 'sunny';

  @state()
  private timeOfDay: TimeOfDay = 'day';

  @state()
  private celestialPosition: number = 50;

  @state()
  private rainIntensity: number = 50;

  @state()
  private lightningIntensity: number = 50;

  private getInitialGear(): string[] {
    const saved = localStorage.getItem('lofi_active_gear');
    if (saved) {
      try { return JSON.parse(saved); } catch(e) {}
    }
    return ['polyend', 'circuit_tracks', 'mood', 'blooper', 'generation_loss', 'sp404', 'm8', 'poster_believe', 'poster_808', 'poster_mpc', 'lamp', 'cup', 'succulent_echeveria', 'succulent_moonstones', 'succulent_haworthia', 'succulent_pearls', 'succulent_jade'];
  }

  @property({ type: Array })
  private activeGear: string[] = this.getInitialGear();

  @state()
  private activePanel: 'gear' | 'environment' | 'audio' | null = null;

  @state()
  private expandedCategory: string | null = null;

  @state()
  private isAudioOpen = false;

  private progressUpdateId: number | null = null;
  private isScrubbing = false;

  static styles = css`
    :host {
      display: block;
      width: 100%;
      height: 100vh;
      position: relative;
      font-family: 'Nunito', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      overflow: hidden;
      background-color: #0b090f;
    }

    lofi-diorama {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
    }

    .frameless-top-panel {
      position: absolute;
      top: 88px;
      left: 24px;
      width: 540px;
      max-height: calc(100vh - 110px);
      overflow-y: auto;
      scrollbar-width: thin;
      scrollbar-color: rgba(255, 255, 255, 0.25) transparent;
      display: flex;
      flex-direction: column;
      gap: 16px;
      transition: all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
      z-index: 100;
      opacity: 1;
      pointer-events: auto;
      padding-right: 8px;
    }

    .frameless-top-panel::-webkit-scrollbar {
      width: 6px;
    }

    .frameless-top-panel::-webkit-scrollbar-track {
      background: transparent;
    }

    .frameless-top-panel::-webkit-scrollbar-thumb {
      background-color: rgba(255, 255, 255, 0.25);
      border-radius: 3px;
    }

    .frameless-top-panel.hidden {
      transform: translateY(-20px);
      opacity: 0;
      pointer-events: none;
    }

    .frameless-bottom-panel {
      position: absolute;
      bottom: 24px;
      left: 50%;
      transform: translateX(-50%);
      width: 90%;
      max-width: 1000px;
      display: flex;
      justify-content: center;
      transition: all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
      z-index: 100;
      opacity: 1;
      pointer-events: auto;
    }

    .frameless-bottom-panel.hidden {
      transform: translate(-50%, 150%);
      opacity: 0;
      pointer-events: none;
    }

    .audio-btn.active-loop {
      background: #ffb4a2;
      color: white;
      box-shadow: 0 6px 16px rgba(255, 180, 162, 0.4);
    }

    /* Gear Tab */
    .gear-section {
      display: flex;
      flex-direction: column;
      gap: 12px;
      margin-bottom: 16px;
    }
    .gear-section:last-child {
      margin-bottom: 0;
    }

    .gear-category-title {
      font-size: 1.0rem;
      font-weight: 700;
      color: #d0c0b0;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      padding-left: 12px;
    }

    .gear-grid {
      display: flex;
      gap: 16px;
      overflow-x: auto;
      padding: 12px;
      scrollbar-width: none;
      width: 134px;
      scroll-snap-type: x mandatory;
      scroll-behavior: smooth;
    }
    .gear-grid::-webkit-scrollbar {
      display: none;
    }

    .gear-card {
      width: 100%;
      aspect-ratio: 1;
      background: rgba(0, 0, 0, 0.4);
      border-radius: 20px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 8px;
      cursor: pointer;
      transition: all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
      border: 2px solid rgba(255, 255, 255, 0.05);
      text-align: center;
      padding: 10px;
      box-sizing: border-box;
      user-select: none;
      color: #a0a0a0;
    }

    .gear-card:hover {
      transform: translateY(-4px) scale(1.05);
      background: rgba(0, 0, 0, 0.6);
      border-color: rgba(255, 255, 255, 0.2);
      color: white;
    }

    .gear-card.active {
      border-color: rgba(163, 217, 201, 0.8);
      background: rgba(45, 106, 89, 0.4);
      color: #ffffff;
      box-shadow: 0 0 12px rgba(163, 217, 201, 0.2);
    }

    .gear-card.disabled {
      opacity: 0.35;
      filter: grayscale(1);
      cursor: not-allowed;
      pointer-events: none;
    }
    .carousel-container {
      display: flex;
      align-items: center;
      justify-content: flex-start;
      gap: 12px;
      width: 100%;
    }

    .carousel-btn {
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.1);
      color: white;
      width: 40px;
      height: 90px;
      border-radius: 12px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s;
      flex-shrink: 0;
    }

    .carousel-btn:hover {
      background: rgba(255, 255, 255, 0.15);
      transform: scale(1.05);
    }
    
    .carousel-btn:active {
      transform: scale(0.95);
    }

    .gear-icon {
      width: 64px;
      height: 64px;
      margin: 0 auto 8px;
    }

    .gear-name {
      font-size: 0.95rem;
      font-weight: 800;
      color: #8c7b6c;
      line-height: 1.2;
    }

    /* Environment Tab */
    .weather-grid {
      display: flex;
      gap: 16px;
      overflow-x: auto;
      padding: 12px;
      scrollbar-width: none;
      width: 134px;
      scroll-snap-type: x mandatory;
      scroll-behavior: smooth;
    }
    .weather-grid::-webkit-scrollbar {
      display: none;
    }

    .weather-card {
      flex: 0 0 auto;
      width: 110px;
      height: 110px;
      background: rgba(0, 0, 0, 0.4);
      border-radius: 20px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 8px;
      cursor: pointer;
      transition: all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
      border: 2px solid rgba(255, 255, 255, 0.05);
      text-align: center;
      padding: 10px;
      user-select: none;
      color: #a0a0a0;
      scroll-snap-align: center;
    }

    .weather-card:hover {
      transform: translateY(-4px) scale(1.05);
      background: rgba(0, 0, 0, 0.6);
      border-color: rgba(255, 255, 255, 0.2);
      color: white;
    }

    .weather-card.active {
      border-color: rgba(163, 217, 201, 0.8);
      background: rgba(45, 106, 89, 0.4);
      color: #ffffff;
      box-shadow: 0 0 12px rgba(163, 217, 201, 0.2);
    }

    .weather-icon {
      font-size: 2.5rem;
    }

    .weather-label {
      font-size: 0.95rem;
      font-weight: 800;
      color: #8c7b6c;
      line-height: 1.2;
    }

    /* Audio Tab */
    .audio-row {
      display: flex;
      align-items: center;
      gap: 24px;
      padding: 0;
      width: 100%;
    }

    .dropzone {
      border: 2px dashed rgba(255, 180, 162, 0.4);
      background: rgba(255, 245, 242, 0.1);
      border-radius: 24px;
      padding: 12px 24px;
      text-align: center;
      cursor: pointer;
      transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
      color: #ffb4a2;
      font-weight: 800;
      font-size: 1.1rem;
      display: flex;
      align-items: center;
      gap: 12px;
      backdrop-filter: blur(12px);
    }

    .dropzone.dragover {
      background: rgba(255, 180, 162, 0.2);
      color: white;
      transform: scale(1.02);
      border-color: rgba(255, 180, 162, 0.8);
    }

    .dropzone-icon {
      font-size: 2rem;
    }

    .info-card {
      background: transparent;
      padding: 0 16px;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: flex-start;
      font-weight: 700;
      color: #d0c0b0;
      font-size: 1.1rem;
      min-width: 150px;
    }

    .info-title {
      color: rgba(255,255,255,0.4);
      text-transform: uppercase;
      font-size: 0.75rem;
      letter-spacing: 0.05em;
    }

    .controls {
      display: flex;
      align-items: center;
      gap: 24px;
      flex-grow: 1;
    }

    .btn-group {
      display: flex;
      gap: 12px;
      align-items: center;
    }

    .audio-btn {
      background: rgba(240, 230, 210, 0.9);
      border: none;
      padding: 12px 24px;
      border-radius: 20px;
      font-size: 1rem;
      font-weight: 800;
      color: #8c7b6c;
      cursor: pointer;
      transition: all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
      font-family: 'Nunito', sans-serif;
      display: flex;
      align-items: center;
      gap: 8px;
      box-shadow: 0 6px 16px rgba(0,0,0,0.1);
      backdrop-filter: blur(12px);
    }

    .audio-btn.play-btn {
      background: #a3d9c9;
      color: #1e5a49;
      box-shadow: 0 6px 16px rgba(163, 217, 201, 0.4);
    }

    .audio-btn:hover:not(:disabled) {
      transform: translateY(-4px) scale(1.05);
      box-shadow: 0 12px 24px rgba(0,0,0,0.1);
    }

    .audio-btn.play-btn:hover:not(:disabled) {
      box-shadow: 0 12px 24px rgba(163, 217, 201, 0.5);
    }

    .audio-btn:disabled {
      opacity: 0.4;
      cursor: not-allowed;
      transform: none;
      box-shadow: none;
    }

    .slider-container {
      display: flex;
      flex-direction: column;
      gap: 8px;
      flex-grow: 1;
    }

    .time-labels {
      display: flex;
      justify-content: space-between;
      font-weight: 800;
      font-size: 1rem;
      color: #a49382;
    }

    .scrub-slider {
      -webkit-appearance: none;
      width: 100%;
      height: 12px;
      border-radius: 6px;
      background: #f0e6d2;
      outline: none;
      cursor: pointer;
    }

    .scrub-slider::-webkit-slider-runnable-track {
      width: 100%;
      height: 12px;
      border-radius: 6px;
    }

    .scrub-slider::-webkit-slider-thumb {
      -webkit-appearance: none;
      appearance: none;
      width: 24px;
      height: 24px;
      border-radius: 50%;
      background: #ffb4a2;
      cursor: pointer;
      box-shadow: 0 4px 8px rgba(255, 180, 162, 0.6);
      margin-top: -6px;
      transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
    }

    .scrub-slider::-webkit-slider-thumb:hover {
      transform: scale(1.3);
    }

    .trigger-group {
      position: absolute;
      top: 24px;
      left: 24px;
      display: flex;
      gap: 16px;
      z-index: 99;
    }

    .icon-trigger-btn {
      background: rgba(25, 20, 25, 0.65);
      backdrop-filter: blur(24px);
      -webkit-backdrop-filter: blur(24px);
      border: 1px solid rgba(255, 255, 255, 0.1);
      color: white;
      width: 48px;
      height: 48px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      font-size: 1.5rem;
      transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    }

    .icon-trigger-btn:hover {
      background: rgba(255, 255, 255, 0.15);
      transform: scale(1.1);
      border-color: rgba(255, 255, 255, 0.25);
    }
    
    .icon-trigger-btn.active {
      background: rgba(163, 217, 201, 0.8);
      border-color: rgba(163, 217, 201, 0.9);
      box-shadow: 0 0 16px rgba(163, 217, 201, 0.4);
    }
  `;

  private handleDocumentClick = (e: MouseEvent) => {
    if (!this.activePanel || this.activePanel === 'audio') return;
    
    const path = e.composedPath() as HTMLElement[];
    const clickedInsidePanel = path.some(el => 
      el.classList && (el.classList.contains('frameless-top-panel') || el.classList.contains('trigger-group'))
    );
    
    if (!clickedInsidePanel) {
      this.activePanel = null;
      this.requestUpdate();
    }
  };

  connectedCallback() {
    super.connectedCallback();
    document.addEventListener('click', this.handleDocumentClick);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener('click', this.handleDocumentClick);
    this.stopProgressLoop();
  }

  private toggleGear(gear: string) {
    if (gear === 'strat' || gear === 'reel') return;
    if (this.activeGear.includes(gear)) {
      this.activeGear = this.activeGear.filter(g => g !== gear);
    } else {
      this.activeGear = [...this.activeGear, gear];
    }
    localStorage.setItem('lofi_active_gear', JSON.stringify(this.activeGear));
  }

  private handleDragOver(e: DragEvent) {
    e.preventDefault();
    this.isDragOver = true;
  }

  private handleDragLeave() {
    this.isDragOver = false;
  }

  private async handleDrop(e: DragEvent) {
    e.preventDefault();
    this.isDragOver = false;
    const file = e.dataTransfer?.files?.[0];
    if (file) {
      await this.processAudioFile(file);
    }
  }

  private async handleFileSelect(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (file) {
      await this.processAudioFile(file);
    }
  }

  private async processAudioFile(file: File) {
    if (!file.type.startsWith('audio/') && !file.type.startsWith('video/')) {
      alert('Please select a valid audio file.');
      return;
    }

    try {
      this.stopProgressLoop();
      this.currentTimeStr = '00:00';
      this.progressPercent = 0;
      this.fileInfo = null;
      this.audioManager.clear();
      this.requestUpdate();

      const buffer = await this.audioManager.loadFile(file);
      
      const min = Math.floor(buffer.duration / 60);
      const sec = Math.floor(buffer.duration % 60);
      this.totalTimeStr = `${this.padZero(min)}:${this.padZero(sec)}`;
      this.fileInfo = {
        name: file.name,
        size: `${(file.size / (1024 * 1024)).toFixed(2)} MB`,
        duration: this.totalTimeStr,
      };

      this.requestUpdate();
    } catch (err) {
      console.error(err);
      alert('Error decoding audio file. Ensure it is a valid audio file.');
      this.fileInfo = null;
      this.requestUpdate();
    }
  }

  private startProgressLoop() {
    this.stopProgressLoop();
    const update = () => {
      if (this.audioManager.isPlaying) {
        if (!this.isScrubbing) {
          const current = this.audioManager.getCurrentTime();
          const duration = this.audioManager.duration;
          
          const min = Math.floor(current / 60);
          const sec = Math.floor(current % 60);
          this.currentTimeStr = `${this.padZero(min)}:${this.padZero(sec)}`;
          
          this.progressPercent = duration > 0 ? (current / duration) * 100 : 0;
        }
        
        this.progressUpdateId = requestAnimationFrame(update);
      }
    };
    this.progressUpdateId = requestAnimationFrame(update);
  }

  private stopProgressLoop() {
    if (this.progressUpdateId !== null) {
      cancelAnimationFrame(this.progressUpdateId);
      this.progressUpdateId = null;
    }
  }

  private handlePlay() {
    if (!this.audioManager.isLoaded) return;
    this.audioManager.play(() => {
      this.stopProgressLoop();
      this.currentTimeStr = '00:00';
      this.progressPercent = 0;
      this.requestUpdate();
    });
    this.startProgressLoop();
    this.requestUpdate();
  }

  private handlePause() {
    this.audioManager.pause();
    this.stopProgressLoop();
    this.requestUpdate();
  }

  private handleStop() {
    this.audioManager.stop();
    this.stopProgressLoop();
    this.currentTimeStr = '00:00';
    this.progressPercent = 0;
    this.requestUpdate();
  }

  private handleScrubInput(e: Event) {
    this.isScrubbing = true;
    const slider = e.target as HTMLInputElement;
    this.progressPercent = parseFloat(slider.value);
    const duration = this.audioManager.duration;
    const current = (this.progressPercent / 100) * duration;
    const min = Math.floor(current / 60);
    const sec = Math.floor(current % 60);
    this.currentTimeStr = `${this.padZero(min)}:${this.padZero(sec)}`;
  }

  private handleScrubChange(e: Event) {
    this.isScrubbing = false;
    const slider = e.target as HTMLInputElement;
    const value = parseFloat(slider.value);
    const duration = this.audioManager.duration;
    const seekTime = (value / 100) * duration;
    
    this.audioManager.seek(seekTime);
    this.requestUpdate();
  }

  private handleVolume(e: Event) {
    const slider = e.target as HTMLInputElement;
    this.audioManager.volume = parseFloat(slider.value);
    this.requestUpdate();
  }

  private padZero(num: number): string {
    return num.toString().padStart(2, '0');
  }



  private toggleCategory(categoryId: string) {
    if (this.expandedCategory === categoryId) {
      this.expandedCategory = null;
    } else {
      this.expandedCategory = categoryId;
    }
  }

  private renderDecorTab() {
    const categories = [
      { id: 'decor', label: 'Decor', items: [
        { id: 'lamp', label: 'Desk Lamp', icon: '💡', cat: 'Decor', disabled: false },
        { id: 'cup', label: 'Coffee Cup', icon: '☕', cat: 'Decor', disabled: false },
        { id: 'rug_green_arched', label: 'Green Rug', img: greenRugImg, cat: 'Rug', disabled: false },
        { id: 'rug_pink_arched', label: 'Pink Rug', img: pinkRugImg, cat: 'Rug', disabled: false },
        { id: 'rug_white_arched', label: 'White Rug', img: whiteRugImg, cat: 'Rug', disabled: false },
        { id: 'succulent_echeveria', label: 'Echeveria', icon: '🪴', cat: 'Decor', disabled: false },
        { id: 'succulent_moonstones', label: 'Moonstones', icon: '🪴', cat: 'Decor', disabled: false },
        { id: 'succulent_haworthia', label: 'Haworthia', icon: '🪴', cat: 'Decor', disabled: false },
        { id: 'succulent_pearls', label: 'String of Pearls', icon: '🪴', cat: 'Decor', disabled: false },
        { id: 'succulent_jade', label: 'Jade Plant', icon: '🪴', cat: 'Decor', disabled: false }
      ]},
      { id: 'posters', label: 'Posters', items: [
        { id: 'poster_believe', label: 'UFO Poster', img: ufoPosterImg, cat: 'Poster', disabled: false },
        { id: 'poster_808', label: '808 Poster', img: tr808PosterImg, cat: 'Poster', disabled: false },
        { id: 'poster_mpc', label: 'MPC Poster', img: mpcPosterImg, cat: 'Poster', disabled: false }
      ]},
      { id: 'other', label: 'Other', items: [
        { id: 'reel', label: 'Tape Reel', icon: '📼', cat: 'Tape', disabled: true },
        { id: 'strat', label: 'Strat', icon: '🎸', cat: 'Inst', disabled: true }
      ]},
      { id: 'pedals', label: 'Pedals', items: [
        { id: 'mood', label: 'MOOD', icon: '🎛️', cat: 'Pedal', disabled: false },
        { id: 'blooper', label: 'Blooper', icon: '🎛️', cat: 'Pedal', disabled: false },
        { id: 'generation_loss', label: 'Gen Loss', icon: '🎛️', cat: 'Pedal', disabled: false }
      ]},
      { id: 'synths', label: 'Synths', items: [
        { id: 'polyend', label: 'Polyend', icon: '🎹', cat: 'Synth', disabled: false },
        { id: 'circuit_tracks', label: 'Circuit Tracks', icon: '🎹', cat: 'Synth', disabled: false },
        { id: 'sp404', label: 'SP-404', icon: '🎹', cat: 'Synth', disabled: false },
        { id: 'm8', label: 'M8', icon: '🎹', cat: 'Synth', disabled: false }
      ]}
    ];

    const renderCard = (gear: any) => html`
      <div 
        class="gear-card ${this.activeGear.includes(gear.id) ? 'active' : ''} ${gear.disabled ? 'disabled' : ''}"
        @click="${() => !gear.disabled && this.toggleGear(gear.id)}"
      >
        <div class="gear-icon">
          ${(gear.cat === 'Poster' || gear.cat === 'Rug') && gear.img
            ? html`<img src="${gear.img}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 4px;" />`
            : gear.cat === 'Tape' || gear.cat === 'Inst' || gear.cat === 'Decor'
            ? html`<div style="font-size: 2rem; display: flex; align-items: center; justify-content: center; height: 100%;">${gear.icon}</div>` 
            : html`<gear-preview gear="${gear.id}"></gear-preview>`}
        </div>
        <div class="gear-name">${gear.label}</div>
        <div style="font-size: 0.65rem; color: rgba(255,255,255,0.4); text-transform: uppercase;">${gear.cat}</div>
      </div>
    `;

    return html`
      <div class="accordion-container" style="padding: 12px 12px 12px 0; max-height: 50vh; overflow-y: auto;">
        ${categories.map(cat => html`
          <div class="accordion-section" style="margin-bottom: 8px;">
            <div 
              class="accordion-header" 
              style="display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; background: rgba(255,255,255,0.05); border-radius: 6px; cursor: pointer; transition: background 0.2s;"
              @click="${() => this.toggleCategory(cat.id)}"
            >
              <div style="font-size: 0.9rem; font-weight: 500; text-transform: uppercase; letter-spacing: 0.05em;">${cat.label}</div>
              <div style="font-size: 0.75rem; color: rgba(255,255,255,0.5);">${this.expandedCategory === cat.id ? '▼' : '▶'}</div>
            </div>
            ${this.expandedCategory === cat.id ? html`
              <div class="accordion-content" style="padding: 12px 0;">
                <div class="gear-grid" id="grid-${cat.id}" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(100px, 1fr)); gap: 12px; width: 100%;">
                  ${cat.items.map(renderCard)}
                </div>
              </div>
            ` : ''}
          </div>
        `)}
      </div>
    `;
  }

  private renderEnvironmentTab() {
    return html`
      <div class="gear-section">
        <div class="gear-category-title">Time of Day</div>
        <div class="carousel-container" style="padding-top: 4px;">
          <div class="weather-grid" style="width: auto;">
            <div 
              class="weather-card ${this.timeOfDay === 'day' ? 'active' : ''}"
              @click="${() => this.timeOfDay = 'day'}"
            >
              <div class="weather-icon">☀️</div>
              <div class="weather-label">Day</div>
            </div>
            <div 
              class="weather-card ${this.timeOfDay === 'sunset' ? 'active' : ''}"
              @click="${() => this.timeOfDay = 'sunset'}"
            >
              <div class="weather-icon">🌅</div>
              <div class="weather-label">Sunset</div>
            </div>
            <div 
              class="weather-card ${this.timeOfDay === 'night' ? 'active' : ''}"
              @click="${() => this.timeOfDay = 'night'}"
            >
              <div class="weather-icon">🌙</div>
              <div class="weather-label">Night</div>
            </div>
          </div>
        </div>
      </div>

      <div class="gear-section">
        <div class="gear-category-title">Weather</div>
        <div class="carousel-container" style="padding-top: 4px;">
          <div class="weather-grid" style="width: auto;">
            <div 
              class="weather-card ${this.weather === 'sunny' ? 'active' : ''}"
              @click="${() => this.weather = 'sunny'}"
            >
              <div class="weather-icon">🌤️</div>
              <div class="weather-label">Clear</div>
            </div>
            <div 
              class="weather-card ${this.weather === 'rainy' ? 'active' : ''}"
              @click="${() => this.weather = 'rainy'}"
            >
              <div class="weather-icon">🌧️</div>
              <div class="weather-label">Rainy</div>
            </div>
            <div 
              class="weather-card ${this.weather === 'thunderstorm' ? 'active' : ''}"
              @click="${() => this.weather = 'thunderstorm'}"
            >
              <div class="weather-icon">⛈️</div>
              <div class="weather-label">Stormy</div>
            </div>
          </div>
        </div>
      </div>

      <div class="gear-section" style="padding: 12px; max-width: 300px;">
        <div class="gear-category-title" style="padding-left: 0; margin-bottom: 8px;">Controls</div>
        
        <div class="slider-container" style="margin-bottom: 12px;">
          <div style="font-size: 0.85rem; color: #a49382; font-weight: 700;">Sun/Moon Position</div>
          <input type="range" class="scrub-slider" min="0" max="100" .value="${this.celestialPosition.toString()}" @input="${(e: Event) => this.celestialPosition = parseFloat((e.target as HTMLInputElement).value)}" />
        </div>

        ${this.weather === 'rainy' || this.weather === 'thunderstorm' ? html`
          <div class="slider-container" style="margin-bottom: 12px;">
            <div style="font-size: 0.85rem; color: #a49382; font-weight: 700;">Rain Amount</div>
            <input type="range" class="scrub-slider" min="0" max="100" .value="${this.rainIntensity.toString()}" @input="${(e: Event) => this.rainIntensity = parseFloat((e.target as HTMLInputElement).value)}" />
          </div>
        ` : ''}

        ${this.weather === 'thunderstorm' ? html`
          <div class="slider-container" style="margin-bottom: 12px;">
            <div style="font-size: 0.85rem; color: #a49382; font-weight: 700;">Lightning Frequency</div>
            <input type="range" class="scrub-slider" min="0" max="100" .value="${this.lightningIntensity.toString()}" @input="${(e: Event) => this.lightningIntensity = parseFloat((e.target as HTMLInputElement).value)}" />
          </div>
        ` : ''}
      </div>
    `;
  }

  private renderAudioTab(isLoaded: boolean, isPlaying: boolean) {
    return html`
      <div class="audio-row">
        <div
          class="dropzone ${this.isDragOver ? 'dragover' : ''}"
          @dragover="${this.handleDragOver}"
          @dragleave="${this.handleDragLeave}"
          @drop="${this.handleDrop}"
          @click="${() => this.shadowRoot?.getElementById('file-loader')?.click()}"
        >
          <div class="dropzone-icon">📼</div>
          <div style="font-size: 0.9rem;">Load Audio</div>
          <input
            type="file"
            id="file-loader"
            accept="audio/*"
            style="display: none"
            @change="${this.handleFileSelect}"
          />
        </div>

        ${isLoaded && this.fileInfo ? html`
          <div class="info-card">
            <span class="info-title">Track</span>
            <div style="text-overflow: ellipsis; white-space: nowrap; overflow: hidden; max-width: 200px;">${this.fileInfo.name}</div>
          </div>
        ` : ''}

        <div class="controls">
          <div class="btn-group">
            <button class="audio-btn play-btn" ?disabled="${!isLoaded || isPlaying}" @click="${this.handlePlay}">▶ Play</button>
            <button class="audio-btn" ?disabled="${!isLoaded || !isPlaying}" @click="${this.handlePause}">⏸ Pause</button>
            <button class="audio-btn" ?disabled="${!isLoaded}" @click="${this.handleStop}">■ Stop</button>
            <button class="audio-btn ${this.audioManager.loop ? 'active-loop' : ''}" ?disabled="${!isLoaded}" @click="${this.toggleLoop}">🔁 Loop</button>
          </div>
          
          <div style="display: flex; gap: 16px; align-items: center;">
            <div class="slider-container" style="flex: 1;">
              <input type="range" class="scrub-slider" min="0" max="100" step="0.1" .value="${this.progressPercent.toString()}" ?disabled="${!isLoaded}" @input="${this.handleScrubInput}" @change="${this.handleScrubChange}" />
              <div class="time-labels">
                <span>${this.currentTimeStr}</span>
                <span>${this.totalTimeStr}</span>
              </div>
            </div>
            
            <div class="slider-container" style="flex: 0 0 80px; align-items: center; justify-content: center;">
              <div style="font-size: 1.0rem; color: #8c7b6c; margin-bottom: 4px;">🔊</div>
              <input type="range" class="scrub-slider" min="0" max="1" step="0.01" .value="${this.audioManager.volume.toString()}" @input="${this.handleVolume}" />
            </div>
          </div>
        </div>
      </div>
    `;
  }

  private togglePanel(panel: 'gear' | 'environment' | 'audio') {
    if (panel === 'audio') {
      this.isAudioOpen = !this.isAudioOpen;
    } else {
      if (this.activePanel === panel) {
        this.activePanel = null;
      } else {
        this.activePanel = panel;
      }
    }
  }

  private toggleLoop() {
    this.audioManager.loop = !this.audioManager.loop;
    this.requestUpdate();
  }

  render() {
    const isLoaded = this.audioManager.isLoaded;
    const isPlaying = this.audioManager.isPlaying;

    return html`
      <lofi-diorama 
        .audioManager="${this.audioManager}" 
        .weather="${this.weather}"
        .timeOfDay="${this.timeOfDay}"
        .celestialPosition="${this.celestialPosition}"
        .rainIntensity="${this.rainIntensity}"
        .lightningIntensity="${this.lightningIntensity}"
        .activeGear="${this.activeGear}"
        @toggle-settings="${() => this.togglePanel('gear')}"
        @toggle-gear="${(e: CustomEvent) => this.toggleGear(e.detail.gear)}"
      ></lofi-diorama>

      <div class="trigger-group">
        <button class="icon-trigger-btn ${this.activePanel === 'gear' ? 'active' : ''}" @click="${() => this.togglePanel('gear')}" title="Decor">🪴</button>
        <button class="icon-trigger-btn ${this.activePanel === 'environment' ? 'active' : ''}" @click="${() => this.togglePanel('environment')}" title="Environment">🌤️</button>
        <button class="icon-trigger-btn ${this.activePanel === 'audio' ? 'active' : ''}" @click="${() => this.togglePanel('audio')}" title="Audio">🎵</button>
      </div>

      <!-- Frameless Container for Gear & Environment Panels -->
      <div class="frameless-top-panel ${this.activePanel === 'gear' || this.activePanel === 'environment' ? '' : 'hidden'}">
        ${this.activePanel === 'gear' ? html`
          ${this.renderDecorTab()}
        ` : ''}
        ${this.activePanel === 'environment' ? html`
          ${this.renderEnvironmentTab()}
        ` : ''}
      </div>

      <div class="frameless-bottom-panel ${this.isAudioOpen ? '' : 'hidden'}">
        ${this.renderAudioTab(isLoaded, isPlaying)}
      </div>
    `;
  }
}
