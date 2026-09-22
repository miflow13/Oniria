'use client'

import {useEffect, useMemo, useRef} from 'react'
import * as THREE from 'three'
import {EffectComposer} from 'three/examples/jsm/postprocessing/EffectComposer.js'
import {RenderPass} from 'three/examples/jsm/postprocessing/RenderPass.js'
import {UnrealBloomPass} from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import {BokehPass} from 'three/examples/jsm/postprocessing/BokehPass.js'
import {OutputPass} from 'three/examples/jsm/postprocessing/OutputPass.js'
import type {SymbolCategory} from '@/types/dream'
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

export type DreamWorldNode = {
  _id: string
  name: string
  category: SymbolCategory
  icon?: string
  x: number
  y: number
  frequency: number
  dreamIds: string[]
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
  selectedId: string | null
  activeId: string | null
  focusedIds: Set<string>
  relatedEdgeIds: Set<string>
  zoom: number
  pan: Pan
  quality: DreamQuality
  soundEnabled: boolean
  onZoomChange: (zoom: number) => void
  onPanChange: (pan: Pan) => void
  onNodeHover: (node: DreamWorldNode | null) => void
  onNodeSelect: (node: DreamWorldNode) => void
  onBackgroundClick: () => void
  onProjectionChange: (projection: ProjectionPoint | null) => void
}

