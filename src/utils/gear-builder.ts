import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { TrackerScreen } from './tracker-screen';

const MM_TO_UNITS = 0.0285;
export const GET_GEAR_SIZE = (wMm: number, dMm: number, hMm: number) => {
  return {
    w: wMm * MM_TO_UNITS,
    d: dMm * MM_TO_UNITS,
    h: hMm * MM_TO_UNITS
  };
};

export async function createGearModel(id: string): Promise<THREE.Object3D> {
  switch (id) {
    case 'polyend': return buildPolyend();
    case 'circuit_tracks': return buildCircuitTracks();
    case 'mood': return buildMood();
    case 'blooper': return buildBlooper();
    case 'generation_loss': return buildGenerationLoss();
    case 'sp404': return buildSP404();
    case 'strat': return buildStrat();
    case 'm8': return buildM8();
    default: return new THREE.Group();
  }
}

function buildPolyend() {
  const trackerScreen = new TrackerScreen();
  const textureLoader = new THREE.TextureLoader();
  const topTex = textureLoader.load(import.meta.env.BASE_URL + 'tracker_ref.png');
  topTex.colorSpace = THREE.SRGBColorSpace;
  topTex.repeat.set(0.85, 0.85);
  topTex.offset.set(0.075, 0.075);

  const sideMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.8 });
  const topMat = new THREE.MeshStandardMaterial({ map: topTex, roughness: 0.3, metalness: 0.1 });
  const trackerMats = [sideMat, sideMat, topMat, sideMat, sideMat, sideMat];
  
  const tSize = GET_GEAR_SIZE(282, 207, 33);
  const trackerBody = new THREE.Mesh(new THREE.BoxGeometry(tSize.w, tSize.h, tSize.d), trackerMats);
  
  const screenMat = new THREE.MeshStandardMaterial({
    map: trackerScreen.texture, 
    emissiveMap: trackerScreen.texture,
    emissive: 0xffffff, 
    emissiveIntensity: 1.5,
    transparent: true,
    opacity: 0.85
  });

  const wFactor = tSize.w / 8.5;
  const dFactor = tSize.d / 6.2;
  const screenOverlay = new THREE.Mesh(new THREE.PlaneGeometry(3.6 * wFactor, 2.0 * dFactor), screenMat);
  screenOverlay.rotation.x = -Math.PI / 2;
  screenOverlay.position.set(-1.8 * wFactor, tSize.h / 2 + 0.002, -1.2 * dFactor);
  trackerBody.add(screenOverlay);
  
  return trackerBody;
}

function buildCircuitTracks() {
  const textureLoader = new THREE.TextureLoader();
  const topTex = textureLoader.load(import.meta.env.BASE_URL + 'circuit_ref.png');
  topTex.colorSpace = THREE.SRGBColorSpace;
  topTex.repeat.set(0.85, 0.85);
  topTex.offset.set(0.075, 0.075);

  const sideMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.8, metalness: 0.2 });
  const topMat = new THREE.MeshStandardMaterial({ map: topTex, roughness: 0.3, metalness: 0.1 });

  const ctMats = [sideMat, sideMat, topMat, sideMat, sideMat, sideMat];
  const ctSize = GET_GEAR_SIZE(240, 210, 30);
  const ctBody = new THREE.Mesh(new THREE.BoxGeometry(ctSize.w, ctSize.h, ctSize.d), ctMats);

  const padMatBase = new THREE.MeshStandardMaterial({ 
    color: 0x000000, 
    emissive: 0x00aa00,
    transparent: true,
    opacity: 0.7,
    blending: THREE.AdditiveBlending
  });

  const wFactor = ctSize.w / 5.5;
  const dFactor = ctSize.d / 5.1;

  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 8; col++) {
      const padOverlay = new THREE.Mesh(new THREE.PlaneGeometry(0.5 * wFactor, 0.42 * dFactor), padMatBase.clone());
      padOverlay.userData = { isPad: true };
      padOverlay.rotation.x = -Math.PI / 2;
      padOverlay.position.set((-1.925 + col * 0.55) * wFactor, ctSize.h / 2 + 0.002, (0.14 + row * 0.58) * dFactor);
      ctBody.add(padOverlay);
    }
  }
  return ctBody;
}

function buildMood() {
  return buildBasePedal(0xffa07a, import.meta.env.BASE_URL + 'mood_texture.png');
}

function buildBlooper() {
  return buildBasePedal(0xa4c8e1, import.meta.env.BASE_URL + 'blooper_texture.png');
}

function buildGenerationLoss() {
  return buildBasePedal(0x6e90a6, import.meta.env.BASE_URL + 'generation_loss_texture.png');
}

