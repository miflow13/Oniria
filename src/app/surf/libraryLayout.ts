import type {LibrarySection} from './types'

// One metre per unit. All accessible content stays on y=0.
export const EYE_HEIGHT = 1.65
export const FLOOR_COUNT = 1
export type ShelfAnchor = {id: string; x: number; z: number; rotationY: number}
export type RoomLayout = {
  center: [number, number]
  doorway: [number, number]
  travel: [number, number]
  accent: number
  shelves: ShelfAnchor[]
}

const room = (section: string, x: number, z: number, accent: number): RoomLayout => ({
  center: [x, z],
  doorway: [x < 0 ? -8 : 8, z],
  travel: [x < 0 ? -10 : 10, z],
  accent,
  shelves: [z - 2.9, z + 2.9].flatMap((row, index) => [
    {id: `${section}-outer-${index}`, x: x + (x < 0 ? -3.4 : 3.4), z: row, rotationY: 0},
    {id: `${section}-inner-${index}`, x: x + (x < 0 ? 2.5 : -2.5), z: row, rotationY: 0},
  ]),
})

export const ROOMS: Record<LibrarySection, RoomLayout> = {
  atrium: {center: [0, 8], doorway: [0, 11], travel: [0, 10], accent: 0xffffff, shelves: []},
  featured: room('featured', -16, -12, 0x3b49df),
  latest: room('latest', 16, -12, 0x7295ff),
  topics: room('topics', -16, -32, 0x53d3ff),
  creators: room('creators', 16, -32, 0xae7bff),
  search: room('search', -16, -52, 0x75b7ff),
  archive: room('archive', 16, -52, 0x909bb4),
}
export const ROOM_ORDER: LibrarySection[] = ['featured', 'latest', 'topics', 'creators', 'search', 'archive']
export const SPAWN: [number, number, number] = [0, EYE_HEIGHT, 13]
export const LANDMARK: [number, number] = [0, -72]
export const WALK_BOUNDS = {minX: -24, maxX: 24, minZ: -75, maxZ: 14}