type NodeVisual = {
  group: THREE.Group
  shell: THREE.Mesh
  shellMaterial: LivingOrbMaterial
  miniWorld: MiniWorld
  glow: THREE.Mesh
  core: THREE.Mesh
  orbit: THREE.Mesh
  label: THREE.Sprite
  baseScale: number
  phase: number
  z: number
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
  const point = positions[node._id] ?? {x: node.x * 10, y: node.y * 7}
  const seed = hashString(node._id)
  const z = -1.6 + seededUnit(seed, 19) * 3.2

  return new THREE.Vector3(
    (point.x - 500) / 54,
    (350 - point.y) / 54,
    z,
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

  const color = new THREE.Color(CATEGORY_COLORS[node.category])
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
    `${node.frequency} dream${node.frequency === 1 ? '' : 's'} · ${node.category}`,
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
  selectedId,
  activeId,
  focusedIds,
  relatedEdgeIds,
  zoom,
  pan,
  quality,
  soundEnabled,
  onZoomChange,
  onPanChange,
  onNodeHover,
  onNodeSelect,
  onBackgroundClick,
  onProjectionChange,
}: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const nodeRef = useRef(nodes)
  const positionsRef = useRef(positions)
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
  const onBackgroundClickRef = useRef(onBackgroundClick)
  const onProjectionChangeRef = useRef(onProjectionChange)
  const qualityRef = useRef(quality)
  const soundEnabledRef = useRef(soundEnabled)

  nodeRef.current = nodes
  positionsRef.current = positions
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
  onBackgroundClickRef.current = onBackgroundClick
  onProjectionChangeRef.current = onProjectionChange
  qualityRef.current = quality
  soundEnabledRef.current = soundEnabled

  const graphKey = useMemo(
    () =>
      `${quality}::${nodes.map((node) => node._id).join('|')}::${edges
        .map((edge) => `${edge.id}:${edge.weight}`)
        .join('|')}`,
    [edges, nodes, quality],
  )

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

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
    renderer.toneMappingExposure = 1.12
    renderer.shadowMap.enabled = false
    renderer.domElement.className = styles.webglCanvas
    host.appendChild(renderer.domElement)

    const composer = new EffectComposer(renderer)
    composer.addPass(new RenderPass(scene, camera))

    const depthOfField = new BokehPass(scene, camera, {
      focus: 10,
      aperture: 0.000035,
      maxblur: settings.maxBlur,
      width: 1,
      height: 1,
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
    composer.addPass(new OutputPass())

    scene.add(new THREE.AmbientLight(0x7182b6, 0.75))

    const keyLight = new THREE.DirectionalLight(0xd4e5ff, 2.1)
    keyLight.position.set(-5, 6, 8)
    scene.add(keyLight)

    const violetLight = new THREE.PointLight(0xb791ff, 18, 20, 2)
    violetLight.position.set(-5, 1, 3)
    scene.add(violetLight)

    const cyanLight = new THREE.PointLight(0x72e2df, 16, 20, 2)
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

    const nodeVisuals = new Map<string, NodeVisual>()
    const interactive: THREE.Object3D[] = []

    for (const node of nodeRef.current) {
      const seed = hashString(node._id)
      const color = new THREE.Color(CATEGORY_COLORS[node.category])
      const group = new THREE.Group()
      group.userData.nodeId = node._id

      const shellMaterial = createLivingOrbMaterial(color, node.category)
      const shell = new THREE.Mesh(nodeGeometry(node.category), shellMaterial)
      shell.userData.nodeId = node._id
      group.add(shell)
      interactive.push(shell)

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

      const coreMaterial = new THREE.MeshStandardMaterial({
        color: color.clone().lerp(new THREE.Color(0xffffff), .2),
        emissive: color,
        emissiveIntensity: 2.6,
        transparent: true,
        opacity: .88,
        roughness: .35,
      })
      const core = new THREE.Mesh(
        new THREE.IcosahedronGeometry(.22 + Math.min(node.frequency, 5) * .025, 2),
        coreMaterial,
      )
      core.userData.nodeId = node._id
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

      const labelTexture = createLabelTexture(node)
      const labelMaterial = new THREE.SpriteMaterial({
        map: labelTexture,
        transparent: true,
        depthWrite: false,
        opacity: .86,
      })
      const label = new THREE.Sprite(labelMaterial)
      label.position.set(0, -.94, .05)
      label.scale.set(2.2, .5, 1)
      group.add(label)

      const start = worldPosition(node, positionsRef.current)
      group.position.copy(start)

      const baseScale = .78 + Math.min(node.frequency, 5) * .07
      group.scale.setScalar(baseScale)
      world.add(group)

      nodeVisuals.set(node._id, {
        group,
        shell,
        shellMaterial,
        miniWorld,
        glow,
        core,
        orbit,
        label,
        baseScale,
        phase: seededUnit(seed, 31) * Math.PI * 2,
        z: start.z,
      })
    }

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
    let hoveredId: string | null = null
    let pointerDown: {x: number; y: number; pan: Pan} | null = null
    let dragging = false
    let lastProjection = {x: -999, y: -999, visible: false}

    let activeCellId: string | null = null
    let activeCell: DreamCell | null = null
    let spatialAudio: SpatialDreamAudio | null = null
    let spatialAudioStarted = false

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
      spatialAudioStarted = false
    }

    function ensureDreamCell(node: DreamWorldNode) {
      if (activeCellId === node._id && activeCell) return

      releaseDreamCell()

      const visual = nodeVisuals.get(node._id)
      if (!visual) return

      const color = new THREE.Color(CATEGORY_COLORS[node.category])
      activeCell = createDreamCell(
        node.category,
        color,
        settings,
        hashString(node._id),
      )
      activeCellId = node._id
      visual.group.add(activeCell.portal)
      visual.miniWorld.group.visible = false
      visual.core.visible = false

      spatialAudio = createSpatialDreamAudio(
        listener,
        node.category,
        hashString(node._id),
      )
      visual.group.add(spatialAudio.audio)
    }

    function resize() {
      const rect = host.getBoundingClientRect()
      if (!rect.width || !rect.height) return
      renderer.setSize(rect.width, rect.height, false)
      composer.setSize(rect.width, rect.height)
      bloom.resolution.set(rect.width, rect.height)
      camera.aspect = rect.width / rect.height
      camera.updateProjectionMatrix()
    }

    const resizeObserver = new ResizeObserver(resize)
    resizeObserver.observe(host)
    resize()

    function normalizedPointer(event: PointerEvent) {
      const rect = renderer.domElement.getBoundingClientRect()
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
    }

    function pickNode(event: PointerEvent) {
      normalizedPointer(event)
      raycaster.setFromCamera(pointer, camera)
      const intersections = raycaster.intersectObjects(interactive, false)
      if (!intersections.length) return null
      const id = intersections[0].object.userData.nodeId as string | undefined
      return nodeRef.current.find((node) => node._id === id) ?? null
    }

    function handlePointerMove(event: PointerEvent) {
      if (pointerDown) {
        const dx = event.clientX - pointerDown.x
        const dy = event.clientY - pointerDown.y
        if (Math.abs(dx) + Math.abs(dy) > 4) dragging = true
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
      pointerDown = {
        x: event.clientX,
        y: event.clientY,
        pan: panRef.current,
      }
      dragging = false
      renderer.domElement.setPointerCapture(event.pointerId)
    }

    function handlePointerUp(event: PointerEvent) {
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
      pointerDown = null
      dragging = false
      if (hoveredId !== null) {
        hoveredId = null
        onNodeHoverRef.current(null)
      }
    }

    function handleWheel(event: WheelEvent) {
      event.preventDefault()
      const next = Math.min(
        2.8,
        Math.max(.68, zoomRef.current + (event.deltaY < 0 ? .11 : -.11)),
      )
      onZoomChangeRef.current(next)
    }

    renderer.domElement.addEventListener('pointermove', handlePointerMove)
    renderer.domElement.addEventListener('pointerdown', handlePointerDown)
    renderer.domElement.addEventListener('pointerup', handlePointerUp)
    renderer.domElement.addEventListener('pointercancel', handlePointerLeave)
    renderer.domElement.addEventListener('pointerleave', handlePointerLeave)
    renderer.domElement.addEventListener('wheel', handleWheel, {passive: false})

    const cameraTarget = new THREE.Vector3()
    const lookTarget = new THREE.Vector3(0, 0, 0)
    const tempVector = new THREE.Vector3()
    const control = new THREE.Vector3()
    const curvePoint = new THREE.Vector3()

    let animationFrame = 0
    const startedAt = performance.now()

    function animate(now: number) {
      animationFrame = requestAnimationFrame(animate)
      const elapsed = (now - startedAt) / 1000

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

      for (const node of nodeRef.current) {
        const visual = nodeVisuals.get(node._id)
        if (!visual) continue

        const target = worldPosition(node, positionsRef.current)
        target.z = visual.z + Math.sin(elapsed * .21 + visual.phase) * .22
        target.y += Math.sin(elapsed * .37 + visual.phase) * .08
        target.x += Math.cos(elapsed * .29 + visual.phase) * .05

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

        const scaleBoost = selected ? 1.32 : hoveredId === node._id ? 1.14 : 1
        const desiredScale = visual.baseScale * scaleBoost
        visual.group.scale.lerp(
          new THREE.Vector3(desiredScale, desiredScale, desiredScale),
          selected ? .13 : .08,
        )

        visual.group.rotation.y += selected ? .007 : .0022
        visual.group.rotation.x =
          Math.sin(elapsed * .22 + visual.phase) * .045

        const shellMaterial = visual.shellMaterial
        const glowMaterial = visual.glow.material as THREE.MeshBasicMaterial
        const coreMaterial = visual.core.material as THREE.MeshStandardMaterial
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
          ((visible ? 0.94 : 0.18) - shellMaterial.uniforms.uOpacity.value) *
          0.08
        visual.miniWorld.update(
          elapsed,
          selected ? 1 : hoveredId === node._id ? 0.55 : 0,
        )
        if (!selected) {
          visual.miniWorld.group.visible = true
          visual.core.visible = true
        }
        glowMaterial.opacity +=
          ((selected ? .32 : hoveredId === node._id ? .22 : visible ? .1 : .015) -
            glowMaterial.opacity) *
          .08
        coreMaterial.emissiveIntensity +=
          ((selected ? 5.4 : hoveredId === node._id ? 4 : 2.2) -
            coreMaterial.emissiveIntensity) *
          .07
        orbitMaterial.opacity +=
          ((selected ? .68 : hoveredId === node._id ? .42 : .13) -
            orbitMaterial.opacity) *
          .08
        labelMaterial.opacity += ((visible ? .88 : .15) - labelMaterial.opacity) * .08

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
        const desiredOpacity = edgeHighlighted
          ? Math.min(.62, .14 + edgeVisual.weight * .095)
          : .035
        edgeVisual.material.opacity +=
          (desiredOpacity - edgeVisual.material.opacity) * .08

        const pulseT =
          (elapsed * (.07 + Math.min(edgeVisual.weight, 4) * .016) +
            edgeVisual.phase) %
          1
        const oneMinus = 1 - pulseT
        edgeVisual.pulse.position
          .copy(source)
          .multiplyScalar(oneMinus * oneMinus)
          .addScaledVector(control, 2 * oneMinus * pulseT)
          .addScaledVector(target, pulseT * pulseT)
        ;(edgeVisual.pulse.material as THREE.MeshBasicMaterial).opacity =
          edgeHighlighted ? .58 : .08
      })

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
        depthOfField.uniforms.focus.value +=
          (focusDistance - depthOfField.uniforms.focus.value) * 0.08
        depthOfField.uniforms.aperture.value +=
          (0.000065 - depthOfField.uniforms.aperture.value) * 0.05
        depthOfField.uniforms.maxblur.value +=
          (settings.maxBlur - depthOfField.uniforms.maxblur.value) * 0.05
      }

      bloom.strength +=
        ((selectedVisual
          ? settings.bloomStrength * 1.28
          : settings.bloomStrength) -
          bloom.strength) *
        0.035

      if (scene.fog instanceof THREE.FogExp2) {
        scene.fog.density +=
          ((selectedVisual
            ? settings.fogDensity * 1.18
            : settings.fogDensity) -
            scene.fog.density) *
          0.025
      }

      violetLight.intensity +=
        ((selectedVisual ? 24 : 18) - violetLight.intensity) * 0.025
      cyanLight.intensity +=
        ((selectedVisual ? 22 : 16) - cyanLight.intensity) * 0.025

      if (selectedVisual) {
        const position = selectedVisual.group.position
        const side = position.x > 0 ? -1 : 1
        cameraTarget.set(
          position.x + side * 2.8,
          position.y + .2,
          position.z + 5.7 / Math.max(.9, zoomRef.current),
        )
        lookTarget.lerp(position, .085)
      } else {
        cameraTarget.set(
          panRef.current.x / 125,
          -panRef.current.y / 125,
          10.8 / Math.max(.68, zoomRef.current),
        )
        lookTarget.lerp(
          tempVector.set(
            panRef.current.x / 180,
            -panRef.current.y / 180,
            0,
          ),
          .06,
        )
      }

      camera.position.lerp(cameraTarget, selectedVisual ? .075 : .055)
      camera.lookAt(lookTarget)

      if (selectedVisual) {
        const projected = selectedVisual.group.position.clone().project(camera)
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
      } else if (lastProjection.visible) {
        lastProjection = {x: -999, y: -999, visible: false}
        onProjectionChangeRef.current(null)
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

      releaseDreamCell()
      camera.remove(listener)

      nodeVisuals.forEach((visual) => {
        ;(visual.shell.geometry as THREE.BufferGeometry).dispose()
        ;(visual.glow.geometry as THREE.BufferGeometry).dispose()
        ;(visual.core.geometry as THREE.BufferGeometry).dispose()
        ;(visual.orbit.geometry as THREE.BufferGeometry).dispose()
        visual.shellMaterial.dispose()
        visual.miniWorld.dispose()
        ;(visual.glow.material as THREE.Material).dispose()
        ;(visual.core.material as THREE.Material).dispose()
        ;(visual.orbit.material as THREE.Material).dispose()
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

      fragments.forEach((fragment) => {
        ;(fragment.geometry as THREE.BufferGeometry).dispose()
      })
      fragmentMaterial.dispose()

      nebulae.forEach((sprite) => {
        const material = sprite.material as THREE.SpriteMaterial
        material.map?.dispose()
        material.dispose()
      })

      starGeometry.dispose()
      starMaterial.dispose()
      composer.dispose()
      renderer.dispose()
      host.removeChild(renderer.domElement)
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
