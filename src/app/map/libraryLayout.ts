export const ARCHIVE_PATH_RENDER_BAYS = 72
export const ARCHIVE_WALKWAY_HALF_WIDTH = 1.28
export const ARCHIVE_WALKWAY_Y_OFFSET = -2.08

const ARCHIVE_BAY_SPACING = 7.2
const ARCHIVE_LANE_MIN = 6.6
const ARCHIVE_LANE_VARIATION = 1.45

export type ArchiveDistrict = {
  id: string
  label: string
  code: string
  bay: number
}

export const ARCHIVE_DISTRICTS: ArchiveDistrict[] = [
  {id: 'front-page', label: 'FRONT PAGE', code: 'A-01', bay: 1},
  {id: 'web-dev', label: 'WEB DEV', code: 'A-08', bay: 7.5},
  {id: 'ai', label: 'AI', code: 'A-18', bay: 17.5},
  {id: 'linux', label: 'LINUX', code: 'A-28', bay: 27.5},
  {id: 'javascript', label: 'JAVASCRIPT', code: 'A-38', bay: 37.5},
  {id: 'archive-2026', label: 'ARCHIVE 2026', code: 'A-48', bay: 47.5},
  {id: 'community', label: 'COMMUNITY', code: 'A-58', bay: 57.5},
  {id: 'deep-stacks', label: 'DEEP STACKS', code: 'A-68', bay: 67.5},
]

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

export function archiveDistrictInfluence(bay: number) {
  let influence = 0
  ARCHIVE_DISTRICTS.forEach((district) => {
    const distance = Math.abs(bay - district.bay)
    const local = 1 - smoothStep(.7, 1.85, distance)
    influence = Math.max(influence, local)
  })
  return influence
}

export function nearestArchiveDistrict(bay: number) {
  return ARCHIVE_DISTRICTS.reduce((nearest, district) =>
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
  heightBias?: number
  alongJitterScale?: number
  yawJitterScale?: number
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
): ArchiveShelfPlacement {
  const seed = hashString(key)
  const alongJitterScale = options.alongJitterScale ?? 1
  const alongJitter =
    (seededUnit(seed, 7) - .5) * 1.25 * alongJitterScale
  const fractionalBay = bay + alongJitter / ARCHIVE_BAY_SPACING
  const center = archivePathPoint(fractionalBay)
  const frame = archivePathFrame(fractionalBay)
  const laneDistance =
    ARCHIVE_LANE_MIN +
    seededUnit(seed, 11) * ARCHIVE_LANE_VARIATION +
    (options.laneBias ?? 0)
  const lateralJitter = (seededUnit(seed, 13) - .5) * .55
  const distance = Math.max(5.45, laneDistance + lateralJitter)

  const world: [number, number, number] = [
    center[0] + frame.normalX * side * distance,
    center[1] +
      (seededUnit(seed, 17) - .5) * .9 +
      (options.heightBias ?? 0),
    center[2] + frame.normalZ * side * distance,
  ]

  const lookAhead = (seededUnit(seed, 19) - .5) * 1.7
  const targetX = center[0] + frame.tangentX * lookAhead
  const targetZ = center[2] + frame.tangentZ * lookAhead
  const yawJitter =
    (seededUnit(seed, 23) - .5) *
    .22 *
    (options.yawJitterScale ?? 1)

  const yaw =
    Math.atan2(targetX - world[0], targetZ - world[2]) +
    Math.PI +
    yawJitter

  return {
    world,
    yaw,
    pathBay: fractionalBay,
    districtId: nearestArchiveDistrict(fractionalBay).id,
  }
}
