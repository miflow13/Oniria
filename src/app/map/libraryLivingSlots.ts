import type {DevArticleSummary} from './libraryTypes'
import type {RoomShelfPlacement} from './libraryRoomLayout'
import {
  DAY_MS,
  EMERGENT_MIN_ARTICLES,
  EMERGENT_MIN_SCORE,
  normalizeTopicVitality,
  rankTopicSignals,
  stableTopicHash,
} from '@/lib/libraryTopicSignals'

export type LibrarySlotLifecycle =
  | 'dormant'
  | 'forming'
  | 'active'

export type LivingTopicSlot = {
  slotId: string
  occupancyKey: string | null
  tag: string | null
  lifecycle: LibrarySlotLifecycle
  vitality: number
  materializedAt?: string
  placement: RoomShelfPlacement
  articles: DevArticleSummary[]
}

const MAX_EMERGENT_TOPIC_SHELVES = 4
const FORMING_WINDOW_MS = DAY_MS * 7

function normalizeTag(tag: string) {
  return tag.trim().toLowerCase().replace(/^#/, '')
}

/**
 * The coordinates belong to the slot, not the shelf.
 *
 * Configured DEV tags occupy the first stable slots. Remaining slots are
 * latent space: sufficiently active tags discovered from live DEV data can
 * claim them. A shelf is therefore an occupant of a persistent spatial slot,
 * not the owner of its coordinates.
 */
export function resolveLivingTopicSlots(
  placements: RoomShelfPlacement[],
  configuredTags: string[],
  sourceArticles: DevArticleSummary[],
  now = Date.now(),
): LivingTopicSlot[] {
  const signals = rankTopicSignals(sourceArticles, now)
  const signalByTag = new Map(
    signals.map((signal) => [signal.tag, signal]),
  )
  const configured = configuredTags
    .map(normalizeTag)
    .filter(Boolean)
  const configuredSet = new Set(configured)

  const emergent = signals
    .filter(
      (signal) =>
        !configuredSet.has(signal.tag) &&
        signal.articles.length >= EMERGENT_MIN_ARTICLES &&
        signal.score >= EMERGENT_MIN_SCORE,
    )
    .slice(0, MAX_EMERGENT_TOPIC_SHELVES)

  const occupants = [
    ...configured.map((tag) => ({
      tag,
      configured: true,
      signal: signalByTag.get(tag),
    })),
    ...emergent.map((signal) => ({
      tag: signal.tag,
      configured: false,
      signal,
    })),
  ].slice(0, placements.length)

  const maximumScore = Math.max(
    1,
    ...occupants.map((occupant) => occupant.signal?.score ?? 1),
  )
  const occupantBySlot = new Map<
    number,
    (typeof occupants)[number]
  >()

  configured.slice(0, placements.length).forEach((tag, index) => {
    occupantBySlot.set(index, {
      tag,
      configured: true,
      signal: signalByTag.get(tag),
    })
  })

  const availableIndices = placements
    .map((_, index) => index)
    .filter((index) => !occupantBySlot.has(index))

  emergent.forEach((signal) => {
    if (availableIndices.length === 0) return
    const start =
      stableTopicHash(signal.tag) % availableIndices.length

    for (
      let offset = 0;
      offset < availableIndices.length;
      offset += 1
    ) {
      const slotIndex =
        availableIndices[
          (start + offset) % availableIndices.length
        ]
      if (occupantBySlot.has(slotIndex)) continue
      occupantBySlot.set(slotIndex, {
        tag: signal.tag,
        configured: false,
        signal,
      })
      break
    }
  })

  return placements.map((placement, index) => {
    const occupant = occupantBySlot.get(index)
    if (!occupant) {
      return {
        slotId: placement.slotId,
        occupancyKey: null,
        tag: null,
        lifecycle: 'dormant' as const,
        vitality: 0,
        placement,
        articles: [],
      }
    }

    const signal = occupant.signal
    const newestAt = signal?.newestAt ?? 0
    const forming =
      !occupant.configured &&
      newestAt > 0 &&
      now - newestAt <= FORMING_WINDOW_MS

    return {
      slotId: placement.slotId,
      occupancyKey: `topic:${occupant.tag}`,
      tag: occupant.tag,
      lifecycle: forming ? 'forming' : 'active',
      vitality: normalizeTopicVitality(
        signal?.score ?? 1,
        maximumScore,
      ),
      materializedAt:
        newestAt > 0
          ? new Date(newestAt).toISOString()
          : undefined,
      placement,
      articles: signal?.articles ?? [],
    }
  })
}
