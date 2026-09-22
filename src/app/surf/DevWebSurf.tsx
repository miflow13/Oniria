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
const STACK_FLOOR_COUNT = 4
const STACK_FLOOR_HEIGHT = 4.6
const STACK_BOOKS_PER_SHELF = 9
const STACK_SHELVES_PER_FLOOR = 20
const STACK_BOOKS_PER_FLOOR =
  STACK_BOOKS_PER_SHELF * STACK_SHELVES_PER_FLOOR

const SECTION_COPY: Record<
  LibrarySection,
  {title: string; subtitle: string; accent: string}
> = {
  atrium: {
    title: 'DEV Library',
    subtitle: 'information atrium',
    accent: '#f5f5f5',
  },
  featured: {
    title: 'Featured Reading Hall',
    subtitle: 'popular this week',
    accent: '#3b49df',
  },
  latest: {
    title: 'New Arrivals',
    subtitle: 'freshly published',
    accent: '#5b6cff',
  },
  topics: {
    title: 'Topic Wings',
    subtitle: 'browse by tag',
    accent: '#3b49df',
  },
  creators: {
    title: 'Creator Studies',
    subtitle: 'authors and their collections',
    accent: '#7c83ff',
  },
  search: {
    title: 'Card Catalog',
    subtitle: 'search the live collection',
    accent: '#3b49df',
  },
  archive: {
    title: 'Deep Archive',
    subtitle: 'older shelves and long-tail pages',
    accent: '#a3a3a3',
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

function articleTags(
  article: DevArticleSummary | DevArticle,
): string[] {
  const payload = article as unknown as {
    tag_list?: unknown
    tags?: unknown
  }
  const source: unknown = payload.tag_list ?? payload.tags

  if (Array.isArray(source)) {
    return source
      .filter((tag): tag is string => typeof tag === 'string')
      .map((tag: string) => tag.trim())
      .filter(Boolean)
  }

  if (typeof source === 'string') {
    return source
      .split(',')
      .map((tag: string) => tag.trim().replace(/^#/, ''))
      .filter(Boolean)
  }

  return []
}

function articleImage(
  article: DevArticleSummary | DevArticle,
): string | null {
  const payload = article as unknown as {
    cover_image?: unknown
    social_image?: unknown
  }

  if (
    typeof payload.cover_image === 'string' &&
    payload.cover_image.trim()
  ) {
    return payload.cover_image
  }

  if (
    typeof payload.social_image === 'string' &&
    payload.social_image.trim()
  ) {
    return payload.social_image
  }

  return null
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

type ShelfPlacement = Pick<
  SurfNode,
  | 'position'
  | 'rotationY'
  | 'shelfKey'
  | 'shelfLevel'
  | 'shelfSlot'
  | 'shelfOrder'
>

const SHELF_ANCHORS: Partial<
  Record<
    LibrarySection,
    Array<{
      id: string
      x: number
      z: number
      rotationY: number
      front: number
    }>
  >
> = {
  featured: [
    {id: 'featured-left', x: -4.9, z: -10, rotationY: 0, front: .42},
    {id: 'featured-right', x: 4.9, z: -10, rotationY: 0, front: .42},
    {id: 'featured-deep-left', x: -4.9, z: -17, rotationY: 0, front: .42},
    {id: 'featured-deep-right', x: 4.9, z: -17, rotationY: 0, front: .42},
  ],
  latest: [
    {id: 'latest-outer', x: -14.8, z: -10, rotationY: Math.PI / 2, front: .42},
    {id: 'latest-inner', x: -11.1, z: -10, rotationY: Math.PI / 2, front: .42},
    {id: 'latest-deep-outer', x: -14.8, z: -18, rotationY: Math.PI / 2, front: .42},
    {id: 'latest-deep-inner', x: -11.1, z: -18, rotationY: Math.PI / 2, front: .42},
  ],
  topics: [
    {id: 'topics-inner', x: 11.1, z: -10, rotationY: -Math.PI / 2, front: .42},
    {id: 'topics-outer', x: 14.8, z: -10, rotationY: -Math.PI / 2, front: .42},
    {id: 'topics-deep-inner', x: 11.1, z: -18, rotationY: -Math.PI / 2, front: .42},
    {id: 'topics-deep-outer', x: 14.8, z: -18, rotationY: -Math.PI / 2, front: .42},
  ],
  creators: [
    {id: 'creators-inner', x: 11.1, z: -25.5, rotationY: -Math.PI / 2, front: .42},
    {id: 'creators-outer', x: 14.8, z: -25.5, rotationY: -Math.PI / 2, front: .42},
  ],
  search: [
    {id: 'search-outer', x: -14.8, z: -25.5, rotationY: Math.PI / 2, front: .42},
    {id: 'search-inner', x: -11.1, z: -25.5, rotationY: Math.PI / 2, front: .42},
  ],
  archive: [
    {id: 'archive-left', x: -4.6, z: -39.5, rotationY: 0, front: .42},
    {id: 'archive-right', x: 4.6, z: -39.5, rotationY: 0, front: .42},
  ],
}

function shelfPlacement(
  section: LibrarySection,
  index: number,
): ShelfPlacement {
  const anchors = SHELF_ANCHORS[section]
  if (!anchors?.length) {
    return {
      position: [0, .74, -12 - index * 1.1],
      rotationY: 0,
      shelfKey: section + ':fallback',
      shelfLevel: 0,
      shelfSlot: index,
      shelfOrder: index,
    }
  }

  const booksPerShelf = 9
  const slotsPerLevel = 3
  const shelfIndex = Math.floor(index / booksPerShelf) % anchors.length
  const localIndex = index % booksPerShelf
  const level = Math.floor(localIndex / slotsPerLevel)
  const slot = localIndex % slotsPerLevel
  const anchor = anchors[shelfIndex]

  const localOffset = (slot - 1) * 1.02
  const y = .7 + level * 1.1

  let x = anchor.x
  let z = anchor.z + anchor.front

  if (Math.abs(anchor.rotationY) < .1) {
    x += localOffset
  } else {
    z += localOffset
    x += Math.sign(anchor.rotationY) * anchor.front
  }

  return {
    position: [x, y, z],
    rotationY: anchor.rotationY,
    shelfKey: section + ':' + anchor.id + ':level-' + level,
    shelfLevel: level,
    shelfSlot: slot,
    shelfOrder: localIndex,
  }
}

function stackPlacement(
  index: number,
): ShelfPlacement & {floor: number} {
  const floor =
    1 +
    Math.floor(index / STACK_BOOKS_PER_FLOOR) %
      STACK_FLOOR_COUNT
  const localIndex = index % STACK_BOOKS_PER_FLOOR
  const shelfIndex = Math.floor(
    localIndex / STACK_BOOKS_PER_SHELF,
  )
  const localShelfIndex =
    localIndex % STACK_BOOKS_PER_SHELF
  const row = Math.floor(shelfIndex / 2)
  const side = shelfIndex % 2
  const level = Math.floor(localShelfIndex / 3)
  const slot = localShelfIndex % 3

  const x = side === 0 ? -4.75 : 4.75
  const z = -5.8 - row * 3.85
  const localOffset = (slot - 1) * 1.02
  const y =
    floor * STACK_FLOOR_HEIGHT +
    .7 +
    level * 1.1

  return {
    floor,
    position: [x + localOffset, y, z + .42],
    rotationY: 0,
    shelfKey:
      'stack:' +
      floor +
      ':row-' +
      row +
      ':side-' +
      side +
      ':level-' +
      level,
    shelfLevel: level,
    shelfSlot: slot,
    shelfOrder: localShelfIndex,
  }
}

function buildLibraryGraph(
  bootstrap: DevBootstrap,
  dynamicArticles: DevArticleSummary[],
  dynamicLabel: string | null,
  stackArticles: DevArticleSummary[],
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
      ...shelfPlacement('featured', index),
      importance: articleImportance(article) + .2,
      accent: '#3b49df',
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
      ...shelfPlacement('latest', index),
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
      accent: '#7c83ff',
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
          ...shelfPlacement('creators', index),
          importance: articleImportance(article) + .18,
          accent: '#7c83ff',
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
          ...shelfPlacement('archive', index),
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

  if (stackArticles.length) {
    const curatedIds = new Set<number>([
      ...bootstrap.feed.map((article) => article.id),
      ...bootstrap.latest.map((article) => article.id),
      ...bootstrap.profileArticles.map((article) => article.id),
    ])

    const stackCatalog = stackArticles
      .filter((article) => !curatedIds.has(article.id))
      .slice(0, STACK_BOOKS_PER_FLOOR * STACK_FLOOR_COUNT)

    stackCatalog.forEach((article, index) => {
      const id = 'article:' + article.id
      if (ids.has(id)) return

      const placement = stackPlacement(index)
      addNode({
        id,
        kind: 'article',
        title: article.title,
        subtitle:
          'Stack ' +
          placement.floor +
          ' · @' +
          article.user.username,
        href: article.url,
        articleId: article.id,
        username: article.user.username,
        section: 'archive',
        payload: article,
        ...placement,
        importance: articleImportance(article) * .82,
        accent:
          placement.floor === 1
            ? '#4f6dff'
            : placement.floor === 2
              ? '#53d3ff'
              : placement.floor === 3
                ? '#ae7bff'
                : '#ff4fd8',
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
          ...shelfPlacement(section, index),
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
  const [stackArticles, setStackArticles] = useState<
    DevArticleSummary[]
  >([])
  const [stackLoading, setStackLoading] = useState(true)
  const [currentFloor, setCurrentFloor] = useState(0)
  const [floorNonce, setFloorNonce] = useState(0)
  const [floorRequest, setFloorRequest] = useState<{
    floor: number
    nonce: number
  } | null>(null)
  const [query, setQuery] = useState('')
  const [routeLoading, setRouteLoading] = useState(false)
  const [locked, setLocked] = useState(false)
  const [currentSection, setCurrentSection] =
    useState<LibrarySection>('atrium')
  const [routeTargetId, setRouteTargetId] = useState<string | null>(null)
  const [travelRequest, setTravelRequest] = useState<{
    id: string
    nonce: number
    inspectOnArrival: boolean
  } | null>(null)
  const [travelNonce, setTravelNonce] = useState(0)
  const [visited, setVisited] = useState<
    Array<{id: string; title: string}>
  >([{id: 'dev-home', title: 'Atrium'}])
  const [directoryOpen, setDirectoryOpen] = useState(true)
  const [readingOrigin, setReadingOrigin] = useState<SurfNode | null>(null)

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

  useEffect(() => {
    let cancelled = false
    setStackLoading(true)

    fetch('/api/devto?mode=stacks')
      .then(async (response) => {
        const data = (await response.json()) as {
          articles?: DevArticleSummary[]
          error?: string
        }
        if (!response.ok) {
          throw new Error(
            data.error ?? 'Could not load the deep stacks',
          )
        }
        return data.articles ?? []
      })
      .then((articles) => {
        if (cancelled) return
        const seen = new Set<number>()
        setStackArticles(
          articles.filter((article) => {
            if (seen.has(article.id)) return false
            seen.add(article.id)
            return true
          }),
        )
      })
      .catch((nextError) => {
        if (!cancelled) {
          setError(
            nextError instanceof Error
              ? nextError.message
              : 'Could not load the deep stacks',
          )
        }
      })
      .finally(() => {
        if (!cancelled) setStackLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  const graph = useMemo(
    () =>
      bootstrap
        ? buildLibraryGraph(
            bootstrap,
            dynamicArticles,
            dynamicLabel,
            stackArticles,
          )
        : {nodes: [], edges: []},
    [bootstrap, dynamicArticles, dynamicLabel, stackArticles],
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

  const loadTag = useCallback(
    async (tag: string, preserveReadingOrigin = false) => {
      if (!preserveReadingOrigin) setReadingOrigin(null)
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
    },
    [],
  )

  const inspectNode = useCallback(
    (node: SurfNode) => {
      setSelectedId(node.id)
      setActiveNode(node)
      setRouteTargetId(null)
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
        setReadingOrigin(node)
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

  function putBackArticle() {
    if (!activeNode || activeNode.kind !== 'article') return
    setReadingOrigin(null)
    setActiveNode(null)
    setSelectedId(null)
    setArticle(null)
    setRouteTargetId(null)
    window.history.replaceState(
      null,
      '',
      '/surf?to=' +
        encodeURIComponent(
          '/library/' + (activeNode.section ?? currentSection),
        ),
    )
  }

  function walkTo(id: string, preserveReadingOrigin = false) {
    if (!preserveReadingOrigin) setReadingOrigin(null)
    setRouteTargetId(id)
    setActiveNode(null)
    setSelectedId(null)
    setArticle(null)
    setDirectoryOpen(false)
  }

  function jumpTo(
    id: string,
    inspectOnArrival = true,
    preserveReadingOrigin = false,
  ) {
    if (!preserveReadingOrigin) setReadingOrigin(null)
    const next = travelNonce + 1
    setTravelNonce(next)
    setRouteTargetId(id)
    setTravelRequest({id, nonce: next, inspectOnArrival})
    setActiveNode(null)
    setSelectedId(null)
    setArticle(null)
    setDirectoryOpen(false)
  }

  function returnToReadingShelf() {
    if (!readingOrigin) return
    const origin = readingOrigin
    setReadingOrigin(null)
    jumpTo(origin.id, false, true)
  }

  function goToFloor(floor: number) {
    const nextFloor = Math.max(
      0,
      Math.min(STACK_FLOOR_COUNT, floor),
    )
    const next = floorNonce + 1
    setFloorNonce(next)
    setFloorRequest({floor: nextFloor, nonce: next})
    setDirectoryOpen(false)
    setActiveNode(null)
    setSelectedId(null)
    setArticle(null)
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
        ...stackArticles,
      ]
        .filter(
          (candidate, index, collection) => {
            const currentTags = new Set(articleTags(article))
            const candidateTags = articleTags(candidate)

            return (
              candidate.id !== article.id &&
              candidateTags.some((tag) => currentTags.has(tag)) &&
              graph.nodes.some(
                (node) => node.id === 'article:' + candidate.id,
              ) &&
              collection.findIndex((item) => item.id === candidate.id) === index
            )
          },
        )
        .sort(
          (a, b) =>
            articleImportance(b) - articleImportance(a),
        )
        .slice(0, 4)
    : []

  const activeArticleImage = article
    ? articleImage(article)
    : null

  const activeShelfArticles =
    activeNode?.kind === 'article' && activeNode.shelfKey
      ? graph.nodes
          .filter(
            (node) =>
              node.kind === 'article' &&
              node.shelfKey === activeNode.shelfKey,
          )
          .sort(
            (a, b) =>
              (a.shelfOrder ?? 0) - (b.shelfOrder ?? 0),
          )
      : []

  const activeShelfIndex =
    activeNode?.kind === 'article'
      ? activeShelfArticles.findIndex(
          (node) => node.id === activeNode.id,
        )
      : -1

  const previousBook =
    activeShelfIndex > 0
      ? activeShelfArticles[activeShelfIndex - 1]
      : null
  const nextBook =
    activeShelfIndex >= 0 &&
    activeShelfIndex < activeShelfArticles.length - 1
      ? activeShelfArticles[activeShelfIndex + 1]
      : null

  const continueTarget =
    visited.length > 1
      ? visited[visited.length - 1]?.id
      : bootstrap.profile
        ? 'profile:' + bootstrap.profile.username
        : 'section:featured'

  const breadcrumb = [
    'DEV Library',
    currentFloor > 0
      ? 'Stack Level ' + currentFloor
      : SECTION_COPY[currentSection].title,
    activeNode?.title,
  ].filter(Boolean)

  const wingLinks: Array<{
    section: LibrarySection
    label: string
    target: string
  }> = [
    {section: 'atrium', label: 'Home', target: 'dev-home'},
    {section: 'featured', label: 'Featured', target: 'section:featured'},
    {section: 'latest', label: 'New', target: 'section:latest'},
    {section: 'topics', label: 'Topics', target: 'section:topics'},
    {section: 'creators', label: 'Creators', target: 'section:creators'},
    {section: 'search', label: 'Search', target: 'section:search'},
    {section: 'archive', label: 'Archive', target: 'section:archive'},
  ]

  return (
    <main className={styles.page}>
      <DevWebSurf3D
        nodes={graph.nodes}
        edges={graph.edges}
        selectedId={selectedId}
        routeTargetId={routeTargetId}
        travelRequest={travelRequest}
        floorRequest={floorRequest}
        onInspect={inspectNode}
        onPutBack={putBackArticle}
        onTravel={(node, inspectOnArrival) => {
          setRouteTargetId(null)
          if (inspectOnArrival) {
            inspectNode(node)
          } else {
            setCurrentSection(node.section ?? currentSection)
          }
        }}
        onHover={setHovered}
        onPointerLockChange={setLocked}
        onZoneChange={setCurrentSection}
        onFloorChange={setCurrentFloor}
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

      <nav className={styles.wingRail} aria-label="Browse library wings">
        {wingLinks.map((item) => (
          <button
            type="button"
            key={item.section}
            className={
              currentSection === item.section
                ? styles.wingRailActive
                : ''
            }
            onClick={() => {
              if (item.section === 'search') {
                walkTo(item.target)
                window.setTimeout(
                  () => searchInputRef.current?.focus(),
                  140,
                )
              } else {
                walkTo(item.target)
              }
            }}
          >
            {item.label}
          </button>
        ))}
      </nav>

      <nav
        className={styles.floorRail}
        aria-label="Library floor"
      >
        <span>
          {stackLoading
            ? 'cataloging stacks…'
            : stackArticles.length + ' live articles'}
        </span>
        {Array.from(
          {length: STACK_FLOOR_COUNT + 1},
          (_, floor) => floor,
        ).map((floor) => (
          <button
            type="button"
            key={floor}
            className={
              currentFloor === floor
                ? styles.floorRailActive
                : ''
            }
            onClick={() => goToFloor(floor)}
          >
            {floor === 0 ? 'Ground' : 'Stack ' + floor}
          </button>
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

          <div className={styles.stackDirectory}>
            <span>Vertical stacks</span>
            <strong>
              {stackLoading
                ? 'Cataloging hundreds of live DEV articles…'
                : stackArticles.length +
                  ' additional articles across ' +
                  STACK_FLOOR_COUNT +
                  ' floors'}
            </strong>
            <div>
              {Array.from(
                {length: STACK_FLOOR_COUNT},
                (_, index) => index + 1,
              ).map((floor) => (
                <button
                  type="button"
                  key={floor}
                  onClick={() => goToFloor(floor)}
                >
                  Stack {floor}
                </button>
              ))}
            </div>
          </div>
        </aside>
      )}

      {routeTarget && (
        <aside className={styles.routeCard}>
          <span>Route ready · follow cyan light</span>
          <strong>{routeTarget.title}</strong>
          <p>
            Follow the floor strips through the lit doorway.
          </p>
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
              Walk route
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
        <span>
          <kbd>E</kbd>{' '}
          {activeNode?.kind === 'article' ? 'put back' : 'inspect'}
        </span>
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

      {readingOrigin &&
        activeNode?.kind !== 'article' && (
          <button
            type="button"
            className={styles.returnShelf}
            onClick={returnToReadingShelf}
          >
            <span>↩</span>
            Back to {SECTION_COPY[readingOrigin.section ?? 'featured'].title}
          </button>
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
              if (activeNode.kind === 'article') {
                putBackArticle()
              } else {
                setActiveNode(null)
                setSelectedId(null)
                setArticle(null)
              }
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
              <section className={styles.articleHero}>
                {activeArticleImage && (
                  <div className={styles.articleHeroMedia}>
                    <img
                      src={activeArticleImage}
                      alt=""
                      className={styles.articleHeroImage}
                    />
                    <i aria-hidden="true" />
                  </div>
                )}

                <div className={styles.articleHeroCopy}>
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
                </div>
              </section>

              <div className={styles.readingLoop}>
                <button
                  type="button"
                  onClick={putBackArticle}
                >
                  <span>↩</span>
                  Back to shelf
                  <kbd>E</kbd>
                </button>

                <div>
                  <button
                    type="button"
                    disabled={!previousBook}
                    onClick={() => {
                      if (previousBook) {
                        jumpTo(previousBook.id, true, true)
                      }
                    }}
                  >
                    ← Previous book
                  </button>
                  <button
                    type="button"
                    disabled={!nextBook}
                    onClick={() => {
                      if (nextBook) {
                        jumpTo(nextBook.id, true, true)
                      }
                    }}
                  >
                    Next book →
                  </button>
                </div>
              </div>

              <div className={styles.tags}>
                {articleTags(article).map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => void loadTag(tag, true)}
                  >
                    #{tag} · doorway
                  </button>
                ))}
              </div>

              <div className={styles.articleBody}>
                {cleanMarkdown(article.body_markdown) ||
                  article.description ||
                  'This article body is unavailable in the public DEV response.'}
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
                    {relatedArticles.map((item) => {
                      const image = articleImage(item)
                      return (
                        <button
                          type="button"
                          key={item.id}
                          onClick={() =>
                            jumpTo('article:' + item.id)
                          }
                        >
                          {image && (
                            <img
                              src={image}
                              alt=""
                              className={styles.relatedCover}
                            />
                          )}
                          <span>
                            <b>{item.title}</b>
                            <small>@{item.user.username}</small>
                          </span>
                        </button>
                      )
                    })}
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
