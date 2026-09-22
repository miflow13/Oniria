import {NextRequest, NextResponse} from 'next/server'

const DEV_BASE = 'https://dev.to/api'
const FOREM_ACCEPT = 'application/vnd.forem.api-v1+json'
const ALLOWED_IMAGE_HOSTS = new Set([
  'media.dev.to',
  'media2.dev.to',
  'dev-to-uploads.s3.amazonaws.com',
  'res.cloudinary.com',
  'images.unsplash.com',
  'user-images.githubusercontent.com',
  'private-user-images.githubusercontent.com',
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
          'width=320,height=220,fit=cover,gravity=auto,quality=64,format=auto' +
          thumbnail.pathname.slice(sourceStart)
      }
    }
  }

  if (thumbnail.hostname === 'dev-to-uploads.s3.amazonaws.com') {
    return new URL(
      'https://media2.dev.to/cdn-cgi/image/' +
        'width=320,height=220,fit=cover,gravity=auto,quality=64,format=auto/' +
        target.href,
    )
  }

  if (thumbnail.hostname === 'res.cloudinary.com') {
    const marker = '/image/upload/'
    const markerIndex = thumbnail.pathname.indexOf(marker)
    if (markerIndex >= 0) {
      const insertAt = markerIndex + marker.length
      thumbnail.pathname =
        thumbnail.pathname.slice(0, insertAt) +
        'w_320,h_220,c_fill,q_auto:eco,f_auto/' +
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

      const rawFallback = searchParams.get('fallback')
      const parseAllowedImage = (value: string | null) => {
        if (!value) return null
        try {
          const candidate = new URL(value)
          if (
            candidate.protocol !== 'https:' ||
            !ALLOWED_IMAGE_HOSTS.has(candidate.hostname)
          ) {
            return null
          }
          return candidate
        } catch {
          return null
        }
      }

      const target = parseAllowedImage(rawUrl)
      const fallbackTarget = parseAllowedImage(rawFallback)
      if (!target) {
        return NextResponse.json(
          {error: 'Image host is not allowed'},
          {status: 400},
        )
      }

      const variant = safeValue(
        searchParams.get('variant'),
        'full',
      )
      const fetchImage = async (candidate: URL) =>
        fetch(
          variant === 'thumb'
            ? lowQualityImageTarget(candidate)
            : candidate,
          {
            headers: {
              accept:
                'image/avif,image/webp,image/png,image/jpeg,image/*',
              'user-agent':
                'Oniria-DEV-Library/0.1 (+https://github.com/miflow13/Oniria)',
            },
            next: {revalidate: 3600},
          },
        )

      let imageResponse = await fetchImage(target)

      // Some DEV/CDN URLs reject transformation syntax even though the
      // original image is healthy. Retry the original before giving up.
      if (!imageResponse.ok && variant === 'thumb') {
        imageResponse = await fetch(target, {
          headers: {
            accept:
              'image/avif,image/webp,image/png,image/jpeg,image/*',
            'user-agent':
              'Oniria-DEV-Library/0.1 (+https://github.com/miflow13/Oniria)',
          },
          next: {revalidate: 3600},
        })
      }

      // Cover images are occasionally stale while social images are still
      // valid, so the shelf can provide a second DEV image as a final retry.
      if (!imageResponse.ok && fallbackTarget) {
        imageResponse = await fetchImage(fallbackTarget)
        if (!imageResponse.ok && variant === 'thumb') {
          imageResponse = await fetch(fallbackTarget, {
            headers: {
              accept:
                'image/avif,image/webp,image/png,image/jpeg,image/*',
              'user-agent':
                'Oniria-DEV-Library/0.1 (+https://github.com/miflow13/Oniria)',
            },
            next: {revalidate: 3600},
          })
        }
      }

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
          'access-control-allow-origin': '*',
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
      const startPage = Math.max(
        1,
        Number(searchParams.get('start_page') ?? 1) || 1,
      )
      const pageCount = Math.min(
        4,
        Math.max(1, Number(searchParams.get('pages') ?? 1) || 1),
      )
      const perPage = Math.min(
        100,
        Math.max(20, Number(searchParams.get('per_page') ?? 100) || 100),
      )

      const pageNumbers = Array.from(
        {length: pageCount},
        (_, offset) => startPage + offset,
      )
      const pages = await Promise.all(
        pageNumbers.map((page) =>
          devFetch(
            `/articles?per_page=${perPage}&page=${page}`,
          ).catch(() => []),
        ),
      )

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

      const lastPage = pages.at(-1) ?? []
      const hasMore =
        pages.length === pageCount &&
        Array.isArray(lastPage) &&
        lastPage.length >= perPage

      return NextResponse.json({
        articles,
        startPage,
        pageCount,
        perPage,
        nextPage: startPage + pageCount,
        hasMore,
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
