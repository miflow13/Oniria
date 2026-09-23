import * as THREE from 'three'
import type {
  LibraryAtmosphere,
  LibraryDistrictConfig,
} from '@/lib/libraryWorldConfig'
import type {DreamQuality} from './dreamworld/quality'
import {
  CITY_GROUND_Y,
  cityDistrictBlock,
} from './libraryCityLayout'

type NebulaTextureFactory = (color: string) => THREE.Texture
type SeededUnit = (seed: number, salt: number) => number

type CreateLibraryAtmosphereArgs = {
  world: THREE.Group
  farWorld: THREE.Group
  quality: DreamQuality
  createNebulaTexture: NebulaTextureFactory
  seededUnit: SeededUnit
}

type LibraryAtmosphereUpdate = {
  elapsed: number
  camera: THREE.Camera
  districts: Pick<
    LibraryDistrictConfig,
    'id' | 'bay' | 'accent' | 'atmosphere'
  >[]
}

export type LibraryAtmosphereController = {
  update: (state: LibraryAtmosphereUpdate) => void
  dispose: () => void
}

export type LibraryAtmosphereVisualPreset = {
  background: number
  fog: number
  fogScale: number
  hazeStrength: number
  lightStrength: number
  tint: number
  exposureScale: number
  bloomScale: number
}

export function getLibraryAtmosphereVisualPreset(
  atmosphere: LibraryAtmosphere,
): LibraryAtmosphereVisualPreset {
  switch (atmosphere) {
    case 'crystalline':
      return {
        background: 0x02131b,
        fog: 0x0b5261,
        fogScale: .8,
        hazeStrength: 2.05,
        lightStrength: 1.8,
        tint: 0x72efff,
        exposureScale: 1.06,
        bloomScale: 1.28,
      }
    case 'industrial':
      return {
        background: 0x090d0f,
        fog: 0x2b3537,
        fogScale: 1.16,
        hazeStrength: 1.5,
        lightStrength: .82,
        tint: 0x91a9a8,
        exposureScale: .84,
        bloomScale: .7,
      }
    case 'deep-void':
      return {
        background: 0x010005,
        fog: 0x230a35,
        fogScale: 1.58,
        hazeStrength: 2.35,
        lightStrength: .42,
        tint: 0x7547c7,
        exposureScale: .72,
        bloomScale: .86,
      }
    case 'dream-archive':
    default:
      return {
        background: 0x100619,
        fog: 0x45143f,
        fogScale: 1.02,
        hazeStrength: 1.35,
        lightStrength: 1.12,
        tint: 0xd782e8,
        exposureScale: .96,
        bloomScale: 1,
      }
  }
}

