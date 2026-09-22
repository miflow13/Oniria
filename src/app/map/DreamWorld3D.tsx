'use client'

import {useEffect, useMemo, useRef} from 'react'
import * as THREE from 'three'
import {EffectComposer} from 'three/examples/jsm/postprocessing/EffectComposer.js'
import {RenderPass} from 'three/examples/jsm/postprocessing/RenderPass.js'
import {UnrealBloomPass} from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import {BokehPass} from 'three/examples/jsm/postprocessing/BokehPass.js'
import {SSAOPass} from 'three/examples/jsm/postprocessing/SSAOPass.js'
import {ShaderPass} from 'three/examples/jsm/postprocessing/ShaderPass.js'
import {OutputPass} from 'three/examples/jsm/postprocessing/OutputPass.js'
import type {Dream, SymbolCategory} from '@/types/dream'
import styles from './map.module.css'
import {
  getQualitySettings,
  type DreamQuality,
} from './dreamworld/quality'
import {
  createLivingOrbMaterial,
  type LivingOrbMaterial,
} from './dreamworld/materials/orbShader'
import {
  createMiniWorld,
  type MiniWorld,
} from './dreamworld/builders/createMiniWorld'
import {
  createDreamCell,
  type DreamCell,
} from './dreamworld/cells/createDreamCell'
import {
  createSpatialDreamAudio,
  type SpatialDreamAudio,
} from './dreamworld/audio/createSpatialDreamAudio'
import {
  createDreamProfile,
  type DreamProfile,
} from './dreamworld/dreamProfile'
import {
  dreamRecurrence,
  getDreamRelations,
  type DreamRelation,
} from './dreamworld/dreamRelations'
import {
  createDreamMusic,
  type DreamMusic,
} from './dreamworld/audio/createDreamMusic'
import {
  createDreamDive,
  type DreamDive,
} from './dreamworld/dive/createDreamDive'
import {DreamPostShader} from './dreamworld/effects/dreamPostShader'
import {createCinematicEnvironment} from './dreamworld/rendering/createCinematicEnvironment'
import {
  createPortalSceneTransition,
  type PortalSceneTransition,
} from './dreamworld/effects/createPortalSceneTransition'

export type DreamWorldNode = {
  _id: string
  name: string
  category: SymbolCategory
  icon?: string
  x: number
  y: number
  frequency: number
  dreamIds: string[]
  libraryKind?: 'shelf'
  subtitle?: string
  articleCount?: number
  accent?: string
  world?: [number, number, number]
  libraryBooks?: Array<{
    id: string
    title: string
    coverUrl?: string
  }>
}

export type DreamWorldEdge = {
  id: string
  source: string
  target: string
  weight: number
}

type Pan = {
  x: number
  y: number
}

type ProjectionPoint = {
  x: number
  y: number
  visible: boolean
}

type Props = {
  nodes: DreamWorldNode[]
  edges: DreamWorldEdge[]
  positions: Record<string, {x: number; y: number}>
  dreams: Dream[]
  selectedDreamId: string | null
  selectedId: string | null
  activeId: string | null
  focusedIds: Set<string>
  relatedEdgeIds: Set<string>
  zoom: number
  pan: Pan
  quality: DreamQuality
  soundEnabled: boolean
  introStage: number
  diveExitRequest: number
  diveBackRequest: number
  diveTimelineProgress: number
  observatoryMode: boolean
  flightMode: boolean
  onZoomChange: (zoom: number) => void
  onPanChange: (pan: Pan) => void
  onNodeHover: (node: DreamWorldNode | null) => void
  onNodeSelect: (node: DreamWorldNode) => void
  onBookSelect?: (nodeId: string, bookIndex: number) => void
  onBackgroundClick: () => void
  onProjectionChange: (projection: ProjectionPoint | null) => void
  onDiveStateChange: (active: boolean, title?: string) => void
  onDiveDreamChange: (dreamId: string, title: string, depth: number) => void
  onFlightModeChange: (active: boolean) => void
}

type NodeVisual = {
  group: THREE.Group
  shell: THREE.Mesh
  shellMaterial: LivingOrbMaterial
  reflectionShell: THREE.Mesh
  miniWorld: MiniWorld
  glow: THREE.Mesh
  core: THREE.Mesh
  orbit: THREE.Mesh
  shockwave: THREE.Mesh
  label: THREE.Sprite
  baseScale: number
  pulseStartedAt: number
  phase: number
  z: number
}

type BokehUniformMap = {
  focus: {value: number}
  aperture: {value: number}
  maxblur: {value: number}
}

type EdgeVisual = {
  line: THREE.Line
  pulse: THREE.Mesh
  geometry: THREE.BufferGeometry
  positions: Float32Array
  material: THREE.LineBasicMaterial
  source: string
  target: string
  phase: number
  weight: number
}

const CATEGORY_COLORS: Record<SymbolCategory, number> = {
  person: 0xd9a7ff,
  place: 0x84dfd7,
  object: 0x82b8ff,
  feeling: 0xf0a4c7,
  action: 0xc9a8ff,
}

function hashString(value: string) {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function seededUnit(seed: number, salt: number) {
  const value = Math.sin(seed * 12.9898 + salt * 78.233) * 43758.5453
  return value - Math.floor(value)
}

function worldPosition(
  node: DreamWorldNode,
  positions: Record<string, {x: number; y: number}>,
) {
  if (node.world) {
    return new THREE.Vector3(...node.world)
  }

  const point = positions[node._id] ?? {x: node.x * 10, y: node.y * 7}
  const seed = hashString(node._id)
  const z = -1.6 + seededUnit(seed, 19) * 3.2

  const baseX = (point.x - 500) / 54
  const baseY = (350 - point.y) / 54
  const rarityDrift =
    node.frequency <= 1
      ? 1.22
      : node.frequency === 2
        ? 1.08
        : node.frequency >= 4
          ? 0.92
          : 1

  return new THREE.Vector3(
    baseX * rarityDrift,
    baseY * rarityDrift,
    z - (node.frequency <= 1 ? 0.9 : node.frequency >= 4 ? -0.25 : 0),
  )
}

function roundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  context.beginPath()
  context.roundRect(x, y, width, height, radius)
  context.closePath()
}

