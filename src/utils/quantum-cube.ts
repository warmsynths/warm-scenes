import * as THREE from 'three';

const vertexShader = `
    varying vec2 vUv;
    void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
`;

const fragmentShader = `
    uniform vec2 iResolution;
    uniform float iTime;
    uniform vec3 uCamPos;
    
    // GUI Parameters
    uniform bool uAutoRotate;
    uniform float uRotX;
    uniform float uRotY;
    uniform float uFractalSpeed;
    uniform float uMorphSpeed;
    uniform float uScaleFactor;
    uniform float uCubeSize;
    uniform float uEdgeGlow;
    
    // Colors
    uniform vec3 uColor1;
    uniform vec3 uColor2;
    uniform vec3 uColor3;

    varying vec2 vUv;

    mat2 rot2d(float angle) {
        float s = sin(angle), c = cos(angle);
        return mat2(c, -s, s, c);
    }

    float sdBox(vec3 p, vec3 b) {
        vec3 q = abs(p) - b;
        return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0);
    }

    float mapCube(vec3 p) {
        vec3 q = p;
        if(uAutoRotate) {
            q.xy *= rot2d(iTime * uRotX);
            q.yz *= rot2d(iTime * uRotY);
        }
        return sdBox(q, vec3(uCubeSize));
    }

    vec3 calcNormal(vec3 p) {
        vec2 e = vec2(0.001, 0.0);
        return normalize(vec3(
            mapCube(p + e.xyy) - mapCube(p - e.xyy),
            mapCube(p + e.yxy) - mapCube(p - e.yxy),
            mapCube(p + e.yyx) - mapCube(p - e.yyx)
        ));
    }

    vec3 calcCrystalFractal(vec3 p, vec3 cubeNormal) {
        vec3 q = p * 0.1; 
        
        if(uAutoRotate) {
            q.yz *= rot2d(-iTime * uRotY);
            q.xy *= rot2d(-iTime * uRotX);
        }
        
        q.xz *= rot2d(iTime * 0.08 * uFractalSpeed);
        q.yz *= rot2d(iTime * 0.05 * uFractalSpeed);
        
        float scaleFactor = 0.3;
        vec3 colorAccum = vec3(0.0);
        
        for(int i = 0; i < 8; i++) {
            vec3 morphOffset = vec3(0.14, 0.22, 0.14) + sin(iTime * 0.4 * uMorphSpeed + float(i) * 1.5) * 0.003;
            q = abs(q) - morphOffset;
            
            if (q.x < q.y) q.xy = q.yx;
            if (q.x < q.z) q.xz = q.zx;
            if (q.y < q.z) q.yz = q.zy;
            
            float angleShiftXY = sin(iTime * 0.3 * uMorphSpeed + float(i)) * 0.015;
            float angleShiftXZ = cos(iTime * 0.25 * uMorphSpeed - float(i)) * 0.015;
            
            q.xy *= rot2d(0.785 + float(i) * 0.02 + angleShiftXY);
            q.xz *= rot2d(0.35 + angleShiftXZ);
            
            q.x = q.x * 1.85 - 0.02;
            q.y = q.y * 1.85 - 0.08;
            q.z = q.z * 1.65 - 0.04;
            scaleFactor *= uScaleFactor; 
            
            float crystalEdge = smoothstep(0.12, 0.0, abs(max(q.x, max(q.y, q.z))) - 0.01);
            
            if (crystalEdge > 0.0) {
                vec3 crystalColor = vec3(0.0);
                if (i % 3 == 0)      crystalColor = uColor1; 
                else if (i % 3 == 1) crystalColor = uColor2;  
                else                 crystalColor = uColor3;  
                
                float staticHighlight = smoothstep(0.8, 1.0, sin(q.y * -6.5));
                crystalColor += vec3(4.6, 0.95, 0.9) * staticHighlight * 8.3;
                colorAccum += (crystalColor * crystalEdge) / scaleFactor;
            }
        }
    
        float coreRefraction = exp(-length(p) * 20.1) * 0.25;
        vec3 coreColor = vec3(0.0, 0.5, 1.0) * coreRefraction;
        
        vec3 pLocal = p;
        vec3 nLocal = cubeNormal;
        if(uAutoRotate) {
            pLocal.xy *= rot2d(iTime * uRotX);
            pLocal.yz *= rot2d(iTime * uRotY);
            
            nLocal.xy *= rot2d(iTime * uRotX);
            nLocal.yz *= rot2d(iTime * uRotY);
        }
        
        vec3 absN = abs(nLocal);
        float slice = pLocal.y;
        if (absN.y > absN.x && absN.y > absN.z) {
            slice = pLocal.x;
        }
        
        float staticScanlines = step(0.60, fract(slice * 65.9)) * -1.65 + 1.75;
        
        return (colorAccum * 79.1 + coreColor) * staticScanlines;
    }

    vec4 accumulateVolume(vec3 ro, vec3 rd, vec3 hitNormal) {
        vec3 accumulatedColor = vec3(0.0);
        float alpha = 0.0;
        float stepSize = 0.022;
        
        for(int j = 0; j < 23; j++) {
            vec3 p = ro + rd * (float(j) * stepSize);
            if (mapCube(p) > 0.01) break; 
            
            vec3 rChannel = calcCrystalFractal(p + vec3(0.022, 0.0, 0.0), hitNormal);
            vec3 gChannel = calcCrystalFractal(p, hitNormal);
            vec3 bChannel = calcCrystalFractal(p - vec3(0.022, 0.0, 0.0), hitNormal);
            
            vec3 crystalSample = vec3(rChannel.r, gChannel.g, bChannel.b);
            
            accumulatedColor += crystalSample * 0.065;
            alpha += 0.08;
            if(alpha >= 1.2) { alpha = 0.5; break; }
        }
        return vec4(accumulatedColor, alpha);
    }

    void main() {
        vec2 uv = (vUv - 0.5) * iResolution.xy / iResolution.y;
        
        vec3 ro = uCamPos;
        vec3 target = vec3(0.0, 0.0, 0.0);
        
        vec3 forward = normalize(target - ro);
        vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), forward));
        vec3 up = cross(forward, right);
        vec3 rd = normalize(forward + uv.x * right + uv.y * up);
        
        vec3 finalOutput = vec3(0.0); 
        float tCube = 0.6;
        bool hitCube = false;
        vec3 rayPosition;
        float alpha = 0.0;
        
        for(int i = 0; i < 80; i++) {
            rayPosition = ro + rd * tCube;
            float distanceToScene = mapCube(rayPosition);
            if(distanceToScene < 0.001) {
                hitCube = true;
                break;
            }
            tCube += distanceToScene;
            if(tCube >= 10.0) break;
        }
        
        if (hitCube) {
            alpha = 1.0;
            vec3 normal = calcNormal(rayPosition);
            vec3 lightDirection = normalize(vec3(2.0, 4.0, -3.0));
            
            vec3 qEdge = rayPosition;
            if(uAutoRotate) {
                qEdge.xy *= rot2d(iTime * uRotX);
                qEdge.yz *= rot2d(iTime * uRotY);
            }
            vec3 distanceToEdge = smoothstep(uCubeSize - 0.03, uCubeSize - 0.003, abs(qEdge));
            float edgeMask = max(distanceToEdge.x * distanceToEdge.y, 
                             max(distanceToEdge.y * distanceToEdge.z, 
                                 distanceToEdge.z * distanceToEdge.x));
            edgeMask = clamp(edgeMask, 0.0, 1.0);
            
            vec3 reflectionDirection = reflect(rd, normal);
            float specularLight = pow(max(dot(reflectionDirection, lightDirection), 0.0), 40.4) * 0.4;
            float fresnelReflection = pow(1.0 - max(dot(normal, -rd), -0.5), 4.0);
            
            vec4 internalVolume = accumulateVolume(rayPosition + rd * 0.01, rd, normal);
            vec3 glassInterior = internalVolume.xyz; 
            
            vec3 edgeGlowColor = vec3(0.0, 1.75, 1.0) * edgeMask * uEdgeGlow; 
            
            finalOutput = glassInterior + edgeGlowColor + vec3(specularLight * 1.0);
            finalOutput = mix(finalOutput, vec3(0.2, 0.65, 1.0), fresnelReflection * 0.45);
        } else {
            gl_FragColor = vec4(0.0);
            return;
        }
        
        finalOutput = finalOutput / (finalOutput + vec3(1.0)); 
        finalOutput = pow(finalOutput, vec3(0.4545)); 
        
        gl_FragColor = vec4(finalOutput, alpha);
    }
`;

