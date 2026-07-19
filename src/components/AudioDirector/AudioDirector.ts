import { LitElement, html, css } from 'lit';
import { customElement, property, state, query } from 'lit/decorators.js';
import WaveSurfer from 'wavesurfer.js';
import RegionsPlugin from 'wavesurfer.js/dist/plugins/regions.esm.js';
import type { AnalyzeResult, AnalyzeError } from './analyzer.worker';

export interface ActionConfig {
  target: string;
  mode: 'trigger' | 'next' | 'envelope' | 'envelope_lfo';
  amount: number;
}

export interface AvailableTarget {
  id: string;
  label: string;
  type: 'trigger' | 'continuous';
}

export interface ScriptEvent {
  time: number;
  config: ActionConfig;
}

export interface MacroShot {
  id: string;
  startTime: number;
  duration: number;
  target: string;
  label?: string;
  mood?: 'chaotic' | 'submerged' | 'balanced' | 'ambient';
  intensity?: number;
  cameraPos?: {x: number, y: number, z: number};
  cameraLookAt?: {x: number, y: number, z: number};
  transitionType?: 'cut' | 'smooth' | 'whip-pan';
}

export interface MicroCut {
  id: string;
  time: number;
  target: string;
  label?: string;
}

interface InternalMarker {
  id: string;
  time: number;
  type: string; // 'bass_transient' | 'treble_transient' | 'mid_transient' | 'manual_event'
  config: ActionConfig;
}

@customElement('audio-director')
export class AudioDirector extends LitElement {
  static styles = css`
    :host {
      display: block;
      width: 100%;
      font-family: system-ui, -apple-system, sans-serif;
      background: #1a1a1a;
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.3);
      color: #fff;
    }
    
    .toolbar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 16px;
      background: #242424;
      border-bottom: 1px solid #333;
    }
    
    .title {
      font-size: 14px;
      font-weight: 600;
      color: #aaa;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .controls {
      display: flex;
      gap: 12px;
      align-items: center;
    }

    .controls button {
      background: #4caf50;
      color: white;
      border: none;
      padding: 6px 12px;
      border-radius: 4px;
      cursor: pointer;
      font-weight: 500;
      transition: background 0.2s;
    }
    
    .controls button:hover {
      background: #45a049;
    }

    .mapping-panel {
      padding: 12px 16px;
      background: #1e1e1e;
      display: flex;
      flex-direction: column;
      gap: 12px;
      border-bottom: 1px solid #333;
      font-size: 13px;
    }

    .mapping-row {
      display: flex;
      align-items: center;
      gap: 15px;
      padding-bottom: 8px;
      border-bottom: 1px solid #2a2a2a;
    }
    .mapping-row:last-child {
      border-bottom: none;
      padding-bottom: 0;
    }

    .mapping-label {
      width: 160px;
      font-weight: 600;
    }

    .mapping-group {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    select, input[type="number"] {
      background: #333;
      color: white;
      border: 1px solid #555;
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 12px;
    }

    input[type="number"] {
      width: 60px;
    }

    #waveform-container {
      width: 100%;
      height: 128px;
      position: relative;
      background: #111;
      cursor: crosshair;
    }
    
    .status-bar {
      padding: 8px 16px;
      font-size: 12px;
      color: #888;
      display: flex;
      justify-content: space-between;
    }

    .loading-overlay {
      position: absolute;
      inset: 0;
      background: rgba(0,0,0,0.7);
      display: flex;
      align-items: center;
      justify-content: center;
      color: #fff;
      font-weight: 500;
      z-index: 10;
    }

    .region-label {
      font-size: 9px;
      color: white;
      background: rgba(0,0,0,0.75);
      padding: 2px 4px;
      position: absolute;
      top: 2px;
      left: 2px;
      white-space: nowrap;
      pointer-events: none;
      border-radius: 2px;
      border: 1px solid rgba(255,255,255,0.1);
    }

    .selected-marker-panel {
      padding: 12px 16px;
      background: #222;
      display: flex;
      gap: 15px;
      align-items: center;
      border-top: 1px solid #333;
      font-size: 13px;
    }

    .delete-btn {
      background: #f44336;
      color: white;
      border: none;
      padding: 4px 8px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
      margin-left: auto;
    }

    .delete-btn:hover {
      background: #d32f2f;
    }

    .legend {
      display: flex;
      gap: 12px;
      font-size: 11px;
    }

    .legend-item {
      display: flex;
      align-items: center;
      gap: 4px;
    }

    .legend-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
    }

    .mode-toggle {
      display: flex;
      gap: 2px;
      background: #333;
      border-radius: 4px;
      overflow: hidden;
    }

    .mode-toggle button {
      background: transparent;
      color: #aaa;
      border: none;
      padding: 4px 10px;
      cursor: pointer;
      font-size: 11px;
      transition: all 0.2s;
      font-weight: 500;
    }

    .mode-toggle button:hover {
      color: #fff;
    }

    .mode-toggle button.active {
      background: #7c4dff;
      color: white;
    }
  `;

