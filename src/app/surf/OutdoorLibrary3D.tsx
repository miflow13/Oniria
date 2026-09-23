'use client'

import {useEffect, useRef} from 'react'
import * as THREE from 'three'
import {GLTFExporter} from 'three/examples/jsm/exporters/GLTFExporter.js'
import {FBXLoader} from 'three/examples/jsm/loaders/FBXLoader.js'
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js'
import {DRACOLoader} from 'three/examples/jsm/loaders/DRACOLoader.js'
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
  editorExportRequest: number
  onEditorExportReady: (ready: boolean) => void
}

type Placement = {
  position: THREE.Vector3
  rotationY: number
  floor: number
  side: -1 | 0 | 1
  shelfKey?: string
  shelfCenter?: THREE.Vector3
}

type BookVisual = {
  mesh: THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial>
  base: THREE.Vector3
  side: -1 | 1
  rotationY: number
}

type NavigationTarget = {
  position: THREE.Vector3
  node?: SurfNode
  inspectOnArrival?: boolean
}

const TERRACE_COUNT = 4
const TERRACE_RISE = 4
const CAMERA_HEIGHT = 1.62
const WORLD_NEAR_Z = 28
const WORLD_FAR_Z = -250
const WORLD_HALF_WIDTH = 46
const PATH_HALF_WIDTH = 4.25
const SHELF_X = 7.1
const TERRACE_SPAWN_Z = [9, -79, -141, -203]
const TERRACE_RAMP_START = [-64, -126, -188]
const TERRACE_RAMP_END = [-72, -134, -196]

const LIBRARY_ZONES: Record<LibrarySection, THREE.Vector3> = {
  atrium: new THREE.Vector3(0, 0, 8),
  featured: new THREE.Vector3(24, 0, -7),
  latest: new THREE.Vector3(3, 0, -24),
  topics: new THREE.Vector3(-24, 0, -7),
  creators: new THREE.Vector3(-23, 0, -31),
  search: new THREE.Vector3(22, 0, -31),
  archive: new THREE.Vector3(0, 4, -96),
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
  atrium: {title: 'OPEN STACKS', subtitle: 'GARDEN COMMONS'},
  featured: {title: '#JAVASCRIPT GROVE', subtitle: 'FEATURED DEV WRITING'},
  latest: {title: 'NEW GROWTH', subtitle: 'FRESH ARTICLES · LIVE CATALOG'},
  topics: {title: 'TRAIL INDEX', subtitle: 'TAGS BECOME PATHS'},
  creators: {title: 'AUTHOR GROVE', subtitle: 'CREATOR COLLECTIONS'},
  search: {title: 'SEARCH PAVILION', subtitle: 'QUERY THE LIVE ARCHIVE'},
  archive: {title: 'DEEP WOODS', subtitle: 'THE CATALOG KEEPS CLIMBING'},
}

const SECTION_COLORS: Record<LibrarySection, number> = {
  atrium: 0xf0eee2,
  featured: 0xf7df1e,
  latest: 0x8ed6a0,
  topics: 0x73cbe8,
  creators: 0xb193d8,
  search: 0xe58cb8,
  archive: 0x8ba08f,
}

const PACK_ASSETS = {
  terrainA: '/assets/lowpoly-environment/Terrain_1.fbx',
  terrainB: '/assets/lowpoly-environment/Terrain_2.fbx',
  treeA: '/assets/lowpoly-environment/Tree_1.fbx',
  treeB: '/assets/lowpoly-environment/Tree_3.fbx',
  bush: '/assets/lowpoly-environment/Bush_1.fbx',
  rock: '/assets/lowpoly-environment/Rock_1.fbx',
  mountain: '/assets/lowpoly-environment/Mounting_3.fbx',
  log: '/assets/lowpoly-environment/Log_1.fbx',
} as const

const LIBRARY_ASSETS = {
  wallPanel: '/assets/library-kit/library-wall-panel.glb',
  wallCorner: '/assets/library-kit/library-wall-corner.glb',
  floorParquet: '/assets/library-kit/library-floor-parquet.glb',
  stackShelf: '/assets/library-kit/stack-shelf.glb',
  bookPacked: '/assets/library-kit/book-row-packed.glb',
  bookLeaning: '/assets/library-kit/book-row-leaning.glb',
  chair: '/assets/library-kit/library-chair.glb',
  issueDesk: '/assets/library-kit/issue-desk.glb',
  cardCatalogue: '/assets/library-kit/card-catalogue.glb',
  displayCase: '/assets/library-kit/display-case.glb',
  periodicalRack: '/assets/library-kit/periodical-rack.glb',
  pendantLight: '/assets/library-kit/library-pendant-light.glb',
  archedWindow: '/assets/library-kit/arched-window.glb',
  readingRug: '/assets/library-kit/reading-rug.glb',
  rollingLadder: '/assets/library-kit/rolling-ladder.glb',
  floorLamp: '/assets/library-kit/library-floor-lamp.glb',
  readingTable: '/assets/library-kit/reading-table.glb',
  summerClouds: '/assets/library-kit/summer-clouds.glb',
} as const

function terraceBaseHeight(floor: number) {
  return THREE.MathUtils.clamp(floor, 0, TERRACE_COUNT - 1) * TERRACE_RISE
}

function terraceForZ(z: number) {
  if (z < -192) return 3
  if (z < -130) return 2
  if (z < -68) return 1
  return 0
}

function groundHeightAtZ(z: number) {
  for (let index = 0; index < TERRACE_RAMP_START.length; index += 1) {
    const start = TERRACE_RAMP_START[index]
    const end = TERRACE_RAMP_END[index]
    if (z <= start && z >= end) {
      const t = THREE.MathUtils.clamp((start - z) / (start - end), 0, 1)
      return THREE.MathUtils.lerp(index * TERRACE_RISE, (index + 1) * TERRACE_RISE, t)
    }
  }
  return terraceBaseHeight(terraceForZ(z))
}

function sectionForPosition(x: number, z: number, floor: number): LibrarySection {
  if (floor > 0) return 'archive'
  let best: LibrarySection = 'atrium'
  let bestDistance = Number.POSITIVE_INFINITY
  for (const section of SECTION_ORDER) {
    const anchor = LIBRARY_ZONES[section]
    const distance = Math.hypot(x - anchor.x, z - anchor.z)
    if (distance < bestDistance) {
      bestDistance = distance
      best = section
    }
  }
  return best
}

function seeded(index: number, salt = 0) {
  const x = Math.sin(index * 12.9898 + salt * 78.233) * 43758.5453
  return x - Math.floor(x)
}

