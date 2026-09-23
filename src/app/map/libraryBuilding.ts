import * as THREE from 'three'
import type {LibraryWorldConfig} from '@/lib/libraryWorldConfig'
import {loadLibraryAsset} from './libraryAssets'
import {
  LIBRARY_FURNISHINGS,
  LIBRARY_ROOMS,
} from './libraryRoomLayout'
import {
  floatingPhase,
  type FloatingPropRegistry,
} from './libraryFloating'

type WallRun = {
  x: number
  z: number
  length: number
  axis: 'x' | 'z'
  rotationY: number
  windows: boolean
}

export type LibraryBuilding = {
  group: THREE.Group
  ready: Promise<void>
  dispose: () => void
}

export function createLibraryBuilding(
  scene: THREE.Scene,
  config: LibraryWorldConfig,
  floatingProps: FloatingPropRegistry,
): LibraryBuilding {
  const group = new THREE.Group()
  group.name = 'sanity-room-library-building'
  scene.add(group)

  let disposed = false
  const localMaterials: THREE.Material[] = []
  const localGeometries: THREE.BufferGeometry[] = []
  const localTextures: THREE.Texture[] = []

  const createSignTexture = (
    title: string,
    subtitle: string,
    accent: string,
    width = 1024,
    height = 256,
  ) => {
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) return new THREE.CanvasTexture(canvas)

    context.clearRect(0, 0, width, height)
    context.fillStyle = 'rgba(8, 10, 16, .9)'
    context.strokeStyle = accent
    context.lineWidth = 10
    context.beginPath()
    context.roundRect(12, 12, width - 24, height - 24, 30)
    context.fill()
    context.stroke()

    context.fillStyle = '#ffffff'
    context.font = '700 58px system-ui, sans-serif'
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.fillText(title.toUpperCase(), width / 2, height * .43)

    context.fillStyle = 'rgba(255,255,255,.68)'
    context.font = '400 28px system-ui, sans-serif'
    context.fillText(subtitle, width / 2, height * .7)

    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    texture.needsUpdate = true
    localTextures.push(texture)
    return texture
  }

  const addSign = (
    title: string,
    subtitle: string,
    accent: string,
    position: [number, number, number],
    scale: [number, number],
  ) => {
    const texture = createSignTexture(title, subtitle, accent)
    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
    })
    localMaterials.push(material)
    const sprite = new THREE.Sprite(material)
    sprite.position.set(...position)
    sprite.scale.set(scale[0], scale[1], 1)
    sprite.renderOrder = 12
    group.add(sprite)
    return sprite
  }

  const roomDistricts = [...config.districts]
    .filter((district) => district.enabled)
    .sort((a, b) => a.roomSlot - b.roomSlot)

  const directoryLine = roomDistricts
    .map((district, index) => {
      const arrow = index % 2 === 0 ? '←' : '→'
      return `${district.label} ${arrow}`
    })
    .join('  ·  ')

  addSign(
    config.welcomeTitle || 'DEV LIBRARY',
    directoryLine || 'Featured ← · New Arrivals → · Topics ← · Creators → · Search ← · Archive →',
    '#53d3ff',
    [0, 3.35, 10.55],
    [10.8, 2.7],
  )

  roomDistricts.forEach((district, index) => {
    const room =
      LIBRARY_ROOMS.find(
        (candidate) => candidate.slot === district.roomSlot,
      ) ?? LIBRARY_ROOMS[index % LIBRARY_ROOMS.length]
    if (!room) return

    const [x, z] = room.center
    const signX = x < 0 ? -10.25 : 10.25
    addSign(
      district.label,
      district.description ?? 'Live DEV collection',
      district.accent,
      [signX, 3.65, z],
      [5.1, 1.28],
    )

    const glowGeometry = new THREE.PlaneGeometry(11.5, 11.5)
    localGeometries.push(glowGeometry)
    const glowMaterial = new THREE.MeshBasicMaterial({
      color: district.accent,
      transparent: true,
      opacity: .035,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      toneMapped: false,
    })
    localMaterials.push(glowMaterial)
    const glow = new THREE.Mesh(glowGeometry, glowMaterial)
    glow.rotation.x = -Math.PI / 2
    glow.position.set(x, .018, z)
    glow.renderOrder = 2
    group.add(glow)
  })

  const corridorGeometry = new THREE.PlaneGeometry(2.7, 82)
  localGeometries.push(corridorGeometry)
  const corridorMaterial = new THREE.MeshBasicMaterial({
    color: 0x3b49df,
    transparent: true,
    opacity: .055,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    toneMapped: false,
  })
  localMaterials.push(corridorMaterial)
  const corridor = new THREE.Mesh(
    corridorGeometry,
    corridorMaterial,
  )
  corridor.rotation.x = -Math.PI / 2
  corridor.position.set(0, .022, -30)
  corridor.renderOrder = 2
  group.add(corridor)

  const backupFloorMaterial = new THREE.MeshStandardMaterial({
    color: 0xb88958,
    roughness: .72,
    metalness: .02,
  })
  const backupWallMaterial = new THREE.MeshStandardMaterial({
    color: 0xece9e3,
    roughness: .78,
    metalness: .02,
  })
  const backupCeilingMaterial = new THREE.MeshStandardMaterial({
    color: 0xe8e1d6,
    roughness: .94,
    metalness: 0,
    envMapIntensity: .12,
    side: THREE.DoubleSide,
  })
  localMaterials.push(
    backupFloorMaterial,
    backupWallMaterial,
    backupCeilingMaterial,
  )

  const floorGeometry = new THREE.BoxGeometry(48.9, .08, 89.6)
  localGeometries.push(floorGeometry)
  const backupFloor = new THREE.Mesh(
    floorGeometry,
    backupFloorMaterial,
  )
  backupFloor.position.set(0, -.04, -30.15)
  backupFloor.receiveShadow = true
  group.add(backupFloor)

  const ceilingGeometry = new THREE.PlaneGeometry(48.9, 89.6)
  localGeometries.push(ceilingGeometry)
  const backupCeiling = new THREE.Mesh(
    ceilingGeometry,
    backupCeilingMaterial,
  )
  backupCeiling.rotation.x = Math.PI / 2
  backupCeiling.position.set(0, 5.03, -30.15)
  group.add(backupCeiling)

  const wallRuns: WallRun[] = [
    {
      x: -24.4,
      z: -30,
      length: 90,
      axis: 'z',
      rotationY: Math.PI / 2,
      windows: true,
    },
    {
      x: 24.4,
      z: -30,
      length: 90,
      axis: 'z',
      rotationY: -Math.PI / 2,
      windows: true,
    },
    {
      x: 0,
      z: 14.7,
      length: 49,
      axis: 'x',
      rotationY: Math.PI,
      windows: true,
    },
    {
      x: 0,
      z: -75,
      length: 49,
      axis: 'x',
      rotationY: 0,
      windows: true,
    },
  ]

  const backupWalls = new THREE.Group()
  backupWalls.name = 'library-backup-walls'
  group.add(backupWalls)

  const addWall = (
    x: number,
    z: number,
    width: number,
    depth: number,
    height = 5,
  ) => {
    const geometry = new THREE.BoxGeometry(width, height, depth)
    localGeometries.push(geometry)
    const wall = new THREE.Mesh(geometry, backupWallMaterial)
    wall.position.set(x, height / 2, z)
    wall.receiveShadow = true
    backupWalls.add(wall)
  }

  addWall(-24.4, -30, .3, 90, 5)
  addWall(24.4, -30, .3, 90, 5)
  addWall(0, -75, 49, .3, 5)
  addWall(0, 14.7, 49, .3, 5)

  for (const z of [-22, -42, -62]) {
    addWall(-16.2, z, 16, .28, 5)
    addWall(16.2, z, 16, .28, 5)
    wallRuns.push(
      {
        x: -16.2,
        z,
        length: 16,
        axis: 'x',
        rotationY: 0,
        windows: false,
      },
      {
        x: 16.2,
        z,
        length: 16,
        axis: 'x',
        rotationY: 0,
        windows: false,
      },
    )
  }

  const roomDistrictBySlot = new Map(
    roomDistricts.map((district) => [
      district.roomSlot,
      district,
    ]),
  )

  for (const room of LIBRARY_ROOMS) {
    const [x, z] = room.center
    const left = x < 0
    const edgeX = left ? -8 : 8
    const rotationY = left ? Math.PI / 2 : -Math.PI / 2

    for (const dz of [-6, 6]) {
      addWall(edgeX, z + dz, .28, 8.6, 5)
      wallRuns.push({
        x: edgeX,
        z: z + dz,
        length: 8.6,
        axis: 'z',
        rotationY,
        windows: false,
      })
    }

    const district = roomDistrictBySlot.get(room.slot)
    const accent = district?.accent ?? '#' + room.accent.toString(16)
    const sourceMode = district?.sourceMode ?? room.sourceMode
    const roomIntensity =
      sourceMode === 'featured'
        ? .72
        : sourceMode === 'catalog'
          ? .34
          : sourceMode === 'creators'
            ? .54
            : .46

    const accentLight = new THREE.PointLight(
      new THREE.Color(accent),
      roomIntensity,
      10,
      2,
    )
    accentLight.position.set(x, 3.05, z)
    group.add(accentLight)

    const warmFill = new THREE.PointLight(
      sourceMode === 'catalog' ? 0xd6d7e6 : 0xffddb8,
      sourceMode === 'featured' ? .82 : sourceMode === 'catalog' ? .32 : .56,
      9,
      2,
    )
    warmFill.position.set(x, 3.55, z)
    group.add(warmFill)

    const roomSpot = new THREE.SpotLight(
      sourceMode === 'catalog' ? 0xb9c8e8 : 0xffe6c9,
      sourceMode === 'featured' ? 1.05 : sourceMode === 'catalog' ? .44 : .72,
      12,
      Math.PI / 3.4,
      .72,
      2,
    )
    roomSpot.position.set(x, 4.72, z)
    roomSpot.castShadow = false
    roomSpot.target.position.set(x, .8, z)
    group.add(roomSpot, roomSpot.target)
  }

  // Warm pools make the long central spine readable without flattening the
  // whole building. These match the pendant-model positions below.
  ;[6, -8, -28, -48, -68].forEach((z, index) => {
    const corridorLight = new THREE.PointLight(
      index === 4 ? 0xd5d9eb : 0xffdfb8,
      index === 4 ? .38 : .58,
      12,
      2,
    )
    corridorLight.position.set(0, 3.85, z)
    group.add(corridorLight)
  })

  ;[
    {position: [-18.2, 2.8, -12] as const, intensity: .62},
    {position: [18, 2.75, -32] as const, intensity: .5},
    {position: [-16, 2.9, -52] as const, intensity: .7},
  ].forEach(({position, intensity}) => {
    const readingLight = new THREE.PointLight(
      0xffcf9e,
      intensity,
      6.5,
      2,
    )
    readingLight.position.set(
      position[0],
      position[1],
      position[2],
    )
    group.add(readingLight)
  })

  addWall(-8, 9, .28, 11, 5)
  addWall(8, 9, .28, 11, 5)
  wallRuns.push(
    {
      x: -8,
      z: 9,
      length: 11,
      axis: 'z',
      rotationY: Math.PI / 2,
      windows: false,
    },
    {
      x: 8,
      z: 9,
      length: 11,
      axis: 'z',
      rotationY: -Math.PI / 2,
      windows: false,
    },
  )

  const placeAsset = (
    template: THREE.Group,
    x: number,
    y: number,
    z: number,
    scale = 1,
    rotationY = 0,
    rotationX = 0,
    castsShadow = false,
  ) => {
    const instance = template.clone(true)
    instance.position.x += x
    instance.position.y += y
    instance.position.z += z
    instance.scale.multiplyScalar(scale)
    instance.rotation.y += rotationY
    instance.rotation.x += rotationX
    instance.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return
      child.frustumCulled = true
      child.castShadow = castsShadow
      child.receiveShadow = true
    })
    group.add(instance)
    return instance
  }

  const ready = (async () => {
    const requests = await Promise.allSettled([
      loadLibraryAsset('wallPanel', 5, 'height'),
      loadLibraryAsset('wallCorner', 5, 'height'),
      loadLibraryAsset('floorParquet', 5.8, 'span'),
      loadLibraryAsset('roofTile', 5.2, 'span'),
      loadLibraryAsset('column', 4.55, 'height'),
      loadLibraryAsset('readingRug', 4.2, 'span'),
      loadLibraryAsset('libraryChair', .9, 'height'),
      loadLibraryAsset('readingTable', .78, 'height'),
      loadLibraryAsset('cardCatalogue', 1.55, 'height'),
      loadLibraryAsset('pendantLight', 1.05, 'height'),
      loadLibraryAsset('archedWindow', 5, 'height'),
      loadLibraryAsset('chairWingback', 1.15, 'height'),
      loadLibraryAsset('clockMantel', .55, 'height'),
      loadLibraryAsset('quietSign', .9, 'height'),
      loadLibraryAsset('pottedPlant', 1.05, 'height'),
      loadLibraryAsset('wallSconce', .52, 'height'),
      loadLibraryAsset('rollingLadder', 2.65, 'height'),
      loadLibraryAsset(
        'cardCatalogueSecondary',
        1.55,
        'height',
      ),
    ])

    if (disposed) return

    const value = (index: number): THREE.Group | null => {
      const request = requests[index]
      return request?.status === 'fulfilled'
        ? request.value
        : null
    }

    const wallPanel = value(0)
    const wallCorner = value(1)
    const floorParquet = value(2)
    const roofTile = value(3)
    const column = value(4)
    const readingRug = value(5)
    const libraryChair = value(6)
    const readingTable = value(7)
    const cardCatalogue = value(8)
    const pendantLight = value(9)
    const archedWindow = value(10)
    const chairWingback = value(11)
    const clockMantel = value(12)
    const quietSign = value(13)
    const pottedPlant = value(14)
    const wallSconce = value(15)
    const rollingLadder = value(16)
    const cardCatalogueSecondary = value(17)

    if (wallPanel) {
      const templateWidth = (template: THREE.Group) =>
        Math.max(
          .1,
          new THREE.Box3()
            .setFromObject(template)
            .getSize(new THREE.Vector3()).x,
        )

      wallRuns.forEach((run) => {
        const wallSpan = templateWidth(wallPanel)
        const count = Math.max(
          1,
          Math.ceil(run.length / Math.max(.65, wallSpan * .97)),
        )
        const cell = run.length / count

        for (let index = 0; index < count; index += 1) {
          const along =
            (run.axis === 'x' ? run.x : run.z) -
            run.length / 2 +
            cell * (index + .5)
          const useWindow =
            Boolean(run.windows && archedWindow) &&
            index > 1 &&
            index < count - 2 &&
            index % 4 === 2
          const template =
            useWindow && archedWindow ? archedWindow : wallPanel
          const instance = placeAsset(
            template,
            run.axis === 'x' ? along : run.x,
            .04,
            run.axis === 'z' ? along : run.z,
            1,
            run.rotationY,
          )
          const width = templateWidth(template)
          instance.scale.x *= (cell / width) * 1.018
        }
      })

      backupWalls.visible = false
    }

    if (wallCorner) {
      ;[
        {x: -24.4, z: 14.7, r: Math.PI / 2},
        {x: 24.4, z: 14.7, r: Math.PI},
        {x: 24.4, z: -75, r: -Math.PI / 2},
        {x: -24.4, z: -75, r: 0},
      ].forEach(({x, z, r}) =>
        placeAsset(wallCorner, x, .04, z, 1, r),
      )
    }

    if (floorParquet) {
      const size = new THREE.Box3()
        .setFromObject(floorParquet)
        .getSize(new THREE.Vector3())
      const tileX = Math.max(2.4, size.x)
      const tileZ = Math.max(2.4, size.z)
      const countX = Math.ceil(48.9 / tileX)
      const countZ = Math.ceil(89.6 / tileZ)
      const cellX = 48.9 / countX
      const cellZ = 89.6 / countZ

      for (let ix = 0; ix < countX; ix += 1) {
        for (let iz = 0; iz < countZ; iz += 1) {
          const x = -24.45 + cellX * (ix + .5)
          const z = -74.95 + cellZ * (iz + .5)
          const tile = placeAsset(floorParquet, x, .008, z)
          tile.scale.x *= (cellX / size.x) * .995
          tile.scale.z *= (cellZ / size.z) * .995
        }
      }

      backupFloor.visible = false
    }

    if (roofTile) {
      const ceilingMaterial = new THREE.MeshStandardMaterial({
        color: 0xe8e1d6,
        vertexColors: true,
        roughness: .94,
        metalness: 0,
        envMapIntensity: .12,
        side: THREE.DoubleSide,
        toneMapped: true,
      })
      localMaterials.push(ceilingMaterial)

      const size = new THREE.Box3()
        .setFromObject(roofTile)
        .getSize(new THREE.Vector3())
      const tileX = Math.max(1.2, size.x)
      const tileZ = Math.max(1.2, size.z)
      const countX = Math.ceil(48.9 / tileX)
      const countZ = Math.ceil(89.6 / tileZ)
      const cellX = 48.9 / countX
      const cellZ = 89.6 / countZ

      for (let ix = 0; ix < countX; ix += 1) {
        for (let iz = 0; iz < countZ; iz += 1) {
          const x = -24.45 + cellX * (ix + .5)
          const z = -74.95 + cellZ * (iz + .5)
          const tile = placeAsset(
            roofTile,
            x,
            5.03,
            z,
            1,
            0,
            Math.PI,
          )
          tile.scale.x *= (cellX / size.x) * 1.015
          tile.scale.z *= (cellZ / size.z) * 1.015
          tile.traverse((child) => {
            if (!(child instanceof THREE.Mesh)) return
            child.material = ceilingMaterial
            child.castShadow = false
            child.receiveShadow = true
          })
        }
      }

      backupCeiling.visible = false
    }

    const furnishingTemplates = {
      column,
      readingRug,
      libraryChair,
      chairWingback,
      readingTable,
      cardCatalogue,
      cardCatalogueSecondary,
      clockMantel,
      quietSign,
      pottedPlant,
      wallSconce,
      rollingLadder,
    }

    wallSconce?.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return
      const materials = Array.isArray(child.material)
        ? child.material
        : [child.material]
      materials.forEach((material) => {
        if (!(material instanceof THREE.MeshStandardMaterial)) return
        material.emissive.setHex(0xffb36b)
        material.emissiveIntensity = .32
      })
    })

    LIBRARY_FURNISHINGS.forEach((placement) => {
      const template = furnishingTemplates[placement.asset]
      if (!template) return

      const instance = placeAsset(
        template,
        placement.position[0],
        placement.position[1],
        placement.position[2],
        placement.scale ?? 1,
        placement.yaw ?? 0,
        0,
        placement.castsShadow ?? false,
      )
      instance.name = `library-furnishing-${placement.id}`
      if (placement.floats !== false) {
        const motionProfile =
          placement.asset === 'readingRug'
            ? {tiltX: .007, tiltY: .0025, tiltZ: .005}
            : placement.asset === 'libraryChair' ||
                placement.asset === 'chairWingback'
              ? {tiltX: .03, tiltY: .012, tiltZ: .022}
              : placement.asset === 'readingTable'
                ? {tiltX: .016, tiltY: .006, tiltZ: .012}
                : placement.asset === 'cardCatalogue' ||
                    placement.asset === 'cardCatalogueSecondary'
                  ? {tiltX: .007, tiltY: .003, tiltZ: .006}
                  : placement.asset === 'column'
                    ? {tiltX: .005, tiltY: .002, tiltZ: .004}
                    : placement.asset === 'rollingLadder'
                      ? {tiltX: .014, tiltY: .006, tiltZ: .012}
                      : {tiltX: .012, tiltY: .005, tiltZ: .01}

        floatingProps.register(instance, {
          phase: floatingPhase(placement.id),
          hoverAmplitude: placement.hoverAmplitude,
          hoverSpeed: placement.hoverSpeed,
          tiltX: Math.max(
            placement.tiltX ?? 0,
            motionProfile.tiltX,
          ),
          tiltY: Math.max(
            placement.tiltY ?? 0,
            motionProfile.tiltY,
          ),
          tiltZ: Math.max(
            placement.tiltZ ?? 0,
            motionProfile.tiltZ,
          ),
        })
      }
    })

    if (pendantLight) {
      LIBRARY_ROOMS.forEach((room) => {
        const [x, z] = room.center
        placeAsset(pendantLight, x, 4.05, z)
      })
      for (const z of [6, -8, -28, -48, -68]) {
        placeAsset(pendantLight, 0, 4.2, z, .92)
      }
    }

  })().catch((error) => {
    console.warn('Library building asset pass failed', error)
  })

  return {
    group,
    ready,
    dispose: () => {
      disposed = true
      scene.remove(group)
      localGeometries.forEach((geometry) => geometry.dispose())
      localMaterials.forEach((material) => material.dispose())
      localTextures.forEach((texture) => texture.dispose())
    },
  }
}