function buildBasePedal(colorHex: number, topTexturePath?: string) {
  const pedal = new THREE.Group();
  const pSize = GET_GEAR_SIZE(64, 124, 60);
  const sideMat = new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.3, metalness: 0.4 });
  let bodyMat: THREE.Material | THREE.Material[] = sideMat;

  if (topTexturePath) {
    const textureLoader = new THREE.TextureLoader();
    const topTex = textureLoader.load(topTexturePath);
    topTex.colorSpace = THREE.SRGBColorSpace;
    topTex.repeat.set(0.92, 0.95);
    topTex.offset.set(0.04, 0.025);
    const topMat = new THREE.MeshStandardMaterial({ map: topTex, roughness: 0.25, metalness: 0.3 });
    bodyMat = [sideMat, sideMat, topMat, sideMat, sideMat, sideMat];
  }

  const body = new THREE.Mesh(new THREE.BoxGeometry(pSize.w, pSize.h, pSize.d), bodyMat);
  pedal.add(body);

  const wFactor = pSize.w / 2;
  const dFactor = pSize.d / 3;
  const hFactor = pSize.h / 1.2;
  
  const knobMat = new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0.8, roughness: 0.3 });
  for (let i = 0; i < 3; i++) {
    const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.2 * wFactor, 0.2 * wFactor, 0.25 * hFactor, 16), knobMat);
    knob.position.set((-0.6 + i * 0.6) * wFactor, pSize.h / 2 + 0.125 * hFactor, -1.0 * dFactor);
    pedal.add(knob);
  }
  for (let i = 0; i < 3; i++) {
    const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.2 * wFactor, 0.2 * wFactor, 0.25 * hFactor, 16), knobMat);
    knob.position.set((-0.6 + i * 0.6) * wFactor, pSize.h / 2 + 0.125 * hFactor, -0.4 * dFactor);
    pedal.add(knob);
  }

  const toggleMat = new THREE.MeshStandardMaterial({ color: 0xeeeeee, metalness: 1.0 });
  for(let i = 0; i < 3; i++) {
    const tog = new THREE.Mesh(new THREE.CylinderGeometry(0.04 * wFactor, 0.04 * wFactor, 0.25 * hFactor), toggleMat);
    tog.position.set((-0.6 + i * 0.6) * wFactor, pSize.h / 2 + 0.125 * hFactor, 0.1 * dFactor);
    pedal.add(tog);
  }

  const switchMat = new THREE.MeshStandardMaterial({ color: 0xdddddd, metalness: 0.9, roughness: 0.1 });
  const fs1 = new THREE.Mesh(new THREE.CylinderGeometry(0.18 * wFactor, 0.18 * wFactor, 0.3 * hFactor, 16), switchMat);
  fs1.position.set(-0.6 * wFactor, pSize.h / 2 + 0.15 * hFactor, 1.15 * dFactor);
  pedal.add(fs1);

  const fs2 = new THREE.Mesh(new THREE.CylinderGeometry(0.18 * wFactor, 0.18 * wFactor, 0.3 * hFactor, 16), switchMat);
  fs2.position.set(0.6 * wFactor, pSize.h / 2 + 0.15 * hFactor, 1.15 * dFactor);
  pedal.add(fs2);

  return pedal;
}



function buildSP404() {
  const textureLoader = new THREE.TextureLoader();
  const topTex = textureLoader.load(import.meta.env.BASE_URL + 'sp404_ref.png');
  topTex.colorSpace = THREE.SRGBColorSpace;
  topTex.repeat.set(0.82, 0.82);
  topTex.offset.set(0.09, 0.09);

  const sideMat = new THREE.MeshStandardMaterial({ color: 0x1f1f1f, roughness: 0.6, metalness: 0.4 });
  const topMat = new THREE.MeshStandardMaterial({ map: topTex, roughness: 0.3, metalness: 0.1 });

  const spMats = [sideMat, sideMat, topMat, sideMat, sideMat, sideMat];
  const spSize = GET_GEAR_SIZE(177.5, 275.8, 70.5);
  const spBody = new THREE.Mesh(new THREE.BoxGeometry(spSize.w, spSize.h, spSize.d), spMats);

  const padMatBase = new THREE.MeshStandardMaterial({ 
    color: 0x000000, 
    emissive: 0x000000,
    transparent: true,
    opacity: 0.7,
    blending: THREE.AdditiveBlending
  });

  const wFactor = spSize.w / 4.5;
  const dFactor = spSize.d / 7.0;
  
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 4; col++) {
      const padOverlay = new THREE.Mesh(new THREE.PlaneGeometry(0.7 * wFactor, 0.55 * dFactor), padMatBase.clone());
      padOverlay.userData = { isPad: true };
      padOverlay.rotation.x = -Math.PI / 2;
      padOverlay.position.set((-1.35 + col * 0.9) * wFactor, spSize.h / 2 + 0.002, (0.5 + row * 0.7) * dFactor);
      spBody.add(padOverlay);
    }
  }
  return spBody;
}

