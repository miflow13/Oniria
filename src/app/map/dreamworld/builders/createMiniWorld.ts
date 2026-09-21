import * as THREE from 'three'
import type {SymbolCategory} from '@/types/dream'
import type {DreamQualitySettings} from '../quality'

export type MiniWorld = {
  group: THREE.Group
  update: (time: number, focus: number) => void
  dispose: () => void
}

function glowMaterial(color: THREE.Color, opacity = 0.5) {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  })
}

function standardMaterial(color: THREE.Color, opacity = 0.6) {
  return new THREE.MeshStandardMaterial({
    color,
    emissive: color.clone().multiplyScalar(0.35),
    emissiveIntensity: 0.8,
    roughness: 0.52,
    metalness: 0.08,
    transparent: true,
    opacity,
  })
}

export function createMiniWorld(
  category: SymbolCategory,
  color: THREE.Color,
  settings: DreamQualitySettings,
  seed = 1,
): MiniWorld {
  const group = new THREE.Group()
  group.scale.setScalar(0.62)
  const disposables: Array<THREE.BufferGeometry | THREE.Material> = []

  const addMesh = (geometry: THREE.BufferGeometry, material: THREE.Material) => {
    disposables.push(geometry, material)
    const mesh = new THREE.Mesh(geometry, material)
    group.add(mesh)
    return mesh
  }

  const phase = (seed % 997) / 997 * Math.PI * 2
  const detail = settings.miniWorldDetail

  if (detail === 0) {
    const core = addMesh(
      new THREE.IcosahedronGeometry(0.22, 1),
      glowMaterial(color, 0.44),
    )

    return {
      group,
      update: (time, focus) => {
        core.rotation.x = time * 0.28
        core.rotation.y = time * 0.36
        core.scale.setScalar(1 + Math.sin(time * 0.9 + phase) * 0.08 + focus * 0.1)
      },
      dispose: () => disposables.forEach((item) => item.dispose()),
    }
  }

  if (category === 'place') {
    const water = addMesh(
      new THREE.CircleGeometry(0.34, 40),
      new THREE.MeshPhysicalMaterial({
        color: color.clone().multiplyScalar(0.62),
        emissive: color.clone().multiplyScalar(0.12),
        emissiveIntensity: 0.6,
        roughness: 0.18,
        metalness: 0.04,
        transparent: true,
        opacity: 0.54,
        transmission: 0.45,
        side: THREE.DoubleSide,
      }),
    )
    water.rotation.x = Math.PI / 2
    water.position.y = -0.17

    const arch = addMesh(
      new THREE.TorusGeometry(0.21, 0.025, 8, 34, Math.PI),
      glowMaterial(color, 0.62),
    )
    arch.rotation.z = Math.PI
    arch.position.y = -0.02

    const moon = addMesh(
      new THREE.SphereGeometry(0.07, 18, 18),
      glowMaterial(color.clone().lerp(new THREE.Color(0xffffff), 0.6), 0.86),
    )
    moon.position.set(0.18, 0.18, -0.05)

    return {
      group,
      update: (time, focus) => {
        water.rotation.z = time * 0.08
        arch.rotation.y = Math.sin(time * 0.3 + phase) * 0.15
        moon.position.y = 0.18 + Math.sin(time * 0.55 + phase) * 0.035
        moon.scale.setScalar(1 + focus * 0.15)
      },
      dispose: () => disposables.forEach((item) => item.dispose()),
    }
  }

  if (category === 'person') {
    const silhouette = addMesh(
      new THREE.CapsuleGeometry(0.08, 0.22, 6, 10),
      standardMaterial(color, 0.52),
    )
    silhouette.position.y = -0.03

    const halo = addMesh(
      new THREE.TorusGeometry(0.25, 0.012, 8, 48),
      glowMaterial(color, 0.48),
    )
    halo.rotation.x = Math.PI / 2

    return {
      group,
      update: (time, focus) => {
        silhouette.rotation.y = time * 0.18
        halo.rotation.z = time * 0.14
        halo.scale.setScalar(1 + Math.sin(time * 0.8 + phase) * 0.06 + focus * 0.12)
      },
      dispose: () => disposables.forEach((item) => item.dispose()),
    }
  }

  if (category === 'object') {
    const crystal = addMesh(
      new THREE.OctahedronGeometry(0.23, 0),
      standardMaterial(color, 0.72),
    )
    const ring = addMesh(
      new THREE.TorusGeometry(0.29, 0.009, 6, 46),
      glowMaterial(color, 0.42),
    )
    ring.rotation.x = Math.PI / 2.7

    return {
      group,
      update: (time, focus) => {
        crystal.rotation.x = time * 0.34
        crystal.rotation.y = -time * 0.48
        ring.rotation.z = time * 0.22
        crystal.scale.setScalar(1 + focus * 0.14)
      },
      dispose: () => disposables.forEach((item) => item.dispose()),
    }
  }

  if (category === 'feeling') {
    const cloud = addMesh(
      new THREE.IcosahedronGeometry(0.3, 3),
      glowMaterial(color, 0.17),
    )
    const inner = addMesh(
      new THREE.SphereGeometry(0.13, 24, 24),
      glowMaterial(color.clone().lerp(new THREE.Color(0xffffff), 0.35), 0.55),
    )

    return {
      group,
      update: (time, focus) => {
        cloud.rotation.y = time * 0.12
        cloud.rotation.z = Math.sin(time * 0.23 + phase) * 0.18
        cloud.scale.set(
          1 + Math.sin(time * 0.72 + phase) * 0.12,
          0.88 + Math.cos(time * 0.58 + phase) * 0.08,
          1.04 + Math.sin(time * 0.64 + phase) * 0.1,
        )
        inner.scale.setScalar(1 + Math.sin(time * 1.05 + phase) * 0.08 + focus * 0.16)
      },
      dispose: () => disposables.forEach((item) => item.dispose()),
    }
  }

  const streaks: THREE.Mesh[] = []
  for (let index = 0; index < (detail === 2 ? 5 : 3); index += 1) {
    const streak = addMesh(
      new THREE.CylinderGeometry(0.008, 0.008, 0.24 + index * 0.025, 6),
      glowMaterial(color, 0.42),
    )
    streak.position.set(
      ((index % 2) - 0.5) * 0.22,
      (index - 2) * 0.08,
      (index % 3 - 1) * 0.06,
    )
    streak.rotation.z = 0.7 + index * 0.22
    streaks.push(streak)
  }

  return {
    group,
    update: (time, focus) => {
      streaks.forEach((streak, index) => {
        streak.position.y =
          ((time * 0.18 + index * 0.16 + phase) % 0.7) - 0.35
        streak.material = streak.material
        streak.scale.y = 1 + focus * 0.22
      })
    },
    dispose: () => disposables.forEach((item) => item.dispose()),
  }
}
