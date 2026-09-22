import {NextRequest, NextResponse} from 'next/server'

const DEV_BASE = 'https://dev.to/api'
const FOREM_ACCEPT = 'application/vnd.forem.api-v1+json'
const ALLOWED_IMAGE_HOSTS = new Set([
  'media2.dev.to',
  'dev-to-uploads.s3.amazonaws.com',
  'res.cloudinary.com',
])

async function devFetch(path: string) {
  const response = await fetch(`${DEV_BASE}${path}`, {
    headers: {
      accept: FOREM_ACCEPT,
      'user-agent':
        'Oniria-DEV-Library/0.1 (+https://github.com/miflow13/Oniria)',
    },
    next: {revalidate: 60},
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(
      `DEV API ${response.status}: ${text.slice(0, 160) || response.statusText}`,
    )
  }

  return response.json()
}

function safeValue(value: string | null, fallback = '') {
  return (value ?? fallback).trim().slice(0, 140)
}

function lowQualityImageTarget(target: URL) {
  const thumbnail = new URL(target)

  if (thumbnail.hostname === 'media2.dev.to') {
    const marker = '/cdn-cgi/image/'
    const markerIndex = thumbnail.pathname.indexOf(marker)
    if (markerIndex >= 0) {
      const optionsStart = markerIndex + marker.length
      const sourceStart = thumbnail.pathname.indexOf('/', optionsStart)
      if (sourceStart >= 0) {
        thumbnail.pathname =
          thumbnail.pathname.slice(0, optionsStart) +
          'width=112,height=84,fit=cover,gravity=auto,quality=45,format=auto' +
          thumbnail.pathname.slice(sourceStart)
      }
    }
  }

  if (thumbnail.hostname === 'res.cloudinary.com') {
    const marker = '/image/upload/'
    const markerIndex = thumbnail.pathname.indexOf(marker)
    if (markerIndex >= 0) {
      const insertAt = markerIndex + marker.length
      thumbnail.pathname =
        thumbnail.pathname.slice(0, insertAt) +
        'w_112,h_84,c_fill,q_auto:low,f_auto/' +
        thumbnail.pathname.slice(insertAt)
    }
  }

  return thumbnail
}

function normalizeTagList(value: unknown, fallback?: unknown) {
  const source = value ?? fallback

  if (Array.isArray(source)) {
    return source
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
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

function normalizeArticle(article: unknown) {
  if (!article || typeof article !== 'object') return article

  const record = article as Record<string, unknown>
  return {
    ...record,
    tag_list: normalizeTagList(record.tag_list, record.tags),
  }
}

function normalizeArticles(value: unknown) {
  return Array.isArray(value)
    ? value.map((article) => normalizeArticle(article))
    : []
}

export async function GET(request: NextRequest) {
  const {searchParams} = request.nextUrl
  const mode = safeValue(searchParams.get('mode'), 'bootstrap')

  try {
    if (mode === 'image') {
      const rawUrl = searchParams.get('url')
      if (!rawUrl) {
        return NextResponse.json({error: 'Missing image URL'}, {status: 400})
      }

      let target: URL
      try {
        target = new URL(rawUrl)
      } catch {
        return NextResponse.json({error: 'Invalid image URL'}, {status: 400})
      }

      if (
        target.protocol !== 'https:' ||
        !ALLOWED_IMAGE_HOSTS.has(target.hostname)
      ) {
        return NextResponse.json(
          {error: 'Image host is not allowed'},
          {status: 400},
        )
      }

      const variant = safeValue(
        searchParams.get('variant'),
        'full',
      )
      const fetchTarget =
        variant === 'thumb'
          ? lowQualityImageTarget(target)
          : target

      const imageResponse = await fetch(fetchTarget, {
        headers: {
          accept: 'image/avif,image/webp,image/png,image/jpeg,image/*',
          'user-agent':
            'Oniria-DEV-Library/0.1 (+https://github.com/miflow13/Oniria)',
        },
        next: {revalidate: 3600},
      })

      if (!imageResponse.ok) {
        return NextResponse.json(
          {error: 'Could not load cover image'},
          {status: imageResponse.status},
        )
      }

      const contentType =
        imageResponse.headers.get('content-type') ?? 'image/jpeg'
      if (!contentType.startsWith('image/')) {
        return NextResponse.json(
          {error: 'Remote resource is not an image'},
          {status: 415},
        )
      }

      const body = await imageResponse.arrayBuffer()
      return new NextResponse(body, {
        headers: {
          'content-type': contentType,
          'cache-control':
            variant === 'thumb'
              ? 'public, max-age=86400, stale-while-revalidate=604800'
              : 'public, max-age=3600, stale-while-revalidate=86400',
        },
      })
    }

    if (mode === 'bootstrap') {
      const username = safeValue(searchParams.get('username'), 'mikachu')

      const [profile, profileArticles, feed, latest, tags] = await Promise.all([
        devFetch(`/users/${encodeURIComponent(username)}`).catch(() => null),
        devFetch(
          `/articles?username=${encodeURIComponent(username)}&per_page=30`,
        ).catch(() => []),
        devFetch('/articles?per_page=30&top=7').catch(() => []),
        devFetch('/articles?per_page=30').catch(() => []),
        devFetch('/tags?per_page=30').catch(() => []),
      ])

      return NextResponse.json({
        profile,
        profileArticles: normalizeArticles(profileArticles),
        feed: normalizeArticles(feed),
        latest: normalizeArticles(latest),
        tags,
      })
    }

    if (mode === 'catalog') {
      const pageCount = Math.min(
        10,
        Math.max(1, Number(searchParams.get('pages') ?? 6) || 6),
      )
      const perPage = Math.min(
        100,
        Math.max(20, Number(searchParams.get('per_page') ?? 100) || 100),
      )

      const pages: unknown[][] = []
      for (let index = 0; index < pageCount; index += 4) {
        const wave = Array.from(
          {length: Math.min(4, pageCount - index)},
          (_, offset) => index + offset + 1,
        )
        const results = await Promise.all(
          wave.map((page) =>
            devFetch(
              `/articles?per_page=${perPage}&page=${page}`,
            ).catch(() => []),
          ),
        )
        pages.push(...results)
      }

      const seen = new Set<number>()
      const articles = pages
        .flatMap((page) => normalizeArticles(page))
        .filter((article) => {
          if (!article || typeof article !== 'object') return false
          const id = Number((article as {id?: unknown}).id)
          if (!Number.isFinite(id) || seen.has(id)) return false
          seen.add(id)
          return true
        })

      return NextResponse.json({
        articles,
        pageCount,
        perPage,
        count: articles.length,
      })
    }

    if (mode === 'article') {
      const id = safeValue(searchParams.get('id'))
      if (!/^\d+$/.test(id)) {
        return NextResponse.json({error: 'Invalid article id'}, {status: 400})
      }

      const article = normalizeArticle(await devFetch(`/articles/${id}`))
      return NextResponse.json({article})
    }

    if (mode === 'profile') {
      const username = safeValue(searchParams.get('username'))
      if (!username) {
        return NextResponse.json({error: 'Missing username'}, {status: 400})
      }

      const [profile, articles] = await Promise.all([
        devFetch(`/users/${encodeURIComponent(username)}`),
        devFetch(
          `/articles?username=${encodeURIComponent(username)}&per_page=30`,
        ),
      ])

      return NextResponse.json({
        profile,
        articles: normalizeArticles(articles),
      })
    }

    if (mode === 'tag') {
      const tag = safeValue(searchParams.get('tag'))
      if (!tag) {
        return NextResponse.json({error: 'Missing tag'}, {status: 400})
      }

      const articles = await devFetch(
        `/articles?tag=${encodeURIComponent(tag)}&per_page=30&top=30`,
      )
      return NextResponse.json({
        tag,
        articles: normalizeArticles(articles),
      })
    }

    if (mode === 'search') {
      const query = safeValue(searchParams.get('q'))
      if (!query) {
        return NextResponse.json({error: 'Missing query'}, {status: 400})
      }

      const articles = await devFetch(
        `/articles/search?q=${encodeURIComponent(query)}&per_page=30`,
      )
      return NextResponse.json({
        query,
        articles: normalizeArticles(articles),
      })
    }

    return NextResponse.json({error: 'Unknown mode'}, {status: 400})
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'DEV request failed'
    return NextResponse.json({error: message}, {status: 502})
  }
}
