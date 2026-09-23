'use client'

import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import DreamWorld3D, {
  type DreamWorldEdge,
  type DreamWorldNode,
  type LibraryMovementMode,
  type LibraryReadingBook,
} from './DreamWorld3D'
import type {DreamQuality} from './dreamworld/quality'
import {
  DEFAULT_LIBRARY_WORLD_CONFIG,
  districtForTags,
  packLibraryDistricts,
  type LibraryDistrictConfig,
  type LibraryWorldConfig,
} from '@/lib/libraryWorldConfig'
import type {
  DevArticle,
  DevArticleSummary,
  DevBootstrap,
  LibraryShelf,
  LibraryShelfKind,
} from './libraryTypes'
import styles from './library.module.css'
import {
  archiveShelfPlacement,
  resolveArchiveShelfClearance,
  type ArchiveShelfPlacement,
} from './libraryLayout'

const DEFAULT_USERNAME = 'mikachu'
const QUALITY: DreamQuality = 'cinematic'
const CATALOG_PAGE_SIZE = 100
const CATALOG_BOOKS_PER_SHELF = 9
const DISTRICT_RENDERED_SHELF_LIMIT = 4
const DISTRICT_VISIBLE_ARTICLE_CAPACITY =
  DISTRICT_RENDERED_SHELF_LIMIT * CATALOG_BOOKS_PER_SHELF
const DISTRICT_SHELF_PAIR_OFFSETS = [-.68, .68] as const

const SHELF_ACCENTS: Record<LibraryShelfKind, string> = {
  featured: '#8c7cff',
  latest: '#65d4df',
  mine: '#d6a7ff',
  catalog: '#6f8dff',
  topics: '#cf8cff',
  creators: '#80d9c8',
  search: '#f2c67d',
}

function uniqueArticles(...groups: DevArticleSummary[][]) {
  const seen = new Set<number>()
  const result: DevArticleSummary[] = []
  groups.flat().forEach((article) => {
    if (seen.has(article.id)) return
    seen.add(article.id)
    result.push(article)
  })
  return result
}

function makeShelf(
  id: string,
  title: string,
  subtitle: string,
  kind: LibraryShelfKind,
  placement: ArchiveShelfPlacement,
  articles: DevArticleSummary[],
): LibraryShelf {
  return {
    id,
    title,
    subtitle,
    kind,
    accent: SHELF_ACCENTS[kind],
    world: placement.world,
    yaw: placement.yaw,
    pathBay: placement.pathBay,
    districtId: placement.districtId,
    articles,
  }
}

function nodeCategory(kind: LibraryShelfKind) {
  if (kind === 'featured' || kind === 'catalog') return 'object' as const
  if (kind === 'latest' || kind === 'search') return 'action' as const
  if (kind === 'mine' || kind === 'creators') return 'person' as const
  if (kind === 'topics') return 'feeling' as const
  return 'place' as const
}

function shelfIcon(kind: LibraryShelfKind) {
  if (kind === 'featured') return '★'
  if (kind === 'latest') return '✦'
  if (kind === 'mine') return '@'
  if (kind === 'topics') return '#'
  if (kind === 'creators') return '◎'
  if (kind === 'search') return '⌕'
  return '▥'
}

