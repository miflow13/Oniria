import type {LibraryDistrictConfig} from '@/lib/libraryWorldConfig'

export const CITY_GROUND_Y = -2.08
export const CITY_ROAD_HALF_WIDTH = 1.72
export const CITY_INTERSECTION_HALF_WIDTH = 2.08

export type CityDistrictBlock = {
  id: string
  x: number
  z: number
  width: number
  depth: number
  elevation: number
  landmarkScale?: number
}

export type CityRoadSegment = {
  id: string
  start: [number, number, number]
  end: [number, number, number]
  halfWidth: number
  kind: 'avenue' | 'street' | 'alley'
}

export type CityEmptyBlock = {
  id: string
  x: number
  z: number
  width: number
  depth: number
  height: number
}

export type CityShelfPlacement = {
  world: [number, number, number]
  yaw: number
  pathBay: number
  districtId: string
}

export type CityWalkSurface = {
  centerX: number
  centerZ: number
  groundY: number
  halfWidth: number
  distance: number
  outsideDistance: number
  bay: number
  kind: 'road' | 'plaza'
}

const DISTRICT_BLOCKS: Record<string, CityDistrictBlock> = {
  'front-page': {
    id: 'front-page',
    x: -11.5,
    z: -3,
    width: 18,
    depth: 14,
    elevation: 0,
    landmarkScale: 1.15,
  },
  'web-dev': {
    id: 'web-dev',
    x: -18.5,
    z: -24,
    width: 16,
    depth: 13,
    elevation: .32,
    landmarkScale: 1.08,
  },
  ai: {
    id: 'ai',
    x: -1,
    z: -34,
    width: 15,
    depth: 13,
    elevation: .64,
    landmarkScale: 1.12,
  },
  linux: {
    id: 'linux',
    x: 14.5,
    z: -29,
    width: 14,
    depth: 13,
    elevation: .36,
    landmarkScale: 1.06,
  },
  javascript: {
    id: 'javascript',
    x: 21.5,
    z: -13.5,
    width: 13,
    depth: 12,
    elevation: .18,
    landmarkScale: 1.02,
  },
  community: {
    id: 'community',
    x: 10.5,
    z: -6,
    width: 14,
    depth: 13,
    elevation: .08,
    landmarkScale: 1.04,
  },
  'archive-2026': {
    id: 'archive-2026',
    x: 28,
    z: -30.5,
    width: 13,
    depth: 14,
    elevation: .52,
    landmarkScale: 1.08,
  },
  'deep-stacks': {
    id: 'deep-stacks',
    x: 28.5,
    z: -47,
    width: 15,
    depth: 15,
    elevation: .12,
    landmarkScale: 1.04,
  },
}

export const CITY_ARRIVAL = {
  x: 3.5,
  z: 9.5,
  width: 13,
  depth: 10,
  elevation: 0,
}

const FALLBACK_BLOCKS: Array<Omit<CityDistrictBlock, 'id'>> = [
  {x: -25, z: -40, width: 13, depth: 12, elevation: .2},
  {x: 12, z: -45, width: 13, depth: 12, elevation: .28},
  {x: -8, z: -50, width: 14, depth: 13, elevation: .12},
]

export const CITY_ROADS: CityRoadSegment[] = [
  // Arrival cross street / foyer.
  {
    id: 'arrival-west',
    start: [-26, 0, 9.5],
    end: [3.5, 0, 9.5],
    halfWidth: CITY_INTERSECTION_HALF_WIDTH,
    kind: 'street',
  },
  {
    id: 'arrival-east',
    start: [3.5, 0, 9.5],
    end: [18, 0, 9.5],
    halfWidth: CITY_INTERSECTION_HALF_WIDTH,
    kind: 'street',
  },

  // Three primary north/south avenues.
  {
    id: 'west-avenue',
    start: [-25, 0, 10],
    end: [-22, .18, -42],
    halfWidth: CITY_ROAD_HALF_WIDTH,
    kind: 'avenue',
  },
  {
    id: 'central-avenue',
    start: [3.5, 0, 11],
    end: [1, .22, -52],
    halfWidth: CITY_ROAD_HALF_WIDTH + .18,
    kind: 'avenue',
  },
  {
    id: 'east-avenue',
    start: [17, 0, 10],
    end: [29, .18, -53],
    halfWidth: CITY_ROAD_HALF_WIDTH,
    kind: 'avenue',
  },

  // Irregular cross streets create loops without exposing a ladder.
  {
    id: 'front-web',
    start: [-25, 0, -10],
    end: [3, 0, -10],
    halfWidth: CITY_ROAD_HALF_WIDTH,
    kind: 'street',
  },
  {
    id: 'front-community',
    start: [3, 0, -2],
    end: [18, .06, -2],
    halfWidth: CITY_ROAD_HALF_WIDTH,
    kind: 'street',
  },
  {
    id: 'web-ai',
    start: [-25, .22, -27],
    end: [4, .52, -27],
    halfWidth: CITY_ROAD_HALF_WIDTH,
    kind: 'street',
  },
  {
    id: 'ai-linux',
    start: [-1, .58, -38],
    end: [18, .34, -38],
    halfWidth: CITY_ROAD_HALF_WIDTH,
    kind: 'street',
  },
  {
    id: 'community-js',
    start: [4, .05, -15],
    end: [29, .12, -15],
    halfWidth: CITY_ROAD_HALF_WIDTH,
    kind: 'street',
  },
  {
    id: 'linux-archive',
    start: [15, .32, -29],
    end: [31, .46, -29],
    halfWidth: CITY_ROAD_HALF_WIDTH,
    kind: 'street',
  },
  {
    id: 'deep-return',
    start: [1, .16, -50],
    end: [31, .14, -50],
    halfWidth: CITY_ROAD_HALF_WIDTH,
    kind: 'street',
  },

  // Smaller connectors / alleys break up sight lines.
  {
    id: 'front-foyer-cut',
    start: [-5, 0, 4],
    end: [3.5, 0, 9.5],
    halfWidth: 1.28,
    kind: 'alley',
  },
  {
    id: 'web-west-cut',
    start: [-12, .2, -18],
    end: [-24, .25, -27],
    halfWidth: 1.18,
    kind: 'alley',
  },
  {
    id: 'community-east-cut',
    start: [10, .06, -6],
    end: [20, .12, -15],
    halfWidth: 1.22,
    kind: 'alley',
  },
]