export function createLibraryAtmosphere({
  world,
  farWorld,
  quality,
  createNebulaTexture,
  seededUnit,
}: CreateLibraryAtmosphereArgs): LibraryAtmosphereController {
  const hazeGeometry = new THREE.PlaneGeometry(1, 1)
  const hazeTextures: THREE.Texture[] = []
  const hazeMaterials: THREE.MeshBasicMaterial[] = []
  const hazePlanes: THREE.Mesh[] = []

  const hazeSpecs = [
    {
      color: 'rgba(61, 127, 158, 0.34)',
      position: [-34, 10, -12] as const,
      scale: [86, 42] as const,
      opacity: .032,
      rotation: -.035,
    },
    {
      color: 'rgba(112, 78, 172, 0.35)',
      position: [12, 5, -34] as const,
      scale: [92, 48] as const,
      opacity: .035,
      rotation: .04,
    },
    {
      color: 'rgba(58, 122, 142, 0.30)',
      position: [38, 12, -54] as const,
      scale: [96, 52] as const,
      opacity: .028,
      rotation: -.02,
    },
  ]

  hazeSpecs.forEach((spec, index) => {
    const texture = createNebulaTexture(spec.color)
    const material = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      opacity: spec.opacity,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.NormalBlending,
      toneMapped: true,
    })
    const plane = new THREE.Mesh(hazeGeometry, material)

    plane.position.set(
      spec.position[0],
      spec.position[1],
      spec.position[2],
    )
    plane.scale.set(spec.scale[0], spec.scale[1], 1)
    plane.rotation.z = spec.rotation
    plane.userData.baseX = spec.position[0]
    plane.userData.baseY = spec.position[1]
    plane.userData.baseOpacity = spec.opacity
    plane.userData.hazePhase = index * 1.73
    plane.renderOrder = -4

    farWorld.add(plane)
    hazeTextures.push(texture)
    hazeMaterials.push(material)
    hazePlanes.push(plane)
  })

  const archiveFogTextures: THREE.Texture[] = []
  const archiveFogMaterials: THREE.SpriteMaterial[] = []
  const archiveFog: THREE.Sprite[] = []
  const localHaze: THREE.Sprite[] = []

  const fogTextureColors = [
    'rgba(224, 92, 188, 0.34)',
    'rgba(170, 91, 214, 0.32)',
    'rgba(235, 119, 179, 0.28)',
    'rgba(124, 104, 205, 0.27)',
    'rgba(83, 205, 220, 0.24)',
    'rgba(118, 126, 232, 0.23)',
  ]

  const fogTextures = fogTextureColors.map((color) => {
    const texture = createNebulaTexture(color)
    archiveFogTextures.push(texture)
    return texture
  })

  const fogMaterials = fogTextures.map((texture, index) => {
    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      opacity:
        index === 0
          ? .038
          : index === 1
            ? .034
            : index === 2
              ? .03
              : .026,
      depthWrite: false,
      blending: THREE.NormalBlending,
      toneMapped: true,
    })
    archiveFogMaterials.push(material)
    return material
  })

  const fogBankCount =
    quality === 'cinematic'
      ? 34
      : quality === 'high'
        ? 26
        : quality === 'medium'
          ? 20
          : 12

  for (let index = 0; index < fogBankCount; index += 1) {
    const seed = index + 701
    const x =
      -35 + seededUnit(seed, 3) * 76
    const z =
      14 - seededUnit(seed, 4) * 76
    const phase = index * 1.37

    const sprite = new THREE.Sprite(
      fogMaterials[index % fogMaterials.length],
    )
    sprite.position.set(
      x,
      CITY_GROUND_Y +
        2 +
        (seededUnit(seed, 5) - .5) * 8,
      z,
    )

    const width = 22 + seededUnit(seed, 6) * 18
    const height = 10 + seededUnit(seed, 7) * 8
    sprite.scale.set(width, height, 1)
    sprite.userData.baseX = sprite.position.x
    sprite.userData.baseY = sprite.position.y
    sprite.userData.baseZ = sprite.position.z
    sprite.userData.archiveFogPhase = phase
    sprite.userData.archiveFogBaseOpacity =
      index % 4 === 0
        ? .038
        : index % 4 === 1
          ? .033
          : index % 4 === 2
            ? .029
            : .025
    sprite.renderOrder = -1

    world.add(sprite)
    archiveFog.push(sprite)
  }

  const localOffsets = [
    [-7, -4],
    [7, -5],
    [-10, -11],
    [10, -12],
    [-5, -18],
    [5, -19],
    [-12, 4],
    [12, 3],
  ] as const

  localOffsets.forEach(([offsetX, offsetZ], index) => {
    const material = new THREE.SpriteMaterial({
      map: fogTextures[index % fogTextures.length],
      transparent: true,
      opacity: .03,
      depthWrite: false,
      blending: THREE.NormalBlending,
      toneMapped: true,
    })
    archiveFogMaterials.push(material)

    const sprite = new THREE.Sprite(material)
    sprite.userData.localOffsetX = offsetX
    sprite.userData.localOffsetZ = offsetZ
    sprite.userData.localHazePhase = index * 1.27
    sprite.position.set(
      offsetX,
      CITY_GROUND_Y + 2,
      offsetZ,
    )
    sprite.scale.set(
      24 + (index % 3) * 5,
      12 + (index % 4) * 1.8,
      1,
    )
    sprite.renderOrder = -1

    world.add(sprite)
    localHaze.push(sprite)
  })

  const districtTint = new THREE.Color()
  const whiteTint = new THREE.Color(0xe8faff)
  const fallbackTint = new THREE.Color(0xb9b8ef)
  const districtLight = new THREE.PointLight(
    0xcaa2ff,
    0,
    28,
    2,
  )
  world.add(districtLight)
  let disposed = false

  return {
    update({elapsed, camera, districts}) {
      if (disposed) return

      hazePlanes.forEach((plane, index) => {
        const material =
          plane.material as THREE.MeshBasicMaterial
        const phase = plane.userData.hazePhase as number

        plane.position.x =
          (plane.userData.baseX as number) +
          Math.sin(elapsed * .018 + phase) *
            (1.4 + index * .35)
        plane.position.y =
          (plane.userData.baseY as number) +
          Math.cos(elapsed * .014 + phase) *
            (.65 + index * .22)
        material.opacity =
          (plane.userData.baseOpacity as number) *
          (.9 + Math.sin(elapsed * .032 + phase) * .1)
      })

      archiveFog.forEach((sprite, index) => {
        const phase =
          sprite.userData.archiveFogPhase as number

        sprite.position.x =
          (sprite.userData.baseX as number) +
          Math.sin(elapsed * .028 + phase) *
            (1 + (index % 3) * .18)
        sprite.position.y =
          (sprite.userData.baseY as number) +
          Math.cos(elapsed * .022 + phase) *
            (.42 + (index % 4) * .09)
        sprite.position.z =
          (sprite.userData.baseZ as number) +
          Math.sin(elapsed * .017 + phase) * .3

        const material =
          sprite.material as THREE.SpriteMaterial
        const baseOpacity =
          sprite.userData.archiveFogBaseOpacity as number
        const cameraDistance = sprite.position.distanceTo(
          camera.position,
        )
        const clearance = THREE.MathUtils.smoothstep(
          cameraDistance,
          4,
          13,
        )

        material.opacity =
          baseOpacity *
          (.88 + Math.sin(elapsed * .041 + phase) * .12) *
          (.24 + clearance * .76)
      })

      const nearest =
        districts.length > 0
          ? districts.reduce<{
              district: (typeof districts)[number]
              index: number
              distance: number
            } | null>((best, district, index) => {
              const block = cityDistrictBlock(
                district.id,
                index,
              )
              const distance = Math.hypot(
                camera.position.x - block.x,
                camera.position.z - block.z,
              )
              if (!best || distance < best.distance) {
                return {
                  district,
                  index,
                  distance,
                }
              }
              return best
            }, null)
          : null

      const nearestDistrict =
        nearest?.district ?? null
      let districtAtmosphereStrength = 1

      if (nearestDistrict && nearest) {
        const visualPreset =
          getLibraryAtmosphereVisualPreset(
            nearestDistrict.atmosphere,
          )

        districtTint
          .set(visualPreset.tint)
          .lerp(
            new THREE.Color(nearestDistrict.accent),
            nearestDistrict.atmosphere === 'industrial'
              ? .18
              : .28,
          )
          .lerp(
            whiteTint,
            nearestDistrict.atmosphere === 'crystalline'
              ? .16
              : 0,
          )

        districtAtmosphereStrength =
          visualPreset.hazeStrength

        const block = cityDistrictBlock(
          nearestDistrict.id,
          nearest.index,
        )
        districtLight.position.set(
          block.x,
          CITY_GROUND_Y +
            block.elevation +
            3.2,
          block.z,
        )
        districtLight.color.lerp(
          districtTint,
          .08,
        )

        const districtPresence =
          1 -
          THREE.MathUtils.smoothstep(
            nearest.distance,
            4,
            22,
          )

        districtLight.intensity +=
          (
            visualPreset.lightStrength *
              (.35 + districtPresence * .65) -
            districtLight.intensity
          ) *
          .085

        archiveFogMaterials.forEach((material) => {
          material.color.lerp(
            districtTint,
            .045,
          )
        })
        hazeMaterials.forEach((material) => {
          material.color.lerp(
            districtTint,
            .025,
          )
        })
      } else {
        districtTint.copy(fallbackTint)
        districtLight.intensity *= .92
      }

      localHaze.forEach((sprite, index) => {
        const phase =
          sprite.userData.localHazePhase as number
        const offsetX =
          sprite.userData.localOffsetX as number
        const offsetZ =
          sprite.userData.localOffsetZ as number

        const targetX =
          camera.position.x +
          offsetX +
          Math.sin(elapsed * .07 + phase) * .9
        const targetY =
          camera.position.y +
          .7 +
          Math.sin(elapsed * .055 + phase) * .72
        const targetZ =
          camera.position.z +
          offsetZ +
          Math.cos(elapsed * .06 + phase) * .8

        sprite.position.x +=
          (targetX - sprite.position.x) * .1
        sprite.position.y +=
          (targetY - sprite.position.y) * .08
        sprite.position.z +=
          (targetZ - sprite.position.z) * .1

        const material =
          sprite.material as THREE.SpriteMaterial
        const centerFade =
          index <= 1 ? .72 : index >= 6 ? .8 : 1
        const landmarkRichness = nearest
          ? 1 +
            (1 -
              THREE.MathUtils.smoothstep(
                nearest.distance,
                4,
                18,
              )) *
              .34
          : 1

        material.opacity =
          (.03 +
            Math.max(
              0,
              Math.sin(elapsed * .09 + phase),
            ) *
              .015) *
          centerFade *
          landmarkRichness *
          districtAtmosphereStrength

        material.color.lerp(
          districtTint,
          nearestDistrict?.atmosphere === 'deep-void'
            ? .055
            : .075,
        )
      })
    },

    dispose() {
      if (disposed) return
      disposed = true

      hazePlanes.forEach((plane) =>
        farWorld.remove(plane),
      )
      archiveFog.forEach((sprite) =>
        world.remove(sprite),
      )
      localHaze.forEach((sprite) =>
        world.remove(sprite),
      )
      world.remove(districtLight)

      hazeGeometry.dispose()
      hazeMaterials.forEach((material) =>
        material.dispose(),
      )
      hazeTextures.forEach((texture) =>
        texture.dispose(),
      )
      archiveFogMaterials.forEach((material) =>
        material.dispose(),
      )
      archiveFogTextures.forEach((texture) =>
        texture.dispose(),
      )
    },
  }
}
