'use client'

import {useEffect, useRef} from 'react'
import * as THREE from 'three'
import type {SurfEdge, SurfNode, SurfNodeKind} from './types'
import styles from './surf.module.css'

type Props = {
  nodes: SurfNode[]
  edges: SurfEdge[]
  selectedId: string | null
  onInspect: (node: SurfNode) => void
  onTravel: (node: SurfNode) => void
  onHover: (node: SurfNode | null) => void
  onPointerLockChange: (locked: boolean) => void
}

type Visual = {
  group: THREE.Group
  body: THREE.Mesh
  material: THREE.MeshPhysicalMaterial
  label: THREE.Sprite
  labelMaterial: THREE.SpriteMaterial
  baseScale: number
  phase: number
}

const KIND_GEOMETRY: Record<SurfNodeKind, () => THREE.BufferGeometry> = {
  home: () => new THREE.IcosahedronGeometry(.78, 2),
  profile: () => new THREE.BoxGeometry(1.5, .92, .16, 2, 2, 1),
  article: () => new THREE.BoxGeometry(1.35, .78, .12, 1, 1, 1),
  tag: () => new THREE.TorusGeometry(.52, .12, 12, 48),
  search: () => new THREE.OctahedronGeometry(.62, 1),
}

function createLabelTexture(node: SurfNode) {
  const canvas = document.createElement('canvas')
  canvas.width = 1024
  canvas.height = 256
  const context = canvas.getContext('2d')

  if (context) {
    context.clearRect(0, 0, canvas.width, canvas.height)
    const accent = node.accent

    const gradient = context.createLinearGradient(60, 0, 960, 0)
    gradient.addColorStop(0, 'rgba(3,7,13,0)')
    gradient.addColorStop(.14, 'rgba(3,7,13,.78)')
    gradient.addColorStop(.86, 'rgba(3,7,13,.78)')
    gradient.addColorStop(1, 'rgba(3,7,13,0)')
    context.fillStyle = gradient
    context.fillRect(0, 30, canvas.width, 194)

    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.shadowColor = accent
    context.shadowBlur = 16
    context.fillStyle = '#f1f7fb'
    context.font = '600 36px system-ui, sans-serif'

    const title =
      node.title.length > 42 ? `${node.title.slice(0, 41)}…` : node.title
    context.fillText(title, canvas.width / 2, 104)

    context.shadowBlur = 0
    context.fillStyle = accent
    context.font = '500 19px system-ui, sans-serif'
    const subtitle =
      node.subtitle.length > 62
        ? `${node.subtitle.slice(0, 61)}…`
        : node.subtitle
    context.fillText(subtitle, canvas.width / 2, 154)
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.minFilter = THREE.LinearFilter
  return texture
}

function buildCurve(a: THREE.Vector3, b: THREE.Vector3, weight: number) {
  const mid = a.clone().lerp(b, .5)
  mid.y += .35 + Math.min(2, weight) * .18
  mid.z += Math.sin((a.x + b.x) * .21) * .28
  return new THREE.QuadraticBezierCurve3(a, mid, b)
}

export default function DevWebSurf3D({
  nodes,
  edges,
  selectedId,
  onInspect,
  onTravel,
  onHover,
  onPointerLockChange,
}: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const selectedRef = useRef(selectedId)
  const inspectRef = useRef(onInspect)
  const travelRef = useRef(onTravel)
  const hoverRef = useRef(onHover)
  const lockRef = useRef(onPointerLockChange)

  selectedRef.current = selectedId
  inspectRef.current = onInspect
  travelRef.current = onTravel
  hoverRef.current = onHover
  lockRef.current = onPointerLockChange

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const container = host

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x020407)
    scene.fog = new THREE.FogExp2(0x02070b, .025)

    const camera = new THREE.PerspectiveCamera(72, 1, .05, 120)
    camera.position.set(0, 1.7, 9)

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
    })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5))
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.05
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.domElement.className = styles.canvas
    renderer.domElement.tabIndex = 0
    container.appendChild(renderer.domElement)

    scene.add(new THREE.HemisphereLight(0x91d9e8, 0x070812, 1.7))

    const key = new THREE.DirectionalLight(0x9de8ff, 3.2)
    key.position.set(-5, 8, 6)
    scene.add(key)

    const magenta = new THREE.PointLight(0xa56bff, 8, 28, 2)
    magenta.position.set(8, 2, -12)
    scene.add(magenta)

    const cyan = new THREE.PointLight(0x48e0d0, 9, 32, 2)
    cyan.position.set(-8, 1, -10)
    scene.add(cyan)

    // Browser-backbone floor: a giant circuit-board plane rather than space.
    const grid = new THREE.GridHelper(70, 70, 0x236771, 0x102a31)
    grid.position.y = -2.6
    ;(grid.material as THREE.Material).transparent = true
    ;(grid.material as THREE.Material).opacity = .22
    scene.add(grid)

    const laneMaterial = new THREE.LineBasicMaterial({
      color: 0x3b8b91,
      transparent: true,
      opacity: .13,
      blending: THREE.AdditiveBlending,
    })
    const laneGeometries: THREE.BufferGeometry[] = []
    for (let index = 0; index < 18; index += 1) {
      const z = -index * 3.5 + 8
      const points = [
        new THREE.Vector3(-30, -2.5, z),
        new THREE.Vector3(-12 + (index % 4) * 5, -2.5, z),
        new THREE.Vector3(-12 + (index % 4) * 5, -2.5, z - 2.2),
        new THREE.Vector3(30, -2.5, z - 2.2),
      ]
      const geometry = new THREE.BufferGeometry().setFromPoints(points)
      laneGeometries.push(geometry)
      scene.add(new THREE.Line(geometry, laneMaterial))
    }

    // Vertical translucent browser layers sell the feeling of being inside a
    // rendered web stack rather than floating in outer space.
    const layerGeometry = new THREE.PlaneGeometry(28, 12)
    const layerMaterials: THREE.MeshBasicMaterial[] = []
    const browserLayers: THREE.Mesh[] = []
    for (let index = 0; index < 5; index += 1) {
      const material = new THREE.MeshBasicMaterial({
        color: index % 2 ? 0x24366f : 0x164b54,
        transparent: true,
        opacity: .018,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
      const layer = new THREE.Mesh(layerGeometry, material)
      layer.position.set((index - 2) * 7, 2, -16 - index * 8)
      layer.rotation.y = (index - 2) * .08
      scene.add(layer)
      layerMaterials.push(material)
      browserLayers.push(layer)
    }

    const visuals = new Map<string, Visual>()
    const interactive: THREE.Object3D[] = []
    const disposableTextures: THREE.Texture[] = []

    nodes.forEach((node, index) => {
      const group = new THREE.Group()
      group.position.set(...node.position)
      scene.add(group)

      const color = new THREE.Color(node.accent)
      const material = new THREE.MeshPhysicalMaterial({
        color: color.clone().multiplyScalar(.42),
        emissive: color.clone(),
        emissiveIntensity: .62 + node.importance * .65,
        roughness: node.kind === 'article' ? .3 : .2,
        metalness: node.kind === 'profile' ? .36 : .16,
        clearcoat: .85,
        clearcoatRoughness: .1,
        transmission: node.kind === 'tag' ? .25 : .06,
        transparent: true,
        opacity: .88,
      })

      const body = new THREE.Mesh(KIND_GEOMETRY[node.kind](), material)
      body.userData.nodeId = node.id
      body.renderOrder = 2
      interactive.push(body)
      group.add(body)

      if (node.kind === 'profile' || node.kind === 'article') {
        const screenGeometry = new THREE.PlaneGeometry(
          node.kind === 'profile' ? 1.26 : 1.12,
          node.kind === 'profile' ? .68 : .58,
        )
        const screenMaterial = new THREE.MeshBasicMaterial({
          color: 0x05080d,
          transparent: true,
          opacity: .82,
          side: THREE.DoubleSide,
        })
        const screen = new THREE.Mesh(screenGeometry, screenMaterial)
        screen.position.z = .085
        group.add(screen)
      }

      const labelTexture = createLabelTexture(node)
      disposableTextures.push(labelTexture)
      const labelMaterial = new THREE.SpriteMaterial({
        map: labelTexture,
        transparent: true,
        opacity: node.kind === 'home' ? .88 : .42,
        depthWrite: false,
        toneMapped: false,
      })
      const label = new THREE.Sprite(labelMaterial)
      label.position.set(0, node.kind === 'tag' ? 1.05 : 1.15, 0)
      label.scale.set(node.kind === 'article' ? 3.8 : 4.4, 1.1, 1)
      group.add(label)

      const baseScale =
        node.kind === 'home'
          ? 1.35
          : node.kind === 'profile'
            ? 1.1
            : .82 + Math.min(.42, node.importance * .16)
      group.scale.setScalar(baseScale)

      visuals.set(node.id, {
        group,
        body,
        material,
        label,
        labelMaterial,
        baseScale,
        phase: index * .73,
      })
    })

    const edgeVisuals = edges
      .map((edge, index) => {
        const source = visuals.get(edge.source)
        const target = visuals.get(edge.target)
        if (!source || !target) return null

        const curve = buildCurve(
          source.group.position,
          target.group.position,
          edge.weight,
        )
        const geometry = new THREE.BufferGeometry().setFromPoints(
          curve.getPoints(28),
        )
        const material = new THREE.LineBasicMaterial({
          color:
            edge.kind === 'author'
              ? 0x8f72ff
              : edge.kind === 'tag'
                ? 0x52d6b7
                : edge.kind === 'search'
                  ? 0xf7c96c
                  : 0x427d91,
          transparent: true,
          opacity: .13 + Math.min(.18, edge.weight * .03),
          blending: THREE.AdditiveBlending,
        })
        const line = new THREE.Line(geometry, material)
        scene.add(line)

        const packetGeometry = new THREE.SphereGeometry(.025, 8, 8)
        const packetMaterial = new THREE.MeshBasicMaterial({
          color: material.color,
          transparent: true,
          opacity: .54,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
        const packet = new THREE.Mesh(packetGeometry, packetMaterial)
        scene.add(packet)

        return {
          edge,
          curve,
          geometry,
          material,
          packet,
          packetGeometry,
          packetMaterial,
          phase: index * .117,
        }
      })
      .filter((value): value is NonNullable<typeof value> => value !== null)

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
    let lastTime = performance.now()
    let frame = 0

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
        .add(new THREE.Vector3(0, .05, 2.25))
      const control = source.clone().lerp(destination, .5)
      control.y += 1.25
      control.x += Math.sin(destination.z * .23) * .8

      travel = {
        source,
        control,
        target: destination,
        node,
        startedAt: performance.now() / 1000,
        duration: THREE.MathUtils.clamp(
          source.distanceTo(destination) / 6,
          .8,
          2.6,
        ),
      }
    }

    function onMouseMove(event: MouseEvent) {
      if (document.pointerLockElement !== renderer.domElement || travel) return
      yaw -= event.movementX * .0017
      pitch -= event.movementY * .00145
      pitch = THREE.MathUtils.clamp(
        pitch,
        -Math.PI * .46,
        Math.PI * .46,
      )
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
      const delta = Math.min(.05, Math.max(.001, (nowMs - lastTime) / 1000))
      lastTime = nowMs

      browserLayers.forEach((layer, index) => {
        layer.position.y = 2 + Math.sin(now * .12 + index) * .16
        layer.rotation.y += .00008 * (index % 2 ? 1 : -1)
      })

      edgeVisuals.forEach((edgeVisual) => {
        const t = (now * (.08 + edgeVisual.edge.weight * .006) + edgeVisual.phase) % 1
        edgeVisual.packet.position.copy(edgeVisual.curve.getPoint(t))
        edgeVisual.packetMaterial.opacity =
          .28 + Math.sin(t * Math.PI) * .45
      })

      const aimed = pickCenter()
      const aimedId = aimed?.id ?? null
      if (aimedId !== hoverId) {
        hoverId = aimedId
        hoverRef.current(aimed ?? null)
      }

      visuals.forEach((visual, id) => {
        const selected = selectedRef.current === id
        const hovered = hoverId === id
        const targetScale =
          visual.baseScale * (selected ? 1.16 : hovered ? 1.08 : 1)
        visual.group.scale.lerp(
          new THREE.Vector3(targetScale, targetScale, targetScale),
          .08,
        )
        visual.group.rotation.y += .0005
        visual.group.position.y +=
          Math.sin(now * .22 + visual.phase) * .0005

        visual.material.emissiveIntensity +=
          ((selected ? 1.7 : hovered ? 1.2 : .62) -
            visual.material.emissiveIntensity) *
          .08
        visual.labelMaterial.opacity +=
          ((selected || hovered ? .96 : id === 'dev-home' ? .86 : .4) -
            visual.labelMaterial.opacity) *
          .1
      })

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
          .addScaledVector(travel.control, 2 * oneMinus * eased)
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
          .addScaledVector(travel.target, lookProgress * lookProgress)

        position.copy(point)
        camera.position.copy(point)
        camera.lookAt(look)
        camera.fov +=
          ((72 + Math.sin(progress * Math.PI) * 10) - camera.fov) *
          .12
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
          Math.sin(pitch),
          -Math.cos(yaw) * Math.cos(pitch),
        ).normalize()
        right.crossVectors(forward, up).normalize()
        move.set(0, 0, 0)

        if (keys.has('KeyW')) move.add(forward)
        if (keys.has('KeyS')) move.sub(forward)
        if (keys.has('KeyD')) move.add(right)
        if (keys.has('KeyA')) move.sub(right)
        if (keys.has('Space')) move.add(up)
        if (keys.has('KeyQ') || keys.has('ControlLeft')) move.sub(up)
        if (move.lengthSq() > 0) move.normalize()

        const speed =
          keys.has('ShiftLeft') || keys.has('ShiftRight') ? 10 : 4.4
        const desired = move.multiplyScalar(speed)
        velocity.lerp(desired, 1 - Math.exp(-delta * 7))
        position.addScaledVector(velocity, delta)

        const radius = position.length()
        if (radius > 48) position.multiplyScalar(48 / radius)
        position.y = THREE.MathUtils.clamp(position.y, -1.6, 14)

        camera.position.copy(position)
        camera.rotation.order = 'YXZ'
        camera.rotation.y = yaw
        camera.rotation.x = pitch
        camera.rotation.z = THREE.MathUtils.lerp(
          camera.rotation.z,
          -velocity.dot(right) * .006,
          .08,
        )

        const speedRatio = Math.min(1, velocity.length() / 10)
        camera.fov += ((72 + speedRatio * 7) - camera.fov) * .05
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

      edgeVisuals.forEach((edgeVisual) => {
        edgeVisual.geometry.dispose()
        edgeVisual.material.dispose()
        edgeVisual.packetGeometry.dispose()
        edgeVisual.packetMaterial.dispose()
      })

      laneGeometries.forEach((geometry) => geometry.dispose())
      laneMaterial.dispose()
      layerGeometry.dispose()
      layerMaterials.forEach((material) => material.dispose())
      renderer.dispose()
      container.removeChild(renderer.domElement)
    }
  }, [edges, nodes])

  return <div ref={hostRef} className={styles.world} />
}
