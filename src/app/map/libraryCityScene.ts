import * as THREE from 'three'
import type {LibraryDistrictConfig} from '@/lib/libraryWorldConfig'
import {
  CITY_ARRIVAL,
  CITY_EMPTY_BLOCKS,
  CITY_GROUND_Y,
  CITY_ROADS,
  cityDistrictBlock,
} from './libraryCityLayout'

export type LibraryCityScene = {
  geometries: THREE.BufferGeometry[]
  materials: THREE.Material[]
  objects: THREE.Object3D[]
  dispose: () => void
}

function addRoadRibbon(
  segment: (typeof CITY_ROADS)[number],
  positions: number[],
  indices: number[],
  edgePositions: number[],
  colors: number[],
) {
  const [sx, sy, sz] = segment.start
  const [ex, ey, ez] = segment.end
  const dx = ex - sx
  const dz = ez - sz
  const length = Math.hypot(dx, dz) || 1
  const nx = -dz / length
  const nz = dx / length
  const halfWidth = segment.halfWidth
  const base = positions.length / 3

  positions.push(
    sx + nx * halfWidth,
    sy + CITY_GROUND_Y,
    sz + nz * halfWidth,
    sx - nx * halfWidth,
    sy + CITY_GROUND_Y,
    sz - nz * halfWidth,
    ex + nx * halfWidth,
    ey + CITY_GROUND_Y,
    ez + nz * halfWidth,
    ex - nx * halfWidth,
    ey + CITY_GROUND_Y,
    ez - nz * halfWidth,
  )
  indices.push(
    base,
    base + 1,
    base + 2,
    base + 1,
    base + 3,
    base + 2,
  )

  const color =
    segment.kind === 'avenue'
      ? new THREE.Color(0x4fc8d8)
      : segment.kind === 'street'
        ? new THREE.Color(0x8373d5)
        : new THREE.Color(0x4e8ea3)

  for (let i = 0; i < 4; i += 1) {
    colors.push(color.r, color.g, color.b)
  }

  edgePositions.push(
    sx + nx * halfWidth,
    sy + CITY_GROUND_Y + .024,
    sz + nz * halfWidth,
    ex + nx * halfWidth,
    ey + CITY_GROUND_Y + .024,
    ez + nz * halfWidth,
    sx - nx * halfWidth,
    sy + CITY_GROUND_Y + .024,
    sz - nz * halfWidth,
    ex - nx * halfWidth,
    ey + CITY_GROUND_Y + .024,
    ez - nz * halfWidth,
  )
}