function makeLabelTexture(
  title: string,
  subtitle: string,
  accent: string,
  textures: THREE.Texture[],
) {
  const canvas = document.createElement('canvas')
  canvas.width = 1024
  canvas.height = 320
  const context = canvas.getContext('2d')
  if (context) {
    context.clearRect(0, 0, canvas.width, canvas.height)
    context.fillStyle = 'rgba(34, 42, 31, .94)'
    context.fillRect(16, 16, canvas.width - 32, canvas.height - 32)
    context.strokeStyle = 'rgba(241, 238, 220, .38)'
    context.lineWidth = 5
    context.strokeRect(28, 28, canvas.width - 56, canvas.height - 56)
    context.fillStyle = accent
    context.fillRect(54, 54, canvas.width - 108, 10)
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.fillStyle = '#f4f1e5'
    context.font = '800 58px system-ui, sans-serif'
    context.fillText(title.slice(0, 34), canvas.width / 2, 145)
    context.fillStyle = '#d9decf'
    context.font = '650 24px system-ui, sans-serif'
    context.fillText(subtitle.slice(0, 54), canvas.width / 2, 220)
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.minFilter = THREE.LinearFilter
  texture.generateMipmaps = false
  textures.push(texture)
  return texture
}

function articleColor(node: SurfNode) {
  const accent = node.accent
  if (accent && /^#[0-9a-f]{6}$/i.test(accent)) {
    return Number.parseInt(accent.slice(1), 16)
  }
  return SECTION_COLORS[node.section ?? 'archive']
}

function buildLayout(nodes: SurfNode[]) {
  const layout = new Map<string, Placement>()
  const peerCache = new Map<string, SurfNode[]>()

  const peersFor = (node: SurfNode) => {
    const key = `${node.kind}:${node.section ?? 'atrium'}:${node.floorIndex ?? 0}`
    const cached = peerCache.get(key)
    if (cached) return cached
    const peers = nodes.filter(
      (candidate) =>
        candidate.kind === node.kind &&
        (candidate.section ?? 'atrium') === (node.section ?? 'atrium') &&
        (candidate.floorIndex ?? 0) === (node.floorIndex ?? 0),
    )
    peerCache.set(key, peers)
    return peers
  }

  nodes.forEach((node) => {
    const floor = THREE.MathUtils.clamp(node.floorIndex ?? 0, 0, TERRACE_COUNT - 1)
    const baseY = terraceBaseHeight(floor)
    const section = node.section ?? 'atrium'

    if (node.kind === 'home') {
      layout.set(node.id, {
        position: new THREE.Vector3(0, baseY + 1.55, 9.5),
        rotationY: 0,
        floor,
        side: 0,
      })
      return
    }

    if (node.kind === 'section') {
      layout.set(node.id, {
        position: LIBRARY_ZONES[section].clone().setY(baseY + 1.55),
        rotationY: 0,
        floor,
        side: 0,
      })
      return
    }

    if (node.kind !== 'article') {
      const peers = peersFor(node)
      const index = Math.max(0, peers.findIndex((candidate) => candidate.id === node.id))
      const side: -1 | 1 = index % 2 === 0 ? -1 : 1
      const row = Math.floor(index / 2)
      const anchor = floor === 0 ? LIBRARY_ZONES[section] : new THREE.Vector3(0, baseY, TERRACE_SPAWN_Z[floor])
      layout.set(node.id, {
        position: new THREE.Vector3(anchor.x + side * 3.55, baseY + 1.35, anchor.z - 2.8 - row * 2.15),
        rotationY: side < 0 ? Math.PI / 2 : -Math.PI / 2,
        floor,
        side,
      })
      return
    }

    const peers = peersFor(node)
    const index = Math.max(0, peers.findIndex((candidate) => candidate.id === node.id))
    const side: -1 | 1 = index % 2 === 0 ? -1 : 1
    const local = Math.floor(index / 2)
    const row = local % 4
    const slot = Math.floor(local / 4) % 10
    const bay = Math.floor(local / 40)
    const anchor = floor === 0 ? LIBRARY_ZONES[section] : new THREE.Vector3(0, baseY, TERRACE_SPAWN_Z[floor])
    const sectionAnchor = anchor.z - 2.6
    const bayCenterZ = sectionAnchor - bay * 5.6
    const z = bayCenterZ + 1.72 - slot * .38
    const roomShelfX = floor === 0 ? 5.7 : SHELF_X
    const x = anchor.x + side * (roomShelfX - .42)
    const shelfKey = `${section}:f${floor}:s${side}:b${bay}`

    layout.set(node.id, {
      position: new THREE.Vector3(x, baseY + .72 + row * .72, z),
      rotationY: 0,
      floor,
      side,
      shelfKey,
      shelfCenter: new THREE.Vector3(anchor.x + side * roomShelfX, baseY + 1.6, bayCenterZ),
    })
  })

  return layout
}

function fitTemplate(root: THREE.Group, target: number, mode: 'height' | 'span') {
  root.updateMatrixWorld(true)
  let box = new THREE.Box3().setFromObject(root)
  const size = box.getSize(new THREE.Vector3())
  const denominator = mode === 'height' ? Math.max(size.y, .0001) : Math.max(size.x, size.z, .0001)
  root.scale.multiplyScalar(target / denominator)
  root.updateMatrixWorld(true)
  box = new THREE.Box3().setFromObject(root)
  root.position.y -= box.min.y
  root.updateMatrixWorld(true)
  return root
}

function markEnvironment(root: THREE.Object3D) {
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return
    child.castShadow = true
    child.receiveShadow = true
    child.frustumCulled = true
    const source = child.material
    const materials = Array.isArray(source) ? source : [source]
    materials.forEach((material) => {
      if (material instanceof THREE.MeshStandardMaterial || material instanceof THREE.MeshPhongMaterial) {
        material.flatShading = true
        material.needsUpdate = true
      }
    })
  })
}

function cloneAt(
  template: THREE.Group,
  scene: THREE.Scene,
  x: number,
  z: number,
  scale: number,
  rotationY: number,
  yOffset = 0,
) {
  const clone = template.clone(true)
  clone.position.x += x
  clone.position.z += z
  clone.position.y += groundHeightAtZ(z) + yOffset
  clone.rotation.y += rotationY
  clone.scale.multiplyScalar(scale)
  scene.add(clone)
  return clone
}

function makePathSegment(
  scene: THREE.Scene,
  from: THREE.Vector3,
  to: THREE.Vector3,
  width: number,
  material: THREE.Material,
  geometry: THREE.BoxGeometry,
) {
  const midpoint = from.clone().add(to).multiplyScalar(.5)
  const dx = to.x - from.x
  const dz = to.z - from.z
  const dy = to.y - from.y
  const horizontal = Math.hypot(dx, dz)
  const length = Math.hypot(horizontal, dy)
  const mesh = new THREE.Mesh(geometry, material)
  mesh.position.copy(midpoint)
  mesh.scale.set(width, .1, length)
  mesh.rotation.y = Math.atan2(dx, dz)
  mesh.rotation.x = -Math.atan2(dy, Math.max(horizontal, .001))
  mesh.receiveShadow = true
  scene.add(mesh)
  return mesh
}