function hexToVec3(hex: string) {
    const color = new THREE.Color(hex);
    return new THREE.Vector3(color.r, color.g, color.b);
}

export class QuantumCube {
    public sprite: THREE.Sprite;
    private renderTarget: THREE.WebGLRenderTarget;
    private material: THREE.ShaderMaterial;
    private scene: THREE.Scene;
    private orthoCamera: THREE.OrthographicCamera;
    private clock: THREE.Clock;
    
    private params = {
        autoRotate: true,
        rotSpeedX: 0.15,
        rotSpeedY: 0.25,
        fractalSpeed: 1.0,
        morphSpeed: 1.0,
        scaleFactor: 2.13, 
        cubeSize: 0.40,   
        edgeGlow: 0.0,
        color1: '#0055ff', 
        color2: '#3355ff', 
        color3: '#ff9900'  
    };

    constructor() {
        this.clock = new THREE.Clock();
        
        // 1. Create RenderTarget with alpha channel for transparency
        this.renderTarget = new THREE.WebGLRenderTarget(512, 512, {
            minFilter: THREE.LinearFilter,
            magFilter: THREE.LinearFilter,
            format: THREE.RGBAFormat,
        });

        // 2. Setup Off-screen Scene
        this.scene = new THREE.Scene();
        this.orthoCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
        
        this.material = new THREE.ShaderMaterial({
            vertexShader: vertexShader,
            fragmentShader: fragmentShader,
            transparent: true,
            uniforms: {
                iResolution: { value: new THREE.Vector2(512, 512) },
                iTime: { value: 0.0 },
                uCamPos: { value: new THREE.Vector3() },
                
                uAutoRotate: { value: this.params.autoRotate },
                uRotX: { value: this.params.rotSpeedX },
                uRotY: { value: this.params.rotSpeedY },
                
                uFractalSpeed: { value: this.params.fractalSpeed },
                uMorphSpeed: { value: this.params.morphSpeed },
                uScaleFactor: { value: this.params.scaleFactor },
                uCubeSize: { value: this.params.cubeSize },
                uEdgeGlow: { value: this.params.edgeGlow },
                
                uColor1: { value: hexToVec3(this.params.color1) },
                uColor2: { value: hexToVec3(this.params.color2) },
                uColor3: { value: hexToVec3(this.params.color3) },
            }
        });

        const plane = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
        this.scene.add(plane);

        // 3. Create Sprite for main scene
        const spriteMat = new THREE.SpriteMaterial({ 
            map: this.renderTarget.texture,
            transparent: true,
            depthWrite: false,
            alphaTest: 0.1
        });
        this.sprite = new THREE.Sprite(spriteMat);
        
        // Size it a bit bigger than a rubix cube (Rubik's cube is ~57mm).
        // Our units are MM_TO_UNITS (0.018). 80mm * 0.018 = ~1.44
        // The render target will contain the isometric raymarched cube, which takes up 
        // a fraction of the 512x512 texture, so we scale the sprite to match visually.
        this.sprite.scale.set(2.5, 2.5, 1);
    }

