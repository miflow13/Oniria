import * as THREE from 'three'
import type {LibraryWorldConfig} from '@/lib/libraryWorldConfig'
import {loadLibraryAsset} from './libraryAssets'
import {
  LIBRARY_FURNISHINGS,
  LIBRARY_HALL_READING_Z,
  LIBRARY_ROOMS,
  LIBRARY_SHELF_WIDTH,
  hallwayShelfPlacements,
  roomCrossAisleRect,
  roomDoorwayClearanceRect,
  roomShelfBlueprintPlacements,
  roomShelfPlacementRect,
  surveyedRoomShelfPlacements,
  validateRoomShelfPlacements,
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

const LIBRARY_SKYLIGHT_CENTERS = [
  -4,
  -20,
  -36,
  -52,
  -68,
] as const
const LIBRARY_SKYLIGHT_HALF_WIDTH = 3.2
const LIBRARY_SKYLIGHT_HALF_DEPTH = 3.15
const LIBRARY_SKYLIGHT_GLASS_INSET = .08

export function createLibraryBuilding(
  scene: THREE.Scene,
  config: LibraryWorldConfig,
  floatingProps: FloatingPropRegistry,
  lightDetail: 0 | 1 | 2 | 3 = 3,
): LibraryBuilding {
  const group = new THREE.Group()
  group.name = 'sanity-room-library-building'
  scene.add(group)

  let disposed = false
  let floorSurfaceY = .05
  const localMaterials: THREE.Material[] = []
  const localGeometries: THREE.BufferGeometry[] = []
  const localTextures: THREE.Texture[] = []

  const makeWoodSurfaceMaps = () => {
    const size = 96
    const roughCanvas = document.createElement('canvas')
    roughCanvas.width = size
    roughCanvas.height = size
    const roughContext = roughCanvas.getContext('2d')
    const normalCanvas = document.createElement('canvas')
    normalCanvas.width = size
    normalCanvas.height = size
    const normalContext = normalCanvas.getContext('2d')

    if (roughContext && normalContext) {
      const roughImage = roughContext.createImageData(size, size)
      const normalImage = normalContext.createImageData(size, size)

      for (let y = 0; y < size; y += 1) {
        for (let x = 0; x < size; x += 1) {
          const index = (y * size + x) * 4
          const grain =
            Math.sin(y * .38) * .46 +
            Math.sin(y * .11 + x * .045) * .32 +
            Math.sin(y * .92 + x * .018) * .22
          const rough = Math.round(
            THREE.MathUtils.clamp(202 + grain * 24, 172, 232),
          )
          roughImage.data[index] = rough
          roughImage.data[index + 1] = rough
          roughImage.data[index + 2] = rough
          roughImage.data[index + 3] = 255

          const nx = Math.round(
            THREE.MathUtils.clamp(128 + grain * 8, 118, 138),
          )
          const ny = Math.round(
            THREE.MathUtils.clamp(
              128 + Math.sin(y * .42) * 5,
              120,
              136,
            ),
          )
          normalImage.data[index] = nx
          normalImage.data[index + 1] = ny
          normalImage.data[index + 2] = 252
          normalImage.data[index + 3] = 255
        }
      }

      roughContext.putImageData(roughImage, 0, 0)
      normalContext.putImageData(normalImage, 0, 0)
    }

    const roughness = new THREE.CanvasTexture(roughCanvas)
    const normal = new THREE.CanvasTexture(normalCanvas)
    ;[roughness, normal].forEach((texture) => {
      texture.wrapS = THREE.RepeatWrapping
      texture.wrapT = THREE.RepeatWrapping
      texture.repeat.set(2.4, 5.4)
      texture.minFilter = THREE.LinearMipmapLinearFilter
      texture.magFilter = THREE.LinearFilter
      texture.needsUpdate = true
      localTextures.push(texture)
    })
    return {roughness, normal}
  }

  const woodSurfaceMaps = makeWoodSurfaceMaps()

  // Cheap contact grounding for floating rugs/tables. These are deliberately
  // unlit transparent planes rather than real shadow casters, so the library
  // gets soft floor contact without multiplying shadow-map work.
  const contactShadowGeometry = new THREE.PlaneGeometry(1, 1)
  const contactShadowMaterial = new THREE.MeshBasicMaterial({
    color: 0x050509,
    transparent: true,
    opacity: .17,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: true,
  })
  localGeometries.push(contactShadowGeometry)
  localMaterials.push(contactShadowMaterial)

  const addContactShadow = (
    x: number,
    z: number,
    width: number,
    depth: number,
    yaw = 0,
  ) => {
    const shadow = new THREE.Mesh(
      contactShadowGeometry,
      contactShadowMaterial,
    )
    shadow.rotation.x = -Math.PI / 2
    shadow.rotation.z = -yaw
    shadow.position.set(x, .014, z)
    shadow.scale.set(width, depth, 1)
    shadow.renderOrder = 1
    group.add(shadow)
    return shadow
  }

  const architecturalAoMaterial = new THREE.MeshBasicMaterial({
    color: 0x080605,
    transparent: true,
    opacity: .12,
    depthWrite: false,
    toneMapped: true,
  })
  const galleryWoodMaterial = new THREE.MeshStandardMaterial({
    color: 0x33251c,
    roughness: .82,
    metalness: .015,
    envMapIntensity: .1,
  })
  const galleryRailMaterial = new THREE.MeshStandardMaterial({
    color: 0x221913,
    roughness: .74,
    metalness: .06,
    envMapIntensity: .12,
  })
  localMaterials.push(
    architecturalAoMaterial,
    galleryWoodMaterial,
    galleryRailMaterial,
  )

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

    // Walnut frame + aged paper insert + brass rule. The accent is kept as a
    // restrained wax-seal/rule color rather than a neon UI border.
    context.fillStyle = '#2c2119'
    context.fillRect(0, 0, width, height)
    context.fillStyle = '#8e6b3e'
    context.fillRect(18, 18, width - 36, height - 36)
    context.fillStyle = '#d8c5a2'
    context.fillRect(27, 27, width - 54, height - 54)
    context.strokeStyle = '#5d452c'
    context.lineWidth = 3
    context.strokeRect(34, 34, width - 68, height - 68)

    context.fillStyle = accent
    context.fillRect(width * .12, 53, width * .76, 5)

    context.fillStyle = '#241b15'
    context.font = '700 54px Georgia, "Times New Roman", serif'
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.fillText(title.toUpperCase(), width / 2, height * .39)

    const wrapLine = (value: string, maxWidth: number) => {
      const words = value.trim().split(/\s+/)
      const lines: string[] = []
      let current = ''
      words.forEach((word) => {
        const candidate = current ? current + ' ' + word : word
        if (
          context.measureText(candidate).width <= maxWidth ||
          !current
        ) {
          current = candidate
          return
        }
        lines.push(current)
        current = word
      })
      if (current) lines.push(current)
      return lines
    }

    context.fillStyle = '#544331'
    context.font = '600 24px Georgia, "Times New Roman", serif'
    const explicitLines = subtitle
      .split('\n')
      .flatMap((line) => wrapLine(line, width - 120))
      .slice(0, 2)
    const lineHeight = 31
    const startY =
      height * .69 -
      ((explicitLines.length - 1) * lineHeight) / 2
    explicitLines.forEach((line, index) => {
      context.fillText(
        line,
        width / 2,
        startY + index * lineHeight,
      )
    })

    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    texture.needsUpdate = true
    localTextures.push(texture)
    return texture
  }

  const signWoodMaterial = new THREE.MeshStandardMaterial({
    color: 0x2d2118,
    roughness: .8,
    metalness: .02,
    envMapIntensity: .1,
  })
  localMaterials.push(signWoodMaterial)

  const addSign = (
    title: string,
    subtitle: string,
    accent: string,
    position: [number, number, number],
    scale: [number, number],
    yaw = 0,
  ) => {
    const texture = createSignTexture(title, subtitle, accent)
    const plaqueMaterial = new THREE.MeshStandardMaterial({
      map: texture,
      roughness: .74,
      metalness: 0,
      envMapIntensity: .08,
      side: THREE.DoubleSide,
      toneMapped: true,
    })
    const plaqueGeometry = new THREE.PlaneGeometry(
      scale[0],
      scale[1],
    )
    const backGeometry = new THREE.BoxGeometry(
      scale[0] * 1.035,
      scale[1] * 1.08,
      .09,
    )
    localMaterials.push(plaqueMaterial)
    localGeometries.push(plaqueGeometry, backGeometry)

    const signGroup = new THREE.Group()
    const signId =
      'library-sign:' +
      title.toLowerCase().replace(/[^a-z0-9]+/g, '-') +
      ':' +
      position.map((value) => value.toFixed(2)).join(':')
    signGroup.name = signId
    signGroup.position.set(...position)
    signGroup.rotation.y = yaw

    const back = new THREE.Mesh(
      backGeometry,
      signWoodMaterial,
    )
    back.position.z = -.05
    signGroup.add(back)

    const plaque = new THREE.Mesh(
      plaqueGeometry,
      plaqueMaterial,
    )
    plaque.position.z = .008
    plaque.renderOrder = 8
    signGroup.add(plaque)

    group.add(signGroup)
    floatingProps.register(signGroup, {
      phase: floatingPhase(signId),
      hoverAmplitude: .11,
      hoverSpeed: .13,
      secondaryHoverAmplitude: .025,
      secondaryHoverSpeed: .27,
      tiltX: .012,
      tiltY: .022,
      tiltZ: .018,
      driftSide: .09,
      driftForward: .035,
      driftSpeedSide: .1,
      driftSpeedForward: .07,
    })
    return signGroup
  }

  const headerDate = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
    .format(new Date())
    .toUpperCase()

  const roomFunction = (
    sourceMode: LibraryWorldConfig['districts'][number]['sourceMode'],
  ) => {
    switch (sourceMode) {
      case 'featured':
        return 'CURATED PICKS'
      case 'latest':
        return 'NEWLY PUBLISHED'
      case 'topics':
      case 'tagged':
        return 'TAG INDEX'
      case 'creators':
        return 'AUTHOR INDEX'
      case 'search':
        return 'LIVE CARD CATALOGUE'
      case 'catalog':
      default:
        return 'LONG-TAIL ARCHIVE'
    }
  }

  const roomDistricts = [...config.districts]
    .filter((district) => district.enabled)
    .sort((a, b) => a.roomSlot - b.roomSlot)

  const layoutDebugEnabled =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get(
      'layoutDebug',
    ) === '1'

  if (layoutDebugEnabled) {
    const debugGroup = new THREE.Group()
    debugGroup.name = 'library-layout-debug'
    group.add(debugGroup)

    const debugLabelCache = new Map<
      string,
      THREE.SpriteMaterial
    >()

    const addDebugRect = (
      rect: {
        minX: number
        maxX: number
        minZ: number
        maxZ: number
      },
      color: number,
      opacity: number,
      y = .075,
    ) => {
      const geometry = new THREE.PlaneGeometry(
        rect.maxX - rect.minX,
        rect.maxZ - rect.minZ,
      )
      const material = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false,
      })
      localGeometries.push(geometry)
      localMaterials.push(material)
      const plane = new THREE.Mesh(geometry, material)
      plane.rotation.x = -Math.PI / 2
      plane.position.set(
        (rect.minX + rect.maxX) / 2,
        y,
        (rect.minZ + rect.maxZ) / 2,
      )
      plane.renderOrder = 20
      debugGroup.add(plane)
    }

    const addDebugLabel = (
      text: string,
      x: number,
      z: number,
      invalid: boolean,
    ) => {
      const cacheKey = `${text}:${invalid ? 'bad' : 'ok'}`
      let material = debugLabelCache.get(cacheKey)
      if (!material) {
        const canvas = document.createElement('canvas')
        canvas.width = 192
        canvas.height = 64
        const context = canvas.getContext('2d')
        if (context) {
          context.clearRect(0, 0, 192, 64)
          context.fillStyle = invalid
            ? 'rgba(88, 8, 18, .92)'
            : 'rgba(7, 24, 48, .92)'
          context.fillRect(2, 2, 188, 60)
          context.strokeStyle = invalid
            ? '#ff5d72'
            : '#62b4ff'
          context.lineWidth = 4
          context.strokeRect(2, 2, 188, 60)
          context.fillStyle = '#ffffff'
          context.font = '700 28px system-ui, sans-serif'
          context.textAlign = 'center'
          context.textBaseline = 'middle'
          context.fillText(text, 96, 32)
        }
        const texture = new THREE.CanvasTexture(canvas)
        texture.colorSpace = THREE.SRGBColorSpace
        texture.needsUpdate = true
        localTextures.push(texture)
        material = new THREE.SpriteMaterial({
          map: texture,
          transparent: true,
          depthWrite: false,
          toneMapped: false,
        })
        localMaterials.push(material)
        debugLabelCache.set(cacheKey, material)
      }

      const sprite = new THREE.Sprite(material)
      sprite.position.set(x, .34, z)
      sprite.scale.set(1.35, .45, 1)
      sprite.renderOrder = 21
      debugGroup.add(sprite)
    }

    roomDistricts.forEach((district, index) => {
      const room =
        LIBRARY_ROOMS.find(
          (candidate) =>
            candidate.slot === district.roomSlot,
        ) ?? LIBRARY_ROOMS[index % LIBRARY_ROOMS.length]
      if (!room) return

      const blueprint = roomShelfBlueprintPlacements(
        district,
        index,
      )
      const issues = validateRoomShelfPlacements(
        room,
        blueprint,
      )
      const invalidSlots = new Set(
        issues.map((issue) => issue.slotId),
      )

      // Cyan = doorway safety zone. Green = mandatory walk-through aisle.
      addDebugRect(
        roomDoorwayClearanceRect(room),
        0x46e5ff,
        .22,
      )
      addDebugRect(
        roomCrossAisleRect(room),
        0x4cff91,
        .12,
        .07,
      )

      blueprint.forEach((placement) => {
        const invalid = invalidSlots.has(placement.slotId)
        addDebugRect(
          roomShelfPlacementRect(placement),
          invalid ? 0xff4058 : 0x388dff,
          invalid ? .4 : .2,
          .085,
        )
        addDebugLabel(
          placement.slotId,
          placement.world[0],
          placement.world[2],
          invalid,
        )
      })

      surveyedRoomShelfPlacements(
        district,
        index,
      ).forEach((placement) => {
        addDebugRect(
          roomShelfPlacementRect(placement),
          0x9f6cff,
          .22,
          .09,
        )
        addDebugLabel(
          placement.slotId,
          placement.world[0],
          placement.world[2],
          false,
        )
      })
    })
  }

  const directoryLine = roomDistricts
    .map((district, index) => {
      const arrow = index % 2 === 0 ? '←' : '→'
      return `${district.label} ${arrow}`
    })
    .join('  ·  ')

  addSign(
    config.welcomeTitle || 'DEV LIBRARY',
    'ROOM DIRECTORY · ' + headerDate + '\n' +
      (directoryLine || 'Featured ← · New Arrivals → · Topics ← · Creators → · Search ← · Archive →'),
    '#53d3ff',
    [0, 3.45, 10.55],
    [7.2, 1.5],
  )

  addSign(
    'WELCOME TO ONIRIA',
    'SANITY-POWERED DEV ARCHIVE · ' + headerDate + '\nLive articles become books you can physically browse.',
    '#f1b76f',
    [0, 2.68, 5.5],
    [5.4, 1.12],
  )
  addSign(
    'HOW TO EXPLORE',
    'READING ROOM ETIQUETTE\nWASD move · choose a shelf · click a book · ESC returns',
    '#8fdcf4',
    [0, 1.92, 5.55],
    [4.8, .78],
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
      `${district.code} · ${district.label}`,
      `${roomFunction(district.sourceMode)} · ${headerDate}\n${district.description ?? 'Live DEV collection'}`,
      district.accent,
      [signX, 3.65, z],
      [4.7, 1.16],
      x < 0 ? Math.PI / 2 : -Math.PI / 2,
    )

    const glowGeometry = new THREE.PlaneGeometry(11.5, 11.5)
    localGeometries.push(glowGeometry)
    const glowMaterial = new THREE.MeshBasicMaterial({
      color: district.accent,
      transparent: true,
      opacity: .018,
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
    opacity: .026,
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
    color: 0xc9c1b6,
    roughness: .86,
    metalness: .01,
    envMapIntensity: .05,
  })
  const backupCeilingMaterial = new THREE.MeshStandardMaterial({
    color: 0xbfb6aa,
    roughness: .97,
    metalness: 0,
    envMapIntensity: .035,
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

  const skylightGlassMaterial =
    new THREE.MeshPhysicalMaterial({
      color: 0xf2fbff,
      transmission: .96,
      transparent: true,
      opacity: .26,
      roughness: .07,
      metalness: 0,
      ior: 1.46,
      thickness: .025,
      clearcoat: .32,
      clearcoatRoughness: .045,
      envMapIntensity: .55,
      side: THREE.DoubleSide,
      depthWrite: false,
      toneMapped: true,
    })
  const skyRockMaterial = new THREE.MeshStandardMaterial({
    color: 0x343536,
    roughness: .94,
    metalness: .015,
    envMapIntensity: .16,
  })
  const skyDebrisMaterial = new THREE.MeshStandardMaterial({
    color: 0x5b4b3b,
    roughness: .88,
    metalness: .04,
    envMapIntensity: .12,
  })
  const skyParticleMaterial = new THREE.PointsMaterial({
    color: 0xc8dbe8,
    size: .055,
    transparent: true,
    opacity: .52,
    depthWrite: false,
    sizeAttenuation: true,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  })
  localMaterials.push(
    skylightGlassMaterial,
    skyRockMaterial,
    skyDebrisMaterial,
    skyParticleMaterial,
  )

  // Derive the glazing directly from the authored roof cutout. The old pane
  // was visibly undersized, leaving a raw dark border around each opening.
  const skylightGlassGeometry =
    new THREE.PlaneGeometry(
      LIBRARY_SKYLIGHT_HALF_WIDTH * 2 -
        LIBRARY_SKYLIGHT_GLASS_INSET * 2,
      LIBRARY_SKYLIGHT_HALF_DEPTH * 2 -
        LIBRARY_SKYLIGHT_GLASS_INSET * 2,
    )
  const skyRockLargeGeometry =
    new THREE.IcosahedronGeometry(.44, 1)
  const skyRockSmallGeometry =
    new THREE.IcosahedronGeometry(.26, 0)
  const skyDebrisGeometry =
    new THREE.TetrahedronGeometry(.15, 0)
  localGeometries.push(
    skylightGlassGeometry,
    skyRockLargeGeometry,
    skyRockSmallGeometry,
    skyDebrisGeometry,
  )


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
        ? .26
        : sourceMode === 'catalog'
          ? .09
          : sourceMode === 'creators'
            ? .17
            : .15

    if (
      lightDetail >= 2 ||
      (lightDetail === 1 && room.slot % 2 === 0)
    ) {
      const accentLight = new THREE.PointLight(
        new THREE.Color(accent),
        roomIntensity,
        10,
        2,
      )
      accentLight.position.set(x, 3.05, z)
      group.add(accentLight)
    }

    // The actual pendant mesh gets its bulb, point light, and soft downward
    // cone once the GLB finishes loading below. Keeping light generation tied
    // to the fixture prevents decorative lamps from drifting out of sync with
    // their illumination.
  }

  if (lightDetail >= 2) {
    ;[
      {position: [-18.2, 2.8, -12] as const, intensity: .22},
      {position: [18, 2.75, -32] as const, intensity: .17},
      {position: [-16, 2.9, -52] as const, intensity: .24},
    ].forEach(({position, intensity}) => {
      const readingLight = new THREE.PointLight(
        0xffcf9e,
        intensity,
        5.3,
        2,
      )
      readingLight.position.set(
        position[0],
        position[1],
        position[2],
      )
      group.add(readingLight)
    })
  }

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

  // Cheap doorway AO: narrow dark jamb strips provide the missing contact
  // depth at each room opening without re-enabling the expensive SSAO pass.
  const jambGeometry = new THREE.BoxGeometry(.045, 4.55, .16)
  const lintelGeometry = new THREE.BoxGeometry(.045, .14, 3.5)
  localGeometries.push(jambGeometry, lintelGeometry)
  LIBRARY_ROOMS.forEach((room) => {
    const edgeX = room.center[0] < 0 ? -7.84 : 7.84
    ;[-1.76, 1.76].forEach((offset) => {
      const jamb = new THREE.Mesh(
        jambGeometry,
        architecturalAoMaterial,
      )
      jamb.position.set(edgeX, 2.33, room.center[1] + offset)
      jamb.renderOrder = 1
      group.add(jamb)
    })
    const lintel = new THREE.Mesh(
      lintelGeometry,
      architecturalAoMaterial,
    )
    lintel.position.set(edgeX, 4.55, room.center[1])
    lintel.renderOrder = 1
    group.add(lintel)
  })

  // Shallow, inaccessible upper galleries along the outer walls add vertical
  // scale and break the single-extruded-corridor read without changing walk
  // collision or navigation.
  const galleryDeckGeometry = new THREE.BoxGeometry(.92, .12, 16.4)
  const galleryRailGeometry = new THREE.BoxGeometry(.075, .075, 15.7)
  const galleryPostGeometry = new THREE.BoxGeometry(.075, .66, .075)
  localGeometries.push(
    galleryDeckGeometry,
    galleryRailGeometry,
    galleryPostGeometry,
  )

  LIBRARY_ROOMS.forEach((room) => {
    const left = room.center[0] < 0
    const deckX = left ? -23.78 : 23.78
    const railX = left ? -23.27 : 23.27

    const deck = new THREE.Mesh(
      galleryDeckGeometry,
      galleryWoodMaterial,
    )
    deck.position.set(deckX, 3.7, room.center[1])
    deck.receiveShadow = true
    group.add(deck)

    const rail = new THREE.Mesh(
      galleryRailGeometry,
      galleryRailMaterial,
    )
    rail.position.set(railX, 4.17, room.center[1])
    group.add(rail)

    ;[-7.3, -3.65, 0, 3.65, 7.3].forEach((offset) => {
      const post = new THREE.Mesh(
        galleryPostGeometry,
        galleryRailMaterial,
      )
      post.position.set(
        railX,
        3.92,
        room.center[1] + offset,
      )
      group.add(post)
    })
  })

  // Small architectural edges do a lot of work in a low-poly room. A dark
  // baseboard and matching crown line break the giant flat wall surfaces and
  // make each room read as intentionally constructed rather than boxed-in.
  const trimMaterial = new THREE.MeshStandardMaterial({
    color: 0x2a211d,
    roughness: .78,
    metalness: .03,
    envMapIntensity: .24,
  })
  const ventMaterial = new THREE.MeshStandardMaterial({
    color: 0x171a20,
    roughness: .68,
    metalness: .32,
    envMapIntensity: .3,
  })
  localMaterials.push(trimMaterial, ventMaterial)

  const archwayMaterial = new THREE.MeshStandardMaterial({
    color: 0xc9b99f,
    roughness: .72,
    metalness: .025,
    envMapIntensity: .16,
  })
  const archwayInsetMaterial = new THREE.MeshStandardMaterial({
    color: 0x5c4634,
    roughness: .77,
    metalness: .035,
    envMapIntensity: .12,
  })
  localMaterials.push(archwayMaterial, archwayInsetMaterial)

  const archJambGeometry = new THREE.BoxGeometry(
    .24,
    3.02,
    .28,
  )
  const archCapitalGeometry = new THREE.BoxGeometry(
    .32,
    .16,
    .44,
  )
  const archCurveGeometry = new THREE.TorusGeometry(
    1.76,
    .12,
    8,
    36,
    Math.PI,
  )
  const archInsetGeometry = new THREE.TorusGeometry(
    1.76,
    .045,
    6,
    36,
    Math.PI,
  )
  const archKeystoneGeometry = new THREE.BoxGeometry(
    .34,
    .34,
    .38,
  )
  localGeometries.push(
    archJambGeometry,
    archCapitalGeometry,
    archCurveGeometry,
    archInsetGeometry,
    archKeystoneGeometry,
  )

  // Each physical room gets an architectural threshold facing the central
  // corridor. The geometry hugs the existing doorway edges so walk clearance
  // and the authored room collision layout remain unchanged.
  LIBRARY_ROOMS.forEach((room) => {
    const leftRoom = room.center[0] < 0
    const edgeX = leftRoom ? -7.88 : 7.88
    const doorwayZ = room.center[1]
    const springY = 3.02

    ;[-1.76, 1.76].forEach((offset) => {
      const jamb = new THREE.Mesh(
        archJambGeometry,
        archwayMaterial,
      )
      jamb.position.set(
        edgeX,
        springY / 2,
        doorwayZ + offset,
      )
      jamb.receiveShadow = true
      group.add(jamb)

      const capital = new THREE.Mesh(
        archCapitalGeometry,
        archwayInsetMaterial,
      )
      capital.position.set(
        edgeX,
        springY + .02,
        doorwayZ + offset,
      )
      group.add(capital)
    })

    const arch = new THREE.Mesh(
      archCurveGeometry,
      archwayMaterial,
    )
    arch.rotation.y = Math.PI / 2
    arch.position.set(edgeX, springY, doorwayZ)
    arch.receiveShadow = true
    group.add(arch)

    const inset = new THREE.Mesh(
      archInsetGeometry,
      archwayInsetMaterial,
    )
    inset.rotation.y = Math.PI / 2
    inset.position.set(
      edgeX + (leftRoom ? .125 : -.125),
      springY,
      doorwayZ,
    )
    group.add(inset)

    const keystone = new THREE.Mesh(
      archKeystoneGeometry,
      archwayInsetMaterial,
    )
    keystone.position.set(
      edgeX,
      springY + 1.74,
      doorwayZ,
    )
    keystone.rotation.x = Math.PI / 4
    group.add(keystone)
  })

  const addTrimRun = (run: WallRun, y: number, height: number) => {
    const geometry =
      run.axis === 'x'
        ? new THREE.BoxGeometry(run.length, height, .11)
        : new THREE.BoxGeometry(.11, height, run.length)
    localGeometries.push(geometry)
    const trim = new THREE.Mesh(geometry, trimMaterial)
    trim.position.set(run.x, y, run.z)
    trim.receiveShadow = true
    group.add(trim)
  }

  wallRuns.forEach((run) => {
    addTrimRun(run, .09, .18)
    addTrimRun(run, 4.91, .12)
  })

  // Sparse corridor vents add believable scale/detail without introducing a
  // new asset dependency. Each uses one plate and three shallow slots.
  const ventPlateGeometry = new THREE.BoxGeometry(1.15, .022, .42)
  const ventSlotGeometry = new THREE.BoxGeometry(.82, .016, .045)
  localGeometries.push(ventPlateGeometry, ventSlotGeometry)
  ;[-3, -24, -44, -64].forEach((z) => {
    const plate = new THREE.Mesh(ventPlateGeometry, ventMaterial)
    plate.position.set(2.25, .018, z)
    group.add(plate)
    ;[-.11, 0, .11].forEach((offset) => {
      const slot = new THREE.Mesh(ventSlotGeometry, contactShadowMaterial)
      slot.position.set(2.25, .034, z + offset)
      group.add(slot)
    })
  })

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

  const pendantBulbGeometry =
    new THREE.SphereGeometry(.085, 12, 10)
  const pendantBulbMaterial =
    new THREE.MeshStandardMaterial({
      color: 0xffdfb5,
      emissive: 0xffb768,
      emissiveIntensity: 2.1,
      roughness: .34,
      metalness: 0,
      toneMapped: true,
    })

  const poolCanvas = document.createElement('canvas')
  poolCanvas.width = 128
  poolCanvas.height = 128
  const poolContext = poolCanvas.getContext('2d')
  if (poolContext) {
    const gradient = poolContext.createRadialGradient(
      64,
      64,
      4,
      64,
      64,
      62,
    )
    gradient.addColorStop(0, 'rgba(255, 205, 145, .42)')
    gradient.addColorStop(.42, 'rgba(255, 190, 120, .17)')
    gradient.addColorStop(1, 'rgba(255, 170, 100, 0)')
    poolContext.fillStyle = gradient
    poolContext.fillRect(0, 0, 128, 128)
  }
  const pendantPoolTexture = new THREE.CanvasTexture(poolCanvas)
  pendantPoolTexture.colorSpace = THREE.SRGBColorSpace
  pendantPoolTexture.needsUpdate = true
  const pendantPoolGeometry = new THREE.PlaneGeometry(1, 1)
  const pendantPoolMaterial = new THREE.MeshBasicMaterial({
    map: pendantPoolTexture,
    transparent: true,
    opacity: .28,
    depthWrite: false,
    depthTest: true,
    blending: THREE.NormalBlending,
    toneMapped: false,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  })

  localGeometries.push(pendantBulbGeometry, pendantPoolGeometry)
  localMaterials.push(pendantBulbMaterial, pendantPoolMaterial)
  localTextures.push(pendantPoolTexture)

  const sconceHaloGeometry = new THREE.PlaneGeometry(1, 1)
  const sconceHaloMaterial = new THREE.MeshBasicMaterial({
    map: pendantPoolTexture,
    transparent: true,
    opacity: .24,
    depthWrite: false,
    depthTest: true,
    blending: THREE.NormalBlending,
    toneMapped: false,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  })

  const rugBorderGeometry = new THREE.BoxGeometry(
    3.18,
    .026,
    4.18,
  )
  const rugInsetGeometry = new THREE.BoxGeometry(
    2.96,
    .03,
    3.96,
  )
  const rugBorderMaterial = new THREE.MeshBasicMaterial({
    color: 0xb38a43,
    toneMapped: false,
  })
  const rugInsetMaterial = new THREE.MeshBasicMaterial({
    color: 0x6b3442,
    toneMapped: false,
  })

  localGeometries.push(
    sconceHaloGeometry,
    rugBorderGeometry,
    rugInsetGeometry,
  )
  localMaterials.push(
    sconceHaloMaterial,
    rugBorderMaterial,
    rugInsetMaterial,
  )

  const addPendantFixtureLight = (
    fixture: THREE.Group,
    id: string,
    pointIntensity: number,
    distance: number,
    spotIntensity: number,
  ) => {
    fixture.updateMatrixWorld(true)
    const bounds = new THREE.Box3().setFromObject(fixture)
    const center = bounds.getCenter(new THREE.Vector3())
    const height = Math.max(.2, bounds.max.y - bounds.min.y)
    const bulbY =
      bounds.min.y + Math.min(.13, height * .14)

    const bulb = new THREE.Mesh(
      pendantBulbGeometry,
      pendantBulbMaterial,
    )
    bulb.position.set(center.x, bulbY, center.z)
    bulb.name = `library-pendant-bulb-${id}`
    group.add(bulb)

    const lightPosition = new THREE.Vector3(
      center.x,
      bulbY - .04,
      center.z,
    )

    if (lightDetail >= 1) {
      const point = new THREE.PointLight(
        0xffc98a,
        pointIntensity,
        distance,
        2,
      )
      point.position.copy(lightPosition)
      point.castShadow = false
      point.name = `library-pendant-point-${id}`
      group.add(point)
    }

    if (lightDetail >= 2) {
      const spot = new THREE.SpotLight(
        0xffddb2,
        spotIntensity * .58,
        Math.max(4.6, distance - 1.1),
        Math.PI / 4.45,
        .9,
        2,
      )
      spot.position.copy(lightPosition)
      spot.castShadow = false
      spot.target.position.set(center.x, .55, center.z)
      spot.name = `library-pendant-spot-${id}`
      group.add(spot, spot.target)
    }

    const pool = new THREE.Mesh(
      pendantPoolGeometry,
      pendantPoolMaterial,
    )
    pool.rotation.x = -Math.PI / 2
    const poolSize = THREE.MathUtils.clamp(
      3.9 + pointIntensity * .012,
      4.2,
      5.1,
    )
    pool.scale.set(poolSize, poolSize, 1)
    pool.position.set(center.x, .032, center.z)
    pool.renderOrder = 3
    pool.name = `library-pendant-pool-${id}`
    group.add(pool)

  }

  const roomCeilingFixtureGeometry =
    new THREE.CylinderGeometry(.28, .34, .065, 20)
  const roomCeilingLensGeometry =
    new THREE.CircleGeometry(.245, 20)
  const roomCeilingFixtureMaterial =
    new THREE.MeshStandardMaterial({
      color: 0x6f573d,
      roughness: .58,
      metalness: .22,
      envMapIntensity: .2,
    })
  const roomCeilingLensMaterial =
    new THREE.MeshStandardMaterial({
      color: 0xffe6bf,
      emissive: 0xffbd72,
      emissiveIntensity: .72,
      roughness: .4,
      metalness: 0,
      envMapIntensity: .08,
      side: THREE.DoubleSide,
      toneMapped: true,
    })
  localGeometries.push(
    roomCeilingFixtureGeometry,
    roomCeilingLensGeometry,
  )
  localMaterials.push(
    roomCeilingFixtureMaterial,
    roomCeilingLensMaterial,
  )

  // Two shallow ceiling fixtures per room fill the shelf faces and upper
  // molding without flattening the warm pendant pools in the main hall.
  LIBRARY_ROOMS.forEach((room) => {
    const [roomX, roomZ] = room.center

    ;[-4.6, 4.6].forEach((zOffset, fixtureIndex) => {
      const fixture = new THREE.Mesh(
        roomCeilingFixtureGeometry,
        roomCeilingFixtureMaterial,
      )
      fixture.position.set(
        roomX,
        4.91,
        roomZ + zOffset,
      )
      fixture.name =
        `library-room-ceiling-fixture-${room.slot}-${fixtureIndex}`
      group.add(fixture)

      const lens = new THREE.Mesh(
        roomCeilingLensGeometry,
        roomCeilingLensMaterial,
      )
      lens.rotation.x = Math.PI / 2
      lens.position.set(
        roomX,
        4.872,
        roomZ + zOffset,
      )
      lens.name =
        `library-room-ceiling-lens-${room.slot}-${fixtureIndex}`
      group.add(lens)

      if (
        lightDetail >= 2 ||
        (lightDetail === 1 && fixtureIndex === 0)
      ) {
        const fill = new THREE.PointLight(
          0xffd2a1,
          22,
          5.6,
          2,
        )
        fill.position.set(
          roomX,
          4.68,
          roomZ + zOffset,
        )
        fill.castShadow = false
        fill.name =
          `library-room-ceiling-light-${room.slot}-${fixtureIndex}`
        group.add(fill)
      }
    })
  })

  // Surveyed September 23 from the in-world layout pin tool. Keep the
  // horizontal coordinates exact, but project the floor-level pin upward to
  // the authored ceiling so the marker becomes a real architectural fixture.
  const surveyedLatestLight = {
    x: 16.154,
    z: 5.369,
  } as const

  const surveyedFixture = new THREE.Mesh(
    roomCeilingFixtureGeometry,
    roomCeilingFixtureMaterial,
  )
  surveyedFixture.position.set(
    surveyedLatestLight.x,
    4.91,
    surveyedLatestLight.z,
  )
  surveyedFixture.name =
    'library-surveyed-ceiling-fixture-latest-front'
  group.add(surveyedFixture)

  const surveyedLens = new THREE.Mesh(
    roomCeilingLensGeometry,
    roomCeilingLensMaterial,
  )
  surveyedLens.rotation.x = Math.PI / 2
  surveyedLens.position.set(
    surveyedLatestLight.x,
    4.872,
    surveyedLatestLight.z,
  )
  surveyedLens.name =
    'library-surveyed-ceiling-lens-latest-front'
  group.add(surveyedLens)

  if (lightDetail >= 1) {
    const surveyedFill = new THREE.PointLight(
      0xffd2a1,
      28,
      6.2,
      2,
    )
    surveyedFill.position.set(
      surveyedLatestLight.x,
      4.68,
      surveyedLatestLight.z,
    )
    surveyedFill.castShadow = false
    surveyedFill.name =
      'library-surveyed-ceiling-light-latest-front'
    group.add(surveyedFill)
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
      loadLibraryAsset('issueDesk', 1.32, 'height'),
      loadLibraryAsset('writingDesk', .92, 'height'),
      loadLibraryAsset('bookcaseTall', 3.25, 'height'),
      loadLibraryAsset('decoyBookshelf', 3.25, 'height'),
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
    const issueDesk = value(18)
    const writingDesk = value(19)
    const bookcaseTall = value(20) ?? value(21)

    archedWindow?.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return

      const sourceMaterials = Array.isArray(child.material)
        ? child.material
        : [child.material]
      const litMaterials = sourceMaterials.map((material) => {
        // Some supplied window panels use MeshBasicMaterial + vertex colors,
        // which makes the cyan glass/panels glow independently of the room.
        // Convert those to Standard material while preserving their maps and
        // vertex colors so ambient/pendant lighting actually shapes them.
        if (material instanceof THREE.MeshBasicMaterial) {
          const lit = new THREE.MeshStandardMaterial({
            color: material.color.clone(),
            map: material.map,
            vertexColors: material.vertexColors,
            transparent: material.transparent,
            opacity: material.opacity,
            alphaTest: material.alphaTest,
            side: material.side,
            roughness: .76,
            metalness: 0,
            envMapIntensity: .08,
            toneMapped: true,
          })
          localMaterials.push(lit)
          return lit
        }

        material.toneMapped = true
        if (
          material instanceof THREE.MeshStandardMaterial ||
          material instanceof THREE.MeshPhysicalMaterial
        ) {
          material.emissive.setHex(0x000000)
          material.emissiveIntensity = 0
          material.envMapIntensity = Math.min(
            material.envMapIntensity,
            .1,
          )
          material.roughness = Math.max(
            material.roughness,
            .72,
          )
          material.metalness = Math.min(
            material.metalness,
            .04,
          )
          if (material instanceof THREE.MeshPhysicalMaterial) {
            material.clearcoat = Math.min(material.clearcoat, .08)
            material.clearcoatRoughness = Math.max(
              material.clearcoatRoughness,
              .65,
            )
          }
        }
        return material
      })

      child.material = Array.isArray(child.material)
        ? litMaterials
        : litMaterials[0]
    })

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
      floorParquet.traverse((child) => {
        if (!(child instanceof THREE.Mesh)) return
        const materials = Array.isArray(child.material)
          ? child.material
          : [child.material]
        materials.forEach((material) => {
          material.toneMapped = true
          if (
            material instanceof THREE.MeshStandardMaterial ||
            material instanceof THREE.MeshPhysicalMaterial
          ) {
            material.roughness = Math.max(
              material.roughness,
              .82,
            )
            if (!material.roughnessMap) {
              material.roughnessMap = woodSurfaceMaps.roughness
            }
            if (!material.normalMap) {
              material.normalMap = woodSurfaceMaps.normal
              material.normalScale.set(.14, .14)
            }
            material.metalness = Math.min(
              material.metalness,
              .025,
            )
            material.envMapIntensity = Math.min(
              material.envMapIntensity,
              .12,
            )
            if (material instanceof THREE.MeshPhysicalMaterial) {
              material.clearcoat = Math.min(
                material.clearcoat,
                .06,
              )
              material.clearcoatRoughness = Math.max(
                material.clearcoatRoughness,
                .72,
              )
            }
          }
        })
      })

      const size = new THREE.Box3()
        .setFromObject(floorParquet)
        .getSize(new THREE.Vector3())
      floorSurfaceY = .008 + Math.max(.02, size.y)
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

      const wearGeometry = new THREE.PlaneGeometry(3.35, 84)
      const wearMaterial = new THREE.MeshStandardMaterial({
        color: 0x6b4f36,
        transparent: true,
        opacity: .055,
        roughness: .7,
        metalness: 0,
        envMapIntensity: .08,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: true,
      })
      localGeometries.push(wearGeometry)
      localMaterials.push(wearMaterial)
      const wearPath = new THREE.Mesh(
        wearGeometry,
        wearMaterial,
      )
      wearPath.rotation.x = -Math.PI / 2
      wearPath.position.set(0, .014, -31)
      wearPath.renderOrder = 1
      group.add(wearPath)
    }

    if (roofTile) {
      const ceilingMaterial = new THREE.MeshStandardMaterial({
        color: 0xbfb6aa,
        vertexColors: true,
        roughness: .97,
        metalness: 0,
        envMapIntensity: .035,
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
          const insideSkylight =
            Math.abs(x) < LIBRARY_SKYLIGHT_HALF_WIDTH &&
            LIBRARY_SKYLIGHT_CENTERS.some(
              (centerZ) =>
                Math.abs(z - centerZ) <
                LIBRARY_SKYLIGHT_HALF_DEPTH,
            )
          if (insideSkylight) continue

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

      // A single suspended particle field lives above the roof. Depth testing
      // means it only becomes visible through the actual ceiling openings.
      const skyParticleCount = 210
      const skyParticlePositions =
        new Float32Array(skyParticleCount * 3)
      for (let particle = 0; particle < skyParticleCount; particle += 1) {
        const phase = particle * 12.9898
        const u = Math.sin(phase) * 43758.5453
        const v = Math.sin(phase * 1.37 + 4.2) * 24634.6345
        const w = Math.sin(phase * .73 + 9.1) * 19341.137
        const unitU = u - Math.floor(u)
        const unitV = v - Math.floor(v)
        const unitW = w - Math.floor(w)
        skyParticlePositions[particle * 3] =
          -3.15 + unitU * 6.3
        skyParticlePositions[particle * 3 + 1] =
          5.75 + unitV * 6.8
        skyParticlePositions[particle * 3 + 2] =
          -72 + unitW * 71
      }
      const skyParticleGeometry = new THREE.BufferGeometry()
      skyParticleGeometry.setAttribute(
        'position',
        new THREE.BufferAttribute(
          skyParticlePositions,
          3,
        ),
      )
      localGeometries.push(skyParticleGeometry)
      const skyParticles = new THREE.Points(
        skyParticleGeometry,
        skyParticleMaterial,
      )
      skyParticles.name = 'library-open-roof-particles'
      group.add(skyParticles)
      floatingProps.register(skyParticles, {
        phase: floatingPhase('open-roof-particles'),
        hoverAmplitude: .12,
        hoverSpeed: .09,
        driftSide: .16,
        driftForward: .1,
        driftSpeedSide: .07,
        driftSpeedForward: .055,
      })

      LIBRARY_SKYLIGHT_CENTERS.forEach((z, index) => {
        // Frameless clear pane: preserve the open view into Oniria while
        // making the roof opening read as an intentional skylight rather than
        // unfinished construction. No beams or mullion grid remain.
        const glass = new THREE.Mesh(
          skylightGlassGeometry,
          skylightGlassMaterial,
        )
        glass.rotation.x = Math.PI / 2
        // Seat the pane just above the ceiling plane so the glass closes the
        // opening cleanly without floating noticeably above the roof trim.
        glass.position.set(0, 5.065, z)
        glass.renderOrder = 2
        glass.castShadow = false
        glass.receiveShadow = false
        glass.name = `library-skylight-glass-${index}`
        group.add(glass)

        // Daylight exists physically, but lower graphics tiers keep the
        // skylight itself emissive instead of paying for five extra spotlights.
        if (
          lightDetail >= 3 ||
          (lightDetail === 2 && index % 2 === 0)
        ) {
          const daylight = new THREE.SpotLight(
            0xc9e6ff,
            30,
            9.5,
            Math.PI / 3,
            .96,
            2,
          )
          daylight.position.set(0, 6.1, z)
          daylight.target.position.set(0, .45, z)
          daylight.castShadow = false
          daylight.name = `library-open-skylight-light-${index}`
          group.add(daylight, daylight.target)
        }

        // Floating stones and fragments above each opening sell that this roof
        // looks into Oniria rather than an ordinary building exterior.
        for (let rockIndex = 0; rockIndex < 3; rockIndex += 1) {
          const phase = index * 17 + rockIndex * 7
          const rock = new THREE.Mesh(
            rockIndex === 0
              ? skyRockLargeGeometry
              : skyRockSmallGeometry,
            skyRockMaterial,
          )
          rock.position.set(
            -1.7 + rockIndex * 1.65 +
              Math.sin(phase * 1.7) * .34,
            6.5 + rockIndex * 1.15 +
              Math.sin(phase) * .35,
            z - .85 + Math.cos(phase * 1.3) * 1.45,
          )
          rock.scale.set(
            .78 + ((phase * 13) % 7) * .05,
            .62 + ((phase * 5) % 5) * .08,
            .72 + ((phase * 11) % 6) * .06,
          )
          rock.rotation.set(
            phase * .19,
            phase * .27,
            phase * .13,
          )
          rock.name =
            `library-sky-rock-${index}-${rockIndex}`
          group.add(rock)
          floatingProps.register(rock, {
            phase: floatingPhase(rock.name),
            hoverAmplitude: .28 + rockIndex * .11,
            hoverSpeed: .08 + rockIndex * .018,
            secondaryHoverAmplitude: .08,
            secondaryHoverSpeed: .17,
            tiltX: .14,
            tiltY: .2,
            tiltZ: .12,
            driftSide: .38 + rockIndex * .12,
            driftForward: .28 + rockIndex * .08,
            driftSpeedSide: .08 + rockIndex * .018,
            driftSpeedForward: .06 + rockIndex * .014,
          })
        }

        for (let shardIndex = 0; shardIndex < 5; shardIndex += 1) {
          const phase = index * 23 + shardIndex * 11 + 3
          const shard = new THREE.Mesh(
            skyDebrisGeometry,
            skyDebrisMaterial,
          )
          shard.position.set(
            -2.15 + (shardIndex % 3) * 2.05 +
              Math.sin(phase) * .4,
            6.05 + (shardIndex % 4) * .86,
            z - 1.9 + ((shardIndex * 1.07) % 3.8),
          )
          const scale = .5 + (shardIndex % 3) * .24
          shard.scale.set(scale, scale * .5, scale * .8)
          shard.name =
            `library-sky-debris-${index}-${shardIndex}`
          group.add(shard)
          floatingProps.register(shard, {
            phase: floatingPhase(shard.name),
            hoverAmplitude: .18 + shardIndex * .025,
            hoverSpeed: .12 + shardIndex * .014,
            tiltX: .32,
            tiltY: .38,
            tiltZ: .28,
            driftSide: .3 + shardIndex * .055,
            driftForward: .22 + shardIndex * .04,
            driftSpeedSide: .12 + shardIndex * .016,
            driftSpeedForward: .09 + shardIndex * .013,
          })
        }
      })
    }

    // Surveyed corridor rugs. Always render a thin old-library rug base so
    // layout remains visible even if the Draco GLB fails to decode locally.
    // When the uploaded rug loads, it sits on top as the detailed surface.
    let measuredRugLength = 4.18
    let measuredRugWidth = 3.18
    let rugLongAxisIsX = false

    if (readingRug) {
      const rugSize = new THREE.Box3()
        .setFromObject(readingRug)
        .getSize(new THREE.Vector3())
      rugLongAxisIsX = rugSize.x >= rugSize.z
      measuredRugLength = Math.max(
        .001,
        rugLongAxisIsX ? rugSize.x : rugSize.z,
      )
      measuredRugWidth = Math.max(
        .001,
        rugLongAxisIsX ? rugSize.z : rugSize.x,
      )
    } else {
      const rugRequest = requests[5]
      console.warn(
        '[DEV Library] Uploaded office rug did not load; using visible fallback rugs.',
        rugRequest?.status === 'rejected'
          ? rugRequest.reason
          : 'unknown reason',
      )
    }

    LIBRARY_HALL_READING_Z.forEach((z, index) => {
      const border = new THREE.Mesh(
        rugBorderGeometry,
        rugBorderMaterial,
      )
      border.position.set(0, floorSurfaceY + .028, z)
      border.renderOrder = 6
      border.name = `library-rug-fallback-border-${index}`
      group.add(border)

      const inset = new THREE.Mesh(
        rugInsetGeometry,
        rugInsetMaterial,
      )
      inset.position.set(0, floorSurfaceY + .046, z)
      inset.renderOrder = 7
      inset.name = `library-rug-fallback-inset-${index}`
      group.add(inset)

      if (readingRug) {
        const rug = placeAsset(
          readingRug,
          0,
          floorSurfaceY + .065,
          z,
          1,
          rugLongAxisIsX ? Math.PI / 2 : 0,
        )
        rug.name = `library-surveyed-hall-rug-${index}`
        rug.renderOrder = 4

        rug.traverse((child) => {
          if (!(child instanceof THREE.Mesh)) return
          child.castShadow = false
          child.receiveShadow = true
          child.renderOrder = 4
          const hasVertexColor = Boolean(
            child.geometry.getAttribute('color'),
          )
          const materials = Array.isArray(child.material)
            ? child.material
            : [child.material]
          materials.forEach((material) => {
            if (
              material instanceof THREE.MeshStandardMaterial ||
              material instanceof THREE.MeshPhysicalMaterial
            ) {
              material.vertexColors = hasVertexColor
              material.roughness = Math.max(
                material.roughness,
                .8,
              )
              material.metalness = Math.min(
                material.metalness,
                .02,
              )
              material.envMapIntensity = Math.min(
                material.envMapIntensity,
                .14,
              )
              material.toneMapped = true
              material.needsUpdate = true
            }
          })
        })
      }

      addContactShadow(
        0,
        z,
        Math.max(3.18, measuredRugWidth),
        Math.max(4.18, measuredRugLength),
        0,
      )
    })

    const furnishingTemplates = {
      column,
      readingRug,
      libraryChair,
      chairWingback,
      readingTable,
      writingDesk,
      cardCatalogue,
      cardCatalogueSecondary,
      clockMantel,
      quietSign,
      pottedPlant,
      wallSconce,
      rollingLadder,
      issueDesk,
    }

    if (bookcaseTall) {
      bookcaseTall.updateMatrixWorld(true)
      const mockTemplateSize = new THREE.Box3()
        .setFromObject(bookcaseTall)
        .getSize(new THREE.Vector3())

      const hallCollections = [
        {
          side: 'left' as const,
          sourceMode: 'featured' as const,
        },
        {
          side: 'right' as const,
          sourceMode: 'latest' as const,
        },
      ]

      hallCollections.forEach(({side, sourceMode}) => {
        const district = roomDistricts.find(
          (candidate) =>
            candidate.sourceMode === sourceMode,
        )
        if (!district) return

        const realHallShelves = hallwayShelfPlacements(
          district,
          side,
        ).sort((a, b) => a.world[2] - b.world[2])

        for (
          let index = 0;
          index < realHallShelves.length - 1;
          index += 1
        ) {
          const current = realHallShelves[index]
          const next = realHallShelves[index + 1]
          if (!current || !next) continue

          const centerX =
            (current.world[0] + next.world[0]) / 2
          const centerZ =
            (current.world[2] + next.world[2]) / 2

          // The larger gaps in the hall align with room doorways. Never fill
          // those: decorative cases belong only on the uninterrupted wall
          // spans between interactive DEV shelves.
          const blocksDoorway = LIBRARY_ROOMS.some(
            (room) => {
              const sameSide =
                Math.sign(room.doorway[0]) ===
                Math.sign(centerX)
              return (
                sameSide &&
                Math.abs(room.doorway[1] - centerZ) <
                  3.8
              )
            },
          )
          if (blocksDoorway) continue

          const centerDistance = Math.hypot(
            next.world[0] - current.world[0],
            next.world[2] - current.world[2],
          )
          const realShelfSpan =
            LIBRARY_SHELF_WIDTH *
            Math.max(
              current.widthScale ?? 1,
              next.widthScale ?? 1,
            )
          const freeGap = centerDistance - realShelfSpan
          if (freeGap < 1.1) continue

          // Keep the filler visibly narrower than a real DEV shelf so users
          // can read it as architectural book storage, not another clickable
          // collection.
          const targetWidth = THREE.MathUtils.clamp(
            freeGap - .9,
            1.05,
            1.55,
          )
          const scale = THREE.MathUtils.clamp(
            targetWidth /
              Math.max(.1, mockTemplateSize.x),
            .88,
            1.48,
          )

          const mock = placeAsset(
            bookcaseTall,
            centerX,
            floorSurfaceY + .36,
            centerZ,
            scale,
            current.yaw,
          )
          mock.name =
            `library-hall-mock-bookcase-${side}-${index}`
          mock.userData.libraryDecorative = true
          mock.userData.libraryMockShelf = true
          mock.userData.libraryHallFiller = true

          // Normalize from the asset's true bounds, then leave a visible
          // zero-gravity gap beneath it before animation begins.
          mock.updateMatrixWorld(true)
          const bounds = new THREE.Box3().setFromObject(mock)
          mock.position.y +=
            floorSurfaceY + .38 - bounds.min.y
          mock.updateMatrixWorld(true)

          // These filler cases are intentionally much livelier than the real
          // DEV shelves: they share the floating-pavilion language used by
          // columns/light furniture while remaining non-interactive.
          floatingProps.register(mock, {
            phase: floatingPhase(mock.name),
            hoverAmplitude: .24,
            hoverSpeed: .19 + index * .012,
            secondaryHoverAmplitude: .075,
            secondaryHoverSpeed: .34,
            tiltX: .055,
            tiltY: .09,
            tiltZ: .064,
            driftSide: .34,
            driftForward: .19,
            driftSpeedSide: .21,
            driftSpeedForward: .16,
          })
        }
      })
    }

    wallSconce?.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return
      const materials = Array.isArray(child.material)
        ? child.material
        : [child.material]
      materials.forEach((material) => {
        if (!(material instanceof THREE.MeshStandardMaterial)) return
        material.emissive.setHex(0xffb36b)
        material.emissiveIntensity = 1.35
        material.roughness = Math.max(material.roughness, .42)
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

      if (placement.asset === 'pottedPlant') {
        // Plants are among the lightest props in the archive. Start them
        // clearly off the floor so their wider orbital drift reads as
        // zero-gravity decoration rather than a wobbling floor object.
        instance.position.y += .52
        instance.updateMatrixWorld(true)
      }

      if (placement.asset === 'column') {
        // These freestanding columns are decorative rather than structural.
        // Lift them enough that the zero-gravity motion reads immediately,
        // but keep substantially more ceiling clearance than the plants.
        instance.position.y += .2
        instance.updateMatrixWorld(true)
      }

      if (placement.id.startsWith('hall-reading-desk-')) {
        // Central desks use the proven-visible reading-table mesh. Rebase from
        // real post-scale bounds, force the moving meshes renderable, and keep
        // enough clearance for the full zero-gravity animation envelope.
        instance.traverse((child) => {
          if (!(child instanceof THREE.Mesh)) return
          child.visible = true
          child.frustumCulled = false
          const materials = Array.isArray(child.material)
            ? child.material
            : [child.material]
          materials.forEach((material) => {
            material.visible = true
            material.transparent = false
            material.opacity = 1
            material.depthWrite = true
            material.toneMapped = true
            material.needsUpdate = true
          })
        })
        instance.updateMatrixWorld(true)
        const deskBounds = new THREE.Box3().setFromObject(instance)
        const targetBottomY = floorSurfaceY + .72
        const lift = targetBottomY - deskBounds.min.y
        instance.position.y += lift
        instance.updateMatrixWorld(true)
      }

      if (placement.asset === 'column') {
        instance.updateMatrixWorld(true)
        const bounds = new THREE.Box3().setFromObject(instance)
        const size = bounds.getSize(new THREE.Vector3())
        const radius = Math.max(.22, Math.max(size.x, size.z) * .54)
        const baseGeometry = new THREE.CylinderGeometry(
          radius * 1.12,
          radius * 1.2,
          .13,
          18,
        )
        const capitalGeometry = new THREE.CylinderGeometry(
          radius * 1.18,
          radius * 1.08,
          .15,
          18,
        )
        localGeometries.push(baseGeometry, capitalGeometry)

        const baseTrim = new THREE.Mesh(
          baseGeometry,
          trimMaterial,
        )
        baseTrim.position.set(
          placement.position[0],
          bounds.min.y + .065,
          placement.position[2],
        )
        baseTrim.receiveShadow = true
        group.add(baseTrim)

        const capitalTrim = new THREE.Mesh(
          capitalGeometry,
          trimMaterial,
        )
        capitalTrim.position.set(
          placement.position[0],
          bounds.max.y - .075,
          placement.position[2],
        )
        capitalTrim.receiveShadow = true
        group.add(capitalTrim)
      }

      if (placement.asset === 'wallSconce') {
        instance.updateMatrixWorld(true)
        const bounds = new THREE.Box3().setFromObject(instance)
        const center = bounds.getCenter(new THREE.Vector3())
        const yaw = placement.yaw ?? 0
        const forward = new THREE.Vector3(
          0,
          0,
          -1,
        ).applyAxisAngle(
          new THREE.Vector3(0, 1, 0),
          yaw,
        )

        const lightPosition = center
          .clone()
          .addScaledVector(forward, .22)
        lightPosition.y += .03

        if (lightDetail >= 2) {
          const sconcePoint = new THREE.PointLight(
            0xffc07a,
            34,
            4.6,
            2,
          )
          sconcePoint.position.copy(lightPosition)
          sconcePoint.castShadow = false
          sconcePoint.name =
            `library-sconce-point-${placement.id}`
          group.add(sconcePoint)
        }

        if (lightDetail >= 3) {
          const sconceSpot = new THREE.SpotLight(
            0xffd3a0,
            16,
            4.4,
            Math.PI / 3.15,
            .82,
            2,
          )
          sconceSpot.position.copy(lightPosition)
          sconceSpot.castShadow = false
          sconceSpot.target.position
            .copy(lightPosition)
            .addScaledVector(forward, 1.55)
          sconceSpot.target.position.y -= .72
          sconceSpot.name =
            `library-sconce-spot-${placement.id}`
          group.add(sconceSpot, sconceSpot.target)
        }

        const halo = new THREE.Mesh(
          sconceHaloGeometry,
          sconceHaloMaterial,
        )
        halo.position
          .copy(center)
          .addScaledVector(forward, .035)
        halo.rotation.y = yaw
        halo.scale.set(1.28, 1.28, 1)
        halo.renderOrder = 3
        halo.name =
          `library-sconce-halo-${placement.id}`
        group.add(halo)
      }

      if (placement.asset === 'readingRug') {
        addContactShadow(
          placement.position[0],
          placement.position[2],
          4.35 * (placement.scale ?? 1),
          3.15 * (placement.scale ?? 1),
          placement.yaw ?? 0,
        )
      } else if (placement.asset === 'readingTable') {
        addContactShadow(
          placement.position[0],
          placement.position[2],
          2.35 * (placement.scale ?? 1),
          1.45 * (placement.scale ?? 1),
          placement.yaw ?? 0,
        )
      } else if (placement.asset === 'issueDesk') {
        addContactShadow(
          placement.position[0],
          placement.position[2],
          3.75 * (placement.scale ?? 1),
          1.55 * (placement.scale ?? 1),
          placement.yaw ?? 0,
        )
      }

      if (placement.floats !== false) {
        const motionProfile =
          placement.asset === 'readingRug'
            ? {
                tiltX: .01,
                tiltY: .006,
                tiltZ: .008,
                driftX: .018,
                driftZ: .014,
              }
            : placement.asset === 'pottedPlant'
              ? {
                  tiltX: .075,
                  tiltY: .11,
                  tiltZ: .082,
                  driftX: .36,
                  driftZ: .31,
                }
            : placement.asset === 'libraryChair' ||
                placement.asset === 'chairWingback'
              ? {
                  tiltX: .045,
                  tiltY: .03,
                  tiltZ: .036,
                  driftX: .07,
                  driftZ: .055,
                }
              : placement.asset === 'writingDesk'
                ? {
                    tiltX: .095,
                    tiltY: .08,
                    tiltZ: .11,
                    driftX: .28,
                    driftZ: .22,
                  }
                : placement.asset === 'readingTable'
                  ? {
                      tiltX: .034,
                      tiltY: .028,
                      tiltZ: .03,
                      driftX: .085,
                      driftZ: .065,
                    }
                : placement.asset === 'cardCatalogue' ||
                    placement.asset === 'cardCatalogueSecondary'
                  ? {
                      tiltX: .015,
                      tiltY: .012,
                      tiltZ: .013,
                      driftX: .035,
                      driftZ: .026,
                    }
                  : placement.asset === 'column'
                    ? {
                        tiltX: .042,
                        tiltY: .065,
                        tiltZ: .048,
                        driftX: .16,
                        driftZ: .13,
                      }
                    : placement.asset === 'rollingLadder'
                      ? {
                          tiltX: .026,
                          tiltY: .02,
                          tiltZ: .022,
                          driftX: .04,
                          driftZ: .032,
                        }
                      : placement.asset === 'issueDesk'
                        ? {
                            tiltX: .007,
                            tiltY: .005,
                            tiltZ: .006,
                            driftX: .014,
                            driftZ: .01,
                          }
                        : {
                            tiltX: .026,
                            tiltY: .018,
                            tiltZ: .022,
                            driftX: .052,
                            driftZ: .04,
                          }

        const lightDesk =
          placement.id.startsWith('hall-reading-desk-')
        const lightPlant = placement.asset === 'pottedPlant'
        const floatingColumn = placement.asset === 'column'
        floatingProps.register(instance, {
          phase: floatingPhase(placement.id),
          hoverAmplitude:
            placement.hoverAmplitude *
            (lightDesk
              ? 1.7
              : lightPlant
                ? 5.8
              : floatingColumn
                ? 6.5
              : placement.asset === 'readingTable'
                ? 1.45
                : 1.22),
          hoverSpeed:
            placement.hoverSpeed *
            (
              lightDesk
                ? 1.22
                : lightPlant
                  ? 1.55
                  : floatingColumn
                    ? 1.42
                    : .88
            ),
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
          driftX: motionProfile.driftX,
          driftZ: motionProfile.driftZ,
          driftSpeedX: lightDesk
            ? .29
            : lightPlant
              ? .24
            : floatingColumn
              ? .19
            : placement.asset === 'readingTable'
              ? .16
              : .13,
          driftSpeedZ: lightDesk
            ? .23
            : lightPlant
              ? .2
            : floatingColumn
              ? .16
            : placement.asset === 'readingTable'
              ? .125
              : .105,
          driftSide: lightDesk
            ? .62
            : lightPlant
              ? .58
            : floatingColumn
              ? .3
            : placement.asset === 'readingTable'
              ? .1
              : placement.asset === 'libraryChair' ||
                  placement.asset === 'chairWingback'
                ? .075
                : .045,
          driftForward: lightDesk
            ? .4
            : lightPlant
              ? .46
            : floatingColumn
              ? .18
            : placement.asset === 'readingTable'
              ? .04
              : .025,
          driftSpeedSide: lightDesk
            ? .31
            : lightPlant
              ? .26
            : floatingColumn
              ? .21
            : placement.asset === 'readingTable'
              ? .18
              : .15,
          driftSpeedForward:
            lightDesk
              ? .24
              : lightPlant
                ? .2
                : floatingColumn
                  ? .16
                  : .105,
          secondaryHoverAmplitude: lightDesk
            ? .095
            : lightPlant
              ? .085
            : floatingColumn
              ? .055
            : placement.asset === 'readingTable'
              ? .026
              : .014,
          secondaryHoverSpeed: lightDesk
            ? .39
            : lightPlant
              ? .36
            : floatingColumn
              ? .3
            : placement.asset === 'readingTable'
              ? .23
              : .19,
        })
      }
    })

    if (pendantLight) {
      LIBRARY_ROOMS.forEach((room) => {
        const [x, z] = room.center
        const fixture = placeAsset(
          pendantLight,
          x,
          4.05,
          z,
        )
        const sourceMode =
          roomDistrictBySlot.get(room.slot)?.sourceMode ??
          room.sourceMode
        // Three r186 uses photometric light units. Sub-1 point-light
        // intensities were effectively invisible at our .56 library exposure.
        // These values approximate practical warm interior bulbs while the
        // distance/decay still keeps each pool local to its fixture.
        const pointIntensity =
          sourceMode === 'featured'
            ? 82
            : sourceMode === 'catalog'
              ? 54
              : 68
        const spotIntensity =
          sourceMode === 'featured'
            ? 34
            : sourceMode === 'catalog'
              ? 22
              : 28
        addPendantFixtureLight(
          fixture,
          `room-${room.slot}`,
          pointIntensity,
          7.8,
          spotIntensity,
        )
      })

      ;[6, -8, -18, -28, -38, -48, -58, -68].forEach(
        (z, index) => {
          const fixture = placeAsset(
            pendantLight,
            0,
            4.2,
            z,
            .92,
          )
          addPendantFixtureLight(
            fixture,
            `hall-${index}`,
            index === 4 ? 48 : 64,
            7.8,
            index === 4 ? 18 : 24,
          )
        },
      )
    }

    // A high rear-wall oculus gives the long hallway a destination without
    // stealing floor space from the surveyed rear shelving.
    const oculusGlassMaterial = new THREE.MeshStandardMaterial({
      color: 0x263147,
      emissive: 0x17111c,
      emissiveIntensity: .08,
      roughness: .48,
      metalness: .02,
      transparent: true,
      opacity: .92,
      envMapIntensity: .12,
      toneMapped: true,
      side: THREE.DoubleSide,
    })
    const oculusFrameMaterial = new THREE.MeshStandardMaterial({
      color: 0x7b5a35,
      roughness: .58,
      metalness: .24,
      envMapIntensity: .18,
    })
    const oculusGlassGeometry = new THREE.CircleGeometry(.66, 36)
    const oculusFrameGeometry = new THREE.RingGeometry(.72, .84, 36)
    localMaterials.push(
      oculusGlassMaterial,
      oculusFrameMaterial,
    )
    localGeometries.push(
      oculusGlassGeometry,
      oculusFrameGeometry,
    )

    const oculusGlass = new THREE.Mesh(
      oculusGlassGeometry,
      oculusGlassMaterial,
    )
    const oculusFrame = new THREE.Mesh(
      oculusFrameGeometry,
      oculusFrameMaterial,
    )
    oculusGlass.position.set(0, 4.05, -74.79)
    oculusFrame.position.set(0, 4.05, -74.77)
    group.add(oculusGlass, oculusFrame)

    if (lightDetail >= 1) {
      const oculusLight = new THREE.PointLight(
        0xffc886,
        .18,
        5.5,
        2,
      )
      oculusLight.position.set(0, 4.05, -73.95)
      oculusLight.castShadow = false
      group.add(oculusLight)
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