export function createLibraryCityScene(
  world: THREE.Group,
  districts: LibraryDistrictConfig[],
): LibraryCityScene {
  const geometries: THREE.BufferGeometry[] = []
  const materials: THREE.Material[] = []
  const objects: THREE.Object3D[] = []

  const roadPositions: number[] = []
  const roadIndices: number[] = []
  const roadColors: number[] = []
  const roadEdgePositions: number[] = []

  CITY_ROADS.forEach((segment) => {
    addRoadRibbon(
      segment,
      roadPositions,
      roadIndices,
      roadEdgePositions,
      roadColors,
    )
  })

  const roadGeometry = new THREE.BufferGeometry()
  roadGeometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(
      roadPositions,
      3,
    ),
  )
  roadGeometry.setAttribute(
    'color',
    new THREE.Float32BufferAttribute(
      roadColors,
      3,
    ),
  )
  roadGeometry.setIndex(roadIndices)
  roadGeometry.computeVertexNormals()
  geometries.push(roadGeometry)

  const roadMaterial = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    vertexColors: true,
    transparent: true,
    opacity: .16,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.NormalBlending,
    toneMapped: true,
  })
  materials.push(roadMaterial)

  const roads = new THREE.Mesh(
    roadGeometry,
    roadMaterial,
  )
  roads.renderOrder = 1
  roads.userData.libraryDecorative = true
  roads.userData.walkableSurface = true
  world.add(roads)
  objects.push(roads)

  const edgeGeometry = new THREE.BufferGeometry()
  edgeGeometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(
      roadEdgePositions,
      3,
    ),
  )
  geometries.push(edgeGeometry)

  const edgeMaterial = new THREE.LineBasicMaterial({
    color: 0x74e8ef,
    transparent: true,
    opacity: .46,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  })
  materials.push(edgeMaterial)

  const roadEdges = new THREE.LineSegments(
    edgeGeometry,
    edgeMaterial,
  )
  roadEdges.renderOrder = 2
  roadEdges.userData.libraryDecorative = true
  world.add(roadEdges)
  objects.push(roadEdges)

  const platformBaseMaterial = new THREE.MeshBasicMaterial({
    color: 0x0b1720,
    transparent: true,
    opacity: .7,
    depthWrite: true,
    toneMapped: true,
  })
  materials.push(platformBaseMaterial)

  const outlineMaterial = new THREE.LineBasicMaterial({
    color: 0x657fd2,
    transparent: true,
    opacity: .38,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  })
  materials.push(outlineMaterial)

  const addPlatform = (
    id: string,
    x: number,
    z: number,
    width: number,
    depth: number,
    elevation: number,
    accent?: string,
  ) => {
    const geometry = new THREE.BoxGeometry(
      width,
      .24,
      depth,
    )
    geometries.push(geometry)

    const material = accent
      ? new THREE.MeshBasicMaterial({
          color: new THREE.Color(accent).multiplyScalar(.24),
          transparent: true,
          opacity: .68,
          depthWrite: true,
          toneMapped: true,
        })
      : platformBaseMaterial
    if (accent) materials.push(material)

    const platform = new THREE.Mesh(
      geometry,
      material,
    )
    platform.position.set(
      x,
      CITY_GROUND_Y + elevation - .12,
      z,
    )
    platform.renderOrder = 0
    platform.userData.libraryDecorative = true
    world.add(platform)
    objects.push(platform)

    const edge = new THREE.LineSegments(
      new THREE.EdgesGeometry(geometry),
      outlineMaterial,
    )
    geometries.push(
      edge.geometry as THREE.BufferGeometry,
    )
    edge.position.copy(platform.position)
    edge.position.y += .13
    edge.renderOrder = 2
    edge.userData.libraryDecorative = true
    world.add(edge)
    objects.push(edge)
  }

  addPlatform(
    'arrival',
    CITY_ARRIVAL.x,
    CITY_ARRIVAL.z,
    CITY_ARRIVAL.width,
    CITY_ARRIVAL.depth,
    CITY_ARRIVAL.elevation,
    '#67dce6',
  )

  districts.forEach((district, index) => {
    const block = cityDistrictBlock(
      district.id,
      index,
    )
    addPlatform(
      district.id,
      block.x,
      block.z,
      block.width,
      block.depth,
      block.elevation,
      district.accent,
    )
  })

  CITY_EMPTY_BLOCKS.forEach((block) => {
    const geometry = new THREE.BoxGeometry(
      block.width,
      block.height,
      block.depth,
    )
    geometries.push(geometry)
    const material = new THREE.MeshBasicMaterial({
      color: 0x071017,
      transparent: true,
      opacity: .9,
      depthWrite: true,
      toneMapped: true,
    })
    materials.push(material)

    const mesh = new THREE.Mesh(
      geometry,
      material,
    )
    mesh.position.set(
      block.x,
      CITY_GROUND_Y + block.height * .5,
      block.z,
    )
    mesh.userData.libraryDecorative = true
    world.add(mesh)
    objects.push(mesh)

    const edgeGeometry = new THREE.EdgesGeometry(
      geometry,
    )
    geometries.push(edgeGeometry)
    const edge = new THREE.LineSegments(
      edgeGeometry,
      outlineMaterial,
    )
    edge.position.copy(mesh.position)
    edge.material.opacity = .18
    edge.userData.libraryDecorative = true
    world.add(edge)
    objects.push(edge)
  })

  const junctionGeometry = new THREE.RingGeometry(
    .34,
    .48,
    24,
  )
  geometries.push(junctionGeometry)
  const junctionMaterial = new THREE.MeshBasicMaterial({
    color: 0x9f86ed,
    transparent: true,
    opacity: .4,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  })
  materials.push(junctionMaterial)

  const junctionKeys = new Set<string>()
  CITY_ROADS.forEach((road) => {
    ;[road.start, road.end].forEach(
      ([x, y, z]) => {
        const key =
          Math.round(x * 10) +
          ':' +
          Math.round(z * 10)
        if (junctionKeys.has(key)) return
        junctionKeys.add(key)

        const ring = new THREE.Mesh(
          junctionGeometry,
          junctionMaterial,
        )
        ring.position.set(
          x,
          y + CITY_GROUND_Y + .04,
          z,
        )
        ring.rotation.x = -Math.PI / 2
        ring.renderOrder = 3
        ring.userData.libraryDecorative = true
        world.add(ring)
        objects.push(ring)
      },
    )
  })

  return {
    geometries,
    materials,
    objects,
    dispose() {
      objects.forEach((object) => {
        world.remove(object)
      })
      geometries.forEach((geometry) => {
        geometry.dispose()
      })
      materials.forEach((material) => {
        material.dispose()
      })
    },
  }
}
