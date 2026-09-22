import rawLayout from './layout.json'

export type ShelfLayoutTransform = {
  x: number
  z: number
  rotationY: number
}

export type SceneLayoutTransform = {
  x: number
  y: number
  z: number
  rotationX: number
  rotationY: number
  rotationZ: number
}

export type SurfLayoutConfig = {
  version: 2
  shelves: Record<string, ShelfLayoutTransform>
  objects: Record<string, SceneLayoutTransform>
}

type RawSurfLayoutConfig = {
  version?: number
  shelves?: Record<string, ShelfLayoutTransform>
  objects?: Record<string, SceneLayoutTransform>
}

const parsedLayout = rawLayout as RawSurfLayoutConfig

export const surfLayout: SurfLayoutConfig = {
  version: 2,
  shelves: parsedLayout.shelves ?? {},
  objects: parsedLayout.objects ?? {},
}

export function shelfLayoutKey(
  shelfKey: string | undefined,
  floorIndex = 0,
) {
  if (!shelfKey) return null
  return (
    floorIndex +
    ':' +
    shelfKey.replace(/:level-\d+$/, '')
  )
}

export type LayoutEditorMode = 'translate' | 'rotate'
export type LayoutEditorKind = 'shelf' | 'object'

export type LayoutEditorSelection = SceneLayoutTransform & {
  key: string
  label: string
  kind: LayoutEditorKind
}