export const CITY_EMPTY_BLOCKS: CityEmptyBlock[] = [
  // These are intentionally low/medium "city mass" rather than skyscrapers.
  // Their job is to break sightlines and create corners, alleys, and reveals.
  {id: 'block-a', x: -5, z: -17, width: 9, depth: 9, height: 1.65},
  {id: 'block-b', x: 8, z: -21, width: 8, depth: 10, height: 2.15},
  {id: 'block-c', x: -11, z: -39, width: 10, depth: 8, height: 1.8},
  {id: 'block-d', x: 10, z: -41, width: 9, depth: 8, height: 1.45},
  {id: 'block-e', x: 27, z: -2, width: 8, depth: 9, height: 1.9},
  {id: 'block-f', x: -27, z: -5, width: 7, depth: 10, height: 1.55},
  {id: 'block-g', x: 20, z: -43, width: 7, depth: 7, height: 2.35},
  {id: 'block-h', x: -17, z: -14, width: 6, depth: 6, height: 1.2},
  {id: 'block-i', x: 16, z: -19, width: 6, depth: 5.5, height: 1.35},
  {id: 'block-j', x: -2, z: -44, width: 6.5, depth: 5.5, height: 1.7},
]

function faceTargetYaw(
  fromX: number,
  fromZ: number,
  targetX: number,
  targetZ: number,
) {
  return (
    Math.atan2(targetX - fromX, targetZ - fromZ) +
    Math.PI
  )
}

export function cityDistrictBlock(
  districtId: string,
  index = 0,
): CityDistrictBlock {
  const known = DISTRICT_BLOCKS[districtId]
  if (known) return known

  const fallback =
    FALLBACK_BLOCKS[index % FALLBACK_BLOCKS.length] ??
    FALLBACK_BLOCKS[0]

  return {
    id: districtId,
    ...fallback,
    x: fallback.x + Math.floor(index / FALLBACK_BLOCKS.length) * 15,
    z: fallback.z - Math.floor(index / FALLBACK_BLOCKS.length) * 10,
  }
}

export function cityDistrictCenter(
  districtId: string,
  index = 0,
): [number, number, number] {
  const block = cityDistrictBlock(districtId, index)
  return [block.x, block.elevation, block.z]
}

export function cityDistrictShelfPlacement(
  district: LibraryDistrictConfig,
  districtIndex: number,
  localIndex: number,
): CityShelfPlacement {
  const block = cityDistrictBlock(
    district.id,
    districtIndex,
  )
  const slot = localIndex % 4
  const left = slot === 0 || slot === 2
  const back = slot >= 2
  const insetX = Math.min(3.2, block.width * .27)
  const insetZ = Math.min(3.35, block.depth * .28)
  const x =
    block.x +
    (left ? -1 : 1) *
      (block.width * .5 - insetX)
  const z =
    block.z +
    (back ? -1 : 1) *
      (block.depth * .5 - insetZ)

  return {
    world: [x, block.elevation, z],
    yaw: faceTargetYaw(
      x,
      z,
      block.x,
      block.z,
    ),
    pathBay: district.bay,
    districtId: district.id,
  }
}

const ARRIVAL_SLOTS: Array<{
  x: number
  z: number
}> = [
  {x: -2.8, z: 12.6},
  {x: 9.8, z: 12.6},
  {x: -3.8, z: 8.2},
  {x: 10.8, z: 8.2},
  {x: -.8, z: 3.9},
  {x: 7.8, z: 3.9},
]

export function cityArrivalShelfPlacement(
  index: number,
): CityShelfPlacement {
  const slot =
    ARRIVAL_SLOTS[index % ARRIVAL_SLOTS.length] ??
    ARRIVAL_SLOTS[0]

  return {
    world: [
      slot.x,
      CITY_ARRIVAL.elevation,
      slot.z,
    ],
    yaw: faceTargetYaw(
      slot.x,
      slot.z,
      CITY_ARRIVAL.x,
      CITY_ARRIVAL.z,
    ),
    pathBay: .1,
    districtId: 'arrival',
  }
}

