'use client'

import {useEffect, useRef} from 'react'
import * as THREE from 'three'
import type {LibrarySection, SurfEdge, SurfNode} from './types'
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

type StackPosition = {
  position: THREE.Vector3
  rotationY: number
  floor: number
  side: -1 | 0 | 1
  shelfKey?: string
}

type BookVisual = {
  node: SurfNode
  group: THREE.Group
  mesh: THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial>
  base: THREE.Vector3
  rotationY: number
  side: -1 | 1
  floor: number
}

const FLOOR_COUNT = 4
const FLOOR_HEIGHT = 5.2
const CAMERA_HEIGHT = 1.62
const WALL_X = 7.15
const GALLERY_INNER_X = 3.75
const GALLERY_OUTER_X = 6.25
const WORLD_NEAR_Z = 14
const WORLD_FAR_Z = -132

const SECTION_Z: Record<LibrarySection, number> = {
  atrium: 7,
  featured: -12,
  latest: -30,
  topics: -48,
  creators: -66,
  search: -84,
  archive: -104,
}

const SECTION_ORDER: LibrarySection[] = [
  'atrium',
  'featured',
  'latest',
  'topics',
  'creators',
  'search',
  'archive',
]

const SECTION_LABELS: Record<LibrarySection, {title: string; subtitle: string}> = {
  atrium: {title: 'THE WELL', subtitle: 'PRIMARY STACKWELL LANDMARK'},
  featured: {title: '#JAVASCRIPT DISTRICT', subtitle: 'LIVE DEV STRATA'},
  latest: {title: 'NEW GROWTH', subtitle: 'THE ARCHIVE IS STILL FORMING'},
  topics: {title: 'DISTRICT INDEX', subtitle: 'TAGS BECOME PLACES'},
  creators: {title: 'AUTHOR INDEX', subtitle: 'CREATOR COLLECTIONS'},
  search: {title: 'INDEX TERMINAL', subtitle: 'QUERY THE LIVE ARCHIVE'},
  archive: {title: 'DEEP STRATA', subtitle: 'OLDER LAYERS · NO VISIBLE END'},
}

const SECTION_ACCENTS: Record<LibrarySection, number> = {
  atrium: 0xeef6ff,
  featured: 0xf7df1e,
  latest: 0x79e6c5,
  topics: 0x5fe1ff,
  creators: 0xae7bff,
  search: 0xff5edb,
  archive: 0x748197,
}

const BRIDGE_Z = [6, -14, -34, -54, -74, -94, -114]

