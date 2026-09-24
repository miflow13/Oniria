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
import {
  DEFAULT_LIBRARY_WORLD_CONFIG,
  type LibraryWorldConfig,
} from '@/lib/libraryWorldConfig'
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
import {
  ARCHIVE_PATH_RENDER_BAYS,
  ARCHIVE_WALKWAY_HALF_WIDTH,
  ARCHIVE_WALKWAY_Y_OFFSET,
  archiveBayFromWorldZ,
  archiveDistrictGridLaneOffset,
  archiveDistrictInfluence,
  archiveGridRoadSegments,
  archiveOffsetPathPoint,
  archivePathFrame,
  archivePathPoint,
  archiveWalkSurfaceAtPosition,
  archiveWalkwayHalfWidthAtBay,
} from './libraryLayout'
import {createLibraryAudio} from './libraryAudio'
import {
  createLibraryReadingRitual,
  type LibraryBookVisual,
} from './libraryReadingRitual'
import {
  createLibraryAtmosphere,
  getLibraryAtmosphereVisualPreset,
} from './libraryAtmosphere'
import {createLibraryBuilding} from './libraryBuilding'
import {createLibraryLayoutAuthoring} from './libraryLayoutAuthoring'
import {loadLibraryAsset} from './libraryAssets'
import {
  createFloatingPropRegistry,
  floatingPhase,
} from './libraryFloating'
import {
  LIBRARY_BUILDING_BOUNDS,
  LIBRARY_EYE_HEIGHT,
  LIBRARY_SPAWN,
  clampLibraryWalkPosition,
  libraryRoomContainsPoint,
  roomForDistrict,
} from './libraryRoomLayout'

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
  libraryYaw?: number
  libraryDoubleSided?: boolean
  libraryShelfEndCaps?: 'none' | 'left' | 'right'
  libraryFloatId?: string
  libraryPathBay?: number
  libraryDistrictId?: string
  libraryWidthScale?: number
  librarySlotId?: string
  libraryOccupancyKey?: string
  libraryShelfLifecycle?: 'forming' | 'active'
  libraryShelfVitality?: number
  libraryMaterializedAt?: string
  libraryBooks?: Array<{
    id: string
    title: string
    author?: string
    coverUrl?: string
    activity?: number
    fresh?: boolean
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

export type LibraryMovementMode = 'walk' | 'fly'
export type LibraryReadingBook = {
  nodeId: string
  index: number
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
  libraryMovementMode?: LibraryMovementMode
  libraryWorldConfig?: LibraryWorldConfig
  libraryReadingBook?: LibraryReadingBook | null
  inputBlocked?: boolean
  onZoomChange: (zoom: number) => void
  onPanChange: (pan: Pan) => void
  onNodeHover: (node: DreamWorldNode | null) => void
  onNodeSelect: (node: DreamWorldNode) => void
  onBookSelect?: (nodeId: string, bookIndex: number) => void
  onFlightNavigationChange?: (state: {
    nearestId: string | null
    routeTargetId: string | null
  }) => void
  onBackgroundClick: () => void
  onProjectionChange: (projection: ProjectionPoint | null) => void
  onDiveStateChange: (active: boolean, title?: string) => void
  onDiveDreamChange: (dreamId: string, title: string, depth: number) => void
  onFlightModeChange: (active: boolean) => void
  onLibraryMovementModeChange?: (
    mode: LibraryMovementMode,
  ) => void
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
  gradient.addColorStop(0, 'rgba(4, 8, 20, .97)')
  gradient.addColorStop(.72, 'rgba(8, 14, 31, .94)')
  gradient.addColorStop(1, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, .2)`)

  roundedRect(context, 26, 20, 588, 102, 38)
  context.fillStyle = gradient
  context.fill()
  context.strokeStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, .58)`
  context.lineWidth = 3
  context.stroke()

  context.shadowColor = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, .48)`
  context.shadowBlur = 16
  context.fillStyle = '#f1f6ff'
  context.font = '500 31px system-ui, sans-serif'
  context.textBaseline = 'middle'
  context.fillText(node.icon || '✦', 58, 71)

  context.shadowBlur = 0
  context.fillStyle = '#e5ecfb'
  context.font = '700 31px system-ui, sans-serif'
  const title = node.name.length > 25 ? `${node.name.slice(0, 24)}…` : node.name
  context.fillText(title, 110, 61)

  context.fillStyle = 'rgba(205, 217, 235, .92)'
  context.font = '600 18px system-ui, sans-serif'
  context.fillText(
    node.libraryKind === 'shelf'
      ? `${node.articleCount ?? node.frequency} articles · ${node.subtitle ?? 'DEV shelf'}`
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

function createLibraryRouteLabelTexture(
  title: string,
  code: string,
  accent = '#80deeb',
) {
  const canvas = document.createElement('canvas')
  canvas.width = 768
  canvas.height = 192
  const context = canvas.getContext('2d')
  if (!context) return new THREE.CanvasTexture(canvas)

  context.clearRect(0, 0, canvas.width, canvas.height)
  const gradient = context.createLinearGradient(0, 0, canvas.width, 0)
  gradient.addColorStop(0, accent + '12')
  gradient.addColorStop(.5, accent + '42')
  gradient.addColorStop(1, accent + '12')
  context.fillStyle = gradient
  context.fillRect(0, 18, canvas.width, 156)

  context.strokeStyle = accent
  context.globalAlpha = .72
  context.lineWidth = 4
  context.strokeRect(18, 34, canvas.width - 36, 124)

  context.globalAlpha = 1
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.fillStyle = 'rgba(229, 247, 255, .94)'
  context.font = '800 58px system-ui, sans-serif'
  context.fillText(title, canvas.width / 2, 82)

  context.fillStyle = 'rgba(151, 207, 233, .84)'
  context.font = '700 26px ui-monospace, monospace'
  context.fillText(code, canvas.width / 2, 132)

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.minFilter = THREE.LinearFilter
  texture.magFilter = THREE.LinearFilter
  return texture
}

function createLibraryWelcomeTexture(config: LibraryWorldConfig) {
  const canvas = document.createElement('canvas')
  canvas.width = 1680
  canvas.height = 960
  const context = canvas.getContext('2d')
  if (!context) return new THREE.CanvasTexture(canvas)

  const drawWrappedText = (
    text: string,
    x: number,
    y: number,
    maxWidth: number,
    lineHeight: number,
  ) => {
    const words = text.split(' ')
    let line = ''
    let cursorY = y

    words.forEach((word, index) => {
      const candidate = line ? line + ' ' + word : word
      const measured = context.measureText(candidate).width
      if (measured > maxWidth && line) {
        context.fillText(line, x, cursorY)
        cursorY += lineHeight
        line = word
      } else {
        line = candidate
      }

      if (index === words.length - 1 && line) {
        context.fillText(line, x, cursorY)
        cursorY += lineHeight
      }
    })

    return cursorY
  }

  context.clearRect(0, 0, canvas.width, canvas.height)

  const background = context.createLinearGradient(
    0,
    0,
    canvas.width,
    canvas.height,
  )
  background.addColorStop(0, 'rgba(3, 8, 18, .985)')
  background.addColorStop(.56, 'rgba(8, 16, 32, .97)')
  background.addColorStop(1, 'rgba(30, 18, 55, .955)')

  roundedRect(context, 36, 36, 1608, 888, 48)
  context.fillStyle = background
  context.fill()
  context.strokeStyle = 'rgba(99, 220, 236, .58)'
  context.lineWidth = 5
  context.stroke()

  context.textAlign = 'left'
  context.textBaseline = 'top'

  context.fillStyle = '#f5fbff'
  context.font = '800 86px system-ui, sans-serif'
  context.fillText(config.welcomeTitle, 96, 82)

  context.fillStyle = 'rgba(158, 225, 238, .94)'
  context.font = '700 30px ui-monospace, monospace'
  context.fillText(
    config.welcomeSubtitle.toUpperCase(),
    102,
    188,
  )

  context.strokeStyle = 'rgba(115, 195, 227, .22)'
  context.lineWidth = 2
  context.beginPath()
  context.moveTo(100, 250)
  context.lineTo(1580, 250)
  context.stroke()

  const cards = [
    {
      x: 92,
      width: 456,
      title: 'WHAT THIS IS',
      accent: 'rgba(101, 212, 223, .18)',
      body: [
        config.welcomeBody,
        config.source === 'sanity'
          ? 'This archive is structured and curated live through Sanity.'
          : 'Sanity can author the districts, curation, atmosphere, and journeys.',
      ],
    },
    {
      x: 612,
      width: 456,
      title: 'HOW IT IS BUILT',
      accent: 'rgba(140, 124, 255, .18)',
      body: [
        'Next.js + React + TypeScript + Three.js.',
        'DEV API data is streamed into Sanity-authored rooms, physical shelves, covers, and atmosphere.',
      ],
    },
    {
      x: 1132,
      width: 456,
      title: 'CONTROLS',
      accent: 'rgba(207, 140, 255, .18)',
      controls: [
        ['WASD', 'move'],
        ['Mouse', 'look'],
        ['E', 'inspect / close'],
        ['G', 'toggle WALK / FLY'],
                ['Click book', 'open article'],
        ['Esc', 'release mouse'],
      ],
    },
  ] as const

  cards.forEach((card) => {
    roundedRect(context, card.x, 300, card.width, 490, 28)
    context.fillStyle = card.accent
    context.fill()
    context.strokeStyle = 'rgba(121, 191, 224, .2)'
    context.lineWidth = 2
    context.stroke()

    context.fillStyle = 'rgba(145, 220, 237, .96)'
    context.font = '800 31px system-ui, sans-serif'
    context.fillText(card.title, card.x + 34, 336)

    context.strokeStyle = 'rgba(121, 191, 224, .22)'
    context.beginPath()
    context.moveTo(card.x + 34, 388)
    context.lineTo(card.x + card.width - 34, 388)
    context.stroke()

    if ('body' in card) {
      context.fillStyle = 'rgba(230, 239, 249, .92)'
      context.font = '500 27px system-ui, sans-serif'
      let cursorY = 424
      card.body.forEach((paragraph) => {
        cursorY = drawWrappedText(
          paragraph,
          card.x + 34,
          cursorY,
          card.width - 68,
          41,
        )
        cursorY += 22
      })
    }

    if ('controls' in card) {
      let cursorY = 422
      card.controls.forEach(([key, action]) => {
        context.fillStyle = 'rgba(194, 178, 242, .98)'
        context.font = '800 25px ui-monospace, monospace'
        context.fillText(key, card.x + 34, cursorY)

        context.fillStyle = 'rgba(229, 239, 248, .92)'
        context.font = '500 25px system-ui, sans-serif'
        context.fillText(
          action,
          card.x + 178,
          cursorY,
        )
        cursorY += 50
      })
    }
  })

  context.fillStyle = 'rgba(193, 177, 239, .94)'
  context.font = '700 25px ui-monospace, monospace'
  context.fillText(
    config.archiveStatus +
      ' · follow the central corridor · room signs mark each collection',
    100,
    846,
  )

  context.fillStyle = 'rgba(150, 204, 224, .78)'
  context.font = '600 22px system-ui, sans-serif'
  context.fillText(
    'Press G anytime to switch between grounded exploration and free flight.',
    100,
    886,
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

  const rgbaMatch = color.match(
    /rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)/,
  )
  const red = rgbaMatch?.[1] ?? '120'
  const green = rgbaMatch?.[2] ?? '120'
  const blue = rgbaMatch?.[3] ?? '180'
  const alpha = Number(rgbaMatch?.[4] ?? .36)
  const rgba = (multiplier: number) =>
    `rgba(${red}, ${green}, ${blue}, ${Math.max(
      0,
      Math.min(1, alpha * multiplier),
    )})`

  const gradient = context.createRadialGradient(
    256,
    256,
    0,
    256,
    256,
    256,
  )
  gradient.addColorStop(0, rgba(1))
  gradient.addColorStop(.22, rgba(.58))
  gradient.addColorStop(.5, rgba(.24))
  gradient.addColorStop(.76, rgba(.07))
  gradient.addColorStop(1, 'rgba(0, 0, 0, 0)')
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
  libraryMovementMode = 'walk',
  libraryWorldConfig = DEFAULT_LIBRARY_WORLD_CONFIG,
  libraryReadingBook = null,
  inputBlocked = false,
  onZoomChange,
  onPanChange,
  onNodeHover,
  onNodeSelect,
  onBookSelect,
  onFlightNavigationChange,
  onBackgroundClick,
  onProjectionChange,
  onDiveStateChange,
  onDiveDreamChange,
  onFlightModeChange,
  onLibraryMovementModeChange,
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
  const onFlightNavigationChangeRef = useRef(onFlightNavigationChange)
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
  const libraryMovementModeRef =
    useRef<LibraryMovementMode>(libraryMovementMode)
  const libraryReadingBookRef =
    useRef<LibraryReadingBook | null>(libraryReadingBook)
  const inputBlockedRef = useRef(inputBlocked)
  const libraryFlightStateRef = useRef<{
    position: [number, number, number]
    quaternion: [number, number, number, number]
  } | null>(null)
  const onDiveStateChangeRef = useRef(onDiveStateChange)
  const onDiveDreamChangeRef = useRef(onDiveDreamChange)
  const onFlightModeChangeRef = useRef(onFlightModeChange)
  const onLibraryMovementModeChangeRef = useRef(
    onLibraryMovementModeChange,
  )

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
  onFlightNavigationChangeRef.current = onFlightNavigationChange
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
  libraryMovementModeRef.current = libraryMovementMode
  libraryReadingBookRef.current = libraryReadingBook
  inputBlockedRef.current = inputBlocked
  onDiveStateChangeRef.current = onDiveStateChange
  onDiveDreamChangeRef.current = onDiveDreamChange
  onFlightModeChangeRef.current = onFlightModeChange
  onLibraryMovementModeChangeRef.current =
    onLibraryMovementModeChange

  const graphKey = useMemo(
    () =>
      `${quality}::${nodes
        .map(
          (node) =>
            `${node._id}:${node.articleCount ?? 0}:${node.libraryBooks?.map((book) => book.id + ':' + (book.coverUrl ?? '')).join('|') ?? ''}:${node.world?.join(',') ?? ''}:${node.libraryYaw ?? ''}:${node.libraryDoubleSided ? 1 : 0}:${node.libraryShelfEndCaps ?? ''}:${node.libraryFloatId ?? ''}:${node.libraryPathBay ?? ''}:${node.libraryWidthScale ?? 1}`,
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

  const libraryWorldKey = useMemo(
    // Include the complete Sanity payload (including sanityRevision) so any
    // authored world change invalidates the scene. Previously only a subset
    // of fields participated in the key, allowing valid Sanity edits to land
    // in React state without rebuilding the Three.js world.
    () => JSON.stringify(libraryWorldConfig),
    [libraryWorldConfig],
  )

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const container: HTMLDivElement = host
    let sceneDisposed = false

    const settings = getQualitySettings(qualityRef.current)
    const activeLibraryConfig =
      libraryWorldConfig ?? DEFAULT_LIBRARY_WORLD_CONFIG
    const activeDistricts =
      activeLibraryConfig.districts.length > 0
        ? activeLibraryConfig.districts
        : DEFAULT_LIBRARY_WORLD_CONFIG.districts
    const roomDistrictEntries = activeDistricts.map(
      (district, index) => {
        const room = roomForDistrict(district, index)
        return {
          district,
          room,
          center: room.center,
        }
      },
    )
    const nearestRoomEntry = (x: number, z: number) => {
      const containingRooms = roomDistrictEntries.filter(
        (entry) =>
          libraryRoomContainsPoint(
            entry.room,
            x,
            z,
            .18,
          ),
      )

      if (containingRooms.length === 0) {
        return null
      }

      // Boundary margins can make adjacent room rectangles overlap by a tiny
      // amount. Resolve that edge case by choosing the physically nearest
      // room center, while still requiring the point to be inside a real
      // rectangular room footprint.
      return containingRooms.sort((a, b) => {
        const aDx = x - a.center[0]
        const aDz = z - a.center[1]
        const bDx = x - b.center[0]
        const bDz = z - b.center[1]
        return (
          aDx * aDx +
          aDz * aDz -
          (bDx * bDx + bDz * bDz)
        )
      })[0] ?? null
    }

    const nearestAuthoringRoomEntry = (
      x: number,
      z: number,
    ) => {
      // Authoring must be more forgiving than gameplay detection. Measure
      // distance to each room's architectural rectangle and choose the
      // closest room even when the camera is touching/slightly beyond an
      // inferred wall edge.
      let nearest =
        roomDistrictEntries[0] ?? null
      let nearestDistance = Infinity

      roomDistrictEntries.forEach((entry) => {
        const bounds = {
          minX: Math.min(
            entry.room.doorway[0],
            entry.room.center[0] < 0
              ? LIBRARY_BUILDING_BOUNDS.minX
              : LIBRARY_BUILDING_BOUNDS.maxX,
          ),
          maxX: Math.max(
            entry.room.doorway[0],
            entry.room.center[0] < 0
              ? LIBRARY_BUILDING_BOUNDS.minX
              : LIBRARY_BUILDING_BOUNDS.maxX,
          ),
          minZ: entry.room.center[1] - 10.6,
          maxZ: entry.room.center[1] + 10.6,
        }

        const dx =
          x < bounds.minX
            ? bounds.minX - x
            : x > bounds.maxX
              ? x - bounds.maxX
              : 0
        const dz =
          z < bounds.minZ
            ? bounds.minZ - z
            : z > bounds.maxZ
              ? z - bounds.maxZ
              : 0
        const distance = dx * dx + dz * dz

        if (
          distance < nearestDistance ||
          (distance === nearestDistance &&
            nearest &&
            Math.hypot(
              x - entry.center[0],
              z - entry.center[1],
            ) <
              Math.hypot(
                x - nearest.center[0],
                z - nearest.center[1],
              ))
        ) {
          nearest = entry
          nearestDistance = distance
        }
      })

      return nearest
    }
    const libraryMode = nodeRef.current.some(
      (node) => node.libraryKind === 'shelf',
    )
    // The cinematic renderer is now the engine for an enclosed physical
    // library. Keep its lighting, post-processing, audio and reading ritual,
    // but do not instantiate the previous infinite-boulevard road network.
    const archiveBoulevardVisuals = false
    const libraryGridSegments =
      libraryMode && archiveBoulevardVisuals
        ? archiveGridRoadSegments(activeDistricts)
        : []

    const scene = new THREE.Scene()
    const globalAtmospherePreset =
      getLibraryAtmosphereVisualPreset(
        activeLibraryConfig.atmosphere,
      )
    const sceneBackgroundColor = new THREE.Color(
      libraryMode ? 0x01020a : 0x030611,
    )
    const atmosphereBackgroundTarget = new THREE.Color()
    const atmosphereFogTarget = new THREE.Color()
    const atmosphereLightTarget = new THREE.Color()
    scene.background = sceneBackgroundColor
    scene.fog = libraryMode
      ? new THREE.FogExp2(
          globalAtmospherePreset.fog,
          settings.fogDensity * .14,
        )
      : new THREE.FogExp2(
          0x07101f,
          settings.fogDensity,
        )

    const camera = new THREE.PerspectiveCamera(
      43,
      1,
      0.05,
      libraryMode ? 900 : 80,
    )
    const savedLibraryFlightState =
      libraryMode ? libraryFlightStateRef.current : null
    if (savedLibraryFlightState) {
      camera.position.fromArray(savedLibraryFlightState.position)
      camera.quaternion.fromArray(savedLibraryFlightState.quaternion)
    } else if (libraryMode) {
      camera.position.fromArray(LIBRARY_SPAWN)
    } else {
      camera.position.set(0, 0, 10.8)
    }

    const listener = new THREE.AudioListener()
    camera.add(listener)

    const libraryAudio = libraryMode
      ? createLibraryAudio(listener)
      : null

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
    renderer.toneMappingExposure = libraryMode ? .51 : .94
    renderer.shadowMap.enabled = settings.miniWorldDetail > 0
    renderer.shadowMap.type = THREE.PCFShadowMap
    renderer.domElement.className = styles.webglCanvas
    container.appendChild(renderer.domElement)

    const cinematicEnvironment = createCinematicEnvironment(renderer)
    scene.environment = cinematicEnvironment.texture
    scene.environmentIntensity = libraryMode
      ? settings.environmentIntensity * .4
      : settings.environmentIntensity

    const composer = new EffectComposer(renderer)
    const renderPass = new RenderPass(scene, camera)
    composer.addPass(renderPass)

    const ssao = new SSAOPass(scene, camera, 1, 1)
    // Keep library SSAO disabled. Thin book covers, wall trim and bright
    // panels produce unstable crawling halos in screen space; the library
    // already uses deliberate contact-shadow/AO geometry at the places that
    // matter visually.
    ssao.enabled = settings.ssao && !libraryMode
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
      libraryMode ? .075 : settings.bloomStrength,
      libraryMode ? .14 : settings.bloomRadius,
      libraryMode ? 1.16 : settings.bloomThreshold,
    )
    // High-threshold library bloom is intentionally lamp-only. Pale walls and
    // book covers sit below threshold, while the emissive bulbs pick up a
    // restrained warm halo.
    bloom.enabled = true
    composer.addPass(bloom)

    const dreamPost = new ShaderPass(DreamPostShader)
    dreamPost.uniforms.uCinematic.value =
      qualityRef.current === 'cinematic' ? 1 : 0
    dreamPost.uniforms.uIntensity.value =
      qualityRef.current === 'cinematic'
        ? libraryMode
          ? .5
          : .72
        : libraryMode
          ? .22
          : .32
    composer.addPass(dreamPost)
    composer.addPass(new OutputPass())

    if (libraryMode) {
      // Low-level hemispheric fill preserves readable shadow detail while the
      // authored pendant/sconce point lights provide the actual room shape.
      scene.add(
        new THREE.HemisphereLight(
          0xd8c8b0,
          0x05070b,
          .24,
        ),
      )
    } else {
      scene.add(new THREE.AmbientLight(0x7182b6, .75))
    }

    const keyLight = new THREE.DirectionalLight(
      libraryMode ? 0xfff3df : 0xd4e5ff,
      libraryMode ? .025 : 2.1,
    )
    keyLight.position.set(-5, 6, 8)
    keyLight.castShadow =
      renderer.shadowMap.enabled && !libraryMode
    keyLight.shadow.mapSize.set(
      qualityRef.current === 'cinematic' ? 2048 : 1024,
      qualityRef.current === 'cinematic' ? 2048 : 1024,
    )
    keyLight.shadow.bias = -0.00015
    keyLight.shadow.normalBias = 0.025
    scene.add(keyLight)

    const violetLight = new THREE.PointLight(
      0xb791ff,
      libraryMode ? .075 : 12,
      20,
      2,
    )
    violetLight.position.set(-5, 1, 3)
    scene.add(violetLight)

    const cyanLight = new THREE.PointLight(
      0x72e2df,
      libraryMode ? .055 : 11,
      20,
      2,
    )
    cyanLight.position.set(5, -1, 2)
    scene.add(cyanLight)

    const world = new THREE.Group()
    scene.add(world)

    const farWorld = new THREE.Group()
    scene.add(farWorld)

    // The DEV Library now uses the enclosed six-room building from the
    // neighborhoods prototype while retaining the cinematic renderer,
    // reading ritual, audio, and Sanity-driven content model.
    const libraryFloatingProps = createFloatingPropRegistry()
    const libraryBuilding = libraryMode
      ? createLibraryBuilding(
          scene,
          activeLibraryConfig,
          libraryFloatingProps,
        )
      : null
    const layoutAuthoringEnabled = libraryMode
    const libraryLayoutAuthoring =
      layoutAuthoringEnabled
        ? createLibraryLayoutAuthoring(scene)
        : null

    let librarySkyDomeGeometry: THREE.SphereGeometry | null =
      null
    let librarySkyDomeMaterial: THREE.ShaderMaterial | null =
      null
    let librarySkyDome: THREE.Mesh | null = null

    if (libraryMode) {
      // A real exterior backdrop keeps the skylights from reading as black
      // rectangular holes. Stars, particles and floating debris render in
      // front of this distant gradient, so the roof opens into a coherent
      // Oniria night sky instead of the scene clear color.
      librarySkyDomeGeometry =
        new THREE.SphereGeometry(260, 40, 24)
      librarySkyDomeMaterial =
        new THREE.ShaderMaterial({
          side: THREE.BackSide,
          depthWrite: false,
          depthTest: true,
          toneMapped: false,
          transparent: false,
          uniforms: {
            zenithColor: {
              value: new THREE.Color(0x02040c),
            },
            upperColor: {
              value: new THREE.Color(0x091326),
            },
            horizonColor: {
              value: new THREE.Color(0x2b1c32),
            },
            warmHaze: {
              value: new THREE.Color(0x513426),
            },
          },
          vertexShader: `
            varying vec3 vLocalPosition;

            void main() {
              vLocalPosition = position;
              gl_Position = projectionMatrix *
                modelViewMatrix *
                vec4(position, 1.0);
            }
          `,
          fragmentShader: `
            varying vec3 vLocalPosition;
            uniform vec3 zenithColor;
            uniform vec3 upperColor;
            uniform vec3 horizonColor;
            uniform vec3 warmHaze;

            void main() {
              vec3 direction = normalize(vLocalPosition);
              float height = direction.y * 0.5 + 0.5;
              float upperMix = smoothstep(0.42, 0.9, height);
              vec3 sky = mix(horizonColor, upperColor, upperMix);
              sky = mix(
                sky,
                zenithColor,
                smoothstep(0.72, 1.0, height)
              );

              float horizonBand =
                exp(-pow((height - 0.5) * 7.5, 2.0));
              sky += warmHaze * horizonBand * 0.12;

              gl_FragColor = vec4(sky, 1.0);
            }
          `,
        })
      librarySkyDome = new THREE.Mesh(
        librarySkyDomeGeometry,
        librarySkyDomeMaterial,
      )
      librarySkyDome.position.set(0, 8, -30)
      librarySkyDome.renderOrder = -20
      librarySkyDome.frustumCulled = false
      librarySkyDome.name = 'library-exterior-sky-dome'
      farWorld.add(librarySkyDome)
    }

    const starCount = settings.starCount
    const starPositions = new Float32Array(starCount * 3)
    const starSizes = new Float32Array(starCount)
    for (let index = 0; index < starCount; index += 1) {
      const i = index * 3
      if (libraryMode) {
        // Reuse the old cosmic star field as a true exterior sky. Keep every
        // star well outside the building shell so the windows read as views
        // into space rather than interior particles.
        const seed = index + 901
        const u = seededUnit(seed, 1)
        const v = seededUnit(seed, 2)
        const theta = u * Math.PI * 2
        const phi = Math.acos(2 * v - 1)
        const radius = 130 + seededUnit(seed, 3) * 95
        const sinPhi = Math.sin(phi)
        starPositions[i] =
          Math.cos(theta) * sinPhi * radius
        starPositions[i + 1] =
          Math.cos(phi) * radius
        starPositions[i + 2] =
          -30 + Math.sin(theta) * sinPhi * radius
        starSizes[index] =
          .7 + seededUnit(seed, 4) * 1.8
      } else {
        starPositions[i] = (Math.random() - .5) * 34
        starPositions[i + 1] = (Math.random() - .5) * 22
        starPositions[i + 2] = -4 - Math.random() * 22
        starSizes[index] = .4 + Math.random() * 1.4
      }
    }
    const starGeometry = new THREE.BufferGeometry()
    starGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3))
    const starMaterial = new THREE.PointsMaterial({
      color: 0xcfe5ff,
      size: libraryMode ? .16 : .035,
      transparent: true,
      opacity: libraryMode ? .96 : .86,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
    const stars = new THREE.Points(starGeometry, starMaterial)
    farWorld.add(stars)

    let libraryFarParticleGeometry: THREE.BufferGeometry | null = null
    let libraryFarParticleMaterial: THREE.ShaderMaterial | null = null
    let libraryFarParticles: THREE.Points | null = null

    if (libraryMode) {
      const cinematicParticles = qualityRef.current === 'cinematic'
      const highParticles = qualityRef.current === 'high'
      const tinyParticleCount = cinematicParticles
        ? 820
        : highParticles
          ? 640
          : 340
      const moteCount = cinematicParticles
        ? 72
        : highParticles
          ? 56
          : 42
      const particleCount = tinyParticleCount + moteCount

      const positions = new Float32Array(particleCount * 3)
      const colors = new Float32Array(particleCount * 3)
      const sizes = new Float32Array(particleCount)
      const phases = new Float32Array(particleCount)
      const palette = [
        new THREE.Color(0xdcecff),
        new THREE.Color(0xa9e4ea),
        new THREE.Color(0xc9b7ee),
      ]

      for (let index = 0; index < particleCount; index += 1) {
        const offset = index * 3
        const seed = index + 1703
        const isMote = index >= tinyParticleCount
        const theta = seededUnit(seed, 1) * Math.PI * 2
        const phi = Math.acos(2 * seededUnit(seed, 2) - 1)
        const radius =
          112 + seededUnit(seed, 3) * 118
        const sinPhi = Math.sin(phi)

        positions[offset] =
          Math.cos(theta) * sinPhi * radius
        positions[offset + 1] =
          Math.cos(phi) * radius
        positions[offset + 2] =
          -30 + Math.sin(theta) * sinPhi * radius

        const color =
          palette[Math.floor(seededUnit(seed, 4) * palette.length)] ??
          palette[0]
        colors[offset] = color.r
        colors[offset + 1] = color.g
        colors[offset + 2] = color.b

        sizes[index] = isMote
          ? 3.2 + seededUnit(seed, 5) * 2.8
          : .9 + seededUnit(seed, 5) * 1.25
        phases[index] = seededUnit(seed, 6) * Math.PI * 2
      }

      libraryFarParticleGeometry = new THREE.BufferGeometry()
      libraryFarParticleGeometry.setAttribute(
        'position',
        new THREE.BufferAttribute(positions, 3),
      )
      libraryFarParticleGeometry.setAttribute(
        'color',
        new THREE.BufferAttribute(colors, 3),
      )
      libraryFarParticleGeometry.setAttribute(
        'aSize',
        new THREE.BufferAttribute(sizes, 1),
      )
      libraryFarParticleGeometry.setAttribute(
        'aPhase',
        new THREE.BufferAttribute(phases, 1),
      )
      libraryFarParticleGeometry.computeBoundingSphere()

      libraryFarParticleMaterial = new THREE.ShaderMaterial({
        uniforms: {
          uTime: {value: 0},
          uOpacity: {value: cinematicParticles ? .34 : .27},
        },
        vertexShader: `
          attribute float aSize;
          attribute float aPhase;
          varying vec3 vColor;
          varying float vAlpha;
          uniform float uTime;

          void main() {
            vec3 drifted = position;
            drifted.x += sin(uTime * 0.035 + aPhase) * 0.7;
            drifted.y += cos(uTime * 0.028 + aPhase * 1.37) * 0.45;

            vec4 mvPosition = modelViewMatrix * vec4(drifted, 1.0);
            gl_Position = projectionMatrix * mvPosition;
            gl_PointSize = aSize * clamp(150.0 / max(22.0, -mvPosition.z), 0.55, 2.0);
            vColor = color;
            vAlpha = smoothstep(-280.0, -35.0, drifted.z);
          }
        `,
        fragmentShader: `
          varying vec3 vColor;
          varying float vAlpha;
          uniform float uOpacity;

          void main() {
            vec2 centered = gl_PointCoord - vec2(0.5);
            float radius = length(centered);
            float softDisc = smoothstep(0.5, 0.08, radius);
            float core = smoothstep(0.22, 0.0, radius) * 0.18;
            float alpha = (softDisc + core) * uOpacity * (0.38 + vAlpha * 0.62);
            if (alpha < 0.004) discard;
            gl_FragColor = vec4(vColor, alpha);
          }
        `,
        transparent: true,
        depthWrite: false,
        vertexColors: true,
        blending: THREE.NormalBlending,
        toneMapped: true,
      })

      libraryFarParticles = new THREE.Points(
        libraryFarParticleGeometry,
        libraryFarParticleMaterial,
      )
      libraryFarParticles.renderOrder = -3
      farWorld.add(libraryFarParticles)
    }

    const librarySkyways: Array<{
      group: THREE.Group
      phase: number
      laneMaterial: THREE.LineBasicMaterial
      edgeMaterial: THREE.LineBasicMaterial
    }> = []
    const librarySkywayGeometries: THREE.BufferGeometry[] = []
    const librarySkywayMaterials: THREE.Material[] = []

    if (libraryMode && archiveBoulevardVisuals) {
      // Replace the old archive skyscrapers with unreachable floating
      // expressways. They are deliberately placed in farWorld only, so they
      // never become walkable surfaces, raycast targets, or collision bodies.
      const up = new THREE.Vector3(0, 1, 0)
      const tangent = new THREE.Vector3()
      const side = new THREE.Vector3()
      const center = new THREE.Vector3()

      const buildSkywayRibbon = (
        curve: THREE.CatmullRomCurve3,
        width: number,
      ) => {
        const samples = 96
        const positions = new Float32Array((samples + 1) * 2 * 3)
        const indices: number[] = []
        const leftPoints: THREE.Vector3[] = []
        const rightPoints: THREE.Vector3[] = []
        const centerPoints: THREE.Vector3[] = []

        for (let sample = 0; sample <= samples; sample += 1) {
          const t = sample / samples
          center.copy(curve.getPointAt(t))
          tangent.copy(curve.getTangentAt(t)).normalize()
          side.crossVectors(up, tangent)
          if (side.lengthSq() < .0001) {
            side.set(1, 0, 0)
          } else {
            side.normalize()
          }

          const left = center
            .clone()
            .addScaledVector(side, width * .5)
          const right = center
            .clone()
            .addScaledVector(side, -width * .5)
          const offset = sample * 6

          positions[offset] = left.x
          positions[offset + 1] = left.y
          positions[offset + 2] = left.z
          positions[offset + 3] = right.x
          positions[offset + 4] = right.y
          positions[offset + 5] = right.z

          leftPoints.push(left)
          rightPoints.push(right)
          centerPoints.push(center.clone())

          if (sample > 0) {
            const previousLeft = (sample - 1) * 2
            const previousRight = previousLeft + 1
            const currentLeft = sample * 2
            const currentRight = currentLeft + 1
            indices.push(
              previousLeft,
              previousRight,
              currentLeft,
              previousRight,
              currentRight,
              currentLeft,
            )
          }
        }

        const ribbonGeometry = new THREE.BufferGeometry()
        ribbonGeometry.setAttribute(
          'position',
          new THREE.BufferAttribute(positions, 3),
        )
        ribbonGeometry.setIndex(indices)
        ribbonGeometry.computeVertexNormals()
        ribbonGeometry.computeBoundingSphere()

        const leftGeometry =
          new THREE.BufferGeometry().setFromPoints(leftPoints)
        const rightGeometry =
          new THREE.BufferGeometry().setFromPoints(rightPoints)
        const centerGeometry =
          new THREE.BufferGeometry().setFromPoints(centerPoints)

        return {
          ribbonGeometry,
          leftGeometry,
          rightGeometry,
          centerGeometry,
        }
      }

      const skywayColors = [
        0x5fd8e6,
        0x9b7fea,
        0xd782e8,
        0x6f8dff,
        0x77d7bd,
        0xb88cf0,
        0x83c9ef,
      ]

      // Give every expressway its own piece of sky. The old procedural
      // formula pushed several routes through the same center/height band,
      // which made them read as one knot above the landmarks.
      const skywayBands = [
        {lateral: -62, altitude: 16, wave: 5.5, phase: .2},
        {lateral: -45, altitude: 25, wave: 7, phase: 1.05},
        {lateral: -28, altitude: 11, wave: 6.5, phase: 2.1},
        {lateral: -10, altitude: 31, wave: 5.5, phase: 3.0},
        {lateral: 11, altitude: 19, wave: 6.5, phase: 3.85},
        {lateral: 29, altitude: 28, wave: 7, phase: 4.7},
        {lateral: 47, altitude: 13, wave: 5.8, phase: 5.55},
        {lateral: 64, altitude: 23, wave: 5.2, phase: 6.35},
      ] as const

      for (
        let routeIndex = 0;
        routeIndex < skywayBands.length;
        routeIndex += 1
      ) {
        const band = skywayBands[routeIndex]
        const startBay =
          .75 + (routeIndex % 4) * 1.15
        const endBay = Math.min(
          ARCHIVE_PATH_RENDER_BAYS - 1,
          51 + routeIndex * 2.4,
        )
        const curvePoints: THREE.Vector3[] = []
        const interchangeRoute =
          routeIndex === 2 || routeIndex === 5

        for (let step = 0; step <= 11; step += 1) {
          const t = step / 11
          const bay = THREE.MathUtils.lerp(startBay, endBay, t)
          const pathPoint = new THREE.Vector3(...archivePathPoint(bay))
          const frame = archivePathFrame(bay)
          const normal = new THREE.Vector3(
            frame.normalX,
            0,
            frame.normalZ,
          )

          // Most routes stay inside a dedicated lateral band. Two routes
          // make broad interchange sweeps toward one another, providing the
          // "intertwined" moment without collapsing the whole network into
          // the same center point.
          const interchangeSweep = interchangeRoute
            ? Math.sin(t * Math.PI) *
              (routeIndex === 2 ? 14 : -14)
            : 0
          const lateral =
            band.lateral +
            Math.sin(
              t * Math.PI * 2.05 + band.phase,
            ) *
              band.wave +
            interchangeSweep

          pathPoint.addScaledVector(normal, lateral)
          pathPoint.y +=
            band.altitude +
            Math.sin(
              t * Math.PI * 2.45 + band.phase,
            ) *
              2.25 +
            (interchangeRoute
              ? Math.sin(t * Math.PI) * 2.8
              : 0)
          curvePoints.push(pathPoint)
        }

        const curve = new THREE.CatmullRomCurve3(
          curvePoints,
          false,
          'catmullrom',
          .36,
        )
        const width = 2.45 + (routeIndex % 3) * .42
        const {
          ribbonGeometry,
          leftGeometry,
          rightGeometry,
          centerGeometry,
        } = buildSkywayRibbon(curve, width)

        const accent = new THREE.Color(
          skywayColors[routeIndex % skywayColors.length],
        )
        const roadMaterial = new THREE.MeshBasicMaterial({
          color: accent.clone().multiplyScalar(.22),
          transparent: true,
          opacity: .42,
          side: THREE.DoubleSide,
          depthWrite: false,
          blending: THREE.NormalBlending,
          toneMapped: false,
          fog: false,
        })
        const edgeMaterial = new THREE.LineBasicMaterial({
          color: accent,
          transparent: true,
          opacity: .62,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          toneMapped: false,
          fog: false,
        })
        const laneMaterial = new THREE.LineBasicMaterial({
          color: accent.clone().lerp(new THREE.Color(0xffffff), .46),
          transparent: true,
          opacity: .24,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          toneMapped: false,
          fog: false,
        })

        const group = new THREE.Group()
        const road = new THREE.Mesh(ribbonGeometry, roadMaterial)
        const leftEdge = new THREE.Line(leftGeometry, edgeMaterial)
        const rightEdge = new THREE.Line(rightGeometry, edgeMaterial)
        const lane = new THREE.Line(centerGeometry, laneMaterial)

        road.renderOrder = -4
        leftEdge.renderOrder = -3
        rightEdge.renderOrder = -3
        lane.renderOrder = -2
        road.userData.libraryDecorative = true
        leftEdge.userData.libraryDecorative = true
        rightEdge.userData.libraryDecorative = true
        lane.userData.libraryDecorative = true

        group.add(road, leftEdge, rightEdge, lane)
        group.userData.librarySkyway = true
        group.userData.libraryDecorative = true
        farWorld.add(group)

        librarySkyways.push({
          group,
          phase: routeIndex * 1.41,
          laneMaterial,
          edgeMaterial,
        })
        librarySkywayGeometries.push(
          ribbonGeometry,
          leftGeometry,
          rightGeometry,
          centerGeometry,
        )
        librarySkywayMaterials.push(
          roadMaterial,
          edgeMaterial,
          laneMaterial,
        )
      }
    }

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
      if (libraryMode) {
        const positions = [
          [-115, 34, -45],
          [118, -18, -66],
          [-22, 62, -178],
          [26, -46, 112],
        ] as const
        const position = positions[index] ?? positions[0]
        sprite.position.set(
          position[0],
          position[1],
          position[2],
        )
        const scale = 72 + index * 18
        sprite.scale.set(scale * 1.7, scale, 1)
        material.opacity = .16
      } else {
        sprite.position.set(
          [-6, 4.8, 1.8, -2.4][index],
          [3, 2.2, -3.5, -1.2][index],
          -5 - index * 1.7,
        )
        const scale = 9 + index * 2.2
        sprite.scale.set(scale * 1.55, scale, 1)
      }
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

    if (libraryMode) {
      // Keep only the old galaxy treatment as distant exterior sky. Dream
      // debris and fog remain disabled inside the physical library.
      nebulae.forEach((sprite) => {
        sprite.visible = true
      })
      fragments.forEach((fragment) => {
        fragment.visible = false
      })
      landmarks.forEach((landmark) => {
        landmark.visible = false
      })
      foregroundFog.forEach((sprite) => {
        sprite.visible = false
      })
    }

    const libraryAtmosphere = libraryMode
      ? createLibraryAtmosphere({
          world,
          farWorld,
          quality: qualityRef.current,
          createNebulaTexture,
          seededUnit,
        })
      : null

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

    // These theatrical shafts belong to the original dream scene. Keeping
    // them out of library mode makes the archive read as open cosmic space
    // instead of a stage while preserving the dream-world presentation.
    if (!libraryMode) {
      for (
        let index = 0;
        index < Math.max(2, settings.atmosphereLayers - 1);
        index += 1
      ) {
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
    }

    const nodeVisuals = new Map<string, NodeVisual>()
    const interactive: THREE.Object3D[] = []
    const libraryBookVisuals: LibraryBookVisual[] = []
    const bookInteractives: THREE.Object3D[] = []
    let hoveredBook: LibraryBookVisual | null = null
    const BOOK_INTERACTION_DISTANCE = 2.65

    // Reusable shelf kit for cinematic library mode.
    const shelfSideGeometry = new THREE.BoxGeometry(.16, 3.56, .66)
    const shelfBoardGeometry = new THREE.BoxGeometry(4.5, .1, .66)
    const shelfBackGeometry = new THREE.BoxGeometry(4.5, 3.46, .055)
    const shelfBookGeometry = new THREE.BoxGeometry(.78, .54, .1)
    const shelfCoverGeometry = new THREE.PlaneGeometry(.7, .46)
    const shelfHoverGlowGeometry = new THREE.PlaneGeometry(.94, .68)
    const shelfAccentGeometry = new THREE.BoxGeometry(4.26, .024, .032)
    const shelfPickGeometry = new THREE.BoxGeometry(4.8, 3.8, 1.1)
    const shelfBookmarkGeometry = new THREE.PlaneGeometry(.12, .34)
    const shelfHoverGlowCanvas = document.createElement('canvas')
    shelfHoverGlowCanvas.width = 128
    shelfHoverGlowCanvas.height = 96
    const shelfHoverGlowContext =
      shelfHoverGlowCanvas.getContext('2d')
    if (shelfHoverGlowContext) {
      shelfHoverGlowContext.clearRect(0, 0, 128, 96)
      shelfHoverGlowContext.save()
      shelfHoverGlowContext.shadowColor =
        'rgba(255, 191, 112, .95)'
      shelfHoverGlowContext.shadowBlur = 22
      shelfHoverGlowContext.strokeStyle =
        'rgba(255, 218, 164, .92)'
      shelfHoverGlowContext.lineWidth = 5
      roundedRect(
        shelfHoverGlowContext,
        13,
        12,
        102,
        72,
        10,
      )
      shelfHoverGlowContext.stroke()
      shelfHoverGlowContext.restore()
    }
    const shelfHoverGlowTexture =
      new THREE.CanvasTexture(shelfHoverGlowCanvas)
    shelfHoverGlowTexture.colorSpace = THREE.SRGBColorSpace
    shelfHoverGlowTexture.minFilter = THREE.LinearFilter
    shelfHoverGlowTexture.magFilter = THREE.LinearFilter
    shelfHoverGlowTexture.generateMipmaps = false
    shelfHoverGlowTexture.needsUpdate = true
    const shelfHoverGlowMaterial =
      new THREE.MeshBasicMaterial({
        map: shelfHoverGlowTexture,
        transparent: true,
        opacity: .92,
        depthWrite: false,
        depthTest: true,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      })

    const shelfBookmarkMaterial = new THREE.MeshBasicMaterial({
      color: 0xd782e8,
      transparent: true,
      opacity: .82,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: true,
    })
    const shelfActivityGeometry = new THREE.BoxGeometry(
      .045,
      .34,
      .025,
    )
    const shelfFreshMaterial = new THREE.MeshBasicMaterial({
      color: 0x73f1ff,
      transparent: true,
      opacity: .82,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    })
    const shelfActiveMaterial = new THREE.MeshBasicMaterial({
      color: 0xc28cff,
      transparent: true,
      opacity: .66,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    })
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
    const shelfContactShadowGeometry =
      new THREE.PlaneGeometry(4.95, 1.18)
    const shelfContactShadowMaterial =
      new THREE.MeshBasicMaterial({
        color: 0x050509,
        transparent: true,
        opacity: .15,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: true,
      })
    const shelfContactShadows: THREE.Mesh[] = []

    const shelfBacklightCanvas = document.createElement('canvas')
    shelfBacklightCanvas.width = 128
    shelfBacklightCanvas.height = 128
    const shelfBacklightContext =
      shelfBacklightCanvas.getContext('2d')
    if (shelfBacklightContext) {
      const gradient =
        shelfBacklightContext.createRadialGradient(
          64,
          64,
          8,
          64,
          64,
          62,
        )
      gradient.addColorStop(0, 'rgba(255, 182, 105, .32)')
      gradient.addColorStop(.5, 'rgba(218, 118, 58, .11)')
      gradient.addColorStop(1, 'rgba(110, 52, 28, 0)')
      shelfBacklightContext.fillStyle = gradient
      shelfBacklightContext.fillRect(0, 0, 128, 128)
    }
    const shelfBacklightTexture =
      new THREE.CanvasTexture(shelfBacklightCanvas)
    shelfBacklightTexture.colorSpace = THREE.SRGBColorSpace
    shelfBacklightTexture.needsUpdate = true
    const shelfBacklightGeometry =
      new THREE.PlaneGeometry(3.9, 2.7)
    const shelfBacklightMaterial =
      new THREE.MeshBasicMaterial({
        map: shelfBacklightTexture,
        transparent: true,
        opacity: .17,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
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
      new THREE.MeshStandardMaterial({
        color: 0x6a3f32,
        emissive: 0x0b0503,
        emissiveIntensity: .008,
        roughness: .91,
      }),
      new THREE.MeshStandardMaterial({
        color: 0x6d5b2f,
        emissive: 0x090703,
        emissiveIntensity: .008,
        roughness: .9,
      }),
      new THREE.MeshStandardMaterial({
        color: 0x48543a,
        emissive: 0x040603,
        emissiveIntensity: .008,
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
    const shelfReactiveMaterials: THREE.Material[] = []
    const shelfCoverMaterials: THREE.MeshStandardMaterial[] = []
    const shelfCoverTextures: THREE.Texture[] = []
    const shelfBookLabelTextures: THREE.Texture[] = []
    const shelfBookLabelMaterials: THREE.SpriteMaterial[] = []
    const shelfBookLabelLayers: Array<{
      shelfRoot: THREE.Group
      layer: THREE.Group
    }> = []
    const shelfTextureLoader = new THREE.TextureLoader()
    shelfTextureLoader.setCrossOrigin('anonymous')
    const shelfCoverTextureCache = new Map<string, THREE.Texture>()
    const shelfCoverWaiters = new Map<
      string,
      THREE.MeshStandardMaterial[]
    >()
    const shelfCoverQueue: string[] = []
    let shelfCoverLoadsInFlight = 0
    const MAX_SHELF_COVER_LOADS = 4

    const applyShelfCoverTexture = (
      material: THREE.MeshStandardMaterial,
      texture: THREE.Texture,
    ) => {
      material.map = texture
      material.color.setHex(0xffffff)
      material.emissive.setHex(0x000000)
      material.emissiveIntensity = 0
      material.roughness = .9
      material.metalness = 0
      material.envMapIntensity =
        settings.environmentIntensity * .26
      material.needsUpdate = true
    }

    const pumpShelfCoverQueue = () => {
      if (sceneDisposed) return
      while (
        shelfCoverLoadsInFlight < MAX_SHELF_COVER_LOADS &&
        shelfCoverQueue.length > 0
      ) {
        const url = shelfCoverQueue.shift()
        if (!url) break

        shelfCoverLoadsInFlight += 1
        shelfTextureLoader.load(
          url,
          (texture) => {
            shelfCoverLoadsInFlight -= 1
            if (sceneDisposed) {
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
            shelfCoverTextures.push(texture)
            shelfCoverTextureCache.set(url, texture)

            const waiting =
              shelfCoverWaiters.get(url) ?? []
            waiting.forEach((material) =>
              applyShelfCoverTexture(material, texture),
            )
            shelfCoverWaiters.delete(url)
            pumpShelfCoverQueue()
          },
          undefined,
          () => {
            shelfCoverLoadsInFlight -= 1
            const waiting =
              shelfCoverWaiters.get(url) ?? []
            waiting.forEach((material) => {
              material.color.setHex(0x303746)
            })
            shelfCoverWaiters.delete(url)
            pumpShelfCoverQueue()
          },
        )
      }
    }

    const queueShelfCover = (
      url: string,
      material: THREE.MeshStandardMaterial,
    ) => {
      const cached = shelfCoverTextureCache.get(url)
      if (cached) {
        applyShelfCoverTexture(material, cached)
        return
      }

      const waiting = shelfCoverWaiters.get(url)
      if (waiting) {
        waiting.push(material)
        return
      }

      shelfCoverWaiters.set(url, [material])
      shelfCoverQueue.push(url)
      pumpShelfCoverQueue()
    }

    const compactBookLabel = (
      value: string,
      maxLength: number,
    ) =>
      value.length > maxLength
        ? value.slice(0, Math.max(1, maxLength - 1)).trimEnd() + '…'
        : value

    const createShelfBookLabel = (
      bookData: NonNullable<DreamWorldNode['libraryBooks']>[number],
    ) => {
      const canvas = document.createElement('canvas')
      canvas.width = 256
      canvas.height = 80
      const context = canvas.getContext('2d')

      if (context) {
        context.clearRect(0, 0, canvas.width, canvas.height)
        roundedRect(context, 4, 4, 248, 72, 10)
        context.fillStyle = 'rgba(18, 13, 10, .86)'
        context.fill()
        context.strokeStyle = 'rgba(190, 151, 93, .66)'
        context.lineWidth = 2
        context.stroke()

        context.textAlign = 'center'
        context.textBaseline = 'middle'
        context.fillStyle = '#f4e7d2'
        context.font =
          '600 15px Georgia, "Times New Roman", serif'
        context.fillText(
          compactBookLabel(bookData.title, 28),
          128,
          30,
        )

        context.fillStyle = '#baa68b'
        context.font = '500 12px system-ui, sans-serif'
        context.fillText(
          compactBookLabel(
            bookData.author ?? 'DEV Community',
            24,
          ),
          128,
          53,
        )
      }

      const texture = new THREE.CanvasTexture(canvas)
      texture.colorSpace = THREE.SRGBColorSpace
      texture.minFilter = THREE.LinearFilter
      texture.magFilter = THREE.LinearFilter
      texture.generateMipmaps = false
      texture.needsUpdate = true
      shelfBookLabelTextures.push(texture)

      const material = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        opacity: .94,
        depthWrite: false,
        depthTest: true,
        toneMapped: false,
      })
      shelfBookLabelMaterials.push(material)

      const sprite = new THREE.Sprite(material)
      sprite.scale.set(.9, .28, 1)
      sprite.renderOrder = 7
      sprite.userData.libraryDecorative = true
      return sprite
    }

    const shelfPickMaterial = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0,
      depthWrite: false,
    })

    const physicalShelfTemplatePromise = libraryMode
      ? loadLibraryAsset('stackShelf', 3.5, 'height').catch(
          (error) => {
            console.warn(
              '[DEV Library] Authored shelf failed; keeping procedural fallback.',
              error,
            )
            return null
          },
        )
      : Promise.resolve<THREE.Group | null>(null)

    const physicalShelfEndTemplatePromise = libraryMode
      ? loadLibraryAsset('stackShelfEnd', 3.5, 'height').catch(
          (error) => {
            console.warn(
              '[DEV Library] Shelf end failed; leaving row uncapped.',
              error,
            )
            return null
          },
        )
      : Promise.resolve<THREE.Group | null>(null)

    const libraryShelfLight = libraryMode
      ? new THREE.PointLight(0x8fe9f3, 0, 13, 2)
      : null
    if (libraryShelfLight) scene.add(libraryShelfLight)

    const libraryReadingRitual = libraryMode
      ? createLibraryReadingRitual(scene)
      : null

    const libraryShelfSparkleGeometry = libraryMode
      ? new THREE.BufferGeometry()
      : null
    const libraryShelfSparkleMaterial = libraryMode
      ? new THREE.PointsMaterial({
          color: 0xc8f8ff,
          size: .045,
          transparent: true,
          opacity: .62,
          depthWrite: false,
          sizeAttenuation: true,
        })
      : null
    let libraryShelfSparkles: THREE.Points | null = null

    if (
      libraryShelfSparkleGeometry &&
      libraryShelfSparkleMaterial
    ) {
      const sparkleCount = 24
      const positions = new Float32Array(sparkleCount * 3)
      for (let index = 0; index < sparkleCount; index += 1) {
        const sparkleSeed = hashString('library-sparkle:' + index)
        const offset = index * 3
        positions[offset] =
          (seededUnit(sparkleSeed, 1) - .5) * 4.6
        positions[offset + 1] =
          (seededUnit(sparkleSeed, 2) - .5) * 3.4
        positions[offset + 2] =
          (seededUnit(sparkleSeed, 3) - .5) * 2.2
      }
      libraryShelfSparkleGeometry.setAttribute(
        'position',
        new THREE.BufferAttribute(positions, 3),
      )
      libraryShelfSparkles = new THREE.Points(
        libraryShelfSparkleGeometry,
        libraryShelfSparkleMaterial,
      )
      libraryShelfSparkles.visible = false
      libraryShelfSparkles.renderOrder = 4
      world.add(libraryShelfSparkles)
    }

    const pendingShelfHydrators = new Map<
      string,
      () => void
    >()
    const hydratedShelfIds = new Set<string>()
    let lastShelfHydrationAt = -Infinity

    for (const node of nodeRef.current) {
      const seed = hashString(node._id)
      const color = new THREE.Color(
        node.accent ?? CATEGORY_COLORS[node.category],
      )
      const group = new THREE.Group()
      group.userData.nodeId = node._id
      group.userData.libraryKind = node.libraryKind
      group.userData.librarySlotId = node.librarySlotId
      group.userData.libraryOccupancyKey =
        node.libraryOccupancyKey
      group.userData.libraryShelfLifecycle =
        node.libraryShelfLifecycle
      const shelfNode = node.libraryKind === 'shelf'
      if (
        shelfNode &&
        node.libraryShelfLifecycle === 'forming'
      ) {
        // A forming shelf should be witnessed in-world, not complete its
        // animation while the player is still walking from the entrance.
        // Keep it latent until the camera comes close enough to its slot.
        group.userData.libraryMaterializationArmed = true
      }

      const shellMaterial = createLivingOrbMaterial(color, node.category)
      const shell = new THREE.Mesh(
        shelfNode
          ? new THREE.BufferGeometry()
          : nodeGeometry(node.category),
        shellMaterial,
      )
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
        shelfNode
          ? new THREE.BufferGeometry()
          : nodeGeometry(node.category),
        reflectionMaterial,
      )
      reflectionShell.scale.setScalar(1.035)
      reflectionShell.renderOrder = 4
      group.add(reflectionShell)

      const miniWorld: MiniWorld = shelfNode
        ? {
            group: new THREE.Group(),
            update: () => {},
            dispose: () => {},
          }
        : createMiniWorld(
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
      const glow = new THREE.Mesh(
        shelfNode
          ? new THREE.BufferGeometry()
          : nodeGeometry(node.category),
        glowMaterial,
      )
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
        shelfNode
          ? new THREE.BufferGeometry()
          : new THREE.IcosahedronGeometry(
              .22 + Math.min(node.frequency, 5) * .025,
              2,
            ),
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
        shelfNode
          ? new THREE.BufferGeometry()
          : new THREE.TorusGeometry(.79, .008, 6, 80),
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
        shelfNode
          ? new THREE.BufferGeometry()
          : new THREE.RingGeometry(.7, .735, 72),
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

        const shelfBookLabels = new THREE.Group()
        shelfBookLabels.name = `library-book-labels-${node._id}`
        shelfBookLabels.visible = false
        shelf.add(shelfBookLabels)
        shelfBookLabelLayers.push({
          shelfRoot: group,
          layer: shelfBookLabels,
        })

        // Render a correctly-sized procedural frame immediately, then swap it
        // for the authored stack-shelf GLB as soon as the cached model loads.
        const fallbackFrame = new THREE.Group()
        shelf.add(fallbackFrame)

        const reactiveFrameMaterial =
          shelfFrameMaterial.clone()
        // Unhydrated shelves should still read as library furniture, not
        // glowing district-colored placeholders at long range.
        reactiveFrameMaterial.color.setHex(0x2c2119)
        reactiveFrameMaterial.emissive.setHex(0x000000)
        reactiveFrameMaterial.emissiveIntensity = 0
        reactiveFrameMaterial.roughness = .9
        reactiveFrameMaterial.envMapIntensity =
          settings.environmentIntensity * .2

        const reactiveBoardMaterial =
          shelfBoardMaterial.clone()
        reactiveBoardMaterial.color.setHex(0x3b2b20)
        reactiveBoardMaterial.emissive.setHex(0x000000)
        reactiveBoardMaterial.emissiveIntensity = 0
        reactiveBoardMaterial.roughness = .88

        const reactiveAccentMaterial =
          shelfAccentMaterial.clone()
        reactiveAccentMaterial.color.setHex(0x6d5135)
        reactiveAccentMaterial.opacity = .045

        shelfReactiveMaterials.push(
          reactiveFrameMaterial,
          reactiveBoardMaterial,
          reactiveAccentMaterial,
        )
        group.userData.libraryShelfFrameMaterial =
          reactiveFrameMaterial
        group.userData.libraryShelfBoardMaterial =
          reactiveBoardMaterial
        group.userData.libraryShelfAccentMaterial =
          reactiveAccentMaterial

        ;[-2.25, 2.25].forEach((x) => {
          const side = new THREE.Mesh(
            shelfSideGeometry,
            reactiveFrameMaterial,
          )
          side.position.set(x, 1.76, 0)
          fallbackFrame.add(side)
        })

        const back = new THREE.Mesh(
          shelfBackGeometry,
          reactiveFrameMaterial,
        )
        back.position.set(
          0,
          1.74,
          node.libraryDoubleSided ? 0 : -.3,
        )
        fallbackFrame.add(back)

        ;[.18, 1.28, 2.38].forEach((y) => {
          const board = new THREE.Mesh(
            shelfBoardGeometry,
            reactiveBoardMaterial,
          )
          board.position.set(0, y, 0)
          fallbackFrame.add(board)
        })

        const topBoard = new THREE.Mesh(
          shelfBoardGeometry,
          reactiveFrameMaterial,
        )
        topBoard.position.set(0, 3.48, 0)
        fallbackFrame.add(topBoard)

        const shelfBooks = (node.libraryBooks ?? []).slice(
          0,
          node.libraryDoubleSided ? 18 : 9,
        )
        const addShelfBook = (
          bookData: NonNullable<DreamWorldNode['libraryBooks']>[number],
          index: number,
          facing: 1 | -1,
        ) => {
          const faceIndex = index % 9
          const row = Math.floor(faceIndex / 3)
          const column = faceIndex % 3
          const bookGroup = new THREE.Group()
          const baseRotationY = facing === 1 ? 0 : Math.PI
          const basePosition = new THREE.Vector3(
            -.9 + column * .9,
            .73 + row * 1.1,
            .4 * facing,
          )
          bookGroup.position.copy(basePosition)
          bookGroup.rotation.y = baseRotationY

          const backing = new THREE.Mesh(
            shelfBookGeometry,
            shelfBookMaterials[
              (seed + index * 7) % shelfBookMaterials.length
            ],
          )
          const bookWidthScale =
            .64 + seededUnit(seed, index + 89) * .34
          const bookHeightScale =
            .82 + seededUnit(seed, index + 90) * .28
          backing.scale.set(
            bookWidthScale,
            bookHeightScale,
            .82 + seededUnit(seed, index + 91) * .22,
          )
          bookGroup.rotation.z =
            (seededUnit(seed, index + 92) - .5) * .12
          bookGroup.position.x +=
            (seededUnit(seed, index + 93) - .5) * .16
          bookGroup.position.y +=
            (seededUnit(seed, index + 94) - .5) * .045
          bookGroup.position.z +=
            (seededUnit(seed, index + 95) - .5) * .025 * facing
          backing.userData.bookNodeId = node._id
          backing.userData.bookIndex = index
          bookGroup.add(backing)
          bookInteractives.push(backing)

          const bookLabel = createShelfBookLabel(bookData)
          bookLabel.position.set(
            bookGroup.position.x,
            bookGroup.position.y - .43,
            .5 * facing,
          )
          shelfBookLabels.add(bookLabel)

          const coverHinge = new THREE.Group()
          coverHinge.position.set(-.39, 0, .056)
          bookGroup.add(coverHinge)

          const coverMaterial = new THREE.MeshStandardMaterial({
            color: 0x555b67,
            roughness: .9,
            metalness: 0,
            emissive: 0x000000,
            emissiveIntensity: 0,
            envMapIntensity:
              settings.environmentIntensity * .26,
            side: THREE.DoubleSide,
            toneMapped: true,
          })
          shelfCoverMaterials.push(coverMaterial)

          if (bookData.coverUrl) {
            queueShelfCover(
              bookData.coverUrl,
              coverMaterial,
            )
          }

          const cover = new THREE.Mesh(
            shelfCoverGeometry,
            coverMaterial,
          )
          cover.position.set(.35, 0, .002)
          cover.rotation.y = 0
          cover.scale.set(
            .88 + (bookWidthScale - .64) * .36,
            .9 + (bookHeightScale - .82) * .24,
            1,
          )
          cover.renderOrder = 5
          cover.userData.bookNodeId = node._id
          cover.userData.bookIndex = index
          coverHinge.add(cover)
          bookInteractives.push(cover)

          const hoverGlow = new THREE.Mesh(
            shelfHoverGlowGeometry,
            shelfHoverGlowMaterial,
          )
          hoverGlow.position.set(.35, 0, -.012)
          hoverGlow.scale.copy(cover.scale).multiplyScalar(1.08)
          hoverGlow.visible = false
          hoverGlow.renderOrder = 4
          hoverGlow.userData.libraryDecorative = true
          coverHinge.add(hoverGlow)

          const bookmark = new THREE.Mesh(
            shelfBookmarkGeometry,
            shelfBookmarkMaterial,
          )
          bookmark.position.set(.28, .34, .072)
          bookmark.rotation.y = 0
          bookmark.visible = false
          bookmark.renderOrder = 6
          bookGroup.add(bookmark)

          if (bookData.fresh || (bookData.activity ?? 0) >= .16) {
            const activityMarker = new THREE.Mesh(
              shelfActivityGeometry,
              bookData.fresh
                ? shelfFreshMaterial
                : shelfActiveMaterial,
            )
            activityMarker.position.set(.33, 0, .073)
            activityMarker.scale.y =
              .7 + (bookData.activity ?? 0) * .55
            activityMarker.renderOrder = 6
            activityMarker.userData.libraryDecorative = true
            bookGroup.add(activityMarker)
          }

          shelf.add(bookGroup)
          libraryBookVisuals.push({
            nodeId: node._id,
            index,
            group: bookGroup,
            coverHinge,
            coverMaterial,
            hoverGlow,
            bookmark,
            basePosition,
            baseRotationY,
            facing,
          })
        }

        // One or two non-interactive books lie flat on otherwise perfect
        // shelves. They are intentionally cheap geometry reuse, but break the
        // repeated upright rhythm enough to stop the rows reading as filler.
        ;[0, 1].forEach((decorIndex) => {
          if (seededUnit(seed, 210 + decorIndex) < .42) return
          const flatBook = new THREE.Mesh(
            shelfBookGeometry,
            shelfBookMaterials[
              (seed + 13 + decorIndex * 3) %
                shelfBookMaterials.length
            ],
          )
          const flatRow =
            seededUnit(seed, 220 + decorIndex) > .5 ? 1 : 2
          flatBook.scale.set(
            .72 + seededUnit(seed, 230 + decorIndex) * .18,
            .42,
            1.15,
          )
          flatBook.rotation.x = Math.PI / 2
          flatBook.rotation.z =
            (seededUnit(seed, 240 + decorIndex) - .5) * .12
          flatBook.position.set(
            (decorIndex === 0 ? -1 : 1) *
              (1.35 + seededUnit(seed, 250 + decorIndex) * .3),
            .26 + flatRow * 1.1,
            node.libraryDoubleSided ? .18 : .35,
          )
          flatBook.userData.libraryDecorative = true
          shelf.add(flatBook)
        })

        let authoredShelfHydrated = false
        const hydrateAuthoredShelf = () => {
          if (authoredShelfHydrated || sceneDisposed) return
          authoredShelfHydrated = true

          void physicalShelfTemplatePromise.then((template) => {
            if (!template || sceneDisposed) return

            const authoredShelf = template.clone(true)
            const size = new THREE.Box3()
              .setFromObject(authoredShelf)
              .getSize(new THREE.Vector3())
            const widthRunsOnX = size.x >= size.z
            const sourceWidth = Math.max(
              .001,
              widthRunsOnX ? size.x : size.z,
            )
            const sourceDepth = Math.max(
              .001,
              widthRunsOnX ? size.z : size.x,
            )

            authoredShelf.rotation.y +=
              widthRunsOnX ? 0 : Math.PI / 2
            if (widthRunsOnX) {
              authoredShelf.scale.x *= 4.5 / sourceWidth
              authoredShelf.scale.z *= .72 / sourceDepth
            } else {
              authoredShelf.scale.z *= 4.5 / sourceWidth
              authoredShelf.scale.x *= .72 / sourceDepth
            }
            authoredShelf.traverse((child) => {
              if (!(child instanceof THREE.Mesh)) return
              child.castShadow = false
              child.receiveShadow = true
              child.frustumCulled = true
            })

            fallbackFrame.visible = false
            shelf.add(authoredShelf)
          })

          if (
            node.libraryShelfEndCaps &&
            node.libraryShelfEndCaps !== 'none'
          ) {
            void physicalShelfEndTemplatePromise.then((template) => {
              if (!template || sceneDisposed) return

              const shelfEnd = template.clone(true)
              shelfEnd.position.x =
                node.libraryShelfEndCaps === 'left'
                  ? -2.3
                  : 2.3
              shelfEnd.rotation.y =
                node.libraryShelfEndCaps === 'right'
                  ? Math.PI
                  : 0
              shelfEnd.traverse((child) => {
                if (!(child instanceof THREE.Mesh)) return
                child.castShadow = false
                child.receiveShadow = true
                child.frustumCulled = true
              })
              shelf.add(shelfEnd)
            })
          }
        }

        const hydrateShelfBooks = () => {
          if (
            hydratedShelfIds.has(node._id) ||
            sceneDisposed
          ) {
            return
          }

          hydratedShelfIds.add(node._id)
          pendingShelfHydrators.delete(node._id)
          hydrateAuthoredShelf()
          shelfBooks.forEach((bookData, index) => {
            addShelfBook(
              bookData,
              index,
              node.libraryDoubleSided && index >= 9
                ? -1
                : 1,
            )
          })
        }

        pendingShelfHydrators.set(
          node._id,
          hydrateShelfBooks,
        )

        const accentRail = new THREE.Mesh(
          shelfAccentGeometry,
          reactiveAccentMaterial,
        )
        accentRail.position.set(0, 3.5, .35)
        shelf.add(accentRail)

        if (node.libraryDoubleSided) {
          const rearAccentRail = new THREE.Mesh(
            shelfAccentGeometry,
            reactiveAccentMaterial,
          )
          rearAccentRail.position.set(0, 3.5, -.35)
          rearAccentRail.rotation.y = Math.PI
          shelf.add(rearAccentRail)
        }

        const pick = new THREE.Mesh(
          shelfPickGeometry,
          shelfPickMaterial,
        )
        pick.position.set(
          0,
          1.75,
          node.libraryDoubleSided ? 0 : .16,
        )
        pick.userData.nodeId = node._id
        shelf.add(pick)
        interactive.push(pick)

        const shelfWidthScale =
          node.libraryWidthScale ?? 1
        shelf.scale.set(shelfWidthScale, 1, 1)
        group.add(shelf)
        const labelStagger =
          seededUnit(seed, 141) > .5 ? .08 : -.04
        label.position.set(0, 3.72 + labelStagger, .2)
        label.scale.set(3.08, .7, 1)
      }

      const start = worldPosition(node, positionsRef.current)
      group.position.copy(start)
      if (node.libraryKind === 'shelf') {
        const baseYaw =
          typeof node.libraryYaw === 'number'
            ? node.libraryYaw
            : 0
        group.rotation.y = baseYaw

        const shelfContactShadow = new THREE.Mesh(
          shelfContactShadowGeometry,
          shelfContactShadowMaterial,
        )
        shelfContactShadow.position.set(start.x, .014, start.z)
        shelfContactShadow.rotation.set(
          -Math.PI / 2,
          0,
          -baseYaw,
        )
        shelfContactShadow.scale.x =
          node.libraryWidthScale ?? 1
        shelfContactShadow.renderOrder = 1
        shelfContactShadow.userData.libraryDecorative = true
        world.add(shelfContactShadow)
        shelfContactShadows.push(shelfContactShadow)
        const shelfFloatId = node.libraryFloatId ?? node._id
        const shelfFloatSeed = hashString(shelfFloatId)
        const wallBoundShelf =
          shelfFloatId.includes(':divider-wall:') ||
          shelfFloatId.includes(':entry-wall:') ||
          shelfFloatId.includes(':outer-wall:') ||
          shelfFloatId.includes(':rear-wall:') ||
          shelfFloatId.startsWith('hallway:')

        const shelfBacklight = new THREE.Mesh(
          shelfBacklightGeometry,
          shelfBacklightMaterial,
        )
        shelfBacklight.position.set(
          0,
          1.2,
          wallBoundShelf ? -.29 : -.36,
        )
        shelfBacklight.scale.set(
          (node.libraryWidthScale ?? 1) *
            (wallBoundShelf ? .78 : 1),
          wallBoundShelf ? .76 : 1,
          1,
        )
        shelfBacklight.renderOrder = 0
        shelfBacklight.userData.libraryDecorative = true
        group.add(shelfBacklight)

        libraryFloatingProps.register(group, {
          phase: floatingPhase(shelfFloatId),
          hoverAmplitude: wallBoundShelf
            ? .035 + seededUnit(shelfFloatSeed, 143) * .022
            : .11 + seededUnit(shelfFloatSeed, 143) * .065,
          hoverSpeed: wallBoundShelf
            ? .09 + seededUnit(shelfFloatSeed, 144) * .035
            : .105 + seededUnit(shelfFloatSeed, 144) * .045,
          secondaryHoverAmplitude: wallBoundShelf
            ? .008 + seededUnit(shelfFloatSeed, 150) * .008
            : .022 + seededUnit(shelfFloatSeed, 150) * .026,
          secondaryHoverSpeed: wallBoundShelf
            ? .18 + seededUnit(shelfFloatSeed, 151) * .05
            : .22 + seededUnit(shelfFloatSeed, 151) * .08,
          // Wall-bound shelves slide primarily along the wall. Freestanding
          // shelves get a larger sideways arc plus a smaller fore/aft drift
          // so the whole object reads as suspended rather than vibrating.
          tiltX: wallBoundShelf
            ? .009 + seededUnit(shelfFloatSeed, 145) * .007
            : .05 + seededUnit(shelfFloatSeed, 145) * .035,
          tiltY: wallBoundShelf
            ? .006 + seededUnit(shelfFloatSeed, 147) * .005
            : .035 + seededUnit(shelfFloatSeed, 147) * .028,
          tiltZ: wallBoundShelf
            ? .008 + seededUnit(shelfFloatSeed, 146) * .006
            : .042 + seededUnit(shelfFloatSeed, 146) * .03,
          driftX: wallBoundShelf ? 0 : .025,
          driftZ: wallBoundShelf ? 0 : .018,
          driftSide: wallBoundShelf
            ? .055 + seededUnit(shelfFloatSeed, 148) * .045
            : .18 + seededUnit(shelfFloatSeed, 148) * .13,
          driftForward: wallBoundShelf
            ? .004 + seededUnit(shelfFloatSeed, 149) * .005
            : .055 + seededUnit(shelfFloatSeed, 149) * .05,
          driftSpeedSide: wallBoundShelf
            ? .12 + seededUnit(shelfFloatSeed, 152) * .055
            : .15 + seededUnit(shelfFloatSeed, 152) * .09,
          driftSpeedForward: wallBoundShelf
            ? .075 + seededUnit(shelfFloatSeed, 153) * .03
            : .095 + seededUnit(shelfFloatSeed, 153) * .045,
          driftSpeedX: .13,
          driftSpeedZ: .1,
        })
      }

      const baseScale =
        node.libraryKind === 'shelf'
          ? 1
          : .72 +
            Math.min(node.frequency, 6) * .095 +
            Math.min(
              0.18,
              Math.max(0, node.frequency - 2) * .035,
            )
      group.scale.setScalar(
        node.libraryKind === 'shelf' &&
          node.libraryShelfLifecycle === 'forming'
          ? .04
          : baseScale,
      )
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

    let libraryWalkwayGeometry: THREE.BufferGeometry | null = null
    let libraryWalkwayRailGeometry: THREE.BufferGeometry | null = null
    let libraryWalkwayPanelMaterial: THREE.MeshBasicMaterial | null = null
    let libraryWalkwayUnderlayMaterial: THREE.MeshBasicMaterial | null = null
    let libraryWalkwayRailMaterial: THREE.LineBasicMaterial | null = null
    let libraryWalkway: THREE.Mesh | null = null
    let libraryWalkwayUnderlay: THREE.Mesh | null = null
    let libraryWalkwayRails: THREE.LineSegments | null = null
    let libraryGridRoadGeometry: THREE.BufferGeometry | null = null
    let libraryGridRailGeometry: THREE.BufferGeometry | null = null
    let libraryGridRoadMaterial: THREE.MeshBasicMaterial | null = null
    let libraryGridUnderlayMaterial: THREE.MeshBasicMaterial | null = null
    let libraryGridRailMaterial: THREE.LineBasicMaterial | null = null
    let libraryGridRoads: THREE.Mesh | null = null
    let libraryGridUnderlay: THREE.Mesh | null = null
    let libraryGridRails: THREE.LineSegments | null = null
    const libraryRouteTextures: THREE.Texture[] = []
    const libraryRouteMaterials: THREE.Material[] = []
    const libraryRouteObjects: THREE.Object3D[] = []
    const libraryDistrictLandmarkGeometries: THREE.BufferGeometry[] = []
    const libraryDistrictLandmarkMaterials: THREE.Material[] = []
    let libraryArrowGeometry: THREE.BufferGeometry | null = null
    let libraryArrowMaterial: THREE.MeshBasicMaterial | null = null
    let libraryArrows: THREE.InstancedMesh | null = null
    const libraryArrowBays: number[] = []
    let libraryGuardGeometry: THREE.BoxGeometry | null = null
    let libraryGuardMaterial: THREE.MeshBasicMaterial | null = null
    let libraryGuards: THREE.InstancedMesh | null = null
    let libraryJunctionGeometry: THREE.TorusGeometry | null = null
    let libraryJunctionMaterial: THREE.MeshBasicMaterial | null = null
    let libraryJunctions: THREE.InstancedMesh | null = null
    let libraryRouteDotGeometry: THREE.BufferGeometry | null = null
    let libraryRouteDotMaterial: THREE.PointsMaterial | null = null
    let libraryRouteDots: THREE.Points | null = null
    const libraryRouteDotCount = 54

    if (libraryMode && archiveBoulevardVisuals) {
      const subdivisionsPerBay = 4
      const sampleCount =
        ARCHIVE_PATH_RENDER_BAYS * subdivisionsPerBay + 1
      const panelPositions = new Float32Array(sampleCount * 2 * 3)
      const panelIndices: number[] = []
      const railPositions: number[] = []

      const point = new THREE.Vector3()
      const before = new THREE.Vector3()
      const after = new THREE.Vector3()
      const tangent = new THREE.Vector3()
      const side = new THREE.Vector3()

      const setSample = (index: number, bay: number) => {
        point.fromArray(archivePathPoint(bay))
        before.fromArray(archivePathPoint(bay - .04))
        after.fromArray(archivePathPoint(bay + .04))
        tangent.copy(after).sub(before)
        tangent.y = 0
        if (tangent.lengthSq() < .0001) tangent.set(0, 0, -1)
        tangent.normalize()
        side.set(-tangent.z, 0, tangent.x)

        const pathY = point.y + ARCHIVE_WALKWAY_Y_OFFSET
        const localHalfWidth =
          archiveWalkwayHalfWidthAtBay(bay, activeDistricts)
        const left = point
          .clone()
          .addScaledVector(side, localHalfWidth)
        const right = point
          .clone()
          .addScaledVector(side, -localHalfWidth)
        left.y = pathY
        right.y = pathY

        const leftOffset = index * 6
        panelPositions[leftOffset] = left.x
        panelPositions[leftOffset + 1] = left.y
        panelPositions[leftOffset + 2] = left.z
        panelPositions[leftOffset + 3] = right.x
        panelPositions[leftOffset + 4] = right.y
        panelPositions[leftOffset + 5] = right.z

        if (index > 0) {
          const previousLeft = (index - 1) * 2
          const previousRight = previousLeft + 1
          const currentLeft = index * 2
          const currentRight = currentLeft + 1
          panelIndices.push(
            previousLeft,
            previousRight,
            currentLeft,
            previousRight,
            currentRight,
            currentLeft,
          )

          const previousOffset = (index - 1) * 6
          railPositions.push(
            panelPositions[previousOffset],
            panelPositions[previousOffset + 1] + .035,
            panelPositions[previousOffset + 2],
            left.x,
            left.y + .035,
            left.z,
            panelPositions[previousOffset + 3],
            panelPositions[previousOffset + 4] + .035,
            panelPositions[previousOffset + 5],
            right.x,
            right.y + .035,
            right.z,
          )
        }

        if (index % subdivisionsPerBay === 0) {
          railPositions.push(
            left.x,
            left.y + .026,
            left.z,
            right.x,
            right.y + .026,
            right.z,
          )
        }
      }

      for (let index = 0; index < sampleCount; index += 1) {
        setSample(index, index / subdivisionsPerBay)
      }

      const first = 0
      const last = (sampleCount - 1) * 6
      railPositions.push(
        panelPositions[first],
        panelPositions[first + 1] + .045,
        panelPositions[first + 2],
        panelPositions[first + 3],
        panelPositions[first + 4] + .045,
        panelPositions[first + 5],
        panelPositions[last],
        panelPositions[last + 1] + .045,
        panelPositions[last + 2],
        panelPositions[last + 3],
        panelPositions[last + 4] + .045,
        panelPositions[last + 5],
      )

      libraryWalkwayGeometry = new THREE.BufferGeometry()
      libraryWalkwayGeometry.setAttribute(
        'position',
        new THREE.BufferAttribute(panelPositions, 3),
      )
      libraryWalkwayGeometry.setIndex(panelIndices)
      libraryWalkwayGeometry.computeVertexNormals()
      libraryWalkwayGeometry.computeBoundingSphere()

      libraryWalkwayRailGeometry = new THREE.BufferGeometry()
      libraryWalkwayRailGeometry.setAttribute(
        'position',
        new THREE.Float32BufferAttribute(railPositions, 3),
      )
      libraryWalkwayRailGeometry.computeBoundingSphere()

      libraryWalkwayPanelMaterial = new THREE.MeshBasicMaterial({
        color: 0x78dce8,
        transparent: true,
        opacity: .075,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.NormalBlending,
        toneMapped: true,
      })
      libraryWalkwayUnderlayMaterial =
        new THREE.MeshBasicMaterial({
          color: 0x6654b8,
          transparent: true,
          opacity: .04,
          side: THREE.DoubleSide,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          toneMapped: false,
        })
      libraryWalkwayRailMaterial = new THREE.LineBasicMaterial({
        color: 0xa99be8,
        transparent: true,
        opacity: .24,
        depthWrite: false,
        blending: THREE.NormalBlending,
        toneMapped: true,
      })

      libraryWalkwayUnderlay = new THREE.Mesh(
        libraryWalkwayGeometry,
        libraryWalkwayUnderlayMaterial,
      )
      libraryWalkwayUnderlay.position.y = -.085
      libraryWalkwayUnderlay.renderOrder = 0
      libraryWalkwayUnderlay.userData.libraryDecorative = true

      libraryWalkway = new THREE.Mesh(
        libraryWalkwayGeometry,
        libraryWalkwayPanelMaterial,
      )
      libraryWalkwayRails = new THREE.LineSegments(
        libraryWalkwayRailGeometry,
        libraryWalkwayRailMaterial,
      )
      libraryWalkway.renderOrder = 1
      libraryWalkwayRails.renderOrder = 2
      libraryWalkway.userData.walkableSurface = true
      libraryWalkway.userData.libraryDecorative = true
      libraryWalkwayRails.userData.libraryDecorative = true
      world.add(
        libraryWalkwayUnderlay,
        libraryWalkway,
        libraryWalkwayRails,
      )

      // Build a real three-avenue street grid around the original archive
      // spine. Cross streets occur at the arrival foyer and every district,
      // so walkers can leave the center route, loop around a block, and
      // re-enter the library from a different direction.
      const visibleGridSegments = libraryGridSegments.filter(
        (segment) => segment.kind !== 'main',
      )
      const gridPositions: number[] = []
      const gridColors: number[] = []
      const gridIndices: number[] = []
      const gridRailPositions: number[] = []
      const sideRoadColor = new THREE.Color(0x4ebbc8)
      const crossRoadColor = new THREE.Color(0x8c76cf)

      visibleGridSegments.forEach((segment) => {
        const [sx, sy, sz] = segment.start
        const [ex, ey, ez] = segment.end
        const dx = ex - sx
        const dz = ez - sz
        const length = Math.hypot(dx, dz) || 1
        const sideX = -dz / length
        const sideZ = dx / length
        const halfWidth = segment.halfWidth
        const startY = sy + ARCHIVE_WALKWAY_Y_OFFSET + .012
        const endY = ey + ARCHIVE_WALKWAY_Y_OFFSET + .012
        const vertexBase = gridPositions.length / 3

        gridPositions.push(
          sx + sideX * halfWidth,
          startY,
          sz + sideZ * halfWidth,
          sx - sideX * halfWidth,
          startY,
          sz - sideZ * halfWidth,
          ex + sideX * halfWidth,
          endY,
          ez + sideZ * halfWidth,
          ex - sideX * halfWidth,
          endY,
          ez - sideZ * halfWidth,
        )
        gridIndices.push(
          vertexBase,
          vertexBase + 1,
          vertexBase + 2,
          vertexBase + 1,
          vertexBase + 3,
          vertexBase + 2,
        )

        const roadColor =
          segment.kind === 'cross'
            ? crossRoadColor
            : sideRoadColor
        for (let slot = 0; slot < 4; slot += 1) {
          gridColors.push(
            roadColor.r,
            roadColor.g,
            roadColor.b,
          )
        }

        // Keep side avenues visually bounded but leave the cross streets
        // open at intersections; rails through a junction read like walls.
        if (segment.kind === 'side') {
          gridRailPositions.push(
            sx + sideX * halfWidth,
            startY + .024,
            sz + sideZ * halfWidth,
            ex + sideX * halfWidth,
            endY + .024,
            ez + sideZ * halfWidth,
            sx - sideX * halfWidth,
            startY + .024,
            sz - sideZ * halfWidth,
            ex - sideX * halfWidth,
            endY + .024,
            ez - sideZ * halfWidth,
          )
        }
      })

      libraryGridRoadGeometry = new THREE.BufferGeometry()
      libraryGridRoadGeometry.setAttribute(
        'position',
        new THREE.Float32BufferAttribute(gridPositions, 3),
      )
      libraryGridRoadGeometry.setAttribute(
        'color',
        new THREE.Float32BufferAttribute(gridColors, 3),
      )
      libraryGridRoadGeometry.setIndex(gridIndices)
      libraryGridRoadGeometry.computeVertexNormals()
      libraryGridRoadGeometry.computeBoundingSphere()

      libraryGridRailGeometry = new THREE.BufferGeometry()
      libraryGridRailGeometry.setAttribute(
        'position',
        new THREE.Float32BufferAttribute(
          gridRailPositions,
          3,
        ),
      )
      libraryGridRailGeometry.computeBoundingSphere()

      libraryGridRoadMaterial = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        vertexColors: true,
        transparent: true,
        opacity: .078,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.NormalBlending,
        toneMapped: true,
      })
      libraryGridUnderlayMaterial = new THREE.MeshBasicMaterial({
        color: 0x5546a7,
        transparent: true,
        opacity: .028,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      })
      libraryGridRailMaterial = new THREE.LineBasicMaterial({
        color: 0x8eeaf2,
        transparent: true,
        opacity: .145,
        depthWrite: false,
        blending: THREE.NormalBlending,
        toneMapped: true,
      })

      libraryGridUnderlay = new THREE.Mesh(
        libraryGridRoadGeometry,
        libraryGridUnderlayMaterial,
      )
      libraryGridUnderlay.position.y = -.065
      libraryGridUnderlay.renderOrder = 0
      libraryGridUnderlay.userData.libraryDecorative = true

      libraryGridRoads = new THREE.Mesh(
        libraryGridRoadGeometry,
        libraryGridRoadMaterial,
      )
      libraryGridRoads.renderOrder = 1
      libraryGridRoads.userData.walkableSurface = true
      libraryGridRoads.userData.libraryDecorative = true

      libraryGridRails = new THREE.LineSegments(
        libraryGridRailGeometry,
        libraryGridRailMaterial,
      )
      libraryGridRails.renderOrder = 2
      libraryGridRails.userData.libraryDecorative = true

      world.add(
        libraryGridUnderlay,
        libraryGridRoads,
        libraryGridRails,
      )

      activeDistricts.forEach((district, index) => {
        // Landmarks are punctuation, not mandatory furniture. Keep the
        // opening DEV monument, then render one hero landmark every other
        // district so the boulevard has visual breathing room.
        const hasLandmark = index % 2 === 0

        const districtLaneOffset =
          archiveDistrictGridLaneOffset(index)
        const center = new THREE.Vector3(
          ...archiveOffsetPathPoint(
            district.bay,
            districtLaneOffset,
          ),
        )
        const expectedLandmarkHeight =
          district.landmarkType === 'archive-tower'
            ? 4.8
            : district.landmarkType === 'syntax-tree'
              ? 4.2
              : district.landmarkType === 'neural-lattice'
                ? 3.7
                : district.landmarkType === 'index'
                  ? 3.2
                  : district.landmarkType === 'dev-monument'
                    ? 2.25
                    : 2.7

        // Compose signs for a walking-height camera, not an overhead map.
        // The tallest archive towers get extra breathing room so their
        // silhouette never tangles with the district label in screenshots.
        center.y +=
          ARCHIVE_WALKWAY_Y_OFFSET +
          (hasLandmark
            ? Math.max(6.55, expectedLandmarkHeight + 1.72)
            : 5.45)

        const texture = createLibraryRouteLabelTexture(
          district.label,
          district.code,
          district.accent,
        )
        const material = new THREE.SpriteMaterial({
          map: texture,
          transparent: true,
          opacity: .84,
          depthWrite: false,
          blending: THREE.NormalBlending,
          toneMapped: true,
        })
        const marker = new THREE.Sprite(material)
        marker.position.copy(center)
        marker.scale.set(6.2, 1.55, 1)
        marker.renderOrder = 4
        marker.userData.libraryDecorative = true
        marker.userData.routeMarkerBaseY = center.y
        marker.userData.routeMarkerPhase = index * 1.43
        marker.userData.routeMarkerBay = district.bay
        marker.userData.routeMarkerBaseScale = 6.2
        world.add(marker)
        libraryRouteTextures.push(texture)
        libraryRouteMaterials.push(material)
        libraryRouteObjects.push(marker)

        // Every district keeps its sign, shelves, atmosphere, route guards,
        // and junction marker. Only alternate districts get the large hero
        // landmark/aura stack.
        if (!hasLandmark) return

        const pathCenter = new THREE.Vector3(
          ...archiveOffsetPathPoint(
            district.bay,
            districtLaneOffset,
          ),
        )
        const frame = archivePathFrame(district.bay)

        // Landmarks are the visual anchor of each district, so place them on
        // the main causeway centerline directly beneath the district sign.
        // They remain decorative-only and are intentionally excluded from
        // collision/raycast systems so the center path stays traversable.
        const landmarkPosition = pathCenter.clone()

        let landmarkGeometry: THREE.BufferGeometry
        const landmarkHeight = expectedLandmarkHeight
        switch (district.landmarkType) {
          case 'neural-lattice':
            landmarkGeometry = new THREE.IcosahedronGeometry(1.85, 1)
            break
          case 'terminal-wall':
            landmarkGeometry = new THREE.BoxGeometry(3.35, 2.55, .2)
            break
          case 'syntax-tree':
            landmarkGeometry = new THREE.ConeGeometry(1.65, 4.2, 6)
            break
          case 'dev-monument':
            landmarkGeometry = new THREE.BoxGeometry(3.7, 2.25, .42)
            break
          case 'archive-tower':
            landmarkGeometry = new THREE.CylinderGeometry(
              1.05,
              1.45,
              4.8,
              8,
            )
            break
          case 'index':
          default:
            landmarkGeometry = new THREE.TorusGeometry(1.6, .24, 10, 48)
            break
        }

        landmarkPosition.y +=
          ARCHIVE_WALKWAY_Y_OFFSET +
          .34 +
          landmarkHeight * .5

        const landmarkCoreMaterial = new THREE.MeshBasicMaterial({
          color: district.accent,
          transparent: true,
          opacity:
            district.landmarkType === 'terminal-wall'
              ? .14
              : district.landmarkType === 'dev-monument'
                ? .72
                : .24,
          depthWrite: false,
          blending: THREE.NormalBlending,
          toneMapped: false,
          side: THREE.DoubleSide,
        })
        const landmarkWireMaterial = new THREE.MeshBasicMaterial({
          color: district.accent,
          transparent: true,
          opacity: .96,
          wireframe:
            district.landmarkType !== 'dev-monument',
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          toneMapped: false,
        })

        const landmarkGroup = new THREE.Group()
        landmarkGroup.position.copy(landmarkPosition)
        landmarkGroup.rotation.y =
          Math.atan2(frame.tangentX, frame.tangentZ)
        landmarkGroup.userData.libraryLandmark = true
        landmarkGroup.userData.libraryLandmarkBaseY =
          landmarkPosition.y
        landmarkGroup.userData.libraryLandmarkBaseRotationY =
          landmarkGroup.rotation.y
        landmarkGroup.userData.libraryLandmarkPhase =
          index * 1.37
        landmarkGroup.userData.libraryLandmarkHeight =
          landmarkHeight
        landmarkGroup.userData.libraryLandmarkBay =
          district.bay
        const landmarkBaseScale =
          district.landmarkType === 'archive-tower'
            ? 1.28
            : district.landmarkType === 'terminal-wall'
              ? 1.2
              : district.landmarkType === 'neural-lattice'
                ? 1.18
                : district.landmarkType === 'syntax-tree'
                  ? 1.16
                  : district.landmarkType === 'dev-monument'
                    ? 1.14
                    : 1.08
        landmarkGroup.userData.libraryLandmarkBaseScale =
          landmarkBaseScale
        landmarkGroup.scale.setScalar(landmarkBaseScale)

        const landmarkCore = new THREE.Mesh(
          landmarkGeometry,
          landmarkCoreMaterial,
        )
        landmarkCore.renderOrder = 4
        landmarkCore.userData.libraryDecorative = true
        landmarkGroup.add(landmarkCore)

        const landmarkWire = new THREE.Mesh(
          landmarkGeometry,
          landmarkWireMaterial,
        )
        landmarkWire.scale.setScalar(1.035)
        landmarkWire.renderOrder = 5
        landmarkWire.userData.libraryDecorative = true
        landmarkWire.userData.libraryLandmarkWire = true
        landmarkCore.userData.libraryLandmarkCore = true
        landmarkGroup.add(landmarkWire)

        const heroHaloGeometry = new THREE.RingGeometry(
          Math.max(2.05, landmarkHeight * .5),
          Math.max(2.62, landmarkHeight * .62),
          56,
        )
        const heroHaloMaterial = new THREE.MeshBasicMaterial({
          color: district.accent,
          transparent: true,
          opacity: .105,
          side: THREE.DoubleSide,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          toneMapped: false,
        })
        const heroHalo = new THREE.Mesh(
          heroHaloGeometry,
          heroHaloMaterial,
        )
        heroHalo.position.set(0, .08, .72)
        heroHalo.userData.libraryLandmarkHalo = true
        heroHalo.userData.libraryDecorative = true
        landmarkGroup.add(heroHalo)

        // A moving scan ring, orbit motes, and one lightweight motif group
        // give every Sanity-authored district a readable identity without
        // adding colliders, raycast targets, or a shader-heavy effect stack.
        const scanRingGeometry = new THREE.TorusGeometry(
          Math.max(1.25, landmarkHeight * .31),
          .018,
          6,
          48,
        )
        const scanRingMaterial = new THREE.MeshBasicMaterial({
          color: district.accent,
          transparent: true,
          opacity: .48,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          toneMapped: false,
        })
        const scanRing = new THREE.Mesh(
          scanRingGeometry,
          scanRingMaterial,
        )
        scanRing.rotation.x = Math.PI / 2
        scanRing.userData.libraryLandmarkScan = true
        scanRing.userData.libraryDecorative = true
        landmarkGroup.add(scanRing)

        const orbitParticleCount = 14
        const orbitPositions = new Float32Array(
          orbitParticleCount * 3,
        )
        for (
          let orbitIndex = 0;
          orbitIndex < orbitParticleCount;
          orbitIndex += 1
        ) {
          const angle =
            (orbitIndex / orbitParticleCount) * Math.PI * 2
          const radius =
            1.65 +
            seededUnit(index + 4400, orbitIndex + 1) * .62
          const offset = orbitIndex * 3
          orbitPositions[offset] = Math.cos(angle) * radius
          orbitPositions[offset + 1] =
            (seededUnit(index + 4400, orbitIndex + 20) - .5) *
            Math.min(2.8, landmarkHeight * .72)
          orbitPositions[offset + 2] = Math.sin(angle) * radius
        }
        const orbitGeometry = new THREE.BufferGeometry()
        orbitGeometry.setAttribute(
          'position',
          new THREE.BufferAttribute(orbitPositions, 3),
        )
        const orbitMaterial = new THREE.PointsMaterial({
          color: district.accent,
          size: .065,
          transparent: true,
          opacity: .64,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          sizeAttenuation: true,
          toneMapped: false,
        })
        const orbitParticles = new THREE.Points(
          orbitGeometry,
          orbitMaterial,
        )
        orbitParticles.userData.libraryLandmarkOrbit = true
        orbitParticles.userData.libraryDecorative = true
        landmarkGroup.add(orbitParticles)

        const motifMaterial = new THREE.MeshBasicMaterial({
          color: district.accent,
          transparent: true,
          opacity: .34,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          toneMapped: false,
          wireframe:
            district.id === 'web-dev' ||
            district.id === 'front-page',
        })
        const motifGroup = new THREE.Group()
        motifGroup.userData.libraryDistrictMotif = true
        motifGroup.userData.libraryDecorative = true

        if (district.id === 'web-dev') {
          ;[-1, 0, 1].forEach((slot) => {
            const geometry = new THREE.BoxGeometry(
              .72 + Math.abs(slot) * .12,
              .5,
              .045,
            )
            const panel = new THREE.Mesh(
              geometry,
              motifMaterial,
            )
            panel.position.set(
              slot * .86,
              .32 + Math.abs(slot) * .28,
              -1.58,
            )
            motifGroup.add(panel)
            libraryDistrictLandmarkGeometries.push(geometry)
          })
        } else if (district.id === 'ai') {
          ;[0, 1, 2].forEach((slot) => {
            const geometry = new THREE.TorusGeometry(
              1.16 + slot * .24,
              .012,
              5,
              40,
            )
            const neuralRing = new THREE.Mesh(
              geometry,
              motifMaterial,
            )
            neuralRing.rotation.set(
              Math.PI * (.18 + slot * .17),
              Math.PI * (.12 + slot * .21),
              slot * .5,
            )
            motifGroup.add(neuralRing)
            libraryDistrictLandmarkGeometries.push(geometry)
          })
        } else if (district.id === 'linux') {
          ;[-.72, -.24, .24, .72].forEach(
            (row, rowIndex) => {
              const geometry = new THREE.BoxGeometry(
                2.25 - rowIndex * .22,
                .045,
                .045,
              )
              const line = new THREE.Mesh(
                geometry,
                motifMaterial,
              )
              line.position.set(-.32 + rowIndex * .1, row, -.3)
              motifGroup.add(line)
              libraryDistrictLandmarkGeometries.push(geometry)
            },
          )
          const cursorGeometry = new THREE.BoxGeometry(
            .22,
            .12,
            .05,
          )
          const cursor = new THREE.Mesh(
            cursorGeometry,
            motifMaterial,
          )
          cursor.position.set(.92, -.72, -.31)
          motifGroup.add(cursor)
          libraryDistrictLandmarkGeometries.push(
            cursorGeometry,
          )
        } else if (district.id === 'javascript') {
          const branchPositions = new Float32Array([
            0, -1.3, 0,
            0, -.2, 0,
            0, -.2, 0,
            -.9, .72, 0,
            0, -.2, 0,
            .9, .72, 0,
            -.9, .72, 0,
            -1.25, 1.18, 0,
            .9, .72, 0,
            1.25, 1.18, 0,
          ])
          const branchGeometry = new THREE.BufferGeometry()
          branchGeometry.setAttribute(
            'position',
            new THREE.BufferAttribute(branchPositions, 3),
          )
          const branchMaterial = new THREE.LineBasicMaterial({
            color: district.accent,
            transparent: true,
            opacity: .72,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            toneMapped: false,
          })
          const branches = new THREE.LineSegments(
            branchGeometry,
            branchMaterial,
          )
          branches.position.z = -1.2
          motifGroup.add(branches)
          libraryDistrictLandmarkGeometries.push(
            branchGeometry,
          )
          libraryDistrictLandmarkMaterials.push(
            branchMaterial,
          )
        } else if (district.id === 'front-page') {
          const devLetterMaterial = new THREE.MeshBasicMaterial({
            color: 0xf5f7ff,
            transparent: true,
            opacity: .96,
            depthWrite: false,
            toneMapped: false,
          })

          const addDevBar = (
            x: number,
            y: number,
            width: number,
            height: number,
            rotationZ = 0,
          ) => {
            const geometry = new THREE.BoxGeometry(
              width,
              height,
              .12,
            )
            ;[-1, 1].forEach((face) => {
              const bar = new THREE.Mesh(
                geometry,
                devLetterMaterial,
              )
              bar.position.set(x, y, face * .285)
              bar.rotation.z = rotationZ
              bar.userData.libraryDecorative = true
              motifGroup.add(bar)
            })
            libraryDistrictLandmarkGeometries.push(geometry)
          }

          // D
          addDevBar(-1.18, 0, .16, 1.12)
          addDevBar(-.82, .48, .72, .16)
          addDevBar(-.82, -.48, .72, .16)
          addDevBar(-.48, 0, .16, 1.12)

          // E
          addDevBar(-.02, 0, .16, 1.12)
          addDevBar(.28, .48, .62, .16)
          addDevBar(.24, 0, .52, .15)
          addDevBar(.28, -.48, .62, .16)

          // V — left stroke leans inward toward the bottom,
          // right stroke mirrors it. The previous signs made a Λ.
          addDevBar(.9, .03, .16, 1.08, .23)
          addDevBar(1.34, .03, .16, 1.08, -.23)

          libraryDistrictLandmarkMaterials.push(
            devLetterMaterial,
          )
        } else {
          ;[0, 1].forEach((ringIndex) => {
            const geometry = new THREE.TorusGeometry(
              1.3 + ringIndex * .42,
              .016,
              5,
              40,
            )
            const archiveRing = new THREE.Mesh(
              geometry,
              motifMaterial,
            )
            archiveRing.rotation.x = Math.PI / 2
            archiveRing.position.y =
              -.55 + ringIndex * 1.05
            motifGroup.add(archiveRing)
            libraryDistrictLandmarkGeometries.push(geometry)
          })
        }

        landmarkGroup.add(motifGroup)

        const pedestalGeometry = new THREE.CylinderGeometry(
          1.75,
          2.05,
          .42,
          20,
        )
        const pedestalMaterial = new THREE.MeshBasicMaterial({
          color: district.accent,
          transparent: true,
          opacity: .32,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          toneMapped: false,
        })
        const pedestal = new THREE.Mesh(
          pedestalGeometry,
          pedestalMaterial,
        )
        pedestal.position.y = -.5 * landmarkHeight - .12
        pedestal.renderOrder = 3
        pedestal.userData.libraryDecorative = true
        pedestal.userData.libraryLandmarkPedestal = true
        landmarkGroup.add(pedestal)

        world.add(landmarkGroup)
        libraryRouteObjects.push(landmarkGroup)
        libraryDistrictLandmarkGeometries.push(
          landmarkGeometry,
          pedestalGeometry,
          scanRingGeometry,
          orbitGeometry,
          heroHaloGeometry,
        )
        libraryDistrictLandmarkMaterials.push(
          landmarkCoreMaterial,
          landmarkWireMaterial,
          pedestalMaterial,
          scanRingMaterial,
          orbitMaterial,
          heroHaloMaterial,
          motifMaterial,
        )

        const atmosphereColor =
          district.atmosphere === 'crystalline'
            ? 0x70f3ff
            : district.atmosphere === 'industrial'
              ? 0x7892a8
              : district.atmosphere === 'deep-void'
                ? 0x8c63d8
                : 0xd782e8
        const auraGeometry = new THREE.RingGeometry(2.05, 2.75, 48)
        const auraMaterial = new THREE.MeshBasicMaterial({
          color: atmosphereColor,
          transparent: true,
          opacity:
            district.atmosphere === 'deep-void'
              ? .24
              : district.atmosphere === 'industrial'
                ? .3
                : .42,
          side: THREE.DoubleSide,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          toneMapped: false,
        })
        const aura = new THREE.Mesh(auraGeometry, auraMaterial)
        aura.position.copy(landmarkPosition)
        aura.position.y =
          pathCenter.y + ARCHIVE_WALKWAY_Y_OFFSET + .065
        aura.rotation.x = -Math.PI / 2
        aura.renderOrder = 3
        aura.userData.libraryDecorative = true
        world.add(aura)
        libraryRouteObjects.push(aura)
        libraryDistrictLandmarkGeometries.push(auraGeometry)
        libraryDistrictLandmarkMaterials.push(auraMaterial)
      })

      const welcomeBay = .08
      const welcomePoint = new THREE.Vector3(
        ...archivePathPoint(welcomeBay),
      )
      const welcomeFrame = archivePathFrame(welcomeBay)
      const welcomeSide = new THREE.Vector3(
        welcomeFrame.normalX,
        0,
        welcomeFrame.normalZ,
      )
      const welcomeTexture =
        createLibraryWelcomeTexture(activeLibraryConfig)
      const welcomeMaterial = new THREE.SpriteMaterial({
        map: welcomeTexture,
        transparent: true,
        opacity: .96,
        depthWrite: false,
        blending: THREE.NormalBlending,
        toneMapped: true,
      })
      const welcomeBoard = new THREE.Sprite(welcomeMaterial)
      welcomeBoard.position
        .copy(welcomePoint)
        .addScaledVector(welcomeSide, -5.15)
      welcomeBoard.position.y +=
        ARCHIVE_WALKWAY_Y_OFFSET + 3.85
      welcomeBoard.scale.set(7.35, 4.2, 1)
      welcomeBoard.renderOrder = 5
      welcomeBoard.userData.libraryDecorative = true
      welcomeBoard.userData.libraryWelcome = true
      welcomeBoard.userData.routeMarkerBaseY = welcomeBoard.position.y
      welcomeBoard.userData.routeMarkerPhase = -1.2
      world.add(welcomeBoard)
      libraryRouteTextures.push(welcomeTexture)
      libraryRouteMaterials.push(welcomeMaterial)
      libraryRouteObjects.push(welcomeBoard)

      const welcomeRingGeometry = new THREE.RingGeometry(1.7, 1.86, 64)
      const welcomeRingMaterial = new THREE.MeshBasicMaterial({
        color: 0x7edfea,
        transparent: true,
        opacity: .16,
        side: THREE.DoubleSide,
        depthWrite: false,
        toneMapped: true,
      })
      const welcomeRing = new THREE.Mesh(
        welcomeRingGeometry,
        welcomeRingMaterial,
      )
      welcomeRing.position
        .copy(welcomePoint)
        .addScaledVector(welcomeSide, -5.15)
      welcomeRing.position.y +=
        ARCHIVE_WALKWAY_Y_OFFSET + .04
      welcomeRing.rotation.x = -Math.PI / 2
      welcomeRing.renderOrder = 3
      welcomeRing.userData.libraryDecorative = true
      world.add(welcomeRing)
      libraryRouteMaterials.push(welcomeRingMaterial)
      libraryRouteObjects.push(welcomeRing)

      const arrowVertices = new Float32Array([
        -.2, 0, .16,
        .2, 0, .16,
        0, 0, -.28,
      ])
      libraryArrowGeometry = new THREE.BufferGeometry()
      libraryArrowGeometry.setAttribute(
        'position',
        new THREE.BufferAttribute(arrowVertices, 3),
      )
      libraryArrowGeometry.setIndex([0, 1, 2])
      libraryArrowMaterial = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        vertexColors: true,
        transparent: true,
        opacity: .38,
        side: THREE.DoubleSide,
        depthWrite: false,
        toneMapped: true,
      })
      for (let bay = 2.5; bay < ARCHIVE_PATH_RENDER_BAYS; bay += 2.75) {
        if (archiveDistrictInfluence(bay, activeDistricts) < .68) {
          libraryArrowBays.push(bay)
        }
      }
      libraryArrows = new THREE.InstancedMesh(
        libraryArrowGeometry,
        libraryArrowMaterial,
        libraryArrowBays.length,
      )
      const arrowDummy = new THREE.Object3D()
      const arrowIdleColor = new THREE.Color(0x24465a)
      libraryArrowBays.forEach((bay, index) => {
        const center = new THREE.Vector3(...archivePathPoint(bay))
        const frame = archivePathFrame(bay)
        center.y += ARCHIVE_WALKWAY_Y_OFFSET + .055
        arrowDummy.position.copy(center)
        arrowDummy.rotation.set(
          0,
          Math.atan2(frame.tangentX, frame.tangentZ),
          0,
        )
        arrowDummy.updateMatrix()
        libraryArrows?.setMatrixAt(index, arrowDummy.matrix)
        libraryArrows?.setColorAt(index, arrowIdleColor)
      })
      libraryArrows.instanceMatrix.needsUpdate = true
      if (libraryArrows.instanceColor) {
        libraryArrows.instanceColor.needsUpdate = true
      }
      libraryArrows.renderOrder = 3
      libraryArrows.userData.libraryDecorative = true
      world.add(libraryArrows)

      libraryGuardGeometry = new THREE.BoxGeometry(1, .32, .035)
      libraryGuardMaterial = new THREE.MeshBasicMaterial({
        color: 0x8fc8f4,
        transparent: true,
        opacity: .12,
        depthWrite: false,
        toneMapped: true,
      })
      libraryGuards = new THREE.InstancedMesh(
        libraryGuardGeometry,
        libraryGuardMaterial,
        activeDistricts.length * 2,
      )
      const guardDummy = new THREE.Object3D()
      activeDistricts.forEach((district, index) => {
        const laneOffset =
          archiveDistrictGridLaneOffset(index)
        const center = new THREE.Vector3(
          ...archiveOffsetPathPoint(
            district.bay,
            laneOffset,
          ),
        )
        const frame = archivePathFrame(district.bay)
        const halfWidth =
          laneOffset === 0
            ? ARCHIVE_WALKWAY_HALF_WIDTH +
              archiveDistrictInfluence(
                district.bay,
                activeDistricts,
              ) *
                2.4
            : 2.15
        const sideVector = new THREE.Vector3(
          frame.normalX,
          0,
          frame.normalZ,
        )
        const yaw = Math.atan2(frame.tangentX, frame.tangentZ)
        ;[-1, 1].forEach((sideSign, sideIndex) => {
          guardDummy.position
            .copy(center)
            .addScaledVector(sideVector, halfWidth * sideSign)
          guardDummy.position.y +=
            ARCHIVE_WALKWAY_Y_OFFSET + .24
          guardDummy.rotation.set(0, yaw, 0)
          guardDummy.scale.set(3.2, 1, 1)
          guardDummy.updateMatrix()
          libraryGuards?.setMatrixAt(
            index * 2 + sideIndex,
            guardDummy.matrix,
          )
        })
      })
      libraryGuards.instanceMatrix.needsUpdate = true
      libraryGuards.renderOrder = 2
      libraryGuards.userData.libraryDecorative = true
      world.add(libraryGuards)

      libraryJunctionGeometry = new THREE.TorusGeometry(
        .48,
        .028,
        6,
        32,
      )
      libraryJunctionMaterial = new THREE.MeshBasicMaterial({
        color: 0xb19cf0,
        transparent: true,
        opacity: .3,
        depthWrite: false,
        toneMapped: true,
      })
      libraryJunctions = new THREE.InstancedMesh(
        libraryJunctionGeometry,
        libraryJunctionMaterial,
        activeDistricts.length,
      )
      const junctionDummy = new THREE.Object3D()
      activeDistricts.forEach((district, index) => {
        const center = new THREE.Vector3(
          ...archiveOffsetPathPoint(
            district.bay,
            archiveDistrictGridLaneOffset(index),
          ),
        )
        center.y += ARCHIVE_WALKWAY_Y_OFFSET + .07
        junctionDummy.position.copy(center)
        junctionDummy.rotation.set(Math.PI / 2, 0, 0)
        junctionDummy.updateMatrix()
        libraryJunctions?.setMatrixAt(index, junctionDummy.matrix)
      })
      libraryJunctions.instanceMatrix.needsUpdate = true
      libraryJunctions.renderOrder = 3
      libraryJunctions.userData.libraryDecorative = true
      world.add(libraryJunctions)

      libraryRouteDotGeometry = new THREE.BufferGeometry()
      libraryRouteDotGeometry.setAttribute(
        'position',
        new THREE.BufferAttribute(
          new Float32Array(libraryRouteDotCount * 3),
          3,
        ),
      )
      const routeDotColors = new Float32Array(
        libraryRouteDotCount * 3,
      )
      const centerEnergyColor = new THREE.Color(0xb9f7ff)
      const leftEdgeEnergyColor = new THREE.Color(0xa99bff)
      const rightEdgeEnergyColor = new THREE.Color(0xff8ed8)
      for (
        let index = 0;
        index < libraryRouteDotCount;
        index += 1
      ) {
        const lane = (index % 3) - 1
        const color =
          lane === 0
            ? centerEnergyColor
            : lane < 0
              ? leftEdgeEnergyColor
              : rightEdgeEnergyColor
        routeDotColors[index * 3] = color.r
        routeDotColors[index * 3 + 1] = color.g
        routeDotColors[index * 3 + 2] = color.b
      }
      libraryRouteDotGeometry.setAttribute(
        'color',
        new THREE.BufferAttribute(routeDotColors, 3),
      )
      libraryRouteDotMaterial = new THREE.PointsMaterial({
        color: 0xffffff,
        vertexColors: true,
        size: .085,
        transparent: true,
        opacity: .78,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        sizeAttenuation: true,
        toneMapped: false,
      })
      libraryRouteDots = new THREE.Points(
        libraryRouteDotGeometry,
        libraryRouteDotMaterial,
      )
      libraryRouteDots.renderOrder = 4
      libraryRouteDots.userData.libraryDecorative = true
      world.add(libraryRouteDots)

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

    if (libraryMode) {
      categoryNebulae.forEach(({sprite}) => {
        sprite.visible = false
      })
    }

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

    const clusterAudios = (libraryMode
      ? []
      : [...nodeRef.current])
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
        opacity: .045,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })

      const line = new THREE.Line(geometry, material)
      world.add(line)

      const pulseMaterial = new THREE.MeshBasicMaterial({
        color: edge.weight > 2 ? 0xe0c9ff : 0xa4f2ef,
        transparent: true,
        opacity: .11,
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
    let libraryWalkBobPhase = 0
    let libraryWalkBobStrength = 0
    let flightInitialized = false
    let previousFlightMode = false
    let flightNearestId: string | null = null
    let lastPublishedNavigation = ''
    let flightRoute:
      | {
          source: THREE.Vector3
          control: THREE.Vector3
          target: THREE.Vector3
          sourceId: string
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
      diveSsao.enabled = settings.ssao && !libraryMode
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

    function bookVisualFromObject(object: THREE.Object3D) {
      const nodeId = object.userData.bookNodeId as string | undefined
      const index = object.userData.bookIndex as number | undefined
      if (nodeId === undefined || index === undefined) return null
      return (
        libraryBookVisuals.find(
          (visual) =>
            visual.nodeId === nodeId &&
            visual.index === index,
        ) ?? null
      )
    }

    function pickBook(event: PointerEvent) {
      normalizedPointer(event)
      raycaster.setFromCamera(pointer, camera)
      const intersections = raycaster.intersectObjects(
        bookInteractives,
        false,
      )
      const hit = intersections.find(
        (intersection) =>
          intersection.distance <= BOOK_INTERACTION_DISTANCE,
      )
      if (!hit) return null
      return bookVisualFromObject(hit.object)
    }

    function pickCenterBook() {
      pointer.set(0, 0)
      raycaster.setFromCamera(pointer, camera)
      const intersections = raycaster.intersectObjects(
        bookInteractives,
        false,
      )
      const hit = intersections.find(
        (intersection) =>
          intersection.distance <= BOOK_INTERACTION_DISTANCE,
      )
      if (!hit) return null
      return bookVisualFromObject(hit.object)
    }

    function beginBookOpen(visual: LibraryBookVisual) {
      if (
        libraryReadingRitual?.begin(
          visual,
          performance.now() / 1000,
        )
      ) {
        hoveredBook = visual
      }
    }

    function nearestFlightNode(maxDistance = 4.2) {
      let nearest:
        | {node: DreamWorldNode; distance: number}
        | null = null
      const worldPoint = new THREE.Vector3()

      if (
        flightModeRef.current &&
        diveMode === 'none' &&
        document.pointerLockElement === renderer.domElement &&
        !(libraryReadingRitual?.isActive() ?? false)
      ) {
        hoveredBook = pickCenterBook()
      }

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

      const book = pickBook(event)
      hoveredBook = book
      const node = book
        ? nodeRef.current.find((item) => item._id === book.nodeId) ?? null
        : pickNode(event)
      const nextId = node?._id ?? null
      if (nextId !== hoveredId) {
        hoveredId = nextId
        onNodeHoverRef.current(node)
      }
      renderer.domElement.style.cursor =
        book || node ? 'pointer' : 'grab'
    }

    function handlePointerDown(event: PointerEvent) {
      if (flightModeRef.current && diveMode === 'none') {
        if (document.pointerLockElement !== renderer.domElement) {
          void renderer.domElement.requestPointerLock()
        } else {
          const book = pickCenterBook()
          if (book) {
            beginBookOpen(book)
          } else {
            const node = pickCenterNode()
            if (node) onNodeSelectRef.current(node)
          }
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

      // First-person interactions are completed on pointerdown using the
      // center-screen ray. Do not run the regular pointerup picker afterward:
      // it can hit the parent shelf, trigger onNodeSelect, and exit pointer
      // lock immediately after a book was picked up.
      if (flightModeRef.current && diveMode === 'none') {
        pointerDown = null
        dragging = false
        return
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
        const book = pickBook(event)
        if (book) {
          beginBookOpen(book)
        } else {
          const node = pickNode(event)
          if (node) onNodeSelectRef.current(node)
          else onBackgroundClickRef.current()
        }
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
      hoveredBook = null
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

    renderer.domElement.dataset.oniriaLibraryFps = 'true'
    renderer.domElement.tabIndex = -1

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

    function emitLayoutAuthoringResult(
      detail: Record<string, unknown>,
    ) {
      window.dispatchEvent(
        new CustomEvent('oniria:layout-pin-result', {
          detail,
        }),
      )
    }

    function handleLibraryLayoutExportRequest() {
      const markers =
        libraryLayoutAuthoring?.markers() ?? []
      window.dispatchEvent(
        new CustomEvent('oniria:layout-pin-export', {
          detail: {
            markers,
            count: markers.length,
          },
        }),
      )
    }

    function handleLibraryLayoutRequest(event: Event) {
      if (
        !libraryMode ||
        !libraryLayoutAuthoring ||
        diveMode !== 'none' ||
        inputBlockedRef.current
      ) {
        emitLayoutAuthoringResult({
          ok: false,
          action: 'blocked',
          message: 'LAYOUT PIN BLOCKED',
        })
        return
      }

      const request = event as CustomEvent<{
        remove?: boolean
        clearAll?: boolean
        source?: string
      }>

      if (request.detail?.clearAll) {
        void libraryLayoutAuthoring
          .clearAll()
          .then((count) => {
            emitLayoutAuthoringResult({
              ok: true,
              action: 'cleared-all',
              count,
              message: `CLEARED ${count} PIN${count === 1 ? '' : 'S'}`,
            })
          })
        return
      }

      if (request.detail?.remove) {
        void libraryLayoutAuthoring
          .removeNearest(
            camera.position.x,
            camera.position.z,
          )
          .then((removed) => {
            emitLayoutAuthoringResult(
              removed
                ? {
                    ok: true,
                    action: 'removed',
                    marker: removed,
                    message: `PIN ${removed.label} REMOVED`,
                  }
                : {
                    ok: false,
                    action: 'remove-miss',
                    message: 'NO PIN NEARBY',
                  },
            )
          })
        return
      }

      const roomEntry = nearestAuthoringRoomEntry(
        camera.position.x,
        camera.position.z,
      )
      if (!roomEntry) {
        emitLayoutAuthoringResult({
          ok: false,
          action: 'no-room',
          message: 'NO ROOM AVAILABLE',
        })
        return
      }

      const districtIndex = activeDistricts.indexOf(
        roomEntry.district,
      )
      const room = roomForDistrict(
        roomEntry.district,
        Math.max(0, districtIndex),
      )
      const cameraEuler = new THREE.Euler().setFromQuaternion(
        camera.quaternion,
        'YXZ',
      )

      const markerForward = new THREE.Vector3(
        0,
        0,
        -1,
      ).applyQuaternion(camera.quaternion)
      markerForward.y = 0
      if (markerForward.lengthSq() < .0001) {
        markerForward.set(
          -Math.sin(cameraEuler.y),
          0,
          -Math.cos(cameraEuler.y),
        )
      }
      markerForward.normalize()

      // Once the authoring room has been resolved, do not apply gameplay
      // room-boundary rejection to the marker itself. This lets Mika map
      // shelf centers right against walls/corners even when the authored
      // architecture and our inferred rectangle differ by a small amount.
      const markerX =
        camera.position.x + markerForward.x * 2.2
      const markerZ =
        camera.position.z + markerForward.z * 2.2

      void libraryLayoutAuthoring
        .dropMarker({
          roomSlot: room.slot,
          districtId: roomEntry.district.id,
          x: markerX,
          z: markerZ,
          yaw: cameraEuler.y,
        })
        .then((marker) => {
          console.info(
            '[DEV Library layout] pin dropped',
            marker,
          )
          emitLayoutAuthoringResult({
            ok: true,
            action: 'placed',
            marker,
            roomSlot: room.slot,
            message: `PIN ${marker.label} PLACED`,
          })
        })
        .catch((error) => {
          console.error(
            '[DEV Library layout] pin drop failed',
            error,
          )
          emitLayoutAuthoringResult({
            ok: false,
            action: 'failed',
            message: 'PIN DROP FAILED',
          })
        })
    }

    function handleFlightKeyDown(event: KeyboardEvent) {
      if (
        !flightModeRef.current ||
        diveMode !== 'none' ||
        inputBlockedRef.current
      ) {
        return
      }

      if (libraryMode && event.code === 'KeyG') {
        event.preventDefault()
        const nextMode: LibraryMovementMode =
          libraryMovementModeRef.current === 'walk'
            ? 'fly'
            : 'walk'
        libraryMovementModeRef.current = nextMode
        onLibraryMovementModeChangeRef.current?.(nextMode)
        flightRoute = null
        flightVelocity.set(0, 0, 0)
        libraryWalkBobStrength = 0
        flightKeys.clear()
        return
      }

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
        // The old cinematic route is a free-space Bezier curve. In the
        // enclosed six-room library it can cut through walls, so room mode
        // intentionally leaves auto-route disabled until a corridor-aware
        // pathfinder replaces it.
        if (libraryMode) {
          return
        }
        const sourceNode = nearestFlightNode(12)
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
                sourceId: sourceNode._id,
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
        const book = pickCenterBook()
        if (book) {
          beginBookOpen(book)
        } else {
          const node = pickCenterNode() ?? nearestFlightNode(5.5)
          if (node) onNodeSelectRef.current(node)
        }
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
    window.addEventListener(
      'oniria:layout-pin-request',
      handleLibraryLayoutRequest,
    )
    window.addEventListener(
      'oniria:layout-pin-export-request',
      handleLibraryLayoutExportRequest,
    )
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

      const currentRoomEntry = libraryMode
        ? nearestRoomEntry(
            camera.position.x,
            camera.position.z,
          )
        : null

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

      if (libraryFarParticles && libraryFarParticleMaterial) {
        libraryFarParticleMaterial.uniforms.uTime.value = elapsed
        libraryFarParticles.rotation.z = Math.sin(elapsed * .018) * .008
        libraryFarParticles.position.x = Math.sin(elapsed * .021) * .24
        libraryFarParticles.position.y = Math.cos(elapsed * .017) * .16
      }

      librarySkyways.forEach((skyway, index) => {
        skyway.group.position.y =
          Math.sin(elapsed * .055 + skyway.phase) * .16
        skyway.group.rotation.y =
          Math.sin(elapsed * .014 + skyway.phase) * .004
        skyway.edgeMaterial.opacity =
          .54 +
          Math.max(
            0,
            Math.sin(elapsed * .23 + skyway.phase),
          ) * .16
        skyway.laneMaterial.opacity =
          .18 +
          Math.max(
            0,
            Math.sin(elapsed * .38 + skyway.phase),
          ) * .14
      })

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

      libraryAtmosphere?.update({
        elapsed,
        camera,
        activeDistrictId:
          currentRoomEntry?.district.id,
        activeRoomCenter:
          currentRoomEntry?.center,
        roomSelectionMode: true,
        districts: activeDistricts,
      })

      nearDust.rotation.y = Math.sin(elapsed * .045) * .05
      nearDust.position.x = pointerParallax.x * .16
      nearDust.position.y = pointerParallax.y * .1
      nearDustMaterial.opacity =
        .14 + Math.max(0, Math.sin(elapsed * .19)) * .06

      if (
        libraryWalkwayPanelMaterial &&
        libraryWalkwayRailMaterial
      ) {
        const walkwayPulse = Math.sin(elapsed * .42) * .008
        const walkwayBay =
          archiveBayFromWorldZ(camera.position.z)
        const forwardEnergy =
          Math.max(
            0,
            Math.sin(elapsed * .56 - walkwayBay * .16),
          ) * .012
        libraryWalkwayPanelMaterial.opacity =
          .075 + walkwayPulse + forwardEnergy
        libraryWalkwayRailMaterial.opacity =
          .22 +
          Math.max(
            0,
            Math.sin(elapsed * .64 - walkwayBay * .22 + .8),
          ) * .065
        if (libraryWalkwayUnderlayMaterial) {
          libraryWalkwayUnderlayMaterial.opacity =
            .035 +
            Math.max(
              0,
              Math.sin(elapsed * .34 - walkwayBay * .12 + 1.4),
            ) * .022
        }
      }

      const currentArchiveBay = libraryMode
        ? archiveBayFromWorldZ(camera.position.z)
        : 0

      libraryAudio?.update({
        enabled: soundEnabledRef.current,
        movementMode: libraryMovementModeRef.current,
        speed: Math.hypot(
          flightVelocity.x,
          flightVelocity.z,
        ),
        elapsed,
        currentBay: currentArchiveBay,
        activeAudioProfile:
          currentRoomEntry?.district.audioProfile ?? 'ambient',
        districts: activeDistricts,
      })

      libraryRouteObjects.forEach((object) => {
        if (object.userData.libraryLandmark) {
          const phase =
            object.userData.libraryLandmarkPhase as number
          const baseY =
            object.userData.libraryLandmarkBaseY as number
          const baseRotationY =
            object.userData
              .libraryLandmarkBaseRotationY as number
          const landmarkHeight =
            object.userData.libraryLandmarkHeight as number
          const landmarkBay =
            object.userData.libraryLandmarkBay as number
          const landmarkDistance =
            Math.abs(landmarkBay - currentArchiveBay)
          const heroWake =
            1 -
            THREE.MathUtils.smoothstep(
              landmarkDistance,
              .45,
              5.2,
            )
          const passThroughFade =
            THREE.MathUtils.smoothstep(
              landmarkDistance,
              .08,
              .62,
            )
          const landmarkBaseScale =
            (object.userData.libraryLandmarkBaseScale as
              | number
              | undefined) ?? 1
          const heroScale =
            landmarkBaseScale *
            (1 +
              heroWake * .055 +
              Math.max(
                0,
                Math.sin(elapsed * .48 + phase),
              ) *
                .008)

          object.position.y =
            baseY +
            Math.sin(elapsed * .48 + phase) * .085
          object.rotation.y =
            baseRotationY +
            Math.sin(elapsed * .18 + phase) * .07
          object.scale.lerp(
            new THREE.Vector3(
              heroScale,
              heroScale,
              heroScale,
            ),
            .075,
          )

          object.children.forEach((child) => {
            if (child.userData.libraryLandmarkHalo) {
              const halo = child as THREE.Mesh
              const material =
                halo.material as THREE.MeshBasicMaterial
              const haloScale =
                1 +
                heroWake * .12 +
                Math.sin(elapsed * .34 + phase) * .018
              halo.scale.setScalar(haloScale)
              material.opacity +=
                (((.08 + heroWake * .17) *
                  passThroughFade) -
                  material.opacity) *
                .08
              halo.rotation.z =
                Math.sin(elapsed * .12 + phase) * .035
            } else if (child.userData.libraryLandmarkScan) {
              const cycle =
                (elapsed * .18 + phase * .13) % 1
              child.position.y =
                -landmarkHeight * .34 +
                cycle * landmarkHeight * .68
              child.rotation.z =
                elapsed * .14 + phase
              const material =
                (child as THREE.Mesh)
                  .material as THREE.MeshBasicMaterial
              material.opacity =
                (.22 +
                  heroWake * .16 +
                  Math.max(
                    0,
                    Math.sin(elapsed * 1.4 + phase),
                  ) * .28) *
                passThroughFade
            } else if (
              child.userData.libraryLandmarkOrbit
            ) {
              child.rotation.y =
                elapsed * .22 + phase
              child.rotation.x =
                Math.sin(elapsed * .12 + phase) * .12
              const material =
                (child as THREE.Points)
                  .material as THREE.PointsMaterial
              material.opacity =
                (.4 +
                  heroWake * .22 +
                  Math.max(
                    0,
                    Math.sin(elapsed * .7 + phase),
                  ) * .2) *
                passThroughFade
            } else if (
              child.userData.libraryDistrictMotif
            ) {
              child.rotation.y =
                Math.sin(elapsed * .16 + phase) * .09
              child.position.y =
                Math.sin(elapsed * .32 + phase) * .055
              child.scale.setScalar(
                1 + heroWake * .06,
              )
            } else if (
              child.userData.libraryLandmarkWire
            ) {
              const material =
                (child as THREE.Mesh)
                  .material as THREE.MeshBasicMaterial
              material.opacity +=
                (((.7 + heroWake * .24) *
                  passThroughFade) -
                  material.opacity) *
                .1
            } else if (
              child.userData.libraryLandmarkPedestal
            ) {
              const material =
                (child as THREE.Mesh)
                  .material as THREE.MeshBasicMaterial
              material.opacity =
                (.27 +
                  heroWake * .16 +
                  Math.max(
                    0,
                    Math.sin(elapsed * .68 + phase),
                  ) * .16) *
                (.45 + passThroughFade * .55)
            } else if (
              child.userData.libraryLandmarkCore
            ) {
              const material =
                (child as THREE.Mesh)
                  .material as THREE.MeshBasicMaterial
              material.opacity =
                (.16 +
                  heroWake * .12 +
                  Math.max(
                    0,
                    Math.sin(elapsed * .52 + phase),
                  ) * .12) *
                passThroughFade
            }
          })
          return
        }

        if (!object.userData.routeMarkerBaseY) return
        const phase = object.userData.routeMarkerPhase as number
        const baseY = object.userData.routeMarkerBaseY as number
        object.position.y =
          baseY + Math.sin(elapsed * .42 + phase) * .08

        const markerBay = object.userData.routeMarkerBay
        if (
          typeof markerBay === 'number' &&
          object instanceof THREE.Sprite
        ) {
          const distance = Math.abs(markerBay - currentArchiveBay)
          const wake = 1 - THREE.MathUtils.smoothstep(
            distance,
            1.2,
            5.5,
          )
          const material = object.material as THREE.SpriteMaterial
          material.opacity +=
            ((.42 + wake * .52) - material.opacity) * .09
          const baseScale =
            (object.userData.routeMarkerBaseScale as number) || 6.2
          const scale = baseScale * (1 + wake * .07)
          object.scale.lerp(
            new THREE.Vector3(scale, scale / 4, 1),
            .08,
          )
        }
      })

      if (libraryArrows) {
        const awakeColor = new THREE.Color(0xb7f8ff)
        const idleColor = new THREE.Color(0x24465a)
        const color = new THREE.Color()
        libraryArrowBays.forEach((bay, index) => {
          const deltaBay = bay - currentArchiveBay
          const aheadBias = deltaBay >= -.5 ? 1 : .62
          const wake =
            (1 - THREE.MathUtils.smoothstep(
              Math.abs(deltaBay),
              .4,
              5.8,
            )) * aheadBias
          color.copy(idleColor).lerp(awakeColor, wake)
          libraryArrows?.setColorAt(index, color)
        })
        if (libraryArrows.instanceColor) {
          libraryArrows.instanceColor.needsUpdate = true
        }
      }

      if (libraryRouteDots && libraryRouteDotGeometry) {
        const routePositions =
          libraryRouteDotGeometry.getAttribute(
            'position',
          ) as THREE.BufferAttribute
        const pulseGroups = Math.max(
          1,
          Math.floor(libraryRouteDotCount / 3),
        )

        for (
          let index = 0;
          index < libraryRouteDotCount;
          index += 1
        ) {
          const lane = (index % 3) - 1
          const pulseIndex = Math.floor(index / 3)
          const laneOffset = lane === 0 ? 0 : lane * .18
          const bay =
            (elapsed * .46 +
              pulseIndex *
                (ARCHIVE_PATH_RENDER_BAYS / pulseGroups) +
              laneOffset +
              ARCHIVE_PATH_RENDER_BAYS) %
            ARCHIVE_PATH_RENDER_BAYS
          const point = archivePathPoint(bay)
          const frame = archivePathFrame(bay)
          const halfWidth =
            archiveWalkwayHalfWidthAtBay(
              bay,
              activeDistricts,
            )
          const lateral =
            lane === 0
              ? 0
              : lane * Math.max(.4, halfWidth - .3)

          routePositions.setXYZ(
            index,
            point[0] + frame.normalX * lateral,
            point[1] +
              ARCHIVE_WALKWAY_Y_OFFSET +
              (lane === 0 ? .095 : .13),
            point[2] + frame.normalZ * lateral,
          )
        }
        routePositions.needsUpdate = true
        if (libraryRouteDotMaterial) {
          libraryRouteDotMaterial.opacity =
            .7 +
            Math.max(0, Math.sin(elapsed * .72)) * .16
        }
      }

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

      if (
        libraryMode &&
        pendingShelfHydrators.size > 0 &&
        elapsed - lastShelfHydrationAt > .07
      ) {
        let hydrateId: string | null = null
        let hydrateDistance = Infinity

        pendingShelfHydrators.forEach((_, nodeId) => {
          const visual = nodeVisuals.get(nodeId)
          if (!visual) return
          const distance =
            camera.position.distanceTo(
              visual.group.position,
            )
          if (distance < hydrateDistance) {
            hydrateDistance = distance
            hydrateId = nodeId
          }
        })

        // Only hydrate shelves near the player's current zone. Shelf frames
        // remain visible everywhere, while books and covers stream in as the
        // player approaches instead of all being built during first paint.
        if (hydrateId && hydrateDistance < 46) {
          pendingShelfHydrators.get(hydrateId)?.()
          lastShelfHydrationAt = elapsed
        }
      }

      libraryReadingRitual?.update({
        nowSeconds: now / 1000,
        books: libraryBookVisuals,
        hoveredBook,
        approachedShelfId: flightNearestId,
        readerActive: Boolean(libraryReadingBookRef.current),
        getShelfDistance: (nodeId) => {
          const shelfVisual = nodeVisuals.get(nodeId)
          return shelfVisual
            ? camera.position.distanceTo(
                shelfVisual.group.position,
              )
            : Infinity
        },
        onOpen: (nodeId, bookIndex) => {
          onBookSelectRef.current?.(nodeId, bookIndex)
        },
      })

      let nearestLibraryShelfId: string | null = null
      let nearestLibraryShelfDistance = Infinity
      const nearestShelfPoint = new THREE.Vector3()

      if (libraryMode) {
        nodeRef.current.forEach((node) => {
          if (node.libraryKind !== 'shelf') return
          const visual = nodeVisuals.get(node._id)
          if (!visual) return
          visual.group.getWorldPosition(nearestShelfPoint)
          const distance = nearestShelfPoint.distanceTo(camera.position)
          if (distance < nearestLibraryShelfDistance) {
            nearestLibraryShelfDistance = distance
            nearestLibraryShelfId = node._id
          }
        })

        const nearestVisual = nearestLibraryShelfId
          ? nodeVisuals.get(nearestLibraryShelfId)
          : null
        const focusStrength = THREE.MathUtils.clamp(
          1 - (nearestLibraryShelfDistance - 7) / 12,
          0,
          1,
        )

        libraryAudio?.updateShelfFocus({
          enabled: soundEnabledRef.current,
          shelfId: nearestLibraryShelfId,
          focusStrength,
        })

        if (libraryShelfLight && nearestVisual) {
          libraryShelfLight.position
            .copy(nearestVisual.group.position)
            .add(new THREE.Vector3(0, 1.35, 1.2))
          libraryShelfLight.intensity +=
            (focusStrength * 2.1 - libraryShelfLight.intensity) * .08
        } else if (libraryShelfLight) {
          libraryShelfLight.intensity *= .9
        }

        if (libraryShelfSparkles && nearestVisual) {
          libraryShelfSparkles.visible = focusStrength > .04
          libraryShelfSparkles.position.copy(nearestVisual.group.position)
          libraryShelfSparkles.rotation.y += .0018
          if (libraryShelfSparkleMaterial) {
            libraryShelfSparkleMaterial.opacity =
              .18 + focusStrength * .48
          }
        } else if (libraryShelfSparkles) {
          libraryShelfSparkles.visible = false
        }

        libraryBookVisuals.forEach((bookVisual) => {
          const shelfVisual = nodeVisuals.get(bookVisual.nodeId)
          const shelfDistance = shelfVisual
            ? camera.position.distanceTo(shelfVisual.group.position)
            : Infinity
          const awake =
            bookVisual.nodeId === nearestLibraryShelfId
              ? focusStrength
              : 0
          const presented =
            libraryReadingRitual?.isPresenting(bookVisual) ?? false
          // pickBook/pickCenterBook already enforce the short
          // interaction radius using the actual ray-hit distance. Do not
          // re-check against the shelf group's center here: wall shelves can
          // have a center farther away than the book the ray actually hit.
          const directlyHovered =
            hoveredBook === bookVisual

          bookVisual.hoverGlow.visible =
            directlyHovered && !presented
          if (bookVisual.hoverGlow.visible) {
            const hoverPulse =
              1.05 + Math.sin(elapsed * 4.6) * .035
            bookVisual.hoverGlow.scale.set(
              hoverPulse,
              hoverPulse,
              1,
            )
          }

          bookVisual.coverMaterial.emissive.setHex(
            presented ? 0x6d2f73 : 0x163744,
          )
          const targetEmissive = presented
            ? 1.35
            : directlyHovered
              ? .82
              : awake * .5
          bookVisual.coverMaterial.emissiveIntensity +=
            (targetEmissive -
              bookVisual.coverMaterial.emissiveIntensity) *
            .1

          const distanceWake =
            1 -
            THREE.MathUtils.smoothstep(
              shelfDistance,
              10,
              42,
            )
          const neighborDim =
            nearestLibraryShelfId &&
            bookVisual.nodeId !== nearestLibraryShelfId &&
            focusStrength > .2
              ? THREE.MathUtils.lerp(
                  1,
                  .72,
                  focusStrength,
                )
              : 1
          const targetTint =
            (presented
              ? .76
              : .26 +
                Math.max(
                  awake,
                  distanceWake * .5,
                ) *
                  .42) *
            neighborDim
          const tint = bookVisual.coverMaterial.color
          tint.r += (targetTint - tint.r) * .08
          tint.g += (targetTint - tint.g) * .08
          tint.b += ((targetTint * 1.04) - tint.b) * .08
        })

      }

      for (const node of nodeRef.current) {
        const visual = nodeVisuals.get(node._id)
        if (!visual) continue

        if (node.libraryKind !== 'shelf') {
          const target = worldPosition(node, positionsRef.current)
          const memoryAge = nodeMemoryAge.get(node._id) ?? 0
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
          const gravity = gravityParents.get(node._id)
          if (gravity) {
            const parentVisual = nodeVisuals.get(gravity.parentId)
            if (parentVisual) {
              const orbitAngle =
                elapsed *
                  (0.035 +
                    Math.min(node.frequency, 3) * 0.004) +
                gravity.phase
              const orbitTarget = parentVisual.group.position
                .clone()
                .add(
                  new THREE.Vector3(
                    Math.cos(orbitAngle) * gravity.radius,
                    Math.sin(orbitAngle * 0.73) *
                      gravity.radius *
                      0.58,
                    Math.sin(orbitAngle) *
                      gravity.radius *
                      0.34,
                  ),
                )
              target.lerp(orbitTarget, gravity.influence)
            }
          }

          visual.group.position.lerp(target, .08)
        }

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

        const shelfDistance =
          node.libraryKind === 'shelf'
            ? camera.position.distanceTo(visual.group.position)
            : Infinity
        const isNearestLibraryShelf =
          node.libraryKind === 'shelf' &&
          nearestLibraryShelfId === node._id &&
          nearestLibraryShelfDistance < 18
        const nearbyShelfFocusActive =
          node.libraryKind === 'shelf' &&
          nearestLibraryShelfDistance < 16

        if (node.libraryKind !== 'shelf') {
          const scaleBoost = selected
            ? 1.32
            : hoveredId === node._id
              ? 1.14
              : 1
          const desiredScale = visual.baseScale * scaleBoost
          visual.group.scale.lerp(
            new THREE.Vector3(
              desiredScale,
              desiredScale,
              desiredScale,
            ),
            selected ? .13 : .08,
          )
        }

        if (node.libraryKind === 'shelf') {
          const materializationArmed =
            visual.group.userData
              .libraryMaterializationArmed === true
          let materializationStartedAt =
            visual.group.userData
              .libraryMaterializationStartedAt as
              | number
              | undefined

          if (
            materializationArmed &&
            shelfDistance < 14
          ) {
            materializationStartedAt = now
            visual.group.userData
              .libraryMaterializationStartedAt = now
            delete visual.group.userData
              .libraryMaterializationArmed
          }

          if (
            typeof materializationStartedAt === 'number'
          ) {
            const progress = THREE.MathUtils.clamp(
              (now - materializationStartedAt) / 2400,
              0,
              1,
            )
            const eased =
              progress < .82
                ? 1 - Math.pow(1 - progress / .82, 3)
                : 1 +
                  Math.sin(
                    ((progress - .82) / .18) * Math.PI,
                  ) *
                    .035
            visual.group.scale.setScalar(
              Math.min(
                visual.baseScale * 1.035,
                THREE.MathUtils.lerp(
                  .035,
                  visual.baseScale,
                  eased,
                ),
              ),
            )
            const shelfLabelMaterial =
              visual.label.material as THREE.SpriteMaterial
            shelfLabelMaterial.opacity =
              Math.max(
                shelfLabelMaterial.opacity,
                THREE.MathUtils.smoothstep(
                  progress,
                  .38,
                  .9,
                ) * .94,
              )

            if (progress >= 1) {
              visual.group.scale.setScalar(
                visual.baseScale,
              )
              delete visual.group.userData
                .libraryMaterializationStartedAt
              visual.group.userData
                .libraryShelfLifecycle = 'active'
            }
          } else if (materializationArmed) {
            // The slot exists, but its occupant has not physically manifested
            // yet. Keeping it nearly invisible makes the empty space legible.
            visual.group.scale.setScalar(.035)
            const shelfLabelMaterial =
              visual.label.material as THREE.SpriteMaterial
            shelfLabelMaterial.opacity = 0
          }

          const frameMaterial =
            visual.group.userData
              .libraryShelfFrameMaterial as
              | THREE.MeshStandardMaterial
              | undefined
          const boardMaterial =
            visual.group.userData
              .libraryShelfBoardMaterial as
              | THREE.MeshStandardMaterial
              | undefined
          const accentMaterial =
            visual.group.userData
              .libraryShelfAccentMaterial as
              | THREE.MeshBasicMaterial
              | undefined
          const proximityWake =
            1 -
            THREE.MathUtils.smoothstep(
              shelfDistance,
              8,
              30,
            )
          const focalWake = isNearestLibraryShelf
            ? THREE.MathUtils.clamp(
                1 -
                  (nearestLibraryShelfDistance - 5) /
                    14,
                0,
                1,
              )
            : 0
          const neighborDim =
            nearbyShelfFocusActive &&
            !isNearestLibraryShelf
              ? .58
              : 1
          const reactiveStrength =
            Math.max(
              proximityWake * .58,
              focalWake,
            ) * neighborDim

          if (frameMaterial) {
            frameMaterial.emissiveIntensity +=
              ((.018 + reactiveStrength * .42) -
                frameMaterial.emissiveIntensity) *
              .09
            frameMaterial.envMapIntensity +=
              ((settings.environmentIntensity *
                (.4 + reactiveStrength * .42)) -
                frameMaterial.envMapIntensity) *
              .08
          }
          if (boardMaterial) {
            boardMaterial.emissiveIntensity +=
              ((.016 + reactiveStrength * .3) -
                boardMaterial.emissiveIntensity) *
              .09
          }
          if (accentMaterial) {
            accentMaterial.opacity +=
              ((.1 + reactiveStrength * .7) -
                accentMaterial.opacity) *
              .11
          }

          const shelfLabelMaterial =
            visual.label.material as THREE.SpriteMaterial
          const labelDistance =
            camera.position.distanceTo(
              visual.group.position,
            )
          const shelfDistanceOpacity =
            labelDistance < 24
              ? .96
              : labelDistance < 50
                ? THREE.MathUtils.lerp(
                    .58,
                    .14,
                    (labelDistance - 24) / 26,
                  )
                : labelDistance < 78
                  ? .045
                  : .012
          visual.label.visible =
            labelDistance < 88 ||
            selected ||
            hoveredId === node._id
          const shelfLabelTarget =
            selected || hoveredId === node._id
              ? 1
              : shelfDistanceOpacity
          shelfLabelMaterial.opacity +=
            (((visible ? shelfLabelTarget : .04) *
              introVisibility) -
              shelfLabelMaterial.opacity) *
            .08

          // Shelf nodes intentionally skip the original Dream Map orb,
          // mini-world, reflection and orbit animation path. Those objects
          // are hidden for library shelves and updating them every frame is
          // pure overhead when dozens of shelves are present.
          continue
        }

        if (node.libraryKind !== 'shelf') {
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
        const labelDistance = camera.position.distanceTo(
          visual.group.position,
        )
        const shelfDistanceOpacity =
          labelDistance < 24
            ? .96
            : labelDistance < 50
              ? THREE.MathUtils.lerp(
                  .58,
                  .14,
                  (labelDistance - 24) / 26,
                )
              : labelDistance < 78
                ? .045
                : .012
        if (node.libraryKind === 'shelf') {
          visual.label.visible =
            labelDistance < 88 ||
            selected ||
            hoveredId === node._id
        }
        const labelTarget =
          node.libraryKind === 'shelf'
            ? selected || hoveredId === node._id
              ? 1
              : shelfDistanceOpacity
            : selected || hoveredId === node._id
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

      libraryFloatingProps.update(elapsed)

      if (libraryMode) {
        shelfBookLabelLayers.forEach(({shelfRoot, layer}) => {
          const distanceSq =
            camera.position.distanceToSquared(
              shelfRoot.position,
            )
          layer.visible = distanceSq < 12.5 * 12.5
        })
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
        const isFlightRouteEdge = Boolean(
          flightRoute &&
            ((edgeVisual.source === flightRoute.sourceId &&
              edgeVisual.target === flightRoute.targetId) ||
              (edgeVisual.target === flightRoute.sourceId &&
                edgeVisual.source === flightRoute.targetId)),
        )
        const desiredOpacity = isFlightRouteEdge
          ? .82 * introEdgeFactor
          : touchesSelected
            ? .11 * introEdgeFactor
            : edgeHighlighted
              ? .035 * introEdgeFactor
              : .016 * introEdgeFactor
        edgeVisual.material.opacity +=
          (desiredOpacity - edgeVisual.material.opacity) * .1
        edgeVisual.material.color.lerp(
          new THREE.Color(
            isFlightRouteEdge ? 0xcaf7ff : 0x52758a,
          ),
          .12,
        )

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
          isFlightRouteEdge
            ? .96
            : isRelationEdge
              ? .46 * (1 - relationProgress * .3)
              : touchesSelected
                ? .16
                : .035
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

        if (spatialAudio && !libraryMode) {
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

      let atmospherePreset =
        globalAtmospherePreset

      if (libraryMode && currentRoomEntry) {
        atmospherePreset =
          getLibraryAtmosphereVisualPreset(
            currentRoomEntry.district.atmosphere,
          )
      }

      const readingRitualActive =
        libraryReadingRitual?.isActive() ?? false

      const libraryBloomStrength =
        settings.bloomStrength *
        (selectedVisual?.group.userData.libraryKind === 'shelf'
          ? .47
          : .55)
      const bloomTarget = libraryMode
        ? (.075 +
            (readingRitualActive ? .012 : 0) +
            (selectedVisual ? .008 : 0)) *
          atmospherePreset.bloomScale
        : (selectedVisual
            ? libraryBloomStrength * 1.05
            : settings.bloomStrength * .52) *
          atmospherePreset.bloomScale
      bloom.strength +=
        (bloomTarget - bloom.strength) * .045

      dreamPost.uniforms.uTime.value = elapsed
      if (diveMode !== 'entering') {
        dreamPost.uniforms.uTravel.value +=
          ((selectedVisual ? .12 : 0) - dreamPost.uniforms.uTravel.value) *
          .03
      }

      const baseExposure = libraryMode
        ? readingRitualActive
          ? .44
          : selectedVisual?.group.userData.libraryKind === 'shelf'
            ? .55
            : selectedVisual
              ? .57
              : .51
        : readingRitualActive
          ? .66
          : selectedVisual?.group.userData.libraryKind === 'shelf'
            ? .82
            : selectedVisual
              ? .88
              : .9
      const exposureTarget = libraryMode
        ? THREE.MathUtils.clamp(
            baseExposure * atmospherePreset.exposureScale,
            .38,
            .59,
          )
        : baseExposure
      renderer.toneMappingExposure +=
        (exposureTarget - renderer.toneMappingExposure) *
        .05

      if (scene.fog instanceof THREE.FogExp2) {
        const sceneReveal = Math.min(1, elapsed / 1.7)
        const birthFog =
          (1 - sceneReveal) * (libraryMode ? .012 : .072)
        const hazeScale = libraryMode
          ? .55 +
            activeLibraryConfig.hazeIntensity * .85
          : 1
        const selectedFogScale = selectedVisual
          ? 1.1
          : 1
        const fogTarget =
          settings.fogDensity *
            (libraryMode
              ? .2 * atmospherePreset.fogScale * hazeScale
              : 1) *
            selectedFogScale +
          birthFog

        scene.fog.density +=
          (fogTarget - scene.fog.density) * .05

        if (libraryMode) {
          atmosphereFogTarget.setHex(
            atmospherePreset.fog,
          )
          scene.fog.color.lerp(
            atmosphereFogTarget,
            .045,
          )
        }
      }

      if (libraryMode) {
        atmosphereBackgroundTarget.setHex(
          atmospherePreset.background,
        )
        sceneBackgroundColor.lerp(
          atmosphereBackgroundTarget,
          .035,
        )
        atmosphereLightTarget.setHex(
          atmospherePreset.tint,
        )
        violetLight.color.lerp(
          atmosphereLightTarget,
          .035,
        )
        cyanLight.color.lerp(
          atmosphereLightTarget,
          .022,
        )
      }

      const atmosphereLightScale = libraryMode
        ? atmospherePreset.lightStrength
        : 1
      const violetTarget =
        (libraryMode
          ? selectedVisual
            ? .12
            : .055
          : selectedVisual
            ? 4.7
            : 4) * atmosphereLightScale
      const cyanTarget =
        (libraryMode
          ? selectedVisual
            ? .09
            : .04
          : selectedVisual
            ? 4.3
            : 3.6) * atmosphereLightScale
      violetLight.intensity +=
        (violetTarget - violetLight.intensity) * .035
      cyanLight.intensity +=
        (cyanTarget - cyanLight.intensity) * .035

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

        const libraryWalking =
          libraryMode &&
          libraryMovementModeRef.current === 'walk'

        if (libraryWalking) {
          flightForward.set(
            -Math.sin(flightYaw),
            0,
            -Math.cos(flightYaw),
          ).normalize()
        } else {
          flightForward.set(
            -Math.sin(flightYaw) * Math.cos(flightPitch),
            Math.sin(flightPitch),
            -Math.cos(flightYaw) * Math.cos(flightPitch),
          ).normalize()
        }

        flightRight.crossVectors(flightForward, flightUp).normalize()
        flightMove.set(0, 0, 0)

        if (flightKeys.has('KeyW')) flightMove.add(flightForward)
        if (flightKeys.has('KeyS')) flightMove.sub(flightForward)
        if (flightKeys.has('KeyD')) flightMove.add(flightRight)
        if (flightKeys.has('KeyA')) flightMove.sub(flightRight)

        if (!libraryWalking) {
          if (flightKeys.has('Space')) flightMove.add(flightUp)
          if (
            flightKeys.has('ControlLeft') ||
            flightKeys.has('ControlRight') ||
            flightKeys.has('KeyQ')
          ) {
            flightMove.sub(flightUp)
          }
        }

        if (flightMove.lengthSq() > 0) flightMove.normalize()

        const boosted =
          flightKeys.has('ShiftLeft') ||
          flightKeys.has('ShiftRight')
        const movementSpeed = libraryWalking
          ? boosted
            ? 4.25
            : 2.55
          : boosted
            ? 7.2
            : 3.15
        const desiredVelocity =
          flightMove.multiplyScalar(movementSpeed)
        const damping =
          1 - Math.exp(-delta * (libraryWalking ? 10.5 : 7.5))

        if (!routeActive) {
          flightVelocity.lerp(desiredVelocity, damping)
          flightPosition.addScaledVector(flightVelocity, delta)
        } else {
          flightVelocity.multiplyScalar(.72)
        }

        if (!libraryMode) {
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
        } else if (libraryWalking) {
          const clamped = clampLibraryWalkPosition(
            flightPosition.x,
            flightPosition.z,
          )
          if (
            clamped.x !== flightPosition.x ||
            clamped.z !== flightPosition.z
          ) {
            flightVelocity.x *= .35
            flightVelocity.z *= .35
          }
          flightPosition.x = clamped.x
          flightPosition.z = clamped.z
          flightPosition.y = THREE.MathUtils.lerp(
            flightPosition.y,
            LIBRARY_EYE_HEIGHT,
            1 - Math.exp(-delta * 11),
          )
          flightVelocity.y = 0
        } else {
          // Free flight remains available for inspection, but the rebuilt
          // library is still a physical interior. Reuse the X/Z collision
          // solver so flying cannot phase through shelves or divider walls.
          const clamped = clampLibraryWalkPosition(
            flightPosition.x,
            flightPosition.z,
          )
          if (
            clamped.x !== flightPosition.x ||
            clamped.z !== flightPosition.z
          ) {
            flightVelocity.x *= .3
            flightVelocity.z *= .3
          }
          flightPosition.x = clamped.x
          flightPosition.z = clamped.z
          flightPosition.y = THREE.MathUtils.clamp(
            flightPosition.y,
            .65,
            4.55,
          )
        }

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

          if (libraryWalking) {
            const planarSpeed = Math.hypot(
              flightVelocity.x,
              flightVelocity.z,
            )
            const movingStrength = THREE.MathUtils.clamp(
              planarSpeed / Math.max(.001, movementSpeed),
              0,
              1,
            )
            libraryWalkBobStrength +=
              (movingStrength - libraryWalkBobStrength) *
              (1 - Math.exp(-delta * 9))

            if (libraryWalkBobStrength > .001) {
              libraryWalkBobPhase +=
                delta *
                (boosted ? 10.2 : 7.7) *
                (.45 + libraryWalkBobStrength * .55)
            }

            const bobY =
              Math.sin(libraryWalkBobPhase * 2) *
              .032 *
              libraryWalkBobStrength
            const sway =
              Math.sin(libraryWalkBobPhase) *
              .016 *
              libraryWalkBobStrength
            camera.position.y += bobY
            camera.position.addScaledVector(flightRight, sway)
          } else {
            libraryWalkBobStrength *=
              Math.exp(-delta * 10)
          }

          camera.rotation.order = 'YXZ'
          camera.rotation.y = flightYaw
          camera.rotation.x = flightPitch
        }

        camera.rotation.z = THREE.MathUtils.lerp(
          camera.rotation.z,
          -flightVelocity.dot(flightRight) *
            (libraryWalking ? .0025 : .008),
          .08,
        )

        const speedRatio = routeActive
          ? .72 + Math.sin(routeProgress * Math.PI) * .28
          : Math.min(
              1,
              flightVelocity.length() /
                (libraryWalking ? 4.25 : 7.2),
            )
        const fovBoost =
          libraryWalking ? speedRatio * 2.2 : speedRatio * 9
        camera.fov +=
          ((43 + fovBoost) - camera.fov) * .065
        camera.updateProjectionMatrix()

        const nearest = nearestFlightNode(10)
        const nearestId = nearest?._id ?? null
        if (nearestId !== flightNearestId) {
          flightNearestId = nearestId
          hoveredId = nearestId
          onNodeHoverRef.current(nearest)
        }

        const navigationKey =
          (nearestId ?? '') +
          '|' +
          (flightRoute?.targetId ?? '')
        if (navigationKey !== lastPublishedNavigation) {
          lastPublishedNavigation = navigationKey
          onFlightNavigationChangeRef.current?.({
            nearestId,
            routeTargetId: flightRoute?.targetId ?? null,
          })
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
      sceneDisposed = true
      if (libraryMode && flightModeRef.current) {
        libraryFlightStateRef.current = {
          position: [
            camera.position.x,
            camera.position.y,
            camera.position.z,
          ],
          quaternion: [
            camera.quaternion.x,
            camera.quaternion.y,
            camera.quaternion.z,
            camera.quaternion.w,
          ],
        }
      }

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
      window.removeEventListener(
        'oniria:layout-pin-request',
        handleLibraryLayoutRequest,
      )
      window.removeEventListener(
        'oniria:layout-pin-export-request',
        handleLibraryLayoutExportRequest,
      )
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

      libraryAudio?.dispose()
      libraryBuilding?.dispose()
      libraryLayoutAuthoring?.dispose()
      libraryFloatingProps.clear()

      camera.remove(listener)

      shelfSideGeometry.dispose()
      shelfBoardGeometry.dispose()
      shelfBackGeometry.dispose()
      shelfBookGeometry.dispose()
      shelfCoverGeometry.dispose()
      shelfHoverGlowGeometry.dispose()
      shelfHoverGlowMaterial.dispose()
      shelfHoverGlowTexture.dispose()
      shelfContactShadows.forEach((shadow) => world.remove(shadow))
      shelfContactShadowGeometry.dispose()
      shelfContactShadowMaterial.dispose()
      shelfBacklightGeometry.dispose()
      shelfBacklightMaterial.dispose()
      shelfBacklightTexture.dispose()
      shelfAccentGeometry.dispose()
      shelfPickGeometry.dispose()
      shelfBookmarkGeometry.dispose()
      shelfBookmarkMaterial.dispose()
      shelfActivityGeometry.dispose()
      shelfFreshMaterial.dispose()
      shelfActiveMaterial.dispose()
      shelfFrameMaterial.dispose()
      shelfBoardMaterial.dispose()
      shelfBookMaterials.forEach((material) => material.dispose())
      shelfReactiveMaterials.forEach((material) => material.dispose())
      shelfCoverMaterials.forEach((material) => material.dispose())
      shelfCoverTextures.forEach((texture) => texture.dispose())
      shelfBookLabelMaterials.forEach((material) => material.dispose())
      shelfBookLabelTextures.forEach((texture) => texture.dispose())
      shelfAccentMaterial.dispose()
      shelfPickMaterial.dispose()
      libraryShelfSparkleGeometry?.dispose()
      libraryShelfSparkleMaterial?.dispose()
      if (libraryShelfSparkles) world.remove(libraryShelfSparkles)
      if (libraryShelfLight) scene.remove(libraryShelfLight)
      libraryReadingRitual?.dispose()

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

      libraryAtmosphere?.dispose()

      nearDustGeometry.dispose()
      nearDustMaterial.dispose()
      scene.remove(nearDust)
      libraryWalkwayGeometry?.dispose()
      libraryWalkwayRailGeometry?.dispose()
      libraryWalkwayPanelMaterial?.dispose()
      libraryWalkwayUnderlayMaterial?.dispose()
      libraryWalkwayRailMaterial?.dispose()
      libraryGridRoadGeometry?.dispose()
      libraryGridRailGeometry?.dispose()
      libraryGridRoadMaterial?.dispose()
      libraryGridUnderlayMaterial?.dispose()
      libraryGridRailMaterial?.dispose()
      libraryArrowGeometry?.dispose()
      libraryArrowMaterial?.dispose()
      libraryGuardGeometry?.dispose()
      libraryGuardMaterial?.dispose()
      libraryJunctionGeometry?.dispose()
      libraryJunctionMaterial?.dispose()
      libraryRouteDotGeometry?.dispose()
      libraryRouteDotMaterial?.dispose()
      libraryRouteTextures.forEach((texture) => texture.dispose())
      libraryRouteMaterials.forEach((material) => material.dispose())
      libraryDistrictLandmarkGeometries.forEach((geometry) =>
        geometry.dispose(),
      )
      libraryDistrictLandmarkMaterials.forEach((material) =>
        material.dispose(),
      )
      libraryRouteObjects.forEach((object) => {
        if (object instanceof THREE.Object3D) world.remove(object)
      })
      if (libraryArrows) world.remove(libraryArrows)
      if (libraryGuards) world.remove(libraryGuards)
      if (libraryJunctions) world.remove(libraryJunctions)
      if (libraryRouteDots) world.remove(libraryRouteDots)
      if (libraryWalkwayUnderlay) {
        world.remove(libraryWalkwayUnderlay)
      }
      if (libraryWalkway) world.remove(libraryWalkway)
      if (libraryWalkwayRails) world.remove(libraryWalkwayRails)
      if (libraryGridUnderlay) {
        world.remove(libraryGridUnderlay)
      }
      if (libraryGridRoads) world.remove(libraryGridRoads)
      if (libraryGridRails) world.remove(libraryGridRails)
      shaftGeometries.forEach((geometry) => geometry.dispose())
      shaftMaterials.forEach((material) => material.dispose())

      nebulae.forEach((sprite) => {
        const material = sprite.material as THREE.SpriteMaterial
        material.map?.dispose()
        material.dispose()
      })

      libraryFarParticleGeometry?.dispose()
      libraryFarParticleMaterial?.dispose()
      librarySkywayGeometries.forEach((geometry) =>
        geometry.dispose(),
      )
      librarySkywayMaterials.forEach((material) =>
        material.dispose(),
      )

      starGeometry.dispose()
      starMaterial.dispose()
      if (librarySkyDome) farWorld.remove(librarySkyDome)
      librarySkyDomeGeometry?.dispose()
      librarySkyDomeMaterial?.dispose()
      scene.environment = null
      cinematicEnvironment.dispose()
      composer.dispose()
      renderer.dispose()
      container.removeChild(renderer.domElement)
    }
  }, [graphKey, libraryWorldKey])

  return (
    <div
      ref={hostRef}
      className={styles.webglShell}
      role="application"
      aria-label="Interactive 3D dream map"
    />
  )
}