function cleanMarkdown(markdown: string | undefined) {
  if (!markdown) return ''
  return markdown
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/[>*_~`]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function devImageProxyUrl(
  primary: string | null | undefined,
  fallback?: string | null,
  variant: 'thumb' | 'full' = 'full',
) {
  const source = primary ?? fallback
  if (!source) return undefined

  let url =
    '/api/devto?mode=image&variant=' +
    variant +
    '&url=' +
    encodeURIComponent(source)

  if (primary && fallback && fallback !== primary) {
    url += '&fallback=' + encodeURIComponent(fallback)
  }

  return url
}

function sanitizeArticleHtml(
  html: string | undefined,
  articleUrl: string | undefined,
) {
  if (!html || typeof DOMParser === 'undefined') return ''

  const document = new DOMParser().parseFromString(
    html,
    'text/html',
  )
  const allowedTags = new Set([
    'p',
    'br',
    'hr',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'strong',
    'b',
    'em',
    'i',
    's',
    'del',
    'blockquote',
    'pre',
    'code',
    'ul',
    'ol',
    'li',
    'a',
    'img',
    'figure',
    'figcaption',
    'details',
    'summary',
    'table',
    'thead',
    'tbody',
    'tr',
    'th',
    'td',
  ])
  const destructiveTags = new Set([
    'script',
    'style',
    'iframe',
    'object',
    'embed',
    'svg',
    'form',
    'input',
    'button',
    'textarea',
    'select',
    'option',
    'link',
    'meta',
  ])

  Array.from(document.body.querySelectorAll('*')).forEach(
    (element) => {
      const tag = element.tagName.toLowerCase()

      if (destructiveTags.has(tag)) {
        element.remove()
        return
      }

      if (!allowedTags.has(tag)) {
        element.replaceWith(...Array.from(element.childNodes))
        return
      }

      const allowedAttributes =
        tag === 'a'
          ? new Set(['href', 'title'])
          : tag === 'img'
            ? new Set([
                'src',
                'alt',
                'title',
                'width',
                'height',
              ])
            : tag === 'code'
              ? new Set(['class'])
              : new Set<string>()

      Array.from(element.attributes).forEach((attribute) => {
        if (!allowedAttributes.has(attribute.name.toLowerCase())) {
          element.removeAttribute(attribute.name)
        }
      })

      if (tag === 'a') {
        const rawHref = element.getAttribute('href')
        if (!rawHref) return

        try {
          const href = new URL(
            rawHref,
            articleUrl ?? 'https://dev.to/',
          )
          if (href.protocol !== 'https:' && href.protocol !== 'http:') {
            element.removeAttribute('href')
            return
          }
          element.setAttribute('href', href.href)
          element.setAttribute('target', '_blank')
          element.setAttribute('rel', 'noreferrer noopener')
        } catch {
          element.removeAttribute('href')
        }
      }

      if (tag === 'img') {
        const rawSrc = element.getAttribute('src')
        if (!rawSrc) {
          element.remove()
          return
        }

        try {
          const src = new URL(
            rawSrc,
            articleUrl ?? 'https://dev.to/',
          )
          if (src.protocol !== 'https:' && src.protocol !== 'http:') {
            element.remove()
            return
          }
          element.setAttribute('src', src.href)
          element.setAttribute('loading', 'lazy')
          element.setAttribute('decoding', 'async')
          element.setAttribute('referrerpolicy', 'no-referrer')
        } catch {
          element.remove()
        }
      }
    },
  )

  return document.body.innerHTML
}

export default function DevLibraryMap() {
  const [bootstrap, setBootstrap] = useState<DevBootstrap | null>(null)
  const [catalog, setCatalog] = useState<DevArticleSummary[]>([])
  const [catalogHasMore, setCatalogHasMore] = useState(true)
  const [catalogLoading, setCatalogLoading] = useState(false)
  const catalogNextPageRef = useRef(1)
  const catalogLoadingRef = useRef(false)
  const catalogHasMoreRef = useRef(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [article, setArticle] = useState<DevArticle | null>(null)
  const [routeLoading, setRouteLoading] = useState(false)
  const [query, setQuery] = useState('')
  const [searchResults, setSearchResults] = useState<DevArticleSummary[]>([])
  const [dynamicArticles, setDynamicArticles] = useState<DevArticleSummary[]>([])
  const [dynamicTitle, setDynamicTitle] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [flightMode, setFlightMode] = useState(true)
  const [movementMode, setMovementMode] =
    useState<LibraryMovementMode>('walk')
  const [soundEnabled, setSoundEnabled] = useState(false)
  const [worldConfig, setWorldConfig] =
    useState<LibraryWorldConfig>(DEFAULT_LIBRARY_WORLD_CONFIG)
  const [worldSyncing, setWorldSyncing] = useState(false)
  const [districtSamples, setDistrictSamples] = useState<
    Record<string, DevArticleSummary[]>
  >({})
  const [readingBook, setReadingBook] =
    useState<LibraryReadingBook | null>(null)
  const sanitizedArticleHtml = useMemo(
    () =>
      sanitizeArticleHtml(
        article?.body_html,
        article?.url,
      ),
    [article?.body_html, article?.url],
  )
  const articleHeroImage = useMemo(
    () =>
      devImageProxyUrl(
        article?.cover_image,
        article?.social_image,
        'full',
      ),
    [article?.cover_image, article?.social_image],
  )
  const [navigation, setNavigation] = useState<{
    nearestId: string | null
    routeTargetId: string | null
  }>({
    nearestId: null,
    routeTargetId: null,
  })

  const packedWorldConfig = useMemo<LibraryWorldConfig>(
    () => ({
      ...worldConfig,
      districts: packLibraryDistricts(
        worldConfig.districts.length > 0
          ? worldConfig.districts
          : DEFAULT_LIBRARY_WORLD_CONFIG.districts,
      ),
    }),
    [worldConfig],
  )

  const loadMoreCatalog = useCallback(async () => {
    if (
      catalogLoadingRef.current ||
      !catalogHasMoreRef.current
    ) {
      return
    }

    catalogLoadingRef.current = true
    setCatalogLoading(true)
    const page = catalogNextPageRef.current

    try {
      const response = await fetch(
        '/api/devto?mode=catalog&start_page=' +
          page +
          '&pages=1&per_page=' +
          CATALOG_PAGE_SIZE,
      )
      if (!response.ok) {
        throw new Error('Could not extend DEV catalogue')
      }

      const payload = (await response.json()) as {
        articles?: DevArticleSummary[]
        nextPage?: number
        hasMore?: boolean
      }
      const incoming = payload.articles ?? []

      setCatalog((current) => {
        const seen = new Set(current.map((article) => article.id))
        return [
          ...current,
          ...incoming.filter((article) => {
            if (seen.has(article.id)) return false
            seen.add(article.id)
            return true
          }),
        ]
      })

      catalogNextPageRef.current =
        payload.nextPage ?? page + 1
      const hasMore =
        Boolean(payload.hasMore) && incoming.length > 0
      catalogHasMoreRef.current = hasMore
      setCatalogHasMore(hasMore)
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Could not extend DEV catalogue',
      )
    } finally {
      catalogLoadingRef.current = false
      setCatalogLoading(false)
    }
  }, [])

  const refreshWorldConfig = useCallback(
    async (
      applyDefaultMovement = false,
      silent = false,
    ) => {
      try {
        if (!silent) setWorldSyncing(true)
        const response = await fetch(
          '/api/library-world?preview=1&_=' + Date.now(),
          {
            cache: 'no-store',
            headers: {
              'cache-control': 'no-cache',
            },
          },
        )
        if (!response.ok) return
        const payload = (await response.json()) as LibraryWorldConfig
        setWorldConfig((current) =>
          JSON.stringify(current) === JSON.stringify(payload)
            ? current
            : payload,
        )
        if (
          !silent &&
          payload.sanitySyncIssue === 'missing-preview-token'
        ) {
          setError(
            'Sanity is connected, but this server has no draft-preview token. Publish the Studio changes or add SANITY_API_READ_TOKEN to the running environment.',
          )
        }
        if (applyDefaultMovement) {
          setMovementMode(payload.defaultMovement)
        }
      } catch {
        // The fallback world config remains active if Sanity is unavailable.
      } finally {
        if (!silent) setWorldSyncing(false)
      }
    },
    [],
  )

  useEffect(() => {
    let cancelled = false

    void refreshWorldConfig(true)

    async function load() {
      try {
        setLoading(true)
        const bootstrapResponse = await fetch(
          '/api/devto?mode=bootstrap&username=' +
            encodeURIComponent(DEFAULT_USERNAME),
        )

        if (!bootstrapResponse.ok) {
          throw new Error('Could not load DEV library')
        }

        const bootstrapPayload =
          (await bootstrapResponse.json()) as DevBootstrap

        if (cancelled) return
        setBootstrap(bootstrapPayload)
        void loadMoreCatalog()
      } catch (caught) {
        if (cancelled) return
        setError(
          caught instanceof Error
            ? caught.message
            : 'Could not load DEV library',
        )
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [loadMoreCatalog, refreshWorldConfig])

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        void refreshWorldConfig(false, true)
      }
    }, 4000)

    const refreshOnFocus = () => {
      void refreshWorldConfig(false, true)
    }

    window.addEventListener('focus', refreshOnFocus)
    document.addEventListener(
      'visibilitychange',
      refreshOnFocus,
    )

    return () => {
      window.clearInterval(interval)
      window.removeEventListener('focus', refreshOnFocus)
      document.removeEventListener(
        'visibilitychange',
        refreshOnFocus,
      )
    }
  }, [refreshWorldConfig])

  useEffect(() => {
    let cancelled = false

    const taggedDistricts = worldConfig.districts.filter(
      (district) =>
        district.enabled &&
        district.id !== 'front-page' &&
        district.devTags.length > 0,
    )

    if (taggedDistricts.length === 0) {
      setDistrictSamples({})
      return () => {
        cancelled = true
      }
    }

    async function populateDistricts() {
      const entries = await Promise.all(
        taggedDistricts.map(async (district) => {
          const seedTags = district.devTags.slice(0, 2)
          if (seedTags.length === 0) {
            return [district.id, []] as const
          }

          try {
            const responses = await Promise.all(
              seedTags.map((tag) =>
                fetch(
                  '/api/devto?mode=tag&tag=' +
                    encodeURIComponent(tag),
                ),
              ),
            )
            const payloads = await Promise.all(
              responses.map(async (response) => {
                if (!response.ok) return []
                const payload = (await response.json()) as {
                  articles?: DevArticleSummary[]
                }
                return payload.articles ?? []
              }),
            )

            return [
              district.id,
              uniqueArticles(...payloads),
            ] as const
          } catch {
            return [district.id, []] as const
          }
        }),
      )

      if (cancelled) return
      setDistrictSamples(Object.fromEntries(entries))
    }

    void populateDistricts()

    return () => {
      cancelled = true
    }
  }, [worldConfig.districts])

  const resumeFirstPersonControls = useCallback(() => {
    const canvas = document.querySelector<HTMLCanvasElement>(
      'canvas[data-oniria-library-fps="true"]',
    )
    if (!canvas) return

    canvas.focus({preventScroll: true})
    if (document.pointerLockElement !== canvas) {
      void canvas.requestPointerLock()
    }
  }, [])

  const closeArticleReader = useCallback(() => {
    // Pointer lock must be requested directly inside the trusted keyboard/click
    // gesture. Doing this before the React state update keeps the browser user
    // activation intact and restores FPS mouse-look as the reader disappears.
    resumeFirstPersonControls()
    setArticle(null)
    setReadingBook(null)
  }, [resumeFirstPersonControls])

  useEffect(() => {
    if (!article) return

    const closeBookWithE = (event: KeyboardEvent) => {
      if (event.code !== 'KeyE') return
      event.preventDefault()
      event.stopPropagation()
      event.stopImmediatePropagation()
      closeArticleReader()
    }

    window.addEventListener('keydown', closeBookWithE, true)
    return () =>
      window.removeEventListener('keydown', closeBookWithE, true)
  }, [article, closeArticleReader])

  const creators = useMemo(() => {
    if (!bootstrap) return []
    const counts = new Map<
      string,
      {name: string; username: string; count: number}
    >()

    uniqueArticles(
      bootstrap.feed,
      bootstrap.latest,
      bootstrap.profileArticles,
    ).forEach((item) => {
      const current = counts.get(item.user.username)
      if (current) {
        current.count += 1
      } else {
        counts.set(item.user.username, {
          name: item.user.name,
          username: item.user.username,
          count: 1,
        })
      }
    })

    return [...counts.values()]
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)
  }, [bootstrap])

  const shelves = useMemo(() => {
    if (!bootstrap) return []

    const creatorCandidates = uniqueArticles(
      bootstrap.feed,
      bootstrap.latest,
      bootstrap.profileArticles,
      catalog,
    )
    const creatorPreview = creators
      .map((creator) =>
        creatorCandidates.find(
          (article) => article.user.username === creator.username,
        ),
      )
      .filter(
        (article): article is DevArticleSummary => Boolean(article),
      )
      .slice(0, CATALOG_BOOKS_PER_SHELF)

    const used = new Set<number>()
    const takeFresh = (
      source: DevArticleSummary[],
      count: number,
    ) => {
      const picked: DevArticleSummary[] = []
      for (const item of source) {
        if (used.has(item.id)) continue
        used.add(item.id)
        picked.push(item)
        if (picked.length >= count) break
      }
      return picked
    }

    const curatorIds = new Set(
      worldConfig.curatedArticles
        .filter((item) => item.featured)
        .map((item) => item.devArticleId),
    )
    const allKnownArticles = uniqueArticles(
      bootstrap.feed,
      bootstrap.latest,
      bootstrap.profileArticles,
      catalog,
    )
    const curatorPicks = allKnownArticles.filter((item) =>
      curatorIds.has(item.id),
    )

    const featured = takeFresh(
      [...curatorPicks, ...bootstrap.feed],
      9,
    )
    const latest = takeFresh(bootstrap.latest, 9)
    const mine = takeFresh(bootstrap.profileArticles, 9)
    const remaining = catalog.filter((item) => !used.has(item.id))
    const districts = packedWorldConfig.districts

    const result: LibraryShelf[] = [
      makeShelf(
        'shelf:featured',
        'Featured',
        'popular this week',
        'featured',
        archiveShelfPlacement(
          'shelf:featured',
          -.45,
          -1,
          {laneBias: 2.2, heightJitterScale: 0, lateralJitterScale: 0, alongJitterScale: 0, lookAheadScale: 0, yawJitterScale: 0},
          districts,
        ),
        featured,
      ),
      makeShelf(
        'shelf:new',
        'New',
        'freshly published',
        'latest',
        archiveShelfPlacement(
          'shelf:new',
          -.45,
          1,
          {laneBias: 2.2, heightJitterScale: 0, lateralJitterScale: 0, alongJitterScale: 0, lookAheadScale: 0, yawJitterScale: 0},
          districts,
        ),
        latest,
      ),
      makeShelf(
        'shelf:mine',
        bootstrap.profile
          ? '@' + bootstrap.profile.username
          : 'My DEV',
        'creator shelf',
        'mine',
        archiveShelfPlacement(
          'shelf:mine',
          .05,
          -1,
          {laneBias: 2.75, heightJitterScale: 0, lateralJitterScale: 0, alongJitterScale: 0, lookAheadScale: 0, yawJitterScale: 0},
          districts,
        ),
        mine,
      ),
      makeShelf(
        'shelf:topics',
        'Topics',
        'choose a DEV tag',
        'topics',
        archiveShelfPlacement(
          'shelf:topics',
          .05,
          1,
          {laneBias: 2.75, heightJitterScale: 0, lateralJitterScale: 0, alongJitterScale: 0, lookAheadScale: 0, yawJitterScale: 0},
          districts,
        ),
        dynamicTitle?.startsWith('#') ? dynamicArticles : [],
      ),
      makeShelf(
        'shelf:creators',
        'Creators',
        'browse author shelves',
        'creators',
        archiveShelfPlacement(
          'shelf:creators',
          .52,
          -1,
          {laneBias: 3.1, heightJitterScale: 0, lateralJitterScale: 0, alongJitterScale: 0, lookAheadScale: 0, yawJitterScale: 0},
          districts,
        ),
        dynamicTitle?.startsWith('@')
          ? dynamicArticles
          : creatorPreview,
      ),
    ]

    if (searchResults.length) {
      result.push(
        makeShelf(
          'shelf:search',
          'Search',
          query || 'search results',
          'search',
          archiveShelfPlacement(
            'shelf:search',
            .52,
            1,
            {laneBias: 3.1, heightJitterScale: 0, lateralJitterScale: 0, alongJitterScale: 0, lookAheadScale: 0, yawJitterScale: 0},
            districts,
          ),
          searchResults.slice(0, CATALOG_BOOKS_PER_SHELF),
        ),
      )
    }

    // Utility shelves belong to the arrival foyer, not FRONT PAGE.
    // Giving them a separate layout identity prevents the clearance resolver
    // from treating them as part of the Featured district and nudging them
    // back into its plaza.
    result.forEach((shelf) => {
      if (shelf.kind !== 'catalog') {
        shelf.districtId = 'arrival'
      }
    })

    const fallbackDistrict =
      districts.find((district) => district.id === 'deep-stacks') ??
      districts.find((district) => district.id === 'archive-2026') ??
      districts.at(-1) ??
      DEFAULT_LIBRARY_WORLD_CONFIG.districts[0]

    const articlesByDistrict = new Map<
      string,
      DevArticleSummary[]
    >()
    districts.forEach((district) => {
      articlesByDistrict.set(district.id, [])
    })

    // FRONT PAGE is a large virtual collection, but its physical
    // footprint is intentionally fixed just like every other district.
    // The 3D plaza must not expand as the streamed catalogue grows.
    const frontPageDistrict = districts.find(
      (district) => district.id === 'front-page',
    )
    if (frontPageDistrict) {
      articlesByDistrict.set(
        frontPageDistrict.id,
        uniqueArticles(
          bootstrap.feed,
          bootstrap.latest,
          catalog,
        ),
      )
    }

    // Seed every semantic district from its Sanity-authored primary DEV tag.
    // The generic catalogue stream below can then deepen those districts.
    districts.forEach((district) => {
      if (district.id === 'front-page') return
      const samples = districtSamples[district.id] ?? []
      if (samples.length === 0) return
      articlesByDistrict.set(
        district.id,
        uniqueArticles(
          articlesByDistrict.get(district.id) ?? [],
          samples,
        ),
      )
    })

    remaining.forEach((article) => {
      const district =
        districtForTags(article.tag_list ?? [], districts) ??
        fallbackDistrict
      const bucket = articlesByDistrict.get(district.id)
      if (!bucket) return

      if (!bucket.some((item) => item.id === article.id)) {
        bucket.push(article)
      }
    })

    // Deep Stacks is the chronological tail of the streamed DEV catalog.
    // Keep it independent from taxonomy matching: page 1 populates it
    // immediately, and every later catalog page pushes the visible window
    // deeper/older without ever changing the physical shelf count.
    const deepStacksDistrict = districts.find(
      (district) => district.id === 'deep-stacks',
    )
    if (deepStacksDistrict) {
      const deepCatalog = uniqueArticles(
        catalog,
        bootstrap.latest,
        bootstrap.feed,
      )
      articlesByDistrict.set(
        deepStacksDistrict.id,
        deepCatalog,
      )
    }

    districts.forEach((district) => {
      const allDistrictArticles =
        articlesByDistrict.get(district.id) ?? []
      const districtArticles =
        (district.id === 'deep-stacks' ||
          district.id === 'front-page') &&
        allDistrictArticles.length >
          DISTRICT_VISIBLE_ARTICLE_CAPACITY
          ? district.id === 'deep-stacks'
            ? allDistrictArticles.slice(
                -DISTRICT_VISIBLE_ARTICLE_CAPACITY,
              )
            : allDistrictArticles.slice(
                0,
                DISTRICT_VISIBLE_ARTICLE_CAPACITY,
              )
          : allDistrictArticles
      const availableShelfCount = Math.ceil(
        districtArticles.length / CATALOG_BOOKS_PER_SHELF,
      )
      const renderedShelfCount = Math.min(
        availableShelfCount,
        DISTRICT_RENDERED_SHELF_LIMIT,
      )

      for (
        let localIndex = 0;
        localIndex < renderedShelfCount;
        localIndex += 1
      ) {
        const offset =
          localIndex * CATALOG_BOOKS_PER_SHELF
        const shelfArticles = districtArticles.slice(
          offset,
          offset + CATALOG_BOOKS_PER_SHELF,
        )
        const side: -1 | 1 =
          localIndex % 2 === 0 ? -1 : 1
        const pairIndex = Math.floor(localIndex / 2)
        const bay =
          district.bay +
          (DISTRICT_SHELF_PAIR_OFFSETS[
            Math.min(
              pairIndex,
              DISTRICT_SHELF_PAIR_OFFSETS.length - 1,
            )
          ] ?? 0)
        const shelfId =
          'shelf:catalog:' +
          district.id +
          ':' +
          localIndex
        const totalLoaded = allDistrictArticles.length
        const shelf = makeShelf(
          shelfId,
          district.label +
            ' ' +
            String(localIndex + 1).padStart(2, '0'),
          'DEV district · ' +
            (district.devTags.length
              ? district.devTags
                  .slice(0, 3)
                  .map((tag) => '#' + tag)
                  .join(' · ')
              : 'long-tail archive') +
            (totalLoaded >
            renderedShelfCount *
              CATALOG_BOOKS_PER_SHELF
              ? ' · ' +
                totalLoaded +
                ' loaded'
              : ''),
          'catalog',
          archiveShelfPlacement(
            shelfId,
            bay,
            side,
            {
              // District bookcases are architecture, not debris: keep each
              // pair level, mirrored, and square to the boulevard.
              laneDistance: 7.7,
              heightJitterScale: 0,
              lateralJitterScale: 0,
              alongJitterScale: 0,
              lookAheadScale: 0,
              yawJitterScale: 0,
              orientationBay: district.bay,
            },
            districts,
          ),
          shelfArticles,
        )
        shelf.accent = district.accent
        shelf.districtId = district.id
        result.push(shelf)
      }
    })

    const resolvedPlacements = resolveArchiveShelfClearance(
      result.map((shelf) => ({
        world: shelf.world,
        yaw: shelf.yaw,
        pathBay: shelf.pathBay,
        districtId: shelf.districtId,
      })),
      districts,
    )

    return result.map((shelf, index) => {
      const placement = resolvedPlacements[index]
      if (!placement) return shelf

      return {
        ...shelf,
        world: placement.world,
        yaw: placement.yaw,
        pathBay: placement.pathBay,
        districtId: placement.districtId,
      }
    })
  }, [
    bootstrap,
    catalog,
    creators,
    dynamicArticles,
    dynamicTitle,
    query,
    searchResults,
    packedWorldConfig,
    districtSamples,
  ])

  const nodes = useMemo<DreamWorldNode[]>(
    () =>
      shelves.map((shelf) => ({
        _id: shelf.id,
        name: shelf.title,
        category: nodeCategory(shelf.kind),
        icon: shelfIcon(shelf.kind),
        x: 50,
        y: 50,
        frequency: Math.max(1, shelf.articles.length),
        dreamIds: [],
        libraryKind: 'shelf',
        subtitle: shelf.subtitle,
        articleCount:
          shelf.kind === 'topics'
            ? bootstrap?.tags.length ?? 0
            : shelf.kind === 'creators'
              ? creators.length
              : shelf.articles.length,
        accent: shelf.accent,
        world: shelf.world,
        libraryYaw: shelf.yaw,
        libraryPathBay: shelf.pathBay,
        libraryDistrictId: shelf.districtId,
        libraryBooks: shelf.articles.slice(0, 9).map((article) => {
          const engagement =
            (article.public_reactions_count ?? 0) +
            (article.comments_count ?? 0) * 2
          const publishedAt = article.published_at
            ? new Date(article.published_at).getTime()
            : 0
          const ageDays = publishedAt
            ? Math.max(
                0,
                (Date.now() - publishedAt) / 86_400_000,
              )
            : Infinity

          return {
            id: String(article.id),
            title: article.title,
            coverUrl: devImageProxyUrl(
              article.cover_image,
              article.social_image,
              'thumb',
            ),
            activity: Math.min(
              1,
              Math.log2(engagement + 1) / 7,
            ),
            fresh: ageDays <= 7,
          }
        }),
      })),
    [bootstrap?.tags.length, creators.length, shelves],
  )

  const edges = useMemo<DreamWorldEdge[]>(() => {
    if (nodes.length < 2) return []
    return nodes.map((node, index) => {
      const target = nodes[(index + 1) % nodes.length]
      return {
        id: 'route:' + node._id + ':' + target._id,
        source: node._id,
        target: target._id,
        weight: 2,
      }
    })
  }, [nodes])

  const selectedShelf =
    shelves.find((shelf) => shelf.id === selectedId) ?? null
  const hoveredShelf =
    shelves.find((shelf) => shelf.id === hoveredId) ?? null
  const nearestShelf =
    shelves.find((shelf) => shelf.id === navigation.nearestId) ?? null
  const routeShelf =
    shelves.find((shelf) => shelf.id === navigation.routeTargetId) ?? null
  const catalogShelfCount = shelves.filter(
    (shelf) => shelf.kind === 'catalog',
  ).length
  const lastCatalogLoadTriggerRef = useRef<string | null>(null)

  useEffect(() => {
    if (!catalogHasMore || catalogLoading || catalogShelfCount === 0) {
      return
    }

    const candidate =
      navigation.routeTargetId ?? navigation.nearestId
    if (!candidate?.startsWith('shelf:catalog:')) {
      lastCatalogLoadTriggerRef.current = null
      return
    }

    const shelf = shelves.find(
      (item) => item.id === candidate,
    )
    const deepStacksApproach =
      shelf?.districtId === 'deep-stacks'
    const isLastVisibleCatalogShelf =
      shelf &&
      shelves
        .filter((item) => item.kind === 'catalog')
        .slice(-3)
        .some((item) => item.id === shelf.id)

    if (
      deepStacksApproach ||
      isLastVisibleCatalogShelf
    ) {
      if (
        lastCatalogLoadTriggerRef.current !== candidate
      ) {
        lastCatalogLoadTriggerRef.current = candidate
        void loadMoreCatalog()
      }
      return
    }

    // Moving away from a loading edge arms the trigger again, so returning
    // to Deep Stacks fetches the next page without polling continuously.
    lastCatalogLoadTriggerRef.current = null
  }, [
    catalogHasMore,
    catalogLoading,
    catalogShelfCount,
    loadMoreCatalog,
    navigation.nearestId,
    navigation.routeTargetId,
    shelves,
  ])

  async function openArticle(summary: DevArticleSummary) {
    try {
      setRouteLoading(true)
      const response = await fetch(
        '/api/devto?mode=article&id=' + summary.id,
      )
      if (!response.ok) throw new Error('Could not open article')
      const payload = (await response.json()) as {article: DevArticle}
      setArticle(payload.article)
      document.exitPointerLock?.()
    } catch (caught) {
      setReadingBook(null)
      setError(
        caught instanceof Error
          ? caught.message
          : 'Could not open article',
      )
    } finally {
      setRouteLoading(false)
    }
  }

  async function loadTopic(tag: string) {
    try {
      setRouteLoading(true)
      const response = await fetch(
        '/api/devto?mode=tag&tag=' + encodeURIComponent(tag),
      )
      if (!response.ok) throw new Error('Could not load topic')
      const payload = (await response.json()) as {
        articles: DevArticleSummary[]
      }
      setDynamicTitle('#' + tag)
      setDynamicArticles(payload.articles ?? [])
      setSelectedId('shelf:topics')
    } catch {
      setError('Could not load topic shelf')
    } finally {
      setRouteLoading(false)
    }
  }

  async function loadCreator(username: string) {
    try {
      setRouteLoading(true)
      const response = await fetch(
        '/api/devto?mode=profile&username=' +
          encodeURIComponent(username),
      )
      if (!response.ok) throw new Error('Could not load creator')
      const payload = (await response.json()) as {
        articles: DevArticleSummary[]
      }
      setDynamicTitle('@' + username)
      setDynamicArticles(payload.articles ?? [])
      setSelectedId('shelf:creators')
    } catch {
      setError('Could not load creator shelf')
    } finally {
      setRouteLoading(false)
    }
  }

  async function submitSearch(event: FormEvent) {
    event.preventDefault()
    const value = query.trim()
    if (!value) return

    try {
      setRouteLoading(true)
      const response = await fetch(
        '/api/devto?mode=search&q=' +
          encodeURIComponent(value),
      )
      if (!response.ok) throw new Error('Could not search DEV')
      const payload = (await response.json()) as {
        articles: DevArticleSummary[]
      }
      setSearchResults(payload.articles ?? [])
      setSelectedId('shelf:search')
      document.exitPointerLock?.()
    } catch {
      setError('Could not search DEV')
    } finally {
      setRouteLoading(false)
    }
  }

  const focusedIds = useMemo(() => new Set<string>(), [])
  const relatedEdgeIds = useMemo(
    () => new Set(edges.map((edge) => edge.id)),
    [edges],
  )

  return (
    <main className={styles.page}>
      <DreamWorld3D
        nodes={nodes}
        edges={edges}
        positions={{}}
        dreams={[]}
        selectedDreamId={null}
        selectedId={selectedId}
        activeId={null}
        focusedIds={focusedIds}
        relatedEdgeIds={relatedEdgeIds}
        zoom={1}
        pan={{x: 0, y: 0}}
        quality={QUALITY}
        soundEnabled={soundEnabled}
        introStage={4}
        diveExitRequest={0}
        diveBackRequest={0}
        diveTimelineProgress={1}
        observatoryMode={false}
        flightMode={flightMode}
        libraryMovementMode={movementMode}
        libraryWorldConfig={packedWorldConfig}
        libraryReadingBook={readingBook}
        inputBlocked={Boolean(article) || Boolean(readingBook)}
        onZoomChange={() => {}}
        onPanChange={() => {}}
        onNodeHover={(node) => setHoveredId(node?._id ?? null)}
        onNodeSelect={(node) => {
          setSelectedId(node._id)
          document.exitPointerLock?.()
        }}
        onBookSelect={(nodeId, bookIndex) => {
          const shelf = shelves.find((item) => item.id === nodeId)
          const selectedBook = shelf?.articles[bookIndex]
          if (selectedBook) {
            setReadingBook({nodeId, index: bookIndex})
            void openArticle(selectedBook)
          }
        }}
        onFlightNavigationChange={setNavigation}
        onBackgroundClick={() => setSelectedId(null)}
        onProjectionChange={() => {}}
        onDiveStateChange={() => {}}
        onDiveDreamChange={() => {}}
        onFlightModeChange={setFlightMode}
        onLibraryMovementModeChange={setMovementMode}
      />

      <header className={styles.topbar}>
        <div className={styles.brand}>
          <span>DEV</span>
          <strong>Library</strong>
          <small>cinematic webspace</small>
        </div>

        <form className={styles.search} onSubmit={submitSearch}>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search DEV..."
            aria-label="Search DEV articles"
          />
          <button type="submit" disabled={routeLoading}>
            Search
          </button>
        </form>

        <div className={styles.navigationState}>
          <button
            type="button"
            className={styles.soundToggle}
            data-active={worldConfig.source === 'sanity' ? 'true' : 'false'}
            onClick={() => void refreshWorldConfig(false)}
            disabled={worldSyncing}
            title={
              worldConfig.syncMode === 'drafts'
                ? 'Reload saved Sanity drafts into the spatial archive' +
                  (worldConfig.sanityRevision
                    ? ' · latest ' + worldConfig.sanityRevision
                    : '')
                : worldConfig.sanitySyncIssue ===
                    'missing-preview-token'
                  ? 'Draft preview token is not loaded by the running dev server. Restart npm run dev after setting SANITY_API_WRITE_TOKEN or SANITY_API_READ_TOKEN.'
                  : 'Reload the published spatial archive configuration from Sanity'
            }
          >
            {worldSyncing
              ? '◌ SYNCING'
              : worldConfig.source === 'sanity'
                ? worldConfig.syncMode === 'drafts'
                  ? '◉ SANITY DRAFT LIVE' +
                    (worldConfig.sanityRevision
                      ? ' · ' +
                        worldConfig.sanityRevision.slice(-7)
                      : '')
                  : worldConfig.sanitySyncIssue ===
                      'missing-preview-token'
                    ? '⚠ DRAFT TOKEN MISSING'
                    : '◉ SANITY PUBLISHED'
                : '○ LOCAL MODEL'}
          </button>
          <button
            type="button"
            className={styles.soundToggle}
            data-active={soundEnabled ? 'true' : 'false'}
            onClick={() => {
              const next = !soundEnabled
              setSoundEnabled(next)
              if (next) {
                window.dispatchEvent(
                  new Event('oniria:library-audio-enable'),
                )
              }
            }}
            aria-pressed={soundEnabled}
            aria-label={
              soundEnabled
                ? 'Mute library ambience'
                : 'Enable library ambience'
            }
          >
            {soundEnabled ? '◉ SOUND' : '○ SOUND'}
          </button>
          <span className={styles.navigationLabel}>
            {selectedShelf ? 'INSPECTING' : 'YOU ARE NEAR'}
          </span>
          <strong>
            {selectedShelf?.title ??
              hoveredShelf?.title ??
              nearestShelf?.title ??
              'Open space'}
          </strong>
          {routeShelf ? (
            <small className={styles.routeActive}>
              {movementMode === 'fly'
                ? 'R ROUTE → ' + routeShelf.title
                : 'G · WALK · switch to FLY for auto-route'}
            </small>
          ) : (
            <small>
              G · {movementMode === 'walk' ? 'WALK' : 'FLY'} · WASD move
              · E inspect / close book
              {movementMode === 'fly' ? ' · R auto-route' : ''}
              {catalogLoading
                ? ' · extending catalogue…'
                : catalogHasMore
                  ? ' · ' +
                    catalog.length +
                    ' catalogue articles loaded'
                  : ' · catalogue end reached'}
            </small>
          )}
        </div>
      </header>

      {loading && (
        <div className={styles.loading}>
          <span>✦</span>
          <strong>Building the floating library…</strong>
        </div>
      )}

      {error && (
        <button
          className={styles.error}
          onClick={() => setError(null)}
        >
          {error} · dismiss
        </button>
      )}

      {selectedShelf && !article && (
        <aside className={styles.shelfPanel}>
          <button
            className={styles.close}
            onClick={() => setSelectedId(null)}
            aria-label="Close shelf"
          >
            ×
          </button>

          <p className={styles.eyebrow}>Floating shelf</p>
          <h1>{selectedShelf.title}</h1>
          <p className={styles.subtitle}>
            {dynamicTitle &&
            (selectedShelf.kind === 'topics' ||
              selectedShelf.kind === 'creators')
              ? dynamicTitle
              : selectedShelf.subtitle}
          </p>

          {selectedShelf.kind === 'topics' && bootstrap && (
            <div className={styles.chips}>
              {bootstrap.tags.slice(0, 12).map((tag) => (
                <button
                  key={tag.name}
                  onClick={() => void loadTopic(tag.name)}
                >
                  #{tag.name}
                </button>
              ))}
            </div>
          )}

          {selectedShelf.kind === 'creators' && (
            <div className={styles.chips}>
              {creators.map((creator) => (
                <button
                  key={creator.username}
                  onClick={() =>
                    void loadCreator(creator.username)
                  }
                >
                  @{creator.username}
                </button>
              ))}
            </div>
          )}

          <div className={styles.bookList}>
            {selectedShelf.articles.length === 0 ? (
              <p className={styles.emptyShelf}>
                {selectedShelf.kind === 'topics'
                  ? 'Choose a tag to populate this shelf.'
                  : selectedShelf.kind === 'creators'
                    ? 'Choose a creator to populate this shelf.'
                    : 'This shelf is empty.'}
              </p>
            ) : (
              selectedShelf.articles.map((item) => (
                <button
                  key={item.id}
                  className={styles.book}
                  onClick={() => void openArticle(item)}
                >
                  <span className={styles.bookSpine} />
                  <span>
                    <strong>{item.title}</strong>
                    <small>
                      @{item.user.username}
                      {item.reading_time_minutes
                        ? ' · ' +
                          item.reading_time_minutes +
                          ' min'
                        : ''}
                    </small>
                  </span>
                </button>
              ))
            )}
          </div>
        </aside>
      )}

      {article && (
        <section className={styles.reader}>
          <div className={styles.readerCard}>
            <button
              className={styles.close}
              onClick={closeArticleReader}
              aria-label="Close article"
            >
              ×
            </button>
            <p className={styles.eyebrow}>
              @{article.user.username} · DEV
            </p>
            <h1>{article.title}</h1>
            <p className={styles.readerMeta}>
              {article.readable_publish_date ?? ''}
              {article.reading_time_minutes
                ? ' · ' + article.reading_time_minutes + ' min read'
                : ''}
            </p>
            {articleHeroImage && (
              <img
                className={styles.readerHeroImage}
                src={articleHeroImage}
                alt=""
                loading="eager"
                decoding="async"
              />
            )}
            {sanitizedArticleHtml ? (
              <div
                className={styles.articleBody}
                dangerouslySetInnerHTML={{
                  __html: sanitizedArticleHtml,
                }}
              />
            ) : (
              <div className={styles.articleBody}>
                <p>
                  {cleanMarkdown(article.body_markdown) ||
                    article.description}
                </p>
              </div>
            )}
            <a
              className={styles.devLink}
              href={article.url}
              target="_blank"
              rel="noreferrer"
            >
              Open on DEV ↗
            </a>
          </div>
        </section>
      )}
    </main>
  )
}
