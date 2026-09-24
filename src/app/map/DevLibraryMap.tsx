'use client'

import {
  FormEvent,
  UIEvent,
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
import {
  DEFAULT_LIBRARY_GRAPHICS_OPTIONS,
  type DreamQuality,
  type LibraryGraphicsOptions,
} from './dreamworld/quality'
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
import {resolveLivingTopicSlots} from './libraryLivingSlots'
import type {
  LibraryBookFocus,
  LibraryNavigationRequest,
  LibraryReturnState,
  LibrarySpatialContext,
} from './libraryExperience'
import {emitLibraryEvent} from './libraryAnalytics'
import {emitLibraryAudioCue} from './libraryAudio'

const DEFAULT_USERNAME = 'mikachu'
const DEFAULT_LIBRARY_QUALITY: DreamQuality = 'medium'
const GRAPHICS_STORAGE_KEY = 'oniria:library-graphics-v1'
const CONTROLS_STORAGE_KEY = 'oniria:library-controls-seen-v1'
const LIBRARY_DELIGHT_EVENT = 'oniria:library-delight'
const LIBRARY_MOTION_EVENT =
  'oniria:library-motion-preference'

function emitLibraryDelight(
  type: 'room-enter' | 'article-open',
) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(
    new CustomEvent(LIBRARY_DELIGHT_EVENT, {
      detail: {type},
    }),
  )
}

const CATALOG_PAGE_SIZE = 100
const CATALOG_BOOKS_PER_SHELF = 9
const DISTRICT_RENDERED_SHELF_LIMIT =
  LIBRARY_MAX_ROOM_SHELF_COUNT
const DISTRICT_VISIBLE_ARTICLE_CAPACITY =
  DISTRICT_RENDERED_SHELF_LIMIT * CATALOG_BOOKS_PER_SHELF * 2
const DISTRICT_SHELF_PAIR_OFFSETS = [-.68, .68] as const

const QUALITY_LABELS: Record<DreamQuality, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  cinematic: 'Cinematic',
}

