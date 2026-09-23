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
  type LibraryContentSource,
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
  hallwayShelfPlacements,
  roomShelfPlacements,
  type RoomShelfPlacement,
} from './libraryRoomLayout'

const DEFAULT_USERNAME = 'mikachu'
const QUALITY: DreamQuality = 'cinematic'
const CATALOG_PAGE_SIZE = 100
const CATALOG_BOOKS_PER_SHELF = 9
const DISTRICT_RENDERED_SHELF_LIMIT = 8
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
  placement: RoomShelfPlacement,
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
    endCaps: placement.endCaps,
    floatId: placement.floatId,
    pathBay: placement.pathBay,
    districtId: placement.districtId,
    articles,
  }
}

function shelfKindForSource(
  source: LibraryContentSource,
): LibraryShelfKind {
  if (source === 'featured') return 'featured'
  if (source === 'latest') return 'latest'
  if (source === 'topics' || source === 'tagged') return 'topics'
  if (source === 'creators') return 'creators'
  if (source === 'search') return 'search'
  return 'catalog'
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
  const bootstrapRefreshingRef = useRef(false)
  const [devRefreshTick, setDevRefreshTick] = useState(0)
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
  const [curatedLiveArticles, setCuratedLiveArticles] = useState<
    DevArticleSummary[]
  >([])
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

  const roomWorldConfig = useMemo<LibraryWorldConfig>(
    () => ({
      ...worldConfig,
      districts: [...(
        worldConfig.districts.length > 0
          ? worldConfig.districts
          : DEFAULT_LIBRARY_WORLD_CONFIG.districts
      )]
        .filter((district) => district.enabled)
        .sort((a, b) => a.roomSlot - b.roomSlot),
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

  const refreshDevBootstrap = useCallback(
    async (initial = false) => {
      if (bootstrapRefreshingRef.current) return
      bootstrapRefreshingRef.current = true

      try {
        if (initial) setLoading(true)
        const response = await fetch(
          '/api/devto?mode=bootstrap&username=' +
            encodeURIComponent(DEFAULT_USERNAME) +
            '&_=' +
            Date.now(),
          {
            cache: 'no-store',
            headers: {'cache-control': 'no-cache'},
          },
        )

        if (!response.ok) {
          throw new Error('Could not load DEV library')
        }

        const payload = (await response.json()) as DevBootstrap
        setBootstrap(payload)
        setDevRefreshTick((current) => current + 1)

        if (initial && catalog.length === 0) {
          void loadMoreCatalog()
        }
      } catch (caught) {
        if (initial) {
          setError(
            caught instanceof Error
              ? caught.message
              : 'Could not load DEV library',
          )
        }
      } finally {
        bootstrapRefreshingRef.current = false
        if (initial) setLoading(false)
      }
    },
    [catalog.length, loadMoreCatalog],
  )

  useEffect(() => {
    void refreshWorldConfig(true)
    void refreshDevBootstrap(true)
  }, [refreshDevBootstrap, refreshWorldConfig])

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
    if (!worldConfig.liveDevUpdates) return

    const refreshIfVisible = () => {
      if (document.visibilityState === 'visible') {
        void refreshDevBootstrap(false)
      }
    }
    const interval = window.setInterval(
      refreshIfVisible,
      90_000,
    )

    const refreshOnVisibility = () => {
      if (document.visibilityState === 'visible') {
        void refreshDevBootstrap(false)
      }
    }

    window.addEventListener('focus', refreshIfVisible)
    document.addEventListener(
      'visibilitychange',
      refreshOnVisibility,
    )

    return () => {
      window.clearInterval(interval)
      window.removeEventListener('focus', refreshIfVisible)
      document.removeEventListener(
        'visibilitychange',
        refreshOnVisibility,
      )
    }
  }, [refreshDevBootstrap, worldConfig.liveDevUpdates])

  useEffect(() => {
    let cancelled = false
    const ids = [...new Set(
      worldConfig.curatedArticles
        .filter((item) => item.featured)
        .map((item) => item.devArticleId),
    )]

    if (ids.length === 0) {
      setCuratedLiveArticles([])
      return () => {
        cancelled = true
      }
    }

    async function loadCuratedArticles() {
      const articles = await Promise.all(
        ids.map(async (id) => {
          try {
            const response = await fetch(
              '/api/devto?mode=article&id=' + id,
            )
            if (!response.ok) return null
            const payload = (await response.json()) as {
              article?: DevArticle
            }
            return payload.article ?? null
          } catch {
            return null
          }
        }),
      )

      if (cancelled) return
      setCuratedLiveArticles(
        articles.filter(
          (article): article is DevArticle =>
            Boolean(article),
        ),
      )
    }

    void loadCuratedArticles()

    return () => {
      cancelled = true
    }
  }, [devRefreshTick, worldConfig.curatedArticles])

  useEffect(() => {
    let cancelled = false

    const taggedDistricts = worldConfig.districts.filter(
      (district) =>
        district.enabled &&
        (district.sourceMode === 'topics' ||
          district.sourceMode === 'tagged') &&
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
  }, [devRefreshTick, worldConfig.districts])

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

    const allKnownArticles = uniqueArticles(
      curatedLiveArticles,
      bootstrap.feed,
      bootstrap.latest,
      bootstrap.profileArticles,
      catalog,
      dynamicArticles,
      searchResults,
    )
    const curatorIds = new Set(
      worldConfig.curatedArticles
        .filter((item) => item.featured)
        .map((item) => item.devArticleId),
    )
    const curatorPicks = uniqueArticles(
      curatedLiveArticles,
      allKnownArticles.filter((article) =>
        curatorIds.has(article.id),
      ),
    )

    const articlesForDistrict = (
      district: LibraryDistrictConfig,
    ): DevArticleSummary[] => {
      switch (district.sourceMode) {
        case 'featured':
          return uniqueArticles(curatorPicks, bootstrap.feed)
        case 'latest':
          return bootstrap.latest
        case 'topics':
          return dynamicTitle?.startsWith('#')
            ? dynamicArticles
            : districtSamples[district.id] ?? []
        case 'creators':
          return dynamicTitle?.startsWith('@')
            ? dynamicArticles
            : creatorPreview
        case 'search':
          return searchResults
        case 'catalog': {
          const source = uniqueArticles(
            catalog,
            bootstrap.latest,
            bootstrap.feed,
          )
          const capacity =
            DISTRICT_RENDERED_SHELF_LIMIT *
            CATALOG_BOOKS_PER_SHELF
          return source.length > capacity
            ? source.slice(-capacity)
            : source
        }
        case 'tagged': {
          const tags = new Set(
            district.devTags.map((tag) => tag.toLowerCase()),
          )
          return uniqueArticles(
            districtSamples[district.id] ?? [],
            catalog.filter((article) =>
              (article.tag_list ?? []).some((tag) =>
                tags.has(tag.toLowerCase()),
              ),
            ),
          )
        }
      }

      return []
    }

    const result: LibraryShelf[] = []

    roomWorldConfig.districts.forEach(
      (district, districtIndex) => {
        const placements = roomShelfPlacements(
          district,
          districtIndex,
        )
        const source = articlesForDistrict(district)
        const kind = shelfKindForSource(district.sourceMode)

        placements.forEach((placement, shelfIndex) => {
          const offset =
            shelfIndex * CATALOG_BOOKS_PER_SHELF
          const articles = source.slice(
            offset,
            offset + CATALOG_BOOKS_PER_SHELF,
          )
          const shelfNumber = String(shelfIndex + 1).padStart(2, '0')
          const subtitle =
            district.sourceMode === 'catalog'
              ? 'live DEV archive · ' + source.length + ' loaded'
              : district.sourceMode === 'topics' && district.devTags.length
                ? district.devTags
                    .slice(0, 3)
                    .map((tag) => '#' + tag)
                    .join(' · ')
                : district.description ?? 'live DEV collection'

          const shelf = makeShelf(
            'shelf:room:' + district.id + ':' + shelfIndex,
            district.label + ' ' + shelfNumber,
            subtitle,
            kind,
            placement,
            articles,
          )
          shelf.accent = district.accent
          result.push(shelf)
        })
      },
    )

    return result
  }, [
    bootstrap,
    catalog,
    creators,
    curatedLiveArticles,
    dynamicArticles,
    dynamicTitle,
    roomWorldConfig,
    searchResults,
    districtSamples,
    worldConfig.curatedArticles,
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
        libraryShelfEndCaps: shelf.endCaps,
        libraryFloatId: shelf.floatId,
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

  // The six-room building is navigated spatially rather than as a graph.
  // Leaving relationship edges empty prevents cinematic connection lines
  // and free-space routes from cutting through interior walls.
  const edges = useMemo<DreamWorldEdge[]>(() => [], [])


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
    const shelf = shelves.find(
      (item) => item.id === candidate,
    )
    const archiveDistrict = shelf
      ? roomWorldConfig.districts.find(
          (district) => district.id === shelf.districtId,
        )
      : null
    const archiveApproach =
      shelf?.kind === 'catalog' &&
      archiveDistrict?.sourceMode === 'catalog'
    const isLastVisibleCatalogShelf =
      archiveApproach &&
      shelf &&
      shelves
        .filter((item) => item.kind === 'catalog')
        .slice(-2)
        .some((item) => item.id === shelf.id)

    if (archiveApproach && isLastVisibleCatalogShelf) {
      if (
        lastCatalogLoadTriggerRef.current !== candidate
      ) {
        lastCatalogLoadTriggerRef.current = candidate
        void loadMoreCatalog()
      }
      return
    }

    // Moving away from the Archive edge arms the trigger again, so returning
    // to its last shelf fetches the next page without polling continuously.
    lastCatalogLoadTriggerRef.current = null
  }, [
    catalogHasMore,
    catalogLoading,
    catalogShelfCount,
    loadMoreCatalog,
    navigation.nearestId,
    navigation.routeTargetId,
    roomWorldConfig.districts,
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
      setSelectedId(
        shelves.find((shelf) => shelf.kind === 'topics')?.id ?? null,
      )
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
      setSelectedId(
        shelves.find((shelf) => shelf.kind === 'creators')?.id ?? null,
      )
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
      setSelectedId(
        shelves.find((shelf) => shelf.kind === 'search')?.id ?? null,
      )
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
        libraryWorldConfig={roomWorldConfig}
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
          <small>Sanity-powered spatial archive</small>
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
          <small>
            G · {movementMode === 'walk' ? 'WALK' : 'FLY'} · WASD move
            · E inspect / close book
            {catalogLoading
              ? ' · extending catalogue…'
              : catalogHasMore
                ? ' · ' +
                  catalog.length +
                  ' catalogue articles loaded'
                : ' · catalogue end reached'}
          </small>
        </div>
      </header>

      {loading && (
        <div className={styles.loading}>
          <span>✦</span>
          <strong>Opening the DEV Library…</strong>
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

          <p className={styles.eyebrow}>DEV room shelf</p>
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