function createLabelTexture(node: DreamWorldNode) {
  const canvas = document.createElement('canvas')
  canvas.width = 640
  canvas.height = 144
  const context = canvas.getContext('2d')
  if (!context) return new THREE.CanvasTexture(canvas)

  const color = new THREE.Color(
    node.accent ?? CATEGORY_COLORS[node.category],
  )
  const rgb = {
    r: Math.round(color.r * 255),
    g: Math.round(color.g * 255),
    b: Math.round(color.b * 255),
  }

  context.clearRect(0, 0, canvas.width, canvas.height)

  const gradient = context.createLinearGradient(68, 16, 560, 128)
  gradient.addColorStop(0, 'rgba(7, 11, 27, .88)')
  gradient.addColorStop(.72, 'rgba(12, 18, 39, .72)')
  gradient.addColorStop(1, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, .12)`)

  roundedRect(context, 26, 20, 588, 102, 38)
  context.fillStyle = gradient
  context.fill()
  context.strokeStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, .28)`
  context.lineWidth = 2
  context.stroke()

  context.shadowColor = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, .48)`
  context.shadowBlur = 16
  context.fillStyle = '#f1f6ff'
  context.font = '500 31px system-ui, sans-serif'
  context.textBaseline = 'middle'
  context.fillText(node.icon || '✦', 58, 71)

  context.shadowBlur = 0
  context.fillStyle = '#e5ecfb'
  context.font = '600 27px system-ui, sans-serif'
  const title = node.name.length > 25 ? `${node.name.slice(0, 24)}…` : node.name
  context.fillText(title, 110, 61)

  context.fillStyle = 'rgba(170, 183, 210, .82)'
  context.font = '500 17px system-ui, sans-serif'
  context.fillText(
    node.libraryKind === 'shelf'
      ? `${node.articleCount ?? node.frequency} articles · ${node.subtitle ?? 'floating shelf'}`
      : `${node.frequency} dream${node.frequency === 1 ? '' : 's'} · ${node.category}`,
    110,
    92,
  )

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.minFilter = THREE.LinearFilter
  texture.magFilter = THREE.LinearFilter
  return texture
}

function createNebulaTexture(color: string) {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 512
  const context = canvas.getContext('2d')
  if (!context) return new THREE.CanvasTexture(canvas)

  const gradient = context.createRadialGradient(256, 256, 0, 256, 256, 256)
  gradient.addColorStop(0, color)
  gradient.addColorStop(.25, color.replace('0.36', '0.17'))
  gradient.addColorStop(.58, color.replace('0.36', '0.055'))
  gradient.addColorStop(1, 'rgba(0,0,0,0)')
  context.fillStyle = gradient
  context.fillRect(0, 0, 512, 512)

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

function nodeGeometry(category: SymbolCategory) {
  if (category === 'action') return new THREE.OctahedronGeometry(.6, 2)
  if (category === 'feeling') return new THREE.IcosahedronGeometry(.62, 3)
  if (category === 'person') return new THREE.SphereGeometry(.6, 48, 48)
  if (category === 'object') return new THREE.IcosahedronGeometry(.6, 4)
  return new THREE.SphereGeometry(.62, 48, 48)
}

export default function DreamWorld3D({
  nodes,
  edges,
  positions,
  dreams,
  selectedDreamId,
  selectedId,
  activeId,
  focusedIds,
  relatedEdgeIds,
  zoom,
  pan,
  quality,
  soundEnabled,
  introStage,
  diveExitRequest,
  diveBackRequest,
  diveTimelineProgress,
  observatoryMode,
  flightMode,
  onZoomChange,
  onPanChange,
  onNodeHover,
  onNodeSelect,
  onBookSelect,
  onBackgroundClick,
  onProjectionChange,
  onDiveStateChange,
  onDiveDreamChange,
  onFlightModeChange,
}: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const nodeRef = useRef(nodes)
  const positionsRef = useRef(positions)
  const dreamsRef = useRef(dreams)
  const selectedDreamIdRef = useRef(selectedDreamId)
  const selectedRef = useRef(selectedId)
  const activeRef = useRef(activeId)
  const focusedIdsRef = useRef(focusedIds)
  const relatedEdgeIdsRef = useRef(relatedEdgeIds)
  const zoomRef = useRef(zoom)
  const panRef = useRef(pan)
  const onZoomChangeRef = useRef(onZoomChange)
  const onPanChangeRef = useRef(onPanChange)
  const onNodeHoverRef = useRef(onNodeHover)
  const onNodeSelectRef = useRef(onNodeSelect)
  const onBookSelectRef = useRef(onBookSelect)
  const onBackgroundClickRef = useRef(onBackgroundClick)
  const onProjectionChangeRef = useRef(onProjectionChange)
  const qualityRef = useRef(quality)
  const soundEnabledRef = useRef(soundEnabled)
  const introStageRef = useRef(introStage)
  const diveExitRequestRef = useRef(diveExitRequest)
  const diveBackRequestRef = useRef(diveBackRequest)
  const diveTimelineProgressRef = useRef(diveTimelineProgress)
  const observatoryModeRef = useRef(observatoryMode)
  const flightModeRef = useRef(flightMode)
  const onDiveStateChangeRef = useRef(onDiveStateChange)
  const onDiveDreamChangeRef = useRef(onDiveDreamChange)
  const onFlightModeChangeRef = useRef(onFlightModeChange)

  nodeRef.current = nodes
  positionsRef.current = positions
  dreamsRef.current = dreams
  selectedDreamIdRef.current = selectedDreamId
  selectedRef.current = selectedId
  activeRef.current = activeId
  focusedIdsRef.current = focusedIds
  relatedEdgeIdsRef.current = relatedEdgeIds
  zoomRef.current = zoom
  panRef.current = pan
  onZoomChangeRef.current = onZoomChange
  onPanChangeRef.current = onPanChange
  onNodeHoverRef.current = onNodeHover
  onNodeSelectRef.current = onNodeSelect
  onBookSelectRef.current = onBookSelect
  onBackgroundClickRef.current = onBackgroundClick
  onProjectionChangeRef.current = onProjectionChange
  qualityRef.current = quality
  soundEnabledRef.current = soundEnabled
  introStageRef.current = introStage
  diveExitRequestRef.current = diveExitRequest
  diveBackRequestRef.current = diveBackRequest
  diveTimelineProgressRef.current = diveTimelineProgress
  observatoryModeRef.current = observatoryMode
  flightModeRef.current = flightMode
  onDiveStateChangeRef.current = onDiveStateChange
  onDiveDreamChangeRef.current = onDiveDreamChange
  onFlightModeChangeRef.current = onFlightModeChange

  const graphKey = useMemo(
    () =>
      `${quality}::${nodes
        .map(
          (node) =>
            `${node._id}:${node.articleCount ?? 0}:${node.libraryBooks?.map((book) => book.id + ':' + (book.coverUrl ?? '')).join('|') ?? ''}:${node.world?.join(',') ?? ''}`,
        )
        .join('|')}::${edges
        .map((edge) => `${edge.id}:${edge.weight}`)
        .join('|')}::${dreams
        .map(
          (dream) =>
            `${dream._id}:${dream.mood}:${dream.lucid ? 1 : 0}:${hashString(dream.body)}:${(dream.symbols ?? [])
              .map((symbol) => symbol._id)
              .join(',')}`,
        )
        .join('|')}`,
    [dreams, edges, nodes, quality],
  )

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const container: HTMLDivElement = host

    const settings = getQualitySettings(qualityRef.current)

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x030611)
    scene.fog = new THREE.FogExp2(0x07101f, settings.fogDensity)

    const camera = new THREE.PerspectiveCamera(43, 1, 0.05, 80)
    camera.position.set(0, 0, 10.8)

    const listener = new THREE.AudioListener()
    camera.add(listener)

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    })
    renderer.setPixelRatio(
      Math.min(window.devicePixelRatio, settings.pixelRatio),
    )
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 0.94
    renderer.shadowMap.enabled = settings.miniWorldDetail > 0
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    renderer.domElement.className = styles.webglCanvas
    container.appendChild(renderer.domElement)

    const cinematicEnvironment = createCinematicEnvironment(renderer)
    scene.environment = cinematicEnvironment.texture
    scene.environmentIntensity = settings.environmentIntensity

    const composer = new EffectComposer(renderer)
    const renderPass = new RenderPass(scene, camera)
    composer.addPass(renderPass)

    const ssao = new SSAOPass(scene, camera, 1, 1)
    ssao.enabled = settings.ssao
    ssao.kernelRadius = settings.ssaoKernelRadius
    ssao.minDistance = 0.002
    ssao.maxDistance = 0.12
    composer.addPass(ssao)

    const depthOfField = new BokehPass(scene, camera, {
      focus: 10,
      aperture: 0.000035,
      maxblur: settings.maxBlur,
    })
    depthOfField.enabled = false
    composer.addPass(depthOfField)

    const bloom = new UnrealBloomPass(
      new THREE.Vector2(1, 1),
      settings.bloomStrength,
      settings.bloomRadius,
      settings.bloomThreshold,
    )
    composer.addPass(bloom)

    const dreamPost = new ShaderPass(DreamPostShader)
    dreamPost.uniforms.uCinematic.value =
      qualityRef.current === 'cinematic' ? 1 : 0
    dreamPost.uniforms.uIntensity.value =
      qualityRef.current === 'cinematic' ? 0.72 : 0.32
    composer.addPass(dreamPost)
    composer.addPass(new OutputPass())

    scene.add(new THREE.AmbientLight(0x7182b6, 0.75))

    const keyLight = new THREE.DirectionalLight(0xd4e5ff, 2.1)
    keyLight.position.set(-5, 6, 8)
    keyLight.castShadow = renderer.shadowMap.enabled
    keyLight.shadow.mapSize.set(
      qualityRef.current === 'cinematic' ? 2048 : 1024,
      qualityRef.current === 'cinematic' ? 2048 : 1024,
    )
    keyLight.shadow.bias = -0.00015
    keyLight.shadow.normalBias = 0.025
    scene.add(keyLight)

    const violetLight = new THREE.PointLight(0xb791ff, 12, 20, 2)
    violetLight.position.set(-5, 1, 3)
    scene.add(violetLight)

    const cyanLight = new THREE.PointLight(0x72e2df, 11, 20, 2)
    cyanLight.position.set(5, -1, 2)
    scene.add(cyanLight)

    const world = new THREE.Group()
    scene.add(world)

    const farWorld = new THREE.Group()
    scene.add(farWorld)

    const starCount = settings.starCount
    const starPositions = new Float32Array(starCount * 3)
    const starSizes = new Float32Array(starCount)
    for (let index = 0; index < starCount; index += 1) {
      const i = index * 3
      starPositions[i] = (Math.random() - .5) * 34
      starPositions[i + 1] = (Math.random() - .5) * 22
      starPositions[i + 2] = -4 - Math.random() * 22
      starSizes[index] = .4 + Math.random() * 1.4
    }
    const starGeometry = new THREE.BufferGeometry()
    starGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3))
    const starMaterial = new THREE.PointsMaterial({
      color: 0xcfe5ff,
      size: .035,
      transparent: true,
      opacity: .86,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
    const stars = new THREE.Points(starGeometry, starMaterial)
    farWorld.add(stars)

    const nebulaTextures = [
      createNebulaTexture('rgba(108, 76, 181, 0.36)'),
      createNebulaTexture('rgba(59, 174, 181, 0.36)'),
      createNebulaTexture('rgba(91, 113, 194, 0.36)'),
      createNebulaTexture('rgba(207, 93, 183, 0.36)'),
    ]

    const nebulae: THREE.Sprite[] = []
    nebulaTextures.forEach((texture, index) => {
      const material = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        opacity: .34,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
      const sprite = new THREE.Sprite(material)
      sprite.position.set(
        [-6, 4.8, 1.8, -2.4][index],
        [3, 2.2, -3.5, -1.2][index],
        -5 - index * 1.7,
      )
      const scale = 9 + index * 2.2
      sprite.scale.set(scale * 1.55, scale, 1)
      farWorld.add(sprite)
      nebulae.push(sprite)
    })

    const fragmentMaterial = new THREE.MeshStandardMaterial({
      color: 0x111a2c,
      roughness: .86,
      metalness: .12,
      emissive: 0x10172b,
      emissiveIntensity: .32,
    })

    const fragments: THREE.Mesh[] = []
    for (let index = 0; index < settings.debrisCount; index += 1) {
      const geometry =
        index % 2 === 0
          ? new THREE.IcosahedronGeometry(.12 + Math.random() * .22, 0)
          : new THREE.TetrahedronGeometry(.12 + Math.random() * .2, 0)
      const fragment = new THREE.Mesh(geometry, fragmentMaterial)
      fragment.position.set(
        (Math.random() - .5) * 24,
        (Math.random() - .5) * 14,
        -1.5 - Math.random() * 14,
      )
      fragment.rotation.set(Math.random() * 4, Math.random() * 4, Math.random() * 4)
      const scale = .8 + Math.random() * 2.1
      fragment.scale.setScalar(scale)
      farWorld.add(fragment)
      fragments.push(fragment)
    }

    const landmarkGeometries: THREE.BufferGeometry[] = []
    const landmarkMaterials: THREE.Material[] = []
    const landmarks: THREE.Group[] = []

    const landmarkMaterial = new THREE.MeshStandardMaterial({
      color: 0x283453,
      emissive: 0x19233f,
      emissiveIntensity: 0.38,
      roughness: 0.78,
      metalness: 0.18,
      transparent: true,
      opacity: 0.34,
    })
    const landmarkGlow = new THREE.MeshBasicMaterial({
      color: 0x8bc9d8,
      transparent: true,
      opacity: 0.1,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
    landmarkMaterials.push(landmarkMaterial, landmarkGlow)

    const brokenRing = new THREE.Group()
    const ringGeometry = new THREE.TorusGeometry(2.5, 0.055, 8, 100, Math.PI * 1.58)
    const ring = new THREE.Mesh(ringGeometry, landmarkMaterial)
    ring.rotation.set(0.7, -0.3, 0.2)
    brokenRing.add(ring)
    const ringGlowGeometry = new THREE.TorusGeometry(2.52, 0.012, 6, 100, Math.PI * 1.58)
    const ringGlow = new THREE.Mesh(ringGlowGeometry, landmarkGlow)
    ringGlow.rotation.copy(ring.rotation)
    brokenRing.add(ringGlow)
    landmarkGeometries.push(ringGeometry, ringGlowGeometry)
    brokenRing.position.set(-7.8, 3.4, -12)
    farWorld.add(brokenRing)
    landmarks.push(brokenRing)

    const monoliths = new THREE.Group()
    for (let index = 0; index < 5; index += 1) {
      const geometry = new THREE.BoxGeometry(
        0.42 + index * 0.05,
        1.7 + index * 0.42,
        0.34,
      )
      const monolith = new THREE.Mesh(geometry, landmarkMaterial)
      monolith.position.set(
        (index - 2) * 0.78,
        -0.4 + index * 0.17,
        -Math.abs(index - 2) * 0.18,
      )
      monolith.rotation.z = (index - 2) * 0.07
      monoliths.add(monolith)
      landmarkGeometries.push(geometry)
    }
    monoliths.position.set(8.6, -2.2, -15)
    monoliths.rotation.y = -0.5
    farWorld.add(monoliths)
    landmarks.push(monoliths)

    const impossibleStairs = new THREE.Group()
    for (let index = 0; index < 10; index += 1) {
      const geometry = new THREE.BoxGeometry(0.72, 0.09, 0.28)
      const step = new THREE.Mesh(geometry, landmarkMaterial)
      step.position.set(
        index * 0.46,
        index * 0.24,
        Math.sin(index * 0.72) * 0.44,
      )
      step.rotation.y = index * 0.17
      impossibleStairs.add(step)
      landmarkGeometries.push(geometry)
    }
    impossibleStairs.position.set(1.8, 4.9, -13)
    impossibleStairs.rotation.z = -0.12
    farWorld.add(impossibleStairs)
    landmarks.push(impossibleStairs)

    const foregroundFogTextures = [
      createNebulaTexture('rgba(166, 193, 218, 0.36)'),
      createNebulaTexture('rgba(118, 172, 189, 0.36)'),
    ]
    const foregroundFog: THREE.Sprite[] = foregroundFogTextures.map((texture, index) => {
      const material = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        opacity: index === 0 ? 0.045 : 0.035,
        depthWrite: false,
        blending: THREE.NormalBlending,
      })
      const sprite = new THREE.Sprite(material)
      sprite.position.set(index === 0 ? -4 : 5, index === 0 ? -1.8 : 2.4, 4.6 - index)
      sprite.scale.set(index === 0 ? 13 : 11, index === 0 ? 8 : 7, 1)
      sprite.renderOrder = 5
      scene.add(sprite)
      return sprite
    })

    const nearDustCount =
      qualityRef.current === 'cinematic'
        ? 180
        : qualityRef.current === 'high'
          ? 110
          : qualityRef.current === 'medium'
            ? 64
            : 24
    const nearDustPositions = new Float32Array(nearDustCount * 3)
    for (let index = 0; index < nearDustCount; index += 1) {
      const offset = index * 3
      nearDustPositions[offset] = (seededUnit(index + 211, 1) - .5) * 18
      nearDustPositions[offset + 1] = (seededUnit(index + 211, 2) - .5) * 11
      nearDustPositions[offset + 2] = 1.6 + seededUnit(index + 211, 3) * 7.4
    }
    const nearDustGeometry = new THREE.BufferGeometry()
    nearDustGeometry.setAttribute(
      'position',
      new THREE.BufferAttribute(nearDustPositions, 3),
    )
    const nearDustMaterial = new THREE.PointsMaterial({
      color: 0xd9eef3,
      size: qualityRef.current === 'cinematic' ? .026 : .02,
      transparent: true,
      opacity: .18,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
    const nearDust = new THREE.Points(nearDustGeometry, nearDustMaterial)
    nearDust.renderOrder = 7
    scene.add(nearDust)

    const shaftGeometries: THREE.BufferGeometry[] = []
    const shaftMaterials: THREE.Material[] = []
    const worldLightShafts: THREE.Mesh[] = []
    for (let index = 0; index < Math.max(2, settings.atmosphereLayers - 1); index += 1) {
      const geometry = new THREE.CylinderGeometry(
        .18 + index * .08,
        1.8 + index * .45,
        13 + index * 2,
        28,
        1,
        true,
      )
      const material = new THREE.MeshBasicMaterial({
        color: index % 2 ? 0x8bded9 : 0xb69ce7,
        transparent: true,
        opacity: .012 + index * .004,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
      const shaft = new THREE.Mesh(geometry, material)
      shaft.position.set(
        -7 + index * 6.5,
        2 + index * .8,
        -10 - index * 2.2,
      )
      shaft.rotation.z = -.22 + index * .11
      farWorld.add(shaft)
      shaftGeometries.push(geometry)
      shaftMaterials.push(material)
      worldLightShafts.push(shaft)
    }

    const nodeVisuals = new Map<string, NodeVisual>()
    const interactive: THREE.Object3D[] = []
    type LibraryBookVisual = {
      nodeId: string
      index: number
      group: THREE.Group
      coverHinge: THREE.Group
      basePosition: THREE.Vector3
    }
    const libraryBookVisuals: LibraryBookVisual[] = []
    const bookInteractives: THREE.Object3D[] = []
    let hoveredBook: LibraryBookVisual | null = null
    let openingBook:
      | {
          visual: LibraryBookVisual
          startedAt: number
          fired: boolean
        }
      | null = null

    // Reusable shelf kit for cinematic library mode.
    const shelfSideGeometry = new THREE.BoxGeometry(.18, 2.65, .56)
    const shelfBoardGeometry = new THREE.BoxGeometry(3.45, .12, .62)
    const shelfBackGeometry = new THREE.BoxGeometry(3.45, 2.65, .1)
    const shelfBookGeometry = new THREE.BoxGeometry(.92, .58, .1)
    const shelfCoverGeometry = new THREE.PlaneGeometry(.84, .5)
    const shelfAccentGeometry = new THREE.BoxGeometry(3.34, .035, .68)
    const shelfPickGeometry = new THREE.BoxGeometry(3.8, 2.9, .95)
    const shelfFrameMaterial = new THREE.MeshStandardMaterial({
      color: 0x080b11,
      emissive: 0x000000,
      emissiveIntensity: 0,
      roughness: .94,
      metalness: .08,
      envMapIntensity: settings.environmentIntensity * .34,
    })
    const shelfBoardMaterial = new THREE.MeshStandardMaterial({
      color: 0x111722,
      emissive: 0x020307,
      emissiveIntensity: .02,
      roughness: .9,
      metalness: .06,
      envMapIntensity: settings.environmentIntensity * .38,
    })
    const shelfBookMaterials = [
      new THREE.MeshStandardMaterial({
        color: 0x26336f,
        emissive: 0x050714,
        emissiveIntensity: .025,
        roughness: .86,
      }),
      new THREE.MeshStandardMaterial({
        color: 0x24505a,
        emissive: 0x041013,
        emissiveIntensity: .025,
        roughness: .88,
      }),
      new THREE.MeshStandardMaterial({
        color: 0x4c3b70,
        emissive: 0x0d0814,
        emissiveIntensity: .02,
        roughness: .88,
      }),
      new THREE.MeshStandardMaterial({
        color: 0x656b78,
        emissive: 0x08090b,
        emissiveIntensity: .01,
        roughness: .9,
      }),
      new THREE.MeshStandardMaterial({
        color: 0x171b24,
        emissive: 0x020306,
        emissiveIntensity: .01,
        roughness: .92,
      }),
    ]
    const shelfAccentMaterial = new THREE.MeshBasicMaterial({
      color: 0x5263c8,
      transparent: true,
      opacity: .07,
      blending: THREE.NormalBlending,
      depthWrite: false,
      toneMapped: true,
    })
    const shelfCoverMaterials: THREE.MeshStandardMaterial[] = []
    const shelfCoverTextures: THREE.Texture[] = []
    const shelfTextureLoader = new THREE.TextureLoader()
    shelfTextureLoader.setCrossOrigin('anonymous')
    const shelfPickMaterial = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0,
      depthWrite: false,
    })

    for (const node of nodeRef.current) {
      const seed = hashString(node._id)
      const color = new THREE.Color(
        node.accent ?? CATEGORY_COLORS[node.category],
      )
      const group = new THREE.Group()
      group.userData.nodeId = node._id

      const shellMaterial = createLivingOrbMaterial(color, node.category)
      const shell = new THREE.Mesh(nodeGeometry(node.category), shellMaterial)
      shell.userData.nodeId = node._id
      shell.castShadow = renderer.shadowMap.enabled
      shell.receiveShadow = renderer.shadowMap.enabled
      group.add(shell)
      if (node.libraryKind !== 'shelf') {
        interactive.push(shell)
      }

      const reflectionMaterial = new THREE.MeshPhysicalMaterial({
        color: color.clone().lerp(new THREE.Color(0xffffff), .16),
        roughness: .055,
        metalness: .02,
        transmission: .34,
        thickness: .42,
        ior: 1.22,
        clearcoat: 1,
        clearcoatRoughness: .045,
        envMapIntensity: settings.environmentIntensity * 1.18,
        transparent: true,
        opacity: .14,
        depthWrite: false,
      })
      const reflectionShell = new THREE.Mesh(
        nodeGeometry(node.category),
        reflectionMaterial,
      )
      reflectionShell.scale.setScalar(1.035)
      reflectionShell.renderOrder = 4
      group.add(reflectionShell)

      const miniWorld = createMiniWorld(
        node.category,
        color,
        settings,
        seed,
      )
      miniWorld.group.position.z = 0.02
      group.add(miniWorld.group)

      const glowMaterial = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: .12,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.BackSide,
      })
      const glow = new THREE.Mesh(nodeGeometry(node.category), glowMaterial)
      glow.scale.setScalar(1.28)
      glow.userData.nodeId = node._id
      group.add(glow)

      const coreMaterial = new THREE.MeshPhysicalMaterial({
        color: color.clone().lerp(new THREE.Color(0xffffff), .2),
        emissive: color,
        emissiveIntensity: 2.25,
        transparent: true,
        opacity: .9,
        roughness: .24,
        metalness: node.category === 'object' ? .24 : .08,
        clearcoat: .55,
        clearcoatRoughness: .12,
        envMapIntensity: settings.environmentIntensity,
      })
      const core = new THREE.Mesh(
        new THREE.IcosahedronGeometry(.22 + Math.min(node.frequency, 5) * .025, 2),
        coreMaterial,
      )
      core.userData.nodeId = node._id
      core.castShadow = renderer.shadowMap.enabled
      core.receiveShadow = renderer.shadowMap.enabled
      group.add(core)

      const orbitMaterial = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: .18,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
      const orbit = new THREE.Mesh(
        new THREE.TorusGeometry(.79, .008, 6, 80),
        orbitMaterial,
      )
      orbit.rotation.x = Math.PI * .54
      group.add(orbit)

      const shockwaveMaterial = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
      const shockwave = new THREE.Mesh(
        new THREE.RingGeometry(.7, .735, 72),
        shockwaveMaterial,
      )
      shockwave.visible = false
      shockwave.renderOrder = 6
      group.add(shockwave)

      const labelTexture = createLabelTexture(node)
      const labelMaterial = new THREE.SpriteMaterial({
        map: labelTexture,
        transparent: true,
        depthWrite: false,
        opacity: node.frequency >= 3 ? .52 : .24,
      })
      const label = new THREE.Sprite(labelMaterial)
      label.position.set(0, -.94, .05)
      label.scale.set(2.2, .5, 1)
      group.add(label)

      if (node.libraryKind === 'shelf') {
        shell.visible = false
        reflectionShell.visible = false
        miniWorld.group.visible = false
        glow.visible = false
        core.visible = false
        orbit.visible = false

        const shelf = new THREE.Group()
        shelf.rotation.y = 0

        ;[-1.64, 1.64].forEach((x) => {
          const side = new THREE.Mesh(
            shelfSideGeometry,
            shelfFrameMaterial,
          )
          side.position.set(x, 0, 0)
          shelf.add(side)
        })

        const back = new THREE.Mesh(
          shelfBackGeometry,
          shelfFrameMaterial,
        )
        back.position.z = .28
        shelf.add(back)

        ;[-1.28, -.43, .42, 1.27].forEach((y) => {
          const board = new THREE.Mesh(
            shelfBoardGeometry,
            shelfBoardMaterial,
          )
          board.position.set(0, y, 0)
          shelf.add(board)
        })

        ;(node.libraryBooks ?? []).slice(0, 9).forEach(
          (bookData, index) => {
            const row = Math.floor(index / 3)
            const column = index % 3
            const bookGroup = new THREE.Group()
            const basePosition = new THREE.Vector3(
              -1.08 + column * 1.08,
              -.84 + row * .84,
              -.235,
            )
            bookGroup.position.copy(basePosition)

            const backing = new THREE.Mesh(
              shelfBookGeometry,
              shelfBookMaterials[
                (seed + index * 7) % shelfBookMaterials.length
              ],
            )
            backing.scale.set(
              1,
              .94 + seededUnit(seed, index + 90) * .06,
              1,
            )
            backing.userData.bookNodeId = node._id
            backing.userData.bookIndex = index
            bookGroup.add(backing)
            bookInteractives.push(backing)

            const coverHinge = new THREE.Group()
            coverHinge.position.set(-.46, 0, -.056)
            bookGroup.add(coverHinge)

            const coverMaterial = new THREE.MeshStandardMaterial({
              color: 0x555b67,
              roughness: .98,
              metalness: 0,
              emissive: 0x000000,
              emissiveIntensity: 0,
              side: THREE.DoubleSide,
              toneMapped: true,
            })
            shelfCoverMaterials.push(coverMaterial)

            if (bookData.coverUrl) {
              shelfTextureLoader.load(
                bookData.coverUrl,
                (texture) => {
                  texture.colorSpace = THREE.SRGBColorSpace
                  texture.minFilter = THREE.LinearFilter
                  texture.magFilter = THREE.LinearFilter
                  texture.anisotropy = Math.min(
                    4,
                    renderer.capabilities.getMaxAnisotropy(),
                  )
                  shelfCoverTextures.push(texture)
                  coverMaterial.map = texture
                  coverMaterial.color.setRGB(.62, .62, .66)
                  coverMaterial.needsUpdate = true
                },
                undefined,
                () => {
                  coverMaterial.color.setHex(0x303746)
                },
              )
            }

            const cover = new THREE.Mesh(
              shelfCoverGeometry,
              coverMaterial,
            )
            cover.position.set(.42, 0, -.002)
            cover.rotation.y = Math.PI
            cover.renderOrder = 5
            cover.userData.bookNodeId = node._id
            cover.userData.bookIndex = index
            coverHinge.add(cover)
            bookInteractives.push(cover)

            shelf.add(bookGroup)
            libraryBookVisuals.push({
              nodeId: node._id,
              index,
              group: bookGroup,
              coverHinge,
              basePosition,
            })
          },
        )

        const accentRail = new THREE.Mesh(
          shelfAccentGeometry,
          shelfAccentMaterial,
        )
        accentRail.position.set(0, 1.34, -.02)
        shelf.add(accentRail)

        const pick = new THREE.Mesh(
          shelfPickGeometry,
          shelfPickMaterial,
        )
        pick.userData.nodeId = node._id
        shelf.add(pick)
        interactive.push(pick)

        shelf.scale.setScalar(1)
        group.add(shelf)
        label.position.set(0, -1.75, .18)
        label.scale.set(2.65, .58, 1)
      }

      const start = worldPosition(node, positionsRef.current)
      group.position.copy(start)

      const baseScale =
        node.libraryKind === 'shelf'
          ? 1.22
          : .72 +
            Math.min(node.frequency, 6) * .095 +
            Math.min(
              0.18,
              Math.max(0, node.frequency - 2) * .035,
            )
      group.scale.setScalar(baseScale)
      world.add(group)

      nodeVisuals.set(node._id, {
        group,
        shell,
        shellMaterial,
        reflectionShell,
        miniWorld,
        glow,
        core,
        orbit,
        shockwave,
        label,
        baseScale,
        pulseStartedAt: -1,
        phase: seededUnit(seed, 31) * Math.PI * 2,
        z: start.z,
      })
    }

    const nodeDataById = new Map(nodeRef.current.map((node) => [node._id, node]))
    const newestDreamTime = Math.max(
      ...dreamsRef.current.map((dream) => new Date(dream.date).getTime()),
      Date.now(),
    )
    const nodeMemoryAge = new Map(
      nodeRef.current.map((node) => {
        const times = dreamsRef.current
          .filter((dream) => node.dreamIds.includes(dream._id))
          .map((dream) => new Date(dream.date).getTime())
        const averageTime =
          times.length > 0
            ? times.reduce((sum, value) => sum + value, 0) / times.length
            : newestDreamTime
        const ageDays = Math.max(0, (newestDreamTime - averageTime) / 86_400_000)
        const normalizedAge = Math.min(1, Math.log2(ageDays + 1) / 7)
        return [node._id, normalizedAge] as const
      }),
    )
    const introWakeOrder = new Map(
      [...nodeRef.current]
        .sort(
          (a, b) =>
            b.frequency - a.frequency ||
            hashString(a._id) - hashString(b._id),
        )
        .map((node, index) => [node._id, index]),
    )

    const gravityParents = new Map<
      string,
      {parentId: string; influence: number; radius: number; phase: number}
    >()

    for (const node of nodeRef.current) {
      const candidates = edges
        .filter((edge) => edge.source === node._id || edge.target === node._id)
        .map((edge) => {
          const otherId = edge.source === node._id ? edge.target : edge.source
          const other = nodeDataById.get(otherId)
          return other ? {other, edge} : null
        })
        .filter(
          (
            value,
          ): value is {
            other: DreamWorldNode
            edge: DreamWorldEdge
          } => Boolean(value),
        )
        .filter(
          ({other}) =>
            other.frequency >= 2 &&
            other.frequency > node.frequency,
        )
        .sort(
          (a, b) =>
            b.other.frequency * 2 +
            b.edge.weight -
            (a.other.frequency * 2 + a.edge.weight),
        )

      const strongest = candidates[0]
      if (strongest) {
        const seed = hashString(`${node._id}:${strongest.other._id}`)
        gravityParents.set(node._id, {
          parentId: strongest.other._id,
          influence: Math.min(
            .62,
            .18 +
              strongest.edge.weight * .08 +
              (strongest.other.frequency - node.frequency) * .055,
          ),
          radius:
            1.15 +
            seededUnit(seed, 9) * 1.35 +
            Math.max(0, 3 - strongest.edge.weight) * .12,
          phase: seededUnit(seed, 12) * Math.PI * 2,
        })
      }
    }

    function getDreamForNode(node: DreamWorldNode) {
      const preferredId = selectedDreamIdRef.current
      if (preferredId && node.dreamIds.includes(preferredId)) {
        const preferred = dreamsRef.current.find(
          (dream) => dream._id === preferredId,
        )
        if (preferred) return preferred
      }

      return [...dreamsRef.current]
        .filter((dream) => node.dreamIds.includes(dream._id))
        .sort(
          (a, b) =>
            new Date(b.date).getTime() - new Date(a.date).getTime(),
        )[0] ?? null
    }

    function getProfileForNode(node: DreamWorldNode): DreamProfile | null {
      const dream = getDreamForNode(node)
      return dream
        ? createDreamProfile(dream, Math.max(1, node.frequency))
        : null
    }

    const secretArtifacts: Array<{
      group: THREE.Group
      nodeId: string
      geometries: THREE.BufferGeometry[]
      materials: THREE.Material[]
      phase: number
    }> = []

    for (const node of nodeRef.current) {
      const profile = getProfileForNode(node)
      const visual = nodeVisuals.get(node._id)
      if (!profile?.secret || !visual) continue

      const group = new THREE.Group()
      const geometries: THREE.BufferGeometry[] = []
      const materials: THREE.Material[] = []
      const accent = new THREE.Color(CATEGORY_COLORS[node.category])
      const phase = seededUnit(hashString(`secret:${node._id}`), 55) * Math.PI * 2

      if (profile.secret === 'black-monolith') {
        const geometry = new THREE.BoxGeometry(.18, .92, .12)
        const material = new THREE.MeshStandardMaterial({
          color: 0x010104,
          emissive: accent.clone().multiplyScalar(.04),
          emissiveIntensity: .24,
          roughness: .08,
          metalness: .84,
        })
        const monolith = new THREE.Mesh(geometry, material)
        group.add(monolith)
        geometries.push(geometry)
        materials.push(material)
      } else if (profile.secret === 'eclipse') {
        const coronaGeometry = new THREE.TorusGeometry(.34, .028, 8, 56)
        const coronaMaterial = new THREE.MeshBasicMaterial({
          color: accent.clone().lerp(new THREE.Color(0xffffff), .35),
          transparent: true,
          opacity: .32,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
        const darkGeometry = new THREE.SphereGeometry(.28, 24, 24)
        const darkMaterial = new THREE.MeshBasicMaterial({color: 0x000106})
        group.add(
          new THREE.Mesh(coronaGeometry, coronaMaterial),
          new THREE.Mesh(darkGeometry, darkMaterial),
        )
        geometries.push(coronaGeometry, darkGeometry)
        materials.push(coronaMaterial, darkMaterial)
      } else if (profile.secret === 'impossible-door') {
        const material = new THREE.MeshStandardMaterial({
          color: accent.clone().multiplyScalar(.45),
          emissive: accent.clone().multiplyScalar(.12),
          emissiveIntensity: .72,
          roughness: .52,
          transparent: true,
          opacity: .62,
        })
        materials.push(material)
        const leftGeometry = new THREE.BoxGeometry(.045, .58, .045)
        const rightGeometry = leftGeometry.clone()
        const topGeometry = new THREE.BoxGeometry(.42, .045, .045)
        const left = new THREE.Mesh(leftGeometry, material)
        const right = new THREE.Mesh(rightGeometry, material)
        const top = new THREE.Mesh(topGeometry, material)
        left.position.x = -.19
        right.position.x = .19
        top.position.y = .27
        group.add(left, right, top)
        geometries.push(leftGeometry, rightGeometry, topGeometry)
      } else {
        const material = new THREE.MeshBasicMaterial({
          color: accent,
          transparent: true,
          opacity: .34,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
        materials.push(material)
        const animalPoints = [
          [-.34, 0, 0],
          [-.16, .24, -.03],
          [.05, .1, .02],
          [.24, .28, -.04],
          [.36, .02, 0],
          [.1, -.22, .02],
          [-.12, -.24, -.02],
        ]
        const lineGeometry = new THREE.BufferGeometry().setFromPoints(
          animalPoints.map(
            ([x, y, z]) => new THREE.Vector3(x, y, z),
          ),
        )
        const lineMaterial = new THREE.LineBasicMaterial({
          color: accent,
          transparent: true,
          opacity: .22,
        })
        group.add(new THREE.Line(lineGeometry, lineMaterial))
        geometries.push(lineGeometry)
        materials.push(lineMaterial)
        for (const [x, y, z] of animalPoints) {
          const geometry = new THREE.SphereGeometry(.025, 10, 10)
          const star = new THREE.Mesh(geometry, material)
          star.position.set(x, y, z)
          group.add(star)
          geometries.push(geometry)
        }
      }

      group.position.set(
        1.15 + seededUnit(hashString(node._id), 61) * .75,
        .4 + seededUnit(hashString(node._id), 62) * .8,
        -.4,
      )
      group.scale.setScalar(.78)
      visual.group.add(group)
      secretArtifacts.push({
        group,
        nodeId: node._id,
        geometries,
        materials,
        phase,
      })
    }

    const categoryNebulae = (Object.keys(CATEGORY_COLORS) as SymbolCategory[])
      .map((category, index) => {
        const categoryNodes = nodeRef.current.filter(
          (node) => node.category === category,
        )
        if (!categoryNodes.length) return null

        const center = categoryNodes.reduce(
          (sum, node) => {
            const position = nodeVisuals.get(node._id)?.group.position
            if (position) sum.add(position)
            return sum
          },
          new THREE.Vector3(),
        )
        center.divideScalar(Math.max(1, categoryNodes.length))

        const color = new THREE.Color(CATEGORY_COLORS[category])
        const css = `rgba(${Math.round(color.r * 255)}, ${Math.round(
          color.g * 255,
        )}, ${Math.round(color.b * 255)}, 0.36)`
        const texture = createNebulaTexture(css)
        const material = new THREE.SpriteMaterial({
          map: texture,
          transparent: true,
          opacity: .018,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
        const sprite = new THREE.Sprite(material)
        sprite.position.copy(center)
        sprite.position.z -= 2.5 + index * .22
        const size = 4.5 + Math.min(categoryNodes.length, 5) * .7
        sprite.scale.set(size * 1.45, size, 1)
        scene.add(sprite)

        return {sprite, material, texture, phase: index * 1.7}
      })
      .filter(
        (value): value is NonNullable<typeof value> => value !== null,
      )

    const lucidDreamIds = new Set(
      dreamsRef.current
        .filter((dream) => dream.lucid)
        .map((dream) => dream._id),
    )
    const lucidRiverNodeIds = nodeRef.current
      .filter((node) =>
        node.dreamIds.some((dreamId) => lucidDreamIds.has(dreamId)),
      )
      .sort((a, b) => b.frequency - a.frequency)
      .slice(0, 9)
      .map((node) => node._id)

    let lucidRiver:
      | {
          line: THREE.Line
          geometry: THREE.BufferGeometry
          material: THREE.LineBasicMaterial
          positions: Float32Array
        }
      | null = null

    if (lucidRiverNodeIds.length >= 3) {
      const positions = new Float32Array(lucidRiverNodeIds.length * 3)
      const geometry = new THREE.BufferGeometry()
      geometry.setAttribute(
        'position',
        new THREE.BufferAttribute(positions, 3),
      )
      const material = new THREE.LineBasicMaterial({
        color: 0xa8f2f1,
        transparent: true,
        opacity: .16,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
      const line = new THREE.Line(geometry, material)
      world.add(line)
      lucidRiver = {line, geometry, material, positions}
    }

    const now = Date.now()
    const supernovae = nodeRef.current
      .filter((node) => {
        const recentMatches = dreamsRef.current.filter(
          (dream) =>
            node.dreamIds.includes(dream._id) &&
            now - new Date(dream.date).getTime() <= 30 * 86_400_000,
        )
        return node.frequency >= 3 && recentMatches.length >= 2
      })
      .slice(0, 4)
      .map((node) => {
        const visual = nodeVisuals.get(node._id)
        if (!visual) return null

        const group = new THREE.Group()
        const color = new THREE.Color(CATEGORY_COLORS[node.category])
        const geometry = new THREE.TorusGeometry(.86, .015, 8, 72)
        const material = new THREE.MeshBasicMaterial({
          color: color.clone().lerp(new THREE.Color(0xffffff), .38),
          transparent: true,
          opacity: .17,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
        const ring = new THREE.Mesh(geometry, material)
        ring.rotation.x = Math.PI / 2.2
        group.add(ring)
        visual.group.add(group)

        return {
          nodeId: node._id,
          group,
          geometry,
          material,
          phase: seededUnit(hashString(`supernova:${node._id}`), 71) * Math.PI * 2,
        }
      })
      .filter(
        (value): value is NonNullable<typeof value> => value !== null,
      )

    const clusterAudios = [...nodeRef.current]
      .filter((node) => node.frequency >= 2)
      .sort((a, b) => b.frequency - a.frequency)
      .slice(0, 3)
      .map((node) => {
        const visual = nodeVisuals.get(node._id)
        const profile = getProfileForNode(node)
        if (!visual || !profile) return null

        const audio = createSpatialDreamAudio(
          listener,
          node.category,
          hashString(`cluster:${node._id}`),
          {
            mood: profile.mood,
            lucid: profile.lucid,
            recurrence: profile.recurrence,
            mode: 'cluster',
          },
        )
        visual.group.add(audio.audio)

        return {
          nodeId: node._id,
          visual,
          audio,
          started: false,
        }
      })
      .filter(
        (value): value is NonNullable<typeof value> => value !== null,
      )

    const edgeVisuals: EdgeVisual[] = []
    const samples = 28

    for (const edge of edges) {
      const array = new Float32Array(samples * 3)
      const geometry = new THREE.BufferGeometry()
      geometry.setAttribute('position', new THREE.BufferAttribute(array, 3))

      const material = new THREE.LineBasicMaterial({
        color: edge.weight > 2 ? 0xc2a7ff : 0x7ecfd8,
        transparent: true,
        opacity: Math.min(.42, .1 + edge.weight * .07),
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })

      const line = new THREE.Line(geometry, material)
      world.add(line)

      const pulseMaterial = new THREE.MeshBasicMaterial({
        color: edge.weight > 2 ? 0xe0c9ff : 0xa4f2ef,
        transparent: true,
        opacity: .75,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
      const pulse = new THREE.Mesh(
        new THREE.SphereGeometry(.035 + Math.min(edge.weight, 4) * .008, 10, 10),
        pulseMaterial,
      )
      world.add(pulse)

      edgeVisuals.push({
        line,
        pulse,
        geometry,
        positions: array,
        material,
        source: edge.source,
        target: edge.target,
        phase: seededUnit(hashString(edge.id), 43),
        weight: edge.weight,
      })
    }

    const raycaster = new THREE.Raycaster()
    const pointer = new THREE.Vector2()
    const pointerTarget = new THREE.Vector2()
    const pointerParallax = new THREE.Vector2()
    let hoveredId: string | null = null
    let pointerDown: {x: number; y: number; pan: Pan} | null = null
    let dragging = false
    let lastProjection = {x: -999, y: -999, visible: false}

    const flightKeys = new Set<string>()
    const flightPosition = new THREE.Vector3()
    const flightVelocity = new THREE.Vector3()
    const flightForward = new THREE.Vector3()
    const flightRight = new THREE.Vector3()
    const flightMove = new THREE.Vector3()
    const flightUp = new THREE.Vector3(0, 1, 0)
    const flightEuler = new THREE.Euler(0, 0, 0, 'YXZ')
    const flightCollisionPoint = new THREE.Vector3()
    const flightCollisionDelta = new THREE.Vector3()
    let flightYaw = 0
    let flightPitch = 0
    let flightInitialized = false
    let previousFlightMode = false
    let flightNearestId: string | null = null
    let flightRoute:
      | {
          source: THREE.Vector3
          control: THREE.Vector3
          target: THREE.Vector3
          targetId: string
          startedAt: number
          duration: number
        }
      | null = null

    let activeCellId: string | null = null
    let activeCellDreamId: string | null = null
    let activeCell: DreamCell | null = null
    let spatialAudio: SpatialDreamAudio | null = null
    let spatialAudioStarted = false

    let activeDive: DreamDive | null = null
    let diveComposer: EffectComposer | null = null
    let divePost: ShaderPass | null = null
    let diveBokeh: BokehPass | null = null
    let diveSsao: SSAOPass | null = null
    let diveAudio: SpatialDreamAudio | null = null
    let diveAudioStarted = false
    let diveMusic: DreamMusic | null = null
    let diveMusicStarted = false
    let diveMusicAnalyser: THREE.AudioAnalyser | null = null
    let portalLeakAudio: SpatialDreamAudio | null = null
    let portalLeakDreamId: string | null = null
    let portalLeakStarted = false
    let portalPreviewDive: DreamDive | null = null
    let portalSceneTransition: PortalSceneTransition | null = null
    let diveMode:
      | 'none'
      | 'entering'
      | 'inside'
      | 'portal'
      | 'exiting' = 'none'
    let diveTransitionStartedAt = 0
    let lastDiveExitRequest = diveExitRequestRef.current
    let lastDiveBackRequest = diveBackRequestRef.current
    let holdTimer: number | null = null
    let holdNodeId: string | null = null
    let pendingPortal:
      | {
          dreamId: string
          title: string
          depth: number
          focus?: {x: number; y: number; z: number}
        }
      | null = null
    let diveStack: string[] = []

    function releaseDreamCell() {
      if (activeCellId) {
        const visual = nodeVisuals.get(activeCellId)
        if (visual && activeCell) {
          visual.group.remove(activeCell.portal)
          visual.miniWorld.group.visible = true
          visual.core.visible = true
        }
        if (visual && spatialAudio) {
          visual.group.remove(spatialAudio.audio)
        }
      }

      activeCell?.dispose()
      spatialAudio?.dispose()
      activeCell = null
      spatialAudio = null
      activeCellId = null
      activeCellDreamId = null
      spatialAudioStarted = false
    }

    function ensureDreamCell(node: DreamWorldNode) {
      const dream = getDreamForNode(node)
      const profile = dream
        ? createDreamProfile(dream, Math.max(1, node.frequency))
        : null

      if (
        activeCellId === node._id &&
        activeCellDreamId === dream?._id &&
        activeCell
      ) {
        return
      }

      releaseDreamCell()

      const visual = nodeVisuals.get(node._id)
      if (!visual || !profile || !dream) return

      const color = new THREE.Color(CATEGORY_COLORS[node.category])
      activeCell = createDreamCell(
        profile,
        node.category,
        color,
        settings,
        hashString(`${node._id}:${dream._id}`),
        cinematicEnvironment.texture,
      )
      activeCellId = node._id
      activeCellDreamId = dream._id
      visual.group.add(activeCell.portal)
      visual.miniWorld.group.visible = false
      visual.core.visible = false

      spatialAudio = createSpatialDreamAudio(
        listener,
        node.category,
        hashString(`${node._id}:${dream._id}`),
        {
          mood: profile.mood,
          lucid: profile.lucid,
          recurrence: profile.recurrence,
          mode: 'cell',
        },
      )
      visual.group.add(spatialAudio.audio)
    }

    function categoryForDream(dream: Dream): SymbolCategory {
      const symbols = dream.symbols ?? []
      const counts: Record<SymbolCategory, number> = {
        person: 0,
        place: 0,
        object: 0,
        feeling: 0,
        action: 0,
      }
      symbols.forEach((symbol) => {
        counts[symbol.category] += 1
      })
      return (Object.keys(counts) as SymbolCategory[]).sort(
        (a, b) => counts[b] - counts[a],
      )[0] ?? 'place'
    }

    function releasePortalLeak() {
      if (portalLeakAudio && activeDive) {
        activeDive.scene.remove(portalLeakAudio.audio)
      }
      portalLeakAudio?.dispose()
      portalLeakAudio = null
      portalLeakDreamId = null
      portalLeakStarted = false
    }

    function ensurePortalLeak(
      dreamId: string,
      focus?: {x: number; y: number; z: number},
    ) {
      if (!activeDive) return
      if (portalLeakDreamId === dreamId && portalLeakAudio) {
        if (focus) {
          portalLeakAudio.audio.position.set(
            focus.x,
            focus.y,
            focus.z,
          )
        }
        return
      }

      releasePortalLeak()

      const dream = dreamsRef.current.find(
        (candidate) => candidate._id === dreamId,
      )
      if (!dream) return

      const recurrence = dreamRecurrence(dream, dreamsRef.current)
      const profile = createDreamProfile(dream, recurrence)
      portalLeakAudio = createSpatialDreamAudio(
        listener,
        categoryForDream(dream),
        hashString(`portal-leak:${dream._id}`),
        {
          mood: profile.mood,
          lucid: profile.lucid,
          recurrence: profile.recurrence,
          mode: 'cluster',
        },
      )
      portalLeakDreamId = dream._id
      portalLeakAudio.setFocus(.22)
      portalLeakAudio.audio.position.set(
        focus?.x ?? 0,
        focus?.y ?? 1.3,
        focus?.z ?? -5,
      )
      activeDive.scene.add(portalLeakAudio.audio)

      if (soundEnabledRef.current) {
        portalLeakStarted = true
        void portalLeakAudio.ensurePlaying().catch(() => {
          portalLeakStarted = false
        })
      }
    }

    function disposeDive(options: {
      restoreListener?: boolean
      clearMode?: boolean
    } = {}) {
      const restoreListener = options.restoreListener ?? true
      const clearMode = options.clearMode ?? true

      if (activeDive) {
        activeDive.camera.remove(listener)
      }

      diveAudio?.dispose()
      diveAudio = null
      diveAudioStarted = false

      diveMusic?.dispose()
      diveMusic = null
      diveMusicStarted = false
      diveMusicAnalyser = null

      portalLeakAudio?.dispose()
      portalLeakAudio = null
      portalLeakDreamId = null
      portalLeakStarted = false

      portalPreviewDive?.dispose()
      portalPreviewDive = null
      portalSceneTransition?.dispose()
      portalSceneTransition = null

      if (restoreListener && listener.parent !== camera) {
        listener.removeFromParent()
        camera.add(listener)
      }

      diveComposer?.dispose()
      diveComposer = null
      divePost = null
      diveBokeh = null
      diveSsao = null
      activeDive?.dispose()
      activeDive = null
      pendingPortal = null

      if (clearMode) diveMode = 'none'
    }

    function installDive(
      dream: Dream,
      depth: number,
      options: {resetStack?: boolean; fromPortal?: boolean} = {},
    ) {
      disposeDive({restoreListener: false, clearMode: false})

      const recurrence = dreamRecurrence(dream, dreamsRef.current)
      const profile = createDreamProfile(dream, recurrence)
      const relations: DreamRelation[] = getDreamRelations(
        dream,
        dreamsRef.current,
        4,
      )
      const category = categoryForDream(dream)

      activeDive = createDreamDive(
        profile,
        settings,
        hashString(`dive:${dream._id}:${depth}`),
        {
          currentDream: dream,
          dreams: dreamsRef.current,
          relations,
          depth,
          maxDepth: 2,
          environmentMap: cinematicEnvironment.texture,
        },
      )

      listener.removeFromParent()
      activeDive.camera.add(listener)

      diveAudio = createSpatialDreamAudio(
        listener,
        category,
        hashString(`dive-audio:${dream._id}:${depth}`),
        {
          mood: profile.mood,
          lucid: profile.lucid,
          recurrence: profile.recurrence,
          mode: 'dive',
        },
      )
      diveAudio.audio.position.set(0, 1.2, -4.2)
      activeDive.scene.add(diveAudio.audio)

      diveMusic = createDreamMusic(
        listener,
        profile,
        hashString(`music:${dream._id}:${depth}`),
        {
          relationshipStrength: relations[0]?.score ?? 0,
        },
      )
      activeDive.scene.add(diveMusic.audio)
      diveMusicAnalyser = new THREE.AudioAnalyser(diveMusic.audio, 64)

      if (spatialAudio?.audio.isPlaying) spatialAudio.audio.pause()
      spatialAudioStarted = false
      clusterAudios.forEach((cluster) => {
        if (cluster.audio.audio.isPlaying) cluster.audio.audio.pause()
        cluster.started = false
      })

      diveComposer = new EffectComposer(renderer)
      const diveRenderPass = new RenderPass(activeDive.scene, activeDive.camera)
      diveComposer.addPass(diveRenderPass)

      diveSsao = new SSAOPass(activeDive.scene, activeDive.camera, 1, 1)
      diveSsao.enabled = settings.ssao
      diveSsao.kernelRadius = Math.max(4, settings.ssaoKernelRadius * .8)
      diveSsao.minDistance = 0.002
      diveSsao.maxDistance = 0.1
      diveComposer.addPass(diveSsao)

      diveBokeh = new BokehPass(activeDive.scene, activeDive.camera, {
        focus: 7,
        aperture: 0.00005,
        maxblur: settings.maxBlur * 1.1,
      })
      diveBokeh.enabled = false
      diveComposer.addPass(diveBokeh)

      const diveBloom = new UnrealBloomPass(
        new THREE.Vector2(1, 1),
        settings.bloomStrength * 0.74,
        Math.min(0.66, settings.bloomRadius),
        Math.max(0.4, settings.bloomThreshold),
      )
      diveComposer.addPass(diveBloom)

      divePost = new ShaderPass(DreamPostShader)
      divePost.uniforms.uCinematic.value =
        qualityRef.current === 'cinematic' ? 1 : 0.35
      divePost.uniforms.uIntensity.value =
        qualityRef.current === 'cinematic' ? 0.78 : 0.4
      diveComposer.addPass(divePost)
      diveComposer.addPass(new OutputPass())

      const rect = container.getBoundingClientRect()
      activeDive.resize(rect.width / Math.max(1, rect.height))
      diveComposer.setSize(rect.width, rect.height)
      activeDive.setTimeline(diveTimelineProgressRef.current)

      if (options.resetStack) {
        diveStack = [dream._id]
      } else if (diveStack[diveStack.length - 1] !== dream._id) {
        diveStack = [...diveStack, dream._id].slice(-3)
      }

      diveMode = options.fromPortal ? 'inside' : 'entering'
      diveTransitionStartedAt = performance.now() / 1000
      onProjectionChangeRef.current(null)
      onDiveStateChangeRef.current(true, profile.title)
      onDiveDreamChangeRef.current(dream._id, profile.title, depth)
    }

    function beginDreamDive(node: DreamWorldNode) {
      if (selectedRef.current !== node._id || diveMode !== 'none') return

      const dream = getDreamForNode(node)
      if (!dream) return
      installDive(dream, 0, {resetStack: true})
    }

    function beginPortalTransition(action: {
      dreamId: string
      title: string
      depth: number
      focus?: {x: number; y: number; z: number}
    }) {
      if (!activeDive || diveMode !== 'inside') return
      if (action.depth > 2) return
      if (diveStack.length >= 3 && !diveStack.includes(action.dreamId)) return

      const destination = dreamsRef.current.find(
        (dream) => dream._id === action.dreamId,
      )
      if (!destination) return

      releasePortalLeak()

      portalPreviewDive?.dispose()
      portalPreviewDive = null
      portalSceneTransition?.dispose()
      portalSceneTransition = null

      const recurrence = dreamRecurrence(destination, dreamsRef.current)
      const profile = createDreamProfile(destination, recurrence)
      const relations = getDreamRelations(destination, dreamsRef.current, 4)
      portalPreviewDive = createDreamDive(
        profile,
        settings,
        hashString(`portal-preview:${destination._id}:${action.depth}`),
        {
          currentDream: destination,
          dreams: dreamsRef.current,
          relations,
          depth: action.depth,
          maxDepth: 2,
          environmentMap: cinematicEnvironment.texture,
        },
      )
      portalPreviewDive.setTimeline(diveTimelineProgressRef.current)

      const rect = container.getBoundingClientRect()
      portalPreviewDive.resize(rect.width / Math.max(1, rect.height))
      portalSceneTransition = createPortalSceneTransition(
        Math.max(1, Math.floor(rect.width * settings.portalBlendResolution)),
        Math.max(1, Math.floor(rect.height * settings.portalBlendResolution)),
      )

      pendingPortal = action
      diveMode = 'portal'
      diveTransitionStartedAt = performance.now() / 1000
      onDiveDreamChangeRef.current(action.dreamId, action.title, action.depth)
    }

    function requestDiveExit() {
      if (
        !activeDive ||
        (diveMode !== 'inside' &&
          diveMode !== 'entering' &&
          diveMode !== 'portal')
      ) {
        return
      }
      pendingPortal = null
      diveMode = 'exiting'
      diveTransitionStartedAt = performance.now() / 1000
    }

    function requestDiveBack() {
      if (!activeDive || diveMode !== 'inside' || diveStack.length <= 1) {
        return
      }

      const previousStack = diveStack.slice(0, -1)
      const previousDreamId = previousStack[previousStack.length - 1]
      const previousDream = dreamsRef.current.find(
        (dream) => dream._id === previousDreamId,
      )
      if (!previousDream) return

      diveStack = previousStack
      installDive(previousDream, Math.max(0, previousStack.length - 1), {
        fromPortal: true,
      })
    }

    function resize() {
      const rect = container.getBoundingClientRect()
      if (!rect.width || !rect.height) return
      renderer.setSize(rect.width, rect.height, false)
      composer.setSize(rect.width, rect.height)
      bloom.resolution.set(rect.width, rect.height)
      camera.aspect = rect.width / rect.height
      camera.updateProjectionMatrix()

      if (activeDive && diveComposer) {
        activeDive.resize(rect.width / rect.height)
        diveComposer.setSize(rect.width, rect.height)
      }

      if (portalPreviewDive) {
        portalPreviewDive.resize(rect.width / rect.height)
      }
      portalSceneTransition?.resize(
        Math.max(1, Math.floor(rect.width * settings.portalBlendResolution)),
        Math.max(1, Math.floor(rect.height * settings.portalBlendResolution)),
      )
    }

    const resizeObserver = new ResizeObserver(resize)
    resizeObserver.observe(container)
    resize()

    function normalizedPointer(event: PointerEvent) {
      const rect = renderer.domElement.getBoundingClientRect()
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
      pointerTarget.set(pointer.x, pointer.y)
    }

    function pickNode(event: PointerEvent) {
      normalizedPointer(event)
      raycaster.setFromCamera(pointer, camera)
      const intersections = raycaster.intersectObjects(interactive, false)
      if (!intersections.length) return null
      const id = intersections[0].object.userData.nodeId as string | undefined
      return nodeRef.current.find((node) => node._id === id) ?? null
    }

    function pickCenterNode() {
      pointer.set(0, 0)
      raycaster.setFromCamera(pointer, camera)
      const intersections = raycaster.intersectObjects(interactive, false)
      if (!intersections.length) return null
      const id = intersections[0].object.userData.nodeId as string | undefined
      return nodeRef.current.find((node) => node._id === id) ?? null
    }

    function nearestFlightNode(maxDistance = 4.2) {
      let nearest:
        | {node: DreamWorldNode; distance: number}
        | null = null
      const worldPoint = new THREE.Vector3()

      for (const node of nodeRef.current) {
        const visual = nodeVisuals.get(node._id)
        if (!visual) continue
        visual.group.getWorldPosition(worldPoint)
        const distance = worldPoint.distanceTo(camera.position)
        if (
          distance <= maxDistance &&
          (!nearest || distance < nearest.distance)
        ) {
          nearest = {node, distance}
        }
      }

      return nearest ? nearest.node : null
    }

    function handlePointerMove(event: PointerEvent) {
      if (flightModeRef.current && diveMode === 'none') {
        renderer.domElement.style.cursor = 'none'
        return
      }

      normalizedPointer(event)

      if (diveMode !== 'none') {
        activeDive?.setLookTarget(pointer.x, pointer.y)
        const interaction =
          diveMode === 'inside'
            ? activeDive?.pick(pointer.x, pointer.y)
            : null

        if (interaction?.dreamId) {
          ensurePortalLeak(interaction.dreamId, interaction.focus)
          portalLeakAudio?.setFocus(.28)

          if (
            portalLeakAudio &&
            soundEnabledRef.current &&
            !portalLeakStarted
          ) {
            portalLeakStarted = true
            void portalLeakAudio.ensurePlaying().catch(() => {
              portalLeakStarted = false
            })
          } else if (
            portalLeakAudio &&
            !soundEnabledRef.current &&
            portalLeakStarted
          ) {
            if (portalLeakAudio.audio.isPlaying) {
              portalLeakAudio.audio.pause()
            }
            portalLeakStarted = false
          }
        } else {
          releasePortalLeak()
        }

        renderer.domElement.style.cursor = interaction ? 'pointer' : 'crosshair'
        return
      }

      if (pointerDown) {
        const dx = event.clientX - pointerDown.x
        const dy = event.clientY - pointerDown.y
        if (Math.abs(dx) + Math.abs(dy) > 4) {
          dragging = true
          if (holdTimer !== null) {
            window.clearTimeout(holdTimer)
            holdTimer = null
            holdNodeId = null
          }
        }
        if (dragging) {
          onPanChangeRef.current({
            x: pointerDown.pan.x + dx * 1.1,
            y: pointerDown.pan.y + dy * 1.1,
          })
          renderer.domElement.style.cursor = 'grabbing'
          return
        }
      }

      const node = pickNode(event)
      const nextId = node?._id ?? null
      if (nextId !== hoveredId) {
        hoveredId = nextId
        onNodeHoverRef.current(node)
      }
      renderer.domElement.style.cursor = node ? 'pointer' : 'grab'
    }

    function handlePointerDown(event: PointerEvent) {
      if (flightModeRef.current && diveMode === 'none') {
        if (document.pointerLockElement !== renderer.domElement) {
          void renderer.domElement.requestPointerLock()
        } else {
          const node = pickCenterNode()
          if (node) onNodeSelectRef.current(node)
        }
        return
      }

      if (diveMode !== 'none') {
        normalizedPointer(event)
        activeDive?.setLookTarget(pointer.x, pointer.y)
        return
      }

      pointerDown = {
        x: event.clientX,
        y: event.clientY,
        pan: panRef.current,
      }
      dragging = false
      renderer.domElement.setPointerCapture(event.pointerId)

      const node = pickNode(event)
      if (node && selectedRef.current === node._id) {
        holdNodeId = node._id
        holdTimer = window.setTimeout(() => {
          if (
            holdNodeId === node._id &&
            !dragging &&
            selectedRef.current === node._id
          ) {
            beginDreamDive(node)
          }
          holdTimer = null
          holdNodeId = null
        }, 680)
      }
    }

    function handlePointerUp(event: PointerEvent) {
      if (holdTimer !== null) {
        window.clearTimeout(holdTimer)
        holdTimer = null
        holdNodeId = null
      }

      if (diveMode !== 'none') {
        normalizedPointer(event)
        if (diveMode === 'inside') {
          const interaction = activeDive?.pick(pointer.x, pointer.y)
          if (interaction) {
            beginPortalTransition(interaction)
          }
        }
        return
      }

      if (renderer.domElement.hasPointerCapture(event.pointerId)) {
        renderer.domElement.releasePointerCapture(event.pointerId)
      }

      if (!dragging) {
        const node = pickNode(event)
        if (node) onNodeSelectRef.current(node)
        else onBackgroundClickRef.current()
      }

      pointerDown = null
      dragging = false
      renderer.domElement.style.cursor = 'grab'
    }

    function handlePointerLeave() {
      if (holdTimer !== null) {
        window.clearTimeout(holdTimer)
        holdTimer = null
        holdNodeId = null
      }
      pointerDown = null
      dragging = false
      releasePortalLeak()
      if (hoveredId !== null) {
        hoveredId = null
        onNodeHoverRef.current(null)
      }
    }

    function handleWheel(event: WheelEvent) {
      event.preventDefault()
      if (flightModeRef.current || diveMode !== 'none') return

      const next = Math.min(
        2.8,
        Math.max(.68, zoomRef.current + (event.deltaY < 0 ? .11 : -.11)),
      )
      onZoomChangeRef.current(next)
    }

    function handleDoubleClick(event: MouseEvent) {
      if (flightModeRef.current || diveMode !== 'none') return
      const pointerEvent = event as unknown as PointerEvent
      const node = pickNode(pointerEvent)
      if (node && selectedRef.current === node._id) {
        beginDreamDive(node)
      }
    }

    renderer.domElement.addEventListener('pointermove', handlePointerMove)
    renderer.domElement.addEventListener('pointerdown', handlePointerDown)
    renderer.domElement.addEventListener('pointerup', handlePointerUp)
    renderer.domElement.addEventListener('pointercancel', handlePointerLeave)
    renderer.domElement.addEventListener('pointerleave', handlePointerLeave)
    renderer.domElement.addEventListener('wheel', handleWheel, {passive: false})
    renderer.domElement.addEventListener('dblclick', handleDoubleClick)

    function handleFlightMouse(event: MouseEvent) {
      if (
        !flightModeRef.current ||
        diveMode !== 'none' ||
        document.pointerLockElement !== renderer.domElement
      ) {
        return
      }

      flightYaw -= event.movementX * .00175
      flightPitch -= event.movementY * .00155
      flightPitch = THREE.MathUtils.clamp(
        flightPitch,
        -Math.PI * .46,
        Math.PI * .46,
      )
    }

    function handleFlightKeyDown(event: KeyboardEvent) {
      if (!flightModeRef.current || diveMode !== 'none') return

      flightKeys.add(event.code)

      if (
        [
          'KeyW',
          'KeyA',
          'KeyS',
          'KeyD',
          'Space',
          'KeyQ',
          'ControlLeft',
          'ControlRight',
        ].includes(event.code)
      ) {
        flightRoute = null
      }

      if (event.code === 'KeyR') {
        event.preventDefault()
        const sourceNode = nearestFlightNode(4.5)
        if (sourceNode) {
          const strongest = edges
            .filter(
              (edge) =>
                edge.source === sourceNode._id ||
                edge.target === sourceNode._id,
            )
            .sort((a, b) => b.weight - a.weight)[0]

          if (strongest) {
            const targetId =
              strongest.source === sourceNode._id
                ? strongest.target
                : strongest.source
            const targetVisual = nodeVisuals.get(targetId)
            if (targetVisual) {
              const start = camera.position.clone()
              const target = targetVisual.group
                .getWorldPosition(new THREE.Vector3())
                .add(new THREE.Vector3(0, 0, 1.2))
              const controlPoint = start.clone().lerp(target, .5)
              controlPoint.y += 1.2 + strongest.weight * .16
              controlPoint.z += .8
              const distance = start.distanceTo(target)

              flightRoute = {
                source: start,
                control: controlPoint,
                target,
                targetId,
                startedAt: performance.now() / 1000,
                duration: THREE.MathUtils.clamp(
                  distance / 4.2,
                  1.2,
                  3.8,
                ),
              }
            }
          }
        }
      }

      if (event.code === 'KeyE') {
        event.preventDefault()
        const node = pickCenterNode() ?? nearestFlightNode(3.2)
        if (node) onNodeSelectRef.current(node)
      }

      if (event.code === 'KeyF') {
        event.preventDefault()
        const selectedNode = selectedRef.current
          ? nodeRef.current.find(
              (node) => node._id === selectedRef.current,
            ) ?? null
          : null
        const node =
          pickCenterNode() ??
          selectedNode ??
          nearestFlightNode(3.2)

        if (node) {
          beginDreamDive(node)
        }
      }

      if (event.code === 'Escape') {
        document.exitPointerLock?.()
      }
    }

    function handleFlightKeyUp(event: KeyboardEvent) {
      flightKeys.delete(event.code)
    }

    document.addEventListener('mousemove', handleFlightMouse)
    window.addEventListener('keydown', handleFlightKeyDown)
    window.addEventListener('keyup', handleFlightKeyUp)

    const cameraTarget = new THREE.Vector3()
    const lookTarget = new THREE.Vector3(0, 0, 0)
    const tempVector = new THREE.Vector3()
    const control = new THREE.Vector3()
    const curvePoint = new THREE.Vector3()

    let animationFrame = 0
    let lastSelectedId: string | null = null
    let relationTravel: {from: string; to: string; startedAt: number} | null = null
    const startedAt = performance.now()
    let lastFrameAt = startedAt
    let adaptivePixelRatio = Math.min(
      window.devicePixelRatio,
      settings.pixelRatio,
    )
    let frameTimeAccumulator = 0
    let frameTimeSamples = 0
    let lastAdaptiveCheck = 0

    function animate(now: number) {
      animationFrame = requestAnimationFrame(animate)
      const elapsed = (now - startedAt) / 1000
      const delta = Math.min(.05, Math.max(.001, (now - lastFrameAt) / 1000))
      lastFrameAt = now

      if (
        qualityRef.current === 'high' ||
        qualityRef.current === 'cinematic'
      ) {
        frameTimeAccumulator += delta
        frameTimeSamples += 1

        if (elapsed - lastAdaptiveCheck > 1.6 && frameTimeSamples > 30) {
          const averageMs =
            (frameTimeAccumulator / frameTimeSamples) * 1000
          const maxDpr = Math.min(
            window.devicePixelRatio,
            settings.pixelRatio,
          )
          let nextDpr = adaptivePixelRatio

          if (averageMs > 24) {
            nextDpr = Math.max(1, adaptivePixelRatio - .12)
          } else if (averageMs < 17.2) {
            nextDpr = Math.min(maxDpr, adaptivePixelRatio + .06)
          }

          if (Math.abs(nextDpr - adaptivePixelRatio) > .02) {
            adaptivePixelRatio = nextDpr
            renderer.setPixelRatio(adaptivePixelRatio)
            composer.setPixelRatio(adaptivePixelRatio)
            diveComposer?.setPixelRatio(adaptivePixelRatio)
            resize()
          }

          frameTimeAccumulator = 0
          frameTimeSamples = 0
          lastAdaptiveCheck = elapsed
        }
      }

      const flightActive =
        flightModeRef.current &&
        diveMode === 'none' &&
        !observatoryModeRef.current

      if (flightActive && !previousFlightMode) {
        flightPosition.copy(camera.position)
        flightEuler.setFromQuaternion(camera.quaternion, 'YXZ')
        flightYaw = flightEuler.y
        flightPitch = flightEuler.x
        flightVelocity.set(0, 0, 0)
        flightInitialized = true
        previousFlightMode = true
        onProjectionChangeRef.current(null)
      } else if (!flightActive && previousFlightMode) {
        if (document.pointerLockElement === renderer.domElement) {
          document.exitPointerLock?.()
        }
        flightKeys.clear()
        flightVelocity.set(0, 0, 0)
        previousFlightMode = false
        flightInitialized = false
      }

      if (diveExitRequestRef.current !== lastDiveExitRequest) {
        lastDiveExitRequest = diveExitRequestRef.current
        requestDiveExit()
      }

      if (diveBackRequestRef.current !== lastDiveBackRequest) {
        lastDiveBackRequest = diveBackRequestRef.current
        requestDiveBack()
      }

      if (
        activeDive &&
        (diveMode === 'inside' ||
          diveMode === 'portal' ||
          diveMode === 'exiting')
      ) {
        activeDive.setLookTarget(pointerTarget.x, pointerTarget.y)
        activeDive.setTimeline(diveTimelineProgressRef.current)

        const musicEnergy =
          soundEnabledRef.current &&
          diveMusic?.audio.isPlaying &&
          diveMusicAnalyser
            ? THREE.MathUtils.clamp(
                diveMusicAnalyser.getAverageFrequency() / 150,
                0,
                1,
              )
            : 0
        activeDive.setAudioEnergy(musicEnergy)
        activeDive.update(elapsed, delta)

        if (portalPreviewDive && diveMode === 'portal') {
          portalPreviewDive.setTimeline(diveTimelineProgressRef.current)
          portalPreviewDive.setAudioEnergy(musicEnergy * .72)
          portalPreviewDive.update(elapsed, delta)
          portalPreviewDive.renderPreviews(renderer, elapsed)
        }

        if (diveMode === 'portal' && pendingPortal?.focus) {
          const portalProgress = Math.min(
            1,
            Math.max(0, (elapsed - diveTransitionStartedAt) / .72),
          )
          const eased = 1 - Math.pow(1 - portalProgress, 3)
          const focus = new THREE.Vector3(
            pendingPortal.focus.x,
            pendingPortal.focus.y,
            pendingPortal.focus.z,
          )
          const travelTarget = focus.clone().add(
            new THREE.Vector3(0, 0, .32 * (1 - eased)),
          )
          activeDive.camera.position.lerp(travelTarget, .08 + eased * .13)
          activeDive.camera.lookAt(focus)
        }

        activeDive.renderPreviews(renderer, elapsed)

        if (diveAudio) {
          diveAudio.setFocus(
            diveMode === 'exiting' ? .35 : diveMode === 'portal' ? .72 : 1,
          )
          if (soundEnabledRef.current && !diveAudioStarted) {
            diveAudioStarted = true
            void diveAudio.ensurePlaying().catch(() => {
              diveAudioStarted = false
            })
          } else if (!soundEnabledRef.current && diveAudioStarted) {
            if (diveAudio.audio.isPlaying) diveAudio.audio.pause()
            diveAudioStarted = false
          }
        }

        if (diveMusic) {
          const intensity =
            diveMode === 'portal'
              ? .92
              : diveMode === 'exiting'
                ? .28
                : .72
          diveMusic.setIntensity(intensity)

          if (soundEnabledRef.current && !diveMusicStarted) {
            diveMusicStarted = true
            void diveMusic.ensurePlaying().catch(() => {
              diveMusicStarted = false
            })
          } else if (!soundEnabledRef.current && diveMusicStarted) {
            if (diveMusic.audio.isPlaying) diveMusic.audio.pause()
            diveMusicStarted = false
          }
        }

        const exitProgress =
          diveMode === 'exiting'
            ? Math.min(1, (elapsed - diveTransitionStartedAt) / .78)
            : 0
        const portalProgress =
          diveMode === 'portal'
            ? Math.min(1, (elapsed - diveTransitionStartedAt) / .72)
            : 0

        if (diveBokeh) {
          diveBokeh.enabled =
            settings.depthOfField &&
            (diveMode === 'portal' || diveMode === 'exiting')

          if (diveBokeh.enabled) {
            const focusTarget =
              diveMode === 'portal'
                ? 6.2 - portalProgress * 2.4
                : 4.8 + exitProgress * 2.8
            const diveBokehUniforms =
              diveBokeh.uniforms as BokehUniformMap

            diveBokehUniforms.focus.value +=
              (focusTarget - diveBokehUniforms.focus.value) * .09
            diveBokehUniforms.aperture.value +=
              ((diveMode === 'portal' ? .000085 : .000055) -
                diveBokehUniforms.aperture.value) *
              .08
          }
        }

        if (divePost) {
          divePost.uniforms.uTime.value = elapsed
          divePost.uniforms.uTravel.value =
            diveMode === 'exiting'
              ? exitProgress
              : diveMode === 'portal'
                ? portalProgress
                : .06
          divePost.uniforms.uFlarePosition.value.set(.62, .34)
          divePost.uniforms.uFlareStrength.value =
            qualityRef.current === 'cinematic'
              ? diveMode === 'portal'
                ? .42
                : .22
              : diveMode === 'portal'
                ? .18
                : .08
        }

        if (
          diveMode === 'portal' &&
          portalProgress >= 1 &&
          pendingPortal
        ) {
          const destination = dreamsRef.current.find(
            (dream) => dream._id === pendingPortal?.dreamId,
          )
          const depth = pendingPortal.depth
          pendingPortal = null

          if (destination) {
            portalSceneTransition?.dispose()
            portalSceneTransition = null
            portalPreviewDive?.dispose()
            portalPreviewDive = null

            installDive(destination, depth, {fromPortal: true})
            pointerTarget.set(0, 0)
            renderer.domElement.style.cursor = 'crosshair'
            return
          }

          diveMode = 'inside'
        }

        if (diveMode === 'exiting' && exitProgress >= 1) {
          const returningVisual = selectedRef.current
            ? nodeVisuals.get(selectedRef.current)
            : null
          if (returningVisual) {
            camera.position.copy(returningVisual.group.position)
            camera.position.z += .16
            lookTarget.copy(returningVisual.group.position)
          }

          disposeDive()
          diveStack = []
          onDiveStateChangeRef.current(false)
          pointerTarget.set(0, 0)
          pointerParallax.set(0, 0)
        } else {
          if (
            diveMode === 'portal' &&
            portalPreviewDive &&
            portalSceneTransition
          ) {
            portalSceneTransition.render(
              renderer,
              activeDive.scene,
              activeDive.camera,
              portalPreviewDive.scene,
              portalPreviewDive.camera,
              portalProgress,
              elapsed,
            )
          } else {
            diveComposer?.render()
          }
          return
        }
      }

      farWorld.rotation.y = Math.sin(elapsed * .025) * .035
      stars.rotation.z = elapsed * .002

      nebulae.forEach((sprite, index) => {
        sprite.material.opacity = .22 + Math.sin(elapsed * .13 + index) * .06
        sprite.position.x += Math.sin(elapsed * .06 + index) * .0008
      })

      fragments.forEach((fragment, index) => {
        fragment.rotation.x += .0008 + (index % 3) * .00015
        fragment.rotation.y += .001 + (index % 4) * .0001
        fragment.position.y += Math.sin(elapsed * .22 + index) * .00045
      })

      landmarks.forEach((landmark, index) => {
        landmark.rotation.y += 0.00018 + index * 0.00005
        landmark.position.y += Math.sin(elapsed * 0.11 + index * 1.7) * 0.00035
      })

      secretArtifacts.forEach((secret) => {
        secret.group.rotation.y += .0014
        secret.group.rotation.z =
          Math.sin(elapsed * .18 + secret.phase) * .08
        secret.group.position.y +=
          Math.sin(elapsed * .22 + secret.phase) * .0008
        const focused =
          selectedRef.current === secret.nodeId ||
          hoveredId === secret.nodeId
        secret.group.scale.lerp(
          new THREE.Vector3(
            focused ? .92 : .72,
            focused ? .92 : .72,
            focused ? .92 : .72,
          ),
          .04,
        )
      })

      foregroundFog.forEach((sprite, index) => {
        sprite.position.x += Math.sin(elapsed * 0.08 + index * 2.1) * 0.0014
        sprite.position.y += Math.cos(elapsed * 0.06 + index * 1.2) * 0.001
        const material = sprite.material as THREE.SpriteMaterial
        material.opacity =
          (index === 0 ? 0.04 : 0.03) +
          Math.sin(elapsed * 0.16 + index) * 0.008
      })

      nearDust.rotation.y = Math.sin(elapsed * .045) * .05
      nearDust.position.x = pointerParallax.x * .16
      nearDust.position.y = pointerParallax.y * .1
      nearDustMaterial.opacity =
        .14 + Math.max(0, Math.sin(elapsed * .19)) * .06

      worldLightShafts.forEach((shaft, index) => {
        shaft.rotation.y += .00022 + index * .00005
        const material = shaft.material as THREE.MeshBasicMaterial
        material.opacity =
          .012 +
          index * .003 +
          Math.max(0, Math.sin(elapsed * .11 + index)) * .007
      })

      pointerParallax.lerp(pointerTarget, 0.035)

      const observatoryScale = observatoryModeRef.current ? .7 : 1
      world.scale.lerp(
        new THREE.Vector3(
          observatoryScale,
          observatoryScale,
          observatoryScale,
        ),
        .035,
      )

      if (lucidRiver) {
        lucidRiverNodeIds.forEach((nodeId, index) => {
          const position = nodeVisuals.get(nodeId)?.group.position
          if (!position) return
          const offset = index * 3
          lucidRiver.positions[offset] = position.x
          lucidRiver.positions[offset + 1] = position.y
          lucidRiver.positions[offset + 2] = position.z
        })
        ;(
          lucidRiver.geometry.getAttribute('position') as THREE.BufferAttribute
        ).needsUpdate = true
        lucidRiver.material.opacity =
          .1 + Math.max(0, Math.sin(elapsed * .23)) * .08
      }

      categoryNebulae.forEach((cluster) => {
        cluster.material.opacity +=
          ((observatoryModeRef.current ? .12 : .018) -
            cluster.material.opacity) *
          .035
        cluster.sprite.rotation.z += .00018
        cluster.sprite.position.y +=
          Math.sin(elapsed * .08 + cluster.phase) * .0004
      })

      supernovae.forEach((event, index) => {
        event.group.rotation.z += .002 + index * .0003
        event.group.rotation.y = Math.sin(elapsed * .11 + event.phase) * .25
        const scale =
          1 +
          Math.sin(elapsed * .7 + event.phase) * .08 +
          (observatoryModeRef.current ? .18 : 0)
        event.group.scale.setScalar(scale)
        event.material.opacity =
          .12 +
          Math.max(0, Math.sin(elapsed * .52 + event.phase)) * .12
      })

      clusterAudios.forEach((cluster) => {
        const isFocused = selectedRef.current === cluster.nodeId
        cluster.audio.setFocus(isFocused ? .55 : .05)

        if (soundEnabledRef.current && !cluster.started) {
          cluster.started = true
          void cluster.audio.ensurePlaying().catch(() => {
            cluster.started = false
          })
        } else if (!soundEnabledRef.current && cluster.started) {
          if (cluster.audio.audio.isPlaying) cluster.audio.audio.pause()
          cluster.started = false
        }
      })

      const currentSelectedId = selectedRef.current
      if (currentSelectedId !== lastSelectedId) {
        const previousSelectedId = lastSelectedId

        if (currentSelectedId) {
          const selected = nodeVisuals.get(currentSelectedId)
          if (selected) {
            selected.pulseStartedAt = elapsed
            selected.shockwave.visible = true
            selected.shockwave.scale.setScalar(0.78)
            ;(selected.shockwave.material as THREE.MeshBasicMaterial).opacity = 0.42
          }
        }

        if (
          previousSelectedId &&
          currentSelectedId &&
          edges.some(
            (edge) =>
              (edge.source === previousSelectedId && edge.target === currentSelectedId) ||
              (edge.target === previousSelectedId && edge.source === currentSelectedId),
          )
        ) {
          relationTravel = {
            from: previousSelectedId,
            to: currentSelectedId,
            startedAt: elapsed,
          }
        }

        lastSelectedId = currentSelectedId
      }

      let selectionPulseStrength = 0
      if (currentSelectedId) {
        const selected = nodeVisuals.get(currentSelectedId)
        if (selected && selected.pulseStartedAt >= 0) {
          const progress = Math.min(1, (elapsed - selected.pulseStartedAt) / 1.25)
          if (progress < 1) {
            const eased = 1 - Math.pow(1 - progress, 3)
            selectionPulseStrength = (1 - progress) * 0.9
            selected.shockwave.visible = true
            selected.shockwave.scale.setScalar(0.8 + eased * 2.3)
            ;(selected.shockwave.material as THREE.MeshBasicMaterial).opacity =
              (1 - progress) * 0.38
          } else {
            selected.shockwave.visible = false
          }
        }
      }

      for (const node of nodeRef.current) {
        const visual = nodeVisuals.get(node._id)
        if (!visual) continue

        const target = worldPosition(node, positionsRef.current)
        const memoryAge = nodeMemoryAge.get(node._id) ?? 0
        if (node.libraryKind === 'shelf') {
          target.y +=
            Math.sin(elapsed * .18 + visual.phase) * .075
          target.x +=
            Math.cos(elapsed * .12 + visual.phase) * .012
          target.z +=
            Math.sin(elapsed * .1 + visual.phase) * .012
        } else {
          target.z =
            visual.z -
            memoryAge * (node.frequency <= 1 ? 1.35 : .48) +
            Math.sin(elapsed * .21 + visual.phase) * .22
          target.y +=
            Math.sin(elapsed * .37 + visual.phase) * .08 +
            Math.cos(elapsed * .105) * .055
          target.x +=
            Math.cos(elapsed * .29 + visual.phase) * .05 +
            Math.sin(elapsed * .12) * .07
        }

        const gravity =
          node.libraryKind === 'shelf'
            ? undefined
            : gravityParents.get(node._id)
        if (gravity) {
          const parentVisual = nodeVisuals.get(gravity.parentId)
          if (parentVisual) {
            const orbitAngle =
              elapsed * (0.035 + Math.min(node.frequency, 3) * 0.004) +
              gravity.phase
            const orbitTarget = parentVisual.group.position
              .clone()
              .add(
                new THREE.Vector3(
                  Math.cos(orbitAngle) * gravity.radius,
                  Math.sin(orbitAngle * 0.73) * gravity.radius * 0.58,
                  Math.sin(orbitAngle) * gravity.radius * 0.34,
                ),
              )
            target.lerp(orbitTarget, gravity.influence)
          }
        }

        visual.group.position.lerp(target, .08)

        const selected = selectedRef.current === node._id
        const active = activeRef.current
        const focused = focusedIdsRef.current
        const inFocusedDream = focused.size === 0 || focused.has(node._id)
        const connected =
          !active ||
          active === node._id ||
          edges.some(
            (edge) =>
              relatedEdgeIdsRef.current.has(edge.id) &&
              (edge.source === node._id || edge.target === node._id),
          )
        const visible = inFocusedDream && connected
        const wakeRank = introWakeOrder.get(node._id) ?? 999
        const stage = introStageRef.current
        const introVisibility =
          stage >= 4
            ? 1
            : stage === 3
              ? wakeRank < Math.max(4, Math.ceil(nodeRef.current.length * .62))
                ? 1
                : .08
              : stage === 2
                ? wakeRank < Math.min(3, nodeRef.current.length)
                  ? 1
                  : .035
                : stage === 1
                  ? wakeRank === 0
                    ? 1
                    : .015
                  : .006

        const scaleBoost =
          node.libraryKind === 'shelf'
            ? selected
              ? 1.035
              : hoveredId === node._id
                ? 1.018
                : 1
            : selected
              ? 1.32
              : hoveredId === node._id
                ? 1.14
                : 1
        const desiredScale = visual.baseScale * scaleBoost
        visual.group.scale.lerp(
          new THREE.Vector3(desiredScale, desiredScale, desiredScale),
          selected ? .13 : .08,
        )

        if (node.libraryKind === 'shelf') {
          visual.group.rotation.y =
            Math.sin(elapsed * .085 + visual.phase) * .012
          visual.group.rotation.x =
            Math.sin(elapsed * .07 + visual.phase) * .004
          visual.group.rotation.z =
            Math.cos(elapsed * .065 + visual.phase) * .003
        } else {
          visual.group.rotation.y += selected ? .007 : .0022
          visual.group.rotation.x =
            Math.sin(elapsed * .22 + visual.phase) * .045
        }

        const shellMaterial = visual.shellMaterial
        const reflectionMaterial =
          visual.reflectionShell.material as THREE.MeshPhysicalMaterial
        const glowMaterial = visual.glow.material as THREE.MeshBasicMaterial
        const coreMaterial = visual.core.material as THREE.MeshPhysicalMaterial
        const orbitMaterial = visual.orbit.material as THREE.MeshBasicMaterial
        const labelMaterial = visual.label.material as THREE.SpriteMaterial

        shellMaterial.uniforms.uTime.value = elapsed
        shellMaterial.uniforms.uPulse.value =
          0.5 + 0.5 * Math.sin(elapsed * 1.15 + visual.phase)
        shellMaterial.uniforms.uFocus.value +=
          ((selected ? 1 : hoveredId === node._id ? 0.55 : 0) -
            shellMaterial.uniforms.uFocus.value) *
          0.08
        shellMaterial.uniforms.uOpacity.value +=
          (((visible ? 0.94 : 0.18) * introVisibility) -
            shellMaterial.uniforms.uOpacity.value) *
          0.08
        visual.miniWorld.update(
          elapsed,
          selected ? 1 : hoveredId === node._id ? 0.55 : 0,
        )
        if (!selected && node.libraryKind !== 'shelf') {
          visual.miniWorld.group.visible = true
          visual.core.visible = true
        } else if (node.libraryKind === 'shelf') {
          visual.miniWorld.group.visible = false
          visual.core.visible = false
        }
        reflectionMaterial.opacity +=
          ((selected
            ? .24
            : hoveredId === node._id
              ? .19
              : visible
                ? .12
                : .035) -
            reflectionMaterial.opacity) *
          .07
        reflectionMaterial.envMapIntensity +=
          ((selected
            ? settings.environmentIntensity * 1.5
            : settings.environmentIntensity * 1.08) -
            reflectionMaterial.envMapIntensity) *
          .05

        glowMaterial.opacity +=
          ((selected ? .2 : hoveredId === node._id ? .14 : visible ? .06 : .01) -
            glowMaterial.opacity) *
          .08
        coreMaterial.emissiveIntensity +=
          ((selected ? 3.45 : hoveredId === node._id ? 2.65 : 1.45) -
            coreMaterial.emissiveIntensity) *
          .07
        orbitMaterial.opacity +=
          ((selected ? .68 : hoveredId === node._id ? .42 : .13) -
            orbitMaterial.opacity) *
          .08
        const labelTarget =
          selected || hoveredId === node._id
            ? .9
            : observatoryModeRef.current
              ? node.frequency >= 4
                ? .24
                : .015
              : node.frequency >= 3
                ? .42
                : .07
        labelMaterial.opacity +=
          (((visible ? labelTarget : .04) * introVisibility) -
            labelMaterial.opacity) *
          .08

        visual.orbit.rotation.z += selected ? .014 : .004
        visual.core.rotation.x += .006
        visual.core.rotation.y -= .008
      }

      edgeVisuals.forEach((edgeVisual) => {
        const source = nodeVisuals.get(edgeVisual.source)?.group.position
        const target = nodeVisuals.get(edgeVisual.target)?.group.position
        if (!source || !target) return

        control.copy(source).lerp(target, .5)
        control.z += 1.05 + Math.min(edgeVisual.weight, 4) * .15
        control.y +=
          Math.sin(elapsed * .36 + edgeVisual.phase * Math.PI * 2) * .28

        for (let index = 0; index < samples; index += 1) {
          const t = index / (samples - 1)
          const oneMinus = 1 - t
          curvePoint
            .copy(source)
            .multiplyScalar(oneMinus * oneMinus)
            .addScaledVector(control, 2 * oneMinus * t)
            .addScaledVector(target, t * t)

          const offset = index * 3
          edgeVisual.positions[offset] = curvePoint.x
          edgeVisual.positions[offset + 1] = curvePoint.y
          edgeVisual.positions[offset + 2] = curvePoint.z
        }
        ;(
          edgeVisual.geometry.getAttribute('position') as THREE.BufferAttribute
        ).needsUpdate = true

        const edgeHighlighted =
          !activeRef.current || relatedEdgeIdsRef.current.has(
            `${edgeVisual.source < edgeVisual.target
              ? `${edgeVisual.source}::${edgeVisual.target}`
              : `${edgeVisual.target}::${edgeVisual.source}`}`,
          )
        const touchesSelected =
          currentSelectedId === edgeVisual.source ||
          currentSelectedId === edgeVisual.target
        const introEdgeFactor =
          introStageRef.current >= 4
            ? 1
            : introStageRef.current === 3
              ? .72
              : introStageRef.current === 2
                ? .12
                : .015
        const desiredOpacity = edgeHighlighted
          ? Math.min(
              .5,
              (.1 +
                edgeVisual.weight * .07 +
                (touchesSelected ? selectionPulseStrength * .22 : 0)) *
                introEdgeFactor,
            )
          : .028 * introEdgeFactor
        edgeVisual.material.opacity +=
          (desiredOpacity - edgeVisual.material.opacity) * .08

        const isRelationEdge = Boolean(
          relationTravel &&
            ((edgeVisual.source === relationTravel.from &&
              edgeVisual.target === relationTravel.to) ||
              (edgeVisual.target === relationTravel.from &&
                edgeVisual.source === relationTravel.to)),
        )
        const relationProgress = relationTravel
          ? Math.min(1, Math.max(0, (elapsed - relationTravel.startedAt) / .92))
          : 0
        const relationForward =
          relationTravel?.from === edgeVisual.source
        const relationT = relationForward
          ? relationProgress
          : 1 - relationProgress
        const pulseT = isRelationEdge
          ? relationT
          : (elapsed * (.07 + Math.min(edgeVisual.weight, 4) * .016) +
              edgeVisual.phase) %
            1
        const oneMinus = 1 - pulseT
        edgeVisual.pulse.position
          .copy(source)
          .multiplyScalar(oneMinus * oneMinus)
          .addScaledVector(control, 2 * oneMinus * pulseT)
          .addScaledVector(target, pulseT * pulseT)
        ;(edgeVisual.pulse.material as THREE.MeshBasicMaterial).opacity =
          isRelationEdge
            ? .92 * (1 - relationProgress * .3)
            : edgeHighlighted
              ? Math.min(.5, .34 + (touchesSelected ? selectionPulseStrength * .3 : 0))
              : .05
      })

      if (
        relationTravel &&
        elapsed - relationTravel.startedAt > 1.05
      ) {
        relationTravel = null
      }

      const selectedNode = selectedRef.current
        ? nodeRef.current.find((node) => node._id === selectedRef.current) ?? null
        : null
      const selectedVisual = selectedNode
        ? nodeVisuals.get(selectedNode._id) ?? null
        : null

      if (selectedNode) {
        ensureDreamCell(selectedNode)
      } else if (activeCellId) {
        releaseDreamCell()
      }

      if (activeCell && selectedVisual) {
        activeCell.update(elapsed, 1)
        activeCell.render(renderer)

        if (spatialAudio) {
          spatialAudio.setFocus(1)

          if (soundEnabledRef.current && !spatialAudioStarted) {
            spatialAudioStarted = true
            void spatialAudio.ensurePlaying().catch(() => {
              spatialAudioStarted = false
            })
          } else if (!soundEnabledRef.current && spatialAudioStarted) {
            if (spatialAudio.audio.isPlaying) spatialAudio.audio.pause()
            spatialAudioStarted = false
          }
        }
      }

      depthOfField.enabled = Boolean(selectedVisual) && settings.depthOfField
      if (selectedVisual && settings.depthOfField) {
        const focusDistance = camera.position.distanceTo(
          selectedVisual.group.position,
        )
        const depthOfFieldUniforms =
          depthOfField.uniforms as BokehUniformMap

        depthOfFieldUniforms.focus.value +=
          (focusDistance - depthOfFieldUniforms.focus.value) * 0.08
        depthOfFieldUniforms.aperture.value +=
          (0.000065 - depthOfFieldUniforms.aperture.value) * 0.05
        depthOfFieldUniforms.maxblur.value +=
          (settings.maxBlur - depthOfFieldUniforms.maxblur.value) * 0.05
      }

      bloom.strength +=
        ((selectedVisual
          ? settings.bloomStrength * 1.1
          : settings.bloomStrength) -
          bloom.strength) *
        0.035

      dreamPost.uniforms.uTime.value = elapsed
      if (diveMode !== 'entering') {
        dreamPost.uniforms.uTravel.value +=
          ((selectedVisual ? .12 : 0) - dreamPost.uniforms.uTravel.value) *
          .03
      }
      renderer.toneMappingExposure +=
        ((selectedVisual ? 0.9 : 0.94) - renderer.toneMappingExposure) *
        .025

      if (scene.fog instanceof THREE.FogExp2) {
        const sceneReveal = Math.min(1, elapsed / 1.7)
        const birthFog = (1 - sceneReveal) * 0.072
        scene.fog.density +=
          ((selectedVisual
            ? settings.fogDensity * 1.18 + birthFog
            : settings.fogDensity + birthFog) -
            scene.fog.density) *
          0.04
      }

      violetLight.intensity +=
        ((selectedVisual ? 16 : 12) - violetLight.intensity) * 0.025
      cyanLight.intensity +=
        ((selectedVisual ? 15 : 11) - cyanLight.intensity) * 0.025

      if (flightActive && flightInitialized) {
        const routeActive = Boolean(flightRoute)
        const routeProgress = flightRoute
          ? THREE.MathUtils.clamp(
              (elapsed - flightRoute.startedAt) / flightRoute.duration,
              0,
              1,
            )
          : 0

        if (flightRoute) {
          const oneMinus = 1 - routeProgress
          const routePoint = new THREE.Vector3()
            .copy(flightRoute.source)
            .multiplyScalar(oneMinus * oneMinus)
            .addScaledVector(
              flightRoute.control,
              2 * oneMinus * routeProgress,
            )
            .addScaledVector(
              flightRoute.target,
              routeProgress * routeProgress,
            )

          const lookProgress = Math.min(1, routeProgress + .035)
          const lookOneMinus = 1 - lookProgress
          const routeLook = new THREE.Vector3()
            .copy(flightRoute.source)
            .multiplyScalar(lookOneMinus * lookOneMinus)
            .addScaledVector(
              flightRoute.control,
              2 * lookOneMinus * lookProgress,
            )
            .addScaledVector(
              flightRoute.target,
              lookProgress * lookProgress,
            )

          flightPosition.copy(routePoint)
          camera.position.copy(routePoint)
          camera.lookAt(routeLook)
          camera.fov +=
            ((50 + Math.sin(routeProgress * Math.PI) * 7) - camera.fov) *
            .12
          camera.updateProjectionMatrix()
          dreamPost.uniforms.uTravel.value +=
            ((.6 + Math.sin(routeProgress * Math.PI) * .34) -
              dreamPost.uniforms.uTravel.value) *
            .12

          if (routeProgress >= 1) {
            const arrived = nodeRef.current.find(
              (node) => node._id === flightRoute?.targetId,
            )
            if (arrived) {
              flightNearestId = arrived._id
              hoveredId = arrived._id
              onNodeHoverRef.current(arrived)
            }
            flightEuler.setFromQuaternion(camera.quaternion, 'YXZ')
            flightYaw = flightEuler.y
            flightPitch = flightEuler.x
            flightRoute = null
            flightVelocity.set(0, 0, 0)
          }
        }

        flightForward.set(
          -Math.sin(flightYaw) * Math.cos(flightPitch),
          Math.sin(flightPitch),
          -Math.cos(flightYaw) * Math.cos(flightPitch),
        ).normalize()
        flightRight.crossVectors(flightForward, flightUp).normalize()
        flightMove.set(0, 0, 0)

        if (flightKeys.has('KeyW')) flightMove.add(flightForward)
        if (flightKeys.has('KeyS')) flightMove.sub(flightForward)
        if (flightKeys.has('KeyD')) flightMove.add(flightRight)
        if (flightKeys.has('KeyA')) flightMove.sub(flightRight)
        if (flightKeys.has('Space')) flightMove.add(flightUp)
        if (
          flightKeys.has('ControlLeft') ||
          flightKeys.has('ControlRight') ||
          flightKeys.has('KeyQ')
        ) {
          flightMove.sub(flightUp)
        }

        if (flightMove.lengthSq() > 0) flightMove.normalize()

        const boosted =
          flightKeys.has('ShiftLeft') ||
          flightKeys.has('ShiftRight')
        const flightSpeed = boosted ? 7.2 : 3.15
        const desiredVelocity = flightMove.multiplyScalar(flightSpeed)
        const damping = 1 - Math.exp(-delta * 7.5)

        if (!routeActive) {
          flightVelocity.lerp(desiredVelocity, damping)
          flightPosition.addScaledVector(flightVelocity, delta)
        } else {
          flightVelocity.multiplyScalar(.72)
        }

        const distanceFromOrigin = flightPosition.length()
        if (distanceFromOrigin > 34) {
          flightPosition.multiplyScalar(34 / distanceFromOrigin)
          flightVelocity.multiplyScalar(.35)
        }
        flightPosition.y = THREE.MathUtils.clamp(
          flightPosition.y,
          -12,
          14,
        )

        if (!routeActive) {
          nodeVisuals.forEach((visual) => {
            visual.group.getWorldPosition(flightCollisionPoint)
            flightCollisionDelta
              .copy(flightPosition)
              .sub(flightCollisionPoint)

            const distance = flightCollisionDelta.length()
            const minimumDistance =
              .68 + visual.baseScale * .62

            if (distance > .001 && distance < minimumDistance) {
              flightCollisionDelta
                .normalize()
                .multiplyScalar(minimumDistance - distance)
              flightPosition.add(flightCollisionDelta)
              flightVelocity.multiplyScalar(.58)
            }
          })
        }

        if (!routeActive) {
          camera.position.copy(flightPosition)
          camera.rotation.order = 'YXZ'
          camera.rotation.y = flightYaw
          camera.rotation.x = flightPitch
        }
        camera.rotation.z = THREE.MathUtils.lerp(
          camera.rotation.z,
          -flightVelocity.dot(flightRight) * .008,
          .08,
        )

        const speedRatio = routeActive
          ? .72 + Math.sin(routeProgress * Math.PI) * .28
          : Math.min(1, flightVelocity.length() / 7.2)
        camera.fov +=
          ((43 + speedRatio * 9) - camera.fov) * .065
        camera.updateProjectionMatrix()

        const nearest = nearestFlightNode(3.5)
        const nearestId = nearest?._id ?? null
        if (nearestId !== flightNearestId) {
          flightNearestId = nearestId
          hoveredId = nearestId
          onNodeHoverRef.current(nearest)
        }

        depthOfField.enabled = false
        dreamPost.uniforms.uTravel.value +=
          ((speedRatio * .72) - dreamPost.uniforms.uTravel.value) * .08
        dreamPost.uniforms.uFlareStrength.value +=
          ((speedRatio * .09) - dreamPost.uniforms.uFlareStrength.value) *
          .06
      } else if (selectedVisual) {
        const position = selectedVisual.group.position

        if (diveMode === 'entering' && activeDive) {
          const travelProgress = Math.min(
            1,
            Math.max(0, (elapsed - diveTransitionStartedAt) / 1.18),
          )
          const eased =
            travelProgress < .5
              ? 4 * travelProgress * travelProgress * travelProgress
              : 1 - Math.pow(-2 * travelProgress + 2, 3) / 2

          cameraTarget.set(
            position.x + (camera.position.x - position.x) * (1 - eased) * .25,
            position.y + (camera.position.y - position.y) * (1 - eased) * .2,
            position.z + 4.6 * (1 - eased) + .1,
          )
          lookTarget.lerp(position, .18)
          dreamPost.uniforms.uTravel.value = eased

          if (travelProgress >= 1) {
            diveMode = 'inside'
            activeDive.setLookTarget(pointerTarget.x, pointerTarget.y)
            renderer.domElement.style.cursor = 'crosshair'
          }
        } else {
          const side = position.x > 0 ? -1 : 1
          cameraTarget.set(
            position.x + side * 2.8,
            position.y + .2,
            position.z + 5.7 / Math.max(.9, zoomRef.current),
          )
          lookTarget.lerp(position, .085)
        }
      } else {
        const observatory = observatoryModeRef.current
        cameraTarget.set(
          observatory
            ? pointerParallax.x * .7
            : panRef.current.x / 125 + pointerParallax.x * .34,
          observatory
            ? pointerParallax.y * .42
            : -panRef.current.y / 125 + pointerParallax.y * .2,
          observatory
            ? 22.5 / Math.max(.72, Math.min(2.35, zoomRef.current))
            : 10.8 / Math.max(.68, zoomRef.current),
        )
        lookTarget.lerp(
          tempVector.set(
            observatory ? 0 : panRef.current.x / 180,
            observatory ? 0 : -panRef.current.y / 180,
            0,
          ),
          observatory ? .035 : .06,
        )
      }

      if (!flightActive) {
        camera.position.lerp(cameraTarget, selectedVisual ? .075 : .055)
        camera.lookAt(lookTarget)
        camera.fov += (43 - camera.fov) * .06
        camera.updateProjectionMatrix()
      }

      if (selectedVisual && !flightActive) {
        const projected = selectedVisual.group.position.clone().project(camera)
        const selectedProfile = selectedNode
          ? getProfileForNode(selectedNode)
          : null
        const flareX = projected.x * .5 + .5
        const flareY = -projected.y * .5 + .5
        dreamPost.uniforms.uFlarePosition.value.set(flareX, flareY)
        dreamPost.uniforms.uFlareStrength.value +=
          ((selectedProfile &&
            (selectedProfile.lucid ||
              selectedProfile.recurrence >= 3 ||
              selectedProfile.secret)
            ? qualityRef.current === 'cinematic'
              ? .34
              : .16
            : .06) -
            dreamPost.uniforms.uFlareStrength.value) *
          .06

        const visible =
          projected.z > -1 &&
          projected.z < 1 &&
          Math.abs(projected.x) < 1.25 &&
          Math.abs(projected.y) < 1.25
        const nextProjection = {
          x: (projected.x * .5 + .5) * 100,
          y: (-projected.y * .5 + .5) * 100,
          visible,
        }

        if (
          Math.abs(nextProjection.x - lastProjection.x) > .15 ||
          Math.abs(nextProjection.y - lastProjection.y) > .15 ||
          nextProjection.visible !== lastProjection.visible
        ) {
          lastProjection = nextProjection
          onProjectionChangeRef.current(nextProjection)
        }
      } else if (!flightActive) {
        dreamPost.uniforms.uFlareStrength.value +=
          (0 - dreamPost.uniforms.uFlareStrength.value) * .05

        if (lastProjection.visible) {
          lastProjection = {x: -999, y: -999, visible: false}
          onProjectionChangeRef.current(null)
        }
      }

      composer.render()
    }

    animationFrame = requestAnimationFrame(animate)

    return () => {
      cancelAnimationFrame(animationFrame)
      resizeObserver.disconnect()

      renderer.domElement.removeEventListener('pointermove', handlePointerMove)
      renderer.domElement.removeEventListener('pointerdown', handlePointerDown)
      renderer.domElement.removeEventListener('pointerup', handlePointerUp)
      renderer.domElement.removeEventListener('pointercancel', handlePointerLeave)
      renderer.domElement.removeEventListener('pointerleave', handlePointerLeave)
      renderer.domElement.removeEventListener('wheel', handleWheel)
      renderer.domElement.removeEventListener('dblclick', handleDoubleClick)
      document.removeEventListener('mousemove', handleFlightMouse)
      window.removeEventListener('keydown', handleFlightKeyDown)
      window.removeEventListener('keyup', handleFlightKeyUp)
      if (document.pointerLockElement === renderer.domElement) {
        document.exitPointerLock?.()
      }

      if (holdTimer !== null) window.clearTimeout(holdTimer)
      clusterAudios.forEach((cluster) => {
        cluster.visual.group.remove(cluster.audio.audio)
        cluster.audio.dispose()
      })
      if (diveMode !== 'none') onDiveStateChangeRef.current(false)
      disposeDive()
      releaseDreamCell()
      camera.remove(listener)

      shelfSideGeometry.dispose()
      shelfBoardGeometry.dispose()
      shelfBackGeometry.dispose()
      shelfBookGeometry.dispose()
      shelfCoverGeometry.dispose()
      shelfAccentGeometry.dispose()
      shelfPickGeometry.dispose()
      shelfFrameMaterial.dispose()
      shelfBoardMaterial.dispose()
      shelfBookMaterials.forEach((material) => material.dispose())
      shelfCoverMaterials.forEach((material) => material.dispose())
      shelfCoverTextures.forEach((texture) => texture.dispose())
      shelfAccentMaterial.dispose()
      shelfPickMaterial.dispose()

      nodeVisuals.forEach((visual) => {
        ;(visual.shell.geometry as THREE.BufferGeometry).dispose()
        ;(visual.reflectionShell.geometry as THREE.BufferGeometry).dispose()
        ;(visual.glow.geometry as THREE.BufferGeometry).dispose()
        ;(visual.core.geometry as THREE.BufferGeometry).dispose()
        ;(visual.orbit.geometry as THREE.BufferGeometry).dispose()
        ;(visual.shockwave.geometry as THREE.BufferGeometry).dispose()
        visual.shellMaterial.dispose()
        ;(visual.reflectionShell.material as THREE.Material).dispose()
        visual.miniWorld.dispose()
        ;(visual.glow.material as THREE.Material).dispose()
        ;(visual.core.material as THREE.Material).dispose()
        ;(visual.orbit.material as THREE.Material).dispose()
        ;(visual.shockwave.material as THREE.Material).dispose()
        const labelMaterial = visual.label.material as THREE.SpriteMaterial
        labelMaterial.map?.dispose()
        labelMaterial.dispose()
      })

      edgeVisuals.forEach((edgeVisual) => {
        edgeVisual.geometry.dispose()
        edgeVisual.material.dispose()
        ;(edgeVisual.pulse.geometry as THREE.BufferGeometry).dispose()
        ;(edgeVisual.pulse.material as THREE.Material).dispose()
      })

      lucidRiver?.geometry.dispose()
      lucidRiver?.material.dispose()
      categoryNebulae.forEach((cluster) => {
        cluster.texture.dispose()
        cluster.material.dispose()
        scene.remove(cluster.sprite)
      })
      supernovae.forEach((event) => {
        event.geometry.dispose()
        event.material.dispose()
      })

      fragments.forEach((fragment) => {
        ;(fragment.geometry as THREE.BufferGeometry).dispose()
      })
      fragmentMaterial.dispose()

      landmarkGeometries.forEach((geometry) => geometry.dispose())
      landmarkMaterials.forEach((material) => material.dispose())

      secretArtifacts.forEach((secret) => {
        secret.geometries.forEach((geometry) => geometry.dispose())
        secret.materials.forEach((material) => material.dispose())
      })

      foregroundFog.forEach((sprite) => {
        const material = sprite.material as THREE.SpriteMaterial
        material.map?.dispose()
        material.dispose()
        scene.remove(sprite)
      })

      nearDustGeometry.dispose()
      nearDustMaterial.dispose()
      scene.remove(nearDust)
      shaftGeometries.forEach((geometry) => geometry.dispose())
      shaftMaterials.forEach((material) => material.dispose())

      nebulae.forEach((sprite) => {
        const material = sprite.material as THREE.SpriteMaterial
        material.map?.dispose()
        material.dispose()
      })

      starGeometry.dispose()
      starMaterial.dispose()
      scene.environment = null
      cinematicEnvironment.dispose()
      composer.dispose()
      renderer.dispose()
      container.removeChild(renderer.domElement)
    }
  }, [graphKey])

  return (
    <div
      ref={hostRef}
      className={styles.webglShell}
      role="application"
      aria-label="Interactive 3D dream map"
    />
  )
}
