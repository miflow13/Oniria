'use client'

import {
  FormEvent,
  useEffect,
  useMemo,
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

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        setLoading(true)
        const [bootstrapResponse, catalogResponse] = await Promise.all([
          fetch(
            '/api/devto?mode=bootstrap&username=' +
              encodeURIComponent(DEFAULT_USERNAME),
          ),
          fetch('/api/devto?mode=catalog&pages=3&per_page=60'),
        ])

        if (!bootstrapResponse.ok) {
          throw new Error('Could not load DEV library')
        }

        const bootstrapPayload =
          (await bootstrapResponse.json()) as DevBootstrap
        const catalogPayload = catalogResponse.ok
          ? ((await catalogResponse.json()) as {
              articles?: DevArticleSummary[]
            })
          : {articles: []}

        if (cancelled) return
        setBootstrap(bootstrapPayload)
        setCatalog(catalogPayload.articles ?? [])
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
  }, [])

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

    const featured = takeFresh(bootstrap.feed, 18)
    const latest = takeFresh(bootstrap.latest, 18)
    const mine = takeFresh(bootstrap.profileArticles, 18)
    const remaining = catalog.filter((item) => !used.has(item.id))

    const result: LibraryShelf[] = [
      makeShelf(
        'shelf:featured',
        'Featured',
        'popular this week',
        'featured',
        [-7.5, 1.5, -5.5],
        featured,
      ),
      makeShelf(
        'shelf:new',
        'New',
        'freshly published',
        'latest',
        [0, 4.4, -8.5],
        latest,
      ),
      makeShelf(
        'shelf:mine',
        bootstrap.profile
          ? '@' + bootstrap.profile.username
          : 'My DEV',
        'creator shelf',
        'mine',
        [7.8, .2, -6.4],
        mine,
      ),
      makeShelf(
        'shelf:catalog:a',
        'Deep Catalog I',
        'long-tail DEV',
        'catalog',
        [-11.2, -3.6, -13.8],
        remaining.slice(0, 18),
      ),
      makeShelf(
        'shelf:catalog:b',
        'Deep Catalog II',
        'long-tail DEV',
        'catalog',
        [0, -4.8, -16.2],
        remaining.slice(18, 36),
      ),
      makeShelf(
        'shelf:catalog:c',
        'Deep Catalog III',
        'long-tail DEV',
        'catalog',
        [11.4, -2.7, -14.6],
        remaining.slice(36, 54),
      ),
      makeShelf(
        'shelf:topics',
        'Topics',
        'choose a DEV tag',
        'topics',
        [-13.4, 5.4, -20.8],
        dynamicTitle?.startsWith('#') ? dynamicArticles : [],
      ),
      makeShelf(
        'shelf:creators',
        'Creators',
        'browse author shelves',
        'creators',
        [13.2, 5.8, -21.5],
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
          [0, 8.2, -23.5],
          searchResults,
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
        icon: '▤',
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
        coverImages: shelf.articles
          .map((article) => article.cover_image ?? article.social_image ?? null)
          .filter((url): url is string => Boolean(url))
          .filter((url, index, all) => all.indexOf(url) === index)
          .slice(0, 9),
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

        <div className={styles.status}>
          {hoveredShelf
            ? hoveredShelf.title
            : 'WASD · mouse · E inspect · R route'}
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
