'use client'

import {FormEvent, useCallback, useEffect, useMemo, useState} from 'react'
import DevWebSurf3D from './DevWebSurf3D'
import type {
  DevArticle,
  DevArticleSummary,
  DevBootstrap,
  DevTag,
  DevUser,
  SurfEdge,
  SurfNode,
} from './types'
import styles from './surf.module.css'

const DEFAULT_USERNAME = 'mikachu'

function hashString(value: string) {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function ringPosition(
  key: string,
  index: number,
  count: number,
  radius: number,
  center: [number, number, number],
): [number, number, number] {
  const phase = ((hashString(key) % 1000) / 1000) * Math.PI * 2
  const angle = phase + (index / Math.max(1, count)) * Math.PI * 2
  const wobble = (((hashString(key + ':y') % 1000) / 1000) - .5) * 2.6
  return [
    center[0] + Math.cos(angle) * radius,
    center[1] + wobble,
    center[2] + Math.sin(angle) * radius,
  ]
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
  return '#5ee0a8'
}

function cleanMarkdown(markdown: string | undefined) {
  if (!markdown) return ''
  return markdown
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/[>*_~\`]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function buildSurfGraph(
  bootstrap: DevBootstrap,
  dynamicArticles: DevArticleSummary[],
  dynamicLabel: string | null,
) {
  const nodes: SurfNode[] = []
  const edges: SurfEdge[] = []
  const nodeIds = new Set<string>()

  const addNode = (node: SurfNode) => {
    if (nodeIds.has(node.id)) return
    nodeIds.add(node.id)
    nodes.push(node)
  }

  const addEdge = (edge: SurfEdge) => {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) return
    if (edges.some((item) => item.id === edge.id)) return
    edges.push(edge)
  }

  addNode({
    id: 'dev-home',
    kind: 'home',
    title: 'DEV Home',
    subtitle: 'live community feed',
    href: 'https://dev.to/',
    position: [0, 1.4, 0],
    importance: 2,
    accent: '#e8edf2',
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
      position: [6.8, 2.2, -7],
      importance: 1.8,
      accent: '#a58cff',
    })
    addEdge({
      id: 'home-profile:' + bootstrap.profile.username,
      source: 'dev-home',
      target: profileId,
      weight: 2,
      kind: 'author',
    })
  }

  const profileArticles = bootstrap.profileArticles.slice(0, 12)
  profileArticles.forEach((article, index) => {
    const id = 'article:' + article.id
    addNode({
      id,
      kind: 'article',
      title: article.title,
      subtitle:
        '@' +
        article.user.username +
        ' · ' +
        (article.readable_publish_date ?? 'article'),
      href: article.url,
      articleId: article.id,
      username: article.user.username,
      payload: article,
      position: ringPosition(
        'profile:' + article.id,
        index,
        profileArticles.length,
        5.2,
        [7, 1.9, -7.5],
      ),
      importance: articleImportance(article) + .24,
      accent: '#8f8cff',
    })
    if (bootstrap.profile) {
      addEdge({
        id: 'profile-article:' + article.id,
        source: 'profile:' + bootstrap.profile.username,
        target: id,
        weight: 1.6 + articleImportance(article),
        kind: 'author',
      })
    }
  })

  const feed = bootstrap.feed
    .filter(
      (article) =>
        !bootstrap.profileArticles.some((mine) => mine.id === article.id),
    )
    .slice(0, 22)

  feed.forEach((article, index) => {
    const id = 'article:' + article.id
    addNode({
      id,
      kind: 'article',
      title: article.title,
      subtitle:
        '@' +
        article.user.username +
        ' · ' +
        (article.readable_publish_date ?? 'article'),
      href: article.url,
      articleId: article.id,
      username: article.user.username,
      payload: article,
      position: ringPosition(
        'feed:' + article.id,
        index,
        feed.length,
        9.2 + (index % 3) * 1.1,
        [0, 1.25, -4],
      ),
      importance: articleImportance(article),
      accent: '#5ed6e3',
    })
    addEdge({
      id: 'home-feed:' + article.id,
      source: 'dev-home',
      target: id,
      weight: 1 + articleImportance(article),
      kind: 'feed',
    })
  })

  const authors = new Map<string, DevArticleSummary[]>()
  feed.forEach((article) => {
    const list = authors.get(article.user.username) ?? []
    list.push(article)
    authors.set(article.user.username, list)
  })

  ;[...authors.entries()]
    .filter(([username]) => username !== bootstrap.profile?.username)
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 7)
    .forEach(([username, articles], index, all) => {
      const profileId = 'profile:' + username
      addNode({
        id: profileId,
        kind: 'profile',
        title: '@' + username,
        subtitle: articles[0]?.user.name ?? 'DEV creator',
        href: 'https://dev.to/' + username,
        username,
        position: ringPosition(
          'author:' + username,
          index,
          all.length,
          13.4,
          [0, 2.2, -5],
        ),
        importance: 1 + articles.length * .16,
        accent: '#b48cff',
      })

      articles.slice(0, 4).forEach((article) => {
        addEdge({
          id: 'author-link:' + username + ':' + article.id,
          source: profileId,
          target: 'article:' + article.id,
          weight: 1.4,
          kind: 'author',
        })
      })
    })

  bootstrap.tags.slice(0, 10).forEach((tag, index, all) => {
    const tagId = 'tag:' + tag.name
    addNode({
      id: tagId,
      kind: 'tag',
      title: '#' + tag.name,
      subtitle: 'topic district',
      href: 'https://dev.to/t/' + tag.name,
      tag: tag.name,
      position: ringPosition(
        'tag:' + tag.name,
        index,
        all.length,
        17,
        [0, .3, -7],
      ),
      importance: 1.05,
      accent: safeTagColor(tag),
    })

    ;[...bootstrap.feed, ...bootstrap.profileArticles]
      .filter((article) => article.tag_list.includes(tag.name))
      .slice(0, 4)
      .forEach((article) => {
        addEdge({
          id: 'tag-link:' + tag.name + ':' + article.id,
          source: tagId,
          target: 'article:' + article.id,
          weight: 1.2,
          kind: 'tag',
        })
      })
  })

  if (dynamicLabel && dynamicArticles.length) {
    addNode({
      id: 'search:active',
      kind: 'search',
      title: dynamicLabel,
      subtitle: 'live route results',
      position: [-8.5, 2.3, -11],
      importance: 1.7,
      accent: '#f2c86e',
    })
    addEdge({
      id: 'home-search-active',
      source: 'dev-home',
      target: 'search:active',
      weight: 1.8,
      kind: 'search',
    })

    dynamicArticles.slice(0, 18).forEach((article, index, all) => {
      const id = 'article:' + article.id
      if (!nodeIds.has(id)) {
        addNode({
          id,
          kind: 'article',
          title: article.title,
          subtitle:
            '@' +
            article.user.username +
            ' · ' +
            (article.readable_publish_date ?? 'article'),
          href: article.url,
          articleId: article.id,
          username: article.user.username,
          payload: article,
          position: ringPosition(
            'dynamic:' + article.id,
            index,
            all.length,
            5.8,
            [-8.5, 2.1, -11],
          ),
          importance: articleImportance(article),
          accent: '#f0bd61',
        })
      }
      addEdge({
        id: 'search-link:' + article.id,
        source: 'search:active',
        target: id,
        weight: 1.4,
        kind: 'search',
      })
    })
  }

  return {nodes, edges}
}

export default function DevWebSurf() {
  const [bootstrap, setBootstrap] = useState<DevBootstrap | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [hovered, setHovered] = useState<SurfNode | null>(null)
  const [activeNode, setActiveNode] = useState<SurfNode | null>(null)
  const [article, setArticle] = useState<DevArticle | null>(null)
  const [profile, setProfile] = useState<DevUser | null>(null)
  const [profileArticles, setProfileArticles] = useState<DevArticleSummary[]>([])
  const [dynamicArticles, setDynamicArticles] = useState<DevArticleSummary[]>([])
  const [dynamicLabel, setDynamicLabel] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [routeLoading, setRouteLoading] = useState(false)
  const [locked, setLocked] = useState(false)
  const [visited, setVisited] = useState<string[]>(['DEV Home'])

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
        ? buildSurfGraph(bootstrap, dynamicArticles, dynamicLabel)
        : {nodes: [], edges: []},
    [bootstrap, dynamicArticles, dynamicLabel],
  )

  const fetchArticle = useCallback(async (node: SurfNode) => {
    if (!node.articleId) return
    setRouteLoading(true)
    setProfile(null)

    try {
      const response = await fetch('/api/devto?mode=article&id=' + node.articleId)
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
        '/api/devto?mode=profile&username=' + encodeURIComponent(username),
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
      setVisited((current) =>
        [...current.filter((item) => item !== node.title), node.title].slice(-5),
      )

      if (node.kind === 'article') void fetchArticle(node)
      else if (node.kind === 'profile' && node.username) {
        void fetchProfile(node.username)
      } else if (node.kind === 'tag' && node.tag) {
        void loadTag(node.tag)
      } else if (node.kind === 'home') {
        setArticle(null)
        setProfile(bootstrap?.profile ?? null)
        setProfileArticles(bootstrap?.profileArticles ?? [])
      }
    },
    [bootstrap, fetchArticle, fetchProfile, loadTag],
  )

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
          '/api/devto?mode=profile&username=' + encodeURIComponent(username),
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
        setSelectedId('profile:' + data.profile.username)
        setActiveNode({
          id: 'profile:' + data.profile.username,
          kind: 'profile',
          title: '@' + data.profile.username,
          subtitle: data.profile.name,
          href: 'https://dev.to/' + data.profile.username,
          username: data.profile.username,
          position: [0, 0, 0],
          importance: 1.4,
          accent: '#b48cff',
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
        <span>connecting to dev.to</span>
        <strong>Building the live web around you…</strong>
        {error && <small>{error}</small>}
      </main>
    )
  }

  return (
    <main className={styles.page}>
      <DevWebSurf3D
        nodes={graph.nodes}
        edges={graph.edges}
        selectedId={selectedId}
        onInspect={inspectNode}
        onTravel={inspectNode}
        onHover={setHovered}
        onPointerLockChange={setLocked}
      />

      <header className={styles.chrome}>
        <div className={styles.brand}>
          <b>DEV</b>
          <span>websurf</span>
        </div>
        <form className={styles.addressBar} onSubmit={submitSearch}>
          <span aria-hidden="true">⌕</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search DEV, @username, or #tag"
            aria-label="Search DEV"
          />
          <kbd>↵</kbd>
        </form>
        <div className={styles.connection}>
          <i className={locked ? styles.online : ''} />
          {locked ? 'surfing' : 'cursor free'}
        </div>
      </header>

      <nav className={styles.history} aria-label="Surf history">
        {visited.map((item, index) => (
          <span key={item + ':' + index}>
            {index > 0 && <i>›</i>}
            {item}
          </span>
        ))}
      </nav>

      <div className={styles.reticle} aria-hidden="true">
        <i />
        <i />
      </div>

      <section className={styles.controls}>
        <span><kbd>WASD</kbd> move</span>
        <span><kbd>mouse</kbd> look</span>
        <span><kbd>E</kbd> inspect</span>
        <span><kbd>F</kbd> surf to page</span>
        <span><kbd>Shift</kbd> boost</span>
        <span><kbd>Esc</kbd> cursor</span>
      </section>

      {hovered && !activeNode && (
        <div className={styles.hoverCard}>
          <span>{hovered.kind}</span>
          <strong>{hovered.title}</strong>
          <small>E inspect · F travel</small>
        </div>
      )}

      {(activeNode || article) && (
        <aside className={styles.pageLens}>
          <button
            type="button"
            className={styles.closeLens}
            onClick={() => {
              setActiveNode(null)
              setSelectedId(null)
              setArticle(null)
              setProfile(null)
              setProfileArticles([])
            }}
            aria-label="Close page lens"
          >
            ×
          </button>

          {routeLoading && (
            <div className={styles.routeLoading}>loading page…</div>
          )}

          {activeNode?.kind === 'home' && (
            <>
              <div className={styles.pageType}>dev.to / home</div>
              <h1>DEV Community</h1>
              <p>
                The public DEV feed is physically surrounding you. Articles are
                pages, authors are profile hubs, and tags form topic districts.
              </p>
              <div className={styles.metrics}>
                <span><b>{bootstrap.feed.length}</b> feed pages</span>
                <span><b>{bootstrap.tags.length}</b> tag routes</span>
                <span><b>{graph.nodes.length}</b> destinations</span>
              </div>
            </>
          )}

          {profile && activeNode?.kind === 'profile' && (
            <>
              <div className={styles.pageType}>dev.to / profile</div>
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
                <span><b>{profileArticles.length}</b> articles</span>
                {profile.location && <span>{profile.location}</span>}
                {profile.joined_at && <span>joined {profile.joined_at}</span>}
              </div>
              <div className={styles.pageActions}>
                <button
                  type="button"
                  onClick={() => {
                    setDynamicArticles(profileArticles)
                    setDynamicLabel('@' + profile.username)
                  }}
                >
                  Materialize articles
                </button>
                <a
                  href={'https://dev.to/' + profile.username}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open on DEV ↗
                </a>
              </div>
            </>
          )}

          {article && (
            <>
              <div className={styles.pageType}>
                dev.to / @{article.user.username} / article
              </div>
              <h1>{article.title}</h1>
              <div className={styles.articleMeta}>
                <span>@{article.user.username}</span>
                <span>{article.readable_publish_date}</span>
                <span>{article.reading_time_minutes ?? 0} min</span>
              </div>
              <p className={styles.articleDescription}>{article.description}</p>
              <div className={styles.tags}>
                {article.tag_list.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => void loadTag(tag)}
                  >
                    #{tag}
                  </button>
                ))}
              </div>
              <div className={styles.articleBody}>
                {cleanMarkdown(article.body_markdown).slice(0, 2600)}
              </div>
              <div className={styles.metrics}>
                <span><b>{article.public_reactions_count ?? 0}</b> reactions</span>
                <span><b>{article.comments_count ?? 0}</b> comments</span>
              </div>
              <div className={styles.pageActions}>
                <button
                  type="button"
                  onClick={() => {
                    const username = article.user.username
                    const existing = graph.nodes.find(
                      (node) =>
                        node.kind === 'profile' &&
                        node.username === username,
                    )
                    const target =
                      existing ?? {
                        id: 'profile:' + username,
                        kind: 'profile' as const,
                        title: '@' + username,
                        subtitle: article.user.name,
                        href: 'https://dev.to/' + username,
                        username,
                        position: [0, 0, 0] as [number, number, number],
                        importance: 1.2,
                        accent: '#b48cff',
                      }

                    setSelectedId(existing?.id ?? null)
                    setActiveNode(target)
                    void fetchProfile(username)
                  }}
                >
                  Visit @{article.user.username}
                </button>
                <a href={article.url} target="_blank" rel="noreferrer">
                  Open full page ↗
                </a>
              </div>
            </>
          )}

          {activeNode?.kind === 'tag' && !article && (
            <>
              <div className={styles.pageType}>dev.to / tag district</div>
              <h1>#{activeNode.tag}</h1>
              <p>
                Matching DEV pages are materializing as a live search cluster.
              </p>
              <div className={styles.metrics}>
                <span><b>{dynamicArticles.length}</b> matching pages</span>
              </div>
            </>
          )}

          {activeNode?.kind === 'search' && !article && (
            <>
              <div className={styles.pageType}>dev.to / live search</div>
              <h1>{dynamicLabel}</h1>
              <p>
                Search results are now physical destinations around this hub.
              </p>
            </>
          )}
        </aside>
      )}

      {dynamicLabel && dynamicArticles.length > 0 && (
        <button
          type="button"
          className={styles.searchBeacon}
          onClick={() => {
            const node = graph.nodes.find((item) => item.id === 'search:active')
            if (node) inspectNode(node)
          }}
        >
          <span>live route</span>
          <strong>{dynamicLabel}</strong>
          <small>{dynamicArticles.length} pages materialized</small>
        </button>
      )}

      {error && (
        <div className={styles.errorToast}>
          <strong>DEV connection hiccup</strong>
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)}>×</button>
        </div>
      )}

      {!locked && !activeNode && (
        <div className={styles.capturePrompt}>
          <span>click anywhere in the web</span>
          <strong>Capture pointer to start surfing</strong>
        </div>
      )}
    </main>
  )
}
