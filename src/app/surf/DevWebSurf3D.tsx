'use client'

import {useEffect, useRef} from 'react'
import * as THREE from 'three'
import type {LibrarySection, SurfEdge, SurfNode, SurfNodeKind} from './types'
import styles from './surf.module.css'

type TravelRequest = {
  id: string
  nonce: number
} | null

type Props = {
  nodes: SurfNode[]
  edges: SurfEdge[]
  selectedId: string | null
  routeTargetId: string | null
  travelRequest: TravelRequest
  onInspect: (node: SurfNode) => void
  onTravel: (node: SurfNode) => void
  onHover: (node: SurfNode | null) => void
  onPointerLockChange: (locked: boolean) => void
  onZoneChange: (section: LibrarySection) => void
}

type Visual = {
  group: THREE.Group
  body: THREE.Mesh
  material: THREE.MeshPhysicalMaterial
  label: THREE.Sprite
  labelMaterial: THREE.SpriteMaterial
  bookGlowMaterial?: THREE.MeshBasicMaterial
  bookTitleMaterial?: THREE.MeshBasicMaterial
  baseScale: number
  phase: number
}

const SECTION_CENTERS: Record<LibrarySection, THREE.Vector3> = {
  atrium: new THREE.Vector3(0, 1.6, 8),
  featured: new THREE.Vector3(0, 1.6, -8),
  latest: new THREE.Vector3(-13, 1.6, -12),
  topics: new THREE.Vector3(13, 1.6, -12),
  creators: new THREE.Vector3(13, 1.6, -26),
  search: new THREE.Vector3(-13, 1.6, -26),
  archive: new THREE.Vector3(0, 1.6, -40),
}

const KIND_GEOMETRY: Record<SurfNodeKind, () => THREE.BufferGeometry> = {
  home: () => new THREE.CylinderGeometry(.8, 1.05, .72, 8),
  section: () => new THREE.BoxGeometry(1.6, 2.5, .18),
  profile: () => new THREE.BoxGeometry(1.42, 1.8, .16),
  article: () => new THREE.BoxGeometry(.78, 1.12, .18),
  tag: () => new THREE.BoxGeometry(1.35, 2.15, .14),
  search: () => new THREE.BoxGeometry(1.45, 1.15, .26),
}

function createTextTexture(
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
    const gradient = context.createLinearGradient(40, 0, width - 40, 0)
    gradient.addColorStop(0, 'rgba(5,8,10,0)')
    gradient.addColorStop(.12, 'rgba(5,8,10,.88)')
    gradient.addColorStop(.88, 'rgba(5,8,10,.88)')
    gradient.addColorStop(1, 'rgba(5,8,10,0)')
    context.fillStyle = gradient
    context.fillRect(0, 26, width, height - 52)

    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.shadowColor = accent
    context.shadowBlur = 16
    context.fillStyle = '#f5f5f5'
    context.font = '700 38px system-ui, sans-serif'
    const cleanTitle =
      title.length > 42 ? title.slice(0, 41) + '…' : title
    context.fillText(cleanTitle, width / 2, 105)

    context.shadowBlur = 0
    context.fillStyle = accent
    context.font = '500 18px system-ui, sans-serif'
    const cleanSubtitle =
      subtitle.length > 62 ? subtitle.slice(0, 61) + '…' : subtitle
    context.fillText(cleanSubtitle, width / 2, 155)
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
  canvas.width = 1024
  canvas.height = 460
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
    context.fillRect(0, 0, canvas.width, 16)

    context.fillStyle = 'rgba(255,255,255,.045)'
    for (let x = 40; x < canvas.width; x += 72) {
      context.fillRect(x, 36, 1, canvas.height - 72)
    }

    const words = title.trim().split(/\s+/)
    const lines: string[] = []
    let line = ''

    context.font = '800 58px system-ui, sans-serif'
    for (const word of words) {
      const next = line ? line + ' ' + word : word
      if (context.measureText(next).width > 860 && line) {
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
      context.fillText(rendered, 64, 66 + index * 72)
    })

    context.shadowBlur = 0
    context.fillStyle = '#98a2ff'
    context.font = '600 28px system-ui, sans-serif'
    context.fillText(subtitle, 64, 344)

    context.fillStyle = '#6d7280'
    context.font = '500 20px system-ui, sans-serif'
    context.fillText('DEV // ARTICLE', 64, 392)
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.minFilter = THREE.LinearFilter
  return texture
}

