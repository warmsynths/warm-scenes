import * as THREE from 'three';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import type { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';

const PASSTHROUGH_VERTEX_SHADER = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/**
 * Organic film grain (not per-pixel "TV static"): grain is sampled in actual
 * screen pixels and smoothed with bilinear value-noise so it clumps into
 * blobs a few pixels wide, then two octaves are blended for texture. Pure
 * hash-per-pixel noise (the old approach) is indistinguishable from video
 * static because it has no spatial coherence at all.
 */
export const FilmGrainShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0.0 },
    uAmount: { value: 3.5 }, // artist-facing scale (0-25), same range used across the app
    uLuminanceWeight: { value: 1.0 },
    uGrainSize: { value: 2.2 }, // grain "blob" size in screen pixels
  },
  vertexShader: PASSTHROUGH_VERTEX_SHADER,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uAmount;
    uniform float uLuminanceWeight;
    uniform float uGrainSize;
    varying vec2 vUv;

    float hash(vec2 p) {
      p = fract(p * vec2(123.34, 456.21));
      p += dot(p, p + 45.32);
      return fract(p.x * p.y);
    }

    // Bilinear-interpolated hash noise: soft organic blobs instead of raw static.
    float valueNoise(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      vec2 u = f * f * (3.0 - 2.0 * f);
      float a = hash(i);
      float b = hash(i + vec2(1.0, 0.0));
      float c = hash(i + vec2(0.0, 1.0));
      float d = hash(i + vec2(1.0, 1.0));
      return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
    }

    void main() {
      vec4 texColor = texture2D(tDiffuse, vUv);

      float luminance = dot(texColor.rgb, vec3(0.299, 0.587, 0.114));
      float weight = 1.0 - abs(luminance - 0.5) * 2.0;
      weight = mix(1.0, weight, uLuminanceWeight);

      // Sample in screen pixels (scaled down by grain size) so each grain
      // "blob" spans several pixels, like real film grain, not 1:1 static.
      vec2 grainCoord = gl_FragCoord.xy / max(uGrainSize, 1.0);
      float seed = fract(uTime * 24.0) * 97.13; // re-seed roughly every film frame

      float fine = valueNoise(grainCoord + seed);
      float coarse = valueNoise(grainCoord * 0.5 + seed * 1.7);
      float grain = mix(fine, coarse, 0.5);
      grain = (grain - 0.5) * 2.0;

      // uAmount is on the same 0-25 artist-facing scale used elsewhere in the
      // app; /40 calibrates it into a usable pixel-intensity range.
      texColor.rgb += grain * (uAmount / 40.0) * weight;

      gl_FragColor = texColor;
    }
  `,
};

/**
 * VHS tape look: horizontal tracking jitter, RGB channel split
 * (chromatic aberration), scanlines, vignette, and slight desaturation.
 */
export const VHSShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0.0 },
    uIntensity: { value: 1.0 }, // 0-1 overall effect strength
    uResolution: { value: new THREE.Vector2(1920, 1080) },
  },
  vertexShader: PASSTHROUGH_VERTEX_SHADER,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uIntensity;
    uniform vec2 uResolution;
    varying vec2 vUv;

    float hash(vec2 p) {
      p = fract(p * vec2(123.34, 456.21));
      p += dot(p, p + 45.32);
      return fract(p.x * p.y);
    }

    void main() {
      vec2 uv = vUv;

      // Horizontal tracking jitter, re-rolled a few times a second per scanline band.
      float band = floor(uv.y * uResolution.y / 3.0);
      float lineNoise = hash(vec2(band, floor(uTime * 6.0)));
      uv.x += (lineNoise - 0.5) * 0.006 * uIntensity;

      // Chromatic aberration: split R/B slightly.
      float aberration = 0.003 * uIntensity;
      float r = texture2D(tDiffuse, uv + vec2(aberration, 0.0)).r;
      float g = texture2D(tDiffuse, uv).g;
      float b = texture2D(tDiffuse, uv - vec2(aberration, 0.0)).b;
      vec3 color = vec3(r, g, b);

      // Scanlines.
      float scanline = sin(uv.y * uResolution.y * 1.2) * 0.04 * uIntensity;
      color -= scanline;

      // Vignette.
      vec2 centered = uv - 0.5;
      float vignette = 1.0 - dot(centered, centered) * 0.6 * uIntensity;
      color *= vignette;

      // Slight desaturation for a washed-out tape look.
      float luma = dot(color, vec3(0.299, 0.587, 0.114));
      color = mix(color, vec3(luma), 0.15 * uIntensity);

      gl_FragColor = vec4(color, 1.0);
    }
  `,
};

