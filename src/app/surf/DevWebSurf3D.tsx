'use client'

import {useEffect, useRef, type RefObject} from 'react'
import * as THREE from 'three'
import type {LibrarySection, SurfEdge, SurfNode, SurfNodeKind} from './types'
import styles from './surf.module.css'

type TravelRequest = {
  id: string
  nonce: number
  inspectOnArrival: boolean
} | null

type FloorRequest = {
  floor: number
  nonce: number
} | null

export type SurfDebugMetrics = {
  fps: number
  drawCalls: number
  triangles: number
  textures: number
  geometries: number
}

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
  onWayfindingCueChange: (cue: string | null) => void
  currentFloor: number
  floorRequest: FloorRequest
  onFloorChange: (floor: number) => void
  uiPanelRefs: Array<RefObject<HTMLElement | null>>
  catalogLoading: boolean
  debugEnabled: boolean
  onDebugMetrics: (metrics: SurfDebugMetrics) => void
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

const LIBRARY_FLOOR_COUNT = 6
const LIBRARY_FLOOR_HEIGHT = 5.2
const CAMERA_HEIGHT = 1.62
const REAL_BOOK_DISTANCE = 19.5
const FLOOR_IDENTITIES = [
  'ATRIUM / FEATURED / NEW',
  'WEBDEV / REACT / TYPESCRIPT',
  'BACKEND / PYTHON / DATABASES',
  'AI / DATA / AUTOMATION',
  'LINUX / DEVOPS / OPEN SOURCE',
  'DEEP ARCHIVE / LONG-TAIL DEV',
] as const
const FLOOR_ACCENTS = [
  0xc7f3ff,
  0x6574ff,
  0x38c7bd,
  0xb57cff,
  0x68d98a,
  0x8d9aad,
] as const
const FLOOR_SURFACE_TINTS = [
  0x35393d,
  0x34373c,
  0x33363b,
  0x35363c,
  0x34383b,
  0x33363a,
] as const
const FLOOR_WALKWAY_TINTS = [
  0x4a4e53,
  0x484c51,
  0x474b50,
  0x4a4c52,
  0x484d50,
  0x474b50,
] as const
const FLOOR_AISLES = [
  ['FEATURED', 'NEW', 'POPULAR'],
  ['WEBDEV', 'REACT', 'TYPESCRIPT'],
  ['BACKEND', 'PYTHON', 'DATABASES'],
  ['AI', 'DATA', 'AUTOMATION'],
  ['LINUX', 'DEVOPS', 'OPEN SOURCE'],
  ['ARCHIVE', 'LONG-TAIL', 'DISCOVERY'],
] as const
const UPPER_BRIDGE_Z = [7, -10, -27, -45, -63] as const

const SECTION_CENTERS: Record<LibrarySection, THREE.Vector3> = {
  atrium: new THREE.Vector3(0, 1.6, 8),
  featured: new THREE.Vector3(0, 1.6, -8),
  latest: new THREE.Vector3(-13, 1.6, -12),
  topics: new THREE.Vector3(13, 1.6, -12),
  creators: new THREE.Vector3(13, 1.6, -26),
  search: new THREE.Vector3(-13, 1.6, -26),
  archive: new THREE.Vector3(0, 1.6, -40),
}

const SECTION_DOORWAYS: Record<LibrarySection, THREE.Vector3> = {
  atrium: new THREE.Vector3(0, .09, 5.8),
  featured: new THREE.Vector3(0, .09, -5.4),
  latest: new THREE.Vector3(-8.35, .09, -5.2),
  topics: new THREE.Vector3(8.35, .09, -5.2),
  creators: new THREE.Vector3(8.35, .09, -21.1),
  search: new THREE.Vector3(-8.35, .09, -21.1),
  archive: new THREE.Vector3(0, .09, -34.4),
}

const SECTION_ACCENTS: Record<LibrarySection, number> = {
  atrium: 0xf5f5f5,
  featured: 0x3b49df,
  latest: 0x5b6cff,
  topics: 0x53d3ff,
  creators: 0xae7bff,
  search: 0xff4fd8,
  archive: 0x8b96a8,
}

const WAYFINDING_DESTINATIONS: Record<LibrarySection, string> = {
  atrium: 'Central Atrium',
  featured: 'Featured Shelves',
  latest: 'New Arrivals',
  topics: 'Topic Wings',
  creators: 'Creator Studies',
  search: 'Card Catalog',
  archive: 'Deep Archive',
}

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

function createArchitecturalSurfaceTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 256
  const context = canvas.getContext('2d')

  if (context) {
    context.fillStyle = '#85878d'
    context.fillRect(0, 0, canvas.width, canvas.height)

    // Deterministic low-contrast aggregate. It reads like sealed concrete /
    // graphite at human distance without turning the floor into a pattern.
    for (let index = 0; index < 1500; index += 1) {
      const seed = Math.sin(index * 12.9898) * 43758.5453
      const x = Math.abs(seed * 97) % canvas.width
      const y = Math.abs(seed * 193) % canvas.height
      const shade = 112 + (index % 23)
      context.fillStyle =
        'rgba(' + shade + ',' + shade + ',' + (shade + 3) + ',.16)'
      const size = index % 9 === 0 ? 2 : 1
      context.fillRect(x, y, size, size)
    }

    context.strokeStyle = 'rgba(220,224,232,.025)'
    context.lineWidth = 1
    for (let line = 24; line < 256; line += 52) {
      context.beginPath()
      context.moveTo(0, line + (line % 3))
      context.lineTo(256, line - 7)
      context.stroke()
    }
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.repeat.set(3, 3)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.minFilter = THREE.LinearMipmapLinearFilter
  texture.magFilter = THREE.LinearFilter
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
      exit.y = startBase + .09
      points.push(exit)
      points.push(new THREE.Vector3(0, startBase + .09, exit.z))
    }

    const entry = SECTION_DOORWAYS[targetSection].clone()
    entry.y = targetBase + .09
    if (targetSection !== 'atrium') {
      points.push(new THREE.Vector3(0, targetBase + .09, entry.z))
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

  return new THREE.CatmullRomCurve3(
    deduped,
    false,
    'centripetal',
    .35,
  )
}