function pointInRect(
  x: number,
  z: number,
  centerX: number,
  centerZ: number,
  width: number,
  depth: number,
) {
  return (
    Math.abs(x - centerX) <= width * .5 &&
    Math.abs(z - centerZ) <= depth * .5
  )
}

export function cityNearestDistrict(
  x: number,
  z: number,
  districts: LibraryDistrictConfig[],
) {
  if (districts.length === 0) return null

  return districts.reduce<{
    district: LibraryDistrictConfig
    distance: number
    index: number
  } | null>((nearest, district, index) => {
    const block = cityDistrictBlock(
      district.id,
      index,
    )
    const distance = Math.hypot(
      x - block.x,
      z - block.z,
    )

    if (!nearest || distance < nearest.distance) {
      return {district, distance, index}
    }

    return nearest
  }, null)
}

export function cityWalkSurfaceAtPosition(
  x: number,
  z: number,
  districts: LibraryDistrictConfig[],
): CityWalkSurface | null {
  let best: CityWalkSurface | null = null

  const consider = (candidate: CityWalkSurface) => {
    if (
      !best ||
      candidate.outsideDistance <
        best.outsideDistance - .0001 ||
      (Math.abs(
        candidate.outsideDistance -
          best.outsideDistance,
      ) < .0001 &&
        candidate.distance < best.distance)
    ) {
      best = candidate
    }
  }

  districts.forEach((district, index) => {
    const block = cityDistrictBlock(
      district.id,
      index,
    )
    const inside = pointInRect(
      x,
      z,
      block.x,
      block.z,
      block.width,
      block.depth,
    )
    const dx = Math.max(
      0,
      Math.abs(x - block.x) - block.width * .5,
    )
    const dz = Math.max(
      0,
      Math.abs(z - block.z) - block.depth * .5,
    )
    const outsideDistance = Math.hypot(dx, dz)
    consider({
      centerX: inside
        ? x
        : Math.max(
            block.x - block.width * .5,
            Math.min(
              block.x + block.width * .5,
              x,
            ),
          ),
      centerZ: inside
        ? z
        : Math.max(
            block.z - block.depth * .5,
            Math.min(
              block.z + block.depth * .5,
              z,
            ),
          ),
      groundY: block.elevation,
      halfWidth: 0,
      distance: outsideDistance,
      outsideDistance,
      bay: district.bay,
      kind: 'plaza',
    })
  })

  const arrivalInside = pointInRect(
    x,
    z,
    CITY_ARRIVAL.x,
    CITY_ARRIVAL.z,
    CITY_ARRIVAL.width,
    CITY_ARRIVAL.depth,
  )
  const arrivalDx = Math.max(
    0,
    Math.abs(x - CITY_ARRIVAL.x) -
      CITY_ARRIVAL.width * .5,
  )
  const arrivalDz = Math.max(
    0,
    Math.abs(z - CITY_ARRIVAL.z) -
      CITY_ARRIVAL.depth * .5,
  )
  const arrivalOutside = Math.hypot(
    arrivalDx,
    arrivalDz,
  )
  consider({
    centerX: arrivalInside
      ? x
      : Math.max(
          CITY_ARRIVAL.x - CITY_ARRIVAL.width * .5,
          Math.min(
            CITY_ARRIVAL.x + CITY_ARRIVAL.width * .5,
            x,
          ),
        ),
    centerZ: arrivalInside
      ? z
      : Math.max(
          CITY_ARRIVAL.z - CITY_ARRIVAL.depth * .5,
          Math.min(
            CITY_ARRIVAL.z + CITY_ARRIVAL.depth * .5,
            z,
          ),
        ),
    groundY: CITY_ARRIVAL.elevation,
    halfWidth: 0,
    distance: arrivalOutside,
    outsideDistance: arrivalOutside,
    bay: .1,
    kind: 'plaza',
  })

  CITY_ROADS.forEach((segment) => {
    const [sx, sy, sz] = segment.start
    const [ex, ey, ez] = segment.end
    const dx = ex - sx
    const dz = ez - sz
    const lengthSq = dx * dx + dz * dz
    const t =
      lengthSq > .000001
        ? Math.max(
            0,
            Math.min(
              1,
              ((x - sx) * dx + (z - sz) * dz) /
                lengthSq,
            ),
          )
        : 0
    const centerX = sx + dx * t
    const centerZ = sz + dz * t
    const distance = Math.hypot(
      x - centerX,
      z - centerZ,
    )
    const outsideDistance = Math.max(
      0,
      distance - segment.halfWidth,
    )

    const nearest = cityNearestDistrict(
      centerX,
      centerZ,
      districts,
    )

    consider({
      centerX,
      centerZ,
      groundY: sy + (ey - sy) * t,
      halfWidth: segment.halfWidth,
      distance,
      outsideDistance,
      bay: nearest?.district.bay ?? .1,
      kind: 'road',
    })
  })

  return best
}
