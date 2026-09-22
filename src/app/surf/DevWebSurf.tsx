'use client'

import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import DevWebSurf3D from './DevWebSurf3D'
import type {
  DevArticle,
  DevArticleSummary,
  DevBootstrap,
  DevTag,
  DevUser,
  LibrarySection,
  SurfEdge,
  SurfNode,
} from './types'
import styles from './surf.module.css'

const DEFAULT_USERNAME = 'mikachu'

const SECTION_COPY: Record<
  LibrarySection,
  {title: string; subtitle: string; accent: string}
> = {
  atrium: {
    title: 'DEV Library',
    subtitle: 'information atrium',
    accent: '#d8b879',
  },
  featured: {
    title: 'Featured Reading Hall',
    subtitle: 'popular this week',
    accent: '#d8b879',
  },
  latest: {
    title: 'New Arrivals',
    subtitle: 'freshly published',
    accent: '#67cfd0',
  },
  topics: {
    title: 'Topic Wings',
    subtitle: 'browse by tag',
    accent: '#62d7a5',
  },
  creators: {
    title: 'Creator Studies',
    subtitle: 'authors and their collections',
    accent: '#a98ae5',
  },
  search: {
    title: 'Card Catalog',
    subtitle: 'search the live collection',
    accent: '#e5b760',
  },
  archive: {
    title: 'Deep Archive',
    subtitle: 'older shelves and long-tail pages',
    accent: '#7a8794',
  },
}

function articleImportance(article: DevArticleSummary) {
  const reactions =
    article.public_reactions_count ??
    article.positive_reactions_count ??
    0
  const comments = article.comments_count ?? 0
  return Math.min(
    2.2,
    .45 + Math.log10(1 + reactions + comments * 1.5) * .45,
  )
}

