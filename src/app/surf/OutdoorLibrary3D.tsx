'use client'

import {useEffect, useRef} from 'react'
import * as THREE from 'three'
import {FBXLoader} from 'three/examples/jsm/loaders/FBXLoader.js'
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
const WORLD_NEAR_Z = 18
const WORLD_FAR_Z = -250
const WORLD_HALF_WIDTH = 14
const PATH_HALF_WIDTH = 4.25
const SHELF_X = 7.1
const TERRACE_SPAWN_Z = [9, -79, -141, -203]
const TERRACE_RAMP_START = [-64, -126, -188]
const TERRACE_RAMP_END = [-72, -134, -196]

const SECTION_Z: Record<LibrarySection, number> = {
  atrium: 8,
  featured: -8,
  latest: -19,
  topics: -29,
  creators: -38,
  search: -47,
  archive: -56,
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

function sectionForPosition(z: number, floor: number): LibrarySection {
  if (floor > 0) return 'archive'
  let best: LibrarySection = 'atrium'
  let bestDistance = Number.POSITIVE_INFINITY
  for (const section of SECTION_ORDER) {
    const distance = Math.abs(z - SECTION_Z[section])
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
        position: new THREE.Vector3(0, baseY + 1.55, SECTION_Z[section]),
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
      const anchorZ = floor === 0 ? SECTION_Z[section] : TERRACE_SPAWN_Z[floor]
      layout.set(node.id, {
        position: new THREE.Vector3(side * 3.55, baseY + 1.35, anchorZ - 2.8 - row * 2.15),
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
    const sectionAnchor = floor === 0 ? SECTION_Z[section] - 2.6 : TERRACE_SPAWN_Z[floor] - 6
    const bayCenterZ = sectionAnchor - bay * 5.6
    const z = bayCenterZ + 1.72 - slot * .38
    const x = side * (SHELF_X - .42)
    const shelfKey = `${section}:f${floor}:s${side}:b${bay}`

    layout.set(node.id, {
      position: new THREE.Vector3(x, baseY + .72 + row * .72, z),
      rotationY: 0,
      floor,
      side,
      shelfKey,
      shelfCenter: new THREE.Vector3(side * SHELF_X, baseY + 1.6, bayCenterZ),
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

    const scene = new THREE.Scene()
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

    const terraceSegments = [
      {floor: 0, z: -23, depth: 86},
      {floor: 1, z: -99, depth: 58},
      {floor: 2, z: -161, depth: 58},
      {floor: 3, z: -224, depth: 58},
    ]

    terraceSegments.forEach(({floor, z, depth}) => {
      const ground = new THREE.Mesh(unitBox, grassMaterial)
      ground.scale.set(34, .72, depth)
      ground.position.set(0, terraceBaseHeight(floor) - .38, z)
      ground.receiveShadow = true
      scene.add(ground)

      const leftCliff = new THREE.Mesh(unitBox, cliffMaterial)
      leftCliff.scale.set(4.8, 1.8 + floor * .5, depth)
      leftCliff.position.set(-19.2, terraceBaseHeight(floor) - 1.05, z)
      leftCliff.receiveShadow = true
      scene.add(leftCliff)
      const rightCliff = leftCliff.clone()
      rightCliff.position.x = 19.2
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
    let disposed = false
    const environmentRoots: THREE.Object3D[] = []

    const loadTemplate = async (path: string, target: number, mode: 'height' | 'span') => {
      const group = await loader.loadAsync(path)
      fitTemplate(group, target, mode)
      markEnvironment(group)
      return group
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

      if (terrainA) {
        for (let index = 0; index < 16; index += 1) {
          const side = index % 2 === 0 ? -1 : 1
          const z = 10 - Math.floor(index / 2) * 33
          const clone = cloneAt(terrainA, scene, side * (15.5 + seeded(index, 11) * 5), z, .82 + seeded(index, 12) * .36, seeded(index, 13) * Math.PI * 2, -.22)
          addRoot(clone)
        }
      }

      if (terrainB) {
        for (let index = 0; index < 10; index += 1) {
          const side = index % 2 === 0 ? -1 : 1
          const z = -6 - Math.floor(index / 2) * 52
          const clone = cloneAt(terrainB, scene, side * (24 + seeded(index, 14) * 8), z, .9 + seeded(index, 15) * .42, seeded(index, 16) * Math.PI * 2, -1.2)
          addRoot(clone)
        }
      }

      const treeTemplates = [treeA, treeB].filter((value): value is THREE.Group => Boolean(value))
      if (treeTemplates.length) {
        for (let index = 0; index < 92; index += 1) {
          const z = WORLD_NEAR_Z - 4 - seeded(index, 21) * 258
          const side = index % 2 === 0 ? -1 : 1
          const x = side * (10.8 + seeded(index, 22) * 14)
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
          const clone = cloneAt(bush, scene, x, z, .65 + seeded(index, 33) * .65, seeded(index, 34) * Math.PI * 2)
          addRoot(clone)
        }
      }

      if (rock) {
        for (let index = 0; index < 42; index += 1) {
          const z = WORLD_NEAR_Z - seeded(index, 41) * 260
          const side = index % 2 === 0 ? -1 : 1
          const x = side * (9 + seeded(index, 42) * 9)
          const clone = cloneAt(rock, scene, x, z, .55 + seeded(index, 43) * 1.05, seeded(index, 44) * Math.PI * 2)
          addRoot(clone)
        }
      }

      if (log) {
        for (let index = 0; index < 14; index += 1) {
          const z = 2 - seeded(index, 51) * 238
          const side = index % 2 === 0 ? -1 : 1
          const x = side * (10 + seeded(index, 52) * 5)
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
    })

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
        target.x = side * 3.7
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
          const nextX = THREE.MathUtils.clamp(camera.position.x + movement.x * speed * delta, -WORLD_HALF_WIDTH, WORLD_HALF_WIDTH)
          const nextZ = THREE.MathUtils.clamp(camera.position.z + movement.z * speed * delta, WORLD_FAR_Z, WORLD_NEAR_Z)
          camera.position.x = nextX
          camera.position.z = nextZ
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
      const section = sectionForPosition(camera.position.z, terrace)
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
      environmentRoots.forEach((root) => scene.remove(root))
      geometries.forEach((geometry) => geometry.dispose())
      materials.forEach((material) => material.dispose())
      textures.forEach((texture) => texture.dispose())
      renderer.dispose()
      if (renderer.domElement.parentElement === host) host.removeChild(renderer.domElement)
    }
  }, [nodes, edges])

  return <div ref={hostRef} className={styles.world} />
}