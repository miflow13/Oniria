import type {DevArticleSummary} from './libraryTypes'
import type {RoomShelfPlacement} from './libraryRoomLayout'

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

type TopicSignal = {
  tag: string
  articles: DevArticleSummary[]
  score: number
  freshness: number
  engagement: number
  newestAt: number
}

const DAY_MS = 86_400_000
const MAX_EMERGENT_TOPIC_SHELVES = 4
const EMERGENT_MIN_ARTICLES = 2
const EMERGENT_MIN_SCORE = 7.5
const FORMING_WINDOW_MS = DAY_MS * 2

function normalizeTag(tag: string) {
  return tag.trim().toLowerCase().replace(/^#/, '')
}

function publishedAt(article: DevArticleSummary) {
  if (!article.published_at) return 0
  const value = Date.parse(article.published_at)
  return Number.isFinite(value) ? value : 0
}

function articleEngagement(article: DevArticleSummary) {
  return (
    (article.public_reactions_count ?? 0) +
    (article.comments_count ?? 0) * 2
  )
}

function uniqueArticles(articles: DevArticleSummary[]) {
  const seen = new Set<number>()
  return articles.filter((article) => {
    if (seen.has(article.id)) return false
    seen.add(article.id)
    return true
  })
}

function topicSignals(
  articles: DevArticleSummary[],
  now: number,
) {
  const groups = new Map<string, DevArticleSummary[]>()

  uniqueArticles(articles).forEach((article) => {
    ;(article.tag_list ?? []).forEach((rawTag) => {
      const tag = normalizeTag(rawTag)
      if (!tag) return
      const current = groups.get(tag)
      if (current) current.push(article)
      else groups.set(tag, [article])
    })
  })

  return [...groups.entries()]
    .map(([tag, taggedArticles]): TopicSignal => {
      const newestAt = taggedArticles.reduce(
        (latest, article) =>
          Math.max(latest, publishedAt(article)),
        0,
      )
      const recentWeight = taggedArticles.reduce(
        (total, article) => {
          const timestamp = publishedAt(article)
          if (!timestamp) return total
          const ageDays = Math.max(
            0,
            (now - timestamp) / DAY_MS,
          )
          if (ageDays <= 1) return total + 2.5
          if (ageDays <= 3) return total + 1.7
          if (ageDays <= 7) return total + 1
          if (ageDays <= 14) return total + .45
          return total
        },
        0,
      )
      const engagement = taggedArticles.reduce(
        (total, article) =>
          total + Math.log2(articleEngagement(article) + 1),
        0,
      )
      const score =
        taggedArticles.length * 1.8 +
        recentWeight +
        engagement * .22

      return {
        tag,
        articles: taggedArticles.sort(
          (a, b) => publishedAt(b) - publishedAt(a),
        ),
        score,
        freshness: recentWeight,
        engagement,
        newestAt,
      }
    })
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.newestAt - a.newestAt ||
        a.tag.localeCompare(b.tag),
    )
}

function normalizedVitality(
  score: number,
  maximum: number,
) {
  if (maximum <= 0) return 0
  return Math.max(0, Math.min(1, score / maximum))
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
  const signals = topicSignals(sourceArticles, now)
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

  return placements.map((placement, index) => {
    const occupant = occupants[index]
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
      vitality: normalizedVitality(
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
