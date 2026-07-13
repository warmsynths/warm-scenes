import { LitElement, html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { AudioManager } from '../utils/audio-manager';
import './lofi-diorama';

type Weather = 'sunny' | 'rainy';

type Tab = 'gear' | 'environment' | 'audio';

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
  private activeGear: string[] = ['polyend', 'circuit_tracks', 'mood', 'blooper', 'sp404'];

  @state()
  private activeTab: Tab = 'gear';

  @state()
  private isPanelOpen = false;

  private progressUpdateId: number | null = null;

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

    .floating-ui {
      position: absolute;
      bottom: 24px;
      left: 50%;
      transform: translateX(-50%);
      width: 90%;
      max-width: 760px;
      background: rgba(25, 20, 25, 0.65);
      backdrop-filter: blur(24px);
      -webkit-backdrop-filter: blur(24px);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 32px;
      box-shadow: 0 20px 50px rgba(0, 0, 0, 0.5);
      padding: 12px 24px;
      color: #eaeaea;
      display: flex;
      flex-direction: column;
      gap: 16px;
      transition: all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
      z-index: 100;
    }

    .floating-ui.hidden {
      transform: translate(-50%, 150%);
      opacity: 0;
      pointer-events: none;
    }

    .hide-btn {
      position: absolute;
      top: 20px;
      right: 20px;
      background: rgba(255, 255, 255, 0.1);
      border: 1px solid rgba(255, 255, 255, 0.2);
      color: white;
      width: 36px;
      height: 36px;
      border-radius: 18px;
      font-size: 1.2rem;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s;
    }

    .hide-btn:hover {
      background: rgba(255, 255, 255, 0.2);
      transform: scale(1.1);
    }

    .audio-btn.active-loop {
      background: #ffb4a2;
      color: white;
      box-shadow: 0 6px 16px rgba(255, 180, 162, 0.4);
    }

    .tabs {
      display: flex;
      justify-content: center;
      gap: 16px;
      margin-bottom: 4px;
    }

    .tab-btn {
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.1);
      padding: 10px 24px;
      border-radius: 20px;
      font-size: 1.1rem;
      font-weight: 600;
      color: #b0b0b0;
      cursor: pointer;
      transition: all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
      font-family: 'Nunito', sans-serif;
    }

    .tab-btn:hover {
      transform: translateY(-2px);
      background: rgba(255, 255, 255, 0.15);
      color: #ffffff;
    }

    .tab-btn.active {
      background: rgba(255, 180, 162, 0.8);
      color: white;
      border-color: rgba(255, 180, 162, 0.9);
      box-shadow: 0 0 16px rgba(255, 180, 162, 0.3);
      transform: translateY(-2px);
    }

    .panel-content {
      animation: fadeIn 0.3s ease-out;
    }

    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(10px); }
      to { opacity: 1; transform: translateY(0); }
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
      padding-bottom: 8px;
      padding-left: 8px;
      padding-top: 8px;
      scrollbar-width: none;
    }
    .gear-grid::-webkit-scrollbar {
      display: none;
    }

    .gear-card {
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
      font-size: 2.5rem;
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
      gap: 24px;
      justify-content: center;
      padding: 24px 0;
    }

    .weather-card {
      width: 180px;
      height: 180px;
      background: white;
      border-radius: 36px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 16px;
      cursor: pointer;
      transition: all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
      box-shadow: 0 6px 16px rgba(0, 0, 0, 0.06);
      border: 6px solid transparent;
      user-select: none;
    }

    .weather-card:hover {
      transform: translateY(-10px) scale(1.05);
      box-shadow: 0 20px 40px rgba(0, 0, 0, 0.12);
    }

    .weather-card.active {
      border-color: #ffd670;
      background: #fff9e6;
    }

    .weather-card.active.rainy {
      border-color: #a0c4ff;
      background: #eff4ff;
    }

    .weather-icon {
      font-size: 4rem;
    }

    .weather-label {
      font-size: 1.4rem;
      font-weight: 800;
      color: #5a4b41;
    }

    /* Audio Tab */
    .audio-panel {
      display: flex;
      flex-direction: column;
      gap: 24px;
      padding: 0 16px;
    }

    .dropzone {
      border: 4px dashed #ffb4a2;
      background: #fff5f2;
      border-radius: 32px;
      padding: 40px 24px;
      text-align: center;
      cursor: pointer;
      transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
      color: #d68c7c;
      font-weight: 800;
      font-size: 1.1rem;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 12px;
    }

    .dropzone.dragover {
      background: #ffb4a2;
      color: white;
      transform: scale(1.02);
      border-color: white;
    }

    .dropzone-icon {
      font-size: 3rem;
    }

    .info-card {
      background: white;
      border-radius: 20px;
      padding: 16px 24px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.05);
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-weight: 700;
      color: #8c7b6c;
      font-size: 1.1rem;
    }

    .info-title {
      color: #a49382;
      text-transform: uppercase;
      font-size: 0.9rem;
      letter-spacing: 0.05em;
    }

    .controls {
      display: flex;
      flex-direction: column;
      gap: 20px;
    }

    .btn-group {
      display: flex;
      gap: 16px;
      justify-content: center;
    }

    .audio-btn {
      background: #f0e6d2;
      border: none;
      padding: 16px 32px;
      border-radius: 24px;
      font-size: 1.2rem;
      font-weight: 800;
      color: #8c7b6c;
      cursor: pointer;
      transition: all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
      font-family: 'Nunito', sans-serif;
      display: flex;
      align-items: center;
      gap: 8px;
      box-shadow: 0 6px 16px rgba(0,0,0,0.06);
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
      gap: 12px;
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

    .settings-trigger-btn {
      position: absolute;
      top: 24px;
      left: 24px;
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
      z-index: 99;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    }

    .settings-trigger-btn:hover {
      background: rgba(255, 255, 255, 0.15);
      transform: scale(1.1) rotate(45deg);
      border-color: rgba(255, 255, 255, 0.25);
    }
  `;

  disconnectedCallback() {
    super.disconnectedCallback();
    this.stopProgressLoop();
  }

  private toggleGear(gear: string) {
    if (gear === 'strat' || gear === 'reel') return;
    if (this.activeGear.includes(gear)) {
      this.activeGear = this.activeGear.filter(g => g !== gear);
    } else {
      this.activeGear = [...this.activeGear, gear];
    }
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
        const current = this.audioManager.getCurrentTime();
        const duration = this.audioManager.duration;
        
        const min = Math.floor(current / 60);
        const sec = Math.floor(current % 60);
        this.currentTimeStr = `${this.padZero(min)}:${this.padZero(sec)}`;
        
        this.progressPercent = duration > 0 ? (current / duration) * 100 : 0;
        
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

  private handleScrub(e: Event) {
    const slider = e.target as HTMLInputElement;
    const value = parseFloat(slider.value);
    const duration = this.audioManager.duration;
    const seekTime = (value / 100) * duration;
    
    this.audioManager.seek(seekTime);
    this.progressPercent = value;
    
    const min = Math.floor(seekTime / 60);
    const sec = Math.floor(seekTime % 60);
    this.currentTimeStr = `${this.padZero(min)}:${this.padZero(sec)}`;
    
    this.requestUpdate();
  }

  private padZero(num: number): string {
    return num.toString().padStart(2, '0');
  }

  private scrollCarousel(id: string, dir: number) {
    const el = this.shadowRoot?.getElementById(id);
    if (el) {
      el.scrollBy({ left: dir * 200, behavior: 'smooth' });
    }
  }

  private renderGearTab() {
    const allGear = [
      { id: 'polyend', label: 'Polyend', icon: '🎛️', cat: 'Seq' },
      { id: 'circuit_tracks', label: 'Circuit', icon: '🎹', cat: 'Seq' },
      { id: 'sp404', label: 'SP404', icon: '🎰', cat: 'Sampler' },
      { id: 'mood', label: 'MOOD', icon: '🎚️', cat: 'Pedal' },
      { id: 'blooper', label: 'Blooper', icon: '🔁', cat: 'Pedal' },
      { id: 'reel', label: 'Tape Reel', icon: '📼', cat: 'Tape', disabled: true },
      { id: 'strat', label: 'Strat', icon: '🎸', cat: 'Inst', disabled: true }
    ];

    const renderCard = (gear: any) => html`
      <div 
        class="gear-card ${this.activeGear.includes(gear.id) ? 'active' : ''} ${gear.disabled ? 'disabled' : ''}"
        @click="${() => !gear.disabled && this.toggleGear(gear.id)}"
      >
        <div class="gear-icon">${gear.icon}</div>
        <div class="gear-name">${gear.label}</div>
        <div style="font-size: 0.65rem; color: rgba(255,255,255,0.4); text-transform: uppercase;">${gear.cat}</div>
      </div>
    `;

    return html`
      <div class="carousel-container" style="padding-top: 4px;">
        <button class="carousel-btn" @click="${() => this.scrollCarousel('all-gear-grid', -1)}">❮</button>
        <div class="gear-grid" id="all-gear-grid" style="width: 100%;">
          ${allGear.map(renderCard)}
        </div>
        <button class="carousel-btn" @click="${() => this.scrollCarousel('all-gear-grid', 1)}">❯</button>
      </div>
    `;
  }

  private renderEnvironmentTab() {
    return html`
      <div class="weather-grid">
        <div 
          class="weather-card ${this.weather === 'sunny' ? 'active' : ''}"
          @click="${() => this.weather = 'sunny'}"
        >
          <div class="weather-icon">☀️</div>
          <div class="weather-label">Sunny</div>
        </div>
        <div 
          class="weather-card ${this.weather === 'rainy' ? 'active rainy' : ''}"
          @click="${() => this.weather = 'rainy'}"
        >
          <div class="weather-icon">🌧️</div>
          <div class="weather-label">Rainy</div>
        </div>
      </div>
    `;
  }

  private renderAudioTab(isLoaded: boolean, isPlaying: boolean) {
    return html`
      <div class="audio-panel">
        <div
          class="dropzone ${this.isDragOver ? 'dragover' : ''}"
          @dragover="${this.handleDragOver}"
          @dragleave="${this.handleDragLeave}"
          @drop="${this.handleDrop}"
          @click="${() => this.shadowRoot?.getElementById('file-loader')?.click()}"
        >
          <div class="dropzone-icon">📼</div>
          <div>Drag & Drop an audio file or click to browse</div>
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
            <div>
              <span class="info-title">Track</span><br/>
              ${this.fileInfo.name}
            </div>
            <div style="text-align: right;">
              <span class="info-title">Length</span><br/>
              ${this.fileInfo.duration}
            </div>
          </div>
        ` : ''}

        <div class="controls">
          <div class="btn-group">
            <button class="audio-btn play-btn" ?disabled="${!isLoaded || isPlaying}" @click="${this.handlePlay}">▶ Play</button>
            <button class="audio-btn" ?disabled="${!isLoaded || !isPlaying}" @click="${this.handlePause}">⏸ Pause</button>
            <button class="audio-btn" ?disabled="${!isLoaded}" @click="${this.handleStop}">■ Stop</button>
            <button class="audio-btn ${this.audioManager.loop ? 'active-loop' : ''}" ?disabled="${!isLoaded}" @click="${this.toggleLoop}">🔁 Loop</button>
          </div>
          
          <div class="slider-container">
            <input type="range" class="scrub-slider" min="0" max="100" step="0.1" .value="${this.progressPercent.toString()}" ?disabled="${!isLoaded}" @input="${this.handleScrub}" />
            <div class="time-labels">
              <span>${this.currentTimeStr}</span>
              <span>${this.totalTimeStr}</span>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  private handleToggleSettings() {
    this.isPanelOpen = !this.isPanelOpen;
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
        .activeGear="${this.activeGear}"
        @toggle-settings="${this.handleToggleSettings}"
      ></lofi-diorama>

      <button class="settings-trigger-btn" @click="${this.handleToggleSettings}" title="Settings">⚙️</button>

      <div class="floating-ui ${this.isPanelOpen ? '' : 'hidden'}">
        <button class="hide-btn" @click="${() => this.isPanelOpen = false}" title="Hide UI">⬇️</button>

        <div class="tabs">
          <button class="tab-btn ${this.activeTab === 'gear' ? 'active' : ''}" @click="${() => this.activeTab = 'gear'}">🎒 Gear</button>
          <button class="tab-btn ${this.activeTab === 'environment' ? 'active' : ''}" @click="${() => this.activeTab = 'environment'}">🌤️ Environment</button>
          <button class="tab-btn ${this.activeTab === 'audio' ? 'active' : ''}" @click="${() => this.activeTab = 'audio'}">🎵 Audio</button>
        </div>

        <div class="panel-content">
          ${this.activeTab === 'gear' ? this.renderGearTab() : ''}
          ${this.activeTab === 'environment' ? this.renderEnvironmentTab() : ''}
          ${this.activeTab === 'audio' ? this.renderAudioTab(isLoaded, isPlaying) : ''}
        </div>
      </div>
    `;
  }
}
