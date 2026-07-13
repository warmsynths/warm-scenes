import * as THREE from 'three';

export class M8Screen {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  public texture: THREE.CanvasTexture;

  private width = 512;
  private height = 360;

  private activeRow = 0;
  private lastBeatTime = 0;

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.width;
    this.canvas.height = this.height;
    
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    this.ctx = this.canvas.getContext('2d')!;
    
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.minFilter = THREE.NearestFilter;
    this.texture.magFilter = THREE.NearestFilter;
    this.texture.colorSpace = THREE.SRGBColorSpace;

    this.update(0, 0, new Array(8).fill(0));
  }

  update(_amplitude: number, bass: number, freqs: number[]) {
    const { ctx, width, height } = this;
    const now = Date.now();

    // Advance cursor on bass hit, max 10 times a second
    if (bass > 0.4 && now - this.lastBeatTime > 100) {
      this.activeRow = (this.activeRow + 1) % 14;
      this.lastBeatTime = now;
    }

    ctx.fillStyle = '#05070a';
    ctx.fillRect(0, 0, width, height);
    
    ctx.font = 'bold 18px "Courier New", monospace';
    
    // Top left "SONG"
    ctx.fillStyle = '#ff0044';
    ctx.fillText('SONG', 20, 35);
    
    // Headers 1-8
    ctx.fillStyle = '#00e5ff';
    const colXs = [70, 110, 150, 190, 230, 270, 310, 350];
    for (let c = 0; c < 8; c++) {
      ctx.fillText((c+1).toString(), colXs[c] + 8, 60);
    }
    
    // Grid
    for (let r = 0; r < 14; r++) {
      const y = 85 + r * 18;
      const isCursor = r === this.activeRow;
      
      if (isCursor) {
        ctx.fillStyle = '#00e5ff';
        ctx.fillRect(15, y - 14, 25, 18);
        ctx.fillStyle = '#05070a';
        ctx.fillText(r.toString(16).toUpperCase().padStart(2, '0'), 18, y - 1);
      } else {
        ctx.fillStyle = '#00aacc';
        ctx.fillText(r.toString(16).toUpperCase().padStart(2, '0'), 18, y - 1);
      }
      
      for (let c = 0; c < 8; c++) {
        const val = freqs[c] || 0;
        if (isCursor && c === 0) {
          ctx.fillStyle = '#00e5ff';
          ctx.fillRect(colXs[c], y - 14, 30, 18);
          ctx.fillStyle = '#05070a';
          ctx.fillText('0A', colXs[c] + 4, y - 1);
        } else if (isCursor && val > 0.5) {
          ctx.fillStyle = '#ff0044';
          ctx.fillRect(colXs[c], y - 14, 30, 18);
          ctx.fillStyle = '#05070a';
          ctx.fillText('1F', colXs[c] + 4, y - 1);
        } else {
          ctx.fillStyle = (r % 4 === 0) ? '#00e5ff' : '#00aacc';
          if (c === 0 && r > 0 && r < 5) {
             const vals = ['0B', '0C', '0C', '1F'];
             ctx.fillText(vals[r-1], colXs[c] + 4, y - 1);
          } else if (Math.random() > 0.98) {
             // Occasionally glitch some numbers
             const vals = ['0A', '1F', '20'];
             ctx.fillText(vals[Math.floor(Math.random()*vals.length)], colXs[c] + 4, y - 1);
          } else {
             // Static display for most cells
             if (r % 3 === 0 && c % 2 === 0) {
               ctx.fillText('20', colXs[c] + 4, y - 1);
             } else {
               ctx.fillText('--', colXs[c] + 4, y - 1);
             }
          }
        }
      }
    }
    
    // Right side panel
    ctx.fillStyle = '#00e5ff';
    ctx.fillText('T 140', 430, 60);
    
    // VU meter / Frequency visualizer on the right side lines
    for(let i=0; i<8; i++) {
       ctx.fillStyle = '#00e5ff';
       ctx.fillText((i+1).toString(), 430, 95 + i*18);
       const fVal = freqs[i] || 0;
       const bar = '-'.repeat(Math.ceil(fVal * 5));
       ctx.fillStyle = fVal > 0.7 ? '#ff0044' : '#00aacc';
       ctx.fillText(bar || '-', 450, 95 + i*18);
    }
    
    // Piano
    ctx.fillStyle = '#00e5ff';
    ctx.fillRect(430, 250, 60, 24);
    
    // Highlight piano keys based on frequency
    ctx.fillStyle = '#ffffff';
    for(let i=0; i<7; i++) {
       if (freqs[i] > 0.6) {
           ctx.fillRect(430 + i*(60/7), 250, 60/7, 24);
       }
    }
    
    ctx.fillStyle = '#05070a';
    for(let i=1; i<7; i++) {
       ctx.fillRect(430 + i*8, 250, 2, 14);
    }
    
    ctx.fillStyle = '#00e5ff';
    ctx.fillText('P S V', 430, 310);
    ctx.fillText('SCPIT', 430, 330);

    this.texture.needsUpdate = true;
  }
}