  @property({ type: String }) src = '';
  @property({ type: String, reflect: true }) mode: 'wave_field' | 'diorama' = 'wave_field';
  @property({ type: Array }) availableTargets: AvailableTarget[] = [];

  @state() private density = 20;
  @state() private selectedMarkerId: string | null = null;
  
  @state() private transientMappings: Record<string, ActionConfig> = {
    'bass_transient': { target: 'device', mode: 'trigger', amount: 0 },
    'treble_transient': { target: 'height', mode: 'envelope', amount: 30 },
    'mid_transient': { target: 'speed', mode: 'envelope', amount: 15 },
    'manual_event': { target: 'theme', mode: 'next', amount: 0 }
  };

  @state() private markers: InternalMarker[] = [];
  @state() private macroShots: MacroShot[] = [];
  @state() private microCuts: MicroCut[] = [];
  @state() private dioramaAddMode: 'macro_shot' | 'micro_cut' = 'micro_cut';
  @state() public currentView: 'timeline' | 'storyboard' = 'timeline';
  @state() private isAnalyzing = false;
  @state() private isDecoding = false;
  @state() public isPlaying = false;
  
  @query('#waveform-container') private waveformContainer!: HTMLElement;

  private wavesurfer: WaveSurfer | null = null;
  private regionsPlugin: RegionsPlugin | null = null;
  private worker: Worker | null = null;
  
  private channelData: Float32Array | null = null;
  private sampleRate = 44100;

  firstUpdated() {
    this.initWaveSurfer();
    if (this.src) {
      this.loadFromURL(this.src);
    }
  }

