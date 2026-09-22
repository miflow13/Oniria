import * as THREE from 'three'

export type LibraryBookVisual = {
  nodeId: string
  index: number
  group: THREE.Group
  coverHinge: THREE.Group
  coverMaterial: THREE.MeshStandardMaterial
  bookmark: THREE.Mesh
  basePosition: THREE.Vector3
}

type OpeningBookState = {
  visual: LibraryBookVisual
  startedAt: number
  fired: boolean
  returningAt: number | null
}

type UpdateArgs = {
  nowSeconds: number
  books: LibraryBookVisual[]
  hoveredBook: LibraryBookVisual | null
  approachedShelfId: string | null
  readerActive: boolean
  getShelfDistance: (nodeId: string) => number
  onOpen: (nodeId: string, bookIndex: number) => void
}

export type LibraryReadingRitual = {
  begin: (
    visual: LibraryBookVisual,
    nowSeconds?: number,
  ) => boolean
  update: (args: UpdateArgs) => void
  isActive: () => boolean
  isPresenting: (visual: LibraryBookVisual) => boolean
  dispose: () => void
}

const OPEN_DURATION = .92
const OPEN_HANDOFF_PROGRESS = .72
const RETURN_DURATION = .46
const MAX_DISPLACEMENT = .44

export function createLibraryReadingRitual(
  scene: THREE.Scene,
): LibraryReadingRitual {
  const readingLight = new THREE.PointLight(
    0xe49af2,
    0,
    8,
    2,
  )
  scene.add(readingLight)

  let openingBook: OpeningBookState | null = null
  let disposed = false

  const positionTarget = new THREE.Vector3()
  const displacement = new THREE.Vector3()
  const scaleTarget = new THREE.Vector3()
  const worldPosition = new THREE.Vector3()

  const resetBook = (visual: LibraryBookVisual) => {
    visual.group.position.copy(visual.basePosition)
    visual.group.rotation.set(0, 0, 0)
    visual.group.scale.setScalar(1)
    visual.coverHinge.rotation.y = 0
  }

  return {
    begin(visual, nowSeconds = performance.now() / 1000) {
      if (disposed || openingBook) return false

      openingBook = {
        visual,
        startedAt: nowSeconds,
        fired: false,
        returningAt: null,
      }
      return true
    },

    update({
      nowSeconds,
      books,
      hoveredBook,
      approachedShelfId,
      readerActive,
      getShelfDistance,
      onOpen,
    }) {
      if (disposed) return

      const openingSeconds = openingBook
        ? nowSeconds - openingBook.startedAt
        : 0
      const openingProgress = openingBook
        ? THREE.MathUtils.clamp(
            openingSeconds / OPEN_DURATION,
            0,
            1,
          )
        : 0
      const openingEase =
        1 - Math.pow(1 - openingProgress, 3)

      if (
        openingBook &&
        openingProgress >= OPEN_HANDOFF_PROGRESS &&
        !openingBook.fired
      ) {
        openingBook.fired = true
        openingBook.returningAt = nowSeconds
        openingBook.visual.bookmark.visible = true
        onOpen(
          openingBook.visual.nodeId,
          openingBook.visual.index,
        )
      }

      const returnSeconds =
        openingBook?.returningAt !== null &&
        openingBook?.returningAt !== undefined
          ? nowSeconds - openingBook.returningAt
          : 0
      const returnProgress =
        openingBook?.returningAt !== null &&
        openingBook?.returningAt !== undefined
          ? THREE.MathUtils.clamp(
              returnSeconds / RETURN_DURATION,
              0,
              1,
            )
          : 0
      const returnEase =
        returnProgress > 0
          ? 1 - Math.pow(1 - returnProgress, 3)
          : 0
      const ritualAmount = openingBook
        ? openingBook.returningAt !== null
          ? 1 - returnEase
          : openingEase
        : 0

      books.forEach((bookVisual) => {
        const shelfDistance = getShelfDistance(
          bookVisual.nodeId,
        )
        const isOpening =
          openingBook?.visual === bookVisual
        const isHovered = hoveredBook === bookVisual
        const isApproachedShelf =
          approachedShelfId === bookVisual.nodeId &&
          shelfDistance < 15

        const showFullDetail =
          shelfDistance < 27 || isOpening || isHovered
        const showBookBlocks =
          shelfDistance < 52 || isOpening || isHovered

        bookVisual.group.visible = showBookBlocks
        bookVisual.coverHinge.visible = showFullDetail

        positionTarget.copy(bookVisual.basePosition)

        if (isOpening) {
          // Keep the physical ritual local to the authored shelf slot.
          // The React reader owns long-form reading after the handoff.
          positionTarget.z += .34 * ritualAmount
          positionTarget.y += .08 * ritualAmount
          positionTarget.x += .035 * ritualAmount
        } else {
          positionTarget.z += isHovered
            ? .2
            : isApproachedShelf
              ? .075
              : 0
        }

        bookVisual.group.position.lerp(
          positionTarget,
          isOpening ? .2 : .12,
        )

        displacement
          .copy(bookVisual.group.position)
          .sub(bookVisual.basePosition)
        if (
          displacement.lengthSq() >
          MAX_DISPLACEMENT * MAX_DISPLACEMENT
        ) {
          displacement.setLength(MAX_DISPLACEMENT)
          bookVisual.group.position
            .copy(bookVisual.basePosition)
            .add(displacement)
        }

        const targetScale = isOpening
          ? 1 + .06 * ritualAmount
          : isHovered
            ? 1.045
            : isApproachedShelf
              ? 1.018
              : 1

        scaleTarget.setScalar(targetScale)
        bookVisual.group.scale.lerp(
          scaleTarget,
          isOpening ? .18 : .1,
        )

        const targetYaw = isOpening
          ? .08 * ritualAmount
          : isHovered
            ? .025
            : isApproachedShelf
              ? .012
              : 0
        const targetPitch = isOpening
          ? -.045 * ritualAmount
          : 0

        bookVisual.group.rotation.y +=
          (targetYaw - bookVisual.group.rotation.y) * .18
        bookVisual.group.rotation.x +=
          (targetPitch - bookVisual.group.rotation.x) * .18
        bookVisual.group.rotation.z *= .84

        const targetCoverAngle = isOpening
          ? -Math.PI * .74 * ritualAmount
          : 0
        bookVisual.coverHinge.rotation.y +=
          (
            targetCoverAngle -
            bookVisual.coverHinge.rotation.y
          ) * (isOpening ? .2 : .15)
      })

      if (openingBook) {
        openingBook.visual.group.getWorldPosition(worldPosition)
        readingLight.position.copy(worldPosition)
        readingLight.intensity +=
          (2.6 - readingLight.intensity) * .1
      } else {
        readingLight.intensity *= .88
      }

      if (
        openingBook &&
        openingBook.returningAt !== null &&
        returnProgress >= 1
      ) {
        resetBook(openingBook.visual)
        openingBook = null
      } else if (
        openingBook &&
        openingBook.fired &&
        readerActive &&
        openingSeconds > 1.65
      ) {
        // Last-resort guard: the reader transition must never strand a
        // physical book outside its authored shelf slot.
        resetBook(openingBook.visual)
        openingBook = null
      }
    },

    isActive() {
      return Boolean(openingBook)
    },

    isPresenting(visual) {
      return openingBook?.visual === visual
    },

    dispose() {
      if (disposed) return
      disposed = true

      if (openingBook) {
        resetBook(openingBook.visual)
        openingBook = null
      }

      scene.remove(readingLight)
    },
  }
}
