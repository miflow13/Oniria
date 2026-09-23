import {
  DEFAULT_LIBRARY_DISTRICTS,
  type LibraryDistrictConfig,
} from '@/lib/libraryWorldConfig'

export const ARCHIVE_PATH_RENDER_BAYS = 36
export const ARCHIVE_WALKWAY_HALF_WIDTH = 4.1
export const ARCHIVE_WALKWAY_Y_OFFSET = -2.08

export const ARCHIVE_BAY_SPACING = 6.8
const ARCHIVE_LANE_MIN = 8.15
const ARCHIVE_LANE_VARIATION = .9

export type ArchiveDistrict = LibraryDistrictConfig

export const ARCHIVE_DISTRICTS: ArchiveDistrict[] =
  DEFAULT_LIBRARY_DISTRICTS

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

function smoothStep(edge0: number, edge1: number, value: number) {
  const t = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

function archiveTierHeight(bay: number) {
  let height = 0
  height += smoothStep(10, 14, bay) * 3.0
  height += smoothStep(20, 24, bay) * -4.5
  height += smoothStep(30, 34, bay) * 5.5
  height += smoothStep(40, 44, bay) * -2.5
  height += smoothStep(50, 54, bay) * 3.5
  height += smoothStep(60, 64, bay) * -3.0
  return height
}

/**
 * The archive spine is the source of truth for the library world.
 * Its position never depends on how many shelves are currently loaded.
 */
export function archivePathPoint(
  bay: number,
): [number, number, number] {
  return [
    Math.sin(bay * .31) * 2.45 + Math.sin(bay * .095) * 1.15,
    archiveTierHeight(bay) + Math.sin(bay * .16) * .34,
    -8 - bay * ARCHIVE_BAY_SPACING,
  ]
}

export function archivePathFrame(bay: number) {
  const before = archivePathPoint(bay - .08)
  const after = archivePathPoint(bay + .08)
  let tangentX = after[0] - before[0]
  let tangentZ = after[2] - before[2]
  const length = Math.hypot(tangentX, tangentZ) || 1

  tangentX /= length
  tangentZ /= length

  return {
    tangentX,
    tangentZ,
    normalX: -tangentZ,
    normalZ: tangentX,
  }
}

export function archiveDistrictInfluence(
  bay: number,
  districts: ArchiveDistrict[] = ARCHIVE_DISTRICTS,
) {
  let influence = 0
  districts.forEach((district) => {
    const distance = Math.abs(bay - district.bay)
    const local = 1 - smoothStep(.7, 1.85, distance)
    influence = Math.max(influence, local)
  })
  return influence
}

export function archiveWalkwayHalfWidthAtBay(
  bay: number,
  districts: ArchiveDistrict[] = ARCHIVE_DISTRICTS,
) {
  const welcomeInfluence =
    1 - smoothStep(.45, 2.25, bay)

  return (
    ARCHIVE_WALKWAY_HALF_WIDTH +
    archiveDistrictInfluence(bay, districts) * 1.55 +
    welcomeInfluence * 3.15
  )
}

export function archiveBayFromWorldZ(z: number) {
  return Math.max(
    0,
    Math.min(
      ARCHIVE_PATH_RENDER_BAYS,
      (-8 - z) / ARCHIVE_BAY_SPACING,
    ),
  )
}

export function nearestArchiveDistrict(
  bay: number,
  districts: ArchiveDistrict[] = ARCHIVE_DISTRICTS,
) {
  return districts.reduce((nearest, district) =>
    Math.abs(district.bay - bay) < Math.abs(nearest.bay - bay)
      ? district
      : nearest,
  )
}

export type ArchiveShelfPlacement = {
  world: [number, number, number]
  yaw: number
  pathBay: number
  districtId: string
}

export type ArchiveShelfPlacementOptions = {
  laneBias?: number
  laneDistance?: number
  heightBias?: number
  heightJitterScale?: number
  lateralJitterScale?: number
  alongJitterScale?: number
  lookAheadScale?: number
  yawJitterScale?: number
  orientationBay?: number
}

/**
 * Shelves decorate the fixed route. Jitter is seeded by shelf id so a shelf
 * keeps the same position and rotation across streaming/rebuilds.
 */
export function archiveShelfPlacement(
  key: string,
  bay: number,
  side: -1 | 1,
  options: ArchiveShelfPlacementOptions = {},
  districts: ArchiveDistrict[] = ARCHIVE_DISTRICTS,
): ArchiveShelfPlacement {
  const seed = hashString(key)
  const alongJitterScale = options.alongJitterScale ?? 1
  const alongJitter =
    (seededUnit(seed, 7) - .5) * .82 * alongJitterScale
  const fractionalBay = bay + alongJitter / ARCHIVE_BAY_SPACING
  const center = archivePathPoint(fractionalBay)
  const frame = archivePathFrame(fractionalBay)
  const laneDistance =
    options.laneDistance ??
    (ARCHIVE_LANE_MIN +
      seededUnit(seed, 11) * ARCHIVE_LANE_VARIATION +
      (options.laneBias ?? 0))
  const lateralJitter =
    (seededUnit(seed, 13) - .5) *
    .34 *
    (options.lateralJitterScale ?? 1)
  const distance = Math.max(
    5.45,
    laneDistance + lateralJitter,
  )

  const world: [number, number, number] = [
    center[0] + frame.normalX * side * distance,
    center[1] +
      (seededUnit(seed, 17) - .5) *
        .9 *
        (options.heightJitterScale ?? 1) +
      (options.heightBias ?? 0),
    center[2] + frame.normalZ * side * distance,
  ]

  const lookAhead =
    (seededUnit(seed, 19) - .5) *
    1.7 *
    (options.lookAheadScale ?? 1)
  const targetX = center[0] + frame.tangentX * lookAhead
  const targetZ = center[2] + frame.tangentZ * lookAhead
  const yawJitter =
    (seededUnit(seed, 23) - .5) *
    .16 *
    (options.yawJitterScale ?? 1)

  const yaw =
    typeof options.orientationBay === 'number'
      ? (() => {
          const orientationFrame = archivePathFrame(
            options.orientationBay,
          )
          const inwardX =
            -orientationFrame.normalX * side
          const inwardZ =
            -orientationFrame.normalZ * side
          return (
            Math.atan2(inwardX, inwardZ) +
            Math.PI +
            yawJitter
          )
        })()
      : Math.atan2(
          targetX - world[0],
          targetZ - world[2],
        ) +
        Math.PI +
        yawJitter

  return {
    world,
    yaw,
    pathBay: fractionalBay,
    districtId: nearestArchiveDistrict(
      fractionalBay,
      districts,
    ).id,
  }
}


const ARCHIVE_SHELF_MIN_CENTER_DISTANCE = 5.35
const ARCHIVE_SHELF_CLEARANCE_STEP_BAYS = .1
const ARCHIVE_SHELF_MAX_CLEARANCE_STEPS = 5

function wrapAngle(angle: number) {
  return Math.atan2(Math.sin(angle), Math.cos(angle))
}

function moveArchivePlacementToBay(
  placement: ArchiveShelfPlacement,
  nextBay: number,
  districts: ArchiveDistrict[] = ARCHIVE_DISTRICTS,
): ArchiveShelfPlacement {
  const oldCenter = archivePathPoint(placement.pathBay)
  const oldFrame = archivePathFrame(placement.pathBay)
  const offsetX = placement.world[0] - oldCenter[0]
  const offsetZ = placement.world[2] - oldCenter[2]
  const signedLaneDistance =
    offsetX * oldFrame.normalX +
    offsetZ * oldFrame.normalZ
  const heightOffset = placement.world[1] - oldCenter[1]

  const oldBaseYaw =
    Math.atan2(
      oldCenter[0] - placement.world[0],
      oldCenter[2] - placement.world[2],
    ) + Math.PI
  const yawOffset = wrapAngle(placement.yaw - oldBaseYaw)

  const nextCenter = archivePathPoint(nextBay)
  const nextFrame = archivePathFrame(nextBay)
  const world: [number, number, number] = [
    nextCenter[0] +
      nextFrame.normalX * signedLaneDistance,
    nextCenter[1] + heightOffset,
    nextCenter[2] +
      nextFrame.normalZ * signedLaneDistance,
  ]

  const nextBaseYaw =
    Math.atan2(
      nextCenter[0] - world[0],
      nextCenter[2] - world[2],
    ) + Math.PI

  return {
    world,
    yaw: nextBaseYaw + yawOffset,
    pathBay: nextBay,
    // Clearance must never migrate a shelf into another district.
    districtId: placement.districtId,
  }
}

/**
 * Enforce real world-space breathing room between shelf footprints.
 *
 * Layout formulas can produce perfectly valid anchor spacing while rotated
 * shelf bodies still look crowded. This resolver keeps earlier shelf
 * placements stable and only nudges later shelves a small amount inside
 * their own district. Shelf clearance is intentionally bounded so streaming
 * more catalogue data can never expand or reorder the physical boulevard.
 */
export function resolveArchiveShelfClearance(
  placements: ArchiveShelfPlacement[],
  districts: ArchiveDistrict[] = ARCHIVE_DISTRICTS,
): ArchiveShelfPlacement[] {
  const resolved: ArchiveShelfPlacement[] = []

  placements.forEach((placement) => {
    let candidate = placement

    for (
      let attempt = 0;
      attempt < ARCHIVE_SHELF_MAX_CLEARANCE_STEPS;
      attempt += 1
    ) {
      const overlaps = resolved.some((other) => {
        // Adjacent districts own separate physical footprints. Cross-district
        // clearance used to push later shelves progressively down the route,
        // which made Deep Stacks expand as more DEV pages were fetched.
        if (other.districtId !== placement.districtId) {
          return false
        }

        const dx = candidate.world[0] - other.world[0]
        const dz = candidate.world[2] - other.world[2]
        const horizontalDistance = Math.hypot(dx, dz)
        const verticalDistance = Math.abs(
          candidate.world[1] - other.world[1],
        )

        return (
          verticalDistance < 3.7 &&
          horizontalDistance < ARCHIVE_SHELF_MIN_CENTER_DISTANCE
        )
      })

      if (!overlaps) break

      candidate = moveArchivePlacementToBay(
        candidate,
        candidate.pathBay + ARCHIVE_SHELF_CLEARANCE_STEP_BAYS,
        districts,
      )
    }

    resolved.push(candidate)
  })

  return resolved
}
