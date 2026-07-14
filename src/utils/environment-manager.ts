import * as THREE from 'three';
import gsap from 'gsap';

export interface ThemeConfig {
  fog: { color: number; density: number };
  ambientLight: { color: number; intensity: number };
  hemisphereLight?: { skyColor: number; groundColor: number; intensity: number };
  desaturateMaterials: boolean;
  desaturationTarget: THREE.Color;
}

export class EnvironmentManager {
  private scene: THREE.Scene;
  
  constructor(scene: THREE.Scene) {
    this.scene = scene;
    
    // Ensure scene has fog initialized so we can tween it smoothly later
    if (!this.scene.fog) {
      this.scene.fog = new THREE.FogExp2(0x1a1520, 0);
    }
  }

  public applyTheme(config: ThemeConfig, duration: number = 2) {
    // 1. Update Background & Fog
    if (this.scene.background instanceof THREE.Color) {
      gsap.to(this.scene.background, {
        r: new THREE.Color(config.fog.color).r,
        g: new THREE.Color(config.fog.color).g,
        b: new THREE.Color(config.fog.color).b,
        duration,
        ease: 'power2.inOut'
      });
    }

    if (this.scene.fog instanceof THREE.FogExp2) {
      gsap.to(this.scene.fog.color, {
        r: new THREE.Color(config.fog.color).r,
        g: new THREE.Color(config.fog.color).g,
        b: new THREE.Color(config.fog.color).b,
        duration,
        ease: 'power2.inOut'
      });
      gsap.to(this.scene.fog, {
        density: config.fog.density,
        duration,
        ease: 'power2.inOut'
      });
    }
    
    // 2. Update Lights and Materials
    this.scene.traverse((child) => {
      // Skip preserved objects (e.g. devices) entirely
      if (child.userData.preserveTheme) return;

      // Lights
      if (child instanceof THREE.AmbientLight) {
        gsap.to(child.color, {
          r: new THREE.Color(config.ambientLight.color).r,
          g: new THREE.Color(config.ambientLight.color).g,
          b: new THREE.Color(config.ambientLight.color).b,
          duration, ease: 'power2.inOut'
        });
        gsap.to(child, {
          intensity: config.ambientLight.intensity,
          duration, ease: 'power2.inOut'
        });
      }
      
      if (child instanceof THREE.HemisphereLight && config.hemisphereLight) {
        gsap.to(child.color, {
          r: new THREE.Color(config.hemisphereLight.skyColor).r,
          g: new THREE.Color(config.hemisphereLight.skyColor).g,
          b: new THREE.Color(config.hemisphereLight.skyColor).b,
          duration, ease: 'power2.inOut'
        });
        gsap.to(child.groundColor, {
          r: new THREE.Color(config.hemisphereLight.groundColor).r,
          g: new THREE.Color(config.hemisphereLight.groundColor).g,
          b: new THREE.Color(config.hemisphereLight.groundColor).b,
          duration, ease: 'power2.inOut'
        });
        gsap.to(child, {
          intensity: config.hemisphereLight.intensity,
          duration, ease: 'power2.inOut'
        });
      }
      
      // Specifically handle our custom dynamic lights (desk light, window light)
      // We tag them in lofi-diorama with `userData.isDeskLight` etc. to dim them in liminal mode
      if (child instanceof THREE.Light && child.userData.liminalIntensity !== undefined) {
        const targetIntensity = config.desaturateMaterials ? child.userData.liminalIntensity : (child.userData.normalIntensity || child.intensity);
        gsap.to(child, {
          intensity: targetIntensity,
          duration, ease: 'power2.inOut'
        });
      }
      
      // Materials
      if (child instanceof THREE.Mesh && !child.userData.preserveTheme) {
        const mats = Array.isArray(child.material) ? child.material : [child.material];
        
        mats.forEach((mat: THREE.Material) => {
          if ('color' in mat) {
            const materialWithColor = mat as any; // Cast to access color and userData
            
            // Save original if not saved
            if (!materialWithColor.userData) materialWithColor.userData = {};
            if (!materialWithColor.userData.originalColor) {
              materialWithColor.userData.originalColor = materialWithColor.color.clone();
            }
            
            if (config.desaturateMaterials) {
              // Tween to gray/desaturated
              // We blend the original color with the target gray to maintain some local value difference
              const orig = materialWithColor.userData.originalColor as THREE.Color;
              
              // We create a custom washed out target by lerping original with a flat gray tone
              // Walls/floor look better if they retain a tiny hint of their brightness
              const washedOut = orig.clone().lerp(config.desaturationTarget, 0.85); 
              
              gsap.to(materialWithColor.color, {
                r: washedOut.r,
                g: washedOut.g,
                b: washedOut.b,
                duration,
                ease: 'power2.inOut'
              });
            } else {
              // Restore materials
              const orig = materialWithColor.userData.originalColor as THREE.Color;
              gsap.to(materialWithColor.color, {
                r: orig.r,
                g: orig.g,
                b: orig.b,
                duration,
                ease: 'power2.inOut'
              });
            }
          }
        });
      }
    });
  }
}