function makeCurve(a: THREE.Vector3, b: THREE.Vector3, lift = .2) {
  const middle = a.clone().lerp(b, .5)
  middle.y = .08 + lift
  return new THREE.QuadraticBezierCurve3(
    new THREE.Vector3(a.x, .09, a.z),
    middle,
    new THREE.Vector3(b.x, .09, b.z),
  )
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
  onTravel,
  onHover,
  onPointerLockChange,
  onZoneChange,
}: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const selectedRef = useRef(selectedId)
  const routeTargetRef = useRef(routeTargetId)
  const travelRequestRef = useRef(travelRequest)
  const inspectRef = useRef(onInspect)
  const travelRef = useRef(onTravel)
  const hoverRef = useRef(onHover)
  const lockRef = useRef(onPointerLockChange)
  const zoneRef = useRef(onZoneChange)

  selectedRef.current = selectedId
  routeTargetRef.current = routeTargetId
  travelRequestRef.current = travelRequest
  inspectRef.current = onInspect
  travelRef.current = onTravel
  hoverRef.current = onHover
  lockRef.current = onPointerLockChange
  zoneRef.current = onZoneChange

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const container = host

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x0d0d0d)
    scene.fog = new THREE.FogExp2(0x111111, .014)

    const camera = new THREE.PerspectiveCamera(68, 1, .05, 140)
    camera.position.set(0, 1.62, 13)

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
    })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5))
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    renderer.domElement.className = styles.canvas
    renderer.domElement.tabIndex = 0
    container.appendChild(renderer.domElement)

    const ambient = new THREE.HemisphereLight(0xd7defd, 0x101010, 1.35)
    scene.add(ambient)

    const key = new THREE.DirectionalLight(0xf5f5f5, 2.65)
    key.position.set(-9, 13, 9)
    key.castShadow = true
    key.shadow.mapSize.set(2048, 2048)
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
    }> = []
    const remoteTextures = new Set<THREE.Texture>()
    const textureLoader = new THREE.TextureLoader()
    textureLoader.setCrossOrigin('anonymous')
    let destroyed = false

    const floorMaterial = new THREE.MeshStandardMaterial({
      color: 0x171717,
      roughness: .78,
      metalness: .12,
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
      color: 0x202020,
      roughness: .7,
      metalness: .22,
    })
    architecturalMaterials.push(shelfMaterial)

    const concrete = new THREE.MeshStandardMaterial({
      color: 0x181818,
      roughness: .92,
      metalness: .04,
    })
    architecturalMaterials.push(concrete)

    function addFloor(
      x: number,
      z: number,
      width: number,
      depth: number,
      material = floorMaterial,
    ) {
      const geometry = new THREE.BoxGeometry(width, .18, depth)
      architecturalGeometries.push(geometry)
      const mesh = new THREE.Mesh(geometry, material)
      mesh.position.set(x, -.11, z)
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
    ) {
      const geometry = new THREE.BoxGeometry(width, height, depth)
      architecturalGeometries.push(geometry)
      const mesh = new THREE.Mesh(geometry, material)
      mesh.position.set(x, height / 2 - .02, z)
      mesh.castShadow = true
      mesh.receiveShadow = true
      scene.add(mesh)
      collisionRects.push({
        minX: x - width / 2,
        maxX: x + width / 2,
        minZ: z - depth / 2,
        maxZ: z + depth / 2,
      })
      return mesh
    }

    function addShelf(
      x: number,
      z: number,
      width: number,
      rotationY = 0,
    ) {
      const group = new THREE.Group()
      group.position.set(x, 0, z)
      group.rotation.y = rotationY

      const sideGeometry = new THREE.BoxGeometry(.18, 3.15, .72)
      const boardGeometry = new THREE.BoxGeometry(width, .12, .72)
      architecturalGeometries.push(sideGeometry, boardGeometry)

      const left = new THREE.Mesh(sideGeometry, shelfMaterial)
      const right = new THREE.Mesh(sideGeometry, shelfMaterial)
      left.position.set(-width / 2, 1.5, 0)
      right.position.set(width / 2, 1.5, 0)
      left.castShadow = right.castShadow = true
      group.add(left, right)

      for (let level = 0; level < 3; level += 1) {
        const board = new THREE.Mesh(boardGeometry, shelfMaterial)
        board.position.set(0, .48 + level * 1.05, 0)
        board.castShadow = true
        board.receiveShadow = true
        group.add(board)
      }

      const top = new THREE.Mesh(boardGeometry, brass)
      top.position.set(0, 3.06, 0)
      top.scale.y = 1.2
      group.add(top)

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
      const texture = createTextTexture(
        sectionLabel(section),
        section === 'atrium' ? 'DEV LIBRARY' : 'DEV COLLECTION',
        accent,
      )
      labelsToDispose.push(texture)
      const material = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        depthWrite: false,
        toneMapped: false,
      })
      architecturalMaterials.push(material)
      const sprite = new THREE.Sprite(material)
      sprite.position.set(x, y, z)
      sprite.scale.set(6.4, 1.6, 1)
      sprite.rotation.y = rotationY
      scene.add(sprite)
      return sprite
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

    const rainCount = 420
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
      size: .025,
      transparent: true,
      opacity: .3,
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

    // Main library architecture.
    addFloor(0, -15, 34, 58)
    addFloor(-13, -13, 16, 28)
    addFloor(13, -13, 16, 28)
    addFloor(0, -39, 18, 12)

    // Atrium shell and central nave. Side walls are segmented so the
    // library has actual doorways into each wing instead of invisible
    // graph-style travel through walls.
    ;[-8.9, 8.9].forEach((x) => {
      addWall(x, 7, .35, 10, 5.8)
      addWall(x, -12.5, .35, 11, 5.8)
      addWall(x, -32.5, .35, 17, 5.8)
    })
    addWall(0, 14.5, 18, .35, 5.8)
    addWall(0, -44.5, 18, .35, 5.8)

    // Wing separators leave intentional door-sized gaps.
    addWall(-13, 1.8, 7.5, .28, 4.6)
    addWall(-13, -29.5, 7.5, .28, 4.6)
    addWall(13, 1.8, 7.5, .28, 4.6)
    addWall(13, -29.5, 7.5, .28, 4.6)

    // Shelves define readable aisles instead of an open node cloud.
    ;[
      [-4.9, -10, 6.6, 0],
      [4.9, -10, 6.6, 0],
      [-4.9, -17, 6.6, 0],
      [4.9, -17, 6.6, 0],
      [-14.8, -10, 5.8, Math.PI / 2],
      [-11.1, -10, 5.8, Math.PI / 2],
      [-14.8, -18, 5.8, Math.PI / 2],
      [-11.1, -18, 5.8, Math.PI / 2],
      [11.1, -10, 5.8, Math.PI / 2],
      [14.8, -10, 5.8, Math.PI / 2],
      [11.1, -18, 5.8, Math.PI / 2],
      [14.8, -18, 5.8, Math.PI / 2],
      [11.1, -25.5, 5.8, Math.PI / 2],
      [14.8, -25.5, 5.8, Math.PI / 2],
      [-14.8, -25.5, 5.8, Math.PI / 2],
      [-11.1, -25.5, 5.8, Math.PI / 2],
      [-4.6, -39.5, 6.2, 0],
      [4.6, -39.5, 6.2, 0],
    ].forEach(([x, z, width, rotation]) =>
      addShelf(
        x as number,
        z as number,
        width as number,
        rotation as number,
      ),
    )

    addSectionSign('atrium', 0, 4.6, 5.5, '#f5f5f5')
    addSectionSign('featured', 0, 4.1, -5.8, '#3b49df')
    addSectionSign('latest', -13, 4.1, -6.6, '#5b6cff')
    addSectionSign('topics', 13, 4.1, -6.6, '#3b49df')
    addSectionSign('creators', 13, 4.1, -21.4, '#7c83ff')
    addSectionSign('search', -13, 4.1, -21.4, '#3b49df')
    addSectionSign('archive', 0, 4.1, -35.5, '#a3a3a3')

    // A retro-futuristic information desk in the atrium.
    const deskGeometry = new THREE.CylinderGeometry(1.5, 1.75, .95, 10)
    architecturalGeometries.push(deskGeometry)
    const desk = new THREE.Mesh(deskGeometry, brass)
    desk.position.set(0, .48, 7)
    desk.castShadow = true
    scene.add(desk)

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

    const visuals = new Map<string, Visual>()
    const interactive: THREE.Object3D[] = []
    const disposableTextures: THREE.Texture[] = []

    nodes.forEach((node, index) => {
      const group = new THREE.Group()
      group.position.set(...node.position)
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

      const body = new THREE.Mesh(KIND_GEOMETRY[node.kind](), material)
      body.userData.nodeId = node.id
      body.castShadow = true
      body.receiveShadow = true
      interactive.push(body)
      group.add(body)

      let bookGlowMaterial: THREE.MeshBasicMaterial | undefined
      let bookTitleMaterial: THREE.MeshBasicMaterial | undefined

      if (node.kind === 'article') {
        material.color.set(0x11131a)
        material.emissive.copy(color.clone().multiplyScalar(.26))
        material.emissiveIntensity = .48
        material.roughness = .34
        material.metalness = .2
        material.clearcoat = .62

        const spineGeometry = new THREE.BoxGeometry(.085, 1.08, .205)
        architecturalGeometries.push(spineGeometry)
        const spineMaterial = new THREE.MeshStandardMaterial({
          color: 0x3b49df,
          emissive: color.clone().lerp(new THREE.Color(0x53d3ff), .45),
          emissiveIntensity: .72,
          roughness: .3,
          metalness: .48,
        })
        architecturalMaterials.push(spineMaterial)
        const spine = new THREE.Mesh(spineGeometry, spineMaterial)
        spine.position.set(-.39, 0, 0)
        group.add(spine)

        const coverGeometry = new THREE.PlaneGeometry(.66, .63)
        architecturalGeometries.push(coverGeometry)
        const coverMaterial = new THREE.MeshBasicMaterial({
          color: 0x161a27,
          transparent: true,
          opacity: .98,
          toneMapped: false,
        })
        architecturalMaterials.push(coverMaterial)
        const cover = new THREE.Mesh(coverGeometry, coverMaterial)
        cover.position.set(.015, .19, .096)
        group.add(cover)

        const remoteCover =
          node.payload?.cover_image ?? node.payload?.social_image ?? null
        if (remoteCover) {
          const proxied =
            '/api/devto?mode=image&url=' +
            encodeURIComponent(remoteCover)
          textureLoader.load(
            proxied,
            (texture) => {
              if (destroyed) {
                texture.dispose()
                return
              }
              texture.colorSpace = THREE.SRGBColorSpace
              texture.minFilter = THREE.LinearFilter
              texture.magFilter = THREE.LinearFilter
              texture.anisotropy = Math.min(
                8,
                renderer.capabilities.getMaxAnisotropy(),
              )
              remoteTextures.add(texture)
              coverMaterial.map = texture
              coverMaterial.color.set(0xffffff)
              coverMaterial.needsUpdate = true
            },
            undefined,
            () => {
              coverMaterial.color.set(0x171b28)
            },
          )
        }

        const titleTexture = createBookTitleTexture(
          node.title,
          '@' + (node.username ?? node.payload?.user.username ?? 'dev'),
          node.accent,
        )
        disposableTextures.push(titleTexture)
        bookTitleMaterial = new THREE.MeshBasicMaterial({
          map: titleTexture,
          transparent: true,
          opacity: .97,
          toneMapped: false,
          depthWrite: false,
        })
        architecturalMaterials.push(bookTitleMaterial)
        const titleGeometry = new THREE.PlaneGeometry(.67, .31)
        architecturalGeometries.push(titleGeometry)
        const titlePanel = new THREE.Mesh(titleGeometry, bookTitleMaterial)
        titlePanel.position.set(.015, -.31, .1)
        group.add(titlePanel)

        const glowGeometry = new THREE.PlaneGeometry(.86, 1.22)
        architecturalGeometries.push(glowGeometry)
        bookGlowMaterial = new THREE.MeshBasicMaterial({
          color: color.clone().lerp(new THREE.Color(0x53d3ff), .3),
          transparent: true,
          opacity: .055,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          side: THREE.DoubleSide,
        })
        architecturalMaterials.push(bookGlowMaterial)
        const glow = new THREE.Mesh(glowGeometry, bookGlowMaterial)
        glow.position.z = -.105
        group.add(glow)

        const edgeGeometry = new THREE.EdgesGeometry(body.geometry, 28)
        architecturalGeometries.push(edgeGeometry)
        const edgeMaterial = new THREE.LineBasicMaterial({
          color: node.accent,
          transparent: true,
          opacity: .45,
          blending: THREE.AdditiveBlending,
        })
        architecturalMaterials.push(edgeMaterial)
        const edges = new THREE.LineSegments(edgeGeometry, edgeMaterial)
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
        const arch = new THREE.Mesh(archGeometry, archMaterial)
        arch.rotation.z = Math.PI
        arch.position.y = node.kind === 'section' ? .7 : .6
        arch.position.z = .12
        group.add(arch)
      }

      const labelTexture = createTextTexture(
        node.title,
        node.subtitle,
        node.accent,
      )
      disposableTextures.push(labelTexture)
      const labelMaterial = new THREE.SpriteMaterial({
        map: labelTexture,
        transparent: true,
        opacity:
          node.kind === 'section' || node.kind === 'home'
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
        node.kind === 'article'
          ? 1.08
          : node.kind === 'profile'
            ? 1.5
            : 1.75,
        0,
      )
      label.scale.set(
        node.kind === 'article' ? 3.55 : 4.7,
        node.kind === 'article' ? .9 : 1.12,
        1,
      )
      group.add(label)

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

      visuals.set(node.id, {
        group,
        body,
        material,
        label,
        labelMaterial,
        bookGlowMaterial,
        bookTitleMaterial,
        baseScale,
        phase: index * .67,
      })
    })

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
      .slice(0, 72)
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
          48,
          edge.kind === 'corridor' ? .052 : .027,
          8,
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
          48,
          edge.kind === 'corridor' ? .105 : .057,
          8,
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

        const packetGeometry = new THREE.SphereGeometry(.035, 10, 10)
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
          glowGeometry,
          glowMaterial,
          packets,
          packetGeometry,
          packetMaterial,
          baseColor,
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
    let activeGuideCurve: THREE.QuadraticBezierCurve3 | null = null

    const raycaster = new THREE.Raycaster()
    const center = new THREE.Vector2(0, 0)
    const keys = new Set<string>()
    const position = camera.position.clone()
    const velocity = new THREE.Vector3()
    const forward = new THREE.Vector3()
    const right = new THREE.Vector3()
    const up = new THREE.Vector3(0, 1, 0)
    const move = new THREE.Vector3()
    const euler = new THREE.Euler(0, 0, 0, 'YXZ')
    let yaw = 0
    let pitch = 0
    let hoverId: string | null = null
    let currentSection: LibrarySection = 'atrium'
    let lastTime = performance.now()
    let frame = 0
    let lastTravelNonce = travelRequestRef.current?.nonce ?? -1

    let travel:
      | {
          source: THREE.Vector3
          control: THREE.Vector3
          target: THREE.Vector3
          node: SurfNode
          startedAt: number
          duration: number
        }
      | null = null

    function pickCenter() {
      raycaster.setFromCamera(center, camera)
      const hit = raycaster.intersectObjects(interactive, false)[0]
      if (!hit) return null
      const nodeId = hit.object.userData.nodeId as string | undefined
      return nodes.find((node) => node.id === nodeId) ?? null
    }

    function startTravel(node: SurfNode) {
      const visual = visuals.get(node.id)
      if (!visual) return

      const source = camera.position.clone()
      const destination = visual.group
        .getWorldPosition(new THREE.Vector3())
        .add(
          new THREE.Vector3(
            node.kind === 'article' ? 0 : 0,
            0,
            node.kind === 'section' ? 2.5 : 1.75,
          ),
        )
      destination.y = 1.62

      const control = source.clone().lerp(destination, .5)
      control.y = 1.9
      control.x += Math.sin(destination.z * .19) * .65

      travel = {
        source,
        control,
        target: destination,
        node,
        startedAt: performance.now() / 1000,
        duration: THREE.MathUtils.clamp(
          source.distanceTo(destination) / 7,
          .75,
          2.3,
        ),
      }
    }

    function collides(next: THREE.Vector3) {
      const radius = .28
      return collisionRects.some(
        (rect) =>
          next.x + radius > rect.minX &&
          next.x - radius < rect.maxX &&
          next.z + radius > rect.minZ &&
          next.z - radius < rect.maxZ,
      )
    }

    function onMouseMove(event: MouseEvent) {
      if (document.pointerLockElement !== renderer.domElement || travel) return
      yaw -= event.movementX * .00165
      pitch -= event.movementY * .0014
      pitch = THREE.MathUtils.clamp(pitch, -.46, .46)
    }

    function onKeyDown(event: KeyboardEvent) {
      keys.add(event.code)

      if (event.code === 'KeyE') {
        event.preventDefault()
        const node = pickCenter()
        if (node) inspectRef.current(node)
      }

      if (event.code === 'KeyF') {
        event.preventDefault()
        const node =
          nodes.find((candidate) => candidate.id === selectedRef.current) ??
          pickCenter()
        if (node) startTravel(node)
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

      const request = travelRequestRef.current
      if (request && request.nonce !== lastTravelNonce) {
        lastTravelNonce = request.nonce
        const node = nodes.find((candidate) => candidate.id === request.id)
        if (node) startTravel(node)
      }

      const aimed = pickCenter()
      const aimedId = aimed?.id ?? null
      if (aimedId !== hoverId) {
        hoverId = aimedId
        hoverRef.current(aimed ?? null)
      }

      visuals.forEach((visual, id) => {
        const selected = selectedRef.current === id
        const hovered = hoverId === id
        const routed = routeTargetRef.current === id
        const targetScale =
          visual.baseScale *
          (selected ? 1.12 : hovered ? 1.06 : routed ? 1.05 : 1)

        visual.group.scale.lerp(
          new THREE.Vector3(targetScale, targetScale, targetScale),
          .08,
        )

        if (visual.body.userData.nodeId?.startsWith('tag:')) {
          visual.group.rotation.y =
            Math.sin(now * .15 + visual.phase) * .025
        }

        visual.material.emissiveIntensity +=
          ((selected ? 1.25 : hovered ? .9 : routed ? .82 : .46) -
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

        visual.labelMaterial.opacity +=
          ((selected || hovered || routed
            ? 1
            : id.startsWith('section:')
              ? .98
              : id.startsWith('profile:') || id.startsWith('tag:')
                ? .82
                : .7) -
            visual.labelMaterial.opacity) *
          .1
      })

      routeVisuals.forEach((routeVisual) => {
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
              ? .34
              : .24) -
            routeVisual.material.opacity) *
          .1
        routeVisual.glowMaterial.opacity +=
          ((active ? .22 : routeVisual.edge.kind === 'corridor' ? .05 : .03) -
            routeVisual.glowMaterial.opacity) *
          .1
        routeVisual.packetMaterial.opacity =
          active ? .98 : .72

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
        activeGuideCurve = makeCurve(
          camera.position,
          destination,
          .03,
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
      } else {
        activeGuideCurve = null
        guideBaseLine.visible = false
        guideLine.visible = false
        guidePackets.forEach((packet) => {
          packet.visible = false
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
        .23 + Math.max(0, Math.sin(now * .72)) * .12

      scanGates.forEach(({mesh, material, phase}) => {
        material.opacity =
          .012 + Math.max(0, Math.sin(now * 1.25 + phase)) * .028
        mesh.position.x = Math.sin(now * .18 + phase) * .14
      })

      netCyan.intensity =
        6.8 + Math.max(0, Math.sin(now * .63)) * 2.2
      netMagenta.intensity =
        3.2 + Math.max(0, Math.sin(now * .47 + 1.1)) * 1.8

      if (travel) {
        const progress = THREE.MathUtils.clamp(
          (now - travel.startedAt) / travel.duration,
          0,
          1,
        )
        const eased = 1 - Math.pow(1 - progress, 3)
        const oneMinus = 1 - eased

        const point = new THREE.Vector3()
          .copy(travel.source)
          .multiplyScalar(oneMinus * oneMinus)
          .addScaledVector(
            travel.control,
            2 * oneMinus * eased,
          )
          .addScaledVector(travel.target, eased * eased)

        const lookProgress = Math.min(1, eased + .025)
        const lookOneMinus = 1 - lookProgress
        const look = new THREE.Vector3()
          .copy(travel.source)
          .multiplyScalar(lookOneMinus * lookOneMinus)
          .addScaledVector(
            travel.control,
            2 * lookOneMinus * lookProgress,
          )
          .addScaledVector(
            travel.target,
            lookProgress * lookProgress,
          )

        position.copy(point)
        camera.position.copy(point)
        camera.lookAt(look)
        camera.fov +=
          ((68 + Math.sin(progress * Math.PI) * 7) - camera.fov) *
          .1
        camera.updateProjectionMatrix()

        if (progress >= 1) {
          euler.setFromQuaternion(camera.quaternion, 'YXZ')
          yaw = euler.y
          pitch = euler.x
          velocity.set(0, 0, 0)
          const arrived = travel.node
          travel = null
          travelRef.current(arrived)
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

        const speed =
          keys.has('ShiftLeft') || keys.has('ShiftRight') ? 6.6 : 3.25
        const desired = move.multiplyScalar(speed)
        velocity.lerp(desired, 1 - Math.exp(-delta * 8))

        const proposed = position.clone().addScaledVector(velocity, delta)
        proposed.y = 1.62
        proposed.x = THREE.MathUtils.clamp(proposed.x, -20, 20)
        proposed.z = THREE.MathUtils.clamp(proposed.z, -43.5, 14)

        if (!collides(proposed)) {
          position.copy(proposed)
        } else {
          velocity.multiplyScalar(.2)
        }

        camera.position.copy(position)
        camera.rotation.order = 'YXZ'
        camera.rotation.y = yaw
        camera.rotation.x = pitch
        camera.rotation.z = THREE.MathUtils.lerp(
          camera.rotation.z,
          -velocity.dot(right) * .0035,
          .08,
        )
        camera.fov +=
          ((68 + Math.min(1, velocity.length() / 6.6) * 3) -
            camera.fov) *
          .06
        camera.updateProjectionMatrix()
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

      visuals.forEach((visual) => {
        ;(visual.body.geometry as THREE.BufferGeometry).dispose()
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