export default function OutdoorLibrary3D({
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
  editorExportRequest,
  onEditorExportReady,
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
  const editorExportRequestRef = useRef(editorExportRequest)
  const editorExportReadyRef = useRef(onEditorExportReady)

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
    editorExportRequestRef.current = editorExportRequest
  }, [editorExportRequest])
  useEffect(() => {
    editorExportReadyRef.current = onEditorExportReady
  }, [onEditorExportReady])

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    const scene = new THREE.Scene()
    scene.name = 'Oniria Outdoor Library'
    scene.background = new THREE.Color(0xa9c8cb)
    scene.fog = new THREE.FogExp2(0xa7c0b7, .0085)

    const camera = new THREE.PerspectiveCamera(68, 1, .05, 330)
    camera.position.set(0, CAMERA_HEIGHT, 13)
    camera.rotation.order = 'YXZ'

    const renderer = new THREE.WebGLRenderer({antialias: true, powerPreference: 'high-performance'})
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.08
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5))
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    host.appendChild(renderer.domElement)

    const geometries: THREE.BufferGeometry[] = []
    const materials: THREE.Material[] = []
    const textures: THREE.Texture[] = []
    const interactive: THREE.Object3D[] = []
    const bookVisuals = new Map<string, BookVisual>()
    const nodeById = new Map(nodes.map((node) => [node.id, node]))
    const layout = buildLayout(nodes)

    const skyLight = new THREE.HemisphereLight(0xe6f3ff, 0x31422b, 1.65)
    scene.add(skyLight)

    const sun = new THREE.DirectionalLight(0xfff0c4, 2.8)
    sun.position.set(-24, 42, 18)
    sun.castShadow = true
    sun.shadow.mapSize.set(1536, 1536)
    sun.shadow.camera.left = -38
    sun.shadow.camera.right = 38
    sun.shadow.camera.top = 48
    sun.shadow.camera.bottom = -48
    sun.shadow.camera.near = 1
    sun.shadow.camera.far = 120
    scene.add(sun)

    const fill = new THREE.DirectionalLight(0x91b7d6, .75)
    fill.position.set(30, 18, -80)
    scene.add(fill)

    const grassMaterial = new THREE.MeshStandardMaterial({
      color: 0x6f8d58,
      roughness: .96,
      metalness: 0,
      flatShading: true,
    })
    const cliffMaterial = new THREE.MeshStandardMaterial({
      color: 0x5d6658,
      roughness: .98,
      flatShading: true,
    })
    const pathMaterial = new THREE.MeshStandardMaterial({
      color: 0xb7a47d,
      roughness: .96,
      flatShading: true,
    })
    const pathEdgeMaterial = new THREE.MeshStandardMaterial({
      color: 0xd6ccb0,
      roughness: .9,
      flatShading: true,
    })
    const woodMaterial = new THREE.MeshStandardMaterial({
      color: 0x654834,
      roughness: .82,
      metalness: .02,
      flatShading: true,
    })
    const woodDarkMaterial = new THREE.MeshStandardMaterial({
      color: 0x3f3026,
      roughness: .9,
      flatShading: true,
    })
    const stoneMaterial = new THREE.MeshStandardMaterial({
      color: 0x8c958b,
      roughness: .94,
      flatShading: true,
    })
    materials.push(
      grassMaterial,
      cliffMaterial,
      pathMaterial,
      pathEdgeMaterial,
      woodMaterial,
      woodDarkMaterial,
      stoneMaterial,
    )

    const unitBox = new THREE.BoxGeometry(1, 1, 1)
    const unitPlane = new THREE.PlaneGeometry(1, 1)
    const bookGeometry = new THREE.BoxGeometry(.18, .58, .32)
    const plinthGeometry = new THREE.CylinderGeometry(1.9, 2.25, .5, 10)
    geometries.push(unitBox, unitPlane, bookGeometry, plinthGeometry)

    // Primitive materials are limited to floor and roof support. All visible
    // wall faces and corners come from the authored library GLB kit.
    const libraryStoneDarkMaterial = new THREE.MeshStandardMaterial({
      color: 0x54584f,
      roughness: .98,
      metalness: 0,
      flatShading: true,
    })
    const libraryRoofMaterial = new THREE.MeshStandardMaterial({
      color: 0x39423b,
      roughness: .9,
      metalness: .05,
      flatShading: true,
    })
    const libraryGoldMaterial = new THREE.MeshStandardMaterial({
      color: 0xc6a764,
      emissive: 0x7d612c,
      emissiveIntensity: .2,
      roughness: .58,
      metalness: .34,
      flatShading: true,
    })
    materials.push(
      libraryStoneDarkMaterial,
      libraryRoofMaterial,
      libraryGoldMaterial,
    )

    const libraryColliders: Array<{
      minX: number
      maxX: number
      minZ: number
      maxZ: number
    }> = []

    const addLibraryCollider = (
      x: number,
      z: number,
      width: number,
      depth: number,
    ) => {
      const margin = .18
      libraryColliders.push({
        minX: x - width / 2 - margin,
        maxX: x + width / 2 + margin,
        minZ: z - depth / 2 - margin,
        maxZ: z + depth / 2 + margin,
      })
    }

    const addLibraryBox = (
      material: THREE.Material,
      x: number,
      y: number,
      z: number,
      sx: number,
      sy: number,
      sz: number,
      rotationZ = 0,
    ) => {
      const mesh = new THREE.Mesh(unitBox, material)
      mesh.position.set(x, y, z)
      mesh.scale.set(sx, sy, sz)
      mesh.rotation.z = rotationZ
      mesh.castShadow = true
      mesh.receiveShadow = true
      scene.add(mesh)
      return mesh
    }

    type LibraryRoom = {
      key: string
      floor: number
      x: number
      z: number
      width: number
      depth: number
      grand?: boolean
      doors: Array<'north' | 'south' | 'east' | 'west'>
    }

    // The complex is deliberately composed as rooms around outdoor courts,
    // rather than one axis of ever-longer naves. Each room owns its openings;
    // collision follows the structural wall segments, so doors stay walkable.
    const libraryRooms: LibraryRoom[] = [
      {key: 'grand-hall', floor: 0, x: 0, z: 7, width: 28, depth: 23, grand: true, doors: ['north', 'south', 'east', 'west']},
      {key: 'featured-gallery', floor: 0, x: 24, z: -7, width: 18, depth: 18, doors: ['west', 'south']},
      {key: 'periodicals', floor: 0, x: 3, z: -25, width: 19, depth: 17, doors: ['north', 'east', 'west']},
      {key: 'reference', floor: 0, x: -24, z: -7, width: 18, depth: 18, doors: ['east', 'south']},
      {key: 'creator-study', floor: 0, x: -23, z: -31, width: 18, depth: 18, doors: ['north', 'east']},
      {key: 'search-room', floor: 0, x: 22, z: -31, width: 18, depth: 18, doors: ['north', 'west']},
      {key: 'archive-court', floor: 1, x: 0, z: -96, width: 27, depth: 25, grand: true, doors: ['north', 'south', 'east', 'west']},
      {key: 'archive-east', floor: 1, x: 25, z: -103, width: 17, depth: 30, doors: ['west', 'south']},
      {key: 'research-stacks', floor: 2, x: -10, z: -158, width: 25, depth: 28, doors: ['north', 'east', 'west']},
      {key: 'archive-west', floor: 2, x: -33, z: -164, width: 16, depth: 25, doors: ['east', 'south']},
      {key: 'deep-stacks', floor: 3, x: 8, z: -220, width: 28, depth: 31, grand: true, doors: ['north', 'west']},
      {key: 'deep-annex', floor: 3, x: -25, z: -226, width: 17, depth: 25, doors: ['east', 'north']},
    ]

    const buildLibraryRoom = (room: LibraryRoom) => {
      const baseY = terraceBaseHeight(room.floor)
      const wallHeight = 4.7
      const roofY = baseY + wallHeight + .65
      const halfWidth = room.width / 2
      const halfDepth = room.depth / 2
      const opening = 4.8
      const addWall = (x: number, z: number, width: number, depth: number) => {
        // Visible walls are supplied later by the authored GLB wall kit.
        // This rectangle exists only in the lightweight collision model.
        addLibraryCollider(x, z, width, depth)
      }
      const addNorthSouthWall = (z: number, open: boolean) => {
        if (!open) return addWall(room.x, z, room.width, .56)
        const span = (room.width - opening) / 2
        addWall(room.x - (opening + span) / 2, z, span, .56)
        addWall(room.x + (opening + span) / 2, z, span, .56)
      }
      const addEastWestWall = (x: number, open: boolean) => {
        if (!open) return addWall(x, room.z, .56, room.depth)
        const span = (room.depth - opening) / 2
        addWall(x, room.z - (opening + span) / 2, .56, span)
        addWall(x, room.z + (opening + span) / 2, .56, span)
      }

      addLibraryBox(libraryStoneDarkMaterial, room.x, baseY - .17, room.z, room.width + .7, .34, room.depth + .7)
      addNorthSouthWall(room.z + halfDepth, room.doors.includes('north'))
      addNorthSouthWall(room.z - halfDepth, room.doors.includes('south'))
      addEastWestWall(room.x - halfWidth, room.doors.includes('west'))
      addEastWestWall(room.x + halfWidth, room.doors.includes('east'))

      // Varied room-by-room roof volumes create a readable silhouette from
      // the landscape while preserving clerestory light within each chamber.
      addLibraryBox(libraryRoofMaterial, room.x - room.width * .22, roofY, room.z, room.width * .58, .48, room.depth + .9, room.grand ? .34 : .28)
      addLibraryBox(libraryRoofMaterial, room.x + room.width * .22, roofY, room.z, room.width * .58, .48, room.depth + .9, room.grand ? -.34 : -.28)
      addLibraryBox(libraryGoldMaterial, room.x, roofY + .7, room.z, .26, .26, room.depth * .72)

      const light = new THREE.PointLight(room.grand ? 0xffd694 : 0xe9dfb6, room.grand ? 3.7 : 2.3, 19, 2)
      light.position.set(room.x, baseY + wallHeight - .7, room.z)
      scene.add(light)
    }

    libraryRooms.forEach(buildLibraryRoom)

    const terraceSegments = [
      {floor: 0, z: -23, depth: 86},
      {floor: 1, z: -99, depth: 58},
      {floor: 2, z: -161, depth: 58},
      {floor: 3, z: -224, depth: 58},
    ]

    terraceSegments.forEach(({floor, z, depth}) => {
      const ground = new THREE.Mesh(unitBox, grassMaterial)
      ground.scale.set(104, .72, depth)
      ground.position.set(0, terraceBaseHeight(floor) - .38, z)
      ground.receiveShadow = true
      scene.add(ground)

      const leftCliff = new THREE.Mesh(unitBox, cliffMaterial)
      leftCliff.scale.set(4.8, 1.8 + floor * .5, depth)
      leftCliff.position.set(-53, terraceBaseHeight(floor) - 1.05, z)
      leftCliff.receiveShadow = true
      scene.add(leftCliff)
      const rightCliff = leftCliff.clone()
      rightCliff.position.x = 53
      scene.add(rightCliff)
    })

    const rampPathGeometry = unitBox
    TERRACE_RAMP_START.forEach((startZ, index) => {
      const endZ = TERRACE_RAMP_END[index]
      const from = new THREE.Vector3(0, terraceBaseHeight(index) + .08, startZ)
      const to = new THREE.Vector3(0, terraceBaseHeight(index + 1) + .08, endZ)
      makePathSegment(scene, from, to, 4.9, pathMaterial, rampPathGeometry)
      for (const side of [-1, 1]) {
        const edgeFrom = from.clone().setX(side * 2.65)
        const edgeTo = to.clone().setX(side * 2.65)
        makePathSegment(scene, edgeFrom, edgeTo, .18, pathEdgeMaterial, rampPathGeometry)
      }
    })

    const mainPath = new THREE.Mesh(unitBox, pathMaterial)
    mainPath.scale.set(PATH_HALF_WIDTH * 2, .08, 260)
    mainPath.position.set(0, .05, -116)
    mainPath.receiveShadow = true
    scene.add(mainPath)

    // Garden walks make the public rooms legible as a campus: each branch
    // leaves the grand hall and crosses open air before entering its chamber.
    const gardenWalks = [
      [LIBRARY_ZONES.atrium, LIBRARY_ZONES.featured],
      [LIBRARY_ZONES.atrium, LIBRARY_ZONES.topics],
      [LIBRARY_ZONES.atrium, LIBRARY_ZONES.latest],
      [LIBRARY_ZONES.latest, LIBRARY_ZONES.creators],
      [LIBRARY_ZONES.latest, LIBRARY_ZONES.search],
    ] as const
    gardenWalks.forEach(([from, to]) => {
      const start = from.clone().setY(.08)
      const end = to.clone().setY(.08)
      makePathSegment(scene, start, end, 3.2, pathMaterial, unitBox)
    })

    for (let floor = 1; floor < TERRACE_COUNT; floor += 1) {
      const terracePath = new THREE.Mesh(unitBox, pathMaterial)
      terracePath.scale.set(PATH_HALF_WIDTH * 2, .08, floor === 3 ? 58 : 54)
      terracePath.position.set(0, terraceBaseHeight(floor) + .05, floor === 1 ? -99 : floor === 2 ? -161 : -224)
      terracePath.receiveShadow = true
      scene.add(terracePath)
    }

    for (const x of [-PATH_HALF_WIDTH - .35, PATH_HALF_WIDTH + .35]) {
      const edge = new THREE.Mesh(unitBox, pathEdgeMaterial)
      edge.scale.set(.16, .09, 258)
      edge.position.set(x, .1, -116)
      scene.add(edge)
    }

    const commons = new THREE.Mesh(plinthGeometry, stoneMaterial)
    commons.position.set(0, .22, 9)
    commons.receiveShadow = true
    scene.add(commons)

    const commonsRingMaterial = new THREE.MeshStandardMaterial({
      color: 0xcad1c0,
      emissive: 0x4f6c5c,
      emissiveIntensity: .16,
      roughness: .78,
    })
    materials.push(commonsRingMaterial)
    const commonsRingGeometry = new THREE.TorusGeometry(2.42, .12, 6, 32)
    geometries.push(commonsRingGeometry)
    const commonsRing = new THREE.Mesh(commonsRingGeometry, commonsRingMaterial)
    commonsRing.rotation.x = Math.PI / 2
    commonsRing.position.set(0, .53, 9)
    scene.add(commonsRing)

    const shelfCenters = new Map<string, THREE.Vector3>()
    layout.forEach((placement) => {
      if (placement.shelfKey && placement.shelfCenter && !shelfCenters.has(placement.shelfKey)) {
        shelfCenters.set(placement.shelfKey, placement.shelfCenter.clone())
      }
    })

    shelfCenters.forEach((center) => {
      const side = center.x < 0 ? -1 : 1
      const back = new THREE.Mesh(unitBox, woodDarkMaterial)
      back.scale.set(.32, 3.6, 4.7)
      back.position.copy(center)
      back.position.y += .08
      back.castShadow = true
      back.receiveShadow = true
      scene.add(back)

      for (const zOffset of [-2.28, 2.28]) {
        const post = new THREE.Mesh(unitBox, woodMaterial)
        post.scale.set(.48, 3.9, .24)
        post.position.set(center.x - side * .18, center.y + .08, center.z + zOffset)
        post.castShadow = true
        scene.add(post)
      }

      for (let row = 0; row <= 4; row += 1) {
        const board = new THREE.Mesh(unitBox, woodMaterial)
        board.scale.set(.62, .1, 4.76)
        board.position.set(center.x - side * .26, center.y - 1.38 + row * .72, center.z)
        board.castShadow = true
        board.receiveShadow = true
        scene.add(board)
      }

      const cap = new THREE.Mesh(unitBox, woodMaterial)
      cap.scale.set(.72, .18, 4.98)
      cap.position.set(center.x - side * .2, center.y + 1.98, center.z)
      cap.castShadow = true
      scene.add(cap)
    })

    const bookMaterials = new Map<number, THREE.MeshStandardMaterial>()
    const getBookMaterial = (color: number) => {
      const normalized = color >>> 0
      const existing = bookMaterials.get(normalized)
      if (existing) return existing
      const material = new THREE.MeshStandardMaterial({
        color: normalized,
        roughness: .62,
        metalness: .04,
        emissive: new THREE.Color(normalized).multiplyScalar(.08),
        emissiveIntensity: .4,
        flatShading: true,
      })
      materials.push(material)
      bookMaterials.set(normalized, material)
      return material
    }

    nodes.forEach((node) => {
      const placement = layout.get(node.id)
      if (!placement) return

      if (node.kind === 'article') {
        const material = getBookMaterial(articleColor(node))
        const book = new THREE.Mesh(bookGeometry, material)
        book.position.copy(placement.position)
        book.rotation.y = placement.rotationY
        book.castShadow = true
        book.userData.nodeId = node.id
        interactive.push(book)
        scene.add(book)
        bookVisuals.set(node.id, {
          mesh: book,
          base: placement.position.clone(),
          side: placement.side === 0 ? 1 : placement.side,
          rotationY: placement.rotationY,
        })
        return
      }

      const label = SECTION_LABELS[node.section ?? 'atrium']
      const title = node.kind === 'section' || node.kind === 'home' ? label.title : node.title
      const subtitle = node.kind === 'section' || node.kind === 'home' ? label.subtitle : node.subtitle
      const texture = makeLabelTexture(title, subtitle, node.accent || '#d8dfd0', textures)
      const signMaterial = new THREE.MeshBasicMaterial({map: texture, transparent: true, side: THREE.DoubleSide})
      materials.push(signMaterial)
      const sign = new THREE.Mesh(unitPlane, signMaterial)
      const primary = node.kind === 'section' || node.kind === 'home'
      sign.scale.set(primary ? 5.2 : 2.8, primary ? 1.55 : .9, 1)
      sign.position.copy(placement.position)
      sign.rotation.y = placement.rotationY
      sign.userData.nodeId = node.id
      interactive.push(sign)
      scene.add(sign)

      const postHeight = primary ? 2.7 : 1.85
      for (const offset of [-1, 1]) {
        const post = new THREE.Mesh(unitBox, woodMaterial)
        post.scale.set(.16, postHeight, .16)
        post.position.copy(placement.position)
        if (Math.abs(placement.rotationY) < .1) {
          post.position.x += offset * (primary ? 2.1 : 1.1)
        } else {
          post.position.z += offset * (primary ? 2.1 : 1.1)
        }
        post.position.y -= primary ? .95 : .58
        post.castShadow = true
        scene.add(post)
      }
    })

    const routeGeometry = new THREE.BufferGeometry()
    const routePositions = new Float32Array(6)
    routeGeometry.setAttribute('position', new THREE.BufferAttribute(routePositions, 3))
    const routeMaterial = new THREE.LineBasicMaterial({
      color: 0x7de0ff,
      transparent: true,
      opacity: .76,
      depthWrite: false,
    })
    geometries.push(routeGeometry)
    materials.push(routeMaterial)
    const routeLine = new THREE.Line(routeGeometry, routeMaterial)
    routeLine.frustumCulled = false
    scene.add(routeLine)

    const fireflyCount = 320
    const fireflyPositions = new Float32Array(fireflyCount * 3)
    for (let index = 0; index < fireflyCount; index += 1) {
      const z = WORLD_NEAR_Z - seeded(index, 4) * (WORLD_NEAR_Z - WORLD_FAR_Z)
      const floor = terraceForZ(z)
      fireflyPositions[index * 3] = (seeded(index, 5) - .5) * 25
      fireflyPositions[index * 3 + 1] = terraceBaseHeight(floor) + .5 + seeded(index, 6) * 5.5
      fireflyPositions[index * 3 + 2] = z
    }
    const fireflyGeometry = new THREE.BufferGeometry()
    fireflyGeometry.setAttribute('position', new THREE.BufferAttribute(fireflyPositions, 3))
    const fireflyMaterial = new THREE.PointsMaterial({
      color: 0xe6f4b3,
      size: .045,
      transparent: true,
      opacity: .55,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
    geometries.push(fireflyGeometry)
    materials.push(fireflyMaterial)
    const fireflies = new THREE.Points(fireflyGeometry, fireflyMaterial)
    scene.add(fireflies)

    const loader = new FBXLoader()
    const gltfLoader = new GLTFLoader()
    const dracoLoader = new DRACOLoader()
    dracoLoader.setDecoderPath('/draco/')
    dracoLoader.setDecoderConfig({type: 'js'})
    dracoLoader.preload()
    gltfLoader.setDRACOLoader(dracoLoader)

    let disposed = false
    const environmentRoots: THREE.Object3D[] = []
    const libraryRoots: THREE.Object3D[] = []
    const movingClouds: Array<{
      root: THREE.Object3D
      speed: number
      minX: number
      maxX: number
    }> = []
    const importedGeometries = new Set<THREE.BufferGeometry>()
    const importedMaterials = new Set<THREE.Material>()
    let assetBatchesRemaining = 2
    let editorExportReady = false
    let handledEditorExportRequest = editorExportRequestRef.current

    const exportEditorWorld = async () => {
      scene.updateMatrixWorld(true)
      const result = await new GLTFExporter().parseAsync(scene, {
        binary: true,
        onlyVisible: true,
        includeCustomExtensions: true,
        maxTextureSize: 2048,
      })
      if (!(result instanceof ArrayBuffer)) {
        throw new Error('Expected a binary GLB export.')
      }
      const url = URL.createObjectURL(new Blob([result], {type: 'model/gltf-binary'}))
      const link = document.createElement('a')
      link.href = url
      link.download = 'oniria-outdoor-library.glb'
      link.click()
      URL.revokeObjectURL(url)
    }

    const completeAssetBatch = () => {
      assetBatchesRemaining -= 1
      if (assetBatchesRemaining !== 0 || disposed) return
      editorExportReady = true
      editorExportReadyRef.current(true)
    }

    const trackImportedResources = (root: THREE.Object3D) => {
      root.traverse((child) => {
        if (!(child instanceof THREE.Mesh)) return
        importedGeometries.add(child.geometry)
        const source = child.material
        const childMaterials = Array.isArray(source) ? source : [source]
        childMaterials.forEach((material) => importedMaterials.add(material))
      })
    }

    const loadTemplate = async (
      path: string,
      target: number,
      mode: 'height' | 'span',
    ) => {
      const group = await loader.loadAsync(path)
      fitTemplate(group, target, mode)
      markEnvironment(group)
      trackImportedResources(group)
      return group
    }

    const loadLibraryTemplate = async (
      path: string,
      target: number,
      mode: 'height' | 'span',
    ) => {
      const gltf = await gltfLoader.loadAsync(path)
      const group = gltf.scene
      fitTemplate(group, target, mode)
      group.traverse((child) => {
        if (!(child instanceof THREE.Mesh)) return
        child.castShadow = true
        child.receiveShadow = true
        child.frustumCulled = true
      })
      trackImportedResources(group)
      return group
    }

    const placeLibraryAsset = (
      template: THREE.Group,
      x: number,
      y: number,
      z: number,
      scale = 1,
      rotationY = 0,
      rotationX = 0,
      nodeId?: string,
    ) => {
      const clone = template.clone(true)
      clone.position.x += x
      clone.position.y += y
      clone.position.z += z
      clone.scale.multiplyScalar(scale)
      clone.rotation.y += rotationY
      clone.rotation.x += rotationX
      scene.add(clone)
      libraryRoots.push(clone)

      if (nodeId && nodeById.has(nodeId)) {
        clone.traverse((child) => {
          if (!(child instanceof THREE.Mesh)) return
          child.userData.nodeId = nodeId
          interactive.push(child)
        })
      }

      return clone
    }

    Promise.allSettled([
      loadTemplate(PACK_ASSETS.terrainA, 18, 'span'),
      loadTemplate(PACK_ASSETS.terrainB, 22, 'span'),
      loadTemplate(PACK_ASSETS.treeA, 5.8, 'height'),
      loadTemplate(PACK_ASSETS.treeB, 7.2, 'height'),
      loadTemplate(PACK_ASSETS.bush, 1.45, 'height'),
      loadTemplate(PACK_ASSETS.rock, 1.8, 'span'),
      loadTemplate(PACK_ASSETS.mountain, 28, 'height'),
      loadTemplate(PACK_ASSETS.log, 2.8, 'span'),
    ]).then((results) => {
      if (disposed) return
      const [terrainA, terrainB, treeA, treeB, bush, rock, mountain, log] = results.map((result) =>
        result.status === 'fulfilled' ? result.value : null,
      )

      const addRoot = (root: THREE.Object3D | null) => {
        if (root) environmentRoots.push(root)
      }
      const canPlaceLandscape = (x: number, z: number) =>
        !libraryRooms.some(
          (room) =>
            Math.abs(x - room.x) < room.width / 2 + 3 &&
            Math.abs(z - room.z) < room.depth / 2 + 3,
        )

      if (terrainA) {
        for (let index = 0; index < 16; index += 1) {
          const side = index % 2 === 0 ? -1 : 1
          const z = 10 - Math.floor(index / 2) * 33
          const x = side * (15.5 + seeded(index, 11) * 5)
          if (!canPlaceLandscape(x, z)) continue
          const clone = cloneAt(terrainA, scene, x, z, .82 + seeded(index, 12) * .36, seeded(index, 13) * Math.PI * 2, -.22)
          addRoot(clone)
        }
      }

      if (terrainB) {
        for (let index = 0; index < 10; index += 1) {
          const side = index % 2 === 0 ? -1 : 1
          const z = -6 - Math.floor(index / 2) * 52
          const x = side * (24 + seeded(index, 14) * 8)
          if (!canPlaceLandscape(x, z)) continue
          const clone = cloneAt(terrainB, scene, x, z, .9 + seeded(index, 15) * .42, seeded(index, 16) * Math.PI * 2, -1.2)
          addRoot(clone)
        }
      }

      const treeTemplates = [treeA, treeB].filter((value): value is THREE.Group => Boolean(value))
      if (treeTemplates.length) {
        for (let index = 0; index < 92; index += 1) {
          const z = WORLD_NEAR_Z - 4 - seeded(index, 21) * 258
          const side = index % 2 === 0 ? -1 : 1
          const x = side * (10.8 + seeded(index, 22) * 14)
          if (!canPlaceLandscape(x, z)) continue
          const template = treeTemplates[index % treeTemplates.length]
          const clone = cloneAt(template, scene, x, z, .72 + seeded(index, 23) * .62, seeded(index, 24) * Math.PI * 2)
          addRoot(clone)
        }
      }

      if (bush) {
        for (let index = 0; index < 64; index += 1) {
          const z = WORLD_NEAR_Z - 8 - seeded(index, 31) * 250
          const side = index % 2 === 0 ? -1 : 1
          const x = side * (8.9 + seeded(index, 32) * 6.5)
          if (!canPlaceLandscape(x, z)) continue
          const clone = cloneAt(bush, scene, x, z, .65 + seeded(index, 33) * .65, seeded(index, 34) * Math.PI * 2)
          addRoot(clone)
        }
      }

      if (rock) {
        for (let index = 0; index < 42; index += 1) {
          const z = WORLD_NEAR_Z - seeded(index, 41) * 260
          const side = index % 2 === 0 ? -1 : 1
          const x = side * (9 + seeded(index, 42) * 9)
          if (!canPlaceLandscape(x, z)) continue
          const clone = cloneAt(rock, scene, x, z, .55 + seeded(index, 43) * 1.05, seeded(index, 44) * Math.PI * 2)
          addRoot(clone)
        }
      }

      if (log) {
        for (let index = 0; index < 14; index += 1) {
          const z = 2 - seeded(index, 51) * 238
          const side = index % 2 === 0 ? -1 : 1
          const x = side * (10 + seeded(index, 52) * 5)
          if (!canPlaceLandscape(x, z)) continue
          const clone = cloneAt(log, scene, x, z, .75 + seeded(index, 53) * .55, seeded(index, 54) * Math.PI * 2)
          addRoot(clone)
        }
      }

      if (mountain) {
        for (let index = 0; index < 10; index += 1) {
          const side = index % 2 === 0 ? -1 : 1
          const z = 15 - Math.floor(index / 2) * 62
          const clone = cloneAt(mountain, scene, side * (43 + seeded(index, 61) * 18), z, .9 + seeded(index, 62) * .55, seeded(index, 63) * Math.PI * 2, -4.5)
          addRoot(clone)
        }
      }
    }).finally(completeAssetBatch)

    const libraryAssetRequests = [
      [LIBRARY_ASSETS.wallPanel, 4.7, 'height'],
      [LIBRARY_ASSETS.wallCorner, 4.7, 'height'],
      [LIBRARY_ASSETS.floorParquet, 6.2, 'span'],
      [LIBRARY_ASSETS.stackShelf, 3.5, 'height'],
      [LIBRARY_ASSETS.bookPacked, 2.45, 'span'],
      [LIBRARY_ASSETS.bookLeaning, 2.35, 'span'],
      [LIBRARY_ASSETS.chair, 1.05, 'height'],
      [LIBRARY_ASSETS.issueDesk, 1.45, 'height'],
      [LIBRARY_ASSETS.cardCatalogue, 1.85, 'height'],
      [LIBRARY_ASSETS.displayCase, 1.45, 'height'],
      [LIBRARY_ASSETS.periodicalRack, 1.75, 'height'],
      [LIBRARY_ASSETS.pendantLight, 1.05, 'height'],
      [LIBRARY_ASSETS.archedWindow, 3.25, 'height'],
      [LIBRARY_ASSETS.readingRug, 3.8, 'span'],
      [LIBRARY_ASSETS.rollingLadder, 2.8, 'height'],
      [LIBRARY_ASSETS.floorLamp, 1.65, 'height'],
      [LIBRARY_ASSETS.readingTable, 1.25, 'height'],
      [LIBRARY_ASSETS.summerClouds, 13.5, 'span'],
    ] as const

    Promise.allSettled(
      libraryAssetRequests.map(([path, target, mode]) =>
        loadLibraryTemplate(path, target, mode),
      ),
    ).then((results) => {
      if (disposed) return

      results.forEach((result, index) => {
        if (result.status === 'rejected') {
          console.error(
            '[OutdoorLibrary3D] Failed to load library asset:',
            libraryAssetRequests[index][0],
            result.reason,
          )
        }
      })

      const [
        wallPanel,
        wallCorner,
        floorParquet,
        stackShelf,
        bookPacked,
        bookLeaning,
        chair,
        issueDesk,
        cardCatalogue,
        displayCase,
        periodicalRack,
        pendantLight,
        archedWindow,
        readingRug,
        rollingLadder,
        floorLamp,
        readingTable,
        summerClouds,
      ] = results.map((result) =>
        result.status === 'fulfilled' ? result.value : null,
      )

      const loadedCount = results.filter(
        (result) => result.status === 'fulfilled',
      ).length
      console.info(
        `[OutdoorLibrary3D] Loaded ${loadedCount}/${libraryAssetRequests.length} library assets`,
      )

      const primaryWall = wallPanel ?? archedWindow
      const wallBounds = primaryWall
        ? new THREE.Box3().setFromObject(primaryWall).getSize(new THREE.Vector3())
        : new THREE.Vector3(4.2, 4.7, .3)
      const wallBaySpan = THREE.MathUtils.clamp(wallBounds.x, 3.2, 5.4)

      const wallBayPositions = (center: number, length: number) => {
        const count = Math.max(1, Math.floor((length - .8) / wallBaySpan))
        const spacing = (length - .8) / count
        return Array.from(
          {length: count},
          (_, index) => center - (length - .8) / 2 + spacing * (index + .5),
        )
      }

      // Every visible wall is assembled from the authored wall/window/corner
      // GLBs. The procedural room pass contributes collision only.
      libraryRooms.forEach(({floor, x: centerX, z: centerZ, depth, width, doors}) => {
        const baseY = terraceBaseHeight(floor)
        const halfWidth = width / 2
        const halfDepth = depth / 2
        const frontZ = centerZ + depth / 2
        const backZ = centerZ - depth / 2

        if (floorParquet) {
          for (let z = frontZ - 3.1; z > backZ + 2.7; z -= 6.05) {
            for (const x of [-6.05, 0, 6.05]) {
              placeLibraryAsset(floorParquet, centerX + x, baseY + .015, z)
            }
          }
        }

        if (primaryWall) {
          let bay = 0
          for (const side of [-1, 1] as const) {
            const doorway = side < 0 ? 'west' : 'east'
            for (const z of wallBayPositions(centerZ, depth)) {
              if (doors.includes(doorway) && Math.abs(z - centerZ) < 2.8) continue
              const template = bay % 3 === 1 && archedWindow ? archedWindow : primaryWall
              placeLibraryAsset(
                template,
                centerX + side * halfWidth,
                baseY + .08,
                z,
                1,
                side < 0 ? Math.PI / 2 : -Math.PI / 2,
              )
              bay += 1
            }
          }

          for (const side of [-1, 1] as const) {
            const doorway = side < 0 ? 'south' : 'north'
            for (const x of wallBayPositions(centerX, width)) {
              if (doors.includes(doorway) && Math.abs(x - centerX) < 2.8) continue
              const template = bay % 3 === 1 && archedWindow ? archedWindow : primaryWall
              placeLibraryAsset(
                template,
                x,
                baseY + .08,
                centerZ + side * halfDepth,
                1,
                side < 0 ? 0 : Math.PI,
              )
              bay += 1
            }
          }
        }

        if (wallCorner) {
          const cornerInset = .12
          const corners = [
            {x: centerX - halfWidth, z: frontZ - cornerInset, r: Math.PI / 2},
            {x: centerX + halfWidth, z: frontZ - cornerInset, r: Math.PI},
            {x: centerX + halfWidth, z: backZ + cornerInset, r: -Math.PI / 2},
            {x: centerX - halfWidth, z: backZ + cornerInset, r: 0},
          ]
          corners.forEach((corner) =>
            placeLibraryAsset(
              wallCorner,
              corner.x,
              baseY + .08,
              corner.z,
              1,
              corner.r,
            ),
          )
        }

        if (pendantLight) {
          for (let z = frontZ - 7; z > backZ + 5; z -= 10.5) {
            placeLibraryAsset(
              pendantLight,
              centerX,
              baseY + (floor === 0 ? 6.25 : 5.8),
              z,
            )
          }
        }

        // Archive terraces become much denser than the public hall, with
        // free-standing stack rows, ladders, and visible filler books.
        if (floor > 0 && stackShelf) {
          let stackIndex = 0
          for (let z = frontZ - 8; z > backZ + 7; z -= 10.2) {
            for (const side of [-1, 1] as const) {
              const x = centerX + side * 5.9
              const rotationY = side < 0 ? Math.PI : 0
              placeLibraryAsset(stackShelf, x, baseY + .04, z, 1, rotationY)

              const filler = stackIndex % 2 === 0 ? bookPacked : bookLeaning
              if (filler) {
                placeLibraryAsset(
                  filler,
                  x - side * .2,
                  baseY + 1.08,
                  z,
                  .88,
                  rotationY,
                )
                placeLibraryAsset(
                  filler,
                  x - side * .2,
                  baseY + 1.78,
                  z + .08,
                  .82,
                  rotationY,
                )
              }

              if (rollingLadder && stackIndex % 3 === 1) {
                placeLibraryAsset(
                  rollingLadder,
                  x - side * .85,
                  baseY + .03,
                  z + 1.25,
                  .9,
                  rotationY,
                )
              }
              stackIndex += 1
            }
          }
        }
      })

      // The front hall now has distinct functional zones. These props share
      // the same node ids as the UI landmarks, so E / click on the objects
      // opens the corresponding part of the DEV library.
      const publicY = terraceBaseHeight(0)
      if (issueDesk) {
        placeLibraryAsset(
          issueDesk,
          -5.1,
          publicY + .04,
          5.6,
          1,
          Math.PI / 2,
          0,
          'dev-home',
        )
      }
      if (displayCase) {
        placeLibraryAsset(
          displayCase,
          24,
          publicY + .04,
          -7,
          1,
          -Math.PI / 2,
          0,
          'section:featured',
        )
      }
      if (periodicalRack) {
        placeLibraryAsset(
          periodicalRack,
          3,
          publicY + .04,
          -24,
          1,
          -Math.PI / 2,
          0,
          'section:latest',
        )
      }
      if (cardCatalogue) {
        placeLibraryAsset(
          cardCatalogue,
          -24,
          publicY + .04,
          -7,
          .95,
          -Math.PI / 2,
          0,
          'section:topics',
        )
      }

      // These are quiet, furnished rooms off the public circulation rather
      // than furniture squeezed into the main route.
      const readingZones = [
        {x: 3, z: -25, rotation: .08},
        {x: -23, z: -31, rotation: -Math.PI + .08},
      ]
      readingZones.forEach((zone, zoneIndex) => {
        if (readingRug) {
          placeLibraryAsset(
            readingRug,
            zone.x,
            publicY + .025,
            zone.z,
            .92,
            zone.rotation,
          )
        }
        if (readingTable) {
          placeLibraryAsset(
            readingTable,
            zone.x,
            publicY + .04,
            zone.z,
            1,
            zone.rotation,
          )
        }
        if (chair) {
          const chairs = [
            {dx: -1.25, dz: 0, r: Math.PI / 2},
            {dx: 1.25, dz: 0, r: -Math.PI / 2},
            {dx: 0, dz: -1.35, r: 0},
            {dx: 0, dz: 1.35, r: Math.PI},
          ]
          chairs.forEach((seat) =>
            placeLibraryAsset(
              chair,
              zone.x + seat.dx,
              publicY + .04,
              zone.z + seat.dz,
              .96,
              seat.r + zone.rotation,
            ),
          )
        }
        if (floorLamp) {
          placeLibraryAsset(
            floorLamp,
            zone.x + (zoneIndex === 0 ? -1.85 : 1.85),
            publicY + .04,
            zone.z + 1.7,
            .96,
          )
        }
      })

      // A small stack island gives the entry hall depth without competing with
      // the dedicated archive chambers farther up the terraces.
      if (stackShelf) {
        for (const z of [2, 12]) {
          for (const x of [-4.9, 4.9]) {
            const side = x < 0 ? -1 : 1
            const rotationY = side < 0 ? Math.PI : 0
            placeLibraryAsset(stackShelf, x, publicY + .04, z, .96, rotationY)
            const filler = z > 8 ? bookLeaning : bookPacked
            if (filler) {
              placeLibraryAsset(
                filler,
                x - side * .18,
                publicY + 1.12,
                z,
                .82,
                rotationY,
              )
            }
          }
        }
      }

      // Cloud clusters move independently above the terraces. They wrap far
      // outside the playable width so the motion reads as weather, not UI.
      if (summerClouds) {
        for (let index = 0; index < 14; index += 1) {
          const z = 12 - index * 20.5
          const x = -44 + seeded(index, 301) * 88
          const y = 18 + seeded(index, 302) * 9
          const scale = .7 + seeded(index, 303) * 1.15
          const cloud = placeLibraryAsset(
            summerClouds,
            x,
            y,
            z,
            scale,
            seeded(index, 304) * Math.PI * 2,
          )
          movingClouds.push({
            root: cloud,
            speed: .22 + seeded(index, 305) * .32,
            minX: -52 - seeded(index, 306) * 10,
            maxX: 52 + seeded(index, 307) * 10,
          })
        }
      }
    }).finally(completeAssetBatch)

    const keys = new Set<string>()
    const raycaster = new THREE.Raycaster()
    raycaster.far = 6.5
    const center = new THREE.Vector2(0, 0)
    let hoveredId: string | null = null
    let yaw = 0
    let pitch = 0
    let navigationTarget: NavigationTarget | null = null
    let handledTravelNonce = travelRequestRef.current?.nonce ?? -1
    let handledFloorNonce = floorRequestRef.current?.nonce ?? -1
    let frame = 0
    let lastTime = performance.now()
    let previousTerrace = 0
    let previousSection: LibrarySection = 'atrium'
    let raycastCooldown = 0

    const requestNavigation = (node: SurfNode, inspectOnArrival: boolean) => {
      const placement = layout.get(node.id)
      if (!placement) return
      const target = placement.position.clone()
      const side = placement.side
      if (node.kind === 'article' && side !== 0) {
        // Article shelves are anchored to their room, not the world origin.
        target.x = placement.position.x - side * 3
      } else {
        target.z += 2.1
      }
      target.y = groundHeightAtZ(target.z) + CAMERA_HEIGHT
      navigationTarget = {position: target, node, inspectOnArrival}
    }

    const requestTerrace = (floor: number) => {
      const clamped = THREE.MathUtils.clamp(floor, 0, TERRACE_COUNT - 1)
      const z = TERRACE_SPAWN_Z[clamped]
      navigationTarget = {
        position: new THREE.Vector3(0, groundHeightAtZ(z) + CAMERA_HEIGHT, z),
      }
    }

    const onCanvasClick = () => {
      if (selectedRef.current) return
      if (document.pointerLockElement !== renderer.domElement) {
        renderer.domElement.requestPointerLock()
      }
    }

    const onPointerLock = () => {
      const locked = document.pointerLockElement === renderer.domElement
      lockRef.current(locked)
      if (!locked) keys.clear()
    }

    const onMouseMove = (event: MouseEvent) => {
      if (document.pointerLockElement !== renderer.domElement) return
      yaw -= event.movementX * .0021
      pitch -= event.movementY * .0019
      pitch = THREE.MathUtils.clamp(pitch, -1.18, 1.18)
    }

    const onKeyDown = (event: KeyboardEvent) => {
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

      if (event.code === 'KeyE' && !event.repeat) {
        event.preventDefault()
        const selected = selectedRef.current
          ? nodeById.get(selectedRef.current)
          : null
        if (selected?.kind === 'article') {
          putBackRef.current()
          return
        }
        if (hoveredId) {
          const node = nodeById.get(hoveredId)
          if (node) inspectRef.current(node)
        }
      }

      if (event.code === 'KeyF' && !event.repeat) {
        event.preventDefault()
        const routed = routeRef.current
          ? nodeById.get(routeRef.current)
          : null
        const aimed = hoveredId ? nodeById.get(hoveredId) : null
        const targetNode = routed ?? aimed
        if (targetNode) requestNavigation(targetNode, true)
      }

      if (locked && !event.repeat && /^Digit[1-4]$/.test(event.code)) {
        event.preventDefault()
        const floor = Number(event.code.slice(-1)) - 1
        floorChangeRef.current(floor)
        requestTerrace(floor)
      }

      if (
        locked &&
        !event.repeat &&
        (event.code === 'PageUp' || event.code === 'PageDown')
      ) {
        event.preventDefault()
        const delta = event.code === 'PageUp' ? 1 : -1
        const next = THREE.MathUtils.clamp(
          currentFloorRef.current + delta,
          0,
          TERRACE_COUNT - 1,
        )
        floorChangeRef.current(next)
        requestTerrace(next)
      }

      if (event.code === 'Escape') {
        document.exitPointerLock?.()
      }
    }

    const onKeyUp = (event: KeyboardEvent) => {
      keys.delete(event.code)
    }

    renderer.domElement.addEventListener('click', onCanvasClick)
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('pointerlockchange', onPointerLock)
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)

    const resize = () => {
      const width = Math.max(1, host.clientWidth)
      const height = Math.max(1, host.clientHeight)
      camera.aspect = width / height
      camera.updateProjectionMatrix()
      renderer.setSize(width, height, false)
    }
    const resizeObserver = new ResizeObserver(resize)
    resizeObserver.observe(host)
    resize()

    const clockForward = new THREE.Vector3()
    const clockRight = new THREE.Vector3()
    const movement = new THREE.Vector3()
    const yAxis = new THREE.Vector3(0, 1, 0)
    const canOccupy = (x: number, z: number) =>
      !libraryColliders.some(
        (collider) =>
          x >= collider.minX &&
          x <= collider.maxX &&
          z >= collider.minZ &&
          z <= collider.maxZ,
      )

    const animate = (time: number) => {
      frame = requestAnimationFrame(animate)
      const delta = Math.min(.05, Math.max(.001, (time - lastTime) / 1000))
      lastTime = time

      const request = travelRequestRef.current
      if (request && request.nonce !== handledTravelNonce) {
        handledTravelNonce = request.nonce
        const node = nodeById.get(request.id)
        if (node) requestNavigation(node, request.inspectOnArrival)
      }

      const requestedFloor = floorRequestRef.current
      if (requestedFloor && requestedFloor.nonce !== handledFloorNonce) {
        handledFloorNonce = requestedFloor.nonce
        requestTerrace(requestedFloor.floor)
      }

      if (navigationTarget) {
        const distance = camera.position.distanceTo(navigationTarget.position)
        const alpha = 1 - Math.exp(-delta * 3.9)
        camera.position.lerp(navigationTarget.position, alpha)
        if (distance < .16) {
          camera.position.copy(navigationTarget.position)
          const completed = navigationTarget
          navigationTarget = null
          if (completed.node) {
            travelRef.current(completed.node, Boolean(completed.inspectOnArrival))
          }
        }
      } else if (document.pointerLockElement === renderer.domElement && !selectedRef.current) {
        clockForward.set(0, 0, -1).applyAxisAngle(yAxis, yaw)
        clockRight.set(1, 0, 0).applyAxisAngle(yAxis, yaw)
        movement.set(0, 0, 0)
        if (keys.has('KeyW')) movement.add(clockForward)
        if (keys.has('KeyS')) movement.sub(clockForward)
        if (keys.has('KeyD')) movement.add(clockRight)
        if (keys.has('KeyA')) movement.sub(clockRight)
        if (movement.lengthSq() > 0) {
          movement.normalize()
          const speed = keys.has('ShiftLeft') || keys.has('ShiftRight') ? 8.4 : 4.8
          const nextX = THREE.MathUtils.clamp(
            camera.position.x + movement.x * speed * delta,
            -WORLD_HALF_WIDTH,
            WORLD_HALF_WIDTH,
          )
          const nextZ = THREE.MathUtils.clamp(
            camera.position.z + movement.z * speed * delta,
            WORLD_FAR_Z,
            WORLD_NEAR_Z,
          )
          if (canOccupy(nextX, camera.position.z)) {
            camera.position.x = nextX
          }
          if (canOccupy(camera.position.x, nextZ)) {
            camera.position.z = nextZ
          }
        }
      }

      const desiredY = groundHeightAtZ(camera.position.z) + CAMERA_HEIGHT
      camera.position.y = THREE.MathUtils.lerp(camera.position.y, desiredY, 1 - Math.exp(-delta * 12))
      camera.rotation.y = yaw
      camera.rotation.x = pitch
      camera.rotation.z = 0

      const terrace = terraceForZ(camera.position.z)
      if (terrace !== previousTerrace) {
        previousTerrace = terrace
        currentFloorRef.current = terrace
        floorChangeRef.current(terrace)
      }
      const section = sectionForPosition(camera.position.x, camera.position.z, terrace)
      if (section !== previousSection) {
        previousSection = section
        zoneRef.current(section)
      }

      raycastCooldown -= delta
      if (raycastCooldown <= 0 && !selectedRef.current) {
        raycastCooldown = .075
        raycaster.setFromCamera(center, camera)
        const hit = raycaster.intersectObjects(interactive, false)[0]
        const nextHovered = hit && hit.distance <= 6.5 ? String(hit.object.userData.nodeId ?? '') || null : null
        if (nextHovered !== hoveredId) {
          hoveredId = nextHovered
          hoverRef.current(hoveredId ? nodeById.get(hoveredId) ?? null : null)
        }
      } else if (selectedRef.current && hoveredId) {
        hoveredId = null
        hoverRef.current(null)
      }

      bookVisuals.forEach((visual, id) => {
        const active = id === selectedRef.current
        const hot = id === hoveredId
        const pull = active ? 1.0 : hot ? .48 : 0
        const lift = active ? .16 : hot ? .07 : 0
        const targetX = visual.base.x - visual.side * pull
        visual.mesh.position.x = THREE.MathUtils.lerp(visual.mesh.position.x, targetX, 1 - Math.exp(-delta * 14))
        visual.mesh.position.y = THREE.MathUtils.lerp(visual.mesh.position.y, visual.base.y + lift, 1 - Math.exp(-delta * 14))
        visual.mesh.scale.z = THREE.MathUtils.lerp(visual.mesh.scale.z, hot || active ? 1.1 : 1, 1 - Math.exp(-delta * 12))
      })

      const routeId = routeRef.current
      const routePlacement = routeId ? layout.get(routeId) : null
      routeLine.visible = Boolean(routePlacement)
      if (routePlacement) {
        routePositions[0] = camera.position.x
        routePositions[1] = groundHeightAtZ(camera.position.z) + .1
        routePositions[2] = camera.position.z
        routePositions[3] = routePlacement.position.x
        routePositions[4] = groundHeightAtZ(routePlacement.position.z) + .12
        routePositions[5] = routePlacement.position.z
        routeGeometry.attributes.position.needsUpdate = true
      }

      fireflies.rotation.y += delta * .006
      movingClouds.forEach((cloud) => {
        cloud.root.position.x += cloud.speed * delta
        if (cloud.root.position.x > cloud.maxX) {
          cloud.root.position.x = cloud.minX
        }
      })
      if (
        editorExportReady &&
        editorExportRequestRef.current !== handledEditorExportRequest
      ) {
        handledEditorExportRequest = editorExportRequestRef.current
        void exportEditorWorld().catch((error: unknown) => {
          console.error('Unable to export the outdoor library GLB.', error)
        })
      }
      renderer.render(scene, camera)
    }

    frame = requestAnimationFrame(animate)

    return () => {
      disposed = true
      cancelAnimationFrame(frame)
      resizeObserver.disconnect()
      renderer.domElement.removeEventListener('click', onCanvasClick)
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('pointerlockchange', onPointerLock)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      if (document.pointerLockElement === renderer.domElement) document.exitPointerLock?.()
      hoverRef.current(null)
      editorExportReadyRef.current(false)
      environmentRoots.forEach((root) => scene.remove(root))
      libraryRoots.forEach((root) => scene.remove(root))
      importedGeometries.forEach((geometry) => geometry.dispose())
      importedMaterials.forEach((material) => material.dispose())
      dracoLoader.dispose()
      geometries.forEach((geometry) => geometry.dispose())
      materials.forEach((material) => material.dispose())
      textures.forEach((texture) => texture.dispose())
      renderer.dispose()
      if (renderer.domElement.parentElement === host) host.removeChild(renderer.domElement)
    }
  }, [nodes, edges])

  return <div ref={hostRef} className={styles.world} />
}
