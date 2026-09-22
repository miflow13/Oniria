export const ARCHIVE_PATH_RENDER_BAYS = 72
export const ARCHIVE_WALKWAY_HALF_WIDTH = 1.28
export const ARCHIVE_WALKWAY_Y_OFFSET = -2.08

const ARCHIVE_BAY_SPACING = 7.2
const ARCHIVE_LANE_MIN = 6.6
const ARCHIVE_LANE_VARIATION = 1.45

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

/**
 * The DEV archive route is intentionally independent from loaded shelves.
 * Streaming more catalogue pages never changes points that already exist.
 */
export function archivePathPoint(
  bay: number,
): [number, number, number] {
  return [
    Math.sin(bay * .31) * 2.45 + Math.sin(bay * .095) * 1.15,
    Math.sin(bay * .16) * .42,
    -8 - bay * ARCHIVE_BAY_SPACING,
  ]
}

function archivePathFrame(bay: number) {
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

export type ArchiveShelfPlacement = {
  world: [number, number, number]
  yaw: number
  pathBay: number
}

/**
 * Shelves are decorative bays around the fixed archive path. Their jitter is
 * seeded by shelf id, so they feel varied while remaining stable forever.
 */
export function archiveShelfPlacement(
  key: string,
  bay: number,
  side: -1 | 1,
): ArchiveShelfPlacement {
  const seed = hashString(key)
  const alongJitter = (seededUnit(seed, 7) - .5) * 1.25
  const fractionalBay = bay + alongJitter / ARCHIVE_BAY_SPACING
  const center = archivePathPoint(fractionalBay)
  const frame = archivePathFrame(fractionalBay)
  const laneDistance =
    ARCHIVE_LANE_MIN +
    seededUnit(seed, 11) * ARCHIVE_LANE_VARIATION
  const lateralJitter = (seededUnit(seed, 13) - .5) * .55
  const distance = laneDistance + lateralJitter

  const world: [number, number, number] = [
    center[0] + frame.normalX * side * distance,
    center[1] + (seededUnit(seed, 17) - .5) * .9,
    center[2] + frame.normalZ * side * distance,
  ]

  const lookAhead = (seededUnit(seed, 19) - .5) * 1.7
  const targetX = center[0] + frame.tangentX * lookAhead
  const targetZ = center[2] + frame.tangentZ * lookAhead
  const yawJitter = (seededUnit(seed, 23) - .5) * .22

  // Shelf fronts face inward toward the route, with a small stable variance.
  const yaw =
    Math.atan2(targetX - world[0], targetZ - world[2]) +
    Math.PI +
    yawJitter

  return {world, yaw, pathBay: fractionalBay}
}
