import * as THREE from 'three'

export type FloatingPropOptions = {
  phase: number
  hoverAmplitude: number
  hoverSpeed: number
  secondaryHoverAmplitude?: number
  secondaryHoverSpeed?: number
  tiltX?: number
  tiltY?: number
  tiltZ?: number
  driftX?: number
  driftZ?: number
  driftSide?: number
  driftForward?: number
  driftSpeedX?: number
  driftSpeedZ?: number
  driftSpeedSide?: number
  driftSpeedForward?: number
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
  update: (
    elapsed: number,
    viewerPosition?: THREE.Vector3,
  ) => void
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
  let updateFrame = 0

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
    update(elapsed, viewerPosition) {
      updateFrame += 1
      for (const prop of props) {
        // Nearby props retain full-rate motion. Distant zero-gravity dressing
        // is updated less often because sub-frame movement is imperceptible
        // at that distance. Motion is still derived from absolute elapsed
        // time, so throttled props never accumulate timing drift.
        if (viewerPosition) {
          const dx = prop.baseX - viewerPosition.x
          const dy = prop.baseY - viewerPosition.y
          const dz = prop.baseZ - viewerPosition.z
          const distanceSq = dx * dx + dy * dy + dz * dz
          const stride =
            distanceSq > 42 * 42
              ? 6
              : distanceSq > 24 * 24
                ? 3
                : 1
          if (stride > 1 && updateFrame % stride !== 0) {
            continue
          }
        }

        const wave = elapsed * prop.hoverSpeed + prop.phase
        const secondaryHover =
          Math.sin(
            elapsed *
              (prop.secondaryHoverSpeed ??
                prop.hoverSpeed * 1.73) +
              prop.phase * 1.31,
          ) * (prop.secondaryHoverAmplitude ?? 0)

        const driftWaveX = Math.sin(
          elapsed *
            (prop.driftSpeedX ??
              Math.max(.01, prop.hoverSpeed * .29)) +
            prop.phase * .61 +
            .7,
        )
        const driftWaveZ = Math.cos(
          elapsed *
            (prop.driftSpeedZ ??
              Math.max(.01, prop.hoverSpeed * .23)) +
            prop.phase * .83 +
            1.4,
        )

        const sideWave = Math.sin(
          elapsed *
            (prop.driftSpeedSide ??
              Math.max(.01, prop.hoverSpeed * .31)) +
            prop.phase * .47 +
            .35,
        )
        const forwardWave = Math.cos(
          elapsed *
            (prop.driftSpeedForward ??
              Math.max(.01, prop.hoverSpeed * .21)) +
            prop.phase * .79 +
            1.05,
        )

        // Local side/forward drift follows the object's authored yaw. This is
        // especially useful for wall-bound shelves: they can slide gently
        // along a wall without drifting through it.
        const sideX = Math.cos(prop.baseRotationY)
        const sideZ = -Math.sin(prop.baseRotationY)
        const forwardX = -Math.sin(prop.baseRotationY)
        const forwardZ = -Math.cos(prop.baseRotationY)
        const localDriftX =
          sideX * sideWave * (prop.driftSide ?? 0) +
          forwardX *
            forwardWave *
            (prop.driftForward ?? 0)
        const localDriftZ =
          sideZ * sideWave * (prop.driftSide ?? 0) +
          forwardZ *
            forwardWave *
            (prop.driftForward ?? 0)

        prop.object.position.set(
          prop.baseX +
            driftWaveX * (prop.driftX ?? 0) +
            localDriftX,
          prop.baseY +
            Math.sin(wave) * prop.hoverAmplitude +
            secondaryHover,
          prop.baseZ +
            driftWaveZ * (prop.driftZ ?? 0) +
            localDriftZ,
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
      updateFrame = 0
    },
  }
}