function hexToNumber(value: string | undefined, fallback: number) {
  if (!value || !/^#[0-9a-f]{6}$/i.test(value)) return fallback
  return Number.parseInt(value.slice(1), 16)
}

const TAG_ACCENTS: Record<string, number> = {
  javascript: 0xf7df1e,
  webdev: 0x53d3ff,
  ai: 0xae7bff,
  css: 0xff4fd8,
  react: 0x61dafb,
  rust: 0xc66a35,
  opensource: 0x79e6c5,
  beginners: 0x8bb8ff,
  career: 0xf4a261,
}

function nodeTags(node: SurfNode) {
  const raw = node.payload?.tag_list ?? []
  return Array.isArray(raw)
    ? raw.map((tag) => String(tag).toLowerCase())
    : []
}

function districtAccent(node: SurfNode, fallback: number) {
  const tags = nodeTags(node)
  for (const tag of tags) {
    if (TAG_ACCENTS[tag]) return TAG_ACCENTS[tag]
  }
  return fallback
}

function articleReadingMinutes(node: SurfNode) {
  return Math.max(1, node.payload?.reading_time_minutes ?? 4)
}

function articleReactionCount(node: SurfNode) {
  return (
    node.payload?.public_reactions_count ??
    node.payload?.positive_reactions_count ??
    0
  )
}

function articleCommentCount(node: SurfNode) {
  return node.payload?.comments_count ?? 0
}

function sectionForZ(z: number): LibrarySection {
  let section: LibrarySection = 'atrium'
  let best = Number.POSITIVE_INFINITY
  for (const candidate of SECTION_ORDER) {
    const distance = Math.abs(z - SECTION_Z[candidate])
    if (distance < best) {
      best = distance
      section = candidate
    }
  }
  return section
}

function makeLabelTexture(
  title: string,
  subtitle: string,
  accent: string,
  width = 1024,
  height = 256,
) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')

  if (context) {
    context.clearRect(0, 0, width, height)
    const panel = context.createLinearGradient(0, 0, width, 0)
    panel.addColorStop(0, 'rgba(3,5,8,.04)')
    panel.addColorStop(.12, 'rgba(3,5,8,.92)')
    panel.addColorStop(.88, 'rgba(3,5,8,.92)')
    panel.addColorStop(1, 'rgba(3,5,8,.04)')
    context.fillStyle = panel
    context.fillRect(0, 18, width, height - 36)

    context.fillStyle = accent
    context.fillRect(92, 18, width - 184, 5)

    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.fillStyle = '#f7f8fa'
    context.font = '800 50px system-ui, sans-serif'
    context.fillText(title.slice(0, 34), width / 2, 104)

    context.fillStyle = accent
    context.font = '600 20px system-ui, sans-serif'
    context.fillText(subtitle.slice(0, 58), width / 2, 166)
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.minFilter = THREE.LinearFilter
  return texture
}

function createBookCardTexture(node: SurfNode) {
  const canvas = document.createElement('canvas')
  canvas.width = 960
  canvas.height = 420
  const context = canvas.getContext('2d')
  const accent = node.accent || '#3b49df'

  if (context) {
    context.clearRect(0, 0, canvas.width, canvas.height)
    context.fillStyle = 'rgba(4,6,10,.96)'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.fillStyle = accent
    context.fillRect(0, 0, 14, canvas.height)
    context.strokeStyle = 'rgba(255,255,255,.13)'
    context.lineWidth = 2
    context.strokeRect(28, 28, canvas.width - 56, canvas.height - 56)

    context.textAlign = 'left'
    context.textBaseline = 'top'
    context.fillStyle = '#f5f7fb'
    context.font = '800 45px system-ui, sans-serif'

    const words = node.title.trim().split(/\s+/)
    const lines: string[] = []
    let line = ''
    for (const word of words) {
      const next = line ? line + ' ' + word : word
      if (context.measureText(next).width > 770 && line) {
        lines.push(line)
        line = word
        if (lines.length >= 3) break
      } else {
        line = next
      }
    }
    if (line && lines.length < 3) lines.push(line)
    lines.slice(0, 3).forEach((item, index) => {
      context.fillText(item, 68, 66 + index * 58)
    })

    context.fillStyle = '#9ca8b8'
    context.font = '600 23px system-ui, sans-serif'
    context.fillText(node.subtitle.slice(0, 70), 68, 264)

    const tags = nodeTags(node).slice(0, 4)
    const details = [
      articleReadingMinutes(node) + ' min',
      articleReactionCount(node) + ' reactions',
      articleCommentCount(node) + ' comments',
    ].join('  ·  ')

    context.fillStyle = '#778395'
    context.font = '600 17px system-ui, sans-serif'
    context.fillText(details, 68, 310)
    context.fillStyle = accent
    context.font = '700 17px system-ui, sans-serif'
    context.fillText(
      (tags.length ? tags.map((tag) => '#' + tag).join('  ') + '    ·    ' : '') +
        'E  OPEN',
      68,
      350,
    )
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.minFilter = THREE.LinearFilter
  return texture
}

function buildLayout(nodes: SurfNode[]) {
  const layout = new Map<string, StackPosition>()
  const articleBuckets = new Map<string, SurfNode[]>()

  for (const section of SECTION_ORDER) {
    articleBuckets.set(section, [])
  }

  nodes.forEach((node) => {
    if (node.kind === 'article') {
      const section = node.section ?? 'archive'
      const key = section + ':floor:' + (node.floorIndex ?? 0)
      const bucket = articleBuckets.get(key) ?? []
      bucket.push(node)
      articleBuckets.set(key, bucket)
    }
  })

  nodes.forEach((node) => {
    const section = node.section ?? 'atrium'
    const floor = THREE.MathUtils.clamp(node.floorIndex ?? 0, 0, FLOOR_COUNT - 1)
    const baseY = floor * FLOOR_HEIGHT

    if (node.kind === 'home') {
      layout.set(node.id, {
        position: new THREE.Vector3(0, baseY + .8, 8),
        rotationY: 0,
        floor,
        side: 0,
      })
      return
    }

    if (node.kind === 'section') {
      layout.set(node.id, {
        position: new THREE.Vector3(0, baseY + 1.1, SECTION_Z[section]),
        rotationY: 0,
        floor,
        side: 0,
      })
      return
    }

    if (node.kind === 'tag' || node.kind === 'profile' || node.kind === 'search') {
      const peers = nodes.filter(
        (candidate) =>
          candidate.kind === node.kind &&
          (candidate.section ?? 'atrium') === section,
      )
      const index = Math.max(0, peers.findIndex((candidate) => candidate.id === node.id))
      const side: -1 | 1 = index % 2 === 0 ? -1 : 1
      const lane = Math.floor(index / 2)
      layout.set(node.id, {
        position: new THREE.Vector3(
          side * 4.8,
          baseY + 1.15,
          SECTION_Z[section] - 2.8 - lane * 2.45,
        ),
        rotationY: side < 0 ? Math.PI / 2 : -Math.PI / 2,
        floor,
        side,
      })
      return
    }
  })

  for (const section of SECTION_ORDER) {
    for (let floor = 0; floor < FLOOR_COUNT; floor += 1) {
      const key = section + ':floor:' + floor
      const bucket = nodes.filter(
        (node) =>
          node.kind === 'article' &&
          (node.section ?? 'archive') === section &&
          THREE.MathUtils.clamp(node.floorIndex ?? 0, 0, FLOOR_COUNT - 1) === floor,
      )

      bucket.forEach((node, index) => {
        const side: -1 | 1 = index % 2 === 0 ? -1 : 1
        const local = Math.floor(index / 2)
        const row = local % 4
        const slot = Math.floor(local / 4) % 9
        const bay = Math.floor(local / 36)
        const bandStart =
          section === 'archive' && floor > 0
            ? -10
            : SECTION_Z[section] - 3
        const z = bandStart - bay * 4.6 - slot * .38
        const y = floor * FLOOR_HEIGHT + .8 + row * .82

        layout.set(node.id, {
          position: new THREE.Vector3(side * WALL_X, y, z),
          rotationY: side < 0 ? Math.PI / 2 : -Math.PI / 2,
          floor,
          side,
          shelfKey:
            'stack:' +
            section +
            ':f' +
            floor +
            ':side' +
            side +
            ':bay' +
            bay +
            ':row' +
            row,
        })
      })
    }
  }

  return layout
}

function isBridge(z: number) {
  return BRIDGE_Z.some((bridge) => Math.abs(z - bridge) <= 1.28)
}

function isWalkable(position: THREE.Vector3, floor: number) {
  if (
    position.z > WORLD_NEAR_Z ||
    position.z < WORLD_FAR_Z ||
    Math.abs(position.x) > GALLERY_OUTER_X
  ) {
    return false
  }

  if (floor === 0) return true

  const onLeftGallery =
    position.x >= -GALLERY_OUTER_X &&
    position.x <= -GALLERY_INNER_X
  const onRightGallery =
    position.x <= GALLERY_OUTER_X &&
    position.x >= GALLERY_INNER_X
  const onBridge = isBridge(position.z)

  return onLeftGallery || onRightGallery || onBridge
}

export default function Stackwell3D({
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
  const selectedRef = useRef(selectedId)
  const routeRef = useRef(routeTargetId)
  const travelRequestRef = useRef(travelRequest)
  const floorRequestRef = useRef(floorRequest)
  const inspectRef = useRef(onInspect)
  const putBackRef = useRef(onPutBack)
  const travelRef = useRef(onTravel)
  const hoverRef = useRef(onHover)
  const lockRef = useRef(onPointerLockChange)
  const zoneRef = useRef(onZoneChange)
  const floorChangeRef = useRef(onFloorChange)
  const currentFloorRef = useRef(currentFloor)

  useEffect(() => {
    selectedRef.current = selectedId
  }, [selectedId])
  useEffect(() => {
    routeRef.current = routeTargetId
  }, [routeTargetId])
  useEffect(() => {
    travelRequestRef.current = travelRequest
  }, [travelRequest])
  useEffect(() => {
    floorRequestRef.current = floorRequest
  }, [floorRequest])
  useEffect(() => {
    inspectRef.current = onInspect
  }, [onInspect])
  useEffect(() => {
    putBackRef.current = onPutBack
  }, [onPutBack])
  useEffect(() => {
    travelRef.current = onTravel
  }, [onTravel])
  useEffect(() => {
    hoverRef.current = onHover
  }, [onHover])
  useEffect(() => {
    lockRef.current = onPointerLockChange
  }, [onPointerLockChange])
  useEffect(() => {
    zoneRef.current = onZoneChange
  }, [onZoneChange])
  useEffect(() => {
    floorChangeRef.current = onFloorChange
  }, [onFloorChange])
  useEffect(() => {
    currentFloorRef.current = currentFloor
  }, [currentFloor])

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    const layout = buildLayout(nodes)
    const nodeById = new Map(nodes.map((node) => [node.id, node]))
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x020306)
    scene.fog = new THREE.FogExp2(0x05070c, .0125)

    const camera = new THREE.PerspectiveCamera(66, 1, .05, 190)
    camera.position.set(0, CAMERA_HEIGHT, 10)

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
    })
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.16
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.65))
    host.appendChild(renderer.domElement)

    const geometries: THREE.BufferGeometry[] = []
    const materials: THREE.Material[] = []
    const textures: THREE.Texture[] = []
    const interactive: THREE.Object3D[] = []
    const bookVisuals = new Map<string, BookVisual>()

    const ambient = new THREE.HemisphereLight(0xb8c9e8, 0x0a0c12, 1.32)
    scene.add(ambient)

    const keyLight = new THREE.DirectionalLight(0xd9e6ff, 2.55)
    keyLight.position.set(2, 12, 8)
    scene.add(keyLight)

    const cyanLight = new THREE.PointLight(0x7bdfff, 15, 38, 1.8)
    cyanLight.position.set(-5.3, 3.6, -16)
    scene.add(cyanLight)

    const violetLight = new THREE.PointLight(0x9b8cff, 11, 42, 1.9)
    violetLight.position.set(5.2, 8.8, -58)
    scene.add(violetLight)

    const deepLight = new THREE.PointLight(0x5367ff, 13, 48, 1.9)
    deepLight.position.set(0, 13.8, -106)
    scene.add(deepLight)

    // Repeating shelf-facing light pools keep nearby books readable while
    // the archive still falls away into darkness.
    for (let z = 4; z >= -116; z -= 12) {
      for (const side of [-1, 1] as const) {
        const shelfLight = new THREE.PointLight(
          side < 0 ? 0xbcd7ff : 0xc8d9ff,
          4.8,
          12,
          2.1,
        )
        shelfLight.position.set(side * 4.8, 2.8, z)
        scene.add(shelfLight)
      }
    }

    const shaftMaterials: THREE.MeshBasicMaterial[] = []
    SECTION_ORDER.slice(1).forEach((section, index) => {
      const shaftLight = new THREE.SpotLight(
        index % 2 === 0 ? 0x9ccfff : 0xb8a4ff,
        18,
        30,
        .34,
        .78,
        1.6,
      )
      shaftLight.position.set(0, 21, SECTION_Z[section] + 1)
      shaftLight.target.position.set(0, 0, SECTION_Z[section] + 1)
      scene.add(shaftLight, shaftLight.target)

      const shaftMaterial = new THREE.MeshBasicMaterial({
        color: index % 2 === 0 ? 0x79cfff : 0x9c8cff,
        transparent: true,
        opacity: .035,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      })
      shaftMaterials.push(shaftMaterial)
      materials.push(shaftMaterial)

      const shaftGeometry = new THREE.CylinderGeometry(1.25, 3.4, 20, 18, 1, true)
      geometries.push(shaftGeometry)
      const shaft = new THREE.Mesh(shaftGeometry, shaftMaterial)
      shaft.position.set(0, 10.2, SECTION_Z[section] + 1)
      scene.add(shaft)
    })

    const concrete = new THREE.MeshStandardMaterial({
      color: 0x151922,
      roughness: .78,
      metalness: .16,
    })
    const steel = new THREE.MeshStandardMaterial({
      color: 0x252c38,
      roughness: .4,
      metalness: .82,
    })
    const steelDark = new THREE.MeshStandardMaterial({
      color: 0x121722,
      roughness: .52,
      metalness: .7,
    })
    const glass = new THREE.MeshPhysicalMaterial({
      color: 0x29435f,
      roughness: .12,
      metalness: .12,
      transparent: true,
      opacity: .42,
      transmission: .1,
      side: THREE.DoubleSide,
    })
    materials.push(concrete, steel, steelDark, glass)

    const floorGeometry = new THREE.BoxGeometry(13.1, .18, 148)
    geometries.push(floorGeometry)
    const floor = new THREE.Mesh(floorGeometry, concrete)
    floor.position.set(0, -.12, -59)
    scene.add(floor)

    const trenchGeometry = new THREE.BoxGeometry(7.2, .08, 148)
    geometries.push(trenchGeometry)
    const trenchMaterial = new THREE.MeshBasicMaterial({
      color: 0x05070c,
      transparent: true,
      opacity: .9,
    })
    materials.push(trenchMaterial)
    const trench = new THREE.Mesh(trenchGeometry, trenchMaterial)
    trench.position.set(0, .005, -59)
    scene.add(trench)

    const indexLineMaterial = new THREE.MeshBasicMaterial({
      color: 0x6dbde6,
      transparent: true,
      opacity: .28,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
    const indexBoundaryMaterial = new THREE.MeshBasicMaterial({
      color: 0x6e7cff,
      transparent: true,
      opacity: .24,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
    materials.push(indexLineMaterial, indexBoundaryMaterial)

    const indexLineGeometry = new THREE.BoxGeometry(.035, .012, 140)
    const indexBoundaryGeometry = new THREE.BoxGeometry(3.9, .014, .035)
    geometries.push(indexLineGeometry, indexBoundaryGeometry)

    for (const x of [-1.72, 1.72]) {
      const line = new THREE.Mesh(indexLineGeometry, indexLineMaterial)
      line.position.set(x, .022, -58)
      scene.add(line)
    }

    SECTION_ORDER.forEach((section) => {
      const marker = new THREE.Mesh(indexBoundaryGeometry, indexBoundaryMaterial)
      marker.position.set(0, .026, SECTION_Z[section])
      scene.add(marker)
    })

    const floorGlassGeometry = new THREE.BoxGeometry(3.15, .035, 3.4)
    geometries.push(floorGlassGeometry)
    ;[-22, -58, -92].forEach((z) => {
      const panel = new THREE.Mesh(floorGlassGeometry, glass)
      panel.position.set(0, .035, z)
      scene.add(panel)

      const underGlow = new THREE.PointLight(0x587dff, 4.2, 8, 2)
      underGlow.position.set(0, -.75, z)
      scene.add(underGlow)
    })

    for (let floorIndex = 1; floorIndex < FLOOR_COUNT; floorIndex += 1) {
      const y = floorIndex * FLOOR_HEIGHT
      const galleryGeometry = new THREE.BoxGeometry(2.6, .16, 148)
      geometries.push(galleryGeometry)
      const leftGallery = new THREE.Mesh(galleryGeometry, concrete)
      leftGallery.position.set(-5, y, -59)
      scene.add(leftGallery)
      const rightGallery = leftGallery.clone()
      rightGallery.position.x = 5
      scene.add(rightGallery)

      const underStripGeometry = new THREE.BoxGeometry(.055, .025, 144)
      geometries.push(underStripGeometry)
      const underStripMaterial = new THREE.MeshBasicMaterial({
        color: floorIndex % 2 === 0 ? 0x7d82ff : 0x64c9ec,
        transparent: true,
        opacity: .22,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
      materials.push(underStripMaterial)
      for (const x of [-3.78, 3.78]) {
        const underStrip = new THREE.Mesh(underStripGeometry, underStripMaterial)
        underStrip.position.set(x, y - .12, -59)
        scene.add(underStrip)
      }

      BRIDGE_Z.forEach((z) => {
        const bridgeGeometry = new THREE.BoxGeometry(10.2, .09, 1.7)
        geometries.push(bridgeGeometry)
        const bridge = new THREE.Mesh(bridgeGeometry, glass)
        bridge.position.set(0, y + .03, z)
        scene.add(bridge)

        const stripGeometry = new THREE.BoxGeometry(10, .018, .045)
        geometries.push(stripGeometry)
        const stripMaterial = new THREE.MeshBasicMaterial({
          color: floorIndex % 2 === 0 ? 0x6f79ff : 0x5fe1ff,
          transparent: true,
          opacity: .52,
          blending: THREE.AdditiveBlending,
        })
        materials.push(stripMaterial)
        const strip = new THREE.Mesh(stripGeometry, stripMaterial)
        strip.position.set(0, y + .09, z)
        scene.add(strip)
      })
    }

    const wallBackGeometry = new THREE.BoxGeometry(.34, FLOOR_COUNT * FLOOR_HEIGHT + 4.5, 150)
    geometries.push(wallBackGeometry)
    const leftBack = new THREE.Mesh(wallBackGeometry, steelDark)
    leftBack.position.set(-7.55, FLOOR_COUNT * FLOOR_HEIGHT / 2 - .2, -59)
    scene.add(leftBack)
    const rightBack = leftBack.clone()
    rightBack.position.x = 7.55
    scene.add(rightBack)

    const postGeometry = new THREE.BoxGeometry(.13, 4.5, .13)
    const railGeometry = new THREE.BoxGeometry(.22, .09, 4.65)
    geometries.push(postGeometry, railGeometry)

    const bayCount = 30
    const postCount = FLOOR_COUNT * 2 * bayCount * 2
    const railCount = FLOOR_COUNT * 2 * bayCount * 6
    const posts = new THREE.InstancedMesh(postGeometry, steel, postCount)
    const rails = new THREE.InstancedMesh(railGeometry, steel, railCount)
    const frameDummy = new THREE.Object3D()
    let postIndex = 0
    let railIndex = 0

    for (let floorIndex = 0; floorIndex < FLOOR_COUNT; floorIndex += 1) {
      const floorBase = floorIndex * FLOOR_HEIGHT
      for (const side of [-1, 1] as const) {
        for (let bay = 0; bay < bayCount; bay += 1) {
          const bayZ = 7 - bay * 4.7

          for (const zOffset of [2.25, -2.25]) {
            frameDummy.position.set(
              side * WALL_X,
              floorBase + 2.25,
              bayZ + zOffset,
            )
            frameDummy.rotation.set(0, 0, 0)
            frameDummy.scale.set(1, 1, 1)
            frameDummy.updateMatrix()
            posts.setMatrixAt(postIndex, frameDummy.matrix)
            postIndex += 1
          }

          for (let row = 0; row < 6; row += 1) {
            frameDummy.position.set(
              side * WALL_X,
              floorBase + .42 + row * .74,
              bayZ,
            )
            frameDummy.rotation.set(0, Math.PI / 2, 0)
            frameDummy.scale.set(1, 1, 1)
            frameDummy.updateMatrix()
            rails.setMatrixAt(railIndex, frameDummy.matrix)
            railIndex += 1
          }
        }
      }
    }

    posts.instanceMatrix.needsUpdate = true
    rails.instanceMatrix.needsUpdate = true
    scene.add(posts, rails)

    const fillerGeometry = new THREE.BoxGeometry(.22, .57, .12)
    geometries.push(fillerGeometry)
    const fillerMaterial = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: .69,
      metalness: .08,
      emissive: 0x05080d,
      emissiveIntensity: .055,
      vertexColors: true,
    })
    materials.push(fillerMaterial)

    const fillerPerBay = 6 * 12
    const fillerCount = FLOOR_COUNT * 2 * bayCount * fillerPerBay
    const filler = new THREE.InstancedMesh(
      fillerGeometry,
      fillerMaterial,
      fillerCount,
    )
    const fillerDummy = new THREE.Object3D()
    const bookPalette = [
      new THREE.Color(0x3d4a5d),
      new THREE.Color(0x5b4d47),
      new THREE.Color(0x384e47),
      new THREE.Color(0x554c68),
      new THREE.Color(0x6b5b3f),
      new THREE.Color(0x4e5661),
      new THREE.Color(0x334258),
      new THREE.Color(0x684d58),
      new THREE.Color(0x59634d),
      new THREE.Color(0x777066),
    ]
    let fillerIndex = 0
    for (let floorIndex = 0; floorIndex < FLOOR_COUNT; floorIndex += 1) {
      for (const side of [-1, 1] as const) {
        for (let bay = 0; bay < bayCount; bay += 1) {
          const bayCenter = 7 - bay * 4.7
          for (let row = 0; row < 6; row += 1) {
            for (let slot = 0; slot < 12; slot += 1) {
              fillerDummy.position.set(
                side * (WALL_X - .01),
                floorIndex * FLOOR_HEIGHT + .76 + row * .74,
                bayCenter + 1.9 - slot * .345,
              )
              fillerDummy.rotation.set(
                0,
                0,
                (((bay * 7 + row * 3 + slot) % 9) - 4) * .006,
              )
              const heightScale = .78 + ((bay + row + slot) % 6) * .055
              const widthScale = .84 + ((bay * 3 + slot) % 5) * .045
              fillerDummy.scale.set(
                widthScale,
                heightScale,
                .82 + ((slot + row) % 4) * .055,
              )
              fillerDummy.updateMatrix()
              filler.setMatrixAt(fillerIndex, fillerDummy.matrix)
              filler.setColorAt(
                fillerIndex,
                bookPalette[
                  (bay * 5 + row * 3 + slot + floorIndex) %
                    bookPalette.length
                ],
              )
              fillerIndex += 1
            }
          }
        }
      }
    }
    filler.instanceMatrix.needsUpdate = true
    if (filler.instanceColor) filler.instanceColor.needsUpdate = true
    scene.add(filler)

    const liftFrameMaterial = new THREE.MeshStandardMaterial({
      color: 0x222a37,
      metalness: .86,
      roughness: .3,
      emissive: 0x071426,
      emissiveIntensity: .34,
    })
    const liftGlowMaterial = new THREE.MeshBasicMaterial({
      color: 0x5fe1ff,
      transparent: true,
      opacity: .28,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    })
    materials.push(liftFrameMaterial, liftGlowMaterial)

    const liftColumnGeometry = new THREE.BoxGeometry(.12, FLOOR_COUNT * FLOOR_HEIGHT + 2, .12)
    const liftBeamGeometry = new THREE.BoxGeometry(2.8, .08, .08)
    geometries.push(liftColumnGeometry, liftBeamGeometry)
    for (const x of [-1.4, 1.4]) {
      for (const z of [5.35, 6.65]) {
        const column = new THREE.Mesh(liftColumnGeometry, liftFrameMaterial)
        column.position.set(x, FLOOR_COUNT * FLOOR_HEIGHT / 2, z)
        scene.add(column)
      }
    }
    for (let floorIndex = 0; floorIndex < FLOOR_COUNT; floorIndex += 1) {
      const y = floorIndex * FLOOR_HEIGHT + .08
      const padGeometry = new THREE.BoxGeometry(3.2, .06, 1.7)
      geometries.push(padGeometry)
      const pad = new THREE.Mesh(padGeometry, glass)
      pad.position.set(0, y, 6)
      scene.add(pad)

      const glowGeometry = new THREE.PlaneGeometry(2.7, .9)
      geometries.push(glowGeometry)
      const glow = new THREE.Mesh(glowGeometry, liftGlowMaterial)
      glow.rotation.x = -Math.PI / 2
      glow.position.set(0, y + .045, 6)
      scene.add(glow)
    }

    const devTexture = makeLabelTexture('DEV', 'THE STACKWELL', '#ffffff', 900, 300)
    textures.push(devTexture)
    const devMaterial = new THREE.MeshBasicMaterial({
      map: devTexture,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
    materials.push(devMaterial)
    const devPlaneGeometry = new THREE.PlaneGeometry(5.5, 1.8)
    geometries.push(devPlaneGeometry)
    const devPlane = new THREE.Mesh(devPlaneGeometry, devMaterial)
    devPlane.position.set(0, 3.8, 9.2)
    scene.add(devPlane)

    const sectionMarkerGeometry = new THREE.PlaneGeometry(4.7, 1.08)
    const signBeamGeometry = new THREE.BoxGeometry(12.5, .12, .14)
    const signPostGeometry = new THREE.BoxGeometry(.12, 2.2, .12)
    geometries.push(sectionMarkerGeometry, signBeamGeometry, signPostGeometry)

    for (const section of SECTION_ORDER.filter((item) => item !== 'atrium')) {
      const copy = SECTION_LABELS[section]
      const accent = '#' + SECTION_ACCENTS[section].toString(16).padStart(6, '0')
      const signZ = SECTION_Z[section] + 1.8

      const beam = new THREE.Mesh(signBeamGeometry, steel)
      beam.position.set(0, 4.48, signZ)
      scene.add(beam)

      for (const x of [-3.0, 3.0]) {
        const post = new THREE.Mesh(signPostGeometry, steel)
        post.position.set(x, 3.38, signZ)
        scene.add(post)
      }

      const texture = makeLabelTexture(copy.title, copy.subtitle, accent)
      textures.push(texture)
      const material = new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
      })
      materials.push(material)
      const marker = new THREE.Mesh(sectionMarkerGeometry, material)
      marker.position.set(0, 3.55, signZ + .08)
      scene.add(marker)

      const signLight = new THREE.PointLight(
        SECTION_ACCENTS[section],
        2.8,
        8,
        2,
      )
      signLight.position.set(0, 3.8, signZ + .5)
      scene.add(signLight)
    }

    for (let floorIndex = 1; floorIndex < FLOOR_COUNT; floorIndex += 1) {
      const texture = makeLabelTexture(
        'DEEP ARCHIVE · LEVEL 0' + (floorIndex + 1),
        'LIVE DEV CATALOG',
        floorIndex % 2 === 0 ? '#7e74ff' : '#5fe1ff',
      )
      textures.push(texture)
      const material = new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
      })
      materials.push(material)
      const marker = new THREE.Mesh(sectionMarkerGeometry, material)
      marker.scale.set(.72, .72, .72)
      marker.position.set(
        floorIndex % 2 === 0 ? -5.55 : 5.55,
        floorIndex * FLOOR_HEIGHT + 3.35,
        -7,
      )
      marker.rotation.y = floorIndex % 2 === 0 ? Math.PI / 2 : -Math.PI / 2
      scene.add(marker)
    }

    const terminalGeometry = new THREE.BoxGeometry(1.5, 1.55, .65)
    geometries.push(terminalGeometry)

    nodes
      .filter((node) => node.kind !== 'article')
      .forEach((node) => {
        const placement = layout.get(node.id)
        if (!placement) return

        const accent = hexToNumber(node.accent, SECTION_ACCENTS[node.section ?? 'atrium'])
        const material = new THREE.MeshStandardMaterial({
          color: node.kind === 'home' ? 0xe7ebf2 : 0x171c27,
          metalness: .7,
          roughness: .3,
          emissive: accent,
          emissiveIntensity: node.kind === 'section' ? .46 : .25,
        })
        materials.push(material)

        const geometry =
          node.kind === 'section'
            ? new THREE.CylinderGeometry(.13, .2, 2.4, 10)
            : terminalGeometry
        if (node.kind === 'section') geometries.push(geometry)

        const mesh = new THREE.Mesh(geometry, material)
        mesh.position.copy(placement.position)
        mesh.rotation.y = placement.rotationY
        mesh.userData.nodeId = node.id
        scene.add(mesh)
        interactive.push(mesh)
      })

    const bookGeometry = new THREE.BoxGeometry(.29, .68, .17)
    const bookStripeGeometry = new THREE.BoxGeometry(.012, .54, .13)
    geometries.push(bookGeometry, bookStripeGeometry)

    nodes
      .filter((node) => node.kind === 'article')
      .forEach((node, articleIndex) => {
        const placement = layout.get(node.id)
        if (!placement || placement.side === 0) return

        const fallbackAccent = hexToNumber(
          node.accent,
          articleIndex % 3 === 0 ? 0x3b49df : 0x5fe1ff,
        )
        const accent = districtAccent(node, fallbackAccent)
        const reactions = articleReactionCount(node)
        const comments = articleCommentCount(node)
        const material = new THREE.MeshStandardMaterial({
          color: 0x465062,
          roughness: .61,
          metalness: .18,
          emissive: accent,
          emissiveIntensity:
            .075 + Math.min(.12, Math.log10(1 + reactions + comments) * .035),
        })
        materials.push(material)

        const group = new THREE.Group()
        group.position.copy(placement.position)
        group.rotation.y = placement.rotationY

        const mesh = new THREE.Mesh(bookGeometry, material)
        mesh.userData.nodeId = node.id
        const readingMinutes = articleReadingMinutes(node)
        const prominence = THREE.MathUtils.clamp(
          1 + Math.log10(1 + reactions) * .055,
          1,
          1.28,
        )
        mesh.scale.set(
          THREE.MathUtils.clamp(.72 + readingMinutes * .045, .78, 1.32),
          prominence,
          1,
        )
        group.add(mesh)

        const stripeMaterial = new THREE.MeshBasicMaterial({
          color: accent,
          transparent: true,
          opacity: .5,
        })
        materials.push(stripeMaterial)
        const stripe = new THREE.Mesh(bookStripeGeometry, stripeMaterial)
        stripe.position.x = placement.side < 0 ? .151 : -.151
        group.add(stripe)

        scene.add(group)
        interactive.push(mesh)
        bookVisuals.set(node.id, {
          node,
          group,
          mesh,
          base: placement.position.clone(),
          rotationY: placement.rotationY,
          side: placement.side,
          floor: placement.floor,
        })
      })

    const hoverCardTexture = makeLabelTexture('SELECT A BOOK', 'AIM AT A SPINE · E TO OPEN', '#5fe1ff')
    textures.push(hoverCardTexture)
    const hoverCardMaterial = new THREE.SpriteMaterial({
      map: hoverCardTexture,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    })
    materials.push(hoverCardMaterial)
    const hoverCard = new THREE.Sprite(hoverCardMaterial)
    hoverCard.scale.set(4.6, 1.15, 1)
    hoverCard.visible = false
    scene.add(hoverCard)
    let hoverCardNodeId: string | null = null

    function updateHoverCard(node: SurfNode | null, visual?: BookVisual) {
      if (!node || !visual) {
        hoverCard.visible = false
        hoverCardMaterial.opacity = 0
        hoverCardNodeId = null
        return
      }
      if (hoverCardNodeId !== node.id) {
        hoverCardMaterial.map?.dispose()
        const nextTexture = createBookCardTexture(node)
        textures.push(nextTexture)
        hoverCardMaterial.map = nextTexture
        hoverCardMaterial.needsUpdate = true
        hoverCardNodeId = node.id
      }
      hoverCard.position.copy(visual.group.position)
      hoverCard.position.x += visual.side < 0 ? 2.15 : -2.15
      hoverCard.position.y += .35
      hoverCard.visible = true
      hoverCardMaterial.opacity = 1
    }

    const particleCount = 720
    const particlePositions = new Float32Array(particleCount * 3)
    for (let index = 0; index < particleCount; index += 1) {
      particlePositions[index * 3] = (Math.random() - .5) * 14
      particlePositions[index * 3 + 1] = Math.random() * (FLOOR_COUNT * FLOOR_HEIGHT + 4)
      particlePositions[index * 3 + 2] = WORLD_NEAR_Z - Math.random() * (WORLD_NEAR_Z - WORLD_FAR_Z)
    }
    const particleGeometry = new THREE.BufferGeometry()
    particleGeometry.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3))
    geometries.push(particleGeometry)
    const particleMaterial = new THREE.PointsMaterial({
      color: 0x8da6ca,
      size: .028,
      transparent: true,
      opacity: .35,
      depthWrite: false,
    })
    materials.push(particleMaterial)
    const particles = new THREE.Points(particleGeometry, particleMaterial)
    scene.add(particles)

    const guideGeometry = new THREE.BufferGeometry()
    const guideMaterial = new THREE.LineBasicMaterial({
      color: 0x5fe1ff,
      transparent: true,
      opacity: .8,
      depthWrite: false,
    })
    geometries.push(guideGeometry)
    materials.push(guideMaterial)
    const guideLine = new THREE.Line(guideGeometry, guideMaterial)
    guideLine.visible = false
    scene.add(guideLine)

    const raycaster = new THREE.Raycaster()
    raycaster.far = 7.2
    const center = new THREE.Vector2(0, 0)
    const keys = new Set<string>()
    const position = camera.position.clone()
    const velocity = new THREE.Vector3()
    const forward = new THREE.Vector3()
    const right = new THREE.Vector3()
    const up = new THREE.Vector3(0, 1, 0)
    const move = new THREE.Vector3()
    const desired = new THREE.Vector3()
    const temp = new THREE.Vector3()
    const targetScale = new THREE.Vector3()
    const euler = new THREE.Euler(0, 0, 0, 'YXZ')
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let yaw = 0
    let pitch = 0
    let currentFloorIndex = THREE.MathUtils.clamp(currentFloorRef.current, 0, FLOOR_COUNT - 1)
    let currentSection = sectionForZ(position.z)
    let hoverId: string | null = null
    let frame = 0
    let lastTime = performance.now()
    let lastTravelNonce = travelRequestRef.current?.nonce ?? -1
    let lastFloorNonce = floorRequestRef.current?.nonce ?? -1

    let travel:
      | {
          curve: THREE.Curve<THREE.Vector3>
          node: SurfNode
          destination: THREE.Vector3
          startedAt: number
          duration: number
          inspectOnArrival: boolean
        }
      | null = null

    let floorTravel:
      | {
          curve: THREE.Curve<THREE.Vector3>
          floor: number
          startedAt: number
          duration: number
        }
      | null = null

    function pickCenter() {
      raycaster.setFromCamera(center, camera)
      const hits = raycaster.intersectObjects(interactive, false)
      for (const hit of hits) {
        const nodeId = hit.object.userData.nodeId as string | undefined
        if (!nodeId) continue
        const node = nodeById.get(nodeId)
        if (!node) continue
        const placement = layout.get(nodeId)
        if ((placement?.floor ?? 0) !== currentFloorIndex) continue
        return node
      }
      return null
    }

    function travelDestination(node: SurfNode) {
      const placement = layout.get(node.id)
      if (!placement) return null
      const destination = placement.position.clone()
      destination.y = placement.floor * FLOOR_HEIGHT + CAMERA_HEIGHT

      if (node.kind === 'article' && placement.side !== 0) {
        destination.x =
          placement.side < 0
            ? -GALLERY_OUTER_X + .85
            : GALLERY_OUTER_X - .85
      } else {
        destination.z += 1.7
      }
      return destination
    }

    function makeTravelCurve(destination: THREE.Vector3, targetFloor: number) {
      const points: THREE.Vector3[] = [camera.position.clone()]
      if (targetFloor !== currentFloorIndex) {
        points.push(new THREE.Vector3(0, camera.position.y, 6))
        points.push(new THREE.Vector3(0, targetFloor * FLOOR_HEIGHT + CAMERA_HEIGHT, 6))
      }
      const centerZ = destination.z + 1.6
      points.push(new THREE.Vector3(0, targetFloor * FLOOR_HEIGHT + CAMERA_HEIGHT, centerZ))
      points.push(destination.clone())
      return new THREE.CatmullRomCurve3(points, false, 'centripetal', .35)
    }

    function startTravel(node: SurfNode, inspectOnArrival: boolean) {
      const placement = layout.get(node.id)
      const destination = travelDestination(node)
      if (!placement || !destination) return
      const curve = makeTravelCurve(destination, placement.floor)
      travel = {
        curve,
        node,
        destination,
        startedAt: performance.now() / 1000,
        duration: reducedMotion
          ? 1
          : THREE.MathUtils.clamp(curve.getLength() / 8.2, 1.05, 3.2),
        inspectOnArrival,
      }
      floorTravel = null
      velocity.set(0, 0, 0)
    }

    function startFloorTravel(nextFloor: number) {
      const floor = THREE.MathUtils.clamp(nextFloor, 0, FLOOR_COUNT - 1)
      if (floor === currentFloorIndex) return
      const targetY = floor * FLOOR_HEIGHT + CAMERA_HEIGHT
      const points = [
        camera.position.clone(),
        new THREE.Vector3(0, camera.position.y, 6),
        new THREE.Vector3(0, targetY, 6),
      ]
      floorTravel = {
        curve: new THREE.CatmullRomCurve3(points, false, 'centripetal', .35),
        floor,
        startedAt: performance.now() / 1000,
        duration: reducedMotion ? .9 : 1.45,
      }
      travel = null
      velocity.set(0, 0, 0)
    }

    function onMouseMove(event: MouseEvent) {
      if (
        document.pointerLockElement !== renderer.domElement ||
        travel ||
        floorTravel
      ) {
        return
      }
      yaw -= event.movementX * .0014
      pitch -= event.movementY * .00122
      pitch = THREE.MathUtils.clamp(pitch, -.64, .64)
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
      const locked = document.pointerLockElement === renderer.domElement

      if (
        locked &&
        ['Digit1', 'Digit2', 'Digit3', 'Digit4'].includes(event.code)
      ) {
        event.preventDefault()
        startFloorTravel(Number(event.code.slice(-1)) - 1)
        return
      }

      if (locked && event.code === 'PageUp') {
        event.preventDefault()
        startFloorTravel(Math.min(FLOOR_COUNT - 1, currentFloorIndex + 1))
        return
      }

      if (locked && event.code === 'PageDown') {
        event.preventDefault()
        startFloorTravel(Math.max(0, currentFloorIndex - 1))
        return
      }

      if (event.code === 'KeyE') {
        event.preventDefault()
        const selected = selectedRef.current
          ? nodeById.get(selectedRef.current)
          : null
        if (selected?.kind === 'article') {
          putBackRef.current()
          return
        }
        const aimed = pickCenter()
        if (aimed) inspectRef.current(aimed)
      }

      if (event.code === 'KeyF') {
        event.preventDefault()
        const aimed = pickCenter()
        const routed = routeRef.current ? nodeById.get(routeRef.current) : null
        const targetNode = routed ?? aimed
        if (targetNode) startTravel(targetNode, true)
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
      const aimed = pickCenter()
      if (aimed) inspectRef.current(aimed)
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
      const rect = host.getBoundingClientRect()
      camera.aspect = rect.width / Math.max(1, rect.height)
      camera.updateProjectionMatrix()
      renderer.setSize(rect.width, rect.height, false)
    }

    const resizeObserver = new ResizeObserver(resize)
    resizeObserver.observe(host)
    resize()

    function animate(nowMs: number) {
      frame = requestAnimationFrame(animate)
      const now = nowMs / 1000
      const delta = Math.min(.05, Math.max(.001, (nowMs - lastTime) / 1000))
      lastTime = nowMs

      const nextFloorRequest = floorRequestRef.current
      if (nextFloorRequest && nextFloorRequest.nonce !== lastFloorNonce) {
        lastFloorNonce = nextFloorRequest.nonce
        startFloorTravel(nextFloorRequest.floor)
      }

      const nextTravelRequest = travelRequestRef.current
      if (nextTravelRequest && nextTravelRequest.nonce !== lastTravelNonce) {
        lastTravelNonce = nextTravelRequest.nonce
        const node = nodeById.get(nextTravelRequest.id)
        if (node) startTravel(node, nextTravelRequest.inspectOnArrival)
      }

      const aimed = pickCenter()
      const nextHoverId = aimed?.id ?? null
      if (nextHoverId !== hoverId) {
        hoverId = nextHoverId
        hoverRef.current(aimed ?? null)
      }

      bookVisuals.forEach((visual, id) => {
        const selected = selectedRef.current === id
        const hovered = hoverId === id
        const routed = routeRef.current === id
        const active = selected || hovered || routed
        const inward = visual.side < 0 ? 1 : -1
        temp.copy(visual.base)
        temp.x += inward * (selected ? .48 : hovered ? .34 : routed ? .22 : 0)
        visual.group.position.lerp(temp, 1 - Math.exp(-delta * 12))
        visual.group.rotation.y = THREE.MathUtils.lerp(
          visual.group.rotation.y,
          visual.rotationY + (active ? inward * .045 : 0),
          1 - Math.exp(-delta * 10),
        )
        const scale = selected ? 1.1 : hovered ? 1.06 : 1
        visual.group.scale.lerp(
          targetScale.setScalar(scale),
          1 - Math.exp(-delta * 10),
        )
        visual.mesh.material.emissiveIntensity +=
          ((selected ? .95 : hovered ? .72 : routed ? .54 : .18) -
            visual.mesh.material.emissiveIntensity) *
          (1 - Math.exp(-delta * 8))
      })

      const hoverVisual = hoverId ? bookVisuals.get(hoverId) : undefined
      updateHoverCard(aimed?.kind === 'article' ? aimed : null, hoverVisual)

      const routeId = routeRef.current
      const routeNode = routeId ? nodeById.get(routeId) : null
      const routeDestination = routeNode ? travelDestination(routeNode) : null
      if (routeNode && routeDestination) {
        const routeFloor = layout.get(routeNode.id)?.floor ?? currentFloorIndex
        const curve = makeTravelCurve(routeDestination, routeFloor)
        guideGeometry.setFromPoints(curve.getPoints(42))
        guideLine.visible = true
        guideMaterial.opacity = .58 + Math.max(0, Math.sin(now * 3.8)) * .24
      } else {
        guideLine.visible = false
      }

      const nextSection = sectionForZ(camera.position.z)
      if (nextSection !== currentSection) {
        currentSection = nextSection
        zoneRef.current(nextSection)
      }

      particles.rotation.y = Math.sin(now * .035) * .012
      particleMaterial.opacity = reducedMotion
        ? .22
        : .27 + Math.max(0, Math.sin(now * .42)) * .12

      shaftMaterials.forEach((material, index) => {
        material.opacity = reducedMotion
          ? .03
          : .025 + Math.max(0, Math.sin(now * .33 + index * .7)) * .025
      })

      if (floorTravel) {
        const progress = THREE.MathUtils.clamp(
          (now - floorTravel.startedAt) / floorTravel.duration,
          0,
          1,
        )
        const eased = progress * progress * (3 - 2 * progress)
        const point = floorTravel.curve.getPoint(eased)
        const look = floorTravel.curve.getPoint(Math.min(1, eased + .025))
        position.copy(point)
        camera.position.copy(point)
        camera.lookAt(look)

        if (progress >= 1) {
          currentFloorIndex = floorTravel.floor
          position.set(0, currentFloorIndex * FLOOR_HEIGHT + CAMERA_HEIGHT, 6)
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
        const eased = progress * progress * (3 - 2 * progress)
        const point = travel.curve.getPoint(eased)
        const look = travel.curve.getPoint(Math.min(1, eased + .02))
        position.copy(point)
        camera.position.copy(point)
        camera.lookAt(look)

        if (progress >= 1) {
          const placement = layout.get(travel.node.id)
          currentFloorIndex = placement?.floor ?? currentFloorIndex
          position.copy(travel.destination)
          camera.position.copy(position)
          euler.setFromQuaternion(camera.quaternion, 'YXZ')
          yaw = euler.y
          pitch = euler.x
          velocity.set(0, 0, 0)
          const arrived = travel.node
          const inspectOnArrival = travel.inspectOnArrival
          travel = null
          floorChangeRef.current(currentFloorIndex)
          travelRef.current(arrived, inspectOnArrival)
        }
      } else {
        forward
          .set(
            -Math.sin(yaw) * Math.cos(pitch),
            0,
            -Math.cos(yaw) * Math.cos(pitch),
          )
          .normalize()
        right.crossVectors(forward, up).normalize()
        move.set(0, 0, 0)
        if (keys.has('KeyW')) move.add(forward)
        if (keys.has('KeyS')) move.sub(forward)
        if (keys.has('KeyD')) move.add(right)
        if (keys.has('KeyA')) move.sub(right)
        if (move.lengthSq() > 0) move.normalize()

        const sprinting = keys.has('ShiftLeft') || keys.has('ShiftRight')
        const speed = sprinting ? 4.1 : 2.2
        desired.copy(move).multiplyScalar(speed)
        velocity.lerp(desired, 1 - Math.exp(-delta * (move.lengthSq() ? 10 : 13)))

        const next = temp.copy(position).addScaledVector(velocity, delta)
        next.y = currentFloorIndex * FLOOR_HEIGHT + CAMERA_HEIGHT
        if (isWalkable(next, currentFloorIndex)) {
          position.copy(next)
        } else {
          velocity.multiplyScalar(.16)
        }

        camera.position.copy(position)
        camera.rotation.order = 'YXZ'
        camera.rotation.y = yaw
        camera.rotation.x = pitch
        camera.rotation.z = THREE.MathUtils.lerp(
          camera.rotation.z,
          0,
          1 - Math.exp(-delta * 12),
        )
      }

      renderer.render(scene, camera)
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

      geometries.forEach((geometry) => geometry.dispose())
      materials.forEach((material) => material.dispose())
      textures.forEach((texture) => texture.dispose())
      renderer.dispose()
      host.removeChild(renderer.domElement)
    }
  }, [nodes, edges])

  return <div ref={hostRef} className={styles.world} />
}
