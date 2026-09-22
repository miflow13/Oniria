import * as THREE from 'three'
import type {SymbolCategory} from '@/types/dream'

const CATEGORY_FLOW: Record<SymbolCategory, number> = {
  person: 0.78,
  place: 0.44,
  object: 0.28,
  feeling: 1.0,
  action: 1.22,
}

export type LivingOrbMaterial = THREE.ShaderMaterial & {
  uniforms: {
    uTime: {value: number}
    uColor: {value: THREE.Color}
    uGlow: {value: THREE.Color}
    uOpacity: {value: number}
    uPulse: {value: number}
    uFocus: {value: number}
    uFlow: {value: number}
  }
}

export function createLivingOrbMaterial(
  color: THREE.Color,
  category: SymbolCategory,
): LivingOrbMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.FrontSide,
    blending: THREE.NormalBlending,
    uniforms: {
      uTime: {value: 0},
      uColor: {value: color.clone()},
      uGlow: {value: color.clone().lerp(new THREE.Color(0xffffff), 0.34)},
      uOpacity: {value: 0.9},
      uPulse: {value: 0},
      uFocus: {value: 0},
      uFlow: {value: CATEGORY_FLOW[category]},
    },
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vWorldPosition;
      varying vec3 vViewDir;
      varying vec3 vLocalPosition;

      void main() {
        vLocalPosition = position;
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPosition.xyz;
        vNormal = normalize(normalMatrix * normal);

        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        vViewDir = normalize(-mvPosition.xyz);
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform vec3 uColor;
      uniform vec3 uGlow;
      uniform float uOpacity;
      uniform float uPulse;
      uniform float uFocus;
      uniform float uFlow;

      varying vec3 vNormal;
      varying vec3 vWorldPosition;
      varying vec3 vViewDir;
      varying vec3 vLocalPosition;

      float hash(vec3 p) {
        p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3));
        p *= 17.0;
        return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
      }

      float noise(vec3 p) {
        vec3 i = floor(p);
        vec3 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);

        return mix(
          mix(
            mix(hash(i + vec3(0.0,0.0,0.0)), hash(i + vec3(1.0,0.0,0.0)), f.x),
            mix(hash(i + vec3(0.0,1.0,0.0)), hash(i + vec3(1.0,1.0,0.0)), f.x),
            f.y
          ),
          mix(
            mix(hash(i + vec3(0.0,0.0,1.0)), hash(i + vec3(1.0,0.0,1.0)), f.x),
            mix(hash(i + vec3(0.0,1.0,1.0)), hash(i + vec3(1.0,1.0,1.0)), f.x),
            f.y
          ),
          f.z
        );
      }

      float fbm(vec3 p) {
        float value = 0.0;
        float amplitude = 0.5;
        for (int i = 0; i < 4; i++) {
          value += amplitude * noise(p);
          p = p * 2.03 + vec3(1.7, 2.1, 0.8);
          amplitude *= 0.5;
        }
        return value;
      }

      void main() {
        vec3 normal = normalize(vNormal);
        vec3 viewDir = normalize(vViewDir);

        float fresnel = pow(1.0 - max(dot(normal, viewDir), 0.0), 3.0);

        vec3 flowA = vLocalPosition * 2.2;
        flowA.y += uTime * 0.24 * uFlow;
        flowA.z -= uTime * 0.14 * uFlow;

        vec3 flowB = vWorldPosition * 0.72;
        flowB.x -= uTime * 0.1 * uFlow;
        flowB.y += uTime * 0.06 * uFlow;

        float innerNoise = fbm(flowA);
        float deepNoise = fbm(flowB + innerNoise * 1.5);
        float ribbons = smoothstep(0.48, 0.82, innerNoise * 0.62 + deepNoise * 0.55);

        float equator = 1.0 - abs(normal.y);
        float aurora = smoothstep(0.15, 0.95, equator * deepNoise);

        vec3 deepColor = uColor * (0.16 + innerNoise * 0.28);
        vec3 bodyColor = mix(deepColor, uColor * 0.88, ribbons);
        bodyColor += uColor * aurora * 0.4;

        float focusGlow = 1.0 + uFocus * 0.54 + uPulse * 0.24;
        vec3 rimColor = uGlow * fresnel * 1.12 * focusGlow;
        vec3 coreLight = uGlow * pow(max(0.0, 1.0 - length(vLocalPosition) * 0.92), 2.2);
        coreLight *= 0.13 + uFocus * 0.1;

        float sparkle = smoothstep(0.91, 0.985, noise(vLocalPosition * 18.0 + uTime * 0.2));
        vec3 sparkleColor = vec3(1.0) * sparkle * (0.07 + uFocus * 0.1);

        vec3 finalColor = bodyColor + rimColor + coreLight + sparkleColor;

        float alpha = uOpacity;
        alpha *= 0.48 + fresnel * 0.38 + ribbons * 0.22;
        alpha += uFocus * 0.045;

        gl_FragColor = vec4(finalColor, clamp(alpha, 0.0, 1.0));
      }
    `,
  }) as LivingOrbMaterial
}
