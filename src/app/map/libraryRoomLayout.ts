import type {
  LibraryContentSource,
  LibraryDistrictConfig,
} from '@/lib/libraryWorldConfig'

export const LIBRARY_EYE_HEIGHT = 1.64
export const LIBRARY_SHELF_WIDTH = 4.5
export const LIBRARY_SHELF_DEPTH = .72
export const LIBRARY_SHELF_HEIGHT = 3.5

export const LIBRARY_BUILDING_BOUNDS = {
  minX: -24.1,
  maxX: 24.1,
  minZ: -74.7,
  maxZ: 14.4,
} as const

export const LIBRARY_SPAWN: [number, number, number] = [
  0,
  LIBRARY_EYE_HEIGHT,
  12.6,
]

export type LibraryRoomSlot = 0 | 1 | 2 | 3 | 4 | 5

export type LibraryRoomLayout = {
  slot: LibraryRoomSlot
  sourceMode: LibraryContentSource
  center: [number, number]
  doorway: [number, number]
  accent: number
}

export const LIBRARY_ROOMS: LibraryRoomLayout[] = [
  {
    slot: 0,
    sourceMode: 'featured',
    center: [-16, -12],
    doorway: [-8, -12],
    accent: 0x3b49df,
  },
  {
    slot: 1,
    sourceMode: 'latest',
    center: [16, -12],
    doorway: [8, -12],
    accent: 0x7295ff,
  },
  {
    slot: 2,
    sourceMode: 'topics',
    center: [-16, -32],
    doorway: [-8, -32],
    accent: 0x53d3ff,
  },
  {
    slot: 3,
    sourceMode: 'creators',
    center: [16, -32],
    doorway: [8, -32],
    accent: 0xae7bff,
  },
  {
    slot: 4,
    sourceMode: 'search',
    center: [-16, -52],
    doorway: [-8, -52],
    accent: 0x75b7ff,
  },
  {
    slot: 5,
    sourceMode: 'catalog',
    center: [16, -52],
    doorway: [8, -52],
    accent: 0x909bb4,
  },
]

export function roomForDistrict(
  district: LibraryDistrictConfig,
  index = 0,
) {
  return (
    LIBRARY_ROOMS.find(
      (room) => room.slot === district.roomSlot,
    ) ??
    LIBRARY_ROOMS[index % LIBRARY_ROOMS.length] ??
    LIBRARY_ROOMS[0]
  )
}

export type RoomShelfPlacement = {
  world: [number, number, number]
  yaw: number
  pathBay: number
  districtId: string
}

export function roomShelfPlacements(
  district: LibraryDistrictConfig,
  index = 0,
): RoomShelfPlacement[] {
  const room = roomForDistrict(district, index)
  const [x, z] = room.center
  const outerX = x < 0 ? x - 3.4 : x + 3.4
  const innerX = x < 0 ? x + 2.5 : x - 2.5

  return [
    {
      world: [outerX, .12, z - 2.9],
      yaw: 0,
      pathBay: district.bay,
      districtId: district.id,
    },
    {
      world: [innerX, .12, z - 2.9],
      yaw: 0,
      pathBay: district.bay,
      districtId: district.id,
    },
    {
      world: [outerX, .12, z + 2.9],
      yaw: Math.PI,
      pathBay: district.bay,
      districtId: district.id,
    },
    {
      world: [innerX, .12, z + 2.9],
      yaw: Math.PI,
      pathBay: district.bay,
      districtId: district.id,
    },
  ]
}

export function clampLibraryWalkPosition(
  x: number,
  z: number,
) {
  return {
    x: Math.max(
      LIBRARY_BUILDING_BOUNDS.minX,
      Math.min(LIBRARY_BUILDING_BOUNDS.maxX, x),
    ),
    z: Math.max(
      LIBRARY_BUILDING_BOUNDS.minZ,
      Math.min(LIBRARY_BUILDING_BOUNDS.maxZ, z),
    ),
  }
}