  updated(changedProperties: Map<string, any>) {
    if (changedProperties.has('src') && this.src) {
      this.loadFromURL(this.src);
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.wavesurfer?.destroy();
    this.worker?.terminate();
  }

  private initWaveSurfer() {
    this.wavesurfer = WaveSurfer.create({
      container: this.waveformContainer,
      waveColor: '#4a90e2',
      progressColor: '#357abd',
      cursorColor: '#fff',
      barWidth: 2,
      barGap: 1,
      barRadius: 2,
      height: 128,
    });

    this.regionsPlugin = this.wavesurfer.registerPlugin(RegionsPlugin.create());

    this.wavesurfer.on('play', () => this.isPlaying = true);
    this.wavesurfer.on('pause', () => this.isPlaying = false);

    this.wavesurfer.on('click', (relativeX) => {
      if (!this.wavesurfer) return;
      const time = relativeX * this.wavesurfer.getDuration();
      if (this.mode === 'diorama') {
        if (this.dioramaAddMode === 'macro_shot') {
          this.addMacroShot({
            id: `macro_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
            startTime: time,
            duration: 2.0,
            target: '',
            mood: 'balanced',
            intensity: 0.5
          });
        } else {
          this.addMicroCut({
            id: `micro_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
            time,
            target: ''
          });
        }
      } else {
        this.addMarkerManual(time);
      }
    });

    this.regionsPlugin.on('region-updated', (region) => {
      if (this.mode === 'diorama') {
        this.updateDioramaEventTime(region.id, region.start, region.end - region.start);
      } else {
        this.updateMarkerTime(region.id, region.start);
      }
    });

    this.regionsPlugin.on('region-clicked', (region, e) => {
      e.stopPropagation();
      if ((e as MouseEvent).detail === 2) {
        // Double-click to delete
        if (this.mode === 'diorama') {
          this.removeDioramaEvent(region.id);
        } else {
          this.removeMarker(region.id);
        }
        region.remove();
        if (this.selectedMarkerId === region.id) {
          this.selectedMarkerId = null;
        }
      } else {
        this.selectedMarkerId = region.id;
      }
    });
  }

  // ── Public API ──────────────────────────────────────────────

  public async loadFromFile(file: File) {
    const url = URL.createObjectURL(file);
    await this.loadFromURL(url);
  }

  public generateScript(): ScriptEvent[] {
    return [...this.markers]
      .sort((a, b) => a.time - b.time)
      .map(m => ({
        time: m.time,
        config: m.config
      }));
  }

  public getCurrentTime(): number {
    return this.wavesurfer?.getCurrentTime() || 0;
  }

  public setMacroShots(shots: MacroShot[]) {
    this.macroShots = [...shots];
    this.renderRegions();
    this.dispatchChangeEvent();
  }

  public setMicroCuts(cuts: MicroCut[]) {
    this.microCuts = [...cuts];
    this.renderRegions();
    this.dispatchChangeEvent();
  }

  public addMacroShot(shot: MacroShot) {
    this.macroShots = [...this.macroShots, shot];
    this.renderRegions();
    this.dispatchChangeEvent();
  }

  public addMicroCut(cut: MicroCut) {
    this.microCuts = [...this.microCuts, cut];
    this.renderRegions();
    this.dispatchChangeEvent();
  }

  public getState() {
    const base = {
      mode: this.mode,
      duration: this.wavesurfer?.getDuration() ?? 0,
    };

    if (this.mode === 'diorama') {
      return {
        ...base,
        macroShots: [...this.macroShots],
        microCuts: [...this.microCuts],
      };
    }

    return {
      ...base,
      script: this.generateScript(),
      density: this.density,
      transientMappings: { ...this.transientMappings },
    };
  }

  // ── Audio Loading ───────────────────────────────────────────

  private async loadFromURL(url: string) {
    if (!this.wavesurfer) return;
    
    this.isDecoding = true;
    this.markers = [];
    this.macroShots = [];
    this.microCuts = [];
    this.selectedMarkerId = null;
    this.regionsPlugin?.clearRegions();
    
    await this.wavesurfer.load(url);

    try {
      const response = await fetch(url);
      const arrayBuffer = await response.arrayBuffer();
      
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
      
      this.channelData = audioBuffer.getChannelData(0);
      this.sampleRate = audioBuffer.sampleRate;

      this.isDecoding = false;
    } catch (e) {
      console.error('Error fetching/decoding audio for analysis', e);
      this.isDecoding = false;
    }
  }

  // ── Wave Field Analysis ─────────────────────────────────────

  private runAnalysis() {
    if (!this.channelData) return;
    
    this.isAnalyzing = true;
    this.selectedMarkerId = null;
    
    if (this.worker) {
      this.worker.terminate();
    }

    this.worker = new Worker(new URL('./analyzer.worker.ts', import.meta.url), { type: 'module' });
    
    this.worker.onmessage = (e: MessageEvent) => {
      const data = e.data;
      if (data.type === 'RESULT') {
        const payload = (data as AnalyzeResult).payload;
        
        this.markers = payload.map(p => ({
          id: p.id,
          time: p.time,
          type: p.type,
          config: { ...this.getConfigForType(p.type) }
        }));
        
        this.renderRegions();
        this.isAnalyzing = false;
        this.dispatchChangeEvent();
      } else if (data.type === 'ERROR') {
        console.error('Analysis error:', (data as AnalyzeError).payload);
        this.isAnalyzing = false;
      }
    };

    this.worker.postMessage({
      type: 'ANALYZE',
      payload: { 
        channelData: this.channelData, 
        sampleRate: this.sampleRate, 
        density: this.density 
      }
    });
  }

  private getConfigForType(type: string): ActionConfig {
    const config = this.transientMappings[type];
    if (config && this.availableTargets.some(t => t.id === config.target)) {
      return config;
    }
    return { target: this.availableTargets[0]?.id || '', mode: 'trigger', amount: 0 };
  }

  // ── Region Rendering ────────────────────────────────────────

  private getRegionColor(type: string): string {
    switch (type) {
      case 'bass_transient': return 'rgba(244, 67, 54, 0.45)';
      case 'treble_transient': return 'rgba(0, 188, 212, 0.45)';
      case 'mid_transient': return 'rgba(255, 193, 7, 0.45)';
      case 'manual_event': return 'rgba(76, 175, 80, 0.45)';
      default: return 'rgba(255, 255, 255, 0.45)';
    }
  }

  private renderRegions() {
    this.regionsPlugin?.clearRegions();

    if (this.mode === 'diorama') {
      // Macro shots as wide, resizable blocks
      this.macroShots.forEach(shot => {
        const targetDef = this.availableTargets.find(t => t.id === shot.target);
        const label = targetDef?.label || shot.target || 'Macro Shot';
        this.regionsPlugin?.addRegion({
          id: shot.id,
          start: shot.startTime,
          end: shot.startTime + shot.duration,
          color: 'rgba(124, 77, 255, 0.25)',
          content: this.createDioramaLabel('📷', label),
          drag: true,
          resize: true
        });
      });

      // Micro cuts as thin pins
      this.microCuts.forEach(cut => {
        const targetDef = this.availableTargets.find(t => t.id === cut.target);
        const label = targetDef?.label || cut.target || 'Micro Cut';
        this.regionsPlugin?.addRegion({
          id: cut.id,
          start: cut.time,
          end: cut.time + 0.05,
          color: 'rgba(255, 109, 0, 0.45)',
          content: this.createDioramaLabel('✂', label),
          drag: true,
          resize: false
        });
      });
    } else {
      this.markers.forEach(marker => {
        this.regionsPlugin?.addRegion({
          id: marker.id,
          start: marker.time,
          end: marker.time + 0.05,
          color: this.getRegionColor(marker.type),
          content: this.createRegionLabel(marker.type, marker.config),
          drag: true,
          resize: false
        });
      });
    }
  }

  private createRegionLabel(type: string, config: ActionConfig): HTMLElement {
    const target = this.availableTargets.find(t => t.id === config.target);
    let prefix = '';
    if (type === 'bass_transient') prefix = '🔊 ';
    else if (type === 'treble_transient') prefix = '⚡ ';
    else if (type === 'mid_transient') prefix = '🎵 ';
    else if (type === 'manual_event') prefix = '🟢 ';

    const labelText = prefix + (target ? target.label : config.target);

    const el = document.createElement('div');
    el.className = 'region-label';
    el.innerText = labelText;
    return el;
  }

  private createDioramaLabel(icon: string, label: string): HTMLElement {
    const el = document.createElement('div');
    el.className = 'region-label';
    el.innerText = `${icon} ${label}`;
    return el;
  }

  // ── Wave Field Marker Methods ───────────────────────────────

  private addMarkerManual(time: number) {
    const id = `manual_${Math.random().toString(36).substr(2, 9)}`;
    const newMarker: InternalMarker = { 
      id, 
      time, 
      type: 'manual_event',
      config: { ...this.getConfigForType('manual_event') }
    };
    
    this.markers = [...this.markers, newMarker];
    this.renderRegions();
    this.dispatchChangeEvent();
  }

  private updateMarkerTime(id: string, newTime: number) {
    this.markers = this.markers.map(m => m.id === id ? { ...m, time: newTime } : m);
    this.dispatchChangeEvent();
  }

  private removeMarker(id: string) {
    this.markers = this.markers.filter(m => m.id !== id);
    this.dispatchChangeEvent();
  }

  // ── Diorama Event Methods ───────────────────────────────────

  private updateDioramaEventTime(id: string, newStart: number, newDuration?: number) {
    const isMacro = this.macroShots.some(s => s.id === id);
    if (isMacro) {
      this.macroShots = this.macroShots.map(s =>
        s.id === id ? { ...s, startTime: newStart, ...(newDuration != null ? { duration: newDuration } : {}) } : s
      );
    } else {
      this.microCuts = this.microCuts.map(c =>
        c.id === id ? { ...c, time: newStart } : c
      );
    }
    this.dispatchChangeEvent();
  }

  private removeDioramaEvent(id: string) {
    this.macroShots = this.macroShots.filter(s => s.id !== id);
    this.microCuts = this.microCuts.filter(c => c.id !== id);
    this.dispatchChangeEvent();
  }

  private findSelectedDioramaEvent(): { type: 'macro', event: MacroShot } | { type: 'micro', event: MicroCut } | null {
    if (!this.selectedMarkerId) return null;
    const macro = this.macroShots.find(s => s.id === this.selectedMarkerId);
    if (macro) return { type: 'macro', event: macro };
    const micro = this.microCuts.find(c => c.id === this.selectedMarkerId);
    if (micro) return { type: 'micro', event: micro };
    return null;
  }

  private updateSelectedMacroShot(updates: Partial<MacroShot>) {
    if (!this.selectedMarkerId) return;
    this.macroShots = this.macroShots.map(s =>
      s.id === this.selectedMarkerId ? { ...s, ...updates } : s
    );
    if (updates.duration !== undefined) {
      this.recalculateStartTimes();
    } else {
      this.renderRegions();
      this.dispatchChangeEvent();
    }
  }

  private updateMacroShotTransition(id: string, transition: string) {
    this.macroShots = this.macroShots.map(s =>
      s.id === id ? { ...s, transitionType: transition as any } : s
    );
    this.dispatchChangeEvent();
  }

  private addNewStoryboardPanel() {
    const newShot: MacroShot = {
      id: `macro_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      startTime: 0,
      duration: 2.0,
      target: this.availableTargets[0]?.id || '',
      mood: 'balanced',
      intensity: 0.5,
      transitionType: 'smooth'
    };
    this.macroShots = [...this.macroShots, newShot];
    this.recalculateStartTimes();
  }

  private recalculateStartTimes() {
    let currentTime = 0;
    this.macroShots = this.macroShots.map(shot => {
      const updated = { ...shot, startTime: currentTime };
      currentTime += shot.duration;
      return updated;
    });
    this.renderRegions();
    this.dispatchChangeEvent();
  }

  private updateSelectedMicroCut(updates: Partial<MicroCut>) {
    if (!this.selectedMarkerId) return;
    this.microCuts = this.microCuts.map(c =>
      c.id === this.selectedMarkerId ? { ...c, ...updates } : c
    );
    this.renderRegions();
    this.dispatchChangeEvent();
  }

  private removeSelectedDioramaEvent() {
    if (!this.selectedMarkerId) return;
    this.removeDioramaEvent(this.selectedMarkerId);
    const region = this.regionsPlugin?.getRegions().find(r => r.id === this.selectedMarkerId);
    region?.remove();
    this.selectedMarkerId = null;
  }

  // ── Shared Controls ─────────────────────────────────────────

  private togglePlayback() {
    this.wavesurfer?.playPause();
  }

  private handleDensityChange(e: Event) {
    this.density = parseFloat((e.target as HTMLInputElement).value);
  }

  private handleDensityApply() {
    this.runAnalysis();
  }

  private updateMappingConfig(transientType: string, updates: Partial<ActionConfig>) {
    const current = this.transientMappings[transientType];
    const newConfig = { ...current, ...updates };
    
    // Auto-fix mode if target changed
    if (updates.target) {
      const targetDef = this.availableTargets.find(t => t.id === newConfig.target);
      if (targetDef?.type === 'trigger') {
        newConfig.mode = 'trigger';
      } else if (targetDef?.type === 'continuous' && (newConfig.mode === 'trigger' || newConfig.mode === 'next')) {
        newConfig.mode = 'envelope'; // default fallback for continuous
      }
    }

    this.transientMappings = { ...this.transientMappings, [transientType]: newConfig };
    
    // Update existing markers of this type to use the new config
    this.markers = this.markers.map(m => {
      if (m.type === transientType) {
        return { ...m, config: { ...newConfig } };
      }
      return m;
    });
    
    this.renderRegions();
    this.dispatchChangeEvent();
  }

  private updateSelectedMarkerConfig(updates: Partial<ActionConfig>) {
    if (this.selectedMarkerId) {
      this.markers = this.markers.map(m => {
        if (m.id === this.selectedMarkerId) {
          const newConfig = { ...m.config, ...updates };
          
          if (updates.target) {
            const targetDef = this.availableTargets.find(t => t.id === newConfig.target);
            if (targetDef?.type === 'trigger') newConfig.mode = 'trigger';
            else if (targetDef?.type === 'continuous' && (newConfig.mode === 'trigger' || newConfig.mode === 'next')) {
              newConfig.mode = 'envelope';
            }
          }
          return { ...m, config: newConfig };
        }
        return m;
      });
      this.renderRegions();
      this.dispatchChangeEvent();
    }
  }

  private removeSelectedMarker() {
    if (this.selectedMarkerId) {
      this.removeMarker(this.selectedMarkerId);
      const region = this.regionsPlugin?.getRegions().find(r => r.id === this.selectedMarkerId);
      region?.remove();
      this.selectedMarkerId = null;
    }
  }

  private dispatchChangeEvent() {
    if (this.mode === 'diorama') {
      this.dispatchEvent(new CustomEvent('change', {
        detail: { macroShots: this.macroShots, microCuts: this.microCuts }
      }));
    } else {
      this.dispatchEvent(new CustomEvent('change', {
        detail: { script: this.generateScript() }
      }));
    }
  }

  // ── Shared Render Helpers ───────────────────────────────────

  private renderConfigControls(config: ActionConfig, onChange: (updates: Partial<ActionConfig>) => void) {
    const targetDef = this.availableTargets.find(t => t.id === config.target);
    const isContinuous = targetDef?.type === 'continuous';

    return html`
      <div class="mapping-group">
        <select @change=${(e: Event) => onChange({ target: (e.target as HTMLSelectElement).value })} .value=${config.target}>
          ${this.availableTargets.map(t => html`<option value=${t.id}>${t.label}</option>`)}
        </select>

        ${isContinuous ? html`
          <select @change=${(e: Event) => onChange({ mode: (e.target as HTMLSelectElement).value as any })} .value=${config.mode}>
            <option value="envelope">Envelope (Decay)</option>
            <option value="envelope_lfo">Envelope LFO</option>
          </select>
          <label style="margin-left: 4px; font-size: 11px;">Amt:</label>
          <input type="number" step="any" .value=${config.amount.toString()} 
                 @input=${(e: Event) => onChange({ amount: parseFloat((e.target as HTMLInputElement).value) || 0 })} />
        ` : ''}
      </div>
    `;
  }

  private renderDioramaTargetSelect(currentTarget: string, onChange: (target: string) => void) {
    return html`
      <select @change=${(e: Event) => onChange((e.target as HTMLSelectElement).value)} .value=${currentTarget}>
        <option value="">— None —</option>
        ${this.availableTargets.map(t => html`<option value=${t.id}>${t.label}</option>`)}
      </select>
    `;
  }

  // ── Render ──────────────────────────────────────────────────

  render() {
    const isDiorama = this.mode === 'diorama';
    const hasEvents = isDiorama
      ? (this.macroShots.length > 0 || this.microCuts.length > 0)
      : this.markers.length > 0;

    return html`
      <div class="toolbar">
        <div class="title">Audio Director${isDiorama ? ' — Storyboard' : ''}</div>
        <div class="controls">
          <button @click=${this.togglePlayback}>
            ${this.isPlaying ? 'Pause' : 'Play'}
          </button>
          <button style="background: #4caf50;" @click=${() => this.dispatchEvent(new CustomEvent('apply'))}>
            Apply Script
          </button>
          <button style="background: #f44336;" @click=${() => this.dispatchEvent(new CustomEvent('close'))}>
            Close
          </button>
        </div>
      </div>

      ${!isDiorama ? html`
        <div class="mapping-panel">
          <div class="mapping-row">
            <div class="mapping-label" style="color: #f44336;">🔊 Bass Drop Mapping:</div>
            ${this.renderConfigControls(this.transientMappings['bass_transient'], updates => this.updateMappingConfig('bass_transient', updates))}
          </div>
          <div class="mapping-row">
            <div class="mapping-label" style="color: #00bcd4;">⚡ Treble Mapping:</div>
            ${this.renderConfigControls(this.transientMappings['treble_transient'], updates => this.updateMappingConfig('treble_transient', updates))}
          </div>
          <div class="mapping-row">
            <div class="mapping-label" style="color: #ffc107;">🎵 Mid Mapping:</div>
            ${this.renderConfigControls(this.transientMappings['mid_transient'], updates => this.updateMappingConfig('mid_transient', updates))}
          </div>
          <div class="mapping-row" style="background: #2a2a2a; padding: 8px; border-radius: 4px; border: 1px solid #444; justify-content: space-between;">
            <div style="display: flex; gap: 8px; align-items: center;">
              <label style="font-weight: 600;">Global Density (${this.density}):</label>
              <input type="range" min="1" max="100" step="1" .value=${this.density} @input=${this.handleDensityChange} style="width: 150px;"/>
            </div>
            <button style="background: ${this.markers.length === 0 ? '#4caf50' : '#555'}; border: none; padding: 6px 12px; color: white; border-radius: 4px; cursor: pointer; font-weight: bold;" 
                    @click=${this.handleDensityApply}>
              ${this.markers.length === 0 ? 'Analyze Track' : 'Re-Analyze Track'}
            </button>
          </div>
        </div>
      ` : ''}
      
      ${isDiorama ? html`
        <div style="display: flex; gap: 16px; padding: 16px; overflow-x: auto; background: #111; box-sizing: border-box; align-items: center; white-space: nowrap; min-height: 160px;">
          ${this.macroShots.map((shot, i) => html`
            <div @click=${() => this.selectedMarkerId = shot.id}
                 @dblclick=${() => this.dispatchEvent(new CustomEvent('snap-camera', { detail: { id: shot.id } }))}
                 style="display: inline-flex; flex-direction: column; gap: 4px; background: ${this.selectedMarkerId === shot.id ? '#333' : '#222'}; padding: 12px; border-radius: 8px; border: 1px solid ${this.selectedMarkerId === shot.id ? '#7c4dff' : '#444'}; cursor: pointer; min-width: 180px;">
              <div style="font-weight: bold; color: #fff;">Shot ${i + 1} (${shot.duration.toFixed(1)}s)</div>
              <div style="color: #aaa; font-size: 12px;">Target: ${this.availableTargets.find(t => t.id === shot.target)?.label || shot.target || 'None'}</div>
              <div style="color: #aaa; font-size: 12px;">Mood: <span style="text-transform: capitalize;">${shot.mood || 'balanced'}</span></div>
              ${shot.cameraPos ? html`<div style="color: #4caf50; font-size: 12px; font-weight: bold; margin-top: 4px;">📸 Locked</div>` : ''}
            </div>
            
            ${i < this.macroShots.length - 1 ? html`
              <div style="display: flex; flex-direction: column; align-items: center; gap: 4px;">
                <div style="color: #888; font-size: 11px; text-transform: uppercase;">Transition</div>
                <select @change=${(e: Event) => this.updateMacroShotTransition(this.macroShots[i+1].id, (e.target as HTMLSelectElement).value)}
                        .value=${this.macroShots[i+1].transitionType || 'smooth'}
                        style="background: #333; color: white; border: 1px solid #555; border-radius: 4px; padding: 2px 4px; font-size: 11px;">
                  <option value="cut">Cut</option>
                  <option value="smooth">Smooth</option>
                  <option value="whip-pan">Whip Pan</option>
                </select>
              </div>
            ` : ''}
          `)}
          
          <div @click=${this.addNewStoryboardPanel}
               style="display: inline-flex; align-items: center; justify-content: center; background: #222; border: 1px dashed #555; border-radius: 8px; padding: 12px; cursor: pointer; min-width: 100px; height: 90px; color: #888; font-weight: bold; transition: all 0.2s;"
               onmouseover="this.style.background='#333'; this.style.borderColor='#888';"
               onmouseout="this.style.background='#222'; this.style.borderColor='#555';">
            + Add Panel
          </div>
        </div>
      ` : html`
        <div id="waveform-container">
          ${this.isDecoding ? html`
            <div class="loading-overlay">Loading & Decoding Audio...</div>
          ` : ''}
          ${this.isAnalyzing ? html`
            <div class="loading-overlay">Analyzing Audio Spectrum & Transients...</div>
          ` : ''}
          ${!this.isAnalyzing && !this.isDecoding && !hasEvents && this.channelData ? html`
            <div class="loading-overlay" style="background: rgba(0,0,0,0.65);">
              Ready. Adjust Density and click "Analyze Track" above.
            </div>
          ` : ''}
        </div>
      `}

      ${!isDiorama && this.selectedMarkerId ? html`
        <div class="selected-marker-panel">
          <div>Selected Marker: <strong>${(this.markers.find(m => m.id === this.selectedMarkerId)?.time || 0).toFixed(2)}s</strong></div>
          ${(() => {
            const marker = this.markers.find(m => m.id === this.selectedMarkerId);
            if (!marker) return '';
            return html`
              <div style="display: flex; gap: 8px; align-items: center; margin-left: 10px; border-left: 1px solid #555; padding-left: 15px;">
                <label>Override Event:</label>
                ${this.renderConfigControls(marker.config, updates => this.updateSelectedMarkerConfig(updates))}
              </div>
            `;
          })()}
          <button class="delete-btn" @click=${this.removeSelectedMarker}>Delete Marker</button>
        </div>
      ` : ''}

      ${isDiorama && this.selectedMarkerId ? html`
        ${(() => {
          const found = this.findSelectedDioramaEvent();
          if (!found) return '';
          if (found.type === 'macro') {
            const shot = found.event;
            return html`
              <div class="selected-marker-panel">
                <div>📷 <strong>Macro Shot</strong> at <strong>${shot.startTime.toFixed(2)}s</strong> (${shot.duration.toFixed(1)}s)</div>
                <div style="display: flex; gap: 8px; align-items: center; margin-left: 10px; border-left: 1px solid #555; padding-left: 15px;">
                  <label>Target:</label>
                  ${this.renderDioramaTargetSelect(shot.target, t => this.updateSelectedMacroShot({ target: t }))}
                  <label style="margin-left: 8px;">Duration:</label>
                  <input type="number" step="0.1" min="0.1" .value=${shot.duration.toString()}
                         @input=${(e: Event) => this.updateSelectedMacroShot({ duration: parseFloat((e.target as HTMLInputElement).value) || 0.1 })} />
                  <label style="margin-left: 8px;">Mood:</label>
                  <select @change=${(e: Event) => this.updateSelectedMacroShot({ mood: (e.target as HTMLSelectElement).value as any })} .value=${shot.mood || 'balanced'}>
                    <option value="balanced">Balanced</option>
                    <option value="chaotic">Chaotic</option>
                    <option value="submerged">Submerged</option>
                    <option value="ambient">Ambient</option>
                  </select>
                  <label style="margin-left: 8px;">Intensity:</label>
                  <input type="number" step="0.05" min="0" max="1" .value=${(shot.intensity ?? 0.5).toFixed(2)}
                         @input=${(e: Event) => this.updateSelectedMacroShot({ intensity: parseFloat((e.target as HTMLInputElement).value) || 0.0 })} style="width: 50px;" />
                  <button style="background: #2196f3; color: white; border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer; margin-left: 8px;"
                          @click=${() => this.dispatchEvent(new CustomEvent('capture-camera', { detail: { id: this.selectedMarkerId } }))}>
                    📸 Capture Current Camera
                  </button>
                </div>
                <button class="delete-btn" @click=${this.removeSelectedDioramaEvent}>Delete</button>
              </div>
            `;
          } else {
            const cut = found.event;
            return html`
              <div class="selected-marker-panel">
                <div>✂ <strong>Micro Cut</strong> at <strong>${cut.time.toFixed(2)}s</strong></div>
                <div style="display: flex; gap: 8px; align-items: center; margin-left: 10px; border-left: 1px solid #555; padding-left: 15px;">
                  <label>Target:</label>
                  ${this.renderDioramaTargetSelect(cut.target, t => this.updateSelectedMicroCut({ target: t }))}
                </div>
                <button class="delete-btn" @click=${this.removeSelectedDioramaEvent}>Delete</button>
              </div>
            `;
          }
        })()}
      ` : ''}

      <div class="status-bar">
        ${!isDiorama ? html`
          <div class="legend">
            <div class="legend-item"><div class="legend-dot" style="background: #f44336;"></div>Bass</div>
            <div class="legend-item"><div class="legend-dot" style="background: #ffc107;"></div>Mid</div>
            <div class="legend-item"><div class="legend-dot" style="background: #00bcd4;"></div>Treble</div>
            <div class="legend-item"><div class="legend-dot" style="background: #4caf50;"></div>Manual</div>
          </div>
          <span>Click region to select. Double-click to delete.</span>
        ` : html`
          <div class="legend">
            <div class="legend-item"><div class="legend-dot" style="background: #7c4dff;"></div>Storyboard Panel</div>
          </div>
          <span>Double-click a panel to snap camera.</span>
        `}
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'audio-director': AudioDirector;
  }
}
