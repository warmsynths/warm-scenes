import * as THREE from 'three';

export class TrackerScreen {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  public texture: THREE.CanvasTexture;

  private width = 256;
  private height = 128;

  // Tracker animation state
  private scrollY = 0;

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.width;
    this.canvas.height = this.height;
    
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    this.ctx = this.canvas.getContext('2d')!;
    
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.minFilter = THREE.NearestFilter;
    this.texture.magFilter = THREE.NearestFilter; // Pixel art style
    this.texture.colorSpace = THREE.SRGBColorSpace;

    this.initialDraw();
  }

  private initialDraw() {
    const { ctx, width, height } = this;
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, width, height);
    this.texture.needsUpdate = true;
  }

  /**
   * Called every frame to draw the screen based on audio metrics.
   * @param amplitude The current volume RMS (0 to 1)
   * @param bass The current bass frequency intensity (0 to 1)
   */
  update(amplitude: number, bass: number) {
    const { ctx, width, height } = this;

    // Background
    ctx.fillStyle = '#0a0d11';
    ctx.fillRect(0, 0, width, height);

    // 1. Draw a retro tracker pattern (scrolling text rows)
    this.scrollY -= 1 + (amplitude * 5); // Scroll faster when louder
    if (this.scrollY < -20) this.scrollY = 0;

    ctx.font = '10px "Courier New", Courier, monospace';
    ctx.fillStyle = '#34d399'; // Neon green text
    
    for (let i = 0; i < 8; i++) {
      const y = this.scrollY + i * 20;
      if (y < 0 || y > height) continue;
      
      const step = (Math.floor(Date.now() / 100) + i) % 16;
      const note = ['C-4', 'D#4', '---', 'G-4'][i % 4];
      const inst = '0' + (i % 4 + 1);
      const fx = Math.floor(Math.random() * 100).toString(16).padStart(2, '0');
      
      ctx.fillText(`${step.toString(16).padStart(2, '0').toUpperCase()} ${note} ${inst} ${fx.toUpperCase()}`, 10, y);
    }

    // Highlighting the center row
    ctx.fillStyle = 'rgba(52, 211, 153, 0.2)';
    ctx.fillRect(0, 60, width / 2, 16);

    // 2. Draw VU Meter on the right side
    const meterX = width - 60;
    const meterY = 20;
    const meterW = 40;
    const meterH = 80;

    // Meter background
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(meterX, meterY, meterW, meterH);
    
    // Meter segments
    const segments = 10;
    const activeSegments = Math.floor(bass * segments * 1.5); // Spike hard on bass

    for (let i = 0; i < segments; i++) {
      const isRed = i < 2; // Top segments are red
      const isYellow = i >= 2 && i < 4;
      const isActive = (segments - 1 - i) < activeSegments;
      
      let color = '#334155'; // Inactive
      if (isActive) {
        if (isRed) color = '#ef4444';
        else if (isYellow) color = '#eab308';
        else color = '#10b981';
      }

      const segH = (meterH / segments) - 2;
      const segY = meterY + i * (meterH / segments) + 1;
      
      ctx.fillStyle = color;
      ctx.fillRect(meterX + 4, segY, meterW - 8, segH);
    }

    // 3. Draw mini waveform
    const waveY = height - 20;
    ctx.strokeStyle = '#f43f5e';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(10, waveY);
    for (let i = 0; i < width / 2; i += 10) {
      // Fake waveform based on amplitude
      const offset = (Math.random() - 0.5) * (amplitude * 20);
      ctx.lineTo(10 + i, waveY + offset);
    }
    ctx.stroke();

    this.texture.needsUpdate = true;
  }
}