function createSectionSignTexture(
  section: LibrarySection,
  accent: string,
  count = 0,
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

    if (section !== 'atrium') {
      const badgeText = count.toLocaleString() + ' ENTRIES'
      context.font = '700 18px system-ui, sans-serif'
      const badgeWidth = Math.max(126, context.measureText(badgeText).width + 34)
      context.fillStyle = 'rgba(255,255,255,.055)'
      context.fillRect(canvas.width - badgeWidth - 62, 48, badgeWidth, 42)
      context.strokeStyle = 'rgba(255,255,255,.08)'
      context.strokeRect(canvas.width - badgeWidth - 62, 48, badgeWidth, 42)
      context.textAlign = 'center'
      context.fillStyle = '#cfd6e2'
      context.fillText(
        badgeText,
        canvas.width - badgeWidth / 2 - 62,
        69,
      )
      context.textAlign = 'left'
    }

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
  onWayfindingCueChange,
  currentFloor,
  floorRequest,
  onFloorChange,
  uiPanelRefs,
  catalogLoading,
  debugEnabled,
  onDebugMetrics,
}: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const selectedRef = useRef(selectedId)
  const routeTargetRef = useRef(routeTargetId)
  const travelRequestRef = useRef(travelRequest)
  const inspectRef = useRef(onInspect)
  const putBackRef = useRef(onPutBack)
  const travelRef = useRef(onTravel)
  const hoverRef = useRef(onHover)
  const lockRef = useRef(onPointerLockChange)
  const zoneRef = useRef(onZoneChange)
  const wayfindingCueRef = useRef(onWayfindingCueChange)
  const currentFloorRef = useRef(currentFloor)
  const floorRequestRef = useRef(floorRequest)
  const floorChangeRef = useRef(onFloorChange)
  const uiPanelRefsRef = useRef(uiPanelRefs)
  const catalogLoadingRef = useRef(catalogLoading)
  const debugEnabledRef = useRef(debugEnabled)
  const debugMetricsRef = useRef(onDebugMetrics)

  selectedRef.current = selectedId
  routeTargetRef.current = routeTargetId
  travelRequestRef.current = travelRequest
  inspectRef.current = onInspect
  putBackRef.current = onPutBack
  travelRef.current = onTravel
  hoverRef.current = onHover
  lockRef.current = onPointerLockChange
  zoneRef.current = onZoneChange
  wayfindingCueRef.current = onWayfindingCueChange
  currentFloorRef.current = currentFloor
  floorRequestRef.current = floorRequest
  floorChangeRef.current = onFloorChange
  uiPanelRefsRef.current = uiPanelRefs
  catalogLoadingRef.current = catalogLoading
  debugEnabledRef.current = debugEnabled
  debugMetricsRef.current = onDebugMetrics

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const container = host

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x111319)
    scene.fog = new THREE.FogExp2(0x17191d, .0115)

    const camera = new THREE.PerspectiveCamera(60, 1, .07, 160)
    camera.position.set(
      0,
      currentFloorRef.current * LIBRARY_FLOOR_HEIGHT + CAMERA_HEIGHT,
      13,
    )

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
    })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.25))
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.24
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFShadowMap
    renderer.shadowMap.autoUpdate = false
    renderer.shadowMap.needsUpdate = true
    renderer.domElement.className = styles.canvas
    renderer.domElement.tabIndex = 0
    container.appendChild(renderer.domElement)

    const ambient = new THREE.HemisphereLight(0xe6ebf0, 0x202126, 1.38)
    scene.add(ambient)

    const baseFill = new THREE.AmbientLight(0xffffff, .42)
    scene.add(baseFill)

    const key = new THREE.DirectionalLight(0xf5f2ec, 2.05)
    key.position.set(-9, 13, 9)
    key.castShadow = true
    key.shadow.mapSize.set(1024, 1024)
    key.shadow.bias = -0.0002
    scene.add(key)

    // A soft near-camera key gives the eye a clear foreground plane while
    // fog and practical-light falloff handle the middle/far distance.
    const playerKeyLight = new THREE.PointLight(
      0xf1eee7,
      2.15,
      15,
      1.42,
    )
    playerKeyLight.castShadow = false
    scene.add(playerKeyLight)

    const cyan = new THREE.PointLight(0x3b49df, .65, 24, 2)
    cyan.position.set(-13, 4, -18)
    scene.add(cyan)

    const violet = new THREE.PointLight(0x5965e8, .55, 22, 2)
    violet.position.set(13, 4, -22)
    scene.add(violet)

    const warm = new THREE.PointLight(0xf1eee7, 1.8, 24, 2)
    warm.position.set(0, 5, -5)
    scene.add(warm)

    const netCyan = new THREE.PointLight(0x53d3ff, .45, 20, 2)
    netCyan.position.set(-2, 2.6, -31)
    scene.add(netCyan)

    const netMagenta = new THREE.PointLight(0xff4fd8, .25, 18, 2)
    netMagenta.position.set(15, 3.2, -15)
    scene.add(netMagenta)

    const netViolet = new THREE.PointLight(0xae7bff, .3, 18, 2)
    netViolet.position.set(-15, 4, -24)
    scene.add(netViolet)

    const floorIdentityLight = new THREE.PointLight(
      FLOOR_ACCENTS[currentFloorRef.current],
      1.05,
      26,
      2,
    )
    floorIdentityLight.position.set(
      0,
      currentFloorRef.current * LIBRARY_FLOOR_HEIGHT + 3.2,
      -18,
    )
    scene.add(floorIdentityLight)

    const practicalLightLayout = [
      {x: -9.6, z: -6, color: 0xf6f1e8},
      {x: 9.6, z: -14, color: 0xe8edf2},
      {x: -9.6, z: -22, color: 0xf6f1e8},
      {x: 9.6, z: -30, color: 0xe8edf2},
      {x: -9.6, z: -38, color: 0xf6f1e8},
      {x: 9.6, z: -46, color: 0xe8edf2},
    ] as const

    const practicalLights = practicalLightLayout.map((entry) => {
      const light = new THREE.PointLight(
        entry.color,
        3.65,
        26,
        1.22,
      )
      light.position.set(
        entry.x,
        currentFloorRef.current * LIBRARY_FLOOR_HEIGHT + 4.05,
        entry.z,
      )
      light.castShadow = false
      scene.add(light)
      return light
    })

    const landingLightLayout = [
      {x: 0, z: 7},
      {x: 0, z: -27},
    ] as const
    const landingLights = landingLightLayout.map((entry) => {
      const light = new THREE.PointLight(
        0xf7f3ec,
        2.75,
        20,
        1.28,
      )
      light.position.set(
        entry.x,
        currentFloorRef.current * LIBRARY_FLOOR_HEIGHT + 3.65,
        entry.z,
      )
      light.castShadow = false
      scene.add(light)
      return light
    })

    const bridgeEntryLightLayout = [
      {x: -4.15, z: -10},
      {x: 4.15, z: -10},
      {x: -4.15, z: -27},
      {x: 4.15, z: -27},
      {x: -4.15, z: -45},
      {x: 4.15, z: -45},
    ] as const
    const bridgeEntryLights = bridgeEntryLightLayout.map((entry) => {
      const light = new THREE.PointLight(
        0xe6e9e8,
        1.65,
        15,
        1.32,
      )
      light.position.set(
        entry.x,
        currentFloorRef.current * LIBRARY_FLOOR_HEIGHT + 2.75,
        entry.z,
      )
      light.castShadow = false
      scene.add(light)
      return light
    })

    const shelfFillLightLayout = [
      {x: -12.4, z: -10},
      {x: 12.4, z: -18},
      {x: -12.4, z: -26},
      {x: 12.4, z: -34},
      {x: -12.4, z: -42},
      {x: 12.4, z: -50},
    ] as const
    const shelfFillLights = shelfFillLightLayout.map((entry) => {
      const light = new THREE.PointLight(
        0xe2e5e7,
        1.15,
        10.5,
        1.4,
      )
      light.position.set(
        entry.x,
        currentFloorRef.current * LIBRARY_FLOOR_HEIGHT + 2.65,
        entry.z,
      )
      light.castShadow = false
      scene.add(light)
      return light
    })

    const adjacentFloorLights = [-1, 1].flatMap((direction) =>
      [
        {x: -9, z: -18},
        {x: 9, z: -38},
      ].map((entry) => {
        const light = new THREE.PointLight(
          0xd9e0e5,
          0,
          19,
          1.55,
        )
        light.position.set(entry.x, 0, entry.z)
        light.castShadow = false
        scene.add(light)
        return {light, direction, entry}
      }),
    )

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
    const thumbnailCache = new Map<
      string,
      {
        texture: THREE.Texture | null
        loading: boolean
        failed: boolean
        listeners: Set<(texture: THREE.Texture) => void>
      }
    >()
    const thumbnailPrefetchTimers = new Set<number>()
    const MAX_RESIDENT_COVERS = 32
    const SHELF_ATLAS_STRIPS_PER_SHELF = 2
    const COVERS_PER_SHELF_ATLAS = 3
    const MAX_ACTIVE_BOOK_DETAILS = 14
    const COVER_LOAD_DISTANCE = 10.5
    const COVER_EVICT_AGE = 4.5
    const activeCoverUrls = new Set<string>()
    const detailedBookIds = new Set<string>()
    let lastCoverTrim = 0
    let lastDetailSelection = 0
    let destroyed = false

    function requestThumbnailTexture(
      url: string,
      onReady: (texture: THREE.Texture) => void,
    ) {
      let entry = thumbnailCache.get(url)
      if (!entry) {
        entry = {
          texture: null,
          loading: false,
          failed: false,
          listeners: new Set<(texture: THREE.Texture) => void>(),
        }
        thumbnailCache.set(url, entry)
      }

      if (entry.texture) {
        onReady(entry.texture)
        return
      }

      if (entry.failed) return
      entry.listeners.add(onReady)
      if (entry.loading) return
      entry.loading = true

      const proxied =
        '/api/devto?mode=image&variant=thumb&url=' +
        encodeURIComponent(url)

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
          texture.generateMipmaps = false
          texture.anisotropy = 1
          entry!.texture = texture
          remoteTextures.add(texture)

          entry!.listeners.forEach((listener) => listener(texture))
          entry!.listeners.clear()
        },
        undefined,
        () => {
          entry!.loading = false
          entry!.failed = true
          entry!.listeners.clear()
        },
      )
    }

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

    const architecturalSurfaceTexture =
      createArchitecturalSurfaceTexture()
    const architecturalSurfaceRoughness =
      architecturalSurfaceTexture.clone()
    architecturalSurfaceRoughness.colorSpace =
      THREE.NoColorSpace
    architecturalSurfaceRoughness.needsUpdate = true

    // One material family for floors + walls. The floor now reads as the
    // horizontal face of the same megastructure instead of a separate skin.
    const concrete = new THREE.MeshStandardMaterial({
      color: 0x30343a,
      map: architecturalSurfaceTexture,
      roughnessMap: architecturalSurfaceRoughness,
      roughness: .92,
      metalness: .045,
    })
    // Floors remain the exact same material family as the walls, but get a
    // modest value lift so walkable space can be parsed without a neon grid.
    const floorMaterial = concrete.clone()
    floorMaterial.color.setHex(0x3d4149)
    floorMaterial.roughness = .9
    const floorMaterials = FLOOR_SURFACE_TINTS.map((tint, floor) => {
      const material = floorMaterial.clone()
      material.color.setHex(tint)
      material.emissive = new THREE.Color(0x17191d)
      material.emissiveIntensity = .11
      material.roughness = .84
      material.metalness = .025
      return material
    })
    // Each upper level gets a restrained, physically present wall finish.
    // These panels are visible from the balcony corridors, unlike HUD-only
    // floor identity, but remain part of the same charcoal architecture.
    const floorIdentityWallMaterials = FLOOR_ACCENTS.map((accent, floor) =>
      new THREE.MeshStandardMaterial({
        color: new THREE.Color(0x30343a).lerp(
          new THREE.Color(accent),
          .035 + floor * .006,
        ),
        map: architecturalSurfaceTexture,
        roughnessMap: architecturalSurfaceRoughness,
        roughness: .8 + (floor % 3) * .045,
        metalness: .025,
      }),
    )
    architecturalMaterials.push(
      concrete,
      floorMaterial,
      ...floorMaterials,
      ...floorIdentityWallMaterials,
    )

    const brass = new THREE.MeshStandardMaterial({
      color: 0x303a70,
      roughness: .56,
      metalness: .46,
      emissive: 0x111735,
      emissiveIntensity: .1,
    })
    architecturalMaterials.push(brass)

    const shelfMaterial = new THREE.MeshStandardMaterial({
      color: 0x4a4c52,
      map: architecturalSurfaceTexture,
      roughnessMap: architecturalSurfaceRoughness,
      roughness: .7,
      metalness: .16,
    })
    const floorShelfTopMaterials = FLOOR_ACCENTS.map((accent) => {
      const material = new THREE.MeshStandardMaterial({
        color: new THREE.Color(0x34383e).lerp(
          new THREE.Color(accent),
          .07,
        ),
        emissive: accent,
        emissiveIntensity: .025,
        roughness: .52,
        metalness: .4,
      })
      return material
    })
    architecturalMaterials.push(
      shelfMaterial,
      ...floorShelfTopMaterials,
    )

    const shelfBackMaterial = new THREE.MeshStandardMaterial({
      color: 0x292c32,
      map: architecturalSurfaceTexture,
      roughnessMap: architecturalSurfaceRoughness,
      roughness: .94,
      metalness: .05,
    })
    architecturalMaterials.push(shelfBackMaterial)

    const slabUndersideMaterial = new THREE.MeshStandardMaterial({
      color: 0x202329,
      roughness: .96,
      metalness: .02,
    })
    const expansionJointMaterial = new THREE.MeshBasicMaterial({
      color: 0x090b0f,
      transparent: true,
      opacity: .5,
      depthWrite: false,
    })
    architecturalMaterials.push(
      slabUndersideMaterial,
      expansionJointMaterial,
    )

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
      const floorIndex = THREE.MathUtils.clamp(
        Math.round(floorBase / LIBRARY_FLOOR_HEIGHT),
        0,
        LIBRARY_FLOOR_COUNT - 1,
      )
      const resolvedMaterial =
        material === floorMaterial
          ? floorMaterials[floorIndex] ?? floorMaterial
          : material
      const mesh = new THREE.Mesh(geometry, resolvedMaterial)
      mesh.position.set(x, floorBase - .11, z)
      mesh.receiveShadow = true
      scene.add(mesh)

      // A darker soffit beneath every slab creates a readable thickness line
      // when looking across the atrium or up from a lower storey.
      const undersideGeometry = new THREE.BoxGeometry(
        Math.max(.1, width - .08),
        .035,
        Math.max(.1, depth - .08),
      )
      architecturalGeometries.push(undersideGeometry)
      const underside = new THREE.Mesh(
        undersideGeometry,
        slabUndersideMaterial,
      )
      underside.position.set(x, floorBase - .215, z)
      scene.add(underside)

      // A hairline perimeter catches light and tells the eye "this is floor"
      // without turning the architecture back into a glowing game grid.
      if (material === floorMaterial && floorBase > 0) {
        const edgeGeometry = new THREE.EdgesGeometry(geometry)
        architecturalGeometries.push(edgeGeometry)
        const edgeMaterial = new THREE.LineBasicMaterial({
          color: FLOOR_ACCENTS[floorIndex],
          transparent: true,
          opacity: .025,
        })
        architecturalMaterials.push(edgeMaterial)
        const edges = new THREE.LineSegments(edgeGeometry, edgeMaterial)
        edges.position.copy(mesh.position)
        scene.add(edges)
      }
      return mesh
    }

    type FloorDeckVariant =
      | 'primary'
      | 'secondary'
      | 'bridge'
      | 'threshold'
      | 'landing'

    function addFloorInsetSurface(
      x: number,
      z: number,
      width: number,
      depth: number,
      floorBase: number,
      floorIndex: number,
      variant: FloorDeckVariant = 'primary',
    ) {
      const height =
        variant === 'landing'
          ? .05
          : variant === 'threshold'
            ? .042
            : .032
      const geometry = new THREE.BoxGeometry(width, height, depth)
      architecturalGeometries.push(geometry)

      const baseColor = new THREE.Color(
        FLOOR_WALKWAY_TINTS[floorIndex],
      )
      if (variant === 'secondary') baseColor.multiplyScalar(.9)
      if (variant === 'bridge') {
        baseColor.multiplyScalar(1.035)
      }
      if (variant === 'threshold' || variant === 'landing') {
        baseColor.lerp(new THREE.Color(FLOOR_ACCENTS[floorIndex]), .045)
      }

      const material = new THREE.MeshStandardMaterial({
        color: baseColor,
        map: architecturalSurfaceTexture,
        roughnessMap: architecturalSurfaceRoughness,
        roughness:
          variant === 'landing' || variant === 'threshold' ? .8 : .88,
        metalness:
          variant === 'landing' || variant === 'threshold' ? .07 : .035,
        emissive: FLOOR_ACCENTS[floorIndex],
        emissiveIntensity:
          variant === 'threshold' || variant === 'landing'
            ? .018
            : .006,
      })
      architecturalMaterials.push(material)

      const mesh = new THREE.Mesh(geometry, material)
      mesh.position.set(x, floorBase + height / 2 + .006, z)
      mesh.receiveShadow = true
      scene.add(mesh)
      return mesh
    }

    function addRouteBorder(
      x: number,
      z: number,
      width: number,
      depth: number,
      floorBase: number,
      floorIndex: number,
      opacity = .15,
    ) {
      const borderSource = new THREE.BoxGeometry(width, .02, depth)
      const edgeGeometry = new THREE.EdgesGeometry(borderSource)
      architecturalGeometries.push(borderSource, edgeGeometry)
      const edgeMaterial = new THREE.LineBasicMaterial({
        color: FLOOR_ACCENTS[floorIndex],
        transparent: true,
        opacity: opacity * .16,
      })
      architecturalMaterials.push(edgeMaterial)
      const edges = new THREE.LineSegments(edgeGeometry, edgeMaterial)
      edges.position.set(x, floorBase + .035, z)
      scene.add(edges)
      return edges
    }

    function addFloorSeams(
      x: number,
      z: number,
      width: number,
      depth: number,
      floorBase: number,
      axis: 'x' | 'z',
      count = 5,
    ) {
      const seamThickness = .018
      for (let index = 1; index <= count; index += 1) {
        const t = index / (count + 1)
        const seamGeometry =
          axis === 'z'
            ? new THREE.BoxGeometry(
                Math.max(.1, width - .18),
                .006,
                seamThickness,
              )
            : new THREE.BoxGeometry(
                seamThickness,
                .006,
                Math.max(.1, depth - .18),
              )
        architecturalGeometries.push(seamGeometry)
        const seam = new THREE.Mesh(
          seamGeometry,
          expansionJointMaterial,
        )
        seam.position.set(
          axis === 'x'
            ? x - width / 2 + width * t
            : x,
          floorBase + .041,
          axis === 'z'
            ? z - depth / 2 + depth * t
            : z,
        )
        scene.add(seam)
      }
    }

    function addLandingMarker(
      floor: number,
      x: number,
      z: number,
      floorBase: number,
      rotationY = 0,
    ) {
      const accentHex =
        '#' + new THREE.Color(FLOOR_ACCENTS[floor]).getHexString()
      const markerTexture = createTextTexture(
        String(floor + 1).padStart(2, '0'),
        FLOOR_IDENTITIES[floor],
        accentHex,
        520,
        210,
      )
      labelsToDispose.push(markerTexture)

      const plateGeometry = new THREE.BoxGeometry(3.6, .045, 1.75)
      const decalGeometry = new THREE.PlaneGeometry(3.25, 1.42)
      architecturalGeometries.push(plateGeometry, decalGeometry)

      const plateMaterial = new THREE.MeshStandardMaterial({
        color: new THREE.Color(
          FLOOR_WALKWAY_TINTS[floor],
        ).multiplyScalar(.86),
        emissive: FLOOR_ACCENTS[floor],
        emissiveIntensity: .07,
        roughness: .78,
        metalness: .08,
      })
      const decalMaterial = new THREE.MeshBasicMaterial({
        map: markerTexture,
        transparent: true,
        toneMapped: false,
        depthWrite: false,
      })
      architecturalMaterials.push(plateMaterial, decalMaterial)

      const group = new THREE.Group()
      group.position.set(x, floorBase + .038, z)
      group.rotation.y = rotationY

      const plate = new THREE.Mesh(plateGeometry, plateMaterial)
      plate.position.y = .012
      plate.receiveShadow = true
      group.add(plate)

      const decal = new THREE.Mesh(decalGeometry, decalMaterial)
      decal.rotation.x = -Math.PI / 2
      decal.position.y = .039
      decal.renderOrder = 6
      group.add(decal)
      scene.add(group)
      return group
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
      floorIndex: number
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
    const wayfindingPaths: Array<{
      section: LibrarySection
      material: THREE.MeshBasicMaterial
    }> = []
    const architecturalInteractive: THREE.Object3D[] = []

    type OverlapAwareLabel = {
      object: THREE.Object3D
      materials: Array<{
        material: THREE.Material
        baseOpacity: number
      }>
      visibility: number
    }
    const overlapAwareLabels: OverlapAwareLabel[] = []
    const overlapBox = new THREE.Box3()
    const overlapCorner = new THREE.Vector3()

    function registerOverlapAwareLabel(
      object: THREE.Object3D,
      materials: Array<{
        material: THREE.Material
        baseOpacity: number
      }>,
    ) {
      overlapAwareLabels.push({
        object,
        materials,
        visibility: 1,
      })
    }

    function screenRectForObject(object: THREE.Object3D) {
      object.updateWorldMatrix(true, true)
      overlapBox.setFromObject(object)
      if (overlapBox.isEmpty()) return null

      const min = overlapBox.min
      const max = overlapBox.max
      let minX = Infinity
      let minY = Infinity
      let maxX = -Infinity
      let maxY = -Infinity
      let visibleCorners = 0

      for (let xi = 0; xi < 2; xi += 1) {
        for (let yi = 0; yi < 2; yi += 1) {
          for (let zi = 0; zi < 2; zi += 1) {
            overlapCorner
              .set(
                xi ? max.x : min.x,
                yi ? max.y : min.y,
                zi ? max.z : min.z,
              )
              .project(camera)
            if (
              overlapCorner.z < -1 ||
              overlapCorner.z > 1
            ) {
              continue
            }
            visibleCorners += 1
            const x =
              ((overlapCorner.x + 1) / 2) *
              renderer.domElement.clientWidth
            const y =
              ((1 - overlapCorner.y) / 2) *
              renderer.domElement.clientHeight
            minX = Math.min(minX, x)
            minY = Math.min(minY, y)
            maxX = Math.max(maxX, x)
            maxY = Math.max(maxY, y)
          }
        }
      }

      if (!visibleCorners) return null
      const canvasRect = renderer.domElement.getBoundingClientRect()
      return {
        left: canvasRect.left + minX,
        top: canvasRect.top + minY,
        right: canvasRect.left + maxX,
        bottom: canvasRect.top + maxY,
      }
    }

    function updateUIOverlap(delta: number) {
      const panelRects = uiPanelRefsRef.current
        .map((panelRef) => panelRef.current?.getBoundingClientRect())
        .filter((rect): rect is DOMRect => Boolean(rect))

      overlapAwareLabels.forEach((entry) => {
        const labelRect = screenRectForObject(entry.object)
        const overlapping =
          labelRect !== null &&
          panelRects.some((panelRect) => {
            const padding = 8
            return (
              labelRect.right > panelRect.left - padding &&
              labelRect.left < panelRect.right + padding &&
              labelRect.bottom > panelRect.top - padding &&
              labelRect.top < panelRect.bottom + padding
            )
          })
        const target = overlapping ? 0 : 1
        entry.visibility +=
          (target - entry.visibility) *
          (1 - Math.exp(-delta * 14))

        entry.materials.forEach(({material, baseOpacity}) => {
          material.transparent = true
          material.opacity = baseOpacity * entry.visibility
        })
      })
    }

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
      const shelfFloorIndex = THREE.MathUtils.clamp(
        Math.round(floorBase / LIBRARY_FLOOR_HEIGHT),
        0,
        LIBRARY_FLOOR_COUNT - 1,
      )

      // These are true two-sided stacks, not a single display wall rendered
      // DoubleSide. The core creates two shadowed cavities with a book face
      // on either side, while retaining the original aisle footprint.
      const sideGeometry = new THREE.BoxGeometry(.16, 3.56, 1.32)
      const boardGeometry = new THREE.BoxGeometry(width, .1, 1.32)
      const backGeometry = new THREE.BoxGeometry(width, 3.46, .16)
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

      const back = new THREE.Mesh(backGeometry, shelfBackMaterial)
      back.position.set(0, 1.74, 0)
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

      const top = new THREE.Mesh(
        boardGeometry,
        floorShelfTopMaterials[shelfFloorIndex] ?? brass,
      )
      top.position.set(0, 3.48, 0)
      top.scale.y = 1.15
      group.add(top)

      // Keep book bays identical for alignment, but vary the skyline so long
      // aisles stop reading like cloned test fixtures.
      const shelfVariant =
        Math.abs(
          Math.round(
            x * 7 +
            z * 5 +
            floorBase * 3,
          ),
        ) % 3
      if (shelfVariant > 0) {
        const crown = new THREE.Mesh(boardGeometry, shelfMaterial)
        crown.position.set(
          shelfVariant === 1 ? -.35 : .4,
          3.63 + shelfVariant * .045,
          -.08,
        )
        crown.scale.set(
          shelfVariant === 1 ? .68 : .46,
          shelfVariant === 1 ? .9 : 1.22,
          .5,
        )
        group.add(crown)
      }

      for (let level = 0; level < 3; level += 1) {
        const accentGeometry = new THREE.BoxGeometry(
          width - .24,
          .024,
          .032,
        )
        architecturalGeometries.push(accentGeometry)
        const accentMaterial = new THREE.MeshBasicMaterial({
          color: FLOOR_ACCENTS[shelfFloorIndex],
          transparent: true,
          opacity: .032,
          depthWrite: false,
        })
        architecturalMaterials.push(accentMaterial)
        const accent = new THREE.Mesh(accentGeometry, accentMaterial)
        ;[-1, 1].forEach((face) => {
          const faceAccent = accent.clone()
          faceAccent.position.set(0, .245 + level * 1.1, face * .68)
          group.add(faceAccent)
          shelfAccentBars.push({
            mesh: faceAccent,
            material: accentMaterial,
            center: new THREE.Vector3(
              x,
              floorBase + .245 + level * 1.1,
              z,
            ),
            floorIndex: shelfFloorIndex,
          })
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

    const sectionEntryCounts: Record<LibrarySection, number> = {
      atrium: 0,
      featured: 0,
      latest: 0,
      topics: 0,
      creators: 0,
      search: 0,
      archive: 0,
    }
    nodes.forEach((node) => {
      if (
        !node.section ||
        node.kind === 'section' ||
        node.kind === 'home'
      ) {
        return
      }
      sectionEntryCounts[node.section] += 1
    })

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
        emissive: new THREE.Color(accent).multiplyScalar(.04),
        emissiveIntensity: .16,
      })
      const edgeMaterial = new THREE.LineBasicMaterial({
        color: accent,
        transparent: true,
        opacity: .22,
      })
      architecturalMaterials.push(panelMaterial, edgeMaterial)

      const panel = new THREE.Mesh(panelGeometry, panelMaterial)
      panel.castShadow = true
      group.add(panel)

      const edges = new THREE.LineSegments(edgeGeometry, edgeMaterial)
      group.add(edges)

      const texture = createSectionSignTexture(
        section,
        accent,
        sectionEntryCounts[section],
      )
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

      const nodeId =
        section === 'atrium' ? 'dev-home' : 'section:' + section
      face.userData.nodeId = nodeId
      architecturalInteractive.push(face)
      registerOverlapAwareLabel(group, [
        {material: faceMaterial, baseOpacity: 1},
        {material: edgeMaterial, baseOpacity: .22},
        {material: underGlowMaterial, baseOpacity: .45},
      ])

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
        opacity: .009,
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

      // The floating section card is the named source of truth.
      // Doorways stay environmental: threshold + pylons only, with no
      // duplicate full wing name competing for attention.

      scene.add(group)
      sectionBeacons.push({section, materials})
    }

    function addWayfindingPath(
      section: LibrarySection,
      x: number,
      z: number,
      width: number,
      depth: number,
    ) {
      const geometry = new THREE.BoxGeometry(width, .012, depth)
      architecturalGeometries.push(geometry)
      const material = new THREE.MeshBasicMaterial({
        color: SECTION_ACCENTS[section],
        transparent: true,
        opacity: .026,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      })
      architecturalMaterials.push(material)
      const mesh = new THREE.Mesh(geometry, material)
      mesh.position.set(x, .048, z)
      scene.add(mesh)
      wayfindingPaths.push({section, material})
    }

    addWayfindingPath('featured', 0, .15, .07, 10.4)
    addWayfindingPath('latest', -4.15, -5.2, 8.25, .07)
    addWayfindingPath('topics', 4.15, -5.2, 8.25, .07)
    addWayfindingPath('search', -8.35, -13.15, .07, 15.9)
    addWayfindingPath('creators', 8.35, -13.15, .07, 15.9)
    addWayfindingPath('archive', 0, -20, .07, 28.8)

    // Netspace underlay: the library still reads as DEV, but the floor
    // behaves like a data plane rather than a conventional building.
    const netGrid = new THREE.GridHelper(82, 82, 0x3c4149, 0x252930)
    netGrid.position.set(0, .005, -16)
    const netGridMaterials = Array.isArray(netGrid.material)
      ? netGrid.material
      : [netGrid.material]
    netGridMaterials.forEach((material) => {
      material.transparent = true
      material.opacity = .022
      material.blending = THREE.NormalBlending
      material.depthWrite = false
      architecturalMaterials.push(material)
    })
    netGrid.visible = true
    scene.add(netGrid)

    const rainCount = 160
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
      opacity: .07,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
    const dataRain = new THREE.Points(rainGeometry, rainMaterial)
    dataRain.visible = false
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
        opacity: .006,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      })
      const gate = new THREE.Mesh(scanGateGeometry, material)
      gate.position.set(0, 2.45, z)
      gate.visible = false
      scene.add(gate)
      scanGates.push({mesh: gate, material, phase: index * 1.7})
      architecturalMaterials.push(material)
    })
    architecturalGeometries.push(scanGateGeometry)

    addSectionFloorGlow('atrium', 0, 7, 4.2)
    addSectionFloorGlow('featured', 0, -12.5, 5.4)
    addSectionFloorGlow('latest', -13, -14, 4.8)
    addSectionFloorGlow('topics', 13, -14, 4.8)
    addSectionFloorGlow('creators', 13, -25.5, 4.4)
    addSectionFloorGlow('search', -13, -25.5, 4.4)
    addSectionFloorGlow('archive', 0, -39.5, 4.3)

    addDoorwayBeacon('featured', 0, -5.4, 0)
    addDoorwayBeacon('latest', -8.35, -5.2, Math.PI / 2)
    addDoorwayBeacon('topics', 8.35, -5.2, Math.PI / 2)
    addDoorwayBeacon('creators', 8.35, -21.1, Math.PI / 2)
    addDoorwayBeacon('search', -8.35, -21.1, Math.PI / 2)
    addDoorwayBeacon('archive', 0, -34.4, 0)

    // Multi-level building shell. The playable library opens into a six-storey
    // atrium while the archive continues far past the walkable boundary.
    const buildingHeight = LIBRARY_FLOOR_COUNT * LIBRARY_FLOOR_HEIGHT
    const archiveCenterZ = -31.5
    const archiveDepth = 94

    const practicalFixtureGeometry = new THREE.BoxGeometry(2.05, .045, .22)
    architecturalGeometries.push(practicalFixtureGeometry)
    const practicalFixtureMaterials = FLOOR_ACCENTS.map((accent) => {
      const material = new THREE.MeshBasicMaterial({
        color: new THREE.Color(0xf3f1eb).lerp(
          new THREE.Color(accent),
          .025,
        ),
        transparent: true,
        opacity: .82,
        toneMapped: false,
      })
      architecturalMaterials.push(material)
      return material
    })

    const balconyUndersideStripGeometry = new THREE.BoxGeometry(
      .09,
      .045,
      88,
    )
    architecturalGeometries.push(balconyUndersideStripGeometry)
    const balconyUndersideStripMaterials = FLOOR_ACCENTS.map(() => {
      const material = new THREE.MeshBasicMaterial({
        color: 0xe4e5e2,
        transparent: true,
        opacity: .18,
        toneMapped: false,
        depthWrite: false,
      })
      architecturalMaterials.push(material)
      return material
    })

    function addPracticalFixtures(floor: number, base: number) {
      ;[-4, -14, -24, -34, -44, -54, -64].forEach((z, index) => {
        ;[-10.2, 10.2].forEach((x) => {
          const fixture = new THREE.Mesh(
            practicalFixtureGeometry,
            practicalFixtureMaterials[floor],
          )
          fixture.position.set(
            x,
            base + 4.55,
            z + (index % 2 === 0 ? 0 : .35),
          )
          scene.add(fixture)
        })
      })
    }
    function addLandmarkArch(
      x: number,
      z: number,
      width: number,
      height: number,
      floorBase: number,
      accent: number,
    ) {
      const columnGeometry = new THREE.BoxGeometry(.24, height, .36)
      const beamGeometry = new THREE.BoxGeometry(width, .24, .36)
      architecturalGeometries.push(columnGeometry, beamGeometry)
      const frameMaterial = new THREE.MeshStandardMaterial({
        color: 0x3a3d42,
        emissive: accent,
        emissiveIntensity: .025,
        roughness: .72,
        metalness: .12,
      })
      architecturalMaterials.push(frameMaterial)

      ;[-width / 2, width / 2].forEach((offset) => {
        const column = new THREE.Mesh(columnGeometry, frameMaterial)
        column.position.set(x + offset, floorBase + height / 2, z)
        column.castShadow = true
        column.receiveShadow = true
        scene.add(column)
      })

      const beam = new THREE.Mesh(beamGeometry, frameMaterial)
      beam.position.set(x, floorBase + height - .12, z)
      beam.castShadow = true
      scene.add(beam)
    }

    // A recognisable portal makes the Deep Archive a destination rather than
    // just another repeated shelf row.
    addLandmarkArch(0, -34.4, 6.4, 3.65, 0, FLOOR_ACCENTS[5])

    // Small project-signature easter egg: an unobtrusive green archive buddy
    // tucked beside the restricted stacks for explorers who wander off-route.
    const archiveBuddy = new THREE.Group()
    archiveBuddy.position.set(-4.55, .28, -36.15)

    const buddyBodyGeometry = new THREE.SphereGeometry(.34, 16, 12)
    const buddyEyeGeometry = new THREE.SphereGeometry(.035, 8, 6)
    architecturalGeometries.push(buddyBodyGeometry, buddyEyeGeometry)

    const buddyBodyMaterial = new THREE.MeshStandardMaterial({
      color: 0x68d98a,
      emissive: 0x1f5f35,
      emissiveIntensity: .12,
      roughness: .72,
      metalness: .02,
    })
    const buddyEyeMaterial = new THREE.MeshStandardMaterial({
      color: 0x090d0a,
      roughness: .5,
      metalness: .05,
    })
    architecturalMaterials.push(
      buddyBodyMaterial,
      buddyEyeMaterial,
    )

    const buddyBody = new THREE.Mesh(
      buddyBodyGeometry,
      buddyBodyMaterial,
    )
    buddyBody.scale.set(1.18, .82, 1)
    buddyBody.castShadow = true
    archiveBuddy.add(buddyBody)

    ;[-.115, .115].forEach((x) => {
      const eye = new THREE.Mesh(
        buddyEyeGeometry,
        buddyEyeMaterial,
      )
      eye.position.set(x, .045, .285)
      archiveBuddy.add(eye)
    })

    const buddyPlaqueTexture = createTextTexture(
      'MOCHI WAS HERE',
      'quietly cataloging the weird stuff',
      '#68d98a',
      430,
      120,
    )
    labelsToDispose.push(buddyPlaqueTexture)
    const buddyPlaqueMaterial = new THREE.SpriteMaterial({
      map: buddyPlaqueTexture,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
      opacity: .72,
    })
    architecturalMaterials.push(buddyPlaqueMaterial)
    const buddyPlaque = new THREE.Sprite(buddyPlaqueMaterial)
    buddyPlaque.position.set(0, .9, 0)
    buddyPlaque.scale.set(2.1, .58, 1)
    archiveBuddy.add(buddyPlaque)

    scene.add(archiveBuddy)

    const restrictedCanvas = document.createElement('canvas')
    restrictedCanvas.width = 640
    restrictedCanvas.height = 300
    const restrictedContext = restrictedCanvas.getContext('2d')
    if (restrictedContext) {
      restrictedContext.fillStyle = 'rgba(10,12,16,.76)'
      restrictedContext.fillRect(0, 0, 640, 300)

      for (let line = 0; line < 84; line += 1) {
        const seed = Math.abs(Math.sin(line * 18.917) * 43758.5453)
        const y = (seed % 1) * 300
        const alpha = .018 + ((line % 7) / 7) * .04
        restrictedContext.fillStyle =
          'rgba(180,190,202,' + alpha + ')'
        restrictedContext.fillRect(0, y, 640, line % 5 === 0 ? 2 : 1)
      }

      restrictedContext.textAlign = 'center'
      restrictedContext.textBaseline = 'middle'
      restrictedContext.fillStyle = '#c7ccd4'
      restrictedContext.font = '700 64px system-ui, sans-serif'
      restrictedContext.fillText('🔒', 320, 102)
      restrictedContext.fillStyle = '#e4e7eb'
      restrictedContext.font = '800 34px system-ui, sans-serif'
      restrictedContext.fillText('RESTRICTED STACKS', 320, 172)
      restrictedContext.fillStyle = '#8d9aad'
      restrictedContext.font = '650 18px system-ui, sans-serif'
      restrictedContext.fillText('DEEP ARCHIVE · AUTHORIZATION THRESHOLD', 320, 220)
    }
    const restrictedTexture = new THREE.CanvasTexture(restrictedCanvas)
    restrictedTexture.colorSpace = THREE.SRGBColorSpace
    restrictedTexture.minFilter = THREE.LinearFilter
    restrictedTexture.magFilter = THREE.LinearFilter
    labelsToDispose.push(restrictedTexture)
    const restrictedMaterial = new THREE.MeshBasicMaterial({
      map: restrictedTexture,
      transparent: true,
      opacity: .38,
      depthWrite: false,
      toneMapped: false,
      side: THREE.DoubleSide,
    })
    architecturalMaterials.push(restrictedMaterial)
    const restrictedGeometry = new THREE.PlaneGeometry(5.7, 2.75)
    architecturalGeometries.push(restrictedGeometry)
    const restrictedGate = new THREE.Mesh(
      restrictedGeometry,
      restrictedMaterial,
    )
    restrictedGate.position.set(0, 1.72, -34.25)
    scene.add(restrictedGate)

    addWall(-19, archiveCenterZ, .38, archiveDepth, buildingHeight, concrete, 0)
    addWall(19, archiveCenterZ, .38, archiveDepth, buildingHeight, concrete, 0)
    addWall(0, -78.3, 38, .38, buildingHeight, concrete, 0)
    addWall(-10.4, 14.7, 17.2, .38, buildingHeight, concrete, 0)
    addWall(10.4, 14.7, 17.2, .38, buildingHeight, concrete, 0)

    function addUpperFloor(floor: number) {
      const base = floor * LIBRARY_FLOOR_HEIGHT
      const floorAccent = FLOOR_ACCENTS[floor]
      const floorAccentHex =
        '#' + new THREE.Color(floorAccent).getHexString()

      addPracticalFixtures(floor, base)

      // Long, inward-facing wall skins make each collection level legible by
      // ambient material temperature and surface response, not just its HUD.
      const identityWallGeometry = new THREE.BoxGeometry(
        .045,
        3.9,
        archiveDepth - 1.2,
      )
      architecturalGeometries.push(identityWallGeometry)
      ;[-18.77, 18.77].forEach((x) => {
        const identityWall = new THREE.Mesh(
          identityWallGeometry,
          floorIdentityWallMaterials[floor],
        )
        identityWall.position.set(x, base + 2.05, archiveCenterZ)
        identityWall.receiveShadow = true
        scene.add(identityWall)
      })

      ;[-4.7, 4.7].forEach((x) => {
        const strip = new THREE.Mesh(
          balconyUndersideStripGeometry,
          balconyUndersideStripMaterials[floor],
        )
        strip.position.set(x, base - .27, archiveCenterZ)
        scene.add(strip)
      })

      // Wide side balconies leave a continuous central void. From any level
      // the player can read the floors above and below as one megastructure.
      addFloor(-11.85, archiveCenterZ, 14.3, archiveDepth, floorMaterial, base)
      addFloor(11.85, archiveCenterZ, 14.3, archiveDepth, floorMaterial, base)

      // Layered balcony decks give the player a readable walking plane
      // above the heavier structural slab.
      addFloorInsetSurface(
        -10.2,
        archiveCenterZ,
        2.85,
        88,
        base,
        floor,
        'primary',
      )
      addFloorInsetSurface(
        10.2,
        archiveCenterZ,
        2.85,
        88,
        base,
        floor,
        'primary',
      )
      addRouteBorder(-10.2, archiveCenterZ, 2.85, 88, base, floor, .1)
      addRouteBorder(10.2, archiveCenterZ, 2.85, 88, base, floor, .1)
      addFloorSeams(-10.2, archiveCenterZ, 2.85, 88, base, 'z', 9)
      addFloorSeams(10.2, archiveCenterZ, 2.85, 88, base, 'z', 9)

      const bridgeRibGeometry = new THREE.BoxGeometry(
        8.85,
        .16,
        .12,
      )
      architecturalGeometries.push(bridgeRibGeometry)

      UPPER_BRIDGE_Z.forEach((z) => {
        addFloor(0, z, 9.4, 4.4, floorMaterial, base)
        addFloorInsetSurface(
          0,
          z,
          8.75,
          2.55,
          base,
          floor,
          'bridge',
        )
        addRouteBorder(0, z, 8.75, 2.55, base, floor, .2)

        // Small raised threshold plates make the transition from balcony to
        // bridge obvious and provide repeated scale cues down the atrium.
        ;[-4.22, 4.22].forEach((x) => {
          addFloorInsetSurface(
            x,
            z,
            .78,
            2.9,
            base,
            floor,
            'threshold',
          )
        })

        // Dark structural ribs under every bridge remain visible from the
        // storeys below, giving the cross-spans weight and a repeatable unit
        // of scale as the player looks through the atrium.
        ;[-1.35, 0, 1.35].forEach((offset) => {
          const rib = new THREE.Mesh(
            bridgeRibGeometry,
            slabUndersideMaterial,
          )
          rib.position.set(0, base - .3, z + offset)
          rib.castShadow = true
          scene.add(rib)
        })
      })

      // The lift bridge gets a thicker landing pad and physical floor marker.
      addFloorInsetSurface(0, 7, 4.15, 3.05, base, floor, 'landing')
      addRouteBorder(0, 7, 4.15, 3.05, base, floor, .28)
      addLandingMarker(floor, -3.05, 7, base)

      if (floor % 2 === 0) {
        addLandmarkArch(
          0,
          -27,
          8.8,
          3.2,
          base,
          FLOOR_ACCENTS[floor],
        )
      }

      // Colored slab fascias make each storey identifiable from the atrium.
      // This is visible even when the floor surface itself is mostly hidden.
      const fasciaGeometry = new THREE.BoxGeometry(.075, .18, archiveDepth - 4)
      architecturalGeometries.push(fasciaGeometry)
      const fasciaMaterial = new THREE.MeshBasicMaterial({
        color: floorAccent,
        transparent: true,
        opacity: .11,
        depthWrite: false,
      })
      architecturalMaterials.push(fasciaMaterial)
      ;[-4.73, 4.73].forEach((x) => {
        const fascia = new THREE.Mesh(fasciaGeometry, fasciaMaterial)
        fascia.position.set(x, base - .045, archiveCenterZ)
        scene.add(fascia)
      })

      // Balcony rails stop at bridge entrances instead of slicing across
      // them, so the cross-floor circulation reads as physically plausible.
      const balconyRailMaterial = new THREE.MeshBasicMaterial({
        color: floorAccent,
        transparent: true,
        opacity: .055,
        depthWrite: false,
      })
      architecturalMaterials.push(balconyRailMaterial)
      const railSegments = [
        {z: 11.85, length: 5.3},
        {z: -1.5, length: 12.6},
        {z: -18.5, length: 12.6},
        {z: -36, length: 13.6},
        {z: -54, length: 13.6},
        {z: -71.6, length: 12.8},
      ]
      railSegments.forEach(({z, length}) => {
        const geometry = new THREE.BoxGeometry(.055, .06, length)
        architecturalGeometries.push(geometry)
        ;[-4.72, 4.72].forEach((x) => {
          const rail = new THREE.Mesh(
            geometry,
            balconyRailMaterial,
          )
          rail.position.set(x, base + 1.05, z)
          scene.add(rail)
        })
      })

      // Each cross-bridge gets a luminous threshold so the circulation path
      // is visible from several storeys away.
      const bridgeLightGeometry = new THREE.BoxGeometry(8.8, .024, .05)
      architecturalGeometries.push(bridgeLightGeometry)
      const bridgeLightMaterial = new THREE.MeshBasicMaterial({
        color: floorAccent,
        transparent: true,
        opacity: .075,
        depthWrite: false,
      })
      architecturalMaterials.push(bridgeLightMaterial)
      UPPER_BRIDGE_Z.forEach((z) => {
        const strip = new THREE.Mesh(
          bridgeLightGeometry,
          bridgeLightMaterial,
        )
        strip.position.set(0, base + .03, z)
        scene.add(strip)
      })

      const bridgeRailGeometry = new THREE.BoxGeometry(9.4, .055, .055)
      architecturalGeometries.push(bridgeRailGeometry)
      UPPER_BRIDGE_Z.forEach((z) => {
        ;[-2.05, 2.05].forEach((offset) => {
          const rail = new THREE.Mesh(
            bridgeRailGeometry,
            balconyRailMaterial,
          )
          rail.position.set(0, base + 1.05, z + offset)
          scene.add(rail)
        })
      })

      // A translucent archive horizon hides the actual render cutoff and
      // suggests more stacks beyond the visible geometry.
      const horizonGeometry = new THREE.PlaneGeometry(25, 4.2)
      architecturalGeometries.push(horizonGeometry)
      const horizonMaterial = new THREE.MeshBasicMaterial({
        color: new THREE.Color(0x0c0f14).lerp(
          new THREE.Color(floorAccent),
          .1,
        ),
        transparent: true,
        opacity: .045,
        depthWrite: false,
        side: THREE.DoubleSide,
      })
      architecturalMaterials.push(horizonMaterial)
      const horizon = new THREE.Mesh(
        horizonGeometry,
        horizonMaterial,
      )
      horizon.position.set(0, base + 2.05, -57.8)
      horizon.visible = false
      scene.add(horizon)

      const levelTexture = createTextTexture(
        'LEVEL ' + String(floor + 1).padStart(2, '0'),
        FLOOR_IDENTITIES[floor] ?? 'DEEP DEV COLLECTION',
        floorAccentHex,
        760,
        180,
      )
      labelsToDispose.push(levelTexture)
      const levelMaterial = new THREE.SpriteMaterial({
        map: levelTexture,
        transparent: true,
        depthWrite: false,
        toneMapped: false,
      })
      architecturalMaterials.push(levelMaterial)
      const levelSprite = new THREE.Sprite(levelMaterial)
      levelSprite.position.set(0, base + 2.75, 4.45)
      levelSprite.scale.set(7.2, 1.7, 1)
      scene.add(levelSprite)

      // Human-height aisle markers make the current collection readable while
      // walking, instead of forcing the player to read giant atrium signage.
      ;[-10, -27, -45].forEach((z, aisleIndex) => {
        const aisleName =
          FLOOR_AISLES[floor][aisleIndex] ?? 'COLLECTION'
        const aisleTexture = createTextTexture(
          'AISLE ' +
            String(floor + 1).padStart(2, '0') +
            String.fromCharCode(65 + aisleIndex) +
            ' · ' +
            aisleName,
          'DEV LIBRARY · REAL ARTICLES',
          floorAccentHex,
          620,
          142,
        )
        labelsToDispose.push(aisleTexture)
        const aisleMaterial = new THREE.SpriteMaterial({
          map: aisleTexture,
          transparent: true,
          depthWrite: false,
          toneMapped: false,
        })
        architecturalMaterials.push(aisleMaterial)
        const aisleSprite = new THREE.Sprite(aisleMaterial)
        aisleSprite.position.set(
          aisleIndex % 2 === 0 ? -5.8 : 5.8,
          base + 1.95,
          z,
        )
        aisleSprite.scale.set(4.8, 1.1, 1)
        scene.add(aisleSprite)
      })

      // A visible emergency stairwell makes the vertical circulation legible
      // even though the central lift remains the fast traversal mechanic.
      const stepGeometry = new THREE.BoxGeometry(2.2, .16, .64)
      architecturalGeometries.push(stepGeometry)
      for (let step = 0; step < 14; step += 1) {
        const stair = new THREE.Mesh(stepGeometry, floorMaterial)
        stair.position.set(
          16.25,
          base + .08 + step * (LIBRARY_FLOOR_HEIGHT / 14),
          10.8 - step * .58,
        )
        stair.receiveShadow = true
        scene.add(stair)
      }
    }

    for (let floor = 1; floor < LIBRARY_FLOOR_COUNT; floor += 1) {
      addUpperFloor(floor)
    }
    addFloor(0, archiveCenterZ, 38, archiveDepth, concrete, buildingHeight)

    // Central lift shaft ties every floor together visually and is also the
    // route used by cross-floor travel.
    const liftColumnGeometry = new THREE.BoxGeometry(.07, buildingHeight, .07)
    const liftRingGeometry = new THREE.BoxGeometry(3.5, .045, 4.1)
    architecturalGeometries.push(liftColumnGeometry, liftRingGeometry)
    const liftMaterial = new THREE.MeshBasicMaterial({
      color: 0x8d9aad,
      transparent: true,
      opacity: .14,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
    architecturalMaterials.push(liftMaterial)
    ;[-1.65, 1.65].forEach((x) => {
      ;[5.05, 8.95].forEach((z) => {
        const column = new THREE.Mesh(liftColumnGeometry, liftMaterial)
        column.position.set(x, buildingHeight / 2, z)
        scene.add(column)
      })
    })
    for (let floor = 0; floor < LIBRARY_FLOOR_COUNT; floor += 1) {
      const ringMaterial = new THREE.MeshBasicMaterial({
        color: FLOOR_ACCENTS[floor],
        transparent: true,
        opacity: .48,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
      architecturalMaterials.push(ringMaterial)
      const ring = new THREE.Mesh(liftRingGeometry, ringMaterial)
      ring.position.set(0, floor * LIBRARY_FLOOR_HEIGHT + .04, 7)
      scene.add(ring)
    }

    // Eye-level vertical-travel landmark: the shaft existed before, but
    // first-time visitors could miss that it was the building's circulation.
    const liftPortalPostGeometry = new THREE.BoxGeometry(.14, 3.15, .2)
    const liftPortalBeamGeometry = new THREE.BoxGeometry(4.6, .16, .2)
    architecturalGeometries.push(
      liftPortalPostGeometry,
      liftPortalBeamGeometry,
    )
    const liftPortalMaterial = new THREE.MeshStandardMaterial({
      color: 0x40464d,
      emissive: 0xc7f3ff,
      emissiveIntensity: .08,
      roughness: .58,
      metalness: .22,
    })
    architecturalMaterials.push(liftPortalMaterial)
    ;[-2.2, 2.2].forEach((x) => {
      const post = new THREE.Mesh(
        liftPortalPostGeometry,
        liftPortalMaterial,
      )
      post.position.set(x, 1.58, 4.72)
      scene.add(post)
    })
    const liftPortalBeam = new THREE.Mesh(
      liftPortalBeamGeometry,
      liftPortalMaterial,
    )
    liftPortalBeam.position.set(0, 3.08, 4.72)
    scene.add(liftPortalBeam)

    const liftPortalTexture = createTextTexture(
      '↑  CENTRAL LIFT  ↓',
      'LEVELS 01–06 · Pg↑ / Pg↓',
      '#c7f3ff',
      700,
      150,
    )
    labelsToDispose.push(liftPortalTexture)
    const liftPortalSignMaterial = new THREE.SpriteMaterial({
      map: liftPortalTexture,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
    })
    architecturalMaterials.push(liftPortalSignMaterial)
    const liftPortalSign = new THREE.Sprite(liftPortalSignMaterial)
    liftPortalSign.position.set(0, 2.35, 4.62)
    liftPortalSign.scale.set(4.15, .9, 1)
    scene.add(liftPortalSign)

    const liftCabin = new THREE.Group()
    liftCabin.position.set(0, currentFloorRef.current * LIBRARY_FLOOR_HEIGHT, 7)
    const liftDeckGeometry = new THREE.BoxGeometry(3.05, .12, 3.55)
    const liftCanopyGeometry = new THREE.BoxGeometry(3.05, .06, 3.55)
    const liftBackGeometry = new THREE.BoxGeometry(3.05, 2.5, .055)
    architecturalGeometries.push(
      liftDeckGeometry,
      liftCanopyGeometry,
      liftBackGeometry,
    )
    const liftDeckMaterial = new THREE.MeshStandardMaterial({
      color: 0x171d2a,
      emissive: 0x15275a,
      emissiveIntensity: .28,
      roughness: .42,
      metalness: .55,
    })
    const liftGlassMaterial = new THREE.MeshBasicMaterial({
      color: 0x8ae8ff,
      transparent: true,
      opacity: .075,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
    architecturalMaterials.push(liftDeckMaterial, liftGlassMaterial)
    const liftDeck = new THREE.Mesh(liftDeckGeometry, liftDeckMaterial)
    liftDeck.position.y = .03
    liftCabin.add(liftDeck)
    const liftCanopy = new THREE.Mesh(liftCanopyGeometry, liftGlassMaterial)
    liftCanopy.position.y = 2.55
    liftCabin.add(liftCanopy)
    const liftBack = new THREE.Mesh(liftBackGeometry, liftGlassMaterial)
    liftBack.position.set(0, 1.28, 1.7)
    liftCabin.add(liftBack)
    scene.add(liftCabin)

    for (let floor = 0; floor < LIBRARY_FLOOR_COUNT; floor += 1) {
      const floorAccentHex =
        '#' + new THREE.Color(FLOOR_ACCENTS[floor]).getHexString()
      const liftSignTexture = createTextTexture(
        'CENTRAL LIFT · LEVEL ' + String(floor + 1).padStart(2, '0'),
        FLOOR_IDENTITIES[floor] + ' · Pg↑ / Pg↓',
        floorAccentHex,
        760,
        160,
      )
      labelsToDispose.push(liftSignTexture)
      const liftSignMaterial = new THREE.SpriteMaterial({
        map: liftSignTexture,
        transparent: true,
        depthWrite: false,
        toneMapped: false,
      })
      architecturalMaterials.push(liftSignMaterial)
      const liftSign = new THREE.Sprite(liftSignMaterial)
      liftSign.position.set(
        2.65,
        floor * LIBRARY_FLOOR_HEIGHT + 1.65,
        6.15,
      )
      liftSign.scale.set(4.4, 1.05, 1)
      scene.add(liftSign)

      const landmarkTexture = createTextTexture(
        String(floor + 1).padStart(2, '0'),
        FLOOR_AISLES[floor].join(' · '),
        floorAccentHex,
        420,
        210,
      )
      labelsToDispose.push(landmarkTexture)
      const landmarkMaterial = new THREE.SpriteMaterial({
        map: landmarkTexture,
        transparent: true,
        depthWrite: false,
        toneMapped: false,
      })
      architecturalMaterials.push(landmarkMaterial)
      const landmark = new THREE.Sprite(landmarkMaterial)
      landmark.position.set(
        -5.8,
        floor * LIBRARY_FLOOR_HEIGHT + 1.55,
        7.1,
      )
      landmark.scale.set(3.4, 1.7, 1)
      scene.add(landmark)
    }

    // Main library architecture.
    addPracticalFixtures(0, 0)
    addFloor(0, -15, 34, 58)
    addFloor(-13, -13, 16, 28)
    addFloor(13, -13, 16, 28)
    addFloor(0, -39, 18, 12)

    // Ground-floor decks are layered separately from the structural slab.
    // The raised surfaces and joints give the long nave a measurable rhythm.
    addFloorInsetSurface(0, -15, 3.65, 56, 0, 0, 'primary')
    addRouteBorder(0, -15, 3.65, 56, 0, 0, .14)
    addFloorSeams(0, -15, 3.65, 56, 0, 'z', 8)

    addFloorInsetSurface(-13, -15, 2.85, 26, 0, 0, 'secondary')
    addFloorInsetSurface(13, -15, 2.85, 26, 0, 0, 'secondary')
    addRouteBorder(-13, -15, 2.85, 26, 0, 0, .09)
    addRouteBorder(13, -15, 2.85, 26, 0, 0, .09)
    addFloorSeams(-13, -15, 2.85, 26, 0, 'z', 4)
    addFloorSeams(13, -15, 2.85, 26, 0, 'z', 4)

    addFloorInsetSurface(0, -39, 5.6, 10.5, 0, 5, 'threshold')
    addRouteBorder(0, -39, 5.6, 10.5, 0, 5, .2)

    // Level 01 marker sits beside the information desk rather than under it.
    addLandingMarker(0, -4.15, 6.8, 0)

    // The playable archive stops around z=-43, but the physical collection
    // continues another thirty-plus metres into fog.
    addFloor(0, -61, 38, 34)

    // Atrium shell and central nave. The deep-archive threshold is open in
    // the middle, producing a sightline into rows the player cannot reach.
    ;[-8.9, 8.9].forEach((x) => {
      addWall(x, 7, .35, 10, 5.8)
      addWall(x, -12.5, .35, 11, 5.8)
      addWall(x, -32.5, .35, 17, 5.8)
    })
    addWall(0, 14.5, 18, .35, 5.8)
    addWall(-6.5, -44.5, 5, .35, 5.8)
    addWall(6.5, -44.5, 5, .35, 5.8)

    // Wing separators leave intentional door-sized gaps.
    addWall(-13, 1.8, 7.5, .28, 4.6)
    addWall(-13, -29.5, 7.5, .28, 4.6)
    addWall(13, 1.8, 7.5, .28, 4.6)
    addWall(13, -29.5, 7.5, .28, 4.6)

    type DensityShelfUnit = {
      x: number
      z: number
      rotationY: number
      floorBase: number
      width: number
      distant: boolean
    }

    // Build shelves from article occupancy. Real shelves stay fully physical
    // in the playable collection; distant archive furniture is instanced.
    const occupiedShelfUnits = new Map<
      string,
      Omit<DensityShelfUnit, 'width' | 'distant'>
    >()
    const densityShelfUnits: DensityShelfUnit[] = []

    nodes.forEach((node) => {
      if (node.kind !== 'article' || !node.shelfKey) return

      const physicalKey =
        (node.floorIndex ?? 0) +
        ':' +
        node.shelfKey.replace(/:level-\d+$/, '')
      if (occupiedShelfUnits.has(physicalKey)) return

      const rotationY = node.rotationY ?? 0
      const floorIndex = node.floorIndex ?? 0
      const slotSpacing = floorIndex === 0 ? 1.02 : .96
      const slotOffset = ((node.shelfSlot ?? 1) - 1) * slotSpacing
      const front = .42

      const localX = Math.cos(rotationY) * slotOffset
      const localZ = -Math.sin(rotationY) * slotOffset
      const frontX = Math.sin(rotationY) * front
      const frontZ = Math.cos(rotationY) * front

      occupiedShelfUnits.set(physicalKey, {
        x: node.position[0] - localX - frontX,
        z: node.position[2] - localZ - frontZ,
        rotationY,
        floorBase: floorIndex * LIBRARY_FLOOR_HEIGHT,
      })
    })

    occupiedShelfUnits.forEach(
      ({x, z, rotationY, floorBase}) => {
        const width = floorBase === 0 ? 4.5 : 4.45
        addShelf(x, z, width, rotationY, floorBase)
        densityShelfUnits.push({
          x,
          z,
          rotationY,
          floorBase,
          width,
          distant: false,
        })
      },
    )

    // A completely data-independent archive LOD keeps every upper floor
    // visually occupied even before its real DEV articles have arrived.
    // These silhouettes are non-interactive and intentionally cheap.
    const realArticleCountByFloor = Array.from(
      {length: LIBRARY_FLOOR_COUNT},
      () => 0,
    )
    nodes.forEach((node) => {
      if (node.kind !== 'article') return
      const floorIndex = THREE.MathUtils.clamp(
        node.floorIndex ?? 0,
        0,
        LIBRARY_FLOOR_COUNT - 1,
      )
      realArticleCountByFloor[floorIndex] += 1
    })

    const archivePlaceholderLods = new Map<
      number,
      {
        shelves: THREE.Group
        books: THREE.InstancedMesh
        shelfMaterial: THREE.MeshStandardMaterial
        bookMaterial: THREE.MeshStandardMaterial
        articleCount: number
      }
    >()

    const placeholderCoreGeometry = new THREE.BoxGeometry(1, 1, 1)
    const placeholderUprightGeometry = new THREE.BoxGeometry(1, 1, 1)
    const placeholderBoardGeometry = new THREE.BoxGeometry(1, 1, 1)
    const placeholderBookGeometry = new THREE.BoxGeometry(1, 1, 1)
    architecturalGeometries.push(
      placeholderCoreGeometry,
      placeholderUprightGeometry,
      placeholderBoardGeometry,
      placeholderBookGeometry,
    )

    const placeholderRows = [-9.5, -15.2, -20.9, -26.6, -32.3, -38, -43.7, -49.4]
    const placeholderColumns = [-13.2, -7.4, 7.4, 13.2]
    const placeholderBooksPerShelf = 108
    const placeholderMatrix = new THREE.Matrix4()
    const placeholderPosition = new THREE.Vector3()
    const placeholderQuaternion = new THREE.Quaternion()
    const placeholderScale = new THREE.Vector3()
    const placeholderUp = new THREE.Vector3(0, 1, 0)

    for (let floor = 1; floor < LIBRARY_FLOOR_COUNT; floor += 1) {
      const floorBase = floor * LIBRARY_FLOOR_HEIGHT
      const accent = new THREE.Color(FLOOR_ACCENTS[floor])
      const shelfMaterial = new THREE.MeshStandardMaterial({
        color: new THREE.Color(0x292b2f).lerp(accent, .035),
        emissive: accent,
        emissiveIntensity: .01,
        roughness: .9,
        metalness: .04,
        transparent: true,
        opacity: .74,
      })
      const bookMaterial = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        vertexColors: true,
        emissive: accent,
        emissiveIntensity: .025,
        roughness: .78,
        metalness: .08,
        transparent: true,
        opacity: .68,
      })
      architecturalMaterials.push(shelfMaterial, bookMaterial)

      const shelfCount = placeholderRows.length * placeholderColumns.length
      // Four shared instanced components make every distant unit physically
      // legible from either aisle: core, uprights, and shelf boards.
      const shelves = new THREE.Group()
      const placeholderCores = new THREE.InstancedMesh(
        placeholderCoreGeometry,
        shelfMaterial,
        shelfCount,
      )
      const placeholderUprights = new THREE.InstancedMesh(
        placeholderUprightGeometry,
        shelfMaterial,
        shelfCount * 2,
      )
      const placeholderBoards = new THREE.InstancedMesh(
        placeholderBoardGeometry,
        shelfMaterial,
        shelfCount * 4,
      )
      const books = new THREE.InstancedMesh(
        placeholderBookGeometry,
        bookMaterial,
        shelfCount * placeholderBooksPerShelf,
      )
      ;[placeholderCores, placeholderUprights, placeholderBoards].forEach(
        (mesh) => {
          mesh.castShadow = false
          mesh.receiveShadow = false
          mesh.frustumCulled = true
          shelves.add(mesh)
        },
      )
      books.castShadow = false
      books.receiveShadow = false
      books.frustumCulled = true

      let shelfIndex = 0
      let bookIndex = 0

      placeholderRows.forEach((z, rowIndex) => {
        placeholderColumns.forEach((x, columnIndex) => {
          const rotationY = rowIndex % 2 === 0 ? 0 : Math.PI
          placeholderQuaternion.setFromAxisAngle(
            placeholderUp,
            rotationY,
          )
          placeholderPosition.set(x, floorBase + 1.72, z)
          placeholderScale.set(4.2, 3.35, .16)
          placeholderMatrix.compose(
            placeholderPosition,
            placeholderQuaternion,
            placeholderScale,
          )
          placeholderCores.setMatrixAt(shelfIndex, placeholderMatrix)

          ;[-1, 1].forEach((side, sideIndex) => {
            placeholderPosition.set(
              x + Math.cos(rotationY) * side * 2.1,
              floorBase + 1.72,
              z - Math.sin(rotationY) * side * 2.1,
            )
            placeholderScale.set(.16, 3.56, .16)
            placeholderMatrix.compose(
              placeholderPosition,
              placeholderQuaternion,
              placeholderScale,
            )
            placeholderUprights.setMatrixAt(
              shelfIndex * 2 + sideIndex,
              placeholderMatrix,
            )
          })
          ;[.18, 1.28, 2.38, 3.48].forEach((boardY, boardIndex) => {
            placeholderPosition.set(x, floorBase + boardY, z)
            placeholderScale.set(4.2, .1, 1.32)
            placeholderMatrix.compose(
              placeholderPosition,
              placeholderQuaternion,
              placeholderScale,
            )
            placeholderBoards.setMatrixAt(
              shelfIndex * 4 + boardIndex,
              placeholderMatrix,
            )
          })

          for (let level = 0; level < 3; level += 1) {
            for (let face = -1; face <= 1; face += 2) {
              for (let slot = 0; slot < 18; slot += 1) {
              const localX = THREE.MathUtils.lerp(
                -1.82,
                1.82,
                slot / 17,
              )
              const seed =
                floor * 997 +
                rowIndex * 89 +
                columnIndex * 37 +
                level * 13 +
                slot * 5
              const height = .54 + ((seed % 11) / 10) * .25
              const width = .16 + ((seed % 5) / 4) * .06
              const front = face * .43
              placeholderPosition.set(
                x +
                  Math.cos(rotationY) * localX +
                  Math.sin(rotationY) * front,
                floorBase + .23 + level * 1.08 + height / 2,
                z -
                  Math.sin(rotationY) * localX +
                  Math.cos(rotationY) * front,
              )
              placeholderScale.set(width, height, .13)
              placeholderMatrix.compose(
                placeholderPosition,
                placeholderQuaternion,
                placeholderScale,
              )
              books.setMatrixAt(bookIndex, placeholderMatrix)

              const variation =
                .24 + ((seed % 9) / 8) * .24
              books.setColorAt(
                bookIndex,
                new THREE.Color(0x596474).lerp(
                  accent,
                  variation,
                ),
              )
              bookIndex += 1
              }
            }
          }

          shelfIndex += 1
        })
      })

      placeholderCores.instanceMatrix.needsUpdate = true
      placeholderUprights.instanceMatrix.needsUpdate = true
      placeholderBoards.instanceMatrix.needsUpdate = true
      books.instanceMatrix.needsUpdate = true
      if (books.instanceColor) books.instanceColor.needsUpdate = true
      scene.add(shelves, books)
      archivePlaceholderLods.set(floor, {
        shelves,
        books,
        shelfMaterial,
        bookMaterial,
        articleCount: realArticleCountByFloor[floor],
      })
    }

    // Beyond the collision boundary, banks of cheap shelves keep repeating.
    // They are deliberately inaccessible: their job is to sell impossible
    // depth, not add thousands of collision bodies.
    const distantShelfUnits: DensityShelfUnit[] = []
    const distantRows = [-49.5, -57.5, -65.5, -73.5]
    const distantColumns = [-15.2, -10.3, -5.8, 5.8, 10.3, 15.2]
    for (let floor = 0; floor < LIBRARY_FLOOR_COUNT; floor += 1) {
      distantRows.forEach((z, row) => {
        distantColumns.forEach((x, column) => {
          const unit: DensityShelfUnit = {
            x,
            z,
            rotationY: row % 2 === 0 ? 0 : Math.PI,
            floorBase: floor * LIBRARY_FLOOR_HEIGHT,
            width: 4.15,
            distant: true,
          }
          distantShelfUnits.push(unit)
          densityShelfUnits.push(unit)
        })
      })
    }

    const distantBackGeometry = new THREE.BoxGeometry(1, 1, .12)
    const distantBoardGeometry = new THREE.BoxGeometry(1, .09, 1.32)
    const distantUprightGeometry = new THREE.BoxGeometry(.16, 3.56, 1.32)
    const distantShelfMaterial = new THREE.MeshStandardMaterial({
      color: 0x202329,
      map: architecturalSurfaceTexture,
      roughnessMap: architecturalSurfaceRoughness,
      emissive: 0x0b0e16,
      emissiveIntensity: .07,
      roughness: .82,
      metalness: .12,
    })
    architecturalGeometries.push(
      distantBackGeometry,
      distantBoardGeometry,
      distantUprightGeometry,
    )
    architecturalMaterials.push(distantShelfMaterial)

    const distantBacks = new THREE.InstancedMesh(
      distantBackGeometry,
      distantShelfMaterial,
      distantShelfUnits.length,
    )
    const distantBoards = new THREE.InstancedMesh(
      distantBoardGeometry,
      distantShelfMaterial,
      distantShelfUnits.length * 4,
    )
    const distantUprights = new THREE.InstancedMesh(
      distantUprightGeometry,
      distantShelfMaterial,
      distantShelfUnits.length * 2,
    )
    const densityMatrix = new THREE.Matrix4()
    const densityPosition = new THREE.Vector3()
    const densityQuaternion = new THREE.Quaternion()
    const densityScale = new THREE.Vector3()

    distantShelfUnits.forEach((unit, index) => {
      densityQuaternion.setFromAxisAngle(
        new THREE.Vector3(0, 1, 0),
        unit.rotationY,
      )
      densityPosition.set(
        unit.x,
        unit.floorBase + 1.74,
        unit.z - Math.cos(unit.rotationY) * .29,
      )
      densityScale.set(unit.width, 3.46, 1)
      densityMatrix.compose(
        densityPosition,
        densityQuaternion,
        densityScale,
      )
      distantBacks.setMatrixAt(index, densityMatrix)

      ;[-1, 1].forEach((side, sideIndex) => {
        densityPosition.set(
          unit.x + Math.cos(unit.rotationY) * side * unit.width / 2,
          unit.floorBase + 1.76,
          unit.z - Math.sin(unit.rotationY) * side * unit.width / 2,
        )
        densityScale.set(1, 1, 1)
        densityMatrix.compose(
          densityPosition,
          densityQuaternion,
          densityScale,
        )
        distantUprights.setMatrixAt(index * 2 + sideIndex, densityMatrix)
      })

      ;[.18, 1.28, 2.38, 3.48].forEach((boardY, level) => {
        densityPosition.set(
          unit.x,
          unit.floorBase + boardY,
          unit.z,
        )
        densityScale.set(unit.width, 1, 1)
        densityMatrix.compose(
          densityPosition,
          densityQuaternion,
          densityScale,
        )
        distantBoards.setMatrixAt(index * 4 + level, densityMatrix)
      })
    })
    distantBacks.instanceMatrix.needsUpdate = true
    distantBoards.instanceMatrix.needsUpdate = true
    distantUprights.instanceMatrix.needsUpdate = true
    scene.add(distantBacks, distantBoards, distantUprights)

    // One instanced spine field fills every shelf, including the unreachable
    // archive. Real article objects sit slightly forward and replace these
    // cheap silhouettes when the player gets close.
    const fillerBooksPerLevel = 18
    const fillerBookGeometry = new THREE.BoxGeometry(1, 1, 1)
    const fillerBookMaterial = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      vertexColors: true,
      emissive: 0x080b12,
      emissiveIntensity: .07,
      roughness: .72,
      metalness: .16,
    })
    architecturalGeometries.push(fillerBookGeometry)
    architecturalMaterials.push(fillerBookMaterial)
    const fillerBookCount =
      densityShelfUnits.length * 3 * fillerBooksPerLevel * 2
    const fillerBooks = new THREE.InstancedMesh(
      fillerBookGeometry,
      fillerBookMaterial,
      fillerBookCount,
    )
    const fillerPalette = [
      0x354257,
      0x3b4861,
      0x304b59,
      0x493953,
      0x315762,
      0x424b7c,
      0x4d557d,
      0x3a404b,
    ]

    let fillerIndex = 0
    densityShelfUnits.forEach((unit, shelfIndex) => {
      densityQuaternion.setFromAxisAngle(
        new THREE.Vector3(0, 1, 0),
        unit.rotationY,
      )
      for (let level = 0; level < 3; level += 1) {
        for (let face = -1; face <= 1; face += 2) {
          for (let slot = 0; slot < fillerBooksPerLevel; slot += 1) {
          const t = slot / (fillerBooksPerLevel - 1)
          const localX = THREE.MathUtils.lerp(
            -unit.width / 2 + .19,
            unit.width / 2 - .19,
            t,
          )
          const seed = shelfIndex * 41 + level * 17 + slot * 7
          const height = .58 + ((seed % 9) / 8) * .26
          const width = .16 + ((seed % 5) / 4) * .06
          const front = face * .43
          densityPosition.set(
            unit.x +
              Math.cos(unit.rotationY) * localX +
              Math.sin(unit.rotationY) * front,
            unit.floorBase + .23 + level * 1.1 + height / 2,
            unit.z -
              Math.sin(unit.rotationY) * localX +
              Math.cos(unit.rotationY) * front,
          )
          densityScale.set(width, height, .13)
          densityMatrix.compose(
            densityPosition,
            densityQuaternion,
            densityScale,
          )
          fillerBooks.setMatrixAt(fillerIndex, densityMatrix)
          fillerBooks.setColorAt(
            fillerIndex,
            new THREE.Color(
              fillerPalette[
                (seed + level + (unit.distant ? 2 : 0)) %
                  fillerPalette.length
              ],
            ),
          )
          fillerIndex += 1
          }
        }
      }
    })
    fillerBooks.instanceMatrix.needsUpdate = true
    if (fillerBooks.instanceColor) {
      fillerBooks.instanceColor.needsUpdate = true
    }
    fillerBooks.castShadow = false
    fillerBooks.receiveShadow = false
    scene.add(fillerBooks)

    const ceilingRailGeometry = new THREE.BoxGeometry(.035, .035, 52)
    const ceilingRailMaterial = new THREE.MeshBasicMaterial({
      color: 0x3148b5,
      transparent: true,
      opacity: .065,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
    architecturalGeometries.push(ceilingRailGeometry)
    architecturalMaterials.push(ceilingRailMaterial)
    ;[-2.25, 2.25].forEach((x) => {
      const rail = new THREE.Mesh(
        ceilingRailGeometry,
        ceilingRailMaterial,
      )
      rail.position.set(x, 4.72, -15)
      scene.add(rail)
    })

    const wingRailGeometry = new THREE.BoxGeometry(.03, .03, 22)
    architecturalGeometries.push(wingRailGeometry)
    ;[-13, 13].forEach((x) => {
      const rail = new THREE.Mesh(
        wingRailGeometry,
        ceilingRailMaterial,
      )
      rail.position.set(x, 4.15, -15.5)
      scene.add(rail)
    })

    addSectionSign('atrium', 0, 4.6, 5.5, '#f5f5f5')
    addSectionSign('featured', 0, 4.1, -5.8, '#3b49df')
    addSectionSign(
      'latest',
      -13,
      4.1,
      -6.6,
      '#5b6cff',
      Math.PI / 2,
    )
    addSectionSign(
      'topics',
      13,
      4.1,
      -6.6,
      '#53d3ff',
      -Math.PI / 2,
    )
    addSectionSign(
      'creators',
      13,
      4.1,
      -21.4,
      '#ae7bff',
      -Math.PI / 2,
    )
    addSectionSign(
      'search',
      -13,
      4.1,
      -21.4,
      '#ff4fd8',
      Math.PI / 2,
    )
    addSectionSign('archive', 0, 4.1, -35.5, '#a3a3a3')

    // A retro-futuristic information desk in the atrium.
    const deskGeometry = new THREE.CylinderGeometry(1.5, 1.75, .95, 10)
    architecturalGeometries.push(deskGeometry)
    const desk = new THREE.Mesh(deskGeometry, brass)
    desk.position.set(0, .48, 7)
    desk.castShadow = true
    scene.add(desk)
    collisionRects.push({
      minX: -1.7,
      maxX: 1.7,
      minZ: 5.3,
      maxZ: 8.7,
      minY: 0,
      maxY: 1.2,
    })

    const deskGlowGeometry = new THREE.TorusGeometry(1.15, .028, 8, 72)
    const deskGlowMaterial = new THREE.MeshBasicMaterial({
      color: 0x77d9d1,
      transparent: true,
      opacity: .35,
      blending: THREE.AdditiveBlending,
    })
    architecturalGeometries.push(deskGlowGeometry)
    architecturalMaterials.push(deskGlowMaterial)
    const deskGlow = new THREE.Mesh(deskGlowGeometry, deskGlowMaterial)
    deskGlow.rotation.x = Math.PI / 2
    deskGlow.position.set(0, 1.04, 7)
    scene.add(deskGlow)

    const nodeById = new Map(nodes.map((node) => [node.id, node]))
    const visuals = new Map<string, Visual>()
    const interactive: THREE.Object3D[] = [
      ...architecturalInteractive,
    ]
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
      emissiveIntensity: .34,
      roughness: .38,
      metalness: .48,
    })
    const sharedArticleEdgeMaterial = new THREE.LineBasicMaterial({
      color: 0x5267ff,
      transparent: true,
      opacity: .16,
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
                : 1

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

    type ShelfCoverAtlasLod = {
      mesh: THREE.Mesh
      material: THREE.MeshBasicMaterial
      floorIndex: number
    }

    const shelfCoverAtlasGeometry = new THREE.PlaneGeometry(3.45, .78)
    architecturalGeometries.push(shelfCoverAtlasGeometry)
    const shelfCoverAtlasesByFloor = new Map<
      number,
      ShelfCoverAtlasLod[]
    >()

    function articleCoverUrl(node: SurfNode) {
      const cover =
        node.payload?.cover_image ??
        node.payload?.social_image ??
        null
      return typeof cover === 'string' && cover.trim()
        ? cover
        : null
    }

    function createShelfCoverAtlas(
      urls: string[],
      floorIndex: number,
      delayMs: number,
    ) {
      const canvas = document.createElement('canvas')
      canvas.width = 512
      canvas.height = 128
      const context = canvas.getContext('2d')
      const accent =
        '#' + new THREE.Color(FLOOR_ACCENTS[floorIndex]).getHexString()

      if (context) {
        context.fillStyle = '#101318'
        context.fillRect(0, 0, canvas.width, canvas.height)

        const gutter = 10
        const slotWidth =
          (canvas.width - gutter * (urls.length + 1)) /
          Math.max(1, urls.length)
        urls.forEach((_, index) => {
          const x = gutter + index * (slotWidth + gutter)
          context.fillStyle =
            index % 2 === 0 ? '#1a1f27' : '#20252d'
          context.fillRect(x, 8, slotWidth, 104)
          context.strokeStyle = 'rgba(255,255,255,.08)'
          context.lineWidth = 2
          context.strokeRect(x, 8, slotWidth, 104)
        })

        context.fillStyle = accent
        context.globalAlpha = .62
        context.fillRect(0, 119, canvas.width, 3)
        context.globalAlpha = 1
      }

      const atlas = new THREE.CanvasTexture(canvas)
      atlas.colorSpace = THREE.SRGBColorSpace
      atlas.minFilter = THREE.LinearFilter
      atlas.magFilter = THREE.LinearFilter
      atlas.generateMipmaps = false
      disposableTextures.push(atlas)

      const timer = window.setTimeout(() => {
        thumbnailPrefetchTimers.delete(timer)
        urls.forEach((url, index) => {
          requestThumbnailTexture(url, (texture) => {
            if (destroyed || !context) return

            const gutter = 10
            const slotWidth =
              (canvas.width - gutter * (urls.length + 1)) /
              Math.max(1, urls.length)
            const x = gutter + index * (slotWidth + gutter)

            try {
              context.drawImage(
                texture.image as CanvasImageSource,
                x,
                8,
                slotWidth,
                104,
              )
              context.fillStyle = 'rgba(8,10,14,.08)'
              context.fillRect(x, 8, slotWidth, 104)
              context.strokeStyle = 'rgba(255,255,255,.1)'
              context.lineWidth = 2
              context.strokeRect(x, 8, slotWidth, 104)
              atlas.needsUpdate = true
            } catch {
              // Keep the deterministic placeholder slot if the browser cannot
              // copy a decoded remote image into this shelf-level atlas.
            }
          })
        })
      }, delayMs)
      thumbnailPrefetchTimers.add(timer)

      return atlas
    }

    for (let floor = 1; floor < LIBRARY_FLOOR_COUNT; floor += 1) {
      const candidates = nodes.filter(
        (node) =>
          node.kind === 'article' &&
          (node.floorIndex ?? 0) === floor &&
          articleCoverUrl(node),
      )
      if (!candidates.length) continue

      const floorBase = floor * LIBRARY_FLOOR_HEIGHT
      // One small atlas is shared by every strip on the floor. This keeps
      // remote image work bounded (three cached requests per floor) while
      // letting every synthetic stack carry a cover-detail layer on both
      // faces instead of a handful of floating cards.
      const urls = candidates
        .slice(0, COVERS_PER_SHELF_ATLAS)
        .map(articleCoverUrl)
        .filter((url): url is string => Boolean(url))
      if (!urls.length) continue

      const atlas = createShelfCoverAtlas(
        urls,
        floor,
        (floor - 1) * 320,
      )
      const material = new THREE.MeshBasicMaterial({
        map: atlas,
        color: 0xffffff,
        transparent: true,
        opacity: .48,
        toneMapped: false,
        depthWrite: true,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
      })
      architecturalMaterials.push(material)

      const stripCount =
        placeholderRows.length *
        placeholderColumns.length *
        SHELF_ATLAS_STRIPS_PER_SHELF
      const mesh = new THREE.InstancedMesh(
        shelfCoverAtlasGeometry,
        material,
        stripCount,
      )
      const stripMatrix = new THREE.Matrix4()
      const stripPosition = new THREE.Vector3()
      const stripScale = new THREE.Vector3(1, 1, 1)
      const stripQuaternion = new THREE.Quaternion()
      let stripIndex = 0
      placeholderRows.forEach((z, rowIndex) => {
        placeholderColumns.forEach((x, columnIndex) => {
          const baseRotation = rowIndex % 2 === 0 ? 0 : Math.PI
          for (let face = -1; face <= 1; face += 2) {
            const rotationY = baseRotation + (face < 0 ? Math.PI : 0)
            const front = face * .692
            const level =
              (floor + rowIndex + columnIndex + (face < 0 ? 1 : 0)) % 3
            stripPosition.set(
              x + Math.sin(baseRotation) * front,
              floorBase + .64 + level * 1.08,
              z + Math.cos(baseRotation) * front,
            )
            stripQuaternion.setFromAxisAngle(placeholderUp, rotationY)
            stripMatrix.compose(stripPosition, stripQuaternion, stripScale)
            mesh.setMatrixAt(stripIndex, stripMatrix)
            stripIndex += 1
          }
        })
      })
      mesh.instanceMatrix.needsUpdate = true
      mesh.renderOrder = 2
      scene.add(mesh)
      shelfCoverAtlasesByFloor.set(floor, [{mesh, material, floorIndex: floor}])
    }

    // Article LOD: every real article has a tiny instanced stand-in. Distant
    // and off-floor books stay visible as physical spines; the full article
    // object only materializes when it becomes useful to the player.
    const articleProxyGeometry = new THREE.BoxGeometry(.68, .82, .15)
    const articleProxyMaterial = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      vertexColors: true,
      emissive: 0x0c1020,
      emissiveIntensity: .12,
      roughness: .68,
      metalness: .18,
    })
    architecturalGeometries.push(articleProxyGeometry)
    architecturalMaterials.push(articleProxyMaterial)

    const articleProxyLods = new Map<
      number,
      {mesh: THREE.InstancedMesh; nodes: SurfNode[]}
    >()
    const proxyMatrix = new THREE.Matrix4()
    const proxyPosition = new THREE.Vector3()
    const proxyQuaternion = new THREE.Quaternion()
    const proxyScale = new THREE.Vector3()
    const proxyUp = new THREE.Vector3(0, 1, 0)

    for (let floor = 0; floor < LIBRARY_FLOOR_COUNT; floor += 1) {
      const floorArticles = nodes.filter(
        (node) =>
          node.kind === 'article' &&
          (node.floorIndex ?? 0) === floor,
      )
      if (!floorArticles.length) continue

      const mesh = new THREE.InstancedMesh(
        articleProxyGeometry,
        articleProxyMaterial,
        floorArticles.length,
      )
      mesh.castShadow = false
      mesh.receiveShadow = false

      floorArticles.forEach((node, index) => {
        proxyPosition.set(...node.position)
        proxyQuaternion.setFromAxisAngle(
          proxyUp,
          node.rotationY ?? 0,
        )
        proxyScale.setScalar(1)
        proxyMatrix.compose(
          proxyPosition,
          proxyQuaternion,
          proxyScale,
        )
        mesh.setMatrixAt(index, proxyMatrix)
        mesh.setColorAt(
          index,
          new THREE.Color(node.accent).lerp(
            new THREE.Color(0x161a21),
            .72,
          ),
        )
      })
      mesh.instanceMatrix.needsUpdate = true
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
      scene.add(mesh)
      articleProxyLods.set(floor, {mesh, nodes: floorArticles})
    }

    function setVisibleFloor(floor: number) {
      detailedBookIds.clear()
      activeCoverUrls.clear()

      const floorAccent = new THREE.Color(FLOOR_ACCENTS[floor])
      const atmosphere = new THREE.Color(0x111319).lerp(
        floorAccent,
        floor === 0 ? .012 : .022,
      )
      scene.background = atmosphere.clone()
      if (scene.fog instanceof THREE.FogExp2) {
        scene.fog.color.copy(atmosphere)
      }
      floorIdentityLight.color.copy(floorAccent)
      floorIdentityLight.position.y =
        floor * LIBRARY_FLOOR_HEIGHT + 3.2
      floorIdentityLight.intensity = floor === 0 ? .7 : 1.05
      practicalLights.forEach((light, index) => {
        const layout = practicalLightLayout[index]
        light.position.set(
          layout.x,
          floor * LIBRARY_FLOOR_HEIGHT + 4.05,
          layout.z,
        )
        light.intensity = floor === 0 ? 3.15 : 3.55
      })
      landingLights.forEach((light, index) => {
        const layout = landingLightLayout[index]
        light.position.set(
          layout.x,
          floor * LIBRARY_FLOOR_HEIGHT + 3.65,
          layout.z,
        )
        light.intensity = floor === 0 ? 2.35 : 2.7
      })
      bridgeEntryLights.forEach((light, index) => {
        const layout = bridgeEntryLightLayout[index]
        light.position.set(
          layout.x,
          floor * LIBRARY_FLOOR_HEIGHT + 2.75,
          layout.z,
        )
        light.intensity = floor === 0 ? 1.35 : 1.65
      })
      shelfFillLights.forEach((light, index) => {
        const layout = shelfFillLightLayout[index]
        light.position.set(
          layout.x,
          floor * LIBRARY_FLOOR_HEIGHT + 2.65,
          layout.z,
        )
        light.intensity = floor === 0 ? .95 : 1.15
      })
      adjacentFloorLights.forEach(({light, direction, entry}) => {
        const targetFloor = floor + direction
        const valid =
          targetFloor >= 0 &&
          targetFloor < LIBRARY_FLOOR_COUNT
        light.position.set(
          entry.x,
          targetFloor * LIBRARY_FLOOR_HEIGHT + 3.9,
          entry.z,
        )
        light.intensity = valid ? 1.35 : 0
      })
      practicalFixtureMaterials.forEach((material, floorIndex) => {
        const distance = Math.abs(floorIndex - floor)
        material.opacity =
          distance === 0
            ? .88
            : distance === 1
              ? .52
              : distance === 2
                ? .2
                : .07
      })
      balconyUndersideStripMaterials.forEach((material, floorIndex) => {
        const distance = Math.abs(floorIndex - floor)
        material.opacity =
          distance === 0
            ? .34
            : distance === 1
              ? .22
              : distance === 2
                ? .09
                : .03
      })
      floorShelfTopMaterials.forEach((material, floorIndex) => {
        const distance = Math.abs(floorIndex - floor)
        material.emissiveIntensity =
          distance === 0 ? .028 : distance === 1 ? .008 : 0
      })

      // Keep non-current floors visually alive even when their real article
      // layer is hidden. Sparse current floors retain only a faint book-fill
      // layer so missing network data never exposes empty shelf geometry.
      archivePlaceholderLods.forEach((placeholder, floorIndex) => {
        const isCurrentFloor = floorIndex === floor
        const floorDistance = Math.abs(floorIndex - floor)
        const sparseCurrentFloor =
          isCurrentFloor && placeholder.articleCount < 36

        placeholder.shelves.visible =
          !isCurrentFloor || sparseCurrentFloor
        placeholder.books.visible =
          !isCurrentFloor || sparseCurrentFloor

        const distantShelfOpacity =
          floorDistance <= 1
            ? .42
            : floorDistance === 2
              ? .25
              : .14
        const distantBookOpacity =
          floorDistance <= 1
            ? .62
            : floorDistance === 2
              ? .4
              : .18

        placeholder.shelfMaterial.opacity =
          isCurrentFloor
            ? sparseCurrentFloor
              ? .12
              : 0
            : distantShelfOpacity
        placeholder.bookMaterial.opacity =
          isCurrentFloor
            ? sparseCurrentFloor
              ? .12
              : 0
            : distantBookOpacity
        placeholder.bookMaterial.emissiveIntensity =
          isCurrentFloor ? .018 : floorDistance <= 1 ? .052 : .022
      })

      shelfCoverAtlasesByFloor.forEach((entries, floorIndex) => {
        const isCurrentFloor = floorIndex === floor
        const floorDistance = Math.abs(floorIndex - floor)
        const sparseCurrentFloor =
          isCurrentFloor &&
          (realArticleCountByFloor[floorIndex] ?? 0) < 36
        const opacity =
          isCurrentFloor
            ? sparseCurrentFloor
              ? .16
              : 0
            : floorDistance <= 1
              ? .58
              : floorDistance === 2
                ? .34
                : .16

        entries.forEach(({mesh, material}) => {
          mesh.visible = opacity > .01
          material.opacity = opacity
          material.color.setScalar(
            floorDistance <= 1 ? .92 : floorDistance === 2 ? .72 : .5,
          )
        })
      })

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

    // A single transparent gradient gives otherwise-neutral transit runs a
    // gentle pull toward the next threshold without adding lights or routes.
    const corridorPullCanvas = document.createElement('canvas')
    corridorPullCanvas.width = 16
    corridorPullCanvas.height = 256
    const corridorPullContext = corridorPullCanvas.getContext('2d')
    if (corridorPullContext) {
      const gradient = corridorPullContext.createLinearGradient(0, 256, 0, 0)
      gradient.addColorStop(0, 'rgba(255,255,255,0)')
      gradient.addColorStop(.45, 'rgba(255,255,255,.025)')
      gradient.addColorStop(1, 'rgba(255,255,255,.22)')
      corridorPullContext.fillStyle = gradient
      corridorPullContext.fillRect(0, 0, 16, 256)
    }
    const corridorPullTexture = new THREE.CanvasTexture(corridorPullCanvas)
    corridorPullTexture.minFilter = THREE.LinearFilter
    corridorPullTexture.magFilter = THREE.LinearFilter
    corridorPullTexture.generateMipmaps = false
    labelsToDispose.push(corridorPullTexture)
    const corridorPullGeometry = new THREE.PlaneGeometry(.82, 1)
    const corridorPullMaterial = new THREE.MeshBasicMaterial({
      color: SECTION_ACCENTS.featured,
      map: corridorPullTexture,
      transparent: true,
      opacity: .46,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
    const corridorPull = new THREE.Mesh(
      corridorPullGeometry,
      corridorPullMaterial,
    )
    corridorPull.rotation.x = -Math.PI / 2
    corridorPull.visible = false
    scene.add(corridorPull)
    architecturalGeometries.push(corridorPullGeometry)
    architecturalMaterials.push(corridorPullMaterial)

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
    let yaw = 0
    let pitch = 0
    let hoverId: string | null = null
    let currentSection: LibrarySection = 'atrium'
    let lastTime = performance.now()
    let frame = 0
    let lastTravelNonce = travelRequestRef.current?.nonce ?? -1
    let lastFloorNonce = floorRequestRef.current?.nonce ?? -1
    let currentFloorIndex = currentFloorRef.current
    let lastLodUpdate = -1
    const sceneRevealStartedAt = performance.now()
    let debugFrameCount = 0
    let debugWindowStartedAt = performance.now()
    let displayedWayfindingCue: string | null = null

    function updateArticleLods(now: number) {
      if (now - lastLodUpdate < .22) return
      lastLodUpdate = now

      const revealDistanceSq = REAL_BOOK_DISTANCE * REAL_BOOK_DISTANCE
      articleProxyLods.forEach(({mesh, nodes: proxyNodes}, floorIndex) => {
        const isCurrentFloor = floorIndex === currentFloorIndex

        proxyNodes.forEach((node, index) => {
          const visual = visuals.get(node.id)
          const priority =
            node.id === selectedRef.current ||
            node.id === hoverId ||
            node.id === routeTargetRef.current
          const distanceSq = camera.position.distanceToSquared(
            visual?.basePosition ?? proxyPosition.set(...node.position),
          )
          const revealReal =
            isCurrentFloor &&
            (priority || distanceSq <= revealDistanceSq)

          if (visual) {
            visual.group.visible = revealReal
          }

          proxyPosition.set(...node.position)
          proxyQuaternion.setFromAxisAngle(
            proxyUp,
            node.rotationY ?? 0,
          )
          const scale =
            !isCurrentFloor || revealReal ? 0 : 1
          proxyScale.setScalar(scale)
          proxyMatrix.compose(
            proxyPosition,
            proxyQuaternion,
            proxyScale,
          )
          mesh.setMatrixAt(index, proxyMatrix)
        })

        mesh.instanceMatrix.needsUpdate = true
      })

    }

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
      const sourceY = camera.position.y
      const floorDistance = Math.abs(clamped - currentFloorIndex)
      const points = [
        camera.position.clone(),
        new THREE.Vector3(0, sourceY, 5.8),
        new THREE.Vector3(0, sourceY, 7),
        new THREE.Vector3(0, targetY, 7),
        new THREE.Vector3(0, targetY, 5.8),
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
        duration: reducedMotion
          ? 1.15
          : THREE.MathUtils.clamp(1.05 + floorDistance * .48, 1.45, 3.45),
      }
      travel = null
      velocity.set(0, 0, 0)
    }

    function pickCenter() {
      raycaster.setFromCamera(center, camera)
      const hit = raycaster.intersectObjects(interactive, false)[0]
      if (!hit) return null
      const nodeId = hit.object.userData.nodeId as string | undefined
      const node = nodeId ? nodeById.get(nodeId) ?? null : null
      if (!node) return null
      const visual = visuals.get(node.id)
      if (visual && !visual.group.visible) return null
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

    function hasWalkableSurface(next: THREE.Vector3) {
      if (currentFloorIndex === 0) return true

      const onSideBalcony =
        Math.abs(next.x) >= 4.68 &&
        Math.abs(next.x) <= 18.8

      const onBridge =
        Math.abs(next.x) <= 4.82 &&
        UPPER_BRIDGE_Z.some(
          (bridgeZ) => Math.abs(next.z - bridgeZ) <= 2.16,
        )

      return onSideBalcony || onBridge
    }

    function collides(
      next: THREE.Vector3,
      radius = .27,
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
        -19.55,
        19.55,
      )
      if (!collides(nextX) && hasWalkableSurface(nextX)) {
        position.x = nextX.x
      } else {
        velocity.x *= .28
      }

      const nextZ = position.clone()
      nextZ.z = THREE.MathUtils.clamp(
        nextZ.z + deltaMove.z,
        -43.15,
        13.65,
      )
      if (!collides(nextZ) && hasWalkableSurface(nextZ)) {
        position.z = nextZ.z
      } else {
        velocity.z *= .28
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
      yaw -= event.movementX * .00118
      pitch -= event.movementY * .00104
      pitch = THREE.MathUtils.clamp(pitch, -.48, .48)
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
          event.code === 'Digit4' ||
          event.code === 'Digit5' ||
          event.code === 'Digit6'
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
        void renderer.domElement.requestPointerLock().catch(() => {
          // Browsers reject immediate re-lock attempts after Escape. A failed
          // lock request should never become an unhandled application error.
        })
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
      const streamReveal = THREE.MathUtils.smoothstep(
        nowMs - sceneRevealStartedAt,
        0,
        680,
      )
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

      updateArticleLods(now)

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

          const articleReveal =
            node?.kind === 'article' ? streamReveal : 1
          visual.material.opacity +=
            (((unrelatedShelf ? .3 : 1) * articleReveal -
              visual.material.opacity)) *
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
                  ? .84
                  : unrelatedShelf
                    ? .12
                    : .38) -
            visual.material.emissiveIntensity) *
          .08

        if (visual.bookGlowMaterial) {
          visual.bookGlowMaterial.opacity +=
            ((selected
              ? .26
              : hovered
                ? .24
                : routed
                  ? .2
                  : sameShelf
                    ? .11
                    : .025) -
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
              ? .22
              : id.startsWith('profile:') || id.startsWith('tag:')
                ? .82
                : node?.kind === 'article'
                  ? sameShelf
                    ? .72
                    : unrelatedShelf
                      ? .025
                      : .1
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

      archivePlaceholderLods.forEach((placeholder, floorIndex) => {
        const isCurrentFloor = floorIndex === currentFloorIndex
        const floorDistance = Math.abs(floorIndex - currentFloorIndex)
        const sparseCurrentFloor =
          isCurrentFloor && placeholder.articleCount < 36
        const catalogPulse =
          .5 + .5 * Math.sin(now * 3.1 + floorIndex * .8)

        const normalShelfTarget =
          isCurrentFloor
            ? sparseCurrentFloor
              ? .12
              : 0
            : floorDistance <= 1
              ? .42
              : floorDistance === 2
                ? .25
                : .14
        const normalBookTarget =
          isCurrentFloor
            ? sparseCurrentFloor
              ? .12
              : 0
            : floorDistance <= 1
              ? .62
              : floorDistance === 2
                ? .4
                : .18

        const shelfTarget = catalogLoadingRef.current
          ? Math.max(normalShelfTarget, isCurrentFloor ? .16 + catalogPulse * .035 : normalShelfTarget)
          : normalShelfTarget
        const bookTarget = catalogLoadingRef.current
          ? Math.max(normalBookTarget, isCurrentFloor ? .18 + catalogPulse * .055 : normalBookTarget)
          : normalBookTarget

        placeholder.shelves.visible = shelfTarget > .01
        placeholder.books.visible = bookTarget > .01
        placeholder.shelfMaterial.opacity +=
          (shelfTarget - placeholder.shelfMaterial.opacity) *
          (1 - Math.exp(-delta * 5))
        placeholder.bookMaterial.opacity +=
          (bookTarget - placeholder.bookMaterial.opacity) *
          (1 - Math.exp(-delta * 5))
        placeholder.bookMaterial.emissiveIntensity +=
          ((catalogLoadingRef.current && isCurrentFloor
            ? .035 + catalogPulse * .018
            : isCurrentFloor
              ? .018
              : floorDistance <= 1
                ? .052
                : .022) -
            placeholder.bookMaterial.emissiveIntensity) *
          (1 - Math.exp(-delta * 4))
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
      shelfAccentBars.forEach(
        ({mesh, material, center, floorIndex}) => {
          const nearShelf =
            activeShelfCenter !== null &&
            Math.abs(center.y - activeShelfCenter.y) < .62 &&
            Math.hypot(
              center.x - activeShelfCenter.x,
              center.z - activeShelfCenter.z,
            ) < 4.4
          const isCurrentFloor = floorIndex === currentFloorIndex
          material.opacity +=
            ((nearShelf
              ? .84
              : isCurrentFloor
                ? activeShelfCenter
                  ? .035
                  : .12
                : .012) -
              material.opacity) *
            .12
          material.color.lerp(
            new THREE.Color(FLOOR_ACCENTS[floorIndex]),
            nearShelf ? .18 : .08,
          )
          mesh.scale.z = nearShelf ? 2.25 : 1
        },
      )

      trimCoverCache(now)

      sectionFloorGlows.forEach(({section, mesh, material}) => {
        const isCurrent = section === currentSection
        const isRouted = section === routedSection
        material.opacity +=
          ((isRouted ? .14 : isCurrent ? .085 : .008) -
            material.opacity) *
          (1 - Math.exp(-delta * 3.8))
        const targetScale = isRouted ? 1.08 : isCurrent ? 1.03 : 1
        mesh.scale.lerp(
          tempScale.set(targetScale, targetScale, targetScale),
          1 - Math.exp(-delta * 3.5),
        )
      })

      wayfindingPaths.forEach(({section, material}) => {
        const isCurrent = section === currentSection
        const isRouted = section === routedSection
        const targetOpacity = isRouted ? .19 : isCurrent ? .095 : .028
        material.opacity +=
          (targetOpacity - material.opacity) *
          (1 - Math.exp(-delta * 5.5))
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
                  ? .26
                  : .14
                : index === 0
                  ? .018
                  : .008
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
            ? .78
            : routeVisual.edge.kind === 'corridor'
              ? .012
              : .004) -
            routeVisual.material.opacity) *
          .1
        routeVisual.glowMaterial.opacity +=
          ((active ? .12 : routeVisual.edge.kind === 'corridor' ? .002 : .001) -
            routeVisual.glowMaterial.opacity) *
          .1
        routeVisual.packetMaterial.opacity =
          active ? .88 : 0

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

      const floorBase = currentFloorIndex * LIBRARY_FLOOR_HEIGHT
      const nearbyHubs: Array<{
        section: LibrarySection
        position: THREE.Vector3
      }> =
        currentFloorIndex === 0
          ? (Object.keys(SECTION_DOORWAYS) as LibrarySection[])
              .filter((section) => section !== currentSection)
              .map((section) => ({
                section,
                position: SECTION_DOORWAYS[section],
              }))
          : [
              {
                section: 'atrium',
                position: new THREE.Vector3(0, floorBase + .09, 7),
              },
            ]
      camera.getWorldDirection(tempDirection)
      let nextHubIndex = -1
      let nextHubDistance = Number.POSITIVE_INFINITY
      nearbyHubs.forEach((hub, index) => {
        const dx = hub.position.x - camera.position.x
        const dz = hub.position.z - camera.position.z
        const distance = Math.hypot(dx, dz)
        if (distance < 3 || distance > 18) return
        const ahead =
          (dx * tempDirection.x + dz * tempDirection.z) /
          Math.max(.001, distance)
        if (ahead < .58 || distance >= nextHubDistance) return
        nextHubIndex = index
        nextHubDistance = distance
      })
      const nextHub =
        nextHubIndex >= 0 ? nearbyHubs[nextHubIndex] : null

      const nextCue = nextHub
        ? 'AHEAD: ' + WAYFINDING_DESTINATIONS[nextHub.section]
        : null
      if (nextCue !== displayedWayfindingCue) {
        displayedWayfindingCue = nextCue
        wayfindingCueRef.current(nextCue)
      }

      if (nextHub) {
        const dx = nextHub.position.x - camera.position.x
        const dz = nextHub.position.z - camera.position.z
        corridorPull.visible = true
        corridorPull.position.set(
          camera.position.x + dx / 2,
          floorBase + .043,
          camera.position.z + dz / 2,
        )
        corridorPull.rotation.set(-Math.PI / 2, Math.atan2(dx, dz), 0)
        corridorPull.scale.set(1, nextHubDistance, 1)
        corridorPullMaterial.color.setHex(SECTION_ACCENTS[nextHub.section])
      } else {
        corridorPull.visible = false
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
        4.5 + Math.max(0, Math.sin(now * .46)) * .8
      netMagenta.intensity =
        2.15 + Math.max(0, Math.sin(now * .38 + 1.1)) * .65

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
        liftCabin.position.y = point.y - CAMERA_HEIGHT
        camera.lookAt(look)
        camera.fov +=
          (60 - camera.fov) *
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
          liftCabin.position.y =
            currentFloorIndex * LIBRARY_FLOOR_HEIGHT
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
        liftCabin.position.y = THREE.MathUtils.clamp(
          point.y - CAMERA_HEIGHT,
          0,
          (LIBRARY_FLOOR_COUNT - 1) * LIBRARY_FLOOR_HEIGHT,
        )
        camera.lookAt(look)
        const travelFov =
          60 +
          (reducedMotion
            ? 0
            : Math.sin(progress * Math.PI) * 1.6)
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
          liftCabin.position.y =
            currentFloorIndex * LIBRARY_FLOOR_HEIGHT
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
        const speed = hurrying ? 3.25 : 2.05
        const desired = move.multiplyScalar(speed)
        const response = move.lengthSq() > 0 ? 7.6 : 10.5
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
          velocity.length() / 3.25,
          0,
          1,
        )
        const targetFov =
          60 + (reducedMotion ? 0 : speedRatio * .8)
        camera.fov +=
          (targetFov - camera.fov) *
          (1 - Math.exp(-delta * 5.5))
        camera.updateProjectionMatrix()
      }

      updateUIOverlap(delta)

      camera.getWorldDirection(tempDirection)
      playerKeyLight.position
        .copy(camera.position)
        .addScaledVector(tempDirection, -1.15)
      playerKeyLight.position.y += 1.15

      renderer.render(scene, camera)

      if (debugEnabledRef.current) {
        debugFrameCount += 1
        const debugElapsed = nowMs - debugWindowStartedAt
        if (debugElapsed >= 750) {
          debugMetricsRef.current({
            fps: (debugFrameCount * 1000) / debugElapsed,
            drawCalls: renderer.info.render.calls,
            triangles: renderer.info.render.triangles,
            textures: renderer.info.memory.textures,
            geometries: renderer.info.memory.geometries,
          })
          debugFrameCount = 0
          debugWindowStartedAt = nowMs
        }
      } else {
        debugFrameCount = 0
        debugWindowStartedAt = nowMs
      }
    }

    frame = requestAnimationFrame(animate)

    return () => {
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
      architecturalSurfaceTexture.dispose()
      architecturalSurfaceRoughness.dispose()
      coverCache.clear()
      thumbnailCache.clear()
      thumbnailPrefetchTimers.forEach((timer) => window.clearTimeout(timer))
      thumbnailPrefetchTimers.clear()
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
