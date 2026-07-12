import { LitElement, html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { AudioManager } from '../utils/audio-manager';
import './lofi-diorama';

type Weather = 'sunny' | 'rainy';

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

  private progressUpdateId: number | null = null;

  static styles = css`
    :host {
      display: grid;
      grid-template-columns: 350px 1fr;
      grid-template-rows: 1fr;
      gap: 24px;
      width: 100%;
      height: 100vh;
      box-sizing: border-box;
      padding: 24px;
      background-color: #0b090f;
      color: #eae8f0;
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      overflow: hidden;
    }

    /* Left Sidebar Panel - glassmorphic control console */
    .console-panel {
      background: rgba(20, 17, 28, 0.6);
      backdrop-filter: blur(20px);
      border: 1px solid rgba(255, 255, 255, 0.05);
      border-radius: 20px;
      padding: 24px;
      display: flex;
      flex-direction: column;
      gap: 24px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
      min-height: 0;
      overflow-y: auto;
    }

    .brand {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .brand-logo {
      width: 32px;
      height: 32px;
      background: linear-gradient(135deg, #f43f5e, #8b5cf6);
      border-radius: 8px;
      box-shadow: 0 0 15px rgba(244, 63, 94, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 800;
      font-size: 1rem;
      color: white;
    }

    .brand-title {
      font-size: 1.1rem;
      font-weight: 700;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      background: linear-gradient(to right, #ffffff, #a78bfa);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }

    .brand-subtitle {
      font-size: 0.7rem;
      color: rgba(255, 255, 255, 0.4);
      margin-top: 2px;
      font-family: 'JetBrains Mono', monospace;
      letter-spacing: 0.1em;
    }

    /* Drag & Drop Zone */
    .dropzone {
      border: 2px dashed rgba(139, 92, 246, 0.3);
      background: rgba(139, 92, 246, 0.02);
      border-radius: 16px;
      padding: 32px 20px;
      text-align: center;
      cursor: pointer;
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 12px;
    }

    .dropzone.dragover {
      border-color: #8b5cf6;
      background: rgba(139, 92, 246, 0.1);
      box-shadow: 0 0 20px rgba(139, 92, 246, 0.2);
      transform: scale(1.02);
    }

    .dropzone-icon {
      font-size: 2rem;
      color: #8b5cf6;
      text-shadow: 0 0 10px rgba(139, 92, 246, 0.3);
    }

    .dropzone-text {
      font-size: 0.85rem;
      color: rgba(255, 255, 255, 0.7);
      line-height: 1.4;
    }

    .dropzone-hint {
      font-size: 0.7rem;
      color: rgba(255, 255, 255, 0.35);
    }

    /* Info card */
    .info-card {
      background: rgba(255, 255, 255, 0.02);
      border: 1px solid rgba(255, 255, 255, 0.05);
      border-radius: 12px;
      padding: 16px;
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.75rem;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .info-title {
      font-weight: 700;
      color: #ebcb8b; /* Warm yellow label */
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: 4px;
    }

    .info-row {
      display: flex;
      justify-content: space-between;
    }

    .info-value {
      color: #8892b0;
      text-align: right;
      max-width: 180px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    /* Controls Panel */
    .controls {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .btn-group {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 10px;
    }

    button {
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid rgba(255, 255, 255, 0.08);
      color: white;
      padding: 10px 14px;
      border-radius: 10px;
      font-size: 0.8rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s ease;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
    }

    button:hover:not(:disabled) {
      background: rgba(255, 255, 255, 0.08);
      border-color: rgba(255, 255, 255, 0.15);
      transform: translateY(-1px);
    }

    button:active:not(:disabled) {
      transform: translateY(1px);
    }

    button:disabled {
      opacity: 0.3;
      cursor: not-allowed;
    }

    /* Accent color controls */
    button.play-btn {
      background: linear-gradient(135deg, rgba(244, 63, 94, 0.15), rgba(139, 92, 246, 0.15));
      border: 1px solid rgba(244, 63, 94, 0.3);
      color: #ff7e93;
      box-shadow: 0 4px 12px rgba(244, 63, 94, 0.05);
    }

    button.play-btn:hover:not(:disabled) {
      background: linear-gradient(135deg, rgba(244, 63, 94, 0.25), rgba(139, 92, 246, 0.25));
      border-color: rgba(244, 63, 94, 0.5);
      box-shadow: 0 4px 15px rgba(244, 63, 94, 0.15);
    }

    /* Slider styling */
    .slider-container {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .time-labels {
      display: flex;
      justify-content: space-between;
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.75rem;
      color: rgba(255, 255, 255, 0.5);
    }

    .scrub-slider {
      -webkit-appearance: none;
      width: 100%;
      height: 6px;
      border-radius: 3px;
      background: rgba(255, 255, 255, 0.1);
      outline: none;
      cursor: pointer;
      transition: background 0.3s;
    }

    .scrub-slider::-webkit-slider-runnable-track {
      width: 100%;
      height: 6px;
      border-radius: 3px;
    }

    .scrub-slider::-webkit-slider-thumb {
      -webkit-appearance: none;
      appearance: none;
      width: 14px;
      height: 14px;
      border-radius: 50%;
      background: #8b5cf6;
      cursor: pointer;
      box-shadow: 0 0 8px rgba(139, 92, 246, 0.8);
      margin-top: -4px;
      transition: transform 0.1s ease;
    }

    .scrub-slider::-webkit-slider-thumb:hover {
      transform: scale(1.2);
    }

    /* Right Main Workspace */
    .viewport-panel {
      position: relative;
      display: flex;
      flex-direction: column;
      height: 100%;
      min-height: 0;
    }
    
    lofi-diorama {
      flex: 1;
      min-height: 0;
      position: relative;
    }

    .viewport-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
    }

    .viewport-title {
      font-size: 0.9rem;
      font-weight: 700;
      letter-spacing: 0.15em;
      text-transform: uppercase;
      color: rgba(255, 255, 255, 0.6);
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .live-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background-color: #10b981;
      box-shadow: 0 0 8px #10b981;
      display: inline-block;
    }

    .live-dot.paused {
      background-color: #f59e0b;
      box-shadow: 0 0 8px #f59e0b;
    }

    .live-dot.stopped {
      background-color: #ef4444;
      box-shadow: 0 0 8px #ef4444;
    }

    /* Live Visualizer stats in dashboard */
    .dashboard-metrics {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
    }

    .metric-box {
      background: rgba(255, 255, 255, 0.01);
      border: 1px solid rgba(255, 255, 255, 0.04);
      border-radius: 12px;
      padding: 12px;
      text-align: center;
    }

    .metric-value {
      font-family: 'JetBrains Mono', monospace;
      font-size: 1.1rem;
      font-weight: 700;
      color: #8b5cf6;
      margin-top: 4px;
      text-shadow: 0 0 10px rgba(139, 92, 246, 0.2);
    }

    .metric-label {
      font-size: 0.65rem;
      text-transform: uppercase;
      color: rgba(255, 255, 255, 0.35);
      letter-spacing: 0.05em;
    }

    /* Custom File Input trigger */
    .file-input-label {
      cursor: pointer;
      color: #a78bfa;
      text-decoration: underline;
    }

    /* Weather toggle */
    .weather-toggle {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .weather-label {
      font-size: 0.65rem;
      text-transform: uppercase;
      color: rgba(255, 255, 255, 0.35);
      letter-spacing: 0.05em;
    }

    .weather-options {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
    }

    .weather-btn {
      padding: 8px 12px;
      border-radius: 10px;
      font-size: 0.75rem;
      font-weight: 600;
      text-align: center;
      cursor: pointer;
      transition: all 0.2s ease;
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid rgba(255, 255, 255, 0.08);
      color: rgba(255, 255, 255, 0.6);
    }

    .weather-btn:hover {
      background: rgba(255, 255, 255, 0.08);
    }

    .weather-btn.active {
      background: linear-gradient(135deg, rgba(244, 163, 63, 0.2), rgba(139, 92, 246, 0.15));
      border-color: rgba(244, 163, 63, 0.5);
      color: #ffcc77;
      box-shadow: 0 0 10px rgba(244, 163, 63, 0.1);
    }

    .weather-btn.active.rainy {
      background: linear-gradient(135deg, rgba(100, 140, 200, 0.2), rgba(80, 100, 160, 0.15));
      border-color: rgba(100, 140, 200, 0.5);
      color: #8eaacc;
      box-shadow: 0 0 10px rgba(100, 140, 200, 0.1);
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
      // Clear previous info to avoid stale UI/playback if decoding fails
      this.fileInfo = null;
      this.audioManager.clear();
      this.requestUpdate();

      const buffer = await this.audioManager.loadFile(file);
      
      // Update metadata
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
      // Completed playback callback
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

  // Get active status tag
  private getStatusLabel() {
    if (!this.audioManager.isLoaded) return 'IDLE';
    if (this.audioManager.isPlaying) return 'PLAYING';
    if (this.audioManager.isPaused) return 'PAUSED';
    return 'STOPPED';
  }

  // Get live visualizer metric values
  private getLiveMetrics() {
    if (!this.audioManager.isLoaded) {
      return { amplitude: '0.00', bass: '0.00' };
    }
    
    let amp = 0;
    let bass = 0;
    
    if (this.audioManager.isPlaying) {
      const rt = this.audioManager.getRealTimeData();
      amp = rt.amplitude;
      // Extract average of low bins for bass
      if (rt.frequencies.length > 0) {
        let bassSum = 0;
        const count = 4; // first 4 bins represent very low frequencies
        for (let i = 0; i < count; i++) {
          bassSum += rt.frequencies[i] || 0;
        }
        bass = (bassSum / count) / 255.0;
      }
    } else {
      const time = this.audioManager.getCurrentTime();
      const det = this.audioManager.getDeterministicData(time);
      amp = det.amplitude;
      bass = det.frequencies[0] || 0; // bass channel
    }
    
    return {
      amplitude: amp.toFixed(2),
      bass: bass.toFixed(2),
    };
  }

  render() {
    const isLoaded = this.audioManager.isLoaded;
    const isPlaying = this.audioManager.isPlaying;
    const status = this.getStatusLabel();
    const metrics = this.getLiveMetrics();

    return html`
      <aside class="console-panel">
        <div class="brand">
          <div class="brand-logo">L</div>
          <div>
            <div class="brand-title">Lofi Diorama</div>
            <div class="brand-subtitle">DET. RENDERING SYSTEM</div>
          </div>
        </div>

        <div
          class="dropzone ${this.isDragOver ? 'dragover' : ''}"
          @dragover="${this.handleDragOver}"
          @dragleave="${this.handleDragLeave}"
          @drop="${this.handleDrop}"
          @click="${() => this.shadowRoot?.getElementById('file-loader')?.click()}"
        >
          <span class="dropzone-icon">⏏</span>
          <div class="dropzone-text">
            Drag & Drop a <strong class="file-input-label">.wav file</strong> or click to browse
          </div>
          <div class="dropzone-hint">Deterministic captured tracks only</div>
          <input
            type="file"
            id="file-loader"
            accept=".wav"
            style="display: none"
            @change="${this.handleFileSelect}"
          />
        </div>

        ${isLoaded && this.fileInfo
          ? html`
              <div class="info-card">
                <div class="info-title">TRACK METADATA</div>
                <div class="info-row">
                  <span>File Name:</span>
                  <span class="info-value" title="${this.fileInfo.name}">
                    ${this.fileInfo.name}
                  </span>
                </div>
                <div class="info-row">
                  <span>Size:</span>
                  <span class="info-value">${this.fileInfo.size}</span>
                </div>
                <div class="info-row">
                  <span>Duration:</span>
                  <span class="info-value">${this.fileInfo.duration}</span>
                </div>
              </div>
            `
          : html`
              <div class="info-card" style="text-align: center; color: rgba(255,255,255,0.3)">
                No audio ingested yet
              </div>
            `}

        <div class="controls">
          <div class="btn-group">
            <button
              class="play-btn"
              ?disabled="${!isLoaded || isPlaying}"
              @click="${this.handlePlay}"
            >
              ▶ Play
            </button>
            <button
              ?disabled="${!isLoaded || !isPlaying}"
              @click="${this.handlePause}"
            >
              ⏸ Pause
            </button>
            <button
              ?disabled="${!isLoaded}"
              @click="${this.handleStop}"
            >
              ■ Stop
            </button>
          </div>

          <div class="slider-container">
            <input
              type="range"
              class="scrub-slider"
              min="0"
              max="100"
              step="0.1"
              .value="${this.progressPercent.toString()}"
              ?disabled="${!isLoaded}"
              @input="${this.handleScrub}"
            />
            <div class="time-labels">
              <span>${this.currentTimeStr}</span>
              <span>${this.totalTimeStr}</span>
            </div>
          </div>
        </div>

        <div class="dashboard-metrics">
          <div class="metric-box">
            <div class="metric-label">Amplitude</div>
            <div class="metric-value">${metrics.amplitude}</div>
          </div>
          <div class="metric-box">
            <div class="metric-label">Bass Kick</div>
            <div class="metric-value">${metrics.bass}</div>
          </div>
        </div>

        <div class="weather-toggle">
          <div class="weather-label">Window Weather</div>
          <div class="weather-options">
            <div
              class="weather-btn ${this.weather === 'sunny' ? 'active' : ''}"
              @click="${() => { this.weather = 'sunny'; }}"
            >
              ☀️ Sunny
            </div>
            <div
              class="weather-btn ${this.weather === 'rainy' ? 'active rainy' : ''}"
              @click="${() => { this.weather = 'rainy'; }}"
            >
              🌧️ Rainy
            </div>
          </div>
        </div>

        <div class="weather-toggle" style="margin-top: 8px;">
          <div class="weather-label">Desk Gear</div>
          <div style="display: flex; flex-direction: column; gap: 6px;">
            ${[
              { id: 'polyend', label: 'Polyend Tracker' },
              { id: 'sp404', label: 'SP404mkII' },
              { id: 'circuit_tracks', label: 'Circuit Tracks' },
              { id: 'mood', label: 'CBA Mood' },
              { id: 'blooper', label: 'CBA Blooper' },
              { id: 'reel', label: 'Reel-to-Reel' },
              { id: 'strat', label: 'Fender Strat' }
            ].map(gear => html`
              <div
                class="weather-btn ${this.activeGear.includes(gear.id) ? 'active' : ''}"
                style="text-align: left; padding: 6px 10px;"
                @click="${() => this.toggleGear(gear.id)}"
              >
                ${this.activeGear.includes(gear.id) ? '✓' : '+'} ${gear.label}
              </div>
            `)}
          </div>
        </div>
      </aside>

      <main class="viewport-panel">
        <header class="viewport-header">
          <div class="viewport-title">
            <span class="live-dot ${status.toLowerCase()}"></span>
            Viewport: Desk View
          </div>
          <div style="font-family: 'JetBrains Mono', monospace; font-size: 0.75rem; color: rgba(255,255,255,0.4)">
            STATUS: ${status}
          </div>
        </header>
        <lofi-diorama 
          .audioManager="${this.audioManager}" 
          .weather="${this.weather}"
          .activeGear="${this.activeGear}"
        ></lofi-diorama>
      </main>
    `;
  }
}