    public update(renderer: THREE.WebGLRenderer, mainCamera: THREE.Camera) {
        const time = this.clock.getElapsedTime();
        this.material.uniforms.iTime.value = time;
        
        // Match the shader's camera to the main scene's camera perspective
        const cubeWorldPos = new THREE.Vector3();
        this.sprite.getWorldPosition(cubeWorldPos);
        
        const camDir = new THREE.Vector3().subVectors(mainCamera.position, cubeWorldPos).normalize();
        
        // Apply the inverted horizontal azimuth logic from original code
        const startAzimuth = Math.atan2(1.3, -1.6); 
        const currentAzimuth = Math.atan2(camDir.x, camDir.z);
        const delta = currentAzimuth - startAzimuth;
        const invertedAzimuth = startAzimuth - delta;
        
        const radius = 2.5; // Scale the normalized vector to the shader's expected distance
        const shaderCamX = Math.sin(invertedAzimuth) * radius;
        const shaderCamZ = Math.cos(invertedAzimuth) * radius;
        const shaderCamY = camDir.y * radius;
        
        this.material.uniforms.uCamPos.value.set(shaderCamX, shaderCamY, shaderCamZ);

        // Render to target
        const currentRenderTarget = renderer.getRenderTarget();
        const currentClearAlpha = renderer.getClearAlpha();
        const currentClearColor = renderer.getClearColor(new THREE.Color());
        
        renderer.setRenderTarget(this.renderTarget);
        renderer.setClearColor(0x000000, 0); // Transparent clear
        renderer.clear();
        renderer.render(this.scene, this.orthoCamera);
        
        renderer.setRenderTarget(currentRenderTarget);
        renderer.setClearColor(currentClearColor, currentClearAlpha);
    }
}
