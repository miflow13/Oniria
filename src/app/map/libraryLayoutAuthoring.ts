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
    .035,
    .035,
    .72,
    8,
  )
  const headGeometry = new THREE.ConeGeometry(
    .15,
    .32,
    10,
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
    opacity: .95,
    toneMapped: false,
  })
  const headMaterial = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: .98,
    toneMapped: false,
  })
  const zoneMaterial = new THREE.MeshBasicMaterial({
    color: 0x379cff,
    transparent: true,
    opacity: .2,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
  })
  materials.push(stemMaterial, headMaterial, zoneMaterial)

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
    visual.position.set(marker.x, .035, marker.z)
    visual.rotation.y = marker.yaw

    const zone = new THREE.Mesh(zoneGeometry, zoneMaterial)
    zone.scale.set(marker.width, 1, marker.depth)
    zone.position.y = .015
    zone.renderOrder = 30
    visual.add(zone)

    const stem = new THREE.Mesh(stemGeometry, stemMaterial)
    stem.position.y = .42
    stem.renderOrder = 31
    visual.add(stem)

    const head = new THREE.Mesh(headGeometry, headMaterial)
    head.rotation.x = Math.PI
    head.position.y = .92
    head.renderOrder = 31
    visual.add(head)

    const labelTexture = makeLabelTexture(
      marker.label,
      textures,
    )
    const labelMaterial = new THREE.SpriteMaterial({
      map: labelTexture,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
    })
    materials.push(labelMaterial)
    const label = new THREE.Sprite(labelMaterial)
    label.position.set(0, 1.22, 0)
    label.scale.set(1.65, .46, 1)
    label.renderOrder = 32
    visual.add(label)

    group.add(visual)
    visualById.set(marker.id, visual)
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
    markers: () => [...markerById.values()],
    dispose: () => {
      scene.remove(group)
      visualById.clear()
      markerById.clear()
      geometries.forEach((geometry) => geometry.dispose())
      materials.forEach((material) => material.dispose())
      textures.forEach((texture) => texture.dispose())
    },
  }
}