function safeTagColor(tag: DevTag | undefined) {
  const candidate = tag?.bg_color_hex
  if (candidate && /^#[0-9a-f]{6}$/i.test(candidate)) return candidate
  return SECTION_COPY.topics.accent
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

function shelfPosition(
  section: LibrarySection,
  index: number,
): [number, number, number] {
  const level = index % 3
  const slot = Math.floor(index / 3)
  const y = .62 + level * 1.05

  if (section === 'featured') {
    const side = slot % 2 === 0 ? -4.8 : 4.8
    return [side, y, -9.2 - Math.floor(slot / 2) * 2.1]
  }

  if (section === 'latest') {
    const x = slot % 2 === 0 ? -14.7 : -11.2
    return [x, y, -8.8 - Math.floor(slot / 2) * 2.15]
  }

  if (section === 'creators') {
    const x = slot % 2 === 0 ? 11.2 : 14.7
    return [x, y, -23.7 - Math.floor(slot / 2) * 2.05]
  }

  if (section === 'search') {
    const x = slot % 2 === 0 ? -14.7 : -11.2
    return [x, y, -23.7 - Math.floor(slot / 2) * 2.05]
  }

  if (section === 'archive') {
    const side = slot % 2 === 0 ? -4.5 : 4.5
    return [side, y, -38.2 - Math.floor(slot / 2) * 1.8]
  }

  return [0, y, -12 - slot * 1.5]
}

function buildLibraryGraph(
  bootstrap: DevBootstrap,
  dynamicArticles: DevArticleSummary[],
  dynamicLabel: string | null,
) {
  const nodes: SurfNode[] = []
  const edges: SurfEdge[] = []
  const ids = new Set<string>()

  const addNode = (node: SurfNode) => {
    if (ids.has(node.id)) return
    ids.add(node.id)
    nodes.push(node)
  }

  const addEdge = (edge: SurfEdge) => {
    if (!ids.has(edge.source) || !ids.has(edge.target)) return
    if (edges.some((candidate) => candidate.id === edge.id)) return
    edges.push(edge)
  }

  addNode({
    id: 'dev-home',
    kind: 'home',
    title: 'DEV Library',
    subtitle: 'information atrium',
    href: 'https://dev.to/',
    section: 'atrium',
    position: [0, .55, 7],
    importance: 2,
    accent: SECTION_COPY.atrium.accent,
  })

  const sections: Array<{
    id: string
    section: LibrarySection
    position: [number, number, number]
  }> = [
    {id: 'section:featured', section: 'featured', position: [0, 1.3, -5]},
    {id: 'section:latest', section: 'latest', position: [-10.3, 1.3, -5]},
    {id: 'section:topics', section: 'topics', position: [10.3, 1.3, -5]},
    {id: 'section:creators', section: 'creators', position: [10.3, 1.3, -20.4]},
    {id: 'section:search', section: 'search', position: [-10.3, 1.3, -20.4]},
    {id: 'section:archive', section: 'archive', position: [0, 1.3, -34.2]},
  ]

  sections.forEach(({id, section, position}) => {
    const copy = SECTION_COPY[section]
    addNode({
      id,
      kind: 'section',
      title: copy.title,
      subtitle: copy.subtitle,
      section,
      position,
      importance: 1.7,
      accent: copy.accent,
    })
    addEdge({
      id: 'corridor:' + section,
      source: 'dev-home',
      target: id,
      weight: 2.2,
      kind: 'corridor',
    })
  })

  const featured = bootstrap.feed.slice(0, 14)
  featured.forEach((article, index) => {
    const id = 'article:' + article.id
    addNode({
      id,
      kind: 'article',
      title: article.title,
      subtitle:
        '@' +
        article.user.username +
        ' · ' +
        (article.readable_publish_date ?? 'featured'),
      href: article.url,
      articleId: article.id,
      username: article.user.username,
      section: 'featured',
      payload: article,
      position: shelfPosition('featured', index),
      importance: articleImportance(article) + .2,
      accent: '#d6b36c',
    })
    addEdge({
      id: 'featured:' + article.id,
      source: 'section:featured',
      target: id,
      weight: 1.8 + articleImportance(article),
      kind: 'feed',
    })
  })

  const featuredIds = new Set(featured.map((article) => article.id))
  const latest = bootstrap.latest
    .filter((article) => !featuredIds.has(article.id))
    .slice(0, 18)

  latest.forEach((article, index) => {
    const id = 'article:' + article.id
    addNode({
      id,
      kind: 'article',
      title: article.title,
      subtitle:
        '@' +
        article.user.username +
        ' · ' +
        (article.readable_publish_date ?? 'new'),
      href: article.url,
      articleId: article.id,
      username: article.user.username,
      section: 'latest',
      payload: article,
      position: shelfPosition('latest', index),
      importance: articleImportance(article),
      accent: SECTION_COPY.latest.accent,
    })
    addEdge({
      id: 'latest:' + article.id,
      source: 'section:latest',
      target: id,
      weight: 1.45 + articleImportance(article),
      kind: 'feed',
    })
  })

  bootstrap.tags.slice(0, 10).forEach((tag, index) => {
    const id = 'tag:' + tag.name
    const column = index % 2
    const row = Math.floor(index / 2)
    addNode({
      id,
      kind: 'tag',
      title: '#' + tag.name,
      subtitle: 'topic doorway',
      href: 'https://dev.to/t/' + tag.name,
      tag: tag.name,
      section: 'topics',
      position: [
        column === 0 ? 11.1 : 14.6,
        1.15,
        -9.3 - row * 2.7,
      ],
      importance: 1.1,
      accent: safeTagColor(tag),
    })
    addEdge({
      id: 'topic:' + tag.name,
      source: 'section:topics',
      target: id,
      weight: 1.6,
      kind: 'tag',
    })
  })

  const allPublic = [...featured, ...latest]
  const authors = new Map<string, DevArticleSummary[]>()
  allPublic.forEach((article) => {
    const current = authors.get(article.user.username) ?? []
    current.push(article)
    authors.set(article.user.username, current)
  })

  const creatorNames = [...authors.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 6)

  creatorNames.forEach(([username, articles], index) => {
    const id = 'profile:' + username
    addNode({
      id,
      kind: 'profile',
      title: '@' + username,
      subtitle: articles[0]?.user.name ?? 'DEV creator',
      href: 'https://dev.to/' + username,
      username,
      section: 'creators',
      position: [
        index % 2 === 0 ? 11.2 : 14.7,
        1.2,
        -22.5 - Math.floor(index / 2) * 3,
      ],
      importance: 1 + articles.length * .12,
      accent: SECTION_COPY.creators.accent,
    })
    addEdge({
      id: 'creator:' + username,
      source: 'section:creators',
      target: id,
      weight: 1.7,
      kind: 'author',
    })
  })

  if (bootstrap.profile) {
    const profileId = 'profile:' + bootstrap.profile.username
    addNode({
      id: profileId,
      kind: 'profile',
      title: '@' + bootstrap.profile.username,
      subtitle: bootstrap.profile.name,
      href: 'https://dev.to/' + bootstrap.profile.username,
      username: bootstrap.profile.username,
      section: 'creators',
      position: [13, 1.25, -20.8],
      importance: 2,
      accent: '#c09aff',
    })
    addEdge({
      id: 'creator:primary',
      source: 'section:creators',
      target: profileId,
      weight: 2.4,
      kind: 'author',
    })

    const mine = bootstrap.profileArticles.slice(0, 14)
    const recentMine = mine.slice(0, 8)
    const archivedMine = mine.slice(8, 14)

    recentMine.forEach((article, index) => {
      const id = 'article:' + article.id
      if (!ids.has(id)) {
        addNode({
          id,
          kind: 'article',
          title: article.title,
          subtitle: '@' + bootstrap.profile!.username,
          href: article.url,
          articleId: article.id,
          username: article.user.username,
          section: 'creators',
          payload: article,
          position: shelfPosition('creators', index),
          importance: articleImportance(article) + .18,
          accent: '#b28be8',
        })
      }
      addEdge({
        id: 'primary-article:' + article.id,
        source: profileId,
        target: id,
        weight: 2,
        kind: 'author',
      })
    })

    archivedMine.forEach((article, index) => {
      const id = 'article:' + article.id
      if (!ids.has(id)) {
        addNode({
          id,
          kind: 'article',
          title: article.title,
          subtitle: '@' + bootstrap.profile!.username + ' · archive',
          href: article.url,
          articleId: article.id,
          username: article.user.username,
          section: 'archive',
          payload: article,
          position: shelfPosition('archive', index),
          importance: articleImportance(article),
          accent: SECTION_COPY.archive.accent,
        })
      }
      addEdge({
        id: 'archive-article:' + article.id,
        source: 'section:archive',
        target: id,
        weight: 1.2,
        kind: 'author',
      })
    })
  }

  if (dynamicLabel && dynamicArticles.length) {
    const isTag = dynamicLabel.startsWith('#')
    const isProfile = dynamicLabel.startsWith('@')
    const section: LibrarySection = isTag
      ? 'topics'
      : isProfile
        ? 'creators'
        : 'search'
    const hubId = isTag
      ? 'tag:' + dynamicLabel.slice(1)
      : isProfile
        ? 'profile:' + dynamicLabel.slice(1)
        : 'search:active'

    if (!ids.has(hubId)) {
      addNode({
        id: hubId,
        kind: isTag ? 'tag' : isProfile ? 'profile' : 'search',
        title: dynamicLabel,
        subtitle: isTag
          ? 'live topic wing'
          : isProfile
            ? 'live creator study'
            : 'temporary search aisle',
        tag: isTag ? dynamicLabel.slice(1) : undefined,
        username: isProfile ? dynamicLabel.slice(1) : undefined,
        section,
        position:
          section === 'topics'
            ? [13, 1.2, -20.4]
            : section === 'creators'
              ? [13, 1.2, -28.5]
              : [-13, 1.1, -22.4],
        importance: 1.8,
        accent: SECTION_COPY[section].accent,
      })
    }

    dynamicArticles.slice(0, 15).forEach((article, index) => {
      const id = 'article:' + article.id
      if (!ids.has(id)) {
        addNode({
          id,
          kind: 'article',
          title: article.title,
          subtitle: '@' + article.user.username,
          href: article.url,
          articleId: article.id,
          username: article.user.username,
          section,
          payload: article,
          position: shelfPosition(section, index),
          importance: articleImportance(article),
          accent: SECTION_COPY[section].accent,
        })
      }
      addEdge({
        id: 'dynamic:' + hubId + ':' + article.id,
        source: hubId,
        target: id,
        weight: 1.5,
        kind: isTag ? 'tag' : isProfile ? 'author' : 'search',
      })
    })
  }

  return {nodes, edges}
}

export default function DevWebSurf() {
  const searchInputRef = useRef<HTMLInputElement | null>(null)

  const [bootstrap, setBootstrap] = useState<DevBootstrap | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [hovered, setHovered] = useState<SurfNode | null>(null)
  const [activeNode, setActiveNode] = useState<SurfNode | null>(null)
  const [article, setArticle] = useState<DevArticle | null>(null)
  const [profile, setProfile] = useState<DevUser | null>(null)
  const [profileArticles, setProfileArticles] = useState<
    DevArticleSummary[]
  >([])
  const [dynamicArticles, setDynamicArticles] = useState<
    DevArticleSummary[]
  >([])
  const [dynamicLabel, setDynamicLabel] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [routeLoading, setRouteLoading] = useState(false)
  const [locked, setLocked] = useState(false)
  const [currentSection, setCurrentSection] =
    useState<LibrarySection>('atrium')
  const [routeTargetId, setRouteTargetId] = useState<string | null>(null)
  const [travelRequest, setTravelRequest] = useState<{
    id: string
    nonce: number
  } | null>(null)
  const [travelNonce, setTravelNonce] = useState(0)
  const [visited, setVisited] = useState<
    Array<{id: string; title: string}>
  >([{id: 'dev-home', title: 'Atrium'}])
  const [directoryOpen, setDirectoryOpen] = useState(true)

  useEffect(() => {
    let cancelled = false

    fetch(
      '/api/devto?mode=bootstrap&username=' +
        encodeURIComponent(DEFAULT_USERNAME),
    )
      .then(async (response) => {
        const data = (await response.json()) as DevBootstrap & {error?: string}
        if (!response.ok) throw new Error(data.error ?? 'Could not load DEV')
        return data
      })
      .then((data) => {
        if (cancelled) return
        setBootstrap(data)
        setProfile(data.profile)
      })
      .catch((nextError) => {
        if (!cancelled) {
          setError(
            nextError instanceof Error
              ? nextError.message
              : 'Could not load DEV',
          )
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  const graph = useMemo(
    () =>
      bootstrap
        ? buildLibraryGraph(bootstrap, dynamicArticles, dynamicLabel)
        : {nodes: [], edges: []},
    [bootstrap, dynamicArticles, dynamicLabel],
  )

  const fetchArticle = useCallback(async (node: SurfNode) => {
    if (!node.articleId) return
    setRouteLoading(true)
    setProfile(null)

    try {
      const response = await fetch(
        '/api/devto?mode=article&id=' + node.articleId,
      )
      const data = (await response.json()) as {
        article?: DevArticle
        error?: string
      }
      if (!response.ok || !data.article) {
        throw new Error(data.error ?? 'Article failed to load')
      }
      setArticle(data.article)
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : 'Article failed to load',
      )
    } finally {
      setRouteLoading(false)
    }
  }, [])

  const fetchProfile = useCallback(async (username: string) => {
    setRouteLoading(true)
    setArticle(null)

    try {
      const response = await fetch(
        '/api/devto?mode=profile&username=' +
          encodeURIComponent(username),
      )
      const data = (await response.json()) as {
        profile?: DevUser
        articles?: DevArticleSummary[]
        error?: string
      }
      if (!response.ok || !data.profile) {
        throw new Error(data.error ?? 'Profile failed to load')
      }
      setProfile(data.profile)
      setProfileArticles(data.articles ?? [])
      setDynamicArticles(data.articles ?? [])
      setDynamicLabel('@' + data.profile.username)
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : 'Profile failed to load',
      )
    } finally {
      setRouteLoading(false)
    }
  }, [])

  const loadTag = useCallback(async (tag: string) => {
    setRouteLoading(true)
    setArticle(null)
    setProfile(null)
    setSelectedId('tag:' + tag)
    setActiveNode({
      id: 'tag:' + tag,
      kind: 'tag',
      title: '#' + tag,
      subtitle: 'topic doorway',
      href: 'https://dev.to/t/' + tag,
      tag,
      section: 'topics',
      position: [13, 1.2, -20.4],
      importance: 1.3,
      accent: SECTION_COPY.topics.accent,
    })

    try {
      const response = await fetch(
        '/api/devto?mode=tag&tag=' + encodeURIComponent(tag),
      )
      const data = (await response.json()) as {
        articles?: DevArticleSummary[]
        error?: string
      }
      if (!response.ok) throw new Error(data.error ?? 'Tag failed to load')
      setDynamicArticles(data.articles ?? [])
      setDynamicLabel('#' + tag)
      setRouteTargetId('tag:' + tag)
    } catch (nextError) {
      setError(
        nextError instanceof Error ? nextError.message : 'Tag failed to load',
      )
    } finally {
      setRouteLoading(false)
    }
  }, [])

  const inspectNode = useCallback(
    (node: SurfNode) => {
      setSelectedId(node.id)
      setActiveNode(node)
      setError(null)
      setVisited((current) => {
        const next = [
          ...current.filter((item) => item.id !== node.id),
          {id: node.id, title: node.title},
        ]
        return next.slice(-6)
      })

      const route =
        node.kind === 'article'
          ? node.payload?.path ?? '/'
          : node.kind === 'profile'
            ? '/' + (node.username ?? '')
            : node.kind === 'tag'
              ? '/t/' + (node.tag ?? '')
              : node.kind === 'section'
                ? '/library/' + (node.section ?? 'atrium')
                : node.kind === 'search'
                  ? '/search'
                  : '/'

      window.history.replaceState(
        null,
        '',
        '/surf?to=' + encodeURIComponent(route),
      )

      if (node.kind === 'article') {
        void fetchArticle(node)
      } else if (node.kind === 'profile' && node.username) {
        void fetchProfile(node.username)
      } else if (node.kind === 'tag' && node.tag) {
        void loadTag(node.tag)
      } else if (node.kind === 'home') {
        setArticle(null)
        setProfile(bootstrap?.profile ?? null)
        setProfileArticles(bootstrap?.profileArticles ?? [])
      } else {
        setArticle(null)
      }
    },
    [bootstrap, fetchArticle, fetchProfile, loadTag],
  )

  function walkTo(id: string) {
    setRouteTargetId(id)
    setActiveNode(null)
    setSelectedId(null)
    setDirectoryOpen(false)
    if (document.pointerLockElement) return
  }

  function jumpTo(id: string) {
    const next = travelNonce + 1
    setTravelNonce(next)
    setRouteTargetId(id)
    setTravelRequest({id, nonce: next})
    setDirectoryOpen(false)
  }

  function surpriseMe() {
    const candidates = graph.nodes.filter(
      (node) => node.kind === 'article' && node.articleId,
    )
    if (!candidates.length) return
    const visitedIds = new Set(visited.map((item) => item.id))
    const unvisited = candidates.filter((node) => !visitedIds.has(node.id))
    const pool = unvisited.length ? unvisited : candidates
    const index = visited.length % pool.length
    jumpTo(pool[index].id)
  }

  async function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const value = query.trim()
    if (!value) return

    setRouteLoading(true)
    setError(null)

    try {
      if (value.startsWith('@')) {
        const username = value.slice(1).trim()
        const response = await fetch(
          '/api/devto?mode=profile&username=' +
            encodeURIComponent(username),
        )
        const data = (await response.json()) as {
          profile?: DevUser
          articles?: DevArticleSummary[]
          error?: string
        }
        if (!response.ok || !data.profile) {
          throw new Error(data.error ?? 'Profile not found')
        }

        setProfile(data.profile)
        setProfileArticles(data.articles ?? [])
        setArticle(null)
        setDynamicArticles(data.articles ?? [])
        setDynamicLabel('@' + data.profile.username)
        setRouteTargetId('profile:' + data.profile.username)
        setActiveNode({
          id: 'profile:' + data.profile.username,
          kind: 'profile',
          title: '@' + data.profile.username,
          subtitle: data.profile.name,
          href: 'https://dev.to/' + data.profile.username,
          username: data.profile.username,
          section: 'creators',
          position: [13, 1.2, -28.5],
          importance: 1.8,
          accent: SECTION_COPY.creators.accent,
        })
      } else if (value.startsWith('#')) {
        await loadTag(value.slice(1).trim())
      } else {
        const response = await fetch(
          '/api/devto?mode=search&q=' + encodeURIComponent(value),
        )
        const data = (await response.json()) as {
          articles?: DevArticleSummary[]
          error?: string
        }
        if (!response.ok) throw new Error(data.error ?? 'Search failed')
        setDynamicArticles(data.articles ?? [])
        setDynamicLabel('search: ' + value)
        setRouteTargetId('search:active')
        setActiveNode({
          id: 'search:active',
          kind: 'search',
          title: 'search: ' + value,
          subtitle: 'temporary search aisle',
          section: 'search',
          position: [-13, 1.1, -22.4],
          importance: 1.8,
          accent: SECTION_COPY.search.accent,
        })
      }
    } catch (nextError) {
      setError(
        nextError instanceof Error ? nextError.message : 'Search failed',
      )
    } finally {
      setRouteLoading(false)
    }
  }

  if (loading || !bootstrap) {
    return (
      <main className={styles.loadingScreen}>
        <div className={styles.loadingCore} aria-hidden="true" />
        <span>opening the dev library</span>
        <strong>Cataloging the live collection…</strong>
        {error && <small>{error}</small>}
      </main>
    )
  }

  const routeTarget = routeTargetId
    ? graph.nodes.find((node) => node.id === routeTargetId) ?? null
    : null

  const relatedArticles = article
    ? [
        ...bootstrap.feed,
        ...bootstrap.latest,
        ...bootstrap.profileArticles,
      ]
        .filter(
          (candidate, index, collection) =>
            candidate.id !== article.id &&
            candidate.tag_list.some((tag) =>
              article.tag_list.includes(tag),
            ) &&
            collection.findIndex((item) => item.id === candidate.id) === index,
        )
        .sort(
          (a, b) =>
            articleImportance(b) - articleImportance(a),
        )
        .slice(0, 4)
    : []

  const continueTarget =
    visited.length > 1
      ? visited[visited.length - 1]?.id
      : bootstrap.profile
        ? 'profile:' + bootstrap.profile.username
        : 'section:featured'

  const breadcrumb = [
    'DEV Library',
    SECTION_COPY[currentSection].title,
    activeNode?.title,
  ].filter(Boolean)

  return (
    <main className={styles.page}>
      <DevWebSurf3D
        nodes={graph.nodes}
        edges={graph.edges}
        selectedId={selectedId}
        routeTargetId={routeTargetId}
        travelRequest={travelRequest}
        onInspect={inspectNode}
        onTravel={(node) => {
          setRouteTargetId(null)
          inspectNode(node)
        }}
        onHover={setHovered}
        onPointerLockChange={setLocked}
        onZoneChange={setCurrentSection}
      />

      <header className={styles.chrome}>
        <button
          type="button"
          className={styles.brand}
          onClick={() => {
            setDirectoryOpen(true)
            setRouteTargetId('dev-home')
          }}
        >
          <b>DEV</b>
          <span>Library</span>
        </button>

        <form className={styles.addressBar} onSubmit={submitSearch}>
          <span aria-hidden="true">⌕</span>
          <input
            ref={searchInputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Ask the card catalog: article, @creator, #topic"
            aria-label="Search the DEV library"
          />
          <kbd>↵</kbd>
        </form>

        <div className={styles.connection}>
          <i className={locked ? styles.online : ''} />
          {locked ? 'walking' : 'cursor free'}
        </div>
      </header>

      <nav className={styles.breadcrumb} aria-label="Library location">
        {breadcrumb.map((item, index) => (
          <span key={item + ':' + index}>
            {index > 0 && <i>›</i>}
            {item}
          </span>
        ))}
      </nav>

      <button
        type="button"
        className={styles.directoryToggle}
        onClick={() => setDirectoryOpen((current) => !current)}
      >
        <span aria-hidden="true">☷</span>
        Directory
      </button>

      {directoryOpen && (
        <aside className={styles.directory}>
          <div className={styles.directoryHeading}>
            <span>DEV Library Directory</span>
            <button
              type="button"
              onClick={() => setDirectoryOpen(false)}
              aria-label="Close directory"
            >
              ×
            </button>
          </div>
          <p>
            Browse the collection like a place. Pick a wing and follow the
            illuminated floor route.
          </p>

          <div className={styles.directoryGrid}>
            <button type="button" onClick={() => walkTo(continueTarget)}>
              <b>Continue browsing</b>
              <small>return to your last page</small>
            </button>
            <button
              type="button"
              onClick={() => walkTo('section:featured')}
            >
              <b>Featured today</b>
              <small>popular reading hall</small>
            </button>
            <button
              type="button"
              onClick={() => walkTo('section:topics')}
            >
              <b>Explore topics</b>
              <small>tag wings and doorways</small>
            </button>
            <button
              type="button"
              onClick={() => walkTo('section:creators')}
            >
              <b>Creators</b>
              <small>author studies and collections</small>
            </button>
            <button
              type="button"
              onClick={() => {
                walkTo('section:search')
                window.setTimeout(() => searchInputRef.current?.focus(), 120)
              }}
            >
              <b>Search</b>
              <small>use the card catalog</small>
            </button>
            <button type="button" onClick={surpriseMe}>
              <b>Surprise me</b>
              <small>jump to an unread page</small>
            </button>
          </div>

          <button
            type="button"
            className={styles.archiveLink}
            onClick={() => walkTo('section:archive')}
          >
            Restricted stacks · Deep Archive →
          </button>
        </aside>
      )}

      {routeTarget && (
        <aside className={styles.routeCard}>
          <span>Floor route illuminated</span>
          <strong>{routeTarget.title}</strong>
          <p>{routeTarget.subtitle}</p>
          <div>
            <button
              type="button"
              onClick={() => {
                const canvas = document.querySelector('canvas')
                if (canvas instanceof HTMLCanvasElement) {
                  void canvas.requestPointerLock()
                }
              }}
            >
              Walk there
            </button>
            <button type="button" onClick={() => jumpTo(routeTarget.id)}>
              Jump there
            </button>
          </div>
        </aside>
      )}

      <div className={styles.reticle} aria-hidden="true">
        <i />
        <i />
      </div>

      <section className={styles.controls}>
        <span><kbd>WASD</kbd> walk</span>
        <span><kbd>mouse</kbd> look</span>
        <span><kbd>E</kbd> inspect</span>
        <span><kbd>F</kbd> travel</span>
        <span><kbd>Shift</kbd> hurry</span>
        <span><kbd>Esc</kbd> cursor</span>
      </section>

      {hovered && !activeNode && (
        <div className={styles.hoverCard}>
          <span>{hovered.kind}</span>
          <strong>{hovered.title}</strong>
          <small>E inspect · F travel</small>
        </div>
      )}

      {activeNode && (
        <aside
          className={
            activeNode.kind === 'article'
              ? styles.readingRoom
              : styles.pageLens
          }
        >
          <button
            type="button"
            className={styles.closeLens}
            onClick={() => {
              setActiveNode(null)
              setSelectedId(null)
              setArticle(null)
            }}
            aria-label="Close page"
          >
            ×
          </button>

          {routeLoading && (
            <div className={styles.routeLoading}>retrieving from catalog…</div>
          )}

          {activeNode.kind === 'home' && (
            <>
              <div className={styles.pageType}>Atrium · Information desk</div>
              <h1>DEV Library</h1>
              <p>
                The live DEV Community organized as a physical library.
                Popular posts fill the reading hall, new writing arrives in
                New Arrivals, tags become topic wings, and creators have their
                own studies.
              </p>
              <div className={styles.metrics}>
                <span><b>{bootstrap.feed.length}</b> featured pages</span>
                <span><b>{bootstrap.latest.length}</b> new arrivals</span>
                <span><b>{bootstrap.tags.length}</b> cataloged topics</span>
              </div>
              <div className={styles.pageActions}>
                <button
                  type="button"
                  onClick={() => setDirectoryOpen(true)}
                >
                  Open directory
                </button>
              </div>
            </>
          )}

          {activeNode.kind === 'section' && activeNode.section && (
            <>
              <div className={styles.pageType}>Library wing</div>
              <h1>{SECTION_COPY[activeNode.section].title}</h1>
              <p>{SECTION_COPY[activeNode.section].subtitle}</p>
              <div className={styles.pageActions}>
                <button
                  type="button"
                  onClick={() => {
                    setActiveNode(null)
                    setSelectedId(null)
                    setRouteTargetId(activeNode.id)
                  }}
                >
                  Follow floor route
                </button>
                <button
                  type="button"
                  onClick={() => jumpTo(activeNode.id)}
                >
                  Travel here
                </button>
              </div>
            </>
          )}

          {activeNode.kind === 'profile' && profile && (
            <>
              <div className={styles.pageType}>Creator Study</div>
              <div className={styles.profileHeader}>
                {profile.profile_image && (
                  <img
                    src={profile.profile_image}
                    alt=""
                    className={styles.avatar}
                  />
                )}
                <div>
                  <h1>{profile.name}</h1>
                  <strong>@{profile.username}</strong>
                </div>
              </div>
              <p>{profile.summary || 'DEV Community creator'}</p>
              <div className={styles.metrics}>
                <span><b>{profileArticles.length}</b> books on the shelf</span>
                {profile.location && <span>{profile.location}</span>}
                {profile.joined_at && <span>joined {profile.joined_at}</span>}
              </div>

              <div className={styles.collectionList}>
                {profileArticles.slice(0, 6).map((item) => (
                  <button
                    type="button"
                    key={item.id}
                    onClick={() => {
                      const node = graph.nodes.find(
                        (candidate) =>
                          candidate.id === 'article:' + item.id,
                      )
                      if (node) jumpTo(node.id)
                    }}
                  >
                    <span>{item.title}</span>
                    <small>{item.readable_publish_date}</small>
                  </button>
                ))}
              </div>

              <div className={styles.pageActions}>
                <a
                  href={'https://dev.to/' + profile.username}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open canonical profile ↗
                </a>
              </div>
            </>
          )}

          {activeNode.kind === 'article' && article && (
            <>
              <div className={styles.pageType}>Reading Room</div>
              <h1>{article.title}</h1>
              <div className={styles.articleMeta}>
                <span>@{article.user.username}</span>
                <span>{article.readable_publish_date}</span>
                <span>{article.reading_time_minutes ?? 0} min read</span>
              </div>
              <p className={styles.articleDescription}>
                {article.description}
              </p>

              <div className={styles.tags}>
                {article.tag_list.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => void loadTag(tag)}
                  >
                    #{tag} · doorway
                  </button>
                ))}
              </div>

              <div className={styles.articleBody}>
                {cleanMarkdown(article.body_markdown).slice(0, 6500)}
              </div>

              <div className={styles.metrics}>
                <span>
                  <b>{article.public_reactions_count ?? 0}</b> reactions
                </span>
                <span>
                  <b>{article.comments_count ?? 0}</b> comments
                </span>
              </div>

              <div className={styles.pageActions}>
                <button
                  type="button"
                  onClick={() => {
                    const username = article.user.username
                    setSelectedId('profile:' + username)
                    setActiveNode({
                      id: 'profile:' + username,
                      kind: 'profile',
                      title: '@' + username,
                      subtitle: article.user.name,
                      href: 'https://dev.to/' + username,
                      username,
                      section: 'creators',
                      position: [13, 1.2, -28.5],
                      importance: 1.6,
                      accent: SECTION_COPY.creators.accent,
                    })
                    setDynamicLabel('@' + username)
                    setRouteTargetId('profile:' + username)
                    void fetchProfile(username)
                  }}
                >
                  Enter @{article.user.username}&apos;s study
                </button>
                <a href={article.url} target="_blank" rel="noreferrer">
                  Open canonical article ↗
                </a>
              </div>

              {relatedArticles.length > 0 && (
                <section className={styles.relatedShelf}>
                  <span>Nearby shelf · related by topic</span>
                  <div>
                    {relatedArticles.map((item) => (
                      <button
                        type="button"
                        key={item.id}
                        onClick={() => {
                          const existing = graph.nodes.find(
                            (candidate) =>
                              candidate.id === 'article:' + item.id,
                          )
                          if (existing) {
                            jumpTo(existing.id)
                          } else {
                            setDynamicArticles((current) => [
                              item,
                              ...current.filter(
                                (candidate) => candidate.id !== item.id,
                              ),
                            ])
                            setDynamicLabel('related reading')
                            window.setTimeout(
                              () => jumpTo('article:' + item.id),
                              40,
                            )
                          }
                        }}
                      >
                        <b>{item.title}</b>
                        <small>@{item.user.username}</small>
                      </button>
                    ))}
                  </div>
                </section>
              )}
            </>
          )}

          {activeNode.kind === 'tag' && (
            <>
              <div className={styles.pageType}>Topic Wing</div>
              <h1>#{activeNode.tag}</h1>
              <p>
                The library is rebuilding this aisle from live pages carrying
                the same tag.
              </p>
              <div className={styles.metrics}>
                <span><b>{dynamicArticles.length}</b> matching books</span>
              </div>
              <div className={styles.collectionList}>
                {dynamicArticles.slice(0, 6).map((item) => (
                  <button
                    type="button"
                    key={item.id}
                    onClick={() => jumpTo('article:' + item.id)}
                  >
                    <span>{item.title}</span>
                    <small>@{item.user.username}</small>
                  </button>
                ))}
              </div>
            </>
          )}

          {activeNode.kind === 'search' && (
            <>
              <div className={styles.pageType}>Card Catalog</div>
              <h1>{dynamicLabel || 'Search'}</h1>
              <p>
                Search results have materialized as a temporary aisle in this
                wing.
              </p>
              <div className={styles.metrics}>
                <span><b>{dynamicArticles.length}</b> catalog matches</span>
              </div>
              <div className={styles.collectionList}>
                {dynamicArticles.slice(0, 6).map((item) => (
                  <button
                    type="button"
                    key={item.id}
                    onClick={() => jumpTo('article:' + item.id)}
                  >
                    <span>{item.title}</span>
                    <small>@{item.user.username}</small>
                  </button>
                ))}
              </div>
            </>
          )}
        </aside>
      )}

      {error && (
        <div className={styles.errorToast}>
          <strong>Catalog connection hiccup</strong>
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)}>×</button>
        </div>
      )}

      {!locked && !activeNode && !directoryOpen && (
        <div className={styles.capturePrompt}>
          <span>click inside the library</span>
          <strong>Capture pointer to walk the stacks</strong>
        </div>
      )}
    </main>
  )
}
