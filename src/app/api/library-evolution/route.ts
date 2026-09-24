import {NextRequest, NextResponse} from 'next/server'
import type {DevArticleSummary} from '@/app/map/libraryTypes'
import {roomShelfPlacements} from '@/app/map/libraryRoomLayout'
import {
  mergeLibraryWorldConfig,
  type LibrarySlotStateConfig,
} from '@/lib/libraryWorldConfig'
import {evolveTopicSlots} from '@/lib/libraryEvolution'
import {rankTopicSignals} from '@/lib/libraryTopicSignals'
import {hasSanityConfig} from '@/sanity/env'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const runtime = 'nodejs'

const DEV_BASE = 'https://dev.to/api'
const FOREM_ACCEPT = 'application/vnd.forem.api-v1+json'
const MIN_EVOLUTION_INTERVAL_MS = 20 * 60 * 1000

function authorized(request: NextRequest) {
  if (
    process.env.NODE_ENV !== 'production' &&
    !process.env.VERCEL_ENV
  ) {
    return true
  }

  const cronSecret = process.env.CRON_SECRET?.trim()
  const manualKey =
    process.env.LIBRARY_EVOLUTION_KEY?.trim()
  const authorization =
    request.headers.get('authorization')?.trim()
  const suppliedManual =
    request.headers
      .get('x-oniria-evolution-key')
      ?.trim()

  return Boolean(
    (cronSecret &&
      authorization === `Bearer ${cronSecret}`) ||
      (manualKey && suppliedManual === manualKey),
  )
}

