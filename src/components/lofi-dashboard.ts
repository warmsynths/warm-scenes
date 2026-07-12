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
  private activeGear: string[] = ['polyend', 'circuit_tracks', 'mood', 'blooper', 'reel', 'sp404', 'strat'];

  @state()
  private activeTab: Tab = 'gear';

  @state()
  private isPanelOpen = true;

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
      bottom: 32px;
      left: 50%;
      transform: translateX(-50%);
      width: 90%;
      max-width: 800px;
      max-height: 80vh;
      background: rgba(255, 252, 248, 0.9);
      backdrop-filter: blur(24px);
      border-radius: 36px;
      box-shadow: 0 20px 50px rgba(0, 0, 0, 0.15), 0 0 0 6px rgba(255, 255, 255, 0.5);
      padding: 32px;
      color: #5a4b41;
      display: flex;
      flex-direction: column;
      gap: 24px;
      transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
      overflow-y: auto;
      scrollbar-width: none;
    }
    .floating-ui::-webkit-scrollbar {
      display: none;
    }

    .floating-ui.hidden {
      transform: translate(-50%, 150%);
      opacity: 0;
      pointer-events: none;
    }

    .hide-btn {
      position: absolute;
      top: 24px;
      right: 24px;
      background: rgba(0, 0, 0, 0.05);
      border: none;
      width: 40px;
      height: 40px;
      border-radius: 20px;
      font-size: 1.2rem;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s;
    }

    .hide-btn:hover {
      background: rgba(0, 0, 0, 0.1);
      transform: scale(1.1);
    }

    .show-panel-btn {
      position: absolute;
      bottom: 32px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(255, 252, 248, 0.9);
      backdrop-filter: blur(10px);
      border: none;
      padding: 12px 24px;
      border-radius: 24px;
      font-size: 1.2rem;
      font-weight: 800;
      color: #8c7b6c;
      cursor: pointer;
      box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1), 0 0 0 4px rgba(255, 255, 255, 0.5);
      transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
      font-family: 'Nunito', sans-serif;
      z-index: 10;
      opacity: 0;
      pointer-events: none;
      transform: translate(-50%, 100px);
    }

    .show-panel-btn.visible {
      opacity: 1;
      pointer-events: all;
      transform: translateX(-50%);
    }

    .show-panel-btn:hover {
      transform: translate(-50%, -4px) scale(1.05);
      box-shadow: 0 15px 30px rgba(0, 0, 0, 0.15), 0 0 0 4px rgba(255, 255, 255, 0.6);
    }

    .tabs {
      display: flex;
      justify-content: center;
      gap: 16px;
      margin-bottom: 8px;
    }

    .tab-btn {
      background: #f0e6d2;
      border: none;
      padding: 14px 28px;
      border-radius: 24px;
      font-size: 1.2rem;
      font-weight: 800;
      color: #8c7b6c;
      cursor: pointer;
      transition: all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
      font-family: 'Nunito', sans-serif;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
    }

    .tab-btn:hover {
      transform: translateY(-4px) scale(1.05);
      background: #fffdf9;
      box-shadow: 0 8px 20px rgba(0, 0, 0, 0.08);
      color: #5a4b41;
    }

    .tab-btn.active {
      background: #ffb4a2;
      color: white;
      box-shadow: 0 8px 20px rgba(255, 180, 162, 0.5);
      transform: translateY(-2px);
    }

    .tab-btn.active:hover {
      transform: translateY(-6px) scale(1.05);
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
      margin-bottom: 24px;
    }
    .gear-section:last-child {
      margin-bottom: 0;
    }

    .gear-category-title {
      font-size: 1.1rem;
      font-weight: 800;
      color: #a49382;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      padding-left: 12px;
    }

    .gear-grid {
      display: flex;
      gap: 16px;
      overflow-x: auto;
      padding-bottom: 16px;
      padding-left: 8px;
      padding-top: 8px;
      scrollbar-width: none;
    }
    .gear-grid::-webkit-scrollbar {
      display: none;
    }

    .gear-card {
      flex: 0 0 auto;
      width: 130px;
      height: 130px;
      background: white;
      border-radius: 28px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 10px;
      cursor: pointer;
      transition: all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
      border: 4px solid transparent;
      box-shadow: 0 6px 16px rgba(0, 0, 0, 0.06);
      text-align: center;
      padding: 12px;
      user-select: none;
    }

    .gear-card:hover {
      transform: translateY(-8px) scale(1.05);
      box-shadow: 0 16px 32px rgba(0, 0, 0, 0.1);
    }

    .gear-card.active {
      border-color: #a3d9c9;
      background: #e8f6f1;
    }

    .gear-card.active .gear-name {
      color: #2d6a59;
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
  `;

  disconnectedCallback() {
    super.disconnectedCallback();
    this.stopProgressLoop();
  }

  private toggleGear(gear: string) {
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
    if (!file.name.endsWith('.wav')) {
      alert('Only .wav audio files are supported for high-fidelity lofi capture!');
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
      alert('Error decoding audio file. Ensure it is a valid .wav file.');
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

  private renderGearTab() {
    const samplers = [
      { id: 'polyend', label: 'Polyend', icon: '🎛️' },
      { id: 'sp404', label: 'SP404', icon: '🎰' },
      { id: 'circuit_tracks', label: 'Circuit', icon: '🎹' }
    ];
    const effects = [
      { id: 'mood', label: 'MOOD', icon: '🎚️' },
      { id: 'blooper', label: 'Blooper', icon: '🔁' },
      { id: 'reel', label: 'Tape Reel', icon: '📼' }
    ];
    const instruments = [
      { id: 'strat', label: 'Stratocaster', icon: '🎸' }
    ];

    const renderCard = (gear: any) => html`
      <div 
        class="gear-card ${this.activeGear.includes(gear.id) ? 'active' : ''}"
        @click="${() => this.toggleGear(gear.id)}"
      >
        <div class="gear-icon">${gear.icon}</div>
        <div class="gear-name">${gear.label}</div>
      </div>
    `;

    return html`
      <div class="gear-section">
        <div class="gear-category-title">Samplers & Synths</div>
        <div class="gear-grid">
          ${samplers.map(renderCard)}
        </div>
      </div>
      <div class="gear-section">
        <div class="gear-category-title">Effects & Tape</div>
        <div class="gear-grid">
          ${effects.map(renderCard)}
        </div>
      </div>
      <div class="gear-section">
        <div class="gear-category-title">Instruments</div>
        <div class="gear-grid">
          ${instruments.map(renderCard)}
        </div>
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
          <div>Drag & Drop a .wav file or click to browse</div>
          <input
            type="file"
            id="file-loader"
            accept=".wav"
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

  render() {
    const isLoaded = this.audioManager.isLoaded;
    const isPlaying = this.audioManager.isPlaying;

    return html`
      <lofi-diorama 
        .audioManager="${this.audioManager}" 
        .weather="${this.weather}"
        .activeGear="${this.activeGear}"
      ></lofi-diorama>

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

      <button 
        class="show-panel-btn ${!this.isPanelOpen ? 'visible' : ''}" 
        @click="${() => this.isPanelOpen = true}"
      >
        ⚙️ Settings
      </button>
    `;
  }
}
