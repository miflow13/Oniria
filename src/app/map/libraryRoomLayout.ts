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
  endCaps: 'none' | 'left' | 'right'
  floatId: string
  pathBay: number
  districtId: string
}

const shelfHoverHeights = (
  sourceMode: LibraryContentSource,
): [number, number, number, number] => {
  switch (sourceMode) {
    case 'featured':
      return [.84, .84, 1.02, 1.02]
    case 'latest':
      return [.52, .52, .66, .66]
    case 'topics':
      return [.68, .68, .84, .84]
    case 'creators':
      return [.8, .8, .94, .94]
    case 'search':
      return [.58, .58, .72, .72]
    case 'catalog':
      return [.92, .92, 1.12, 1.12]
    default:
      return [.64, .64, .8, .8]
  }
}

export function roomShelfPlacements(
  district: LibraryDistrictConfig,
  index = 0,
): RoomShelfPlacement[] {
  const room = roomForDistrict(district, index)
  const [x, z] = room.center
  const heights = shelfHoverHeights(district.sourceMode)
  const rowOffset = district.sourceMode === 'search' ? 3.8 : 3.25
  const shelfOffset =
    district.sourceMode === 'featured' ? 2.6 : 2.28
  const useEndCaps =
    district.sourceMode === 'latest' ||
    district.sourceMode === 'topics' ||
    district.sourceMode === 'catalog'

  return [
    {
      world: [x - shelfOffset, heights[0], z - rowOffset],
      yaw: 0,
      endCaps: useEndCaps ? 'left' : 'none',
      floatId: `${district.id}:row-north`,
      pathBay: district.bay,
      districtId: district.id,
    },
    {
      world: [x + shelfOffset, heights[1], z - rowOffset],
      yaw: 0,
      endCaps: useEndCaps ? 'right' : 'none',
      floatId: `${district.id}:row-north`,
      pathBay: district.bay,
      districtId: district.id,
    },
    {
      world: [x + shelfOffset, heights[2], z + rowOffset],
      yaw: Math.PI,
      endCaps: useEndCaps ? 'left' : 'none',
      floatId: `${district.id}:row-south`,
      pathBay: district.bay,
      districtId: district.id,
    },
    {
      world: [x - shelfOffset, heights[3], z + rowOffset],
      yaw: Math.PI,
      endCaps: useEndCaps ? 'right' : 'none',
      floatId: `${district.id}:row-south`,
      pathBay: district.bay,
      districtId: district.id,
    },
  ]
}

export type LibraryFurnishingAsset =
  | 'column'
  | 'readingRug'
  | 'libraryChair'
  | 'readingTable'
  | 'cardCatalogue'

export type LibraryFurnishingPlacement = {
  id: string
  asset: LibraryFurnishingAsset
  position: [number, number, number]
  yaw?: number
  scale?: number
  hoverAmplitude: number
  hoverSpeed: number
  tiltX?: number
  tiltZ?: number
  collider?: [number, number]
  castsShadow?: boolean
}

