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
  LIBRARY_MAX_ROOM_SHELF_COUNT,
  roomShelfPlacements,
  type RoomShelfPlacement,
} from './libraryRoomLayout'

const DEFAULT_USERNAME = 'mikachu'
const QUALITY: DreamQuality = 'cinematic'
const CATALOG_PAGE_SIZE = 100
const CATALOG_BOOKS_PER_SHELF = 9
const DISTRICT_RENDERED_SHELF_LIMIT =
  LIBRARY_MAX_ROOM_SHELF_COUNT
const DISTRICT_VISIBLE_ARTICLE_CAPACITY =
  DISTRICT_RENDERED_SHELF_LIMIT * CATALOG_BOOKS_PER_SHELF * 2
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
    doubleSided: placement.doubleSided,
    endCaps: placement.endCaps,
    floatId: placement.floatId,
    pathBay: placement.pathBay,
    districtId: placement.districtId,
    widthScale: placement.widthScale,
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
  const catalogInitializedRef = useRef(false)
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
  const [layoutHudVisible, setLayoutHudVisible] =
    useState(false)
  const [layoutHudStatus, setLayoutHudStatus] =
    useState('READY · P DROP · SHIFT+P REMOVE')
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

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('layoutDebug') === '1') {
      setLayoutHudVisible(true)
    }

    const sendLayoutRequest = (
      remove: boolean,
      source: string,
    ) => {
      setLayoutHudVisible(true)
      setLayoutHudStatus(
        remove
          ? `${source} CAPTURED · REMOVE REQUEST SENT`
          : `${source} CAPTURED · DROP REQUEST SENT`,
      )
      window.dispatchEvent(
        new CustomEvent('oniria:layout-pin-request', {
          detail: {remove, source},
        }),
      )
    }

    const handleLayoutKey = (event: KeyboardEvent) => {
      if (
        event.repeat ||
        (event.code !== 'KeyP' && event.code !== 'F8')
      ) {
        return
      }

      const target = event.target
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        (target instanceof HTMLElement &&
          target.isContentEditable)
      ) {
        return
      }

      event.preventDefault()
      event.stopPropagation()
      sendLayoutRequest(
        event.shiftKey,
        event.code === 'KeyP' ? 'P' : 'F8',
      )
    }

    const handleLayoutResult = (event: Event) => {
      const detail = (
        event as CustomEvent<{
          ok?: boolean
          message?: string
          roomSlot?: number
        }>
      ).detail
      setLayoutHudVisible(true)
      setLayoutHudStatus(
        detail?.message ??
          (detail?.ok ? 'PIN ACTION COMPLETE' : 'PIN ACTION FAILED'),
      )
    }

    const handleLayoutRendered = (event: Event) => {
      const detail = (
        event as CustomEvent<{
          label?: string
          x?: number
          z?: number
          visualCount?: number
        }>
      ).detail
      const x =
        typeof detail?.x === 'number'
          ? detail.x.toFixed(2)
          : '?'
      const z =
        typeof detail?.z === 'number'
          ? detail.z.toFixed(2)
          : '?'
      setLayoutHudVisible(true)
      setLayoutHudStatus(
        `RENDERED ${detail?.label ?? 'PIN'} @ ${x}, ${z} · ${detail?.visualCount ?? 0} VISIBLE`,
      )
    }

    const handleLayoutButton = (event: Event) => {
      const detail = (
        event as CustomEvent<{
          remove?: boolean
          clearAll?: boolean
        }>
      ).detail

      if (detail?.clearAll) {
        setLayoutHudVisible(true)
        setLayoutHudStatus('CLEARING ALL PINS…')
        window.dispatchEvent(
          new CustomEvent('oniria:layout-pin-request', {
            detail: {
              clearAll: true,
              source: 'BUTTON',
            },
          }),
        )
        return
      }

      sendLayoutRequest(
        Boolean(detail?.remove),
        'BUTTON',
      )
    }

    const copyLayoutExport = async (text: string) => {
      try {
        await navigator.clipboard.writeText(text)
        return true
      } catch {
        try {
          const textarea = document.createElement('textarea')
          textarea.value = text
          textarea.style.position = 'fixed'
          textarea.style.left = '-9999px'
          document.body.appendChild(textarea)
          textarea.select()
          const copied = document.execCommand('copy')
          textarea.remove()
          return copied
        } catch {
          return false
        }
      }
    }

    const handleLayoutExport = (event: Event) => {
      const detail = (
        event as CustomEvent<{
          markers?: Array<{
            id: string
            label: string
            roomSlot: number
            districtId: string
            x: number
            y: number
            z: number
            yaw: number
            width: number
            depth: number
            createdAt: string
            persistence?: string
          }>
          count?: number
        }>
      ).detail

      const markers = [...(detail?.markers ?? [])].sort(
        (a, b) =>
          a.roomSlot - b.roomSlot ||
          a.label.localeCompare(b.label),
      )
      const payload = JSON.stringify(
        {
          format: 'oniria-library-layout-pins-v1',
          exportedAt: new Date().toISOString(),
          count: markers.length,
          markers,
        },
        null,
        2,
      )

      void copyLayoutExport(payload).then((copied) => {
        setLayoutHudVisible(true)
        setLayoutHudStatus(
          copied
            ? `COPIED ${markers.length} PINS · PASTE INTO CHAT`
            : `COPY FAILED · ${markers.length} PINS READY`,
        )
      })
    }

    window.addEventListener('keydown', handleLayoutKey, true)
    window.addEventListener(
      'oniria:layout-pin-result',
      handleLayoutResult,
    )
    window.addEventListener(
      'oniria:layout-pin-rendered',
      handleLayoutRendered,
    )
    window.addEventListener(
      'oniria:layout-pin-button',
      handleLayoutButton,
    )
    window.addEventListener(
      'oniria:layout-pin-export',
      handleLayoutExport,
    )

    return () => {
      window.removeEventListener(
        'keydown',
        handleLayoutKey,
        true,
      )
      window.removeEventListener(
        'oniria:layout-pin-result',
        handleLayoutResult,
      )
      window.removeEventListener(
        'oniria:layout-pin-rendered',
        handleLayoutRendered,
      )
      window.removeEventListener(
        'oniria:layout-pin-button',
        handleLayoutButton,
      )
      window.removeEventListener(
        'oniria:layout-pin-export',
        handleLayoutExport,
      )
    }
  }, [])

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

  const loadMoreCatalog = useCallback(async (pages = 1) => {
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
          '&pages=' +
          Math.max(1, Math.min(4, pages)) +
          '&per_page=' +
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

        if (initial && !catalogInitializedRef.current) {
          // Do not compete with first render by pulling the Archive up front.
          // The bootstrap already provides enough fallback books for the
          // Archive facade; real catalogue pages stream in on approach.
          catalogInitializedRef.current = true
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
    [loadMoreCatalog],
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
    }, 15_000)

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
          // Preload the configured topic categories so each physical Topic
          // shelf can correspond to real DEV tags instead of a cosmetic label.
          // Keep requests modest; shelf hydration remains progressive.
          const seedTags = district.devTags.slice(0, 6)
          if (seedTags.length === 0) {
            return [district.id, []] as const
          }

          try {
            const responses = await Promise.all(
              seedTags.map((tag) =>
                fetch(
                  '/api/devto?mode=tag&per_page=24&tag=' +
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
    // Every DEV article is also a creator artifact. Use the full diverse
    // author pool by default so the expanded Creators stacks stay populated;
    // choosing a specific @creator still replaces this with that profile.
    const creatorPreview = creatorCandidates

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

    const shelfArticles = (
      source: DevArticleSummary[],
      offset: number,
      count: number,
    ) => {
      if (source.length === 0 || count <= 0) return []
      if (offset + count <= source.length) {
        return source.slice(offset, offset + count)
      }

      // Keep every physical shelf visually populated while the deeper DEV
      // pages are still streaming. We only wrap once the currently loaded
      // unique pool has been exhausted.
      return Array.from({length: count}, (_, index) =>
        source[(offset + index) % source.length],
      ).filter(
        (article): article is DevArticleSummary =>
          Boolean(article),
      )
    }

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
            DISTRICT_VISIBLE_ARTICLE_CAPACITY
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

    const articleTimestamp = (
      article: DevArticleSummary,
    ) => {
      if (!article.published_at) return null
      const value = Date.parse(article.published_at)
      return Number.isFinite(value) ? value : null
    }

    const shelfDateRange = (
      articles: readonly DevArticleSummary[],
    ) => {
      const values = articles
        .map(articleTimestamp)
        .filter((value): value is number => value !== null)
        .sort((a, b) => a - b)

      if (values.length === 0) return 'DATE UNCATALOGUED'

      const first = new Date(values[0])
      const last = new Date(values[values.length - 1])
      const short = new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: 'numeric',
      })
      const sameDay =
        first.getFullYear() === last.getFullYear() &&
        first.getMonth() === last.getMonth() &&
        first.getDate() === last.getDate()

      return sameDay
        ? `${short.format(last).toUpperCase()} · ${last.getFullYear()}`
        : `${short.format(first).toUpperCase()}–${short.format(last).toUpperCase()} · ${last.getFullYear()}`
    }

    const dominantTag = (
      articles: readonly DevArticleSummary[],
    ) => {
      const counts = new Map<string, number>()
      articles.forEach((article) => {
        ;(article.tag_list ?? []).forEach((tag) => {
          const key = tag.toLowerCase()
          counts.set(key, (counts.get(key) ?? 0) + 1)
        })
      })
      return [...counts.entries()].sort(
        (a, b) => b[1] - a[1],
      )[0]?.[0]
    }

    const dominantCreator = (
      articles: readonly DevArticleSummary[],
    ) => {
      const counts = new Map<
        string,
        {username: string; name: string; count: number}
      >()
      articles.forEach((article) => {
        const username = article.user.username
        const current = counts.get(username)
        if (current) {
          current.count += 1
        } else {
          counts.set(username, {
            username,
            name: article.user.name,
            count: 1,
          })
        }
      })
      return [...counts.values()].sort(
        (a, b) =>
          b.count - a.count ||
          a.username.localeCompare(b.username),
      )[0]
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

        let articleOffset = 0
        placements.forEach((placement, shelfIndex) => {
          const shelfCapacity =
            CATALOG_BOOKS_PER_SHELF *
            (placement.doubleSided ? 2 : 1)
          const shelfNumber = String(shelfIndex + 1).padStart(2, '0')

          let shelfSource = source
          let sourceOffset = articleOffset

          if (
            (district.sourceMode === 'topics' ||
              district.sourceMode === 'tagged') &&
            district.devTags.length > 0
          ) {
            const tag =
              district.devTags[
                shelfIndex % district.devTags.length
              ]
            const tagged = source.filter((article) =>
              (article.tag_list ?? []).some(
                (articleTag) =>
                  articleTag.toLowerCase() === tag.toLowerCase(),
              ),
            )
            if (tagged.length > 0) {
              shelfSource = tagged
              sourceOffset =
                Math.floor(
                  shelfIndex / district.devTags.length,
                ) * shelfCapacity
            }
          }

          const articles = shelfArticles(
            shelfSource,
            sourceOffset,
            shelfCapacity,
          )
          articleOffset += shelfCapacity

          let title = district.label + ' ' + shelfNumber
          let functionLabel =
            district.description ?? 'LIVE DEV COLLECTION'

          if (
            district.sourceMode === 'topics' ||
            district.sourceMode === 'tagged'
          ) {
            const tag =
              district.devTags[
                shelfIndex % Math.max(1, district.devTags.length)
              ]
            title = tag
              ? `#${tag.toUpperCase()} · ${shelfNumber}`
              : `TOPICS · ${shelfNumber}`
            functionLabel = 'TAG INDEX'
          } else if (district.sourceMode === 'creators') {
            const creator = dominantCreator(articles)
            title = creator
              ? `@${creator.username} · ${shelfNumber}`
              : `CREATORS · ${shelfNumber}`
            functionLabel = creator
              ? `${creator.name} · AUTHOR INDEX`
              : 'AUTHOR INDEX'
          } else if (district.sourceMode === 'featured') {
            title = `CURATED PICKS · ${shelfNumber}`
            functionLabel = 'FEATURED COLLECTION'
          } else if (district.sourceMode === 'latest') {
            title = `NEW ARRIVALS · ${shelfNumber}`
            functionLabel = 'NEWLY PUBLISHED'
          } else if (district.sourceMode === 'search') {
            const tag = dominantTag(articles)
            title = tag
              ? `SEARCH · #${tag.toUpperCase()}`
              : `SEARCH RESULTS · ${shelfNumber}`
            functionLabel = query.trim()
              ? `QUERY “${query.trim().slice(0, 28)}”`
              : 'LIVE CARD CATALOGUE'
          } else if (district.sourceMode === 'catalog') {
            title = `ARCHIVE · ${shelfNumber}`
            functionLabel = 'LONG-TAIL DEV CATALOGUE'
          }

          const subtitle =
            `${functionLabel} · ${shelfDateRange(articles)} · ${articles.length} VOLUMES`

          const shelf = makeShelf(
            'shelf:room:' + district.id + ':' + shelfIndex,
            title,
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

    const hallwayCollections = [
      {
        sourceMode: 'featured' as const,
        side: 'left' as const,
        title: 'FEATURED HALL',
      },
      {
        sourceMode: 'latest' as const,
        side: 'right' as const,
        title: 'RECENT HALL',
      },
    ]

    hallwayCollections.forEach(({sourceMode, side, title}) => {
      const district = roomWorldConfig.districts.find(
        (candidate) => candidate.sourceMode === sourceMode,
      )
      if (!district) return

      const source = articlesForDistrict(district)
      const placements = hallwayShelfPlacements(
        district,
        side,
      )
      const kind = shelfKindForSource(sourceMode)

      placements.forEach((placement, shelfIndex) => {
        // Start the corridor on a later part of the pool so the doorway view
        // does not mirror room shelf #1, but wrap only when the lightweight
        // startup pool runs out.
        const offset =
          CATALOG_BOOKS_PER_SHELF * 2 +
          shelfIndex * CATALOG_BOOKS_PER_SHELF
        const articles = shelfArticles(
          source,
          offset,
          CATALOG_BOOKS_PER_SHELF,
        )
        const shelfNumber = String(shelfIndex + 1).padStart(2, '0')
        const shelf = makeShelf(
          'shelf:hallway:' + sourceMode + ':' + shelfIndex,
          title + ' ' + shelfNumber,
          sourceMode === 'featured'
            ? 'curated + trending DEV writing'
            : 'freshly published on DEV',
          kind,
          placement,
          articles,
        )
        shelf.accent = district.accent
        result.push(shelf)
      })
    })

    return result
  }, [
    bootstrap,
    catalog,
    creators,
    curatedLiveArticles,
    dynamicArticles,
    dynamicTitle,
    query,
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
        libraryDoubleSided: shelf.doubleSided,
        libraryShelfEndCaps: shelf.endCaps,
        libraryFloatId: shelf.floatId,
        libraryPathBay: shelf.pathBay,
        libraryDistrictId: shelf.districtId,
        libraryWidthScale: shelf.widthScale,
        libraryBooks: shelf.articles
          .slice(0, shelf.doubleSided ? 18 : 9)
          .map((article) => {
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

    if (archiveApproach && catalog.length === 0) {
      if (
        lastCatalogLoadTriggerRef.current !== 'archive:first-page'
      ) {
        lastCatalogLoadTriggerRef.current = 'archive:first-page'
        void loadMoreCatalog(1)
      }
      return
    }

    if (archiveApproach && isLastVisibleCatalogShelf) {
      if (
        lastCatalogLoadTriggerRef.current !== candidate
      ) {
        lastCatalogLoadTriggerRef.current = candidate
        void loadMoreCatalog(1)
      }
      return
    }

    // Moving away from the Archive edge arms the trigger again, so returning
    // to its last shelf fetches the next page without polling continuously.
    lastCatalogLoadTriggerRef.current = null
  }, [
    catalog.length,
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

      {layoutHudVisible && (
        <aside
          className={styles.layoutAuthoringHud}
          aria-live="polite"
        >
          <div className={styles.layoutAuthoringHudHeader}>
            <strong>LAYOUT PIN MODE</strong>
            <span>P / F8</span>
          </div>
          <p>{layoutHudStatus}</p>
          <div className={styles.layoutAuthoringHudActions}>
            <button
              type="button"
              onClick={() =>
                window.dispatchEvent(
                  new CustomEvent('oniria:layout-pin-button', {
                    detail: {remove: false},
                  }),
                )
              }
            >
              Drop pin
            </button>
            <button
              type="button"
              onClick={() =>
                window.dispatchEvent(
                  new CustomEvent('oniria:layout-pin-button', {
                    detail: {remove: true},
                  }),
                )
              }
            >
              Remove nearest
            </button>
            <button
              type="button"
              className={styles.layoutAuthoringExport}
              onClick={() => {
                setLayoutHudStatus('EXPORTING PINS…')
                window.dispatchEvent(
                  new CustomEvent(
                    'oniria:layout-pin-export-request',
                  ),
                )
              }}
            >
              Copy pins JSON
            </button>
            <button
              type="button"
              className={styles.layoutAuthoringDanger}
              onClick={() => {
                if (
                  !window.confirm(
                    'Clear every layout pin? The normalized shelf layout will remain.',
                  )
                ) {
                  return
                }
                window.dispatchEvent(
                  new CustomEvent('oniria:layout-pin-button', {
                    detail: {clearAll: true},
                  }),
                )
              }}
            >
              Clear all pins
            </button>
          </div>
          <small>
            Stand in a room · face shelf direction · P drops · Shift+P removes
          </small>
        </aside>
      )}

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
