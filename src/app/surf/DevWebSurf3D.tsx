'use client'

import {useEffect, useRef} from 'react'
import * as THREE from 'three'
import type {LibrarySection, SurfEdge, SurfNode, SurfNodeKind} from './types'
import styles from './surf.module.css'
import {EYE_HEIGHT, FLOOR_COUNT, LANDMARK, ROOMS, ROOM_ORDER, SPAWN, WALK_BOUNDS} from './libraryLayout'
import {LIBRARY_ASSETS, loadLibraryAsset} from './libraryAssets'

type TravelRequest = {
  id: string
  nonce: number
  inspectOnArrival: boolean
} | null

type FloorRequest = {
  floor: number
  nonce: number
} | null

type Props = {
  nodes: SurfNode[]
  edges: SurfEdge[]
  selectedId: string | null
  routeTargetId: string | null
  travelRequest: TravelRequest
  onInspect: (node: SurfNode) => void
  onPutBack: () => void
  onTravel: (node: SurfNode, inspectOnArrival: boolean) => void
  onHover: (node: SurfNode | null) => void
  onPointerLockChange: (locked: boolean) => void
  onZoneChange: (section: LibrarySection) => void
  currentFloor: number
  floorRequest: FloorRequest
  onFloorChange: (floor: number) => void
}

type Visual = {
  id: string
  group: THREE.Group
  body: THREE.Mesh
  material: THREE.MeshPhysicalMaterial
  label: THREE.Sprite
  labelMaterial: THREE.SpriteMaterial
  bookGlowMaterial?: THREE.MeshBasicMaterial
  bookTitleMaterial?: THREE.MeshBasicMaterial
  bookTitleTexture?: THREE.Texture
  bookTitle?: string
  bookSubtitle?: string
  bookAccent?: string
  coverMaterial?: THREE.MeshBasicMaterial
  coverUrl?: string
  coverBlend?: number
  coverBlendTarget?: number
  coverReleaseAt?: number
  archMaterial?: THREE.MeshBasicMaterial
  basePosition: THREE.Vector3
  baseRotationY: number
  shelfKey?: string
  floorIndex: number
  baseScale: number
  phase: number
}

const LIBRARY_FLOOR_COUNT = FLOOR_COUNT
const LIBRARY_FLOOR_HEIGHT = 5.2
const CAMERA_HEIGHT = EYE_HEIGHT

const SECTION_CENTERS = Object.fromEntries(
  (Object.keys(ROOMS) as LibrarySection[]).map((section) => [
    section, new THREE.Vector3(ROOMS[section].center[0], CAMERA_HEIGHT, ROOMS[section].center[1]),
  ]),
) as Record<LibrarySection, THREE.Vector3>
const SECTION_DOORWAYS = Object.fromEntries(
  (Object.keys(ROOMS) as LibrarySection[]).map((section) => [
    section, new THREE.Vector3(ROOMS[section].doorway[0], .09, ROOMS[section].doorway[1]),
  ]),
) as Record<LibrarySection, THREE.Vector3>
const SECTION_ACCENTS = Object.fromEntries(
  (Object.keys(ROOMS) as LibrarySection[]).map((section) => [section, ROOMS[section].accent]),
) as Record<LibrarySection, number>

const KIND_GEOMETRY: Record<SurfNodeKind, () => THREE.BufferGeometry> = {
  home: () => new THREE.CylinderGeometry(.8, 1.05, .72, 8),
  section: () => new THREE.CylinderGeometry(.09, .13, 1.05, 8),
  profile: () => new THREE.BoxGeometry(1.42, 1.8, .16),
  article: () => new THREE.BoxGeometry(.68, .82, .16),
  tag: () => new THREE.BoxGeometry(1.35, 2.15, .14),
  search: () => new THREE.BoxGeometry(1.45, 1.15, .26),
}

function createTextTexture(
  title: string,
  subtitle: string,
  accent: string,
  width = 768,
  height = 192,
) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')

  if (context) {
    context.clearRect(0, 0, width, height)
    const gradient = context.createLinearGradient(40, 0, width - 40, 0)
    gradient.addColorStop(0, 'rgba(5,8,10,0)')
    gradient.addColorStop(.12, 'rgba(5,8,10,.88)')
    gradient.addColorStop(.88, 'rgba(5,8,10,.88)')
    gradient.addColorStop(1, 'rgba(5,8,10,0)')
    context.fillStyle = gradient
    context.fillRect(
      0,
      Math.round(height * .1),
      width,
      Math.round(height * .8),
    )

    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.shadowColor = accent
    context.shadowBlur = 16
    context.fillStyle = '#f5f5f5'
    context.font =
      '700 ' + Math.round(height * .15) + 'px system-ui, sans-serif'
    const cleanTitle =
      title.length > 42 ? title.slice(0, 41) + '…' : title
    context.fillText(cleanTitle, width / 2, height * .41)

    context.shadowBlur = 0
    context.fillStyle = accent
    context.font =
      '500 ' + Math.round(height * .072) + 'px system-ui, sans-serif'
    const cleanSubtitle =
      subtitle.length > 62 ? subtitle.slice(0, 61) + '…' : subtitle
    context.fillText(cleanSubtitle, width / 2, height * .64)
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.minFilter = THREE.LinearFilter
  return texture
}

