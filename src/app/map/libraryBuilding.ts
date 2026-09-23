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
    context.font = '400 27px system-ui, sans-serif'

    const subtitleWords = subtitle.split(/\s+/)
    const subtitleLines: string[] = []
    let currentLine = ''
    const maxSubtitleWidth = width - 110

    subtitleWords.forEach((word) => {
      const candidate = currentLine ? currentLine + ' ' + word : word
      if (
        context.measureText(candidate).width <= maxSubtitleWidth ||
        currentLine.length === 0
      ) {
        currentLine = candidate
        return
      }
      subtitleLines.push(currentLine)
      currentLine = word
    })
    if (currentLine) subtitleLines.push(currentLine)

    const visibleSubtitleLines =
      subtitleLines.length <= 2
        ? subtitleLines
        : [
            subtitleLines[0],
            subtitleLines.slice(1).join(' '),
          ]
    const subtitleLineHeight = 34
    const subtitleCenterY = height * .72
    const subtitleStartY =
      subtitleCenterY -
      ((visibleSubtitleLines.length - 1) * subtitleLineHeight) / 2

    visibleSubtitleLines.slice(0, 2).forEach((line, index) => {
      context.fillText(
        line,
        width / 2,
        subtitleStartY + index * subtitleLineHeight,
      )
    })

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
    [0, 3.45, 10.55],
    [7.2, 1.5],
  )

  addSign(
    'WELCOME TO ONIRIA',
    'Sanity curates this living DEV.to library. Live articles become books, and each room is a collection you can physically browse.',
    '#f1b76f',
    [0, 2.68, 5.5],
    [5.4, 1.12],
  )
  addSign(
    'HOW TO EXPLORE',
    'WASD move · mouse look · choose a shelf · click a book to read · ESC returns you to the library',
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
        ? .42
        : sourceMode === 'catalog'
          ? .18
          : sourceMode === 'creators'
            ? .3
            : .25

    const accentLight = new THREE.PointLight(
      new THREE.Color(accent),
      roomIntensity,
      10,
      2,
    )
    accentLight.position.set(x, 3.05, z)
    group.add(accentLight)

    // One physically-localized warm pool per hanging fixture. Distance and
    // inverse-square decay keep neighboring rooms from washing into each
    // other, which makes the hallway read as alternating pools of light.
    const pendantGlow = new THREE.PointLight(
      sourceMode === 'catalog' ? 0xe6dfd5 : 0xffd3a0,
      sourceMode === 'featured' ? .76 : sourceMode === 'catalog' ? .36 : .58,
      8.2,
      2,
    )
    pendantGlow.position.set(x, 3.82, z)
    pendantGlow.castShadow = false
    pendantGlow.name = `library-pendant-light-room-${room.slot}`
    group.add(pendantGlow)

    // Keep a restrained downward spot for shape, but let the pendant point
    // light do most of the illumination instead of flattening the whole room.
    const roomSpot = new THREE.SpotLight(
      sourceMode === 'catalog' ? 0xb9c8e8 : 0xffe6c9,
      sourceMode === 'featured' ? .24 : sourceMode === 'catalog' ? .08 : .14,
      7.5,
      Math.PI / 3.6,
      .78,
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
      index === 4 ? 0xe2e0dd : 0xffd3a0,
      index === 4 ? .34 : .52,
      8.5,
      2,
    )
    corridorLight.position.set(0, 3.92, z)
    corridorLight.castShadow = false
    corridorLight.name = `library-pendant-light-hall-${index}`
    group.add(corridorLight)
  })

  ;[
    {position: [-18.2, 2.8, -12] as const, intensity: .4},
    {position: [18, 2.75, -32] as const, intensity: .32},
    {position: [-16, 2.9, -52] as const, intensity: .46},
  ].forEach(({position, intensity}) => {
    const readingLight = new THREE.PointLight(
      0xffcf9e,
      intensity,
      5.5,
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

    // The central runner is intentionally anchored to the floor: it is the
    // one major interior element that does not participate in zero gravity.
    // Tile the authored rug down the full circulation spine and normalize each
    // clone into a narrow runner segment regardless of the source asset's axis.
    if (readingRug) {
      const rugSize = new THREE.Box3()
        .setFromObject(readingRug)
        .getSize(new THREE.Vector3())
      const longAxisIsX = rugSize.x >= rugSize.z
      const sourceLength = Math.max(
        .001,
        longAxisIsX ? rugSize.x : rugSize.z,
      )
      const sourceWidth = Math.max(
        .001,
        longAxisIsX ? rugSize.z : rugSize.x,
      )
      const runnerWidth = 3.05
      const runnerStartZ = 10.2
      const runnerEndZ = -71.2
      const runnerSpan = runnerStartZ - runnerEndZ
      const segmentCount = Math.ceil(runnerSpan / 6.2)
      const segmentLength = runnerSpan / segmentCount

      for (let index = 0; index < segmentCount; index += 1) {
        const z =
          runnerStartZ -
          segmentLength * (index + .5)
        const runner = placeAsset(
          readingRug,
          0,
          .025,
          z,
          1,
          longAxisIsX ? Math.PI / 2 : 0,
        )
        runner.name = `library-central-runner-${index}`
        if (longAxisIsX) {
          runner.scale.x *=
            (segmentLength / sourceLength) * 1.025
          runner.scale.z *= runnerWidth / sourceWidth
        } else {
          runner.scale.x *= runnerWidth / sourceWidth
          runner.scale.z *=
            (segmentLength / sourceLength) * 1.025
        }
        runner.traverse((child) => {
          if (!(child instanceof THREE.Mesh)) return
          child.castShadow = false
          child.receiveShadow = true
        })
      }
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
      issueDesk,
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
            : placement.asset === 'libraryChair' ||
                placement.asset === 'chairWingback'
              ? {
                  tiltX: .045,
                  tiltY: .03,
                  tiltZ: .036,
                  driftX: .07,
                  driftZ: .055,
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
                        tiltX: .009,
                        tiltY: .005,
                        tiltZ: .008,
                        driftX: .012,
                        driftZ: .01,
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

        floatingProps.register(instance, {
          phase: floatingPhase(placement.id),
          hoverAmplitude:
            placement.hoverAmplitude *
            (placement.asset === 'readingTable' ? 1.45 : 1.22),
          hoverSpeed: placement.hoverSpeed * .88,
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