/** Black & white noir grade: desaturate, punch up contrast, add a soft vignette. */
export const NoirShader = {
  uniforms: {
    tDiffuse: { value: null },
    uIntensity: { value: 1.0 }, // 0-1 blend between original color and full noir
    uContrast: { value: 1.35 },
  },
  vertexShader: PASSTHROUGH_VERTEX_SHADER,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float uIntensity;
    uniform float uContrast;
    varying vec2 vUv;

    void main() {
      vec4 texColor = texture2D(tDiffuse, vUv);
      float luma = dot(texColor.rgb, vec3(0.299, 0.587, 0.114));

      float contrasted = clamp((luma - 0.5) * uContrast + 0.5, 0.0, 1.0);
      vec3 noir = vec3(contrasted);

      vec2 centered = vUv - 0.5;
      float vignette = 1.0 - dot(centered, centered) * 0.5;
      noir *= vignette;

      vec3 result = mix(texColor.rgb, noir, uIntensity);
      gl_FragColor = vec4(result, texColor.a);
    }
  `,
};

/**
 * Shared post-processing stack (film grain, VHS, noir) any scene can drop
 * into its own EffectComposer, so these effects aren't reimplemented/duplicated
 * per scene. Each pass is independently enable-able so effects can combine
 * (e.g. VHS + noir).
 */
export class VisualEffectsStack {
  public readonly grainPass: ShaderPass;
  public readonly vhsPass: ShaderPass;
  public readonly noirPass: ShaderPass;

  constructor(width: number, height: number) {
    this.grainPass = new ShaderPass(FilmGrainShader);

    this.vhsPass = new ShaderPass(VHSShader);
    this.vhsPass.uniforms.uResolution.value.set(width, height);
    this.vhsPass.enabled = false;

    this.noirPass = new ShaderPass(NoirShader);
    this.noirPass.enabled = false;
  }

  /** Adds all three passes to the given composer, in the recommended order. */
  public addToComposer(composer: EffectComposer): void {
    composer.addPass(this.grainPass);
    composer.addPass(this.vhsPass);
    composer.addPass(this.noirPass);
  }

  public setResolution(width: number, height: number): void {
    this.vhsPass.uniforms.uResolution.value.set(width, height);
  }

  /** Call once per frame to advance time-based effects (grain, VHS jitter). */
  public update(time: number): void {
    this.grainPass.uniforms.uTime.value = time;
    this.vhsPass.uniforms.uTime.value = time;
  }

  public setGrain(amount: number, luminanceWeight: number = 1.0): void {
    this.grainPass.uniforms.uAmount.value = amount;
    this.grainPass.uniforms.uLuminanceWeight.value = luminanceWeight;
    this.grainPass.enabled = amount > 0;
  }

  public setVHS(enabled: boolean, intensity: number = 1.0): void {
    this.vhsPass.enabled = enabled;
    this.vhsPass.uniforms.uIntensity.value = intensity;
  }

  public setNoir(enabled: boolean, intensity: number = 1.0, contrast: number = 1.35): void {
    this.noirPass.enabled = enabled;
    this.noirPass.uniforms.uIntensity.value = intensity;
    this.noirPass.uniforms.uContrast.value = contrast;
  }
}
