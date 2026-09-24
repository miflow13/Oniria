import type {DevArticleSummary} from '@/app/map/libraryTypes'

export type TopicSignal = {
  tag: string
  articles: DevArticleSummary[]
  score: number
  freshness: number
  engagement: number
  newestAt: number
}

export const DAY_MS = 86_400_000
export const EMERGENT_MIN_ARTICLES = 2
export const EMERGENT_MIN_SCORE = 5.5

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

export function rankTopicSignals(
  articles: DevArticleSummary[],
  now = Date.now(),
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

export function stableTopicHash(value: string) {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

export function normalizeTopicVitality(
  score: number,
  maximumScore: number,
) {
  if (maximumScore <= 0) return 0
  return Math.max(0, Math.min(1, score / maximumScore))
}

export function topicQualifies(signal: TopicSignal | undefined) {
  return Boolean(
    signal &&
      signal.articles.length >= EMERGENT_MIN_ARTICLES &&
      signal.score >= EMERGENT_MIN_SCORE,
  )
}
