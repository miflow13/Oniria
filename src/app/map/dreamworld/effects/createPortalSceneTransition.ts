import * as THREE from 'three'

export type PortalSceneTransition = {
  render: (
    renderer: THREE.WebGLRenderer,
    sourceScene: THREE.Scene,
    sourceCamera: THREE.Camera,
    destinationScene: THREE.Scene,
    destinationCamera: THREE.Camera,
    progress: number,
    time: number,
  ) => void
  resize: (width: number, height: number) => void
  dispose: () => void
}

export function createPortalSceneTransition(
  width: number,
  height: number,
): PortalSceneTransition {
  const sourceTarget = new THREE.WebGLRenderTarget(width, height, {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    format: THREE.RGBAFormat,
    depthBuffer: true,
  })
  const destinationTarget = sourceTarget.clone()

  const scene = new THREE.Scene()
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)

  const material = new THREE.ShaderMaterial({
    depthWrite: false,
    depthTest: false,
    uniforms: {
      tSource: {value: sourceTarget.texture},
      tDestination: {value: destinationTarget.texture},
      uProgress: {value: 0},
      uTime: {value: 0},
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position.xy, 0.0, 1.0);
      }
    `,
    fragmentShader: `
      uniform sampler2D tSource;
      uniform sampler2D tDestination;
      uniform float uProgress;
      uniform float uTime;
      varying vec2 vUv;

      float ease(float t) {
        return t * t * (3.0 - 2.0 * t);
      }

      void main() {
        float p = ease(clamp(uProgress, 0.0, 1.0));
        vec2 centered = vUv - 0.5;
        float radius = length(centered);
        float lens = smoothstep(0.72, 0.05, radius);

        float bend = sin(radius * 18.0 - uTime * 2.2) * 0.004;
        vec2 direction = normalize(centered + vec2(0.0001));
        vec2 sourceUv = vUv + direction * bend * p;
        vec2 destUv = vUv - direction * bend * (1.0 - p);

        vec4 source = texture2D(tSource, sourceUv);
        vec4 destination = texture2D(tDestination, destUv);

        float revealRadius = mix(-0.15, 0.92, p);
        float portal =
          1.0 - smoothstep(
            revealRadius,
            revealRadius + 0.15,
            radius
          );

        float chroma = (1.0 - abs(p * 2.0 - 1.0)) * 0.0018;
        float red = texture2D(
          tDestination,
          destUv + direction * chroma
        ).r;
        float blue = texture2D(
          tDestination,
          destUv - direction * chroma
        ).b;
        destination.rgb = vec3(red, destination.g, blue);

        vec3 color = mix(source.rgb, destination.rgb, portal);
        float edgeGlow =
          exp(-abs(radius - (0.78 - p * 0.7)) * 32.0) *
          (1.0 - abs(p * 2.0 - 1.0));
        color += vec3(0.08, 0.14, 0.17) * edgeGlow;

        gl_FragColor = vec4(color, 1.0);
      }
    `,
  })

  const geometry = new THREE.PlaneGeometry(2, 2)
  scene.add(new THREE.Mesh(geometry, material))

  return {
    render: (
      renderer,
      sourceScene,
      sourceCamera,
      destinationScene,
      destinationCamera,
      progress,
      time,
    ) => {
      const previousTarget = renderer.getRenderTarget()

      renderer.setRenderTarget(sourceTarget)
      renderer.clear(true, true, true)
      renderer.render(sourceScene, sourceCamera)

      renderer.setRenderTarget(destinationTarget)
      renderer.clear(true, true, true)
      renderer.render(destinationScene, destinationCamera)

      renderer.setRenderTarget(previousTarget)
      material.uniforms.uProgress.value = progress
      material.uniforms.uTime.value = time
      renderer.render(scene, camera)
    },
    resize: (nextWidth, nextHeight) => {
      sourceTarget.setSize(nextWidth, nextHeight)
      destinationTarget.setSize(nextWidth, nextHeight)
    },
    dispose: () => {
      sourceTarget.dispose()
      destinationTarget.dispose()
      geometry.dispose()
      material.dispose()
    },
  }
}