export const LIBRARY_FURNISHINGS: LibraryFurnishingPlacement[] = [
  // Atrium threshold and one deliberately off-axis reading island.
  {id: 'atrium-column-left', asset: 'column', position: [-5.25, .05, 7], hoverAmplitude: .012, hoverSpeed: .1, tiltZ: .0006, collider: [.9, .9]},
  {id: 'atrium-column-right', asset: 'column', position: [5.25, .05, 7], hoverAmplitude: .012, hoverSpeed: .1, tiltZ: .0006, collider: [.9, .9]},
  {id: 'atrium-island-rug', asset: 'readingRug', position: [-4.25, .3, 1.8], yaw: .08, hoverAmplitude: .026, hoverSpeed: .16, tiltX: .001, tiltZ: .0012, collider: [4.25, 3.25]},
  {id: 'atrium-island-table', asset: 'readingTable', position: [-4.25, .76, 1.8], yaw: .08, hoverAmplitude: .035, hoverSpeed: .15, tiltX: .002, tiltZ: .0015, castsShadow: true},
  {id: 'atrium-island-chair-north', asset: 'libraryChair', position: [-4.25, .66, 3.05], yaw: Math.PI, hoverAmplitude: .052, hoverSpeed: .19, tiltX: .006, tiltZ: .004},
  {id: 'atrium-island-chair-south', asset: 'libraryChair', position: [-4.25, .58, .55], hoverAmplitude: .046, hoverSpeed: .18, tiltX: .005, tiltZ: .004},

  // Featured: the richest collection of suspended reading constellations.
  {id: 'featured-island-a-rug', asset: 'readingRug', position: [-20.5, .28, -12], yaw: -.06, hoverAmplitude: .024, hoverSpeed: .14, tiltX: .0008, tiltZ: .001, collider: [4.25, 3.25]},
  {id: 'featured-island-a-table', asset: 'readingTable', position: [-20.5, .8, -12], yaw: -.06, hoverAmplitude: .038, hoverSpeed: .145, tiltX: .002, tiltZ: .0015, castsShadow: true},
  {id: 'featured-island-a-chair-north', asset: 'libraryChair', position: [-20.5, .66, -10.75], yaw: Math.PI, hoverAmplitude: .06, hoverSpeed: .2, tiltX: .007, tiltZ: .005},
  {id: 'featured-island-a-chair-south', asset: 'libraryChair', position: [-20.5, .61, -13.25], hoverAmplitude: .054, hoverSpeed: .185, tiltX: .006, tiltZ: .005},
  {id: 'featured-island-b-rug', asset: 'readingRug', position: [-14.35, .4, -12.15], yaw: .05, scale: .9, hoverAmplitude: .022, hoverSpeed: .13, tiltX: .0008, tiltZ: .0008, collider: [3.85, 3]},
  {id: 'featured-island-b-table', asset: 'readingTable', position: [-14.35, .96, -12.15], yaw: .05, scale: .9, hoverAmplitude: .034, hoverSpeed: .135, tiltX: .0017, tiltZ: .0015, castsShadow: true},
  {id: 'featured-island-b-chair-west', asset: 'libraryChair', position: [-15.75, .79, -12.15], yaw: Math.PI / 2, hoverAmplitude: .058, hoverSpeed: .205, tiltX: .007, tiltZ: .005},
  {id: 'featured-island-b-chair-east', asset: 'libraryChair', position: [-12.95, .73, -12.15], yaw: -Math.PI / 2, hoverAmplitude: .05, hoverSpeed: .19, tiltX: .006, tiltZ: .004},
  {id: 'featured-solitary-table', asset: 'readingTable', position: [-17.25, 1.12, -17.8], yaw: -.12, scale: .82, hoverAmplitude: .034, hoverSpeed: .12, tiltX: .0015, tiltZ: .0012, collider: [2.5, 1.5], castsShadow: true},
  {id: 'featured-solitary-chair', asset: 'libraryChair', position: [-17.25, .95, -18.9], yaw: Math.PI, hoverAmplitude: .055, hoverSpeed: .18, tiltX: .006, tiltZ: .004},

  // Creators: two intimate author-study pods.
  {id: 'creators-pod-a-rug', asset: 'readingRug', position: [19.7, .34, -32], yaw: .1, scale: .92, hoverAmplitude: .023, hoverSpeed: .145, tiltX: .0008, tiltZ: .001, collider: [3.95, 3]},
  {id: 'creators-pod-a-table', asset: 'readingTable', position: [19.7, .84, -32], yaw: .1, scale: .88, hoverAmplitude: .034, hoverSpeed: .14, tiltX: .0018, tiltZ: .0015, castsShadow: true},
  {id: 'creators-pod-a-chair-north', asset: 'libraryChair', position: [19.7, .72, -30.8], yaw: Math.PI, hoverAmplitude: .052, hoverSpeed: .19, tiltX: .006, tiltZ: .004},
  {id: 'creators-pod-a-chair-south', asset: 'libraryChair', position: [19.7, .67, -33.2], hoverAmplitude: .047, hoverSpeed: .18, tiltX: .005, tiltZ: .004},
  {id: 'creators-pod-b-rug', asset: 'readingRug', position: [13.75, .46, -32.1], yaw: -.08, scale: .84, hoverAmplitude: .02, hoverSpeed: .13, tiltX: .0007, tiltZ: .0009, collider: [3.6, 2.8]},
  {id: 'creators-pod-b-table', asset: 'readingTable', position: [13.75, 1.02, -32.1], yaw: -.08, scale: .78, hoverAmplitude: .032, hoverSpeed: .125, tiltX: .0015, tiltZ: .0014, castsShadow: true},
  {id: 'creators-pod-b-chair-west', asset: 'libraryChair', position: [12.5, .84, -32.1], yaw: Math.PI / 2, hoverAmplitude: .05, hoverSpeed: .185, tiltX: .006, tiltZ: .004},
  {id: 'creators-pod-b-chair-east', asset: 'libraryChair', position: [15, .79, -32.1], yaw: -Math.PI / 2, hoverAmplitude: .045, hoverSpeed: .175, tiltX: .005, tiltZ: .004},

  // Search: one catalogue, framed and isolated, with a small reference spot.
  {id: 'search-column-north', asset: 'column', position: [-18.7, .08, -48.9], hoverAmplitude: .014, hoverSpeed: .09, tiltZ: .0005, collider: [.9, .9]},
  {id: 'search-column-south', asset: 'column', position: [-18.7, .08, -55.1], hoverAmplitude: .014, hoverSpeed: .09, tiltZ: .0005, collider: [.9, .9]},
  {id: 'search-catalogue', asset: 'cardCatalogue', position: [-16, .52, -52], yaw: Math.PI / 2, hoverAmplitude: .032, hoverSpeed: .11, tiltX: .001, tiltZ: .0012, collider: [1.55, 1.15], castsShadow: true},
  {id: 'search-reference-table', asset: 'readingTable', position: [-21.1, .74, -52], yaw: Math.PI / 2, scale: .72, hoverAmplitude: .028, hoverSpeed: .12, tiltX: .0013, tiltZ: .0012, collider: [1.65, 2.25], castsShadow: true},
  {id: 'search-reference-chair', asset: 'libraryChair', position: [-19.95, .61, -52], yaw: -Math.PI / 2, hoverAmplitude: .044, hoverSpeed: .17, tiltX: .005, tiltZ: .0035},

  // Archive: one rare pod against a field of long, high shelf rows.
  {id: 'archive-pod-rug', asset: 'readingRug', position: [20.35, .5, -52], yaw: -.1, scale: .82, hoverAmplitude: .02, hoverSpeed: .11, tiltX: .0006, tiltZ: .0008, collider: [3.5, 2.7]},
  {id: 'archive-pod-table', asset: 'readingTable', position: [20.35, 1.02, -52], yaw: -.1, scale: .74, hoverAmplitude: .03, hoverSpeed: .105, tiltX: .0012, tiltZ: .0011, castsShadow: true},
  {id: 'archive-pod-chair', asset: 'libraryChair', position: [19.1, .86, -52], yaw: Math.PI / 2, hoverAmplitude: .042, hoverSpeed: .16, tiltX: .0045, tiltZ: .0035},
]

