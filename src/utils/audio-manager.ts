/**
 * AudioManager handles Web Audio API interaction.
 * It provides both real-time playback analysis (for interactive use)
 * and offline deterministic analysis (for frame-by-frame rendering in Hyperframes).
 */
export class AudioManager {
  private ctx: AudioContext | null = null;
  private buffer: AudioBuffer | null = null;
  private source: AudioBufferSourceNode | null = null;
  private analyser: AnalyserNode | null = null;

  // Track playback state
  private playbackStartTime = 0;
  private pausedTime = 0;
  private playState: 'stopped' | 'playing' | 'paused' = 'stopped';
  private onEndedCallback: (() => void) | null = null;
  private isLooping = false;

  get loop(): boolean {
    return this.isLooping;
  }

  set loop(value: boolean) {
    this.isLooping = value;
    if (this.source) {
      this.source.loop = value;
    }
  }

  constructor() {
    // AudioContext will be initialized on first user interaction
  }

  /**
   * Initializes the AudioContext if not already done.
   */
  private initContext() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    return this.ctx;
  }

  get isPlaying(): boolean {
    return this.playState === 'playing';
  }

  get isPaused(): boolean {
    return this.playState === 'paused';
  }

  get isLoaded(): boolean {
    return this.buffer !== null;
  }

  get duration(): number {
    return this.buffer ? this.buffer.duration : 0;
  }

  /**
   * Loads a file from a drag-and-drop or input element,
   * decodes the audio, and saves the buffer.
   */
  async loadFile(file: File): Promise<AudioBuffer> {
    const context = this.initContext();
    const arrayBuffer = await file.arrayBuffer();
    
    // Decode audio data
    this.buffer = await context.decodeAudioData(arrayBuffer);
    
    // Reset play state
    this.stop();
    this.pausedTime = 0;
    
    return this.buffer;
  }

  /**
   * Starts playback from the current position.
   */
  play(onEnded?: () => void) {
    if (!this.buffer) throw new Error('No audio file loaded');
    const context = this.initContext();

    this.stop();

    if (onEnded) {
      this.onEndedCallback = onEnded;
    }

    // Create source
    this.source = context.createBufferSource();
    this.source.buffer = this.buffer;
    this.source.loop = this.isLooping;

    // Create real-time analyser
    this.analyser = context.createAnalyser();
    this.analyser.fftSize = 512;
    this.analyser.smoothingTimeConstant = 0.8;

    // Connect nodes
    this.source.connect(this.analyser);
    this.analyser.connect(context.destination);

    // Playback starting offset
    const offset = this.pausedTime;
    this.source.start(0, offset);
    this.playbackStartTime = context.currentTime - offset;
    this.playState = 'playing';

    this.source.onended = () => {
      // Check if we reached the end naturally
      if (this.playState === 'playing') {
        const elapsed = context.currentTime - this.playbackStartTime;
        if (elapsed >= this.buffer!.duration - 0.05) {
          this.playState = 'stopped';
          this.pausedTime = 0;
          if (this.onEndedCallback) {
            this.onEndedCallback();
          }
        }
      }
    };
  }

  /**
   * Pauses playback and tracks current position.
   */
  pause() {
    if (this.playState !== 'playing' || !this.ctx) return;
    this.pausedTime = this.ctx.currentTime - this.playbackStartTime;
    
    if (this.source) {
      try {
        this.source.stop();
      } catch (e) {
        // Source might have already stopped
      }
      this.source = null;
    }
    
    this.playState = 'paused';
  }

  /**
   * Stops playback completely.
   */
  stop() {
    this.pausedTime = 0;
    if (this.source) {
      try {
        this.source.stop();
      } catch (e) {
        // Already stopped
      }
      this.source = null;
    }
    this.playState = 'stopped';
  }

  /**
   * Clears loaded audio buffer and resets play state.
   */
  clear() {
    this.stop();
    this.buffer = null;
    this.pausedTime = 0;
  }

  /**
   * Seek to a specific timestamp in seconds.
   */
  seek(time: number) {
    if (!this.buffer) return;
    const boundedTime = Math.max(0, Math.min(time, this.buffer.duration));
    
    const wasPlaying = this.playState === 'playing';
    this.pausedTime = boundedTime;
    
    if (wasPlaying) {
      this.play(this.onEndedCallback || undefined);
    }
  }

  /**
   * Returns current playback time in seconds.
   */
  getCurrentTime(): number {
    if (this.playState === 'playing' && this.ctx) {
      const elapsed = this.ctx.currentTime - this.playbackStartTime;
      if (this.isLooping && this.buffer) {
        return elapsed % this.buffer.duration;
      }
      return elapsed;
    }
    return this.pausedTime;
  }

  /**
   * Real-time analysis query.
   * Returns frequency data and the overall current amplitude (RMS) in real-time.
   */
  getRealTimeData(): { amplitude: number; frequencies: Uint8Array } {
    const defaultFreq = new Uint8Array(256);
    if (!this.analyser || this.playState !== 'playing') {
      return { amplitude: 0, frequencies: defaultFreq };
    }

    const bufferLength = this.analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    this.analyser.getByteFrequencyData(dataArray);

    // Calculate time-domain wave for amplitude
    const timeArray = new Uint8Array(bufferLength);
    this.analyser.getByteTimeDomainData(timeArray);

    // Compute RMS amplitude [0.0, 1.0] from time domain
    let sum = 0;
    for (let i = 0; i < bufferLength; i++) {
      // Normalize from [0, 255] to [-1.0, 1.0]
      const val = (timeArray[i] - 128) / 128;
      sum += val * val;
    }
    const rms = Math.sqrt(sum / bufferLength);

    return {
      amplitude: rms,
      frequencies: dataArray,
    };
  }

  /**
   * Offline Deterministic Analysis (Hyperframes mode).
   * Given an exact timestamp, this function extracts a window of sample data
   * and computes a deterministic RMS amplitude and frequency spectrum (via direct DFT).
   * This is entirely independent of real-time browser audio state.
   */
  getDeterministicData(time: number): { amplitude: number; frequencies: number[] } {
    if (!this.buffer) {
      return { amplitude: 0, frequencies: new Array(8).fill(0) };
    }

    const sampleRate = this.buffer.sampleRate;
    const channelData = this.buffer.getChannelData(0); // Analyze first channel
    
    // Find index in buffer corresponding to the timestamp
    const centerSampleIndex = Math.floor(time * sampleRate);
    
    // Window size for analysis (e.g. 512 samples)
    const windowSize = 512;
    const halfWindow = windowSize / 2;
    
    const samples = new Float32Array(windowSize);
    for (let i = 0; i < windowSize; i++) {
      const idx = centerSampleIndex - halfWindow + i;
      if (idx >= 0 && idx < channelData.length) {
        samples[i] = channelData[idx];
      } else {
        samples[i] = 0; // Padding outside buffer boundaries
      }
    }

    // 1. Calculate RMS amplitude
    let sum = 0;
    for (let i = 0; i < windowSize; i++) {
      sum += samples[i] * samples[i];
    }
    const amplitude = Math.sqrt(sum / windowSize);

    // 2. Compute direct DFT at 8 specific frequencies for visual bands
    // Target bands (Hz): Bass (60), Mid-Bass (150), Low-Mid (400), Mid (1000), High-Mid (2500), Presence (5000), Brilliance (10000), Extreme (15000)
    const targetFrequencies = [60, 150, 400, 1000, 2500, 5000, 10000, 15000];
    const frequencies = targetFrequencies.map((f) => {
      let real = 0;
      let imag = 0;
      
      for (let n = 0; n < windowSize; n++) {
        // Hann windowing to prevent spectral leakage
        const hann = 0.5 * (1 - Math.cos((2 * Math.PI * n) / (windowSize - 1)));
        const angle = (2 * Math.PI * f * n) / sampleRate;
        const s = samples[n] * hann;
        real += s * Math.cos(angle);
        imag += s * Math.sin(angle);
      }
      
      // Calculate magnitude
      let mag = Math.sqrt(real * real + imag * imag) / windowSize;
      
      // Boost higher frequencies slightly to normalize visualization scaling
      if (f > 1000) mag *= 1.5;
      if (f > 5000) mag *= 2.0;
      
      // Normalize and clamp to [0, 1]
      return Math.min(1.0, mag * 25.0); 
    });

    return {
      amplitude,
      frequencies,
    };
  }
}