function normalizeTagList(value: unknown, fallback?: unknown) {
  const source = value ?? fallback
  if (Array.isArray(source)) {
    return source
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim().replace(/^#/, ''))
      .filter(Boolean)
  }
  if (typeof source === 'string') {
    return source
      .split(',')
      .map((item) => item.trim().replace(/^#/, ''))
      .filter(Boolean)
  }
  return []
}

function normalizeArticle(value: unknown): DevArticleSummary | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  const id = Number(record.id)
  const title =
    typeof record.title === 'string' ? record.title : ''
  const user =
    record.user && typeof record.user === 'object'
      ? (record.user as Record<string, unknown>)
      : {}

  if (!Number.isFinite(id) || !title) return null

  return {
    ...(record as unknown as DevArticleSummary),
    id,
    title,
    tag_list: normalizeTagList(record.tag_list, record.tags),
    user: {
      name:
        typeof user.name === 'string' ? user.name : '',
      username:
        typeof user.username === 'string'
          ? user.username
          : 'unknown',
      profile_image:
        typeof user.profile_image === 'string'
          ? user.profile_image
          : undefined,
      profile_image_90:
        typeof user.profile_image_90 === 'string'
          ? user.profile_image_90
          : undefined,
    },
  }
}

async function devFetchArticles(path: string) {
  const response = await fetch(DEV_BASE + path, {
    cache: 'no-store',
    headers: {
      accept: FOREM_ACCEPT,
      'user-agent':
        'Oniria-DEV-Library/0.1 (+https://github.com/miflow13/Oniria)',
    },
    signal: AbortSignal.timeout(12_000),
  })
  if (!response.ok) {
    throw new Error(
      `DEV API ${response.status}: ${response.statusText}`,
    )
  }
  const payload = (await response.json()) as unknown
  if (!Array.isArray(payload)) return []
  return payload
    .map(normalizeArticle)
    .filter(
      (article): article is DevArticleSummary =>
        Boolean(article),
    )
}

async function loadDevSnapshot() {
  const pages = await Promise.all([
    devFetchArticles('/articles?per_page=100&page=1'),
    devFetchArticles('/articles?per_page=100&page=2'),
    devFetchArticles(
      '/articles?per_page=100&page=1&top=7',
    ),
  ])
  const seen = new Set<number>()
  return pages.flat().filter((article) => {
    if (seen.has(article.id)) return false
    seen.add(article.id)
    return true
  })
}

function latestEvolutionAt(states: LibrarySlotStateConfig[]) {
  return states.reduce((latest, state) => {
    if (!state.updatedAt) return latest
    const value = Date.parse(state.updatedAt)
    return Number.isFinite(value)
      ? Math.max(latest, value)
      : latest
  }, 0)
}

function historyWithKeys(
  history: LibrarySlotStateConfig['history'],
) {
  return history.map((entry, index) => ({
    _key:
      [
        String(Date.parse(entry.at) || 0),
        entry.event,
        index,
      ]
        .join('-')
        .replace(/[^a-zA-Z0-9_-]/g, '-')
        .slice(0, 96),
    ...entry,
  }))
}

function slotDocument(state: LibrarySlotStateConfig) {
  return {
    _id:
      'librarySlotState.' +
      state.districtId.replace(/[^a-zA-Z0-9_-]/g, '-') +
      '.' +
      state.slotId.replace(/[^a-zA-Z0-9_-]/g, '-'),
    _type: 'librarySlotState',
    slotKey: state.slotKey,
    districtId: state.districtId,
    roomSlot: state.roomSlot,
    slotId: state.slotId,
    ...(state.zone ? {zone: state.zone} : {}),
    configured: state.configured,
    ...(state.occupantKey
      ? {occupantKey: state.occupantKey}
      : {}),
    ...(state.topic ? {topic: state.topic} : {}),
    lifecycle: state.lifecycle,
    vitality: state.vitality,
    signalScore: state.signalScore,
    articleCount: state.articleCount,
    risingChecks: state.risingChecks,
    lowChecks: state.lowChecks,
    ...(state.materializedAt
      ? {materializedAt: state.materializedAt}
      : {}),
    ...(state.lastActiveAt
      ? {lastActiveAt: state.lastActiveAt}
      : {}),
    ...(state.coolingStartedAt
      ? {coolingStartedAt: state.coolingStartedAt}
      : {}),
    ...(state.updatedAt
      ? {updatedAt: state.updatedAt}
      : {}),
    history: historyWithKeys(state.history),
  }
}

async function evolve(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json(
      {error: 'library-evolution-not-authorized'},
      {status: 401},
    )
  }

  const token = process.env.SANITY_API_WRITE_TOKEN
  if (!hasSanityConfig || !token) {
    return NextResponse.json(
      {error: 'sanity-write-unavailable'},
      {status: 503},
    )
  }

  try {
    const [{client}, queries] = await Promise.all([
      import('@/sanity/lib/client'),
      import('@/sanity/lib/queries'),
    ])
    const readClient = client.withConfig({
      useCdn: false,
      perspective: 'published',
      token,
    })
    const rawWorld = await readClient.fetch(
      queries.LIBRARY_WORLD_QUERY,
      {},
      {cache: 'no-store'},
    )
    const world = mergeLibraryWorldConfig(rawWorld)
    const topicDistrictIndex = world.districts.findIndex(
      (district) =>
        district.enabled &&
        (district.sourceMode === 'topics' ||
          district.sourceMode === 'tagged'),
    )
    const topicDistrict =
      topicDistrictIndex >= 0
        ? world.districts[topicDistrictIndex]
        : null

    if (!topicDistrict) {
      return NextResponse.json(
        {error: 'topics-district-unavailable'},
        {status: 409},
      )
    }

    const force =
      request.nextUrl.searchParams.get('force') === '1'
    const nowMs = Date.now()
    const lastRunAt = latestEvolutionAt(world.slotStates)
    if (
      !force &&
      lastRunAt > 0 &&
      nowMs - lastRunAt < MIN_EVOLUTION_INTERVAL_MS
    ) {
      return NextResponse.json({
        ok: true,
        skipped: true,
        reason: 'evolution-ran-recently',
        lastRunAt: new Date(lastRunAt).toISOString(),
      })
    }

    const articles = await loadDevSnapshot()
    if (articles.length === 0) {
      return NextResponse.json(
        {error: 'dev-snapshot-empty'},
        {status: 502},
      )
    }

    const signals = rankTopicSignals(articles, nowMs)
    const placements = roomShelfPlacements(
      topicDistrict,
      topicDistrictIndex,
    )
    const result = evolveTopicSlots({
      district: topicDistrict,
      placements,
      currentStates: world.slotStates,
      signals,
      now: new Date(nowMs).toISOString(),
    })

    let transaction = readClient.transaction()
    result.states.forEach((state) => {
      transaction = transaction.createOrReplace(
        slotDocument(state),
      )
    })
    await transaction.commit()

    return NextResponse.json(
      {
        ok: true,
        skipped: false,
        evaluatedAt: new Date(nowMs).toISOString(),
        sampleSize: articles.length,
        signalCount: signals.length,
        occupied: result.occupied,
        dormant: result.dormant,
        events: result.events,
        leadingTopics: signals.slice(0, 10).map(
          (signal) => ({
            tag: signal.tag,
            score: Number(signal.score.toFixed(2)),
            articles: signal.articles.length,
          }),
        ),
      },
      {
        headers: {
          'cache-control': 'no-store',
        },
      },
    )
  } catch (error) {
    console.error('Library evolution failed', error)
    return NextResponse.json(
      {
        error: 'library-evolution-failed',
        message:
          error instanceof Error
            ? error.message
            : 'Unknown evolution failure',
      },
      {status: 500},
    )
  }
}

export async function GET(request: NextRequest) {
  return evolve(request)
}

export async function POST(request: NextRequest) {
  return evolve(request)
}
