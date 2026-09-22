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
} from './DreamWorld3D'
import type {DreamQuality} from './dreamworld/quality'
import type {
  DevArticle,
  DevArticleSummary,
  DevBootstrap,
  LibraryShelf,
  LibraryShelfKind,
} from './libraryTypes'
import styles from './library.module.css'

const DEFAULT_USERNAME = 'mikachu'
const QUALITY: DreamQuality = 'cinematic'
const CATALOG_PAGE_SIZE = 100
const CATALOG_BOOKS_PER_SHELF = 9

function catalogShelfWorld(index: number): [number, number, number] {
  const angle = index * 1.17
  const radius = 11 + (index % 4) * 2.4
  return [
    Math.sin(angle) * radius,
    Math.cos(index * .71) * 7.2,
    -26 - index * 6.4,
  ]
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
  world: [number, number, number],
  articles: DevArticleSummary[],
): LibraryShelf {
  return {
    id,
    title,
    subtitle,
    kind,
    accent: SHELF_ACCENTS[kind],
    world,
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
  const [navigation, setNavigation] = useState<{
    nearestId: string | null
    routeTargetId: string | null
  }>({
    nearestId: null,
    routeTargetId: null,
  })

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

  useEffect(() => {
    let cancelled = false

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
  }, [loadMoreCatalog])

  useEffect(() => {
    if (!article) return

    const closeBookWithE = (event: KeyboardEvent) => {
      if (event.code !== 'KeyE') return
      event.preventDefault()
      event.stopPropagation()
      event.stopImmediatePropagation()
      setArticle(null)
    }

    window.addEventListener('keydown', closeBookWithE, true)
    return () =>
      window.removeEventListener('keydown', closeBookWithE, true)
  }, [article])

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

    const featured = takeFresh(bootstrap.feed, 9)
    const latest = takeFresh(bootstrap.latest, 9)
    const mine = takeFresh(bootstrap.profileArticles, 9)
    const remaining = catalog.filter((item) => !used.has(item.id))

    const result: LibraryShelf[] = [
      makeShelf(
        'shelf:featured',
        'Featured',
        'popular this week',
        'featured',
        [-10.5, 1, -7],
        featured,
      ),
      makeShelf(
        'shelf:new',
        'New',
        'freshly published',
        'latest',
        [1.5, 6.2, -12.5],
        latest,
      ),
      makeShelf(
        'shelf:mine',
        bootstrap.profile
          ? '@' + bootstrap.profile.username
          : 'My DEV',
        'creator shelf',
        'mine',
        [11.5, -1.8, -9.5],
        mine,
      ),
      makeShelf(
        'shelf:topics',
        'Topics',
        'choose a DEV tag',
        'topics',
        [-14.5, 7.5, -20.5],
        dynamicTitle?.startsWith('#') ? dynamicArticles : [],
      ),
      makeShelf(
        'shelf:creators',
        'Creators',
        'browse author shelves',
        'creators',
        [14.5, 8.8, -22.5],
        dynamicTitle?.startsWith('@') ? dynamicArticles : [],
      ),
    ]

    if (searchResults.length) {
      result.push(
        makeShelf(
          'shelf:search',
          'Search',
          query || 'search results',
          'search',
          [0, 11, -24],
          searchResults.slice(0, CATALOG_BOOKS_PER_SHELF),
        ),
      )
    }

    for (
      let offset = 0;
      offset < remaining.length;
      offset += CATALOG_BOOKS_PER_SHELF
    ) {
      const shelfIndex = Math.floor(
        offset / CATALOG_BOOKS_PER_SHELF,
      )
      const shelfArticles = remaining.slice(
        offset,
        offset + CATALOG_BOOKS_PER_SHELF,
      )
      result.push(
        makeShelf(
          'shelf:catalog:' + shelfIndex,
          'Catalog ' + String(shelfIndex + 1).padStart(3, '0'),
          'DEV catalogue · articles ' +
            String(offset + 1) +
            '–' +
            String(offset + shelfArticles.length),
          'catalog',
          catalogShelfWorld(shelfIndex),
          shelfArticles,
        ),
      )
    }

    return result
  }, [
    bootstrap,
    catalog,
    dynamicArticles,
    dynamicTitle,
    query,
    searchResults,
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
        libraryBooks: shelf.articles.slice(0, 9).map((article) => {
          const image = article.cover_image ?? article.social_image ?? undefined
          return {
            id: String(article.id),
            title: article.title,
            coverUrl: image
              ? '/api/devto?mode=image&variant=thumb&url=' +
                encodeURIComponent(image)
              : undefined,
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

  useEffect(() => {
    if (!catalogHasMore || catalogLoading || catalogShelfCount === 0) {
      return
    }

    const candidate =
      navigation.routeTargetId ?? navigation.nearestId
    if (!candidate?.startsWith('shelf:catalog:')) return

    const index = Number(candidate.split(':').at(-1))
    if (
      Number.isFinite(index) &&
      index >= catalogShelfCount - 3
    ) {
      void loadMoreCatalog()
    }
  }, [
    catalogHasMore,
    catalogLoading,
    catalogShelfCount,
    loadMoreCatalog,
    navigation.nearestId,
    navigation.routeTargetId,
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
        soundEnabled={false}
        introStage={4}
        diveExitRequest={0}
        diveBackRequest={0}
        diveTimelineProgress={1}
        observatoryMode={false}
        flightMode={flightMode}
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
            void openArticle(selectedBook)
          }
        }}
        onFlightNavigationChange={setNavigation}
        onBackgroundClick={() => setSelectedId(null)}
        onProjectionChange={() => {}}
        onDiveStateChange={() => {}}
        onDiveDreamChange={() => {}}
        onFlightModeChange={setFlightMode}
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
              R ROUTE → {routeShelf.title}
            </small>
          ) : (
            <small>
              R · fly to next shelf · E · inspect / close book
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
              onClick={() => setArticle(null)}
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
            <div className={styles.articleBody}>
              {cleanMarkdown(article.body_markdown) ||
                article.description}
            </div>
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
