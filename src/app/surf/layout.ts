import rawLayout from './layout.json'

export type ShelfLayoutTransform = {
  x: number
  z: number
  rotationY: number
}

export type SurfLayoutConfig = {
  version: 1
  shelves: Record<string, ShelfLayoutTransform>
}

export const surfLayout = rawLayout as SurfLayoutConfig

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

export type LayoutEditorSelection = ShelfLayoutTransform & {
  key: string
  label: string
}
