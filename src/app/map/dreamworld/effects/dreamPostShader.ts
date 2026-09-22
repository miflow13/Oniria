import * as THREE from 'three'

export const DreamPostShader = {
  uniforms: {
    tDiffuse: {value: null},
    uTime: {value: 0},
    uIntensity: {value: 0.45},
    uTravel: {value: 0},
    uCinematic: {value: 0},
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uIntensity;
    uniform float uTravel;
    uniform float uCinematic;
    varying vec2 vUv;

    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
    }

    void main() {
      vec2 centered = vUv - 0.5;
      float radius = length(centered);
      float aberration = (0.00045 + uTravel * 0.0014) * uCinematic * smoothstep(0.15, 0.75, radius);

      vec2 direction = normalize(centered + vec2(0.00001));
      vec4 base = texture2D(tDiffuse, vUv);
      float red = texture2D(tDiffuse, vUv + direction * aberration).r;
      float blue = texture2D(tDiffuse, vUv - direction * aberration).b;

      vec3 color = vec3(red, base.g, blue);
      float vignette = 1.0 - smoothstep(0.24, 0.92, radius);
      color *= mix(1.0, vignette, 0.17 * uIntensity);

      float grain = hash(vUv * vec2(1920.0, 1080.0) + uTime * 37.0) - 0.5;
      color += grain * 0.018 * uCinematic * uIntensity;

      float streak = pow(max(0.0, 1.0 - abs(centered.y * 2.5)), 18.0);
      streak *= pow(max(0.0, 1.0 - abs(centered.x * 1.15)), 4.0);
      color += vec3(0.05, 0.08, 0.12) * streak * uTravel * 0.18;

      gl_FragColor = vec4(color, base.a);
    }
  `,
}
