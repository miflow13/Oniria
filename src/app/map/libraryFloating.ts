import * as THREE from 'three'

export type FloatingPropOptions = {
  phase: number
  hoverAmplitude: number
  hoverSpeed: number
  tiltX?: number
  tiltY?: number
  tiltZ?: number
  driftX?: number
  driftZ?: number
}

type FloatingProp = FloatingPropOptions & {
  object: THREE.Object3D
  baseX: number
  baseY: number
  baseZ: number
  baseRotationX: number
  baseRotationY: number
  baseRotationZ: number
}

export type FloatingPropRegistry = {
  register: (
    object: THREE.Object3D,
    options: FloatingPropOptions,
  ) => void
  update: (elapsed: number) => void
  clear: () => void
}

export function floatingPhase(id: string) {
  let hash = 2166136261
  for (let index = 0; index < id.length; index += 1) {
    hash ^= id.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return ((hash >>> 0) / 4294967295) * Math.PI * 2
}

export function createFloatingPropRegistry(): FloatingPropRegistry {
  const props: FloatingProp[] = []

  return {
    register(object, options) {
      props.push({
        object,
        ...options,
        baseX: object.position.x,
        baseY: object.position.y,
        baseZ: object.position.z,
        baseRotationX: object.rotation.x,
        baseRotationY: object.rotation.y,
        baseRotationZ: object.rotation.z,
      })
    },
    update(elapsed) {
      for (const prop of props) {
        const wave = elapsed * prop.hoverSpeed + prop.phase
        const driftWaveX =
          Math.sin(wave * .29 + prop.phase * .61 + .7)
        const driftWaveZ =
          Math.cos(wave * .23 + prop.phase * .83 + 1.4)
        prop.object.position.set(
          prop.baseX + driftWaveX * (prop.driftX ?? 0),
          prop.baseY + Math.sin(wave) * prop.hoverAmplitude,
          prop.baseZ + driftWaveZ * (prop.driftZ ?? 0),
        )
        prop.object.rotation.set(
          prop.baseRotationX +
            Math.sin(wave * .41 + prop.phase * .37) *
              (prop.tiltX ?? 0),
          prop.baseRotationY +
            Math.sin(wave * .19 + prop.phase * .73 + 1.2) *
              (prop.tiltY ?? 0),
          prop.baseRotationZ +
            Math.cos(wave * .33 + prop.phase * .51 + 1.7) *
              (prop.tiltZ ?? 0),
        )
      }
    },
    clear() {
      props.length = 0
    },
  }
}
