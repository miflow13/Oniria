import {NextResponse} from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 86_400

const TRACK_PAGE =
  'https://pixabay.com/music/ambient-ambient-ambient-music-569592/'
const ALLOWED_AUDIO_HOST = 'cdn.pixabay.com'

type JsonLdValue =
  | null
  | boolean
  | number
  | string
  | JsonLdValue[]
  | {[key: string]: JsonLdValue}

function findContentUrl(value: JsonLdValue): string | null {
  if (!value || typeof value !== 'object') return null

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findContentUrl(item)
      if (found) return found
    }
    return null
  }

  const direct = value.contentUrl
  if (typeof direct === 'string' && direct.length > 0) {
    return direct
  }

  for (const child of Object.values(value)) {
    const found = findContentUrl(child)
    if (found) return found
  }

  return null
}

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
}

function extractTrackUrl(html: string) {
  const scripts = html.matchAll(
    /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  )

  for (const match of scripts) {
    const raw = decodeHtmlEntities(match[1]?.trim() ?? '')
    if (!raw) continue

    try {
      const parsed = JSON.parse(raw) as JsonLdValue
      const contentUrl = findContentUrl(parsed)
      if (!contentUrl) continue

      const url = new URL(contentUrl)
      if (
        url.protocol !== 'https:' ||
        url.hostname !== ALLOWED_AUDIO_HOST ||
        !url.pathname.includes('/download/audio/')
      ) {
        continue
      }

      return url
    } catch {
      // Keep looking: pages can contain multiple JSON-LD blocks.
    }
  }

  return null
}

export async function GET() {
  try {
    const response = await fetch(TRACK_PAGE, {
      headers: {
        accept: 'text/html,application/xhtml+xml',
        'user-agent':
          'Oniria-DEV-Library/0.1 (+https://github.com/miflow13/Oniria)',
      },
      next: {revalidate},
      signal: AbortSignal.timeout(10_000),
    })

    if (!response.ok) {
      throw new Error(
        `Pixabay track page returned ${response.status}`,
      )
    }

    const audioUrl = extractTrackUrl(await response.text())
    if (!audioUrl) {
      throw new Error(
        'Pixabay track metadata did not expose a usable contentUrl',
      )
    }

    return NextResponse.redirect(audioUrl, {
      status: 307,
      headers: {
        'cache-control':
          'public, s-maxage=86400, stale-while-revalidate=604800',
      },
    })
  } catch (error) {
    console.error('[DEV Library] Music resolver failed', error)
    return NextResponse.json(
      {
        error: 'library-music-unavailable',
      },
      {
        status: 502,
        headers: {
          'cache-control': 'no-store',
        },
      },
    )
  }
}
