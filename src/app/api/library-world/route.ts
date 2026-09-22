import {NextResponse} from 'next/server'
import {
  DEFAULT_LIBRARY_WORLD_CONFIG,
  mergeLibraryWorldConfig,
} from '@/lib/libraryWorldConfig'
import {hasSanityConfig} from '@/sanity/env'

export const revalidate = 30

export async function GET() {
  if (!hasSanityConfig) {
    return NextResponse.json(DEFAULT_LIBRARY_WORLD_CONFIG)
  }

  try {
    const [{client}, {LIBRARY_WORLD_QUERY}] = await Promise.all([
      import('@/sanity/lib/client'),
      import('@/sanity/lib/queries'),
    ])

    const payload = await client.fetch(LIBRARY_WORLD_QUERY)
    return NextResponse.json(mergeLibraryWorldConfig(payload))
  } catch (error) {
    console.error('Could not load Sanity library world config', error)
    return NextResponse.json({
      ...DEFAULT_LIBRARY_WORLD_CONFIG,
      source: 'fallback',
    })
  }
}
