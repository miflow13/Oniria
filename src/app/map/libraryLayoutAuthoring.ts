import * as THREE from 'three'
import {
  LIBRARY_SHELF_DEPTH,
  LIBRARY_SHELF_WIDTH,
  type LibraryRoomSlot,
} from './libraryRoomLayout'

export type LibraryLayoutMarker = {
  id: string
  label: string
  roomSlot: LibraryRoomSlot
  districtId: string
  x: number
  y: number
  z: number
  yaw: number
  width: number
  depth: number
  createdAt: string
  persistence?: 'sanity' | 'local'
}

type DropMarkerInput = {
  roomSlot: LibraryRoomSlot
  districtId: string
  x: number
  z: number
  yaw: number
}

type LayoutAuthoring = {
  ready: Promise<void>
  dropMarker: (input: DropMarkerInput) => Promise<LibraryLayoutMarker>
  removeNearest: (
    x: number,
    z: number,
    maxDistance?: number,
  ) => Promise<LibraryLayoutMarker | null>
  clearAll: () => Promise<number>
  markers: () => readonly LibraryLayoutMarker[]
  dispose: () => void
}

const LOCAL_STORAGE_KEY = 'oniria.libraryLayoutMarkers.v1'

function normalizeYaw(yaw: number) {
  const step = Math.PI / 2
  let snapped = Math.round(yaw / step) * step
  while (snapped > Math.PI) snapped -= Math.PI * 2
  while (snapped <= -Math.PI) snapped += Math.PI * 2
  return snapped
}

function markerKey(marker: LibraryLayoutMarker) {
  return marker.id
}

function loadLocalMarkers(): LibraryLayoutMarker[] {
  try {
    const raw = window.localStorage.getItem(LOCAL_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed)
      ? parsed.filter(
          (entry): entry is LibraryLayoutMarker =>
            entry &&
            typeof entry.id === 'string' &&
            typeof entry.x === 'number' &&
            typeof entry.z === 'number' &&
            typeof entry.yaw === 'number',
        )
      : []
  } catch {
    return []
  }
}

function saveLocalMarkers(markers: readonly LibraryLayoutMarker[]) {
  try {
    window.localStorage.setItem(
      LOCAL_STORAGE_KEY,
      JSON.stringify(markers),
    )
  } catch {
    // Storage is best-effort; the Sanity path remains the primary authoring
    // workflow when configured.
  }
}