type WalkCollisionRect = {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
}

const wallRect = (
  x: number,
  z: number,
  width: number,
  depth: number,
): WalkCollisionRect => ({
  minX: x - width / 2,
  maxX: x + width / 2,
  minZ: z - depth / 2,
  maxZ: z + depth / 2,
})

const LIBRARY_SHELF_COLLIDERS: WalkCollisionRect[] =
  LIBRARY_ROOMS.flatMap((room) => {
    const district: LibraryDistrictConfig = {
      id: `room-${room.slot}`,
      label: '',
      code: '',
      bay: 0,
      devTags: [],
      accent: '',
      atmosphere: 'dream-archive' as const,
      audioProfile: 'ambient' as const,
      landmarkType: 'index',
      sourceMode: room.sourceMode,
      roomSlot: room.slot,
      enabled: true,
    }
    return roomShelfPlacements(district).map((placement) =>
      wallRect(
        placement.world[0],
        placement.world[2],
        4.7,
        .88,
      ),
    )
  })

const LIBRARY_FURNISHING_COLLIDERS = LIBRARY_FURNISHINGS.flatMap(
  (placement) =>
    placement.collider
      ? [
          wallRect(
            placement.position[0],
            placement.position[2],
            placement.collider[0],
            placement.collider[1],
          ),
        ]
      : [],
)

export const LIBRARY_WALK_COLLIDERS: WalkCollisionRect[] = [
  ...LIBRARY_SHELF_COLLIDERS,
  ...LIBRARY_FURNISHING_COLLIDERS,
  ...[-22, -42, -62].flatMap((z) => [
    wallRect(-16.2, z, 16, .38),
    wallRect(16.2, z, 16, .38),
  ]),
  ...LIBRARY_ROOMS.flatMap((room) => {
    const [x, z] = room.center
    const edgeX = x < 0 ? -8 : 8
    return [
      wallRect(edgeX, z - 6, .38, 8.6),
      wallRect(edgeX, z + 6, .38, 8.6),
    ]
  }),
  wallRect(-8, 9, .38, 11),
  wallRect(8, 9, .38, 11),
]

export function clampLibraryWalkPosition(
  x: number,
  z: number,
) {
  let nextX = Math.max(
    LIBRARY_BUILDING_BOUNDS.minX,
    Math.min(LIBRARY_BUILDING_BOUNDS.maxX, x),
  )
  let nextZ = Math.max(
    LIBRARY_BUILDING_BOUNDS.minZ,
    Math.min(LIBRARY_BUILDING_BOUNDS.maxZ, z),
  )

  // Resolve against the same divider-wall footprint used by the visual
  // building. Door gaps remain open because the wall runs are split around
  // them rather than represented as one solid room boundary.
  for (let pass = 0; pass < 2; pass += 1) {
    for (const rect of LIBRARY_WALK_COLLIDERS) {
      if (
        nextX <= rect.minX ||
        nextX >= rect.maxX ||
        nextZ <= rect.minZ ||
        nextZ >= rect.maxZ
      ) {
        continue
      }

      const candidates = [
        {
          distance: Math.abs(nextX - rect.minX),
          axis: 'x' as const,
          value: rect.minX - .04,
        },
        {
          distance: Math.abs(rect.maxX - nextX),
          axis: 'x' as const,
          value: rect.maxX + .04,
        },
        {
          distance: Math.abs(nextZ - rect.minZ),
          axis: 'z' as const,
          value: rect.minZ - .04,
        },
        {
          distance: Math.abs(rect.maxZ - nextZ),
          axis: 'z' as const,
          value: rect.maxZ + .04,
        },
      ].sort((a, b) => a.distance - b.distance)

      const nearest = candidates[0]
      if (!nearest) continue
      if (nearest.axis === 'x') nextX = nearest.value
      else nextZ = nearest.value
    }
  }

  return {x: nextX, z: nextZ}
}
