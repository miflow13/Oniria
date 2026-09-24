export type LibraryVector3 = [number, number, number]
export type LibraryQuaternion = [number, number, number, number]

export type LibraryReturnState = {
  roomId?: string
  shelfId: string
  bookId: string
  bookIndex: number
  playerPosition: LibraryVector3
  cameraPosition: LibraryVector3
  cameraQuaternion: LibraryQuaternion
  yaw: number
  pitch: number
  movementMode: 'walk' | 'fly'
}

export type LibraryNavigationRequest =
  | {
      id: number
      type: 'restore'
      state: LibraryReturnState
    }
  | {
      id: number
      type: 'locate'
      shelfId: string
      bookId: string
      bookIndex: number
    }

export type LibraryBookFocus = {
  shelfId: string
  bookId: string
  bookIndex: number
}

export type LibrarySpatialContext = {
  roomId: string | null
  shelfId: string | null
}
