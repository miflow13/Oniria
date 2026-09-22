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

      const imageResponse = await fetch(target, {
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
            'public, max-age=3600, stale-while-revalidate=86400',
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