function createBookTitleTexture(
  title: string,
  subtitle: string,
  accent: string,
) {
  const canvas = document.createElement('canvas')
  canvas.width = 768
  canvas.height = 345
  const context = canvas.getContext('2d')

  if (context) {
    context.clearRect(0, 0, canvas.width, canvas.height)
    context.fillStyle = 'rgba(8,9,14,.94)'
    context.fillRect(0, 0, canvas.width, canvas.height)

    const glow = context.createLinearGradient(0, 0, canvas.width, 0)
    glow.addColorStop(0, accent)
    glow.addColorStop(.5, '#53d3ff')
    glow.addColorStop(1, '#ae7bff')
    context.fillStyle = glow
    context.fillRect(0, 0, canvas.width, 12)

    context.fillStyle = 'rgba(255,255,255,.045)'
    for (let x = 30; x < canvas.width; x += 54) {
      context.fillRect(x, 27, 1, canvas.height - 54)
    }

    const words = title.trim().split(/\s+/)
    const lines: string[] = []
    let line = ''

    context.font = '800 43px system-ui, sans-serif'
    for (const word of words) {
      const next = line ? line + ' ' + word : word
      if (context.measureText(next).width > 645 && line) {
        lines.push(line)
        line = word
        if (lines.length === 2) break
      } else {
        line = next
      }
    }
    if (line && lines.length < 3) lines.push(line)

    context.textAlign = 'left'
    context.textBaseline = 'top'
    context.fillStyle = '#f5f7ff'
    context.shadowColor = accent
    context.shadowBlur = 18
    lines.slice(0, 3).forEach((item, index) => {
      const rendered =
        index === 2 && words.join(' ').length > lines.join(' ').length
          ? item.replace(/[.…]*$/, '') + '…'
          : item
      context.fillText(rendered, 48, 50 + index * 54)
    })

    context.shadowBlur = 0
    context.fillStyle = '#98a2ff'
    context.font = '600 21px system-ui, sans-serif'
    context.fillText(subtitle, 48, 258)

    context.fillStyle = '#6d7280'
    context.font = '500 15px system-ui, sans-serif'
    context.fillText('DEV // ARTICLE', 48, 294)
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.minFilter = THREE.LinearFilter
  return texture
}

function makeCurve(a: THREE.Vector3, b: THREE.Vector3, lift = .2) {
  const start = a.clone()
  const end = b.clone()
  const middle = start.clone().lerp(end, .5)
  middle.y = (start.y + end.y) / 2 + lift
  return new THREE.QuadraticBezierCurve3(start, middle, end)
}

function makeArchitecturalGuide(
  start: THREE.Vector3,
  destination: THREE.Vector3,
  currentSection: LibrarySection,
  targetSection: LibrarySection,
) {
  const startFloor = THREE.MathUtils.clamp(
    Math.round((start.y - CAMERA_HEIGHT) / LIBRARY_FLOOR_HEIGHT),
    0,
    LIBRARY_FLOOR_COUNT - 1,
  )
  const targetFloor = THREE.MathUtils.clamp(
    Math.round((destination.y - CAMERA_HEIGHT) / LIBRARY_FLOOR_HEIGHT),
    0,
    LIBRARY_FLOOR_COUNT - 1,
  )
  const startBase = startFloor * LIBRARY_FLOOR_HEIGHT
  const targetBase = targetFloor * LIBRARY_FLOOR_HEIGHT

  const points: THREE.Vector3[] = [
    new THREE.Vector3(start.x, start.y, start.z),
  ]

  if (startFloor !== targetFloor) {
    points.push(new THREE.Vector3(0, startBase + CAMERA_HEIGHT, 7))
    points.push(new THREE.Vector3(0, targetBase + CAMERA_HEIGHT, 7))
  }

  if (currentSection !== targetSection && targetFloor === 0) {
    if (currentSection !== 'atrium' && startFloor === 0) {
      const exit = SECTION_DOORWAYS[currentSection].clone()
      exit.y = startBase + CAMERA_HEIGHT
      points.push(exit)
      points.push(new THREE.Vector3(0, startBase + CAMERA_HEIGHT, exit.z))
    }

    const entry = SECTION_DOORWAYS[targetSection].clone()
    entry.y = targetBase + CAMERA_HEIGHT
    if (targetSection !== 'atrium') {
      points.push(new THREE.Vector3(0, targetBase + CAMERA_HEIGHT, entry.z))
      points.push(entry)
    } else {
      points.push(entry)
    }
  }

  points.push(
    new THREE.Vector3(destination.x, destination.y, destination.z),
  )

  const deduped = points.filter(
    (point, index, collection) =>
      index === 0 ||
      point.distanceToSquared(collection[index - 1]) > .04,
  )

  if (deduped.length <= 2 && startFloor === targetFloor) {
    return makeCurve(start, destination, .03)
  }

  // Linear segments stay inside the explicit doorway corridor. A spline
  // can bow into a wall even when each of its control points is safe.
  const route = new THREE.CurvePath<THREE.Vector3>()
  for (let index = 1; index < deduped.length; index++) {
    route.add(new THREE.LineCurve3(deduped[index - 1], deduped[index]))
  }
  return route
}

function createSectionSignTexture(
  section: LibrarySection,
  accent: string,
) {
  const canvas = document.createElement('canvas')
  canvas.width = 1024
  canvas.height = 300
  const context = canvas.getContext('2d')
  const icons: Record<LibrarySection, string> = {
    atrium: 'DEV',
    featured: '★',
    latest: 'NEW',
    topics: '#',
    creators: '@',
    search: '⌕',
    archive: '↓',
  }
  const subtitles: Record<LibrarySection, string> = {
    atrium: 'INFORMATION ATRIUM',
    featured: 'POPULAR THIS WEEK',
    latest: 'FRESHLY PUBLISHED',
    topics: 'BROWSE BY TAG',
    creators: 'AUTHOR COLLECTIONS',
    search: 'SEARCH THE LIVE CATALOG',
    archive: 'DEEP COLLECTION',
  }

  if (context) {
    context.clearRect(0, 0, canvas.width, canvas.height)

    const panel = context.createLinearGradient(0, 0, canvas.width, 0)
    panel.addColorStop(0, 'rgba(13,15,22,.98)')
    panel.addColorStop(.5, 'rgba(22,25,35,.98)')
    panel.addColorStop(1, 'rgba(11,13,19,.98)')
    context.fillStyle = panel
    context.fillRect(0, 0, canvas.width, canvas.height)

    const accentGradient = context.createLinearGradient(0, 0, canvas.width, 0)
    accentGradient.addColorStop(0, accent)
    accentGradient.addColorStop(.58, '#53d3ff')
    accentGradient.addColorStop(1, '#ae7bff')
    context.fillStyle = accentGradient
    context.fillRect(0, 0, canvas.width, 12)
    context.fillRect(0, canvas.height - 4, canvas.width, 4)

    context.strokeStyle = 'rgba(255,255,255,.08)'
    context.lineWidth = 2
    context.strokeRect(18, 24, canvas.width - 36, canvas.height - 48)

    context.fillStyle = 'rgba(255,255,255,.035)'
    for (let x = 210; x < canvas.width - 40; x += 54) {
      context.fillRect(x, 40, 1, canvas.height - 80)
    }

    context.textAlign = 'left'
    context.textBaseline = 'middle'
    context.shadowColor = accent
    context.shadowBlur = 24
    context.fillStyle = '#f6f8ff'
    context.font = icons[section].length > 1
      ? '800 66px system-ui, sans-serif'
      : '800 100px system-ui, sans-serif'
    context.fillText(icons[section], 62, 140)

    context.shadowBlur = 0
    context.fillStyle = '#f5f7ff'
    context.font = '800 48px system-ui, sans-serif'
    context.fillText(sectionLabel(section), 245, 118)

    context.fillStyle = accent
    context.font = '700 22px system-ui, sans-serif'
    context.fillText(subtitles[section], 248, 178)

    context.fillStyle = '#8b94a6'
    context.font = '600 18px system-ui, sans-serif'
    context.fillText('DEV LIBRARY', 248, 222)

    context.textAlign = 'right'
    context.fillStyle = '#d9f8ff'
    context.font = '700 42px system-ui, sans-serif'
    context.fillText('→', 940, 145)
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.minFilter = THREE.LinearFilter
  texture.magFilter = THREE.LinearFilter
  return texture
}

function sectionLabel(section: LibrarySection) {
  switch (section) {
    case 'atrium':
      return 'Atrium'
    case 'featured':
      return 'Featured Reading Hall'
    case 'latest':
      return 'New Arrivals'
    case 'topics':
      return 'Topic Wings'
    case 'creators':
      return 'Creator Studies'
    case 'search':
      return 'Card Catalog'
    case 'archive':
      return 'Deep Archive'
  }
}

export default function DevWebSurf3D({
  nodes,
  edges,
  selectedId,
  routeTargetId,
  travelRequest,
  onInspect,
  onPutBack,
  onTravel,
  onHover,
  onPointerLockChange,
  onZoneChange,
  currentFloor,
  floorRequest,
  onFloorChange,
}: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const cameraState = useRef<{position: THREE.Vector3; yaw: number; pitch: number} | null>(null)
  const selectedRef = useRef(selectedId)
  const routeTargetRef = useRef(routeTargetId)
  const travelRequestRef = useRef(travelRequest)
  const inspectRef = useRef(onInspect)
  const putBackRef = useRef(onPutBack)
  const travelRef = useRef(onTravel)
  const hoverRef = useRef(onHover)
  const lockRef = useRef(onPointerLockChange)
  const zoneRef = useRef(onZoneChange)
  const currentFloorRef = useRef(currentFloor)
  const floorRequestRef = useRef(floorRequest)
  const floorChangeRef = useRef(onFloorChange)

  selectedRef.current = selectedId
  routeTargetRef.current = routeTargetId
  travelRequestRef.current = travelRequest
  inspectRef.current = onInspect
  putBackRef.current = onPutBack
  travelRef.current = onTravel
  hoverRef.current = onHover
  lockRef.current = onPointerLockChange
  zoneRef.current = onZoneChange
  currentFloorRef.current = currentFloor
  floorRequestRef.current = floorRequest
  floorChangeRef.current = onFloorChange

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const container = host

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x090a0f)
    scene.fog = new THREE.FogExp2(0x0c0e16, .0115)

    const camera = new THREE.PerspectiveCamera(62, 1, .07, 140)
    camera.position.set(...SPAWN)
    if (cameraState.current) camera.position.copy(cameraState.current.position)

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
    })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.25))
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.06
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFShadowMap
    renderer.shadowMap.autoUpdate = false
    renderer.shadowMap.needsUpdate = true
    renderer.domElement.className = styles.canvas
    renderer.domElement.tabIndex = 0
    container.appendChild(renderer.domElement)

    const ambient = new THREE.HemisphereLight(0xd7defd, 0x101010, 1.35)
    scene.add(ambient)

    const key = new THREE.DirectionalLight(0xf5f5f5, 2.65)
    key.position.set(-9, 13, 9)
    key.castShadow = true
    key.shadow.mapSize.set(1024, 1024)
    key.shadow.bias = -0.0002
    scene.add(key)

    const cyan = new THREE.PointLight(0x3b49df, 10, 34, 2)
    cyan.position.set(-13, 4, -18)
    scene.add(cyan)

    const violet = new THREE.PointLight(0x5965e8, 8, 32, 2)
    violet.position.set(13, 4, -22)
    scene.add(violet)

    const warm = new THREE.PointLight(0xffffff, 4.5, 24, 2)
    warm.position.set(0, 5, -5)
    scene.add(warm)

    const netCyan = new THREE.PointLight(0x53d3ff, 7.5, 32, 2)
    netCyan.position.set(-2, 2.6, -31)
    scene.add(netCyan)

    const netMagenta = new THREE.PointLight(0xff4fd8, 4.2, 24, 2)
    netMagenta.position.set(15, 3.2, -15)
    scene.add(netMagenta)

    const netViolet = new THREE.PointLight(0xae7bff, 4.8, 28, 2)
    netViolet.position.set(-15, 4, -24)
    scene.add(netViolet)

    const architecturalGeometries: THREE.BufferGeometry[] = []
    const architecturalMaterials: THREE.Material[] = []
    const labelsToDispose: THREE.Texture[] = []
    const collisionRects: Array<{
      minX: number
      maxX: number
      minZ: number
      maxZ: number
      minY: number
      maxY: number
    }> = []
    const structuralWallMeshes: THREE.Mesh[] = []
    const remoteTextures = new Set<THREE.Texture>()
    const textureLoader = new THREE.TextureLoader()
    textureLoader.setCrossOrigin('anonymous')
    const coverCache = new Map<
      string,
      {
        texture: THREE.Texture | null
        loading: boolean
        failed: boolean
        lastUsed: number
      }
    >()
    const MAX_RESIDENT_COVERS = 32
    const MAX_ACTIVE_BOOK_DETAILS = 14
    const COVER_LOAD_DISTANCE = 14
    const COVER_EVICT_AGE = 4.5
    const activeCoverUrls = new Set<string>()
    const detailedBookIds = new Set<string>()
    let lastCoverTrim = 0
    let lastDetailSelection = 0
    let destroyed = false

    function attachCachedCover(
      visual: Visual,
      now: number,
    ) {
      if (!visual.coverMaterial || !visual.coverUrl) return

      let entry = coverCache.get(visual.coverUrl)
      if (!entry) {
        entry = {
          texture: null,
          loading: false,
          failed: false,
          lastUsed: now,
        }
        coverCache.set(visual.coverUrl, entry)
      }

      entry.lastUsed = now

      if (entry.texture) {
        if (visual.coverMaterial.map !== entry.texture) {
          visual.coverMaterial.map = entry.texture
          visual.coverBlend = .08
          visual.coverBlendTarget = 1
          visual.coverReleaseAt = undefined
          visual.coverMaterial.color.setRGB(.24, .24, .28)
          visual.coverMaterial.needsUpdate = true
        } else {
          visual.coverBlendTarget = 1
          visual.coverReleaseAt = undefined
        }
        return
      }

      if (entry.loading || entry.failed) return
      entry.loading = true

      const proxied =
        '/api/devto?mode=image&url=' +
        encodeURIComponent(visual.coverUrl)

      textureLoader.load(
        proxied,
        (texture) => {
          entry!.loading = false
          if (destroyed) {
            texture.dispose()
            return
          }

          texture.colorSpace = THREE.SRGBColorSpace
          texture.minFilter = THREE.LinearFilter
          texture.magFilter = THREE.LinearFilter
          texture.anisotropy = Math.min(
            4,
            renderer.capabilities.getMaxAnisotropy(),
          )
          entry!.texture = texture
          entry!.lastUsed = performance.now() / 1000
          remoteTextures.add(texture)

          if (
            detailedBookIds.has(visual.id) &&
            visual.coverMaterial
          ) {
            visual.coverMaterial.map = texture
            visual.coverBlend = .06
            visual.coverBlendTarget = 1
            visual.coverReleaseAt = undefined
            visual.coverMaterial.color.setRGB(.22, .22, .26)
            visual.coverMaterial.needsUpdate = true
          }
        },
        undefined,
        () => {
          entry!.loading = false
          entry!.failed = true
          if (visual.coverMaterial) {
            visual.coverMaterial.map = null
            visual.coverMaterial.color.set(0x171b28)
            visual.coverMaterial.opacity = 1
            visual.coverBlend = 0
            visual.coverBlendTarget = 0
            visual.coverReleaseAt = undefined
            visual.coverMaterial.needsUpdate = true
          }
        },
      )
    }

    function downgradeCover(
      visual: Visual,
      now = performance.now() / 1000,
      immediate = false,
    ) {
      if (!visual.coverMaterial || !visual.coverMaterial.map) return

      if (immediate) {
        visual.coverMaterial.map = null
        visual.coverMaterial.color.set(0x171b28)
        visual.coverMaterial.opacity = 1
        visual.coverBlend = 0
        visual.coverBlendTarget = 0
        visual.coverReleaseAt = undefined
        visual.coverMaterial.needsUpdate = true
        return
      }

      visual.coverBlendTarget = 0
      visual.coverReleaseAt = now + .38
    }

    function ensureBookTitle(visual: Visual) {
      if (
        !visual.bookTitleMaterial ||
        visual.bookTitleTexture ||
        !visual.bookTitle
      ) {
        return
      }

      const texture = createBookTitleTexture(
        visual.bookTitle,
        visual.bookSubtitle ?? '',
        visual.bookAccent ?? '#3b49df',
      )
      visual.bookTitleTexture = texture
      visual.bookTitleMaterial.map = texture
      visual.bookTitleMaterial.color.set(0xffffff)
      visual.bookTitleMaterial.needsUpdate = true
    }

    function downgradeBookTitle(visual: Visual) {
      if (!visual.bookTitleTexture || !visual.bookTitleMaterial) return
      visual.bookTitleMaterial.map = null
      visual.bookTitleMaterial.color.set(0x171b28)
      visual.bookTitleMaterial.needsUpdate = true
      visual.bookTitleTexture.dispose()
      visual.bookTitleTexture = undefined
    }

    function trimCoverCache(now: number) {
      if (now - lastCoverTrim < .75) return
      lastCoverTrim = now

      const resident = [...coverCache.entries()]
        .filter(
          ([url, entry]) =>
            entry.texture && !activeCoverUrls.has(url),
        )
        .sort((a, b) => b[1].lastUsed - a[1].lastUsed)

      const overflow = Math.max(
        0,
        [...coverCache.values()].filter((entry) => entry.texture).length -
          MAX_RESIDENT_COVERS,
      )

      const evictionCandidates =
        overflow > 0
          ? resident
              .slice(-overflow)
              .filter(([, entry]) => now - entry.lastUsed > COVER_EVICT_AGE)
          : []

      evictionCandidates.forEach(([url, entry]) => {
        const texture = entry.texture
        if (!texture) return

        visuals.forEach((visual) => {
          if (
            visual.coverUrl === url &&
            visual.coverMaterial?.map === texture
          ) {
            downgradeCover(visual, now, true)
          }
        })

        remoteTextures.delete(texture)
        texture.dispose()
        entry.texture = null
        entry.loading = false
      })
    }

    const floorMaterial = new THREE.MeshStandardMaterial({
      color: 0x14161d,
      roughness: .72,
      metalness: .18,
    })
    architecturalMaterials.push(floorMaterial)

    const brass = new THREE.MeshStandardMaterial({
      color: 0x3b49df,
      roughness: .48,
      metalness: .55,
      emissive: 0x11173f,
      emissiveIntensity: .14,
    })
    architecturalMaterials.push(brass)

    const shelfMaterial = new THREE.MeshStandardMaterial({
      color: 0x1d2028,
      roughness: .62,
      metalness: .28,
    })
    architecturalMaterials.push(shelfMaterial)

    const concrete = new THREE.MeshStandardMaterial({
      color: 0x15171d,
      roughness: .88,
      metalness: .08,
    })
    architecturalMaterials.push(concrete)

    function addFloor(
      x: number,
      z: number,
      width: number,
      depth: number,
      material = floorMaterial,
      floorBase = 0,
    ) {
      const geometry = new THREE.BoxGeometry(width, .18, depth)
      architecturalGeometries.push(geometry)
      const mesh = new THREE.Mesh(geometry, material)
      mesh.position.set(x, floorBase - .11, z)
      mesh.receiveShadow = true
      scene.add(mesh)
      return mesh
    }

    function addWall(
      x: number,
      z: number,
      width: number,
      depth: number,
      height: number,
      material = concrete,
      floorBase = 0,
    ) {
      const geometry = new THREE.BoxGeometry(width, height, depth)
      architecturalGeometries.push(geometry)
      const mesh = new THREE.Mesh(geometry, material)
      mesh.position.set(x, floorBase + height / 2 - .02, z)
      mesh.castShadow = true
      mesh.receiveShadow = true
      scene.add(mesh)
      structuralWallMeshes.push(mesh)
      collisionRects.push({
        minX: x - width / 2,
        maxX: x + width / 2,
        minZ: z - depth / 2,
        maxZ: z + depth / 2,
        minY: floorBase,
        maxY: floorBase + height,
      })
      return mesh
    }

    const shelfAccentBars: Array<{
      mesh: THREE.Mesh
      material: THREE.MeshBasicMaterial
      center: THREE.Vector3
    }> = []
    const sectionFloorGlows: Array<{
      section: LibrarySection
      mesh: THREE.Mesh
      material: THREE.MeshBasicMaterial
    }> = []
    const sectionBeacons: Array<{
      section: LibrarySection
      materials: THREE.MeshBasicMaterial[]
    }> = []

    function addShelf(
      x: number,
      z: number,
      width: number,
      rotationY = 0,
      floorBase = 0,
    ) {
      const group = new THREE.Group()
      group.position.set(x, floorBase, z)
      group.rotation.y = rotationY

      const sideGeometry = new THREE.BoxGeometry(.16, 3.56, .66)
      const boardGeometry = new THREE.BoxGeometry(width, .1, .66)
      const backGeometry = new THREE.BoxGeometry(width, 3.46, .055)
      architecturalGeometries.push(
        sideGeometry,
        boardGeometry,
        backGeometry,
      )

      const left = new THREE.Mesh(sideGeometry, shelfMaterial)
      const right = new THREE.Mesh(sideGeometry, shelfMaterial)
      left.position.set(-width / 2, 1.76, 0)
      right.position.set(width / 2, 1.76, 0)
      left.castShadow = right.castShadow = floorBase === 0
      group.add(left, right)

      const back = new THREE.Mesh(backGeometry, concrete)
      back.position.set(0, 1.74, -.3)
      back.receiveShadow = true
      group.add(back)

      const boardLevels = [.18, 1.28, 2.38]
      boardLevels.forEach((boardY) => {
        const board = new THREE.Mesh(boardGeometry, shelfMaterial)
        board.position.set(0, boardY, 0)
        board.castShadow = floorBase === 0
        board.receiveShadow = true
        group.add(board)
      })

      const top = new THREE.Mesh(boardGeometry, brass)
      top.position.set(0, 3.48, 0)
      top.scale.y = 1.15
      group.add(top)

      for (let level = 0; level < 3; level += 1) {
        const accentGeometry = new THREE.BoxGeometry(
          width - .24,
          .024,
          .032,
        )
        architecturalGeometries.push(accentGeometry)
        const accentMaterial = new THREE.MeshBasicMaterial({
          color: 0x3b49df,
          transparent: true,
          opacity: .045,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
        architecturalMaterials.push(accentMaterial)
        const accent = new THREE.Mesh(accentGeometry, accentMaterial)
        accent.position.set(0, .245 + level * 1.1, .35)
        group.add(accent)
        shelfAccentBars.push({
          mesh: accent,
          material: accentMaterial,
          center: new THREE.Vector3(
            x,
            floorBase + .245 + level * 1.1,
            z,
          ),
        })
      }

      const rotated = Math.abs(Math.sin(rotationY)) > .5
      collisionRects.push({
        minX: x - (rotated ? .33 : width / 2),
        maxX: x + (rotated ? .33 : width / 2),
        minZ: z - (rotated ? width / 2 : .33),
        maxZ: z + (rotated ? width / 2 : .33),
        minY: floorBase,
        maxY: floorBase + 3.7,
      })

      scene.add(group)
      return group
    }

    function addSectionSign(
      section: LibrarySection,
      x: number,
      y: number,
      z: number,
      accent: string,
      rotationY = 0,
    ) {
      const group = new THREE.Group()
      group.position.set(x, y, z)
      group.rotation.y = rotationY

      const panelGeometry = new THREE.BoxGeometry(4.75, 1.38, .11)
      const faceGeometry = new THREE.PlaneGeometry(4.5, 1.16)
      const edgeGeometry = new THREE.EdgesGeometry(panelGeometry)
      architecturalGeometries.push(
        panelGeometry,
        faceGeometry,
        edgeGeometry,
      )

      const panelMaterial = new THREE.MeshStandardMaterial({
        color: 0x12151d,
        roughness: .42,
        metalness: .52,
        emissive: new THREE.Color(accent).multiplyScalar(.08),
        emissiveIntensity: .35,
      })
      const edgeMaterial = new THREE.LineBasicMaterial({
        color: accent,
        transparent: true,
        opacity: .58,
        blending: THREE.AdditiveBlending,
      })
      architecturalMaterials.push(panelMaterial, edgeMaterial)

      const panel = new THREE.Mesh(panelGeometry, panelMaterial)
      panel.castShadow = true
      group.add(panel)

      const edges = new THREE.LineSegments(edgeGeometry, edgeMaterial)
      group.add(edges)

      const texture = createSectionSignTexture(section, accent)
      labelsToDispose.push(texture)
      const faceMaterial = new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        toneMapped: false,
        depthWrite: false,
      })
      architecturalMaterials.push(faceMaterial)
      const face = new THREE.Mesh(faceGeometry, faceMaterial)
      face.position.z = .061
      face.renderOrder = 7
      group.add(face)

      const underGlowGeometry = new THREE.BoxGeometry(3.7, .025, .025)
      architecturalGeometries.push(underGlowGeometry)
      const underGlowMaterial = new THREE.MeshBasicMaterial({
        color: accent,
        transparent: true,
        opacity: .45,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
      architecturalMaterials.push(underGlowMaterial)
      const underGlow = new THREE.Mesh(
        underGlowGeometry,
        underGlowMaterial,
      )
      underGlow.position.set(0, -.78, .04)
      group.add(underGlow)

      scene.add(group)
      return group
    }

    function addSectionFloorGlow(
      section: LibrarySection,
      x: number,
      z: number,
      radius: number,
    ) {
      const geometry = new THREE.CircleGeometry(radius, 48)
      architecturalGeometries.push(geometry)
      const material = new THREE.MeshBasicMaterial({
        color: SECTION_ACCENTS[section],
        transparent: true,
        opacity: .018,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      })
      architecturalMaterials.push(material)
      const mesh = new THREE.Mesh(geometry, material)
      mesh.rotation.x = -Math.PI / 2
      mesh.position.set(x, .012, z)
      scene.add(mesh)
      sectionFloorGlows.push({section, mesh, material})
    }

    function addDoorwayBeacon(
      section: LibrarySection,
      x: number,
      z: number,
      rotationY = 0,
    ) {
      const group = new THREE.Group()
      group.position.set(x, 0, z)
      group.rotation.y = rotationY

      const materials: THREE.MeshBasicMaterial[] = []
      const makeMaterial = (opacity: number) => {
        const material = new THREE.MeshBasicMaterial({
          color: SECTION_ACCENTS[section],
          transparent: true,
          opacity,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
        architecturalMaterials.push(material)
        materials.push(material)
        return material
      }

      const thresholdGeometry = new THREE.BoxGeometry(2.35, .018, .075)
      const pylonGeometry = new THREE.BoxGeometry(.035, 2.45, .045)
      architecturalGeometries.push(thresholdGeometry, pylonGeometry)

      const threshold = new THREE.Mesh(
        thresholdGeometry,
        makeMaterial(.12),
      )
      threshold.position.set(0, .026, 0)
      group.add(threshold)

      ;[-1.06, 1.06].forEach((offset) => {
        const pylon = new THREE.Mesh(
          pylonGeometry,
          makeMaterial(.065),
        )
        pylon.position.set(offset, 1.22, 0)
        group.add(pylon)
      })

      scene.add(group)
      sectionBeacons.push({section, materials})
    }

    // Netspace underlay: the library still reads as DEV, but the floor
    // behaves like a data plane rather than a conventional building.
    const netGrid = new THREE.GridHelper(82, 82, 0x3b49df, 0x1d223b)
    netGrid.position.set(0, .005, -16)
    const netGridMaterials = Array.isArray(netGrid.material)
      ? netGrid.material
      : [netGrid.material]
    netGridMaterials.forEach((material) => {
      material.transparent = true
      material.opacity = .17
      material.blending = THREE.AdditiveBlending
      architecturalMaterials.push(material)
    })
    scene.add(netGrid)

    const rainCount = 280
    const rainPositions = new Float32Array(rainCount * 3)
    for (let index = 0; index < rainCount; index += 1) {
      const offset = index * 3
      rainPositions[offset] = (Math.random() - .5) * 38
      rainPositions[offset + 1] = Math.random() * 10
      rainPositions[offset + 2] = 12 - Math.random() * 58
    }
    const rainGeometry = new THREE.BufferGeometry()
    rainGeometry.setAttribute(
      'position',
      new THREE.BufferAttribute(rainPositions, 3),
    )
    const rainMaterial = new THREE.PointsMaterial({
      color: 0x53d3ff,
      size: .021,
      transparent: true,
      opacity: .2,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
    const dataRain = new THREE.Points(rainGeometry, rainMaterial)
    scene.add(dataRain)

    const scanGateGeometry = new THREE.PlaneGeometry(18, 5.4)
    const scanGates: Array<{
      mesh: THREE.Mesh
      material: THREE.MeshBasicMaterial
      phase: number
    }> = []
    ;[-3.5, -16.5, -30.5, -42].forEach((z, index) => {
      const material = new THREE.MeshBasicMaterial({
        color: index % 2 ? 0xae7bff : 0x53d3ff,
        transparent: true,
        opacity: .018,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      })
      const gate = new THREE.Mesh(scanGateGeometry, material)
      gate.position.set(0, 2.45, z)
      scene.add(gate)
      scanGates.push({mesh: gate, material, phase: index * 1.7})
      architecturalMaterials.push(material)
    })
    architecturalGeometries.push(scanGateGeometry)

    // One readable ground floor: a strong central spine with six room
    // neighborhoods. Primitive slabs remain as collision-safe backing while
    // the authored library kit supplies the visible architecture.
    addFloor(0, -30, 49, 91)

    const wallRuns = [
      {x: -24.4, z: -30, length: 90, axis: 'z' as const, rotationY: Math.PI / 2, windows: true},
      {x: 24.4, z: -30, length: 90, axis: 'z' as const, rotationY: -Math.PI / 2, windows: true},
      {x: 0, z: 14.7, length: 49, axis: 'x' as const, rotationY: Math.PI, windows: true},
      {x: 0, z: -75, length: 49, axis: 'x' as const, rotationY: 0, windows: true},
    ]

    addWall(-24.4, -30, .3, 90, 6)
    addWall(24.4, -30, .3, 90, 6)
    addWall(0, -75, 49, .3, 6)
    addWall(0, 14.7, 49, .3, 6)

    for (const z of [-22, -42, -62]) {
      addWall(-16.2, z, 16, .28, 5)
      addWall(16.2, z, 16, .28, 5)
      wallRuns.push(
        {x: -16.2, z, length: 16, axis: 'x', rotationY: 0, windows: false},
        {x: 16.2, z, length: 16, axis: 'x', rotationY: 0, windows: false},
      )
    }

    // Doorways are cut into the corridor-facing room walls. These exact wall
    // segments are also reused when the GLB wall panels arrive asynchronously.
    for (const section of ROOM_ORDER) {
      const {center, doorway, accent} = ROOMS[section]
      const left = center[0] < 0
      const edgeX = left ? -8 : 8
      const rotationY = left ? Math.PI / 2 : -Math.PI / 2

      for (const dz of [-6, 6]) {
        addWall(edgeX, center[1] + dz, .28, 8.6, 5)
        wallRuns.push({
          x: edgeX,
          z: center[1] + dz,
          length: 8.6,
          axis: 'z',
          rotationY,
          windows: false,
        })
      }

      addSectionFloorGlow(section, center[0], center[1], 6)
      addDoorwayBeacon(section, doorway[0], doorway[1], Math.PI / 2)
      addSectionSign(
        section,
        left ? -11 : 11,
        3.9,
        center[1],
        '#' + accent.toString(16).padStart(6, '0'),
        rotationY,
      )

      const light = new THREE.PointLight(accent, 3.3, 13, 2)
      light.position.set(center[0], 3.4, center[1])
      scene.add(light)
    }

    addSectionFloorGlow('atrium', 0, 8, 5)
    addSectionSign('atrium', 0, 4.5, 7, '#f5f5f5')
    addWall(-8, 9, .28, 11, 5)
    addWall(8, 9, .28, 11, 5)
    wallRuns.push(
      {x: -8, z: 9, length: 11, axis: 'z', rotationY: Math.PI / 2, windows: false},
      {x: 8, z: 9, length: 11, axis: 'z', rotationY: -Math.PI / 2, windows: false},
    )

    // A visible circulation runner makes the building legible immediately
    // from the entrance and keeps the eye pointed toward the archive landmark.
    const spineGeometry = new THREE.BoxGeometry(2.7, .022, 82)
    architecturalGeometries.push(spineGeometry)
    const spineMaterial = new THREE.MeshBasicMaterial({
      color: 0x3b49df,
      transparent: true,
      opacity: .1,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
    architecturalMaterials.push(spineMaterial)
    const spine = new THREE.Mesh(spineGeometry, spineMaterial)
    spine.position.set(0, .018, -30)
    scene.add(spine)

    const directoryTexture = createTextTexture(
      'DEV LIBRARY DIRECTORY',
      'Featured ← · New Arrivals → · Topics ← · Creators → · Search ← · Archive →',
      '#53d3ff',
      1024,
      256,
    )
    labelsToDispose.push(directoryTexture)
    const directoryMaterial = new THREE.SpriteMaterial({
      map: directoryTexture,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
    })
    architecturalMaterials.push(directoryMaterial)
    const directory = new THREE.Sprite(directoryMaterial)
    directory.position.set(0, 2.7, 10.65)
    directory.scale.set(8.8, 2.2, 1)
    scene.add(directory)

    // A real authored roof now closes the building, so the old decorative
    // upper-floor silhouettes are intentionally gone. They read like exposed
    // shelving once the library became an enclosed building.

    // Every room keeps physical shelf positions even before its live query is
    // opened. Empty neighborhoods therefore still read as a real library.
    const occupiedShelfKeys = new Set<string>()
    nodes.forEach((node) => {
      if (node.kind !== 'article' || !node.shelfKey) return
      occupiedShelfKeys.add(node.shelfKey.replace(/:level-\d+$/, ''))
    })

    const shelfUnits = ROOM_ORDER.flatMap((section) =>
      ROOMS[section].shelves.map((anchor) => ({
        section,
        key: section + ':' + anchor.id,
        ...anchor,
      })),
    )
    const fallbackShelves = new Map<string, THREE.Group>()
    shelfUnits.forEach((shelf) => {
      fallbackShelves.set(
        shelf.key,
        addShelf(shelf.x, shelf.z, 4.5, shelf.rotationY),
      )
    })

    const markerGeometry = new THREE.CylinderGeometry(.9, 1.2, 3.4, 12)
    architecturalGeometries.push(markerGeometry)
    const marker = new THREE.Mesh(markerGeometry, brass)
    marker.position.set(LANDMARK[0], 1.7, LANDMARK[1])
    scene.add(marker)
    collisionRects.push({
      minX: -1.3,
      maxX: 1.3,
      minZ: -73.3,
      maxZ: -70.7,
      minY: 0,
      maxY: 4,
    })

    // Keep a lightweight glow at the information desk. The actual desk is
    // replaced by the authored issue-desk GLB below.
    const deskGlowGeometry = new THREE.TorusGeometry(.55, .03, 8, 48)
    architecturalGeometries.push(deskGlowGeometry)
    const deskGlowMaterial = new THREE.MeshBasicMaterial({
      color: 0x7295ff,
      transparent: true,
      opacity: .3,
    })
    architecturalMaterials.push(deskGlowMaterial)
    const deskGlow = new THREE.Mesh(deskGlowGeometry, deskGlowMaterial)
    deskGlow.position.set(-3.8, 1.05, 8)
    scene.add(deskGlow)

    function addPropCollider(
      x: number,
      z: number,
      width: number,
      depth: number,
      height = 2.2,
    ) {
      collisionRects.push({
        minX: x - width / 2,
        maxX: x + width / 2,
        minZ: z - depth / 2,
        maxZ: z + depth / 2,
        minY: 0,
        maxY: height,
      })
    }

    function placeAsset(
      template: THREE.Group,
      x: number,
      y: number,
      z: number,
      scale = 1,
      rotationY = 0,
      rotationX = 0,
    ) {
      const instance = template.clone(true)
      instance.position.x += x
      instance.position.y += y
      instance.position.z += z
      instance.scale.multiplyScalar(scale)
      instance.rotation.y += rotationY
      instance.rotation.x += rotationX
      instance.traverse((child) => {
        if (!(child instanceof THREE.Mesh)) return
        child.castShadow = true
        child.receiveShadow = true
        child.frustumCulled = true
      })
      scene.add(instance)
      return instance
    }

    const libraryRequests = [
      ['wallPanel', 5, 'height'],
      ['wallCorner', 5, 'height'],
      ['floorParquet', 5.8, 'span'],
      ['roofTile', 5.2, 'span'],
      ['skyDome', 190, 'span'],
      ['stackShelf', 3.5, 'height'],
      ['bookPacked', 2.45, 'span'],
      ['bookLeaning', 2.35, 'span'],
      ['chair', 1.05, 'height'],
      ['issueDesk', 1.45, 'height'],
      ['cardCatalogue', 1.85, 'height'],
      ['displayCase', 1.45, 'height'],
      ['periodicalRack', 1.75, 'height'],
      ['pendantLight', 1.05, 'height'],
      ['archedWindow', 5, 'height'],
      ['readingRug', 3.8, 'span'],
      ['rollingLadder', 2.8, 'height'],
      ['floorLamp', 1.65, 'height'],
      ['readingTable', 1.25, 'height'],
      ['summerClouds', 13.5, 'span'],
    ] as const

    void Promise.allSettled(
      libraryRequests.map(([key, target, mode]) =>
        loadLibraryAsset(LIBRARY_ASSETS[key], target, mode),
      ),
    ).then((results) => {
      if (destroyed) return

      const loaded = Object.fromEntries(
        libraryRequests.map(([key], index) => [
          key,
          results[index].status === 'fulfilled'
            ? (results[index] as PromiseFulfilledResult<THREE.Group>).value
            : null,
        ]),
      ) as Record<(typeof libraryRequests)[number][0], THREE.Group | null>

      results.forEach((result, index) => {
        if (result.status === 'rejected') {
          console.warn(
            '[DevWebSurf3D] Library asset failed:',
            libraryRequests[index][0],
            result.reason,
          )
        }
      })

      const wallPanel = loaded.wallPanel
      const wallCorner = loaded.wallCorner
      const floorParquet = loaded.floorParquet
      const roofTile = loaded.roofTile
      const skyDome = loaded.skyDome
      const stackShelf = loaded.stackShelf
      const bookPacked = loaded.bookPacked
      const bookLeaning = loaded.bookLeaning
      const chair = loaded.chair
      const issueDesk = loaded.issueDesk
      const cardCatalogue = loaded.cardCatalogue
      const displayCase = loaded.displayCase
      const periodicalRack = loaded.periodicalRack
      const pendantLight = loaded.pendantLight
      const archedWindow = loaded.archedWindow
      const readingRug = loaded.readingRug
      const rollingLadder = loaded.rollingLadder
      const floorLamp = loaded.floorLamp
      const readingTable = loaded.readingTable
      const summerClouds = loaded.summerClouds

      if (skyDome) {
        const dome = placeAsset(skyDome, 0, -8, -30)
        dome.traverse((child) => {
          if (!(child instanceof THREE.Mesh)) return

          const sources = Array.isArray(child.material)
            ? child.material
            : [child.material]
          const skyMaterials = sources.map((source) => {
            const color =
              'color' in source && source.color instanceof THREE.Color
                ? source.color.clone()
                : new THREE.Color(0xffffff)
            const material = new THREE.MeshBasicMaterial({
              color,
              vertexColors: true,
              side: THREE.BackSide,
              depthWrite: false,
              depthTest: true,
              fog: false,
              toneMapped: false,
            })
            architecturalMaterials.push(material)
            return material
          })
          child.material =
            Array.isArray(child.material)
              ? skyMaterials
              : skyMaterials[0]
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

        // Wall panels and arched windows are both treated as interchangeable
        // bays. Each clone is scaled to the exact bay width plus a tiny
        // overlap, so there is never daylight between neighboring GLBs.
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

        // The primitive walls remain as collision geometry, but once the real
        // wall kit has loaded they must not sit behind the windows and turn
        // every opening black.
        structuralWallMeshes.forEach((mesh) => {
          mesh.visible = false
        })
      }

      if (wallCorner) {
        const corners = [
          {x: -24.4, z: 14.7, r: Math.PI / 2},
          {x: 24.4, z: 14.7, r: Math.PI},
          {x: 24.4, z: -75, r: -Math.PI / 2},
          {x: -24.4, z: -75, r: 0},
        ]
        corners.forEach(({x, z, r}) =>
          placeAsset(wallCorner, x, .04, z, 1, r),
        )
      }

      if (floorParquet) {
        const floorSize = new THREE.Box3()
          .setFromObject(floorParquet)
          .getSize(new THREE.Vector3())
        const tileX = Math.max(2.4, floorSize.x)
        const tileZ = Math.max(2.4, floorSize.z)

        const tileArea = (
          centerX: number,
          centerZ: number,
          width: number,
          depth: number,
        ) => {
          const countX = Math.max(1, Math.ceil(width / tileX))
          const countZ = Math.max(1, Math.ceil(depth / tileZ))
          const cellX = width / countX
          const cellZ = depth / countZ

          for (let ix = 0; ix < countX; ix += 1) {
            for (let iz = 0; iz < countZ; iz += 1) {
              const x = centerX - width / 2 + cellX * (ix + .5)
              const z = centerZ - depth / 2 + cellZ * (iz + .5)
              const tile = placeAsset(floorParquet, x, .008, z)
              tile.scale.x *= (cellX / floorSize.x) * .995
              tile.scale.z *= (cellZ / floorSize.z) * .995
            }
          }
        }

        tileArea(0, -30, 15.3, 89)
        ROOM_ORDER.forEach((section) => {
          const [x, z] = ROOMS[section].center
          tileArea(x, z, 15.5, 16.4)
        })
        tileArea(0, 9, 15.3, 10.5)
      }

      if (roofTile) {
        const roofSize = new THREE.Box3()
          .setFromObject(roofTile)
          .getSize(new THREE.Vector3())
        const tileX = Math.max(1.2, roofSize.x)
        const tileZ = Math.max(1.2, roofSize.z)
        const roofWidth = 48.9
        const roofDepth = 89.6
        const roofCenterZ = -30.15
        const countX = Math.max(1, Math.ceil(roofWidth / tileX))
        const countZ = Math.max(1, Math.ceil(roofDepth / tileZ))
        const cellX = roofWidth / countX
        const cellZ = roofDepth / countZ

        for (let ix = 0; ix < countX; ix += 1) {
          for (let iz = 0; iz < countZ; iz += 1) {
            const x =
              -roofWidth / 2 + cellX * (ix + .5)
            const z =
              roofCenterZ - roofDepth / 2 + cellZ * (iz + .5)
            const tile = placeAsset(roofTile, x, 5.03, z)
            // 1.5% overlap removes hairline cracks from floating point
            // precision and camera-angle aliasing.
            tile.scale.x *= (cellX / roofSize.x) * 1.015
            tile.scale.z *= (cellZ / roofSize.z) * 1.015
            tile.traverse((child) => {
              if (!(child instanceof THREE.Mesh)) return
              child.castShadow = true
              child.receiveShadow = false
            })
          }
        }
      }

      if (stackShelf) {
        shelfUnits.forEach((shelf, index) => {
          fallbackShelves.get(shelf.key)!.visible = false
          placeAsset(
            stackShelf,
            shelf.x,
            .02,
            shelf.z,
            1,
            shelf.rotationY,
          )

          if (!occupiedShelfKeys.has(shelf.key)) {
            const filler = index % 2 === 0 ? bookPacked : bookLeaning
            if (filler) {
              placeAsset(
                filler,
                shelf.x,
                .84,
                shelf.z,
                .88,
                shelf.rotationY,
              )
              placeAsset(
                filler,
                shelf.x,
                1.86,
                shelf.z,
                .82,
                shelf.rotationY,
              )
            }
          }
        })
      }

      if (pendantLight) {
        ROOM_ORDER.forEach((section) => {
          const [x, z] = ROOMS[section].center
          placeAsset(pendantLight, x, 4.05, z)
        })
        for (const z of [6, -8, -28, -48, -68]) {
          placeAsset(pendantLight, 0, 4.2, z, .92)
        }
      }

      if (issueDesk) {
        placeAsset(issueDesk, -3.8, .03, 8, 1, Math.PI / 2)
        placeAsset(issueDesk, -16, .03, -52, .9, 0)
        addPropCollider(-3.8, 8, 3, 1.4, 1.6)
        addPropCollider(-16, -52, 2.7, 1.5, 1.6)
      }

      if (displayCase) {
        placeAsset(displayCase, -16, .03, -12, 1, Math.PI / 2)
        addPropCollider(-16, -12, 2.1, 1.1, 1.8)
      }

      if (periodicalRack) {
        placeAsset(periodicalRack, 16, .03, -12, 1, -Math.PI / 2)
        addPropCollider(16, -12, 1.8, 1, 1.9)
      }

      if (cardCatalogue) {
        placeAsset(cardCatalogue, -16, .03, -32, .95, Math.PI / 2)
        placeAsset(cardCatalogue, -12.5, .03, -52, .86, Math.PI / 2)
        addPropCollider(-16, -32, 2.2, 1.4, 2)
      }

      if (readingRug) {
        placeAsset(readingRug, 16, .018, -32, .92)
        placeAsset(readingRug, -16, .018, -12, .72)
      }

      if (readingTable) {
        placeAsset(readingTable, 16, .03, -32)
        addPropCollider(16, -32, 2.7, 2.2, 1.4)
      }

      if (chair) {
        const creatorChairs = [
          {x: 14.7, z: -32, r: Math.PI / 2},
          {x: 17.3, z: -32, r: -Math.PI / 2},
          {x: 16, z: -33.5, r: 0},
          {x: 16, z: -30.5, r: Math.PI},
        ]
        creatorChairs.forEach(({x, z, r}) =>
          placeAsset(chair, x, .03, z, .96, r),
        )
      }

      if (floorLamp) {
        placeAsset(floorLamp, 18.3, .03, -30.2, .96)
        placeAsset(floorLamp, -18.2, .03, -10.2, .96)
        placeAsset(floorLamp, 18.4, .03, -50.2, .96)
      }

      if (rollingLadder) {
        placeAsset(rollingLadder, 18.8, .03, -54.2, .9, Math.PI)
        addPropCollider(18.8, -54.2, 1.3, 1.1, 3)
      }

      // The cloud model remains exterior decoration: it is visible through
      // the authored arched windows but never enters the navigable collision
      // volume.
      if (summerClouds) {
        const cloudPlacements = [
          {x: -34, y: 9, z: -8, s: .75},
          {x: 35, y: 11, z: -35, s: .92},
          {x: -36, y: 13, z: -62, s: 1.05},
        ]
        cloudPlacements.forEach(({x, y, z, s}, index) =>
          placeAsset(
            summerClouds,
            x,
            y,
            z,
            s,
            index * .8,
          ),
        )
      }

      renderer.shadowMap.needsUpdate = true
      console.info(
        '[DevWebSurf3D] Loaded library kit:',
        Object.values(loaded).filter(Boolean).length + '/' + libraryRequests.length,
      )
    })

    const nodeById = new Map(nodes.map((node) => [node.id, node]))
    const visuals = new Map<string, Visual>()
    const interactive: THREE.Object3D[] = []
    const disposableTextures: THREE.Texture[] = []

    const nodeGeometryCache = new Map<SurfNodeKind, THREE.BufferGeometry>()
    function getNodeGeometry(kind: SurfNodeKind) {
      let geometry = nodeGeometryCache.get(kind)
      if (!geometry) {
        geometry = KIND_GEOMETRY[kind]()
        nodeGeometryCache.set(kind, geometry)
        architecturalGeometries.push(geometry)
      }
      return geometry
    }

    const articleSpineGeometry = new THREE.BoxGeometry(.07, .8, .185)
    const articleCoverGeometry = new THREE.PlaneGeometry(.56, .44)
    const articleTitleGeometry = new THREE.PlaneGeometry(.58, .22)
    const articleGlowGeometry = new THREE.PlaneGeometry(.76, .92)
    const articleEdgeGeometry = new THREE.EdgesGeometry(
      getNodeGeometry('article'),
      28,
    )
    architecturalGeometries.push(
      articleSpineGeometry,
      articleCoverGeometry,
      articleTitleGeometry,
      articleGlowGeometry,
      articleEdgeGeometry,
    )

    const sharedArticleSpineMaterial = new THREE.MeshStandardMaterial({
      color: 0x3b49df,
      emissive: 0x1c2a88,
      emissiveIntensity: .72,
      roughness: .3,
      metalness: .48,
    })
    const sharedArticleEdgeMaterial = new THREE.LineBasicMaterial({
      color: 0x5267ff,
      transparent: true,
      opacity: .34,
      blending: THREE.AdditiveBlending,
    })
    architecturalMaterials.push(
      sharedArticleSpineMaterial,
      sharedArticleEdgeMaterial,
    )

    const visualsByFloor = new Map<
      number,
      Array<[string, Visual]>
    >()

    nodes.forEach((node, index) => {
      const group = new THREE.Group()
      group.position.set(...node.position)
      group.rotation.y = node.rotationY ?? 0
      scene.add(group)

      const color = new THREE.Color(node.accent)
      const material = new THREE.MeshPhysicalMaterial({
        color: color.clone().multiplyScalar(
          node.kind === 'article' ? .36 : .48,
        ),
        emissive: color.clone(),
        emissiveIntensity:
          node.kind === 'section' ? .62 : .34 + node.importance * .34,
        roughness:
          node.kind === 'article' ? .52 : node.kind === 'profile' ? .3 : .38,
        metalness:
          node.kind === 'profile' || node.kind === 'section' ? .32 : .12,
        clearcoat: node.kind === 'article' ? .35 : .72,
        clearcoatRoughness: .16,
        transparent: true,
        opacity: node.kind === 'section' ? .72 : .94,
      })

      const body = new THREE.Mesh(getNodeGeometry(node.kind), material)
      body.userData.nodeId = node.id
      body.castShadow = true
      body.receiveShadow = true
      interactive.push(body)
      group.add(body)

      let bookGlowMaterial: THREE.MeshBasicMaterial | undefined
      let bookTitleMaterial: THREE.MeshBasicMaterial | undefined
      let coverMaterialRef: THREE.MeshBasicMaterial | undefined
      let coverUrl: string | undefined
      let archMaterialRef: THREE.MeshBasicMaterial | undefined

      if (node.kind === 'article') {
        material.color.set(0x11131a)
        material.emissive.copy(color.clone().multiplyScalar(.26))
        material.emissiveIntensity = .48
        material.roughness = .34
        material.metalness = .2
        material.clearcoat = .62

        const spine = new THREE.Mesh(
          articleSpineGeometry,
          sharedArticleSpineMaterial,
        )
        spine.position.set(-.39, 0, 0)
        group.add(spine)

        const coverMaterial = new THREE.MeshBasicMaterial({
          color: 0x161a27,
          transparent: false,
          opacity: 1,
          toneMapped: false,
          depthWrite: true,
          polygonOffset: true,
          polygonOffsetFactor: -2,
          polygonOffsetUnits: -2,
        })
        architecturalMaterials.push(coverMaterial)
        const cover = new THREE.Mesh(
          articleCoverGeometry,
          coverMaterial,
        )
        cover.position.set(.012, .12, .096)
        cover.renderOrder = 4
        group.add(cover)

        const remoteCover =
          node.payload?.cover_image ?? node.payload?.social_image ?? null
        coverMaterialRef = coverMaterial
        coverUrl = remoteCover ?? undefined

        bookTitleMaterial = new THREE.MeshBasicMaterial({
          color: 0x171b28,
          transparent: false,
          opacity: 1,
          toneMapped: false,
          depthWrite: true,
          polygonOffset: true,
          polygonOffsetFactor: -3,
          polygonOffsetUnits: -3,
        })
        architecturalMaterials.push(bookTitleMaterial)
        const titlePanel = new THREE.Mesh(
          articleTitleGeometry,
          bookTitleMaterial,
        )
        titlePanel.position.set(.012, -.26, .101)
        titlePanel.renderOrder = 5
        group.add(titlePanel)

        
        bookGlowMaterial = new THREE.MeshBasicMaterial({
          color: color.clone().lerp(new THREE.Color(0x53d3ff), .3),
          transparent: true,
          opacity: .055,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          side: THREE.DoubleSide,
        })
        architecturalMaterials.push(bookGlowMaterial)
        const glow = new THREE.Mesh(
          articleGlowGeometry,
          bookGlowMaterial,
        )
        glow.position.z = -.095
        group.add(glow)

        const edges = new THREE.LineSegments(
          articleEdgeGeometry,
          sharedArticleEdgeMaterial,
        )
        edges.renderOrder = 3
        group.add(edges)
      }

      if (node.kind === 'profile') {
        const haloGeometry = new THREE.TorusGeometry(.82, .025, 8, 64)
        const haloMaterial = new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: .3,
          blending: THREE.AdditiveBlending,
        })
        architecturalGeometries.push(haloGeometry)
        architecturalMaterials.push(haloMaterial)
        const halo = new THREE.Mesh(haloGeometry, haloMaterial)
        halo.position.z = .11
        group.add(halo)
      }

      if (node.kind === 'tag' || node.kind === 'section') {
        const archGeometry = new THREE.TorusGeometry(
          node.kind === 'section' ? 1.1 : .82,
          .055,
          10,
          64,
          Math.PI,
        )
        const archMaterial = new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: .35,
          blending: THREE.AdditiveBlending,
        })
        architecturalGeometries.push(archGeometry)
        architecturalMaterials.push(archMaterial)
        archMaterialRef = archMaterial
        const arch = new THREE.Mesh(archGeometry, archMaterial)
        arch.rotation.z = Math.PI
        arch.position.y = node.kind === 'section' ? .7 : .6
        arch.position.z = .12
        group.add(arch)
      }

      const labelTexture =
        node.kind === 'article'
          ? null
          : createTextTexture(
              node.title,
              node.subtitle,
              node.accent,
            )
      if (labelTexture) {
        disposableTextures.push(labelTexture)
      }
      const labelMaterial = new THREE.SpriteMaterial({
        ...(labelTexture ? {map: labelTexture} : {}),
        transparent: true,
        opacity:
          node.kind === 'article'
            ? 0
            : node.kind === 'section' || node.kind === 'home'
              ? .98
              : node.kind === 'profile' || node.kind === 'tag'
                ? .82
                : .7,
        depthWrite: false,
        toneMapped: false,
      })
      const label = new THREE.Sprite(labelMaterial)
      label.position.set(
        0,
        node.kind === 'profile' ? 1.5 : 1.75,
        0,
      )
      label.scale.set(4.7, 1.12, 1)
      if (node.kind !== 'article') {
        group.add(label)
      }

      const baseScale =
        node.kind === 'section'
          ? .95
          : node.kind === 'home'
            ? 1
            : node.kind === 'profile'
              ? 1.04
              : node.kind === 'tag'
                ? .86
                : .88 + Math.min(.2, node.importance * .075)

      group.scale.setScalar(baseScale)

      const visual: Visual = {
        id: node.id,
        group,
        body,
        material,
        label,
        labelMaterial,
        bookGlowMaterial,
        bookTitleMaterial,
        bookTitle: node.kind === 'article' ? node.title : undefined,
        bookSubtitle:
          node.kind === 'article'
            ? '@' + (node.username ?? node.payload?.user.username ?? 'dev')
            : undefined,
        bookAccent: node.kind === 'article' ? node.accent : undefined,
        coverMaterial: coverMaterialRef,
        coverUrl,
        coverBlend: 0,
        coverBlendTarget: 0,
        archMaterial: archMaterialRef,
        basePosition: new THREE.Vector3(...node.position),
        baseRotationY: node.rotationY ?? 0,
        shelfKey: node.shelfKey,
        floorIndex: node.floorIndex ?? 0,
        baseScale,
        phase: index * .67,
      }
      visuals.set(node.id, visual)
      const floorEntries =
        visualsByFloor.get(visual.floorIndex) ?? []
      floorEntries.push([node.id, visual])
      visualsByFloor.set(visual.floorIndex, floorEntries)
    })

    function setVisibleFloor(floor: number) {
      detailedBookIds.clear()
      activeCoverUrls.clear()
      visualsByFloor.forEach((entries, floorIndex) => {
        const visible = floorIndex === floor
        entries.forEach(([, visual]) => {
          visual.group.visible = visible
          if (!visible) {
            downgradeCover(
              visual,
              performance.now() / 1000,
              true,
            )
            downgradeBookTitle(visual)
          }
        })
      })
      lastDetailSelection = 0
    }
    setVisibleFloor(currentFloorRef.current)

    // Relationships become floor routes / corridors instead of floating graph
    // spaghetti. Only the most meaningful routes are rendered.
    const routeVisuals = edges
      .filter(
        (edge) =>
          edge.kind === 'corridor' ||
          edge.weight >= 1.5 ||
          edge.source === selectedRef.current ||
          edge.target === selectedRef.current,
      )
      .slice(0, 48)
      .map((edge, index) => {
        const source = visuals.get(edge.source)
        const target = visuals.get(edge.target)
        if (!source || !target) return null

        const curve = makeCurve(
          source.group.position,
          target.group.position,
          edge.kind === 'corridor' ? 0 : .16,
        )
        const baseColor = new THREE.Color(
          edge.kind === 'author'
            ? 0xae7bff
            : edge.kind === 'tag'
              ? 0x53d3ff
              : edge.kind === 'search'
                ? 0xff4fd8
                : edge.kind === 'corridor'
                  ? 0x5965e8
                  : 0x3b49df,
        )
        const geometry = new THREE.TubeGeometry(
          curve,
          32,
          edge.kind === 'corridor' ? .052 : .027,
          6,
          false,
        )
        const material = new THREE.MeshBasicMaterial({
          color: baseColor,
          transparent: true,
          opacity: edge.kind === 'corridor' ? .34 : .24,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
        const route = new THREE.Mesh(geometry, material)
        scene.add(route)

        const glowGeometry = new THREE.TubeGeometry(
          curve,
          32,
          edge.kind === 'corridor' ? .105 : .057,
          6,
          false,
        )
        const glowMaterial = new THREE.MeshBasicMaterial({
          color: baseColor,
          transparent: true,
          opacity: edge.kind === 'corridor' ? .045 : .028,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
        const glowRoute = new THREE.Mesh(glowGeometry, glowMaterial)
        scene.add(glowRoute)

        const packetGeometry = new THREE.SphereGeometry(.035, 7, 7)
        const packetMaterial = new THREE.MeshBasicMaterial({
          color: baseColor,
          transparent: true,
          opacity: .82,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
        const packets = Array.from({length: 3}, () => {
          const packet = new THREE.Mesh(packetGeometry, packetMaterial)
          scene.add(packet)
          return packet
        })

        return {
          edge,
          curve,
          geometry,
          material,
          route,
          glowGeometry,
          glowMaterial,
          glowRoute,
          packets,
          packetGeometry,
          packetMaterial,
          baseColor,
          sourceFloor: source.floorIndex,
          targetFloor: target.floorIndex,
          phase: index * .13,
        }
      })
      .filter((value): value is NonNullable<typeof value> => value !== null)

    // Route guidance is a museum/library breadcrumb painted on the floor.
    const guideGeometry = new THREE.BufferGeometry()
    const guideBaseMaterial = new THREE.LineBasicMaterial({
      color: 0x53d3ff,
      transparent: true,
      opacity: .28,
      blending: THREE.AdditiveBlending,
    })
    const guideBaseLine = new THREE.Line(guideGeometry, guideBaseMaterial)
    guideBaseLine.visible = false
    scene.add(guideBaseLine)

    const guideMaterial = new THREE.LineDashedMaterial({
      color: 0x8ae8ff,
      transparent: true,
      opacity: .98,
      dashSize: .48,
      gapSize: .1,
    })
    const guideLine = new THREE.Line(guideGeometry, guideMaterial)
    guideLine.visible = false
    scene.add(guideLine)

    const guidePacketGeometry = new THREE.SphereGeometry(.055, 10, 10)
    const guidePacketMaterial = new THREE.MeshBasicMaterial({
      color: 0xc2f5ff,
      transparent: true,
      opacity: .95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
    const guidePackets = Array.from({length: 4}, () => {
      const packet = new THREE.Mesh(
        guidePacketGeometry,
        guidePacketMaterial,
      )
      packet.visible = false
      scene.add(packet)
      return packet
    })
    let activeGuideCurve: THREE.Curve<THREE.Vector3> | null = null

    const floorStripGeometry = new THREE.BoxGeometry(.44, .018, .055)
    const floorStrips = Array.from({length: 30}, (_, index) => {
      const material = new THREE.MeshBasicMaterial({
        color: index % 5 === 0 ? 0xc2f5ff : 0x53d3ff,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
      const mesh = new THREE.Mesh(floorStripGeometry, material)
      mesh.visible = false
      scene.add(mesh)
      architecturalMaterials.push(material)
      return {mesh, material}
    })
    architecturalGeometries.push(floorStripGeometry)

    const arrowShape = new THREE.Shape()
    arrowShape.moveTo(0, .28)
    arrowShape.lineTo(.16, .02)
    arrowShape.lineTo(.065, .02)
    arrowShape.lineTo(.065, -.24)
    arrowShape.lineTo(-.065, -.24)
    arrowShape.lineTo(-.065, .02)
    arrowShape.lineTo(-.16, .02)
    arrowShape.closePath()
    const arrowGeometry = new THREE.ShapeGeometry(arrowShape)
    const junctionMarkers = Array.from({length: 6}, (_, index) => {
      const material = new THREE.MeshBasicMaterial({
        color: index % 2 ? 0x8ae8ff : 0x6477ff,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      })
      const mesh = new THREE.Mesh(arrowGeometry, material)
      mesh.rotation.x = -Math.PI / 2
      mesh.visible = false
      scene.add(mesh)
      architecturalMaterials.push(material)
      return {mesh, material}
    })
    architecturalGeometries.push(arrowGeometry)

    const raycaster = new THREE.Raycaster()
    const center = new THREE.Vector2(0, 0)
    const keys = new Set<string>()
    const position = camera.position.clone()
    const velocity = new THREE.Vector3()
    const forward = new THREE.Vector3()
    const right = new THREE.Vector3()
    const up = new THREE.Vector3(0, 1, 0)
    const move = new THREE.Vector3()
    const tempWorldPosition = new THREE.Vector3()
    const tempDirection = new THREE.Vector3()
    const tempTargetPosition = new THREE.Vector3()
    const tempScale = new THREE.Vector3()
    const reducedMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches
    const euler = new THREE.Euler(0, 0, 0, 'YXZ')
    let yaw = cameraState.current?.yaw ?? 0
    let pitch = cameraState.current?.pitch ?? 0
    let hoverId: string | null = null
    let currentSection: LibrarySection = 'atrium'
    let lastTime = performance.now()
    let frame = 0
    let lastTravelNonce = travelRequestRef.current?.nonce ?? -1
    let lastFloorNonce = floorRequestRef.current?.nonce ?? -1
    let currentFloorIndex = currentFloorRef.current

    let travel:
      | {
          curve: THREE.Curve<THREE.Vector3>
          target: THREE.Vector3
          node: SurfNode
          startedAt: number
          duration: number
          inspectOnArrival: boolean
        }
      | null = null

    let floorTravel:
      | {
          curve: THREE.Curve<THREE.Vector3>
          targetFloor: number
          startedAt: number
          duration: number
        }
      | null = null

    function startFloorTravel(targetFloor: number) {
      const clamped = THREE.MathUtils.clamp(
        targetFloor,
        0,
        LIBRARY_FLOOR_COUNT - 1,
      )
      if (clamped === currentFloorIndex) return

      const targetY =
        clamped * LIBRARY_FLOOR_HEIGHT + CAMERA_HEIGHT
      const points = [
        camera.position.clone(),
        new THREE.Vector3(0, camera.position.y, 7),
        new THREE.Vector3(0, targetY, 7),
        new THREE.Vector3(0, targetY, 5.2),
      ]
      floorTravel = {
        curve: new THREE.CatmullRomCurve3(
          points,
          false,
          'centripetal',
          .35,
        ),
        targetFloor: clamped,
        startedAt: performance.now() / 1000,
        duration: reducedMotion ? 1.1 : 1.65,
      }
      travel = null
      velocity.set(0, 0, 0)
    }

    function pickCenter() {
      raycaster.setFromCamera(center, camera)
      const hit = raycaster.intersectObjects(interactive, false)[0]
      if (!hit || hit.distance > 3.8) return null
      const nodeId = hit.object.userData.nodeId as string | undefined
      const node = nodeId ? nodeById.get(nodeId) ?? null : null
      if (!node) return null
      return (node.floorIndex ?? 0) === currentFloorIndex
        ? node
        : null
    }

    function startTravel(
      node: SurfNode,
      inspectOnArrival = true,
    ) {
      const visual = visuals.get(node.id)
      if (!visual) return

      const source = camera.position.clone()
      const destination = visual.group.getWorldPosition(
        new THREE.Vector3(),
      )
      const standOff =
        node.kind === 'section'
          ? 2.35
          : node.kind === 'article'
            ? 1.38
            : 1.65
      tempDirection
        .set(0, 0, 1)
        .applyAxisAngle(up, node.rotationY ?? 0)
      destination.addScaledVector(tempDirection, standOff)
      destination.y =
        (node.floorIndex ?? currentFloorIndex) *
          LIBRARY_FLOOR_HEIGHT +
        CAMERA_HEIGHT

      const curve = makeArchitecturalGuide(
        source,
        destination,
        currentSection,
        node.section ?? currentSection,
      )

      travel = {
        curve,
        target: destination,
        node,
        startedAt: performance.now() / 1000,
        duration: THREE.MathUtils.clamp(
          curve.getLength() / 4.9,
          1,
          3.4,
        ),
        inspectOnArrival,
      }
    }

    function collides(
      next: THREE.Vector3,
      radius = .31,
    ) {
      return collisionRects.some(
        (rect) =>
          next.y >= rect.minY - .2 &&
          next.y <= rect.maxY + .2 &&
          next.x + radius > rect.minX &&
          next.x - radius < rect.maxX &&
          next.z + radius > rect.minZ &&
          next.z - radius < rect.maxZ,
      )
    }

    function moveWithSliding(deltaMove: THREE.Vector3) {
      const nextX = position.clone()
      nextX.x = THREE.MathUtils.clamp(
        nextX.x + deltaMove.x,
        WALK_BOUNDS.minX,
        WALK_BOUNDS.maxX,
      )
      if (!collides(nextX)) {
        position.x = nextX.x
      } else {
        velocity.x *= .12
      }

      const nextZ = position.clone()
      nextZ.z = THREE.MathUtils.clamp(
        nextZ.z + deltaMove.z,
        WALK_BOUNDS.minZ,
        WALK_BOUNDS.maxZ,
      )
      if (!collides(nextZ)) {
        position.z = nextZ.z
      } else {
        velocity.z *= .12
      }
    }

    function onMouseMove(event: MouseEvent) {
      if (
        document.pointerLockElement !== renderer.domElement ||
        travel ||
        floorTravel
      ) {
        return
      }
      yaw -= event.movementX * .00132
      pitch -= event.movementY * .00116
      pitch = THREE.MathUtils.clamp(pitch, -.52, .52)
    }

    function onKeyDown(event: KeyboardEvent) {
      const target = event.target
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement
      ) {
        return
      }

      keys.add(event.code)

      const pointerLocked =
        document.pointerLockElement === renderer.domElement

      if (
        pointerLocked &&
        (
          event.code === 'Digit1' ||
          event.code === 'Digit2' ||
          event.code === 'Digit3' ||
          event.code === 'Digit4'
        )
      ) {
        event.preventDefault()
        const targetFloor = Number(event.code.slice(-1)) - 1
        startFloorTravel(targetFloor)
        return
      }

      if (pointerLocked && event.code === 'PageUp') {
        event.preventDefault()
        startFloorTravel(
          Math.min(
            LIBRARY_FLOOR_COUNT - 1,
            currentFloorIndex + 1,
          ),
        )
        return
      }

      if (pointerLocked && event.code === 'PageDown') {
        event.preventDefault()
        startFloorTravel(Math.max(0, currentFloorIndex - 1))
        return
      }

      if (event.code === 'KeyE') {
        event.preventDefault()
        const selectedNode = selectedRef.current
          ? nodeById.get(selectedRef.current)
          : undefined
        if (selectedNode?.kind === 'article') {
          putBackRef.current()
          return
        }

        const node = pickCenter()
        if (node) inspectRef.current(node)
      }

      if (event.code === 'KeyF') {
        event.preventDefault()
        const node =
          (selectedRef.current
            ? nodeById.get(selectedRef.current)
            : undefined) ?? pickCenter()
        if (node) {
          startTravel(node, true)
        }
      }

      if (event.code === 'Escape') {
        document.exitPointerLock?.()
      }
    }

    function onKeyUp(event: KeyboardEvent) {
      keys.delete(event.code)
    }

    function onCanvasClick() {
      if (document.pointerLockElement !== renderer.domElement) {
        void renderer.domElement.requestPointerLock()
        return
      }

      const node = pickCenter()
      if (node) inspectRef.current(node)
    }

    function onPointerLock() {
      const locked = document.pointerLockElement === renderer.domElement
      lockRef.current(locked)
      if (!locked) keys.clear()
    }

    renderer.domElement.addEventListener('click', onCanvasClick)
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('pointerlockchange', onPointerLock)
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)

    function resize() {
      const rect = container.getBoundingClientRect()
      camera.aspect = rect.width / Math.max(1, rect.height)
      camera.updateProjectionMatrix()
      renderer.setSize(rect.width, rect.height, false)
    }

    const resizeObserver = new ResizeObserver(resize)
    resizeObserver.observe(container)
    resize()

    function animate(nowMs: number) {
      frame = requestAnimationFrame(animate)
      const now = nowMs / 1000
      const delta = Math.min(
        .05,
        Math.max(.001, (nowMs - lastTime) / 1000),
      )
      lastTime = nowMs

      const floorRequest = floorRequestRef.current
      if (
        floorRequest &&
        floorRequest.nonce !== lastFloorNonce
      ) {
        lastFloorNonce = floorRequest.nonce
        startFloorTravel(floorRequest.floor)
      }

      const request = travelRequestRef.current
      if (request && request.nonce !== lastTravelNonce) {
        lastTravelNonce = request.nonce
        const node = nodeById.get(request.id)
        if (node) {
          startTravel(node, request.inspectOnArrival)
        }
      }

      const aimed = pickCenter()
      const aimedId = aimed?.id ?? null
      if (aimedId !== hoverId) {
        hoverId = aimedId
        hoverRef.current(aimed ?? null)
      }

      const selectedNode = selectedRef.current
        ? nodeById.get(selectedRef.current)
        : undefined
      const hoveredNode = hoverId
        ? nodeById.get(hoverId)
        : undefined
      const routeTargetNode = routeTargetRef.current
        ? nodeById.get(routeTargetRef.current)
        : undefined
      const activeShelfKey =
        selectedNode?.kind === 'article'
          ? selectedNode.shelfKey
          : hoveredNode?.kind === 'article'
            ? hoveredNode.shelfKey
            : undefined
      const routedSection = routeTargetNode?.section

      const activeVisualEntries =
        visualsByFloor.get(currentFloorIndex) ?? []

      if (now - lastDetailSelection > .28) {
        lastDetailSelection = now
        const detailCandidates: Array<{
          id: string
          visual: Visual
          priority: number
          distanceSq: number
        }> = []

        activeVisualEntries.forEach(([id, visual]) => {
          const node = nodeById.get(id)
          if (node?.kind !== 'article') {
            return
          }

          const distanceSq =
            camera.position.distanceToSquared(visual.basePosition)
          const priority =
            id === selectedRef.current
              ? 3
              : id === hoverId
                ? 2
                : id === routeTargetRef.current
                  ? 1
                  : 0

          if (
            priority > 0 ||
            distanceSq <= COVER_LOAD_DISTANCE * COVER_LOAD_DISTANCE
          ) {
            detailCandidates.push({
              id,
              visual,
              priority,
              distanceSq,
            })
          }
        })

        detailCandidates.sort(
          (a, b) =>
            b.priority - a.priority ||
            a.distanceSq - b.distanceSq,
        )

        const nextDetailed = new Set(
          detailCandidates
            .slice(0, MAX_ACTIVE_BOOK_DETAILS)
            .map((candidate) => candidate.id),
        )

        detailedBookIds.clear()
        activeCoverUrls.clear()

        visuals.forEach((visual, id) => {
          const node = nodeById.get(id)
          if (node?.kind !== 'article') return

          if (nextDetailed.has(id)) {
            detailedBookIds.add(id)
            if (visual.coverUrl) {
              activeCoverUrls.add(visual.coverUrl)
            }
            ensureBookTitle(visual)
            attachCachedCover(visual, now)
          } else {
            downgradeCover(visual, now)
            downgradeBookTitle(visual)
          }
        })

        trimCoverCache(now)
      }

      activeVisualEntries.forEach(([id, visual]) => {
        const selected = selectedRef.current === id
        const hovered = hoverId === id
        const routed = routeTargetRef.current === id
        const node = nodeById.get(id)

        const sameShelf =
          Boolean(activeShelfKey) &&
          visual.shelfKey === activeShelfKey
        const unrelatedShelf =
          Boolean(activeShelfKey) &&
          Boolean(visual.shelfKey) &&
          !sameShelf

        const targetScale =
          visual.baseScale *
          (selected ? 1.13 : hovered ? 1.075 : routed ? 1.05 : 1)

        tempScale.set(targetScale, targetScale, targetScale)
        visual.group.scale.lerp(
          tempScale,
          1 - Math.exp(-delta * 8.5),
        )

        if (node?.kind === 'article') {
          if (visual.coverMaterial) {
            const target =
              visual.coverBlendTarget ??
              (visual.coverMaterial.map ? 1 : 0)
            visual.coverBlend =
              (visual.coverBlend ?? 0) +
              (target - (visual.coverBlend ?? 0)) *
                (1 - Math.exp(-delta * 6.5))

            if (visual.coverMaterial.map) {
              const brightness =
                .2 + (visual.coverBlend ?? 0) * .8
              visual.coverMaterial.color.setRGB(
                brightness,
                brightness,
                Math.min(1, brightness * 1.035),
              )
            }

            if (
              visual.coverReleaseAt !== undefined &&
              now >= visual.coverReleaseAt &&
              (visual.coverBlend ?? 0) <= .09
            ) {
              visual.coverMaterial.map = null
              visual.coverMaterial.color.set(0x171b28)
              visual.coverBlend = 0
              visual.coverBlendTarget = 0
              visual.coverReleaseAt = undefined
              visual.coverMaterial.needsUpdate = true
            }
          }

          tempDirection
            .copy(camera.position)
            .sub(visual.basePosition)
          tempDirection.y = 0
          if (tempDirection.lengthSq() > .0001) {
            tempDirection.normalize()
          }

          const pull =
            selected ? .34 : hovered ? .22 : routed ? .12 : 0
          tempTargetPosition
            .copy(visual.basePosition)
            .addScaledVector(tempDirection, pull)
          tempTargetPosition.y +=
            selected ? .035 : hovered ? .02 : 0
          visual.group.position.lerp(
            tempTargetPosition,
            1 - Math.exp(-delta * 10),
          )

          const cameraYaw = Math.atan2(
            camera.position.x - visual.group.position.x,
            camera.position.z - visual.group.position.z,
          )
          let yawDelta = cameraYaw - visual.baseRotationY
          yawDelta = Math.atan2(
            Math.sin(yawDelta),
            Math.cos(yawDelta),
          )
          const turnAmount = selected ? .18 : hovered ? .12 : .03
          const targetYaw =
            visual.baseRotationY +
            THREE.MathUtils.clamp(
              yawDelta,
              -.42,
              .42,
            ) *
              turnAmount
          visual.group.rotation.y = THREE.MathUtils.lerp(
            visual.group.rotation.y,
            targetYaw,
            1 - Math.exp(-delta * 9),
          )

          visual.material.opacity +=
            (((unrelatedShelf ? .48 : 1)) -
              visual.material.opacity) *
            .08
        }

        if (visual.body.userData.nodeId?.startsWith('tag:')) {
          visual.group.rotation.y =
            Math.sin(now * .15 + visual.phase) * .025
        }

        visual.material.emissiveIntensity +=
          ((selected
            ? 1.35
            : hovered
              ? 1.04
              : routed
                ? .9
                : sameShelf
                  ? .68
                  : unrelatedShelf
                    ? .22
                    : .46) -
            visual.material.emissiveIntensity) *
          .08

        if (visual.bookGlowMaterial) {
          visual.bookGlowMaterial.opacity +=
            ((selected
              ? .26
              : hovered
                ? .2
                : routed
                  ? .17
                  : .055) -
              visual.bookGlowMaterial.opacity) *
            .1
        }
        if (visual.bookTitleMaterial) {
          visual.bookTitleMaterial.opacity +=
            ((selected || hovered || routed ? 1 : .92) -
              visual.bookTitleMaterial.opacity) *
            .1
        }

        const labelTarget =
          selected || hovered || routed
            ? 1
            : id.startsWith('section:')
              ? .98
              : id.startsWith('profile:') || id.startsWith('tag:')
                ? .82
                : node?.kind === 'article'
                  ? sameShelf
                    ? .46
                    : unrelatedShelf
                      ? .08
                      : .16
                  : .7
        visual.labelMaterial.opacity +=
          (labelTarget - visual.labelMaterial.opacity) *
          (1 - Math.exp(-delta * 9))

        if (visual.archMaterial) {
          const archActive =
            routed ||
            selected ||
            hovered ||
            (node?.kind === 'section' &&
              Boolean(routedSection) &&
              node.section === routedSection)
          visual.archMaterial.opacity +=
            ((archActive ? .92 : .35) -
              visual.archMaterial.opacity) *
            .12
          visual.archMaterial.color.lerp(
            new THREE.Color(
              archActive ? 0x8ae8ff : node?.accent ?? 0x3b49df,
            ),
            .12,
          )
        }
      })

      const activeShelfVisual =
        selectedNode?.kind === 'article'
          ? selectedNode
          : hoveredNode?.kind === 'article'
            ? hoveredNode
            : null
      const activeShelfCenter = activeShelfVisual
        ? new THREE.Vector3(...activeShelfVisual.position)
        : null
      shelfAccentBars.forEach(({mesh, material, center}) => {
        const nearShelf =
          activeShelfCenter !== null &&
          Math.abs(center.y - activeShelfCenter.y) < .62 &&
          Math.hypot(
            center.x - activeShelfCenter.x,
            center.z - activeShelfCenter.z,
          ) < 4.4
        material.opacity +=
          ((nearShelf ? .52 : activeShelfCenter ? .018 : .045) -
            material.opacity) *
          .12
        material.color.lerp(
          new THREE.Color(nearShelf ? 0x8ae8ff : 0x3b49df),
          .1,
        )
        mesh.scale.z = nearShelf ? 1.8 : 1
      })

      trimCoverCache(now)

      sectionFloorGlows.forEach(({section, mesh, material}) => {
        const isCurrent = section === currentSection
        const isRouted = section === routedSection
        material.opacity +=
          ((isRouted ? .1 : isCurrent ? .055 : .018) -
            material.opacity) *
          (1 - Math.exp(-delta * 3.8))
        const targetScale = isRouted ? 1.08 : isCurrent ? 1.03 : 1
        mesh.scale.lerp(
          tempScale.set(targetScale, targetScale, targetScale),
          1 - Math.exp(-delta * 3.5),
        )
      })

      sectionBeacons.forEach(({section, materials}) => {
        const isCurrent = section === currentSection
        const isRouted = section === routedSection
        materials.forEach((material, index) => {
          const target =
            isRouted
              ? index === 0
                ? .82
                : .54
              : isCurrent
                ? index === 0
                  ? .3
                  : .18
                : index === 0
                  ? .12
                  : .065
          material.opacity +=
            (target - material.opacity) *
            (1 - Math.exp(-delta * 6))
        })
      })

      routeVisuals.forEach((routeVisual) => {
        const visibleOnFloor =
          routeVisual.sourceFloor === currentFloorIndex &&
          routeVisual.targetFloor === currentFloorIndex
        routeVisual.route.visible = visibleOnFloor
        routeVisual.glowRoute.visible = visibleOnFloor
        routeVisual.packets.forEach((packet) => {
          packet.visible = visibleOnFloor
        })
        if (!visibleOnFloor) return

        const touchesSelected =
          routeVisual.edge.source === selectedRef.current ||
          routeVisual.edge.target === selectedRef.current
        const touchesHover =
          routeVisual.edge.source === hoverId ||
          routeVisual.edge.target === hoverId
        const touchesRoute =
          routeVisual.edge.source === routeTargetRef.current ||
          routeVisual.edge.target === routeTargetRef.current
        const active = touchesRoute || touchesSelected || touchesHover

        const targetColor = active
          ? new THREE.Color(0x8ae8ff)
          : routeVisual.baseColor
        routeVisual.material.color.lerp(targetColor, .1)
        routeVisual.glowMaterial.color.lerp(targetColor, .1)
        routeVisual.packetMaterial.color.lerp(targetColor, .12)

        routeVisual.material.opacity +=
          ((active
            ? .82
            : routeVisual.edge.kind === 'corridor'
              ? .16
              : .1) -
            routeVisual.material.opacity) *
          .1
        routeVisual.glowMaterial.opacity +=
          ((active ? .2 : routeVisual.edge.kind === 'corridor' ? .026 : .012) -
            routeVisual.glowMaterial.opacity) *
          .1
        routeVisual.packetMaterial.opacity =
          active ? .98 : .34

        routeVisual.packets.forEach((packet, packetIndex) => {
          const t =
            (now * (.1 + routeVisual.edge.weight * .008) +
              routeVisual.phase +
              packetIndex / routeVisual.packets.length) %
            1
          packet.position.copy(routeVisual.curve.getPoint(t))
          const pulse = active ? 1.45 : 1
          packet.scale.setScalar(
            pulse * (.78 + Math.sin(t * Math.PI) * .5),
          )
        })
      })

      const routeTargetId = routeTargetRef.current
      const routeTarget = routeTargetId
        ? visuals.get(routeTargetId)
        : null

      if (routeTarget) {
        const destination = routeTarget.group.getWorldPosition(
          new THREE.Vector3(),
        )
        const targetNode = routeTargetId
          ? nodeById.get(routeTargetId)
          : undefined
        activeGuideCurve = makeArchitecturalGuide(
          camera.position,
          destination,
          currentSection,
          targetNode?.section ?? currentSection,
        )
        guideGeometry.setFromPoints(activeGuideCurve.getPoints(52))
        guideLine.computeLineDistances()
        guideBaseLine.visible = true
        guideLine.visible = true
        guideMaterial.opacity =
          .82 + Math.max(0, Math.sin(now * 3.4)) * .16

        guidePackets.forEach((packet, index) => {
          const t =
            (now * .28 + index / guidePackets.length) % 1
          packet.position.copy(activeGuideCurve!.getPoint(t))
          packet.position.y += .055
          packet.visible = true
          packet.scale.setScalar(
            .75 + Math.sin(t * Math.PI) * .65,
          )
        })

        floorStrips.forEach(({mesh, material}, index) => {
          const t = .035 + (index / (floorStrips.length - 1)) * .93
          const point = activeGuideCurve!.getPoint(t)
          const tangent = activeGuideCurve!.getTangent(t)
          const stripFloor = THREE.MathUtils.clamp(
            Math.round(
              (point.y - CAMERA_HEIGHT) / LIBRARY_FLOOR_HEIGHT,
            ),
            0,
            LIBRARY_FLOOR_COUNT - 1,
          )
          mesh.position.set(
            point.x,
            stripFloor * LIBRARY_FLOOR_HEIGHT + .035,
            point.z,
          )
          mesh.rotation.y =
            Math.atan2(tangent.x, tangent.z) + Math.PI / 2
          mesh.visible = true
          const wave =
            .28 +
            Math.max(
              0,
              Math.sin(now * 4.2 - index * .42),
            ) *
              .62
          material.opacity = wave
        })

        junctionMarkers.forEach(({mesh, material}, index) => {
          const t = .16 + index * .135
          const point = activeGuideCurve!.getPoint(t)
          const tangent = activeGuideCurve!.getTangent(t)
          const markerFloor = THREE.MathUtils.clamp(
            Math.round(
              (point.y - CAMERA_HEIGHT) / LIBRARY_FLOOR_HEIGHT,
            ),
            0,
            LIBRARY_FLOOR_COUNT - 1,
          )
          mesh.position.set(
            point.x,
            markerFloor * LIBRARY_FLOOR_HEIGHT + .04,
            point.z,
          )
          mesh.rotation.y =
            Math.atan2(tangent.x, tangent.z)
          mesh.visible = true
          material.opacity =
            .46 +
            Math.max(0, Math.sin(now * 3.1 - index)) * .42
        })
      } else {
        activeGuideCurve = null
        guideBaseLine.visible = false
        guideLine.visible = false
        guidePackets.forEach((packet) => {
          packet.visible = false
        })
        floorStrips.forEach(({mesh, material}) => {
          mesh.visible = false
          material.opacity = 0
        })
        junctionMarkers.forEach(({mesh, material}) => {
          mesh.visible = false
          material.opacity = 0
        })
      }

      let nearestSection: LibrarySection = 'atrium'
      let nearestDistance = Number.POSITIVE_INFINITY
      ;(Object.keys(SECTION_CENTERS) as LibrarySection[]).forEach(
        (section) => {
          const distance = SECTION_CENTERS[section].distanceToSquared(
            camera.position,
          )
          if (distance < nearestDistance) {
            nearestDistance = distance
            nearestSection = section
          }
        },
      )

      if (nearestSection !== currentSection) {
        currentSection = nearestSection
        zoneRef.current(nearestSection)
      }

      deskGlow.rotation.z += delta * .12
      deskGlowMaterial.opacity =
        .28 + Math.max(0, Math.sin(now * .7)) * .13

      const rainAttribute = rainGeometry.getAttribute(
        'position',
      ) as THREE.BufferAttribute
      for (let index = 0; index < rainCount; index += 1) {
        const offset = index * 3 + 1
        let y = rainAttribute.array[offset] as number
        y -= delta * (1.2 + (index % 7) * .16)
        if (y < .15) y = 8 + (index % 5) * .45
        rainAttribute.array[offset] = y
      }
      rainAttribute.needsUpdate = true
      dataRain.rotation.y = Math.sin(now * .05) * .018
      rainMaterial.opacity =
        reducedMotion
          ? .1
          : .13 + Math.max(0, Math.sin(now * .52)) * .07

      scanGates.forEach(({mesh, material, phase}) => {
        material.opacity =
          reducedMotion
            ? .008
            : .008 +
              Math.max(0, Math.sin(now * .82 + phase)) * .016
        mesh.position.x =
          reducedMotion ? 0 : Math.sin(now * .12 + phase) * .08
      })

      netCyan.intensity =
        6.2 + Math.max(0, Math.sin(now * .46)) * 1.35
      netMagenta.intensity =
        2.7 + Math.max(0, Math.sin(now * .38 + 1.1)) * 1.05

      if (floorTravel) {
        const progress = THREE.MathUtils.clamp(
          (now - floorTravel.startedAt) / floorTravel.duration,
          0,
          1,
        )
        const eased = progress * progress * (3 - 2 * progress)
        const point = floorTravel.curve.getPoint(eased)
        const look = floorTravel.curve.getPoint(
          Math.min(1, eased + .025),
        )

        position.copy(point)
        camera.position.copy(point)
        camera.lookAt(look)
        camera.fov +=
          (62 - camera.fov) *
          (1 - Math.exp(-delta * 8))
        camera.updateProjectionMatrix()

        if (progress >= 1) {
          currentFloorIndex = floorTravel.targetFloor
          setVisibleFloor(currentFloorIndex)
          position.y =
            currentFloorIndex * LIBRARY_FLOOR_HEIGHT +
            CAMERA_HEIGHT
          camera.position.copy(position)
          euler.setFromQuaternion(camera.quaternion, 'YXZ')
          yaw = euler.y
          pitch = euler.x
          floorTravel = null
          floorChangeRef.current(currentFloorIndex)
        }
      } else if (travel) {
        const progress = THREE.MathUtils.clamp(
          (now - travel.startedAt) / travel.duration,
          0,
          1,
        )
        const eased =
          progress * progress * (3 - 2 * progress)
        const point = travel.curve.getPoint(eased)
        const lookProgress = Math.min(
          1,
          eased + (reducedMotion ? .012 : .026),
        )
        const look = travel.curve.getPoint(lookProgress)
        look.y = THREE.MathUtils.lerp(
          point.y,
          travel.target.y,
          .65,
        )

        position.copy(point)
        camera.position.copy(point)
        camera.lookAt(look)
        const travelFov =
          62 +
          (reducedMotion
            ? 0
            : Math.sin(progress * Math.PI) * 3.2)
        camera.fov +=
          (travelFov - camera.fov) *
          (1 - Math.exp(-delta * 7.5))
        camera.updateProjectionMatrix()

        if (progress >= 1) {
          euler.setFromQuaternion(camera.quaternion, 'YXZ')
          yaw = euler.y
          pitch = euler.x
          velocity.set(0, 0, 0)
          const arrived = travel.node
          const inspectOnArrival = travel.inspectOnArrival
          currentFloorIndex =
            arrived.floorIndex ?? currentFloorIndex
          setVisibleFloor(currentFloorIndex)
          floorChangeRef.current(currentFloorIndex)
          travel = null
          travelRef.current(arrived, inspectOnArrival)
        }
      } else {
        forward.set(
          -Math.sin(yaw) * Math.cos(pitch),
          0,
          -Math.cos(yaw) * Math.cos(pitch),
        ).normalize()
        right.crossVectors(forward, up).normalize()
        move.set(0, 0, 0)

        if (keys.has('KeyW')) move.add(forward)
        if (keys.has('KeyS')) move.sub(forward)
        if (keys.has('KeyD')) move.add(right)
        if (keys.has('KeyA')) move.sub(right)
        if (move.lengthSq() > 0) move.normalize()

        const hurrying =
          keys.has('ShiftLeft') || keys.has('ShiftRight')
        const speed = hurrying ? 3.8 : 1.9
        const desired = move.multiplyScalar(speed)
        const response = move.lengthSq() > 0 ? 9.5 : 12
        velocity.lerp(
          desired,
          1 - Math.exp(-delta * response),
        )

        const deltaMove = tempTargetPosition
          .copy(velocity)
          .multiplyScalar(delta)
        moveWithSliding(deltaMove)
        position.y =
          currentFloorIndex * LIBRARY_FLOOR_HEIGHT +
          CAMERA_HEIGHT

        camera.position.copy(position)
        camera.rotation.order = 'YXZ'
        camera.rotation.y = yaw
        camera.rotation.x = pitch
        camera.rotation.z = THREE.MathUtils.lerp(
          camera.rotation.z,
          0,
          1 - Math.exp(-delta * 12),
        )
        const speedRatio = THREE.MathUtils.clamp(
          velocity.length() / 3.8,
          0,
          1,
        )
        const targetFov =
          62 + (reducedMotion ? 0 : speedRatio * 1.4)
        camera.fov +=
          (targetFov - camera.fov) *
          (1 - Math.exp(-delta * 5.5))
        camera.updateProjectionMatrix()
      }

      renderer.render(scene, camera)
    }

    frame = requestAnimationFrame(animate)

    return () => {
      cameraState.current = {position: camera.position.clone(), yaw, pitch}
      cancelAnimationFrame(frame)
      resizeObserver.disconnect()
      renderer.domElement.removeEventListener('click', onCanvasClick)
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('pointerlockchange', onPointerLock)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)

      if (document.pointerLockElement === renderer.domElement) {
        document.exitPointerLock?.()
      }

      visuals.forEach((visual) => {
        visual.bookTitleTexture?.dispose()
        visual.material.dispose()
        visual.labelMaterial.dispose()
      })
      disposableTextures.forEach((texture) => texture.dispose())

      routeVisuals.forEach((routeVisual) => {
        routeVisual.geometry.dispose()
        routeVisual.material.dispose()
        routeVisual.glowGeometry.dispose()
        routeVisual.glowMaterial.dispose()
        routeVisual.packetGeometry.dispose()
        routeVisual.packetMaterial.dispose()
      })

      guideGeometry.dispose()
      guideBaseMaterial.dispose()
      guideMaterial.dispose()
      guidePacketGeometry.dispose()
      guidePacketMaterial.dispose()
      architecturalGeometries.forEach((geometry) => geometry.dispose())
      architecturalMaterials.forEach((material) => material.dispose())
      labelsToDispose.forEach((texture) => texture.dispose())
      coverCache.clear()
      remoteTextures.forEach((texture) => texture.dispose())
      rainGeometry.dispose()
      rainMaterial.dispose()
      destroyed = true
      renderer.dispose()
      container.removeChild(renderer.domElement)
    }
  }, [edges, nodes])

  return <div ref={hostRef} className={styles.world} />
}