function makeLabelTexture(
  text: string,
  textures: THREE.Texture[],
) {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 72
  const context = canvas.getContext('2d')
  if (context) {
    context.fillStyle = 'rgba(5, 12, 22, .94)'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.strokeStyle = '#5edcff'
    context.lineWidth = 5
    context.strokeRect(3, 3, canvas.width - 6, canvas.height - 6)
    context.fillStyle = '#ffffff'
    context.font = '700 30px system-ui, sans-serif'
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.fillText(text, canvas.width / 2, canvas.height / 2)
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.needsUpdate = true
  textures.push(texture)
  return texture
}

export function createLibraryLayoutAuthoring(
  scene: THREE.Scene,
): LayoutAuthoring {
  const group = new THREE.Group()
  group.name = 'library-layout-authoring-pins'
  scene.add(group)

  const geometries: THREE.BufferGeometry[] = []
  const materials: THREE.Material[] = []
  const textures: THREE.Texture[] = []
  const visualById = new Map<string, THREE.Group>()
  const markerById = new Map<string, LibraryLayoutMarker>()

  const stemGeometry = new THREE.CylinderGeometry(
    .055,
    .055,
    1.05,
    10,
  )
  const headGeometry = new THREE.ConeGeometry(
    .22,
    .42,
    12,
  )
  const zoneGeometry = new THREE.BoxGeometry(
    1,
    .018,
    1,
  )
  geometries.push(stemGeometry, headGeometry, zoneGeometry)

  const stemMaterial = new THREE.MeshBasicMaterial({
    color: 0x5edcff,
    transparent: true,
    opacity: 1,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  })
  const headMaterial = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 1,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  })
  const zoneMaterial = new THREE.MeshBasicMaterial({
    color: 0x2fb7ff,
    transparent: true,
    opacity: .34,
    depthWrite: false,
    depthTest: false,
    side: THREE.DoubleSide,
    toneMapped: false,
  })
  materials.push(stemMaterial, headMaterial, zoneMaterial)

  const zoneEdgesGeometry = new THREE.EdgesGeometry(zoneGeometry)
  const zoneEdgesMaterial = new THREE.LineBasicMaterial({
    color: 0x8ce8ff,
    transparent: true,
    opacity: 1,
    depthTest: false,
    toneMapped: false,
  })
  geometries.push(zoneEdgesGeometry)
  materials.push(zoneEdgesMaterial)

  const pulseGeometry = new THREE.RingGeometry(.16, .22, 32)
  const beamGeometry = new THREE.CylinderGeometry(
    .045,
    .045,
    3.8,
    10,
  )
  const ringGeometry = new THREE.TorusGeometry(
    .5,
    .035,
    8,
    32,
  )
  geometries.push(pulseGeometry, beamGeometry, ringGeometry)

  const beamMaterial = new THREE.MeshBasicMaterial({
    color: 0x39d8ff,
    transparent: true,
    opacity: .62,
    depthTest: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  })
  const ringMaterial = new THREE.MeshBasicMaterial({
    color: 0xc5f7ff,
    transparent: true,
    opacity: .96,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  })
  materials.push(beamMaterial, ringMaterial)

  const toast = document.createElement('div')
  toast.setAttribute('data-oniria-layout-toast', 'true')
  Object.assign(toast.style, {
    position: 'fixed',
    left: '50%',
    bottom: '92px',
    transform: 'translateX(-50%) translateY(12px)',
    padding: '10px 16px',
    border: '1px solid rgba(94,220,255,.9)',
    borderRadius: '999px',
    background: 'rgba(4,10,18,.94)',
    color: '#fff',
    font: '700 13px/1.2 system-ui, sans-serif',
    letterSpacing: '.08em',
    textTransform: 'uppercase',
    pointerEvents: 'none',
    zIndex: '99999',
    opacity: '0',
    transition: 'opacity 120ms ease, transform 120ms ease',
    boxShadow: '0 0 24px rgba(47,183,255,.35)',
  })
  document.body.appendChild(toast)

  let toastTimer: number | null = null
  const showToast = (
    message: string,
    tone: 'ok' | 'warn' = 'ok',
  ) => {
    toast.textContent = message
    toast.style.borderColor =
      tone === 'ok'
        ? 'rgba(94,220,255,.95)'
        : 'rgba(255,190,90,.95)'
    toast.style.boxShadow =
      tone === 'ok'
        ? '0 0 28px rgba(47,183,255,.42)'
        : '0 0 28px rgba(255,170,70,.35)'
    toast.style.opacity = '1'
    toast.style.transform =
      'translateX(-50%) translateY(0)'
    if (toastTimer !== null) {
      window.clearTimeout(toastTimer)
    }
    toastTimer = window.setTimeout(() => {
      toast.style.opacity = '0'
      toast.style.transform =
        'translateX(-50%) translateY(12px)'
      toastTimer = null
    }, 1100)
  }

  const pulseMarker = (
    x: number,
    z: number,
  ) => {
    const material = new THREE.MeshBasicMaterial({
      color: 0x8ce8ff,
      transparent: true,
      opacity: .88,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    })
    const pulse = new THREE.Mesh(pulseGeometry, material)
    pulse.rotation.x = -Math.PI / 2
    pulse.position.set(x, .12, z)
    pulse.renderOrder = 40
    scene.add(pulse)

    const started = performance.now()
    const animatePulse = (now: number) => {
      const progress = Math.min(1, (now - started) / 720)
      const eased = 1 - Math.pow(1 - progress, 3)
      const scale = .6 + eased * 8
      pulse.scale.setScalar(scale)
      material.opacity = .88 * (1 - progress)
      if (progress < 1) {
        requestAnimationFrame(animatePulse)
        return
      }
      scene.remove(pulse)
      material.dispose()
    }
    requestAnimationFrame(animatePulse)
  }

  const removeVisual = (id: string) => {
    const visual = visualById.get(id)
    if (!visual) return
    group.remove(visual)
    visual.traverse((object) => {
      if (object instanceof THREE.Sprite) {
        object.material.dispose()
      }
    })
    visualById.delete(id)
  }

  const addVisual = (marker: LibraryLayoutMarker) => {
    removeVisual(marker.id)

    const visual = new THREE.Group()
    visual.name = `library-layout-marker-${marker.id}`
    visual.position.set(marker.x, .09, marker.z)
    visual.rotation.y = marker.yaw

    const zone = new THREE.Mesh(zoneGeometry, zoneMaterial)
    zone.scale.set(marker.width, 1, marker.depth)
    zone.position.y = .02
    zone.renderOrder = 30
    visual.add(zone)

    const zoneEdges = new THREE.LineSegments(
      zoneEdgesGeometry,
      zoneEdgesMaterial,
    )
    zoneEdges.scale.set(marker.width, 1, marker.depth)
    zoneEdges.position.y = .035
    zoneEdges.renderOrder = 31
    visual.add(zoneEdges)

    const stem = new THREE.Mesh(stemGeometry, stemMaterial)
    stem.position.y = .63
    stem.renderOrder = 32
    visual.add(stem)

    const head = new THREE.Mesh(headGeometry, headMaterial)
    head.rotation.x = Math.PI
    head.position.y = 1.28
    head.renderOrder = 32
    visual.add(head)

    const beam = new THREE.Mesh(
      beamGeometry,
      beamMaterial,
    )
    beam.position.y = 1.9
    beam.renderOrder = 98
    visual.add(beam)

    const ring = new THREE.Mesh(
      ringGeometry,
      ringMaterial,
    )
    ring.rotation.x = Math.PI / 2
    ring.position.y = 1.18
    ring.renderOrder = 99
    visual.add(ring)

    const labelTexture = makeLabelTexture(
      marker.label,
      textures,
    )
    const labelMaterial = new THREE.SpriteMaterial({
      map: labelTexture,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    })
    materials.push(labelMaterial)
    const label = new THREE.Sprite(labelMaterial)
    label.position.set(0, 1.72, 0)
    label.scale.set(2.35, .66, 1)
    label.renderOrder = 33
    visual.add(label)

    group.add(visual)
    visualById.set(marker.id, visual)
    window.dispatchEvent(
      new CustomEvent('oniria:layout-pin-rendered', {
        detail: {
          id: marker.id,
          label: marker.label,
          x: marker.x,
          z: marker.z,
          yaw: marker.yaw,
          visualCount: visualById.size,
        },
      }),
    )
  }

  const mergeMarkers = (
    incoming: readonly LibraryLayoutMarker[],
  ) => {
    incoming.forEach((marker) => {
      markerById.set(markerKey(marker), marker)
      addVisual(marker)
    })
  }

  const localMarkers = loadLocalMarkers()
  mergeMarkers(localMarkers)

  const searchParams =
    typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search)
      : null
  const authoringKey =
    searchParams?.get('layoutKey')?.trim() ?? ''

  const headers = () => ({
    'content-type': 'application/json',
    ...(authoringKey
      ? {'x-oniria-layout-key': authoringKey}
      : {}),
  })

  const ready = fetch('/api/library-layout-markers', {
    cache: 'no-store',
  })
    .then(async (response) => {
      if (!response.ok) return
      const payload = (await response.json()) as {
        markers?: LibraryLayoutMarker[]
      }
      if (Array.isArray(payload.markers)) {
        mergeMarkers(
          payload.markers.map((marker) => ({
            ...marker,
            persistence: 'sanity' as const,
          })),
        )
      }
    })
    .catch(() => undefined)

  const nextLabel = (roomSlot: LibraryRoomSlot) => {
    const count = [...markerById.values()].filter(
      (marker) => marker.roomSlot === roomSlot,
    ).length
    return `R${roomSlot}-P${String(count + 1).padStart(2, '0')}`
  }

  const dropMarker = async (
    input: DropMarkerInput,
  ): Promise<LibraryLayoutMarker> => {
    const marker: LibraryLayoutMarker = {
      id: `libraryLayoutMarker.local-${crypto.randomUUID()}`,
      label: nextLabel(input.roomSlot),
      roomSlot: input.roomSlot,
      districtId: input.districtId,
      x: Number(input.x.toFixed(3)),
      y: 0,
      z: Number(input.z.toFixed(3)),
      yaw: Number(normalizeYaw(input.yaw).toFixed(6)),
      width: LIBRARY_SHELF_WIDTH,
      depth: LIBRARY_SHELF_DEPTH,
      createdAt: new Date().toISOString(),
      persistence: 'local',
    }

    markerById.set(marker.id, marker)
    addVisual(marker)
    pulseMarker(marker.x, marker.z)
    showToast(`PIN ${marker.label} PLACED`)
    saveLocalMarkers(
      [...markerById.values()].filter(
        (entry) => entry.persistence !== 'sanity',
      ),
    )

    try {
      const response = await fetch(
        '/api/library-layout-markers',
        {
          method: 'POST',
          headers: headers(),
          body: JSON.stringify(marker),
        },
      )
      if (!response.ok) throw new Error('save failed')
      const payload = (await response.json()) as {
        marker?: LibraryLayoutMarker
      }
      if (payload.marker) {
        markerById.delete(marker.id)
        removeVisual(marker.id)
        const persisted = {
          ...payload.marker,
          persistence: 'sanity' as const,
        }
        markerById.set(persisted.id, persisted)
        addVisual(persisted)
        showToast(`PIN ${persisted.label} SAVED`)
        saveLocalMarkers(
          [...markerById.values()].filter(
            (entry) => entry.persistence !== 'sanity',
          ),
        )
        console.info('[DEV Library layout pin]', persisted)
        return persisted
      }
    } catch {
      console.info(
        '[DEV Library layout pin] saved locally only',
        marker,
      )
    }

    return marker
  }

  const clearAll = async () => {
    const markers = [...markerById.values()]
    markers.forEach((marker) => {
      markerById.delete(marker.id)
      removeVisual(marker.id)
    })
    saveLocalMarkers([])

    const persisted = markers.filter(
      (marker) =>
        marker.persistence === 'sanity' ||
        marker.id.startsWith('libraryLayoutMarker.'),
    )

    if (persisted.length > 0) {
      await Promise.allSettled(
        persisted.map((marker) =>
          fetch(
            `/api/library-layout-markers?id=${encodeURIComponent(marker.id)}`,
            {
              method: 'DELETE',
              headers: authoringKey
                ? {'x-oniria-layout-key': authoringKey}
                : undefined,
            },
          ),
        ),
      )
    }

    showToast(
      `CLEARED ${markers.length} PIN${markers.length === 1 ? '' : 'S'}`,
      'warn',
    )
    console.info(
      '[DEV Library layout] cleared all pins',
      markers.length,
    )
    return markers.length
  }

  const removeNearest = async (
    x: number,
    z: number,
    maxDistance = 2.5,
  ) => {
    let nearest: LibraryLayoutMarker | null = null
    let nearestDistance = maxDistance

    markerById.forEach((marker) => {
      const distance = Math.hypot(
        marker.x - x,
        marker.z - z,
      )
      if (distance < nearestDistance) {
        nearest = marker
        nearestDistance = distance
      }
    })

    if (!nearest) return null
    const selected = nearest as LibraryLayoutMarker
    markerById.delete(selected.id)
    removeVisual(selected.id)
    showToast(`PIN ${selected.label} REMOVED`, 'warn')
    saveLocalMarkers(
      [...markerById.values()].filter(
        (entry) => entry.persistence !== 'sanity',
      ),
    )

    if (
      selected.persistence === 'sanity' ||
      selected.id.startsWith('libraryLayoutMarker.')
    ) {
      try {
        await fetch(
          `/api/library-layout-markers?id=${encodeURIComponent(selected.id)}`,
          {
            method: 'DELETE',
            headers: authoringKey
              ? {'x-oniria-layout-key': authoringKey}
              : undefined,
          },
        )
      } catch {
        // The local visual still disappears. A failed remote deletion is
        // visible again on refresh, which makes persistence failure obvious.
      }
    }

    console.info('[DEV Library layout pin removed]', selected)
    return selected
  }

  return {
    ready,
    dropMarker,
    removeNearest,
    clearAll,
    markers: () => [...markerById.values()],
    dispose: () => {
      scene.remove(group)
      if (toastTimer !== null) {
        window.clearTimeout(toastTimer)
        toastTimer = null
      }
      toast.remove()
      visualById.clear()
      markerById.clear()
      geometries.forEach((geometry) => geometry.dispose())
      materials.forEach((material) => material.dispose())
      textures.forEach((texture) => texture.dispose())
    },
  }
}