function isDreamQuality(value: unknown): value is DreamQuality {
  return (
    value === 'low' ||
    value === 'medium' ||
    value === 'high' ||
    value === 'cinematic'
  )
}

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
  occupancy?: {
    occupancyKey?: string
    lifecycle?: LibraryShelf['lifecycle']
    vitality?: number
    materializedAt?: string
  },
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
    slotId: placement.slotId,
    occupancyKey:
      occupancy?.occupancyKey ??
      `static:${placement.districtId}:${placement.slotId}`,
    lifecycle: occupancy?.lifecycle ?? 'active',
    vitality: occupancy?.vitality ?? 1,
    materializedAt: occupancy?.materializedAt,
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
  const [soundEnabled, setSoundEnabled] = useState(true)
  const [quality, setQuality] =
    useState<DreamQuality>(DEFAULT_LIBRARY_QUALITY)
  const [graphicsOptions, setGraphicsOptions] =
    useState<LibraryGraphicsOptions>(
      DEFAULT_LIBRARY_GRAPHICS_OPTIONS,
    )
  const [graphicsOpen, setGraphicsOpen] = useState(false)
  const [graphicsHydrated, setGraphicsHydrated] =
    useState(false)
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
  const [focusedBook, setFocusedBook] =
    useState<LibraryBookFocus | null>(null)
  const [libraryReturnState, setLibraryReturnState] =
    useState<LibraryReturnState | null>(null)
  const [navigationRequest, setNavigationRequest] =
    useState<LibraryNavigationRequest | null>(null)
  const navigationRequestIdRef = useRef(0)
  const [spatialContext, setSpatialContext] =
    useState<LibrarySpatialContext>({
      roomId: null,
      shelfId: null,
    })
  const [roomAnnouncement, setRoomAnnouncement] =
    useState<string | null>(null)
  const roomAnnouncementTimerRef = useRef<number | null>(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchInputFocused, setSearchInputFocused] =
    useState(false)
  const [controlsHintVisible, setControlsHintVisible] =
    useState(false)
  const readerProgressRef = useRef({half: false, complete: false})
  const lastRoomEventRef = useRef<string | null>(null)
  const lastShelfEventRef = useRef<string | null>(null)
  const lastBookEventRef = useRef<string | null>(null)
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
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(
        GRAPHICS_STORAGE_KEY,
      )
      if (stored) {
        const parsed = JSON.parse(stored) as {
          quality?: unknown
          shadows?: unknown
          bloom?: unknown
          reducedMotion?: unknown
          largeText?: unknown
        }
        if (isDreamQuality(parsed.quality)) {
          setQuality(parsed.quality)
        }
        setGraphicsOptions({
          shadows:
            typeof parsed.shadows === 'boolean'
              ? parsed.shadows
              : DEFAULT_LIBRARY_GRAPHICS_OPTIONS.shadows,
          bloom:
            typeof parsed.bloom === 'boolean'
              ? parsed.bloom
              : DEFAULT_LIBRARY_GRAPHICS_OPTIONS.bloom,
          reducedMotion:
            typeof parsed.reducedMotion === 'boolean'
              ? parsed.reducedMotion
              : DEFAULT_LIBRARY_GRAPHICS_OPTIONS.reducedMotion,
          largeText:
            typeof parsed.largeText === 'boolean'
              ? parsed.largeText
              : DEFAULT_LIBRARY_GRAPHICS_OPTIONS.largeText,
        })
      } else if (
        window.matchMedia?.(
          '(prefers-reduced-motion: reduce)',
        ).matches
      ) {
        setGraphicsOptions((current) => ({
          ...current,
          reducedMotion: true,
        }))
      }
    } catch {
      // Ignore malformed local settings and keep the safe Medium defaults.
    } finally {
      setGraphicsHydrated(true)
    }
  }, [])

  useEffect(() => {
    if (!graphicsHydrated) return
    try {
      window.localStorage.setItem(
        GRAPHICS_STORAGE_KEY,
        JSON.stringify({
          quality,
          ...graphicsOptions,
        }),
      )
    } catch {
      // Storage can be blocked in privacy modes; graphics still work in-memory.
    }
  }, [graphicsHydrated, graphicsOptions, quality])

  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent(LIBRARY_MOTION_EVENT, {
        detail: {
          reducedMotion: graphicsOptions.reducedMotion,
        },
      }),
    )
  }, [graphicsOptions.reducedMotion])

  useEffect(() => {
    let seen = false
    try {
      seen =
        window.localStorage.getItem(CONTROLS_STORAGE_KEY) ===
        'true'
    } catch {
      // A blocked storage API should not prevent the hint from helping.
    }
    if (seen) return

    setControlsHintVisible(true)
    const dismiss = (event: KeyboardEvent | PointerEvent) => {
      if (
        event instanceof KeyboardEvent &&
        ![
          'KeyW',
          'KeyA',
          'KeyS',
          'KeyD',
          'KeyE',
          'KeyG',
        ].includes(event.code)
      ) {
        return
      }

      setControlsHintVisible(false)
      try {
        window.localStorage.setItem(
          CONTROLS_STORAGE_KEY,
          'true',
        )
      } catch {
        // The hint still dismisses for this visit when storage is blocked.
      }
      window.removeEventListener('keydown', dismiss)
      window.removeEventListener('pointerdown', dismiss)
    }

    window.addEventListener('keydown', dismiss)
    window.addEventListener('pointerdown', dismiss)
    return () => {
      window.removeEventListener('keydown', dismiss)
      window.removeEventListener('pointerdown', dismiss)
    }
  }, [])

  const libraryEnterEmittedRef = useRef(false)
  useEffect(() => {
    if (loading || libraryEnterEmittedRef.current) return
    libraryEnterEmittedRef.current = true
    emitLibraryEvent('library_enter', {
      source: worldConfig.source,
    })
  }, [loading, worldConfig.source])

  useEffect(
    () => () => {
      if (roomAnnouncementTimerRef.current !== null) {
        window.clearTimeout(roomAnnouncementTimerRef.current)
      }
    },
    [],
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
          // Preload both authored tags and Sanity-persisted emergent occupants.
          // A living shelf must keep showing its own real DEV articles even
          // after the tag is no longer part of the original room config.
          const persistedTags = worldConfig.slotStates
            .filter(
              (slot) =>
                slot.districtId === district.id &&
                slot.lifecycle !== 'dormant' &&
                typeof slot.topic === 'string',
            )
            .map((slot) => slot.topic as string)
          const seedTags = [
            ...new Set([
              ...district.devTags,
              ...persistedTags,
            ]),
          ].slice(0, 12)
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
  }, [
    devRefreshTick,
    worldConfig.districts,
    worldConfig.slotStates,
  ])

  const resumeFirstPersonControls = useCallback(() => {
    const canvas = document.querySelector<HTMLCanvasElement>(
      'canvas[data-oniria-library-fps="true"]',
    )
    if (!canvas) return

    canvas.focus({preventScroll: true})
    if (document.pointerLockElement !== canvas) {
      void canvas.requestPointerLock().catch(() => {
        // Pointer lock can be denied by browser policy, automation, or a
        // recently closed permission prompt. Keyboard movement still works,
        // so keep focus on the canvas instead of surfacing an unhandled error.
        canvas.focus({preventScroll: true})
      })
    }
  }, [])

  const closeArticleReader = useCallback(() => {
    // Pointer lock must be requested directly inside the trusted keyboard/click
    // gesture. Doing this before the React state update keeps the browser user
    // activation intact and restores FPS mouse-look as the reader disappears.
    resumeFirstPersonControls()
    emitLibraryEvent('article_close', {
      articleId: article?.id,
      bookId: libraryReturnState?.bookId,
    })
    emitLibraryAudioCue('article-close')
    if (libraryReturnState) {
      navigationRequestIdRef.current += 1
      setNavigationRequest({
        id: navigationRequestIdRef.current,
        type: 'restore',
        state: libraryReturnState,
      })
      emitLibraryEvent('return_to_shelf', {
        roomId: libraryReturnState.roomId,
        shelfId: libraryReturnState.shelfId,
        bookId: libraryReturnState.bookId,
      })
    }
    setArticle(null)
    setReadingBook(null)
    setLibraryReturnState(null)
    readerProgressRef.current = {half: false, complete: false}
  }, [article?.id, libraryReturnState, resumeFirstPersonControls])

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
          // Search results live in the React overlay. Keeping the physical
          // Search room on a stable sample prevents every query from
          // rebuilding the Three.js world and resetting the visitor.
          return uniqueArticles(
            bootstrap.feed,
            bootstrap.latest,
          )
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
        const persistedTopicStates =
          worldConfig.slotStates.filter(
            (state) => state.districtId === district.id,
          )
        const persistedTopicBySlot = new Map(
          persistedTopicStates.map((state) => [
            state.slotId,
            state,
          ]),
        )
        const hasPersistedTopicState =
          persistedTopicStates.length > 0
        const topicSlotState =
          district.sourceMode === 'topics' ||
          district.sourceMode === 'tagged'
            ? hasPersistedTopicState
              ? placements.map((placement) => {
                  const persisted =
                    persistedTopicBySlot.get(
                      placement.slotId,
                    )
                  const tag = persisted?.topic ?? null
                  return {
                    slotId: placement.slotId,
                    occupancyKey:
                      persisted?.occupantKey ?? null,
                    tag,
                    lifecycle:
                      persisted?.lifecycle ?? 'dormant',
                    vitality: persisted?.vitality ?? 0,
                    materializedAt:
                      persisted?.materializedAt,
                    placement,
                    articles: tag
                      ? source.filter((article) =>
                          (article.tag_list ?? []).some(
                            (articleTag) =>
                              articleTag.toLowerCase() ===
                              tag.toLowerCase(),
                          ),
                        )
                      : [],
                  }
                })
              : resolveLivingTopicSlots(
                  placements,
                  district.devTags,
                  uniqueArticles(
                    allKnownArticles,
                    ...Object.values(districtSamples),
                  ),
                )
            : null
        const shelfSlots =
          topicSlotState ??
          placements.map((placement) => ({
            slotId: placement.slotId,
            occupancyKey:
              `static:${district.id}:${placement.slotId}`,
            tag: null,
            lifecycle: 'active' as const,
            vitality: 1,
            materializedAt: undefined,
            placement,
            articles: [] as DevArticleSummary[],
          }))
        const occupiedShelfSlots = shelfSlots.filter(
          (slot) =>
            slot.lifecycle !== 'dormant' &&
            Boolean(slot.occupancyKey),
        )

        let articleOffset = 0
        occupiedShelfSlots.forEach((slotState, shelfIndex) => {
          const placement = slotState.placement
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
              slotState.tag ??
              district.devTags[
                shelfIndex % district.devTags.length
              ]
            const tagged =
              slotState.articles.length > 0
                ? slotState.articles
                : source.filter((article) =>
                    (article.tag_list ?? []).some(
                      (articleTag) =>
                        articleTag.toLowerCase() ===
                        tag.toLowerCase(),
                    ),
                  )
            shelfSource = tagged
            sourceOffset =
              district.devTags.length > 0
                ? Math.floor(
                    shelfIndex / district.devTags.length,
                  ) * shelfCapacity
                : 0
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
              slotState.tag ??
              district.devTags[
                shelfIndex % Math.max(1, district.devTags.length)
              ]
            title = tag
              ? `#${tag.toUpperCase()} · ${placement.slotId}`
              : `TOPICS · ${placement.slotId}`
            functionLabel =
              slotState.lifecycle === 'forming'
                ? `MATERIALIZING · SLOT ${placement.slotId} · VITALITY ${Math.round(slotState.vitality * 100)}%`
                : slotState.lifecycle === 'cooling'
                  ? `COOLING · SLOT ${placement.slotId} · VITALITY ${Math.round(slotState.vitality * 100)}%`
                  : `LIVE TOPIC · SLOT ${placement.slotId} · VITALITY ${Math.round(slotState.vitality * 100)}%`
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
            title = `SEARCH INDEX · ${shelfNumber}`
            functionLabel = 'QUERY TERMINAL · USE SEARCH BAR'
          } else if (district.sourceMode === 'catalog') {
            title = `ARCHIVE · ${shelfNumber}`
            functionLabel = 'LONG-TAIL DEV CATALOGUE'
          }

          const subtitle =
            `${functionLabel} · ${shelfDateRange(articles)} · ${articles.length} VOLUMES`

          const shelf = makeShelf(
            'shelf:room:' +
              district.id +
              ':' +
              placement.slotId +
              ':' +
              (slotState.occupancyKey ?? shelfIndex),
            title,
            subtitle,
            kind,
            placement,
            articles,
            {
              occupancyKey:
                slotState.occupancyKey ??
                `static:${district.id}:${placement.slotId}`,
              lifecycle:
                slotState.lifecycle === 'dormant'
                  ? 'active'
                  : slotState.lifecycle,
              vitality: slotState.vitality,
              materializedAt: slotState.materializedAt,
            },
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
            ? `${shelfDateRange(articles)} · curated + trending DEV writing`
            : `${shelfDateRange(articles)} · freshly published on DEV`,
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
    roomWorldConfig,
    districtSamples,
    worldConfig.curatedArticles,
    worldConfig.slotStates,
  ])

  const articleLocations = useMemo(() => {
    const locations = new Map<
      number,
      {
        shelf: LibraryShelf
        bookIndex: number
        roomLabel: string
      }
    >()
    const orderedShelves = [...shelves].sort(
      (left, right) =>
        Number(left.kind === 'search') -
        Number(right.kind === 'search'),
    )

    orderedShelves.forEach((shelf) => {
      const capacity = shelf.doubleSided ? 18 : 9
      const district = roomWorldConfig.districts.find(
        (candidate) => candidate.id === shelf.districtId,
      )
      shelf.articles.slice(0, capacity).forEach((item, bookIndex) => {
        if (locations.has(item.id)) return
        locations.set(item.id, {
          shelf,
          bookIndex,
          roomLabel: district?.label ?? 'DEV Library',
        })
      })
    })

    return locations
  }, [roomWorldConfig.districts, shelves])

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
        librarySlotId: shelf.slotId,
        libraryOccupancyKey: shelf.occupancyKey,
        libraryShelfLifecycle: shelf.lifecycle,
        libraryShelfVitality: shelf.vitality,
        libraryMaterializedAt: shelf.materializedAt,
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
            author: article.user.name || article.user.username,
            readingTime: article.reading_time_minutes,
            tags: (article.tag_list ?? []).slice(0, 3),
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
  const focusedShelf = focusedBook
    ? shelves.find((shelf) => shelf.id === focusedBook.shelfId) ?? null
    : null
  const focusedArticle =
    focusedBook && focusedShelf
      ? focusedShelf.articles[focusedBook.bookIndex] ?? null
      : null
  const currentDistrict = spatialContext.roomId
    ? roomWorldConfig.districts.find(
        (district) => district.id === spatialContext.roomId,
      ) ?? null
    : null
  const currentContextShelf = spatialContext.shelfId
    ? shelves.find(
        (shelf) => shelf.id === spatialContext.shelfId,
      ) ?? null
    : null
  const catalogShelfCount = shelves.filter(
    (shelf) => shelf.kind === 'catalog',
  ).length
  const topicDistrictIndex = roomWorldConfig.districts.findIndex(
    (district) =>
      district.sourceMode === 'topics' ||
      district.sourceMode === 'tagged',
  )
  const topicDistrict =
    topicDistrictIndex >= 0
      ? roomWorldConfig.districts[topicDistrictIndex]
      : null
  const topicSlotCapacity = topicDistrict
    ? roomShelfPlacements(
        topicDistrict,
        topicDistrictIndex,
      ).length
    : 0
  const occupiedTopicShelfCount = shelves.filter(
    (shelf) => shelf.kind === 'topics',
  ).length
  const newTopicShelfCount = shelves.filter(
    (shelf) =>
      shelf.kind === 'topics' &&
      shelf.lifecycle === 'forming',
  ).length
  const nearTopics =
    selectedShelf?.kind === 'topics' ||
    hoveredShelf?.kind === 'topics' ||
    nearestShelf?.kind === 'topics'
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

  async function openArticle(
    summary: DevArticleSummary,
    returnState: LibraryReturnState | null = null,
  ) {
    try {
      setRouteLoading(true)
      if (returnState) {
        setLibraryReturnState(returnState)
      }
      const response = await fetch(
        '/api/devto?mode=article&id=' + summary.id,
      )
      if (!response.ok) throw new Error('Could not open article')
      const payload = (await response.json()) as {article: DevArticle}
      setArticle(payload.article)
      readerProgressRef.current = {half: false, complete: false}
      emitLibraryAudioCue('article-open')
      emitLibraryDelight('article-open')
      emitLibraryEvent('article_open', {
        articleId: summary.id,
        shelfId: returnState?.shelfId,
        bookId: returnState?.bookId,
      })
      document.exitPointerLock?.()
    } catch (caught) {
      setReadingBook(null)
      setLibraryReturnState(null)
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

    setSearchInputFocused(false)
    ;(document.activeElement as HTMLElement | null)?.blur()

    try {
      setRouteLoading(true)
      emitLibraryEvent('search_started', {query: value})
      const response = await fetch(
        '/api/devto?mode=search&q=' +
          encodeURIComponent(value),
      )
      if (!response.ok) throw new Error('Could not search DEV')
      const payload = (await response.json()) as {
        articles: DevArticleSummary[]
      }
      setSearchResults(payload.articles ?? [])
      setSearchOpen(true)
      setSelectedId(null)
      document.exitPointerLock?.()
    } catch {
      setError('Could not search DEV')
    } finally {
      setRouteLoading(false)
    }
  }

  const handleBookFocusChange = useCallback(
    (focus: LibraryBookFocus | null) => {
      setFocusedBook(focus)
      if (!focus) return
      const focusKey = `${focus.shelfId}:${focus.bookId}`
      if (lastBookEventRef.current === focusKey) return
      lastBookEventRef.current = focusKey
      emitLibraryEvent('book_focus', {
        shelfId: focus.shelfId,
        bookId: focus.bookId,
      })
    },
    [],
  )

  const handleLibraryContextChange = useCallback(
    (context: LibrarySpatialContext) => {
      setSpatialContext(context)

      if (
        context.roomId &&
        context.roomId !== lastRoomEventRef.current
      ) {
        lastRoomEventRef.current = context.roomId
        const district = roomWorldConfig.districts.find(
          (candidate) => candidate.id === context.roomId,
        )
        const label = district?.label ?? 'DEV Library'
        setRoomAnnouncement(label)
        if (roomAnnouncementTimerRef.current !== null) {
          window.clearTimeout(roomAnnouncementTimerRef.current)
        }
        roomAnnouncementTimerRef.current = window.setTimeout(
          () => setRoomAnnouncement(null),
          1_800,
        )
        emitLibraryAudioCue('room-enter')
        emitLibraryDelight('room-enter')
        emitLibraryEvent('room_enter', {
          roomId: context.roomId,
          label,
        })
      }

      if (
        context.shelfId &&
        context.shelfId !== lastShelfEventRef.current
      ) {
        lastShelfEventRef.current = context.shelfId
        emitLibraryEvent('shelf_focus', {
          shelfId: context.shelfId,
        })
      }
    },
    [roomWorldConfig.districts],
  )

  const takeSearchResultToLibrary = useCallback(
    (result: DevArticleSummary) => {
      const location = articleLocations.get(result.id)
      emitLibraryEvent('search_result_selected', {
        articleId: result.id,
        shelfId: location?.shelf.id,
        action: location ? 'take_me_there' : 'read_fallback',
      })

      if (!location) {
        setSearchOpen(false)
        void openArticle(result)
        return
      }

      emitLibraryAudioCue('locate')
      resumeFirstPersonControls()
      navigationRequestIdRef.current += 1
      setNavigationRequest({
        id: navigationRequestIdRef.current,
        type: 'locate',
        shelfId: location.shelf.id,
        bookId: String(result.id),
        bookIndex: location.bookIndex,
      })
      setSearchOpen(false)
      setSearchInputFocused(false)
      setSelectedId(null)
    },
    [articleLocations, resumeFirstPersonControls],
  )

  const handleReaderScroll = useCallback(
    (event: UIEvent<HTMLDivElement>) => {
      if (!article) return
      const target = event.currentTarget
      const available = target.scrollHeight - target.clientHeight
      if (available <= 0) return
      const progress = target.scrollTop / available

      if (progress >= .5 && !readerProgressRef.current.half) {
        readerProgressRef.current.half = true
        emitLibraryEvent('article_scroll_50', {
          articleId: article.id,
        })
      }
      if (progress >= .9 && !readerProgressRef.current.complete) {
        readerProgressRef.current.complete = true
        emitLibraryEvent('article_complete', {
          articleId: article.id,
        })
      }
    },
    [article],
  )

  const focusedIds = useMemo(() => new Set<string>(), [])
  const relatedEdgeIds = useMemo(
    () => new Set(edges.map((edge) => edge.id)),
    [edges],
  )

  return (
    <main
      className={styles.page}
      data-large-text={
        graphicsOptions.largeText ? 'true' : 'false'
      }
      aria-busy={loading || routeLoading}
    >
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
        quality={quality}
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
        libraryNavigationRequest={navigationRequest}
        libraryGraphicsOptions={graphicsOptions}
        inputBlocked={
          Boolean(article) ||
          Boolean(readingBook) ||
          searchOpen ||
          searchInputFocused ||
          routeLoading
        }
        onZoomChange={() => {}}
        onPanChange={() => {}}
        onNodeHover={(node) => setHoveredId(node?._id ?? null)}
        onNodeSelect={(node) => {
          setSelectedId(node._id)
          document.exitPointerLock?.()
        }}
        onBookSelect={(nodeId, bookIndex, returnState) => {
          const shelf = shelves.find((item) => item.id === nodeId)
          const selectedBook = shelf?.articles[bookIndex]
          if (selectedBook) {
            setReadingBook({nodeId, index: bookIndex})
            emitLibraryAudioCue('book-open')
            emitLibraryEvent('book_open', {
              shelfId: nodeId,
              bookId: returnState.bookId,
              articleId: selectedBook.id,
            })
            void openArticle(selectedBook, returnState)
          }
        }}
        onBookFocusChange={handleBookFocusChange}
        onLibraryContextChange={handleLibraryContextChange}
        onFlightNavigationChange={setNavigation}
        onBackgroundClick={() => setSelectedId(null)}
        onProjectionChange={() => {}}
        onDiveStateChange={() => {}}
        onDiveDreamChange={() => {}}
        onFlightModeChange={setFlightMode}
        onLibraryMovementModeChange={setMovementMode}
      />

      {controlsHintVisible && !loading && !article && (
        <aside className={styles.controlsHint} aria-live="polite">
          <strong>Explore the DEV Library</strong>
          <span>WASD — Move</span>
          <span>Mouse — Look</span>
          <span>E / Click — Read</span>
        </aside>
      )}

      {roomAnnouncement && !article && (
        <div className={styles.roomAnnouncement} aria-live="polite">
          <span>Entering</span>
          <strong>{roomAnnouncement}</strong>
        </div>
      )}

      {!article && (currentDistrict || currentContextShelf) && (
        <nav className={styles.spatialBreadcrumb} aria-label="Library location">
          <span>DEV Library</span>
          {currentDistrict && <strong>{currentDistrict.label}</strong>}
          {currentContextShelf && (
            <em>{currentContextShelf.slotId}</em>
          )}
        </nav>
      )}

      {focusedArticle && focusedShelf && !article && !searchOpen && (
        <aside className={styles.bookPreview} aria-live="polite">
          <p>{focusedShelf.title}</p>
          <h2>{focusedArticle.title}</h2>
          <span>
            {focusedArticle.user.name ||
              `@${focusedArticle.user.username}`}
            {focusedArticle.reading_time_minutes
              ? ` · ${focusedArticle.reading_time_minutes} min read`
              : ''}
          </span>
          {focusedArticle.tag_list.length > 0 && (
            <small>
              {focusedArticle.tag_list
                .slice(0, 3)
                .map((tag) => `#${tag}`)
                .join('  ')}
            </small>
          )}
          <b>E / Click — Read</b>
        </aside>
      )}

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
            onFocus={() => {
              setSearchInputFocused(true)
              document.exitPointerLock?.()
            }}
            onBlur={() => setSearchInputFocused(false)}
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
            data-active={graphicsOpen ? 'true' : 'false'}
            onClick={() => setGraphicsOpen((current) => !current)}
            aria-expanded={graphicsOpen}
            aria-controls="library-graphics-panel"
            title="Graphics options"
          >
            ⚙ {QUALITY_LABELS[quality].toUpperCase()}
          </button>
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
            {nearTopics && topicSlotCapacity > 0
              ? ' · LIVING TOPICS ' +
                occupiedTopicShelfCount +
                '/' +
                topicSlotCapacity +
                ' OCCUPIED' +
                (newTopicShelfCount > 0
                  ? ' · ' + newTopicShelfCount + ' NEW'
                  : ' · NO NEW CANDIDATES')
              : ''}
          </small>
        </div>
      </header>

      {graphicsOpen && (
        <aside
          id="library-graphics-panel"
          className={styles.graphicsPanel}
        >
          <div className={styles.graphicsHeader}>
            <div>
              <strong>Graphics</strong>
              <small>Changes apply immediately</small>
            </div>
            <button
              type="button"
              onClick={() => setGraphicsOpen(false)}
              aria-label="Close graphics settings"
            >
              ×
            </button>
          </div>

          <label className={styles.graphicsPreset}>
            <span>Preset</span>
            <select
              value={quality}
              onChange={(event) =>
                setQuality(event.target.value as DreamQuality)
              }
            >
              <option value="low">Low · fastest</option>
              <option value="medium">Medium · recommended</option>
              <option value="high">High</option>
              <option value="cinematic">Cinematic · expensive</option>
            </select>
          </label>

          <p className={styles.graphicsHint}>
            {quality === 'low'
              ? '1× render scale · minimal dynamic lighting'
              : quality === 'medium'
                ? '1.2× render scale · reduced dynamic lighting'
                : quality === 'high'
                  ? '1.5× render scale · detailed lighting'
                  : '1.85× render scale · full lighting and effects'}
          </p>

          <label className={styles.graphicsToggleRow}>
            <span>
              <strong>Bloom</strong>
              <small>Lamp glow and emissive halo pass</small>
            </span>
            <input
              type="checkbox"
              checked={graphicsOptions.bloom}
              onChange={(event) =>
                setGraphicsOptions((current) => ({
                  ...current,
                  bloom: event.target.checked,
                }))
              }
            />
          </label>

          <label className={styles.graphicsToggleRow}>
            <span>
              <strong>Shadows</strong>
              <small>Shadow-map rendering where supported</small>
            </span>
            <input
              type="checkbox"
              checked={graphicsOptions.shadows}
              onChange={(event) =>
                setGraphicsOptions((current) => ({
                  ...current,
                  shadows: event.target.checked,
                }))
              }
            />
          </label>

          <label className={styles.graphicsToggleRow}>
            <span>
              <strong>Reduce motion</strong>
              <small>Freeze ambient floating props, bob, and shimmer</small>
            </span>
            <input
              type="checkbox"
              checked={graphicsOptions.reducedMotion}
              onChange={(event) =>
                setGraphicsOptions((current) => ({
                  ...current,
                  reducedMotion: event.target.checked,
                }))
              }
            />
          </label>

          <label className={styles.graphicsToggleRow}>
            <span>
              <strong>Larger text</strong>
              <small>Increase reader and interaction text size</small>
            </span>
            <input
              type="checkbox"
              checked={graphicsOptions.largeText}
              onChange={(event) =>
                setGraphicsOptions((current) => ({
                  ...current,
                  largeText: event.target.checked,
                }))
              }
            />
          </label>

          <button
            type="button"
            className={styles.graphicsReset}
            onClick={() => {
              setQuality(DEFAULT_LIBRARY_QUALITY)
              setGraphicsOptions(
                DEFAULT_LIBRARY_GRAPHICS_OPTIONS,
              )
            }}
          >
            Reset to Medium
          </button>
        </aside>
      )}

      {loading && (
        <div
          className={styles.loading}
          role="status"
          aria-live="polite"
        >
          <span>✦</span>
          <strong>Opening the DEV Library…</strong>
          <small>Mapping rooms, shelves, and live DEV articles</small>
        </div>
      )}

      {routeLoading && !loading && !article && (
        <div
          className={styles.activityToast}
          role="status"
          aria-live="polite"
        >
          <span className={styles.activityPulse} />
          <strong>Fetching from DEV…</strong>
        </div>
      )}

      {error && (
        <button
          className={styles.error}
          onClick={() => setError(null)}
          role="alert"
        >
          {error} · dismiss
        </button>
      )}

      {searchOpen && !article && (
        <aside className={styles.searchPanel} aria-label="DEV search results">
          <button
            className={styles.close}
            onClick={() => {
              setSearchInputFocused(false)
              resumeFirstPersonControls()
              setSearchOpen(false)
            }}
            aria-label="Close search results"
          >
            ×
          </button>
          <p className={styles.eyebrow}>Physical catalogue search</p>
          <h1>{query.trim() || 'Search results'}</h1>
          <p className={styles.subtitle}>
            Choose a result to travel to its book in the library.
          </p>
          <div className={styles.searchResultList}>
            {searchResults.length === 0 ? (
              <p className={styles.emptyShelf}>
                No DEV articles matched this search.
              </p>
            ) : (
              searchResults.slice(0, 24).map((result) => {
                const location = articleLocations.get(result.id)
                return (
                  <article className={styles.searchResult} key={result.id}>
                    <div>
                      <strong>{result.title}</strong>
                      <small>
                        @{result.user.username}
                        {result.reading_time_minutes
                          ? ` · ${result.reading_time_minutes} min`
                          : ''}
                      </small>
                      <span>
                        {location
                          ? `Located in: ${location.roomLabel} → ${location.shelf.title} → ${location.shelf.slotId}`
                          : 'Not shelved yet — opens directly in the reader'}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => takeSearchResultToLibrary(result)}
                    >
                      {location ? 'Take me there' : 'Read article'}
                    </button>
                  </article>
                )
              })
            )}
          </div>
        </aside>
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
                    : 'This shelf is resting while the catalogue catches up.'}
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
          <div
            className={styles.readerCard}
            onScroll={handleReaderScroll}
          >
            <button
              className={styles.readerReturn}
              onClick={closeArticleReader}
              aria-label="Return to the same book in the library"
            >
              ← Return to Library
            </button>
            <p className={styles.eyebrow}>
              {article.user.name || `@${article.user.username}`} · DEV
            </p>
            <h1>{article.title}</h1>
            <p className={styles.readerMeta}>
              @{article.user.username}
              {article.readable_publish_date ? ' · ' : ''}
              {article.readable_publish_date ?? ''}
              {article.reading_time_minutes
                ? ' · ' + article.reading_time_minutes + ' min read'
                : ''}
            </p>
            {article.tag_list.length > 0 && (
              <div className={styles.readerTags}>
                {article.tag_list.slice(0, 5).map((tag) => (
                  <span key={tag}>#{tag}</span>
                ))}
              </div>
            )}
            {articleHeroImage && (
              <img
                className={styles.readerHeroImage}
                src={articleHeroImage}
                alt=""
                loading="eager"
                decoding="async"
                onError={(event) => {
                  event.currentTarget.hidden = true
                }}
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
