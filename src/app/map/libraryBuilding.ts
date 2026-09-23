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

    const light = new THREE.PointLight(room.accent, 1.05, 11, 2)
    light.position.set(x, 3.35, z)
    group.add(light)
  }

  ;[
    {position: [-18.2, 2.8, -12] as const, intensity: .68},
    {position: [18, 2.75, -32] as const, intensity: .48},
    {position: [-16, 2.9, -52] as const, intensity: .52},
  ].forEach(({position, intensity}) => {
    const readingLight = new THREE.PointLight(
      0xffd7aa,
      intensity,
      7,
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
      loadLibraryAsset('skyDome', 190, 'span'),
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
    const skyDome = value(4)
    const column = value(5)
    const readingRug = value(6)
    const libraryChair = value(7)
    const readingTable = value(8)
    const cardCatalogue = value(9)
    const pendantLight = value(10)
    const archedWindow = value(11)
    const chairWingback = value(12)
    const clockMantel = value(13)
    const quietSign = value(14)
    const pottedPlant = value(15)
    const wallSconce = value(16)
    const rollingLadder = value(17)
    const cardCatalogueSecondary = value(18)

    if (skyDome) {
      const dome = placeAsset(skyDome, 0, -8, -30)
      dome.traverse((child) => {
        if (!(child instanceof THREE.Mesh)) return
        const material = new THREE.MeshBasicMaterial({
          color: 0xaebbd2,
          vertexColors: true,
          side: THREE.BackSide,
          depthWrite: false,
          fog: false,
          toneMapped: true,
        })
        localMaterials.push(material)
        child.material = material
        child.castShadow = false
        child.receiveShadow = false
        child.renderOrder = -100
      })
    }

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
        floatingProps.register(instance, {
          phase: floatingPhase(placement.id),
          hoverAmplitude: placement.hoverAmplitude,
          hoverSpeed: placement.hoverSpeed,
          tiltX: placement.tiltX,
          tiltZ: placement.tiltZ,
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
