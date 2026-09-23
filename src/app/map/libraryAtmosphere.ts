import * as THREE from 'three'
import type {
  LibraryAtmosphere,
  LibraryDistrictConfig,
} from '@/lib/libraryWorldConfig'
import type {DreamQuality} from './dreamworld/quality'
import {
  ARCHIVE_PATH_RENDER_BAYS,
  archiveBayFromWorldZ,
  archivePathFrame,
  archivePathPoint,
} from './libraryLayout'

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
  activeDistrictId?: string
  activeRoomCenter?: [number, number]
  roomSelectionMode?: boolean
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
      color: 'rgba(73, 132, 176, 0.36)',
      position: [-28, 7, -72] as const,
      scale: [92, 42] as const,
      opacity: .036,
      rotation: -.035,
    },
    {
      color: 'rgba(111, 82, 176, 0.36)',
      position: [32, -4, -145] as const,
      scale: [126, 54] as const,
      opacity: .031,
      rotation: .045,
    },
    {
      color: 'rgba(52, 153, 157, 0.36)',
      position: [-18, 13, -228] as const,
      scale: [158, 64] as const,
      opacity: .027,
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
      ? 40
      : quality === 'high'
        ? 30
        : quality === 'medium'
          ? 22
          : 14

  for (let index = 0; index < fogBankCount; index += 1) {
    const t = index / (fogBankCount - 1)
    const bay = THREE.MathUtils.lerp(
      .25,
      ARCHIVE_PATH_RENDER_BAYS - .4,
      t,
    )
    const point = archivePathPoint(bay)
    const frame = archivePathFrame(bay)
    const phase = index * 1.37
    const sidePattern = index % 3
    const sideSign =
      sidePattern === 0 ? -1 : sidePattern === 1 ? 1 : 0
    const sideOffset =
      sideSign *
      (1.8 + seededUnit(index + 701, 4) * 4.4)

    const sprite = new THREE.Sprite(
      fogMaterials[index % fogMaterials.length],
    )
    sprite.position.set(
      point[0] + frame.normalX * sideOffset,
      point[1] +
        (seededUnit(index + 701, 5) - .5) * 4.2 +
        .6,
      point[2] + frame.normalZ * sideOffset,
    )

    const width = 30 + seededUnit(index + 701, 6) * 18
    const height = 12 + seededUnit(index + 701, 7) * 9
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

  const localHazeOffsets = [
    -1.6,
    -.7,
    .15,
    1,
    1.9,
    3,
    4.3,
    5.8,
  ] as const

  localHazeOffsets.forEach((bayOffset, index) => {
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
    const localSide =
      index % 3 === 0 ? 0 : index % 2 === 0 ? 1 : -1
    const initialBay = THREE.MathUtils.clamp(
      .35 + bayOffset,
      0,
      ARCHIVE_PATH_RENDER_BAYS,
    )
    const initialPoint = archivePathPoint(initialBay)
    const initialFrame = archivePathFrame(initialBay)
    const initialSideDistance = localSide * 2.6

    sprite.userData.localHazeBayOffset = bayOffset
    sprite.userData.localHazePhase = index * 1.27
    sprite.userData.localHazeSide = localSide
    sprite.position.set(
      initialPoint[0] +
        initialFrame.normalX * initialSideDistance,
      initialPoint[1] + .8,
      initialPoint[2] +
        initialFrame.normalZ * initialSideDistance,
    )
    sprite.scale.set(
      32 + (index % 3) * 6,
      14 + (index % 4) * 2.2,
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
    update({
      elapsed,
      camera,
      activeDistrictId,
      activeRoomCenter,
      roomSelectionMode,
      districts,
    }) {
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
            (1.1 + (index % 3) * .22)
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

      if (localHaze.length === 0) return

      const cameraBay = archiveBayFromWorldZ(
        camera.position.z,
      )
      const selectedRoomDistrict =
        activeDistrictId
          ? districts.find(
              (district) => district.id === activeDistrictId,
            ) ?? null
          : null
      const nearestDistrict =
        roomSelectionMode
          ? selectedRoomDistrict
          : selectedRoomDistrict ??
            (districts.length > 0
              ? districts.reduce((nearest, candidate) =>
                  Math.abs(candidate.bay - cameraBay) <
                  Math.abs(nearest.bay - cameraBay)
                    ? candidate
                    : nearest,
                )
              : null)

      let districtAtmosphereStrength = 1

      if (nearestDistrict) {
        const visualPreset =
          getLibraryAtmosphereVisualPreset(
            nearestDistrict.atmosphere,
          )

        // Atmosphere is intentionally stronger than the district accent.
        // Accent still contributes identity, but the preset owns the mood.
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

        const districtPoint =
          activeRoomCenter &&
          nearestDistrict.id === activeDistrictId
            ? [activeRoomCenter[0], 0, activeRoomCenter[1]]
            : archivePathPoint(nearestDistrict.bay)
        districtLight.position.set(
          districtPoint[0],
          districtPoint[1] + 3.2,
          districtPoint[2],
        )
        districtLight.color.lerp(districtTint, .08)

        const districtDistance = Math.abs(
          nearestDistrict.bay - cameraBay,
        )
        const districtPresence =
          1 -
          THREE.MathUtils.smoothstep(
            districtDistance,
            .5,
            5.5,
          )

        const targetLight =
          visualPreset.lightStrength

        districtLight.intensity +=
          (
            targetLight *
              (.35 + districtPresence * .65) -
            districtLight.intensity
          ) *
          .085

        // Re-tint the broad fog banks as the visitor moves through the
        // archive. This makes a district atmosphere readable at a glance,
        // rather than only in the few sprites immediately around the camera.
        archiveFogMaterials.forEach((material) => {
          material.color.lerp(districtTint, .045)
        })
        hazeMaterials.forEach((material) => {
          material.color.lerp(districtTint, .025)
        })
      } else {
        districtTint.copy(fallbackTint)
        districtLight.intensity *= .92
      }

      localHaze.forEach((sprite, index) => {
        const bayOffset =
          sprite.userData.localHazeBayOffset as number
        const bay = THREE.MathUtils.clamp(
          cameraBay + bayOffset,
          0,
          ARCHIVE_PATH_RENDER_BAYS,
        )
        const point = archivePathPoint(bay)
        const frame = archivePathFrame(bay)
        const phase =
          sprite.userData.localHazePhase as number
        const side =
          sprite.userData.localHazeSide as number
        const sideDistance =
          side *
          (2.6 + Math.sin(elapsed * .07 + phase) * .65)

        const targetX =
          point[0] + frame.normalX * sideDistance
        const targetY =
          point[1] +
          .8 +
          Math.sin(elapsed * .055 + phase) * .72
        const targetZ =
          point[2] + frame.normalZ * sideDistance

        sprite.position.x +=
          (targetX - sprite.position.x) * .12
        sprite.position.y +=
          (targetY - sprite.position.y) * .1
        sprite.position.z +=
          (targetZ - sprite.position.z) * .12

        const material =
          sprite.material as THREE.SpriteMaterial
        const centerFade =
          index <= 1 ? .72 : index >= 6 ? .8 : 1
        const landmarkRichness = nearestDistrict
          ? 1 +
            (1 -
              THREE.MathUtils.smoothstep(
                Math.abs(
                  nearestDistrict.bay - cameraBay,
                ),
                .4,
                3.6,
              )) *
              .32
          : 1

        material.opacity =
          (.032 +
            Math.max(
              0,
              Math.sin(elapsed * .09 + phase),
            ) *
              .016) *
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

      hazePlanes.forEach((plane) => farWorld.remove(plane))
      archiveFog.forEach((sprite) => world.remove(sprite))
      localHaze.forEach((sprite) => world.remove(sprite))
      world.remove(districtLight)

      hazeGeometry.dispose()
      hazeMaterials.forEach((material) => material.dispose())
      hazeTextures.forEach((texture) => texture.dispose())
      archiveFogMaterials.forEach((material) =>
        material.dispose(),
      )
      archiveFogTextures.forEach((texture) =>
        texture.dispose(),
      )
    },
  }
}