async function buildStrat(): Promise<THREE.Object3D> {
  return new Promise((resolve, reject) => {
    const loader = new FBXLoader();
    loader.load(import.meta.env.BASE_URL + 'guitar/stratocaster.FBX', (object) => {
      const targetLength = 950 * MM_TO_UNITS;
      const box = new THREE.Box3().setFromObject(object);
      const size = box.getSize(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z);
      
      const scale = targetLength / maxDim;
      object.scale.setScalar(scale);

      box.setFromObject(object);
      const center = box.getCenter(new THREE.Vector3());
      object.position.sub(center);

      object.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          const mesh = child as THREE.Mesh;
          if (mesh.material) {
            const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
            materials.forEach((mat: any) => {
              if (mat.color) {
                const hsl = { h: 0, s: 0, l: 0 };
                mat.color.getHSL(hsl);
                
                if (!mat.map) {
                  if (hsl.l < 0.15) {
                    mat.color.setHex(0xccddcc);
                    mat.metalness = 0.1;
                    mat.roughness = 0.15; 
                  }
                  else if (hsl.s < 0.1 && hsl.l > 0.6) {
                    mat.metalness = 0.05;
                    mat.roughness = 0.3;
                  }
                  else if (hsl.s < 0.1 && hsl.l >= 0.15 && hsl.l <= 0.6) {
                    mat.metalness = 0.9;
                    mat.roughness = 0.2;
                  }
                } else {
                  mat.roughness = 0.6;
                  mat.metalness = 0.05;
                }
              }
            });
          }
        }
      });
      resolve(object);
    }, undefined, reject);
  });
}

function buildM8() {
  const m8Group = new THREE.Group();
  const mSize = GET_GEAR_SIZE(96, 133, 20);
  const wFactor = mSize.w;
  const dFactor = mSize.d;
  const hFactor = mSize.h;
  
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x18181a, roughness: 0.8, metalness: 0.2 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(wFactor, hFactor, dFactor), bodyMat);
  m8Group.add(body);

  const screenW = wFactor * 0.90;
  const screenD = dFactor * 0.44;
  const screenMat = new THREE.MeshStandardMaterial({ color: 0x050508, roughness: 0.2, metalness: 0.8 });
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(screenW, screenD), screenMat);
  screen.rotation.x = -Math.PI / 2;
  screen.position.set(0, hFactor / 2 + 0.001, -dFactor * 0.23);
  m8Group.add(screen);

  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 360; 
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#05070a';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  ctx.font = 'bold 18px "Courier New", monospace';
  ctx.fillStyle = '#ff0044';
  ctx.fillText('SONG', 20, 35);
  ctx.fillStyle = '#00e5ff';
  const colXs = [70, 110, 150, 190, 230, 270, 310, 350];
  for (let c = 0; c < 8; c++) {
    ctx.fillText((c+1).toString(), colXs[c] + 8, 60);
  }
  for (let r = 0; r < 14; r++) {
    const y = 85 + r * 18;
    ctx.fillStyle = (r === 0) ? '#00e5ff' : '#00aacc';
    ctx.fillText(r.toString(16).toUpperCase().padStart(2, '0'), 18, y - 1);
    for (let c = 0; c < 8; c++) {
      ctx.fillStyle = (r % 4 === 0) ? '#00e5ff' : '#00aacc';
      ctx.fillText('--', colXs[c] + 4, y - 1);
    }
  }
  
  const uiTex = new THREE.CanvasTexture(canvas);
  const uiMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0xffffff,
    emissiveIntensity: 1.0,
    map: uiTex,
    emissiveMap: uiTex,
    transparent: true,
    opacity: 0.9,
  });
  const uiMesh = new THREE.Mesh(new THREE.PlaneGeometry(screenW, screenD), uiMat);
  uiMesh.rotation.x = -Math.PI / 2;
  uiMesh.position.set(0, hFactor / 2 + 0.002, -dFactor * 0.23);
  m8Group.add(uiMesh);

  const keyMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.7, metalness: 0.1 });
  const kw = wFactor * 0.16;
  const kd = dFactor * 0.115;
  const kh = hFactor * 0.25;
  const keyGeo = new THREE.BoxGeometry(kw, kh, kd);
  
  const colX = [-0.36, -0.18, 0.00, 0.18, 0.36];
  const rowZ = [0.09, 0.23, 0.39];
  
  const keyPositions = [
    { x: colX[1], z: rowZ[0] }, 
    { x: colX[3], z: rowZ[0] }, 
    { x: colX[4], z: rowZ[0] }, 
    { x: colX[0], z: rowZ[1] }, 
    { x: colX[1], z: rowZ[1] }, 
    { x: colX[2], z: rowZ[1] }, 
    { x: colX[1], z: rowZ[2] }, 
    { x: colX[2], z: rowZ[2] }, 
  ];

  keyPositions.forEach(pos => {
    const key = new THREE.Mesh(keyGeo, keyMat);
    key.position.set(pos.x * wFactor, hFactor / 2 + kh / 2, pos.z * dFactor);
    m8Group.add(key);
  });

  return m8Group;
}
