import {NextRequest, NextResponse} from 'next/server'
import {
  DEFAULT_LIBRARY_WORLD_CONFIG,
  mergeLibraryWorldConfig,
} from '@/lib/libraryWorldConfig'
import {hasSanityConfig} from '@/sanity/env'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET(request: NextRequest) {
  if (!hasSanityConfig) {
    return NextResponse.json(DEFAULT_LIBRARY_WORLD_CONFIG, {
      headers: {'cache-control': 'no-store, max-age=0'},
    })
  }

  try {
    const [{client}, {LIBRARY_WORLD_QUERY}] = await Promise.all([
      import('@/sanity/lib/client'),
      import('@/sanity/lib/queries'),
    ])

    const previewRequested =
      request.nextUrl.searchParams.get('preview') === '1'
    const previewToken =
      process.env.SANITY_API_READ_TOKEN ??
      process.env.SANITY_API_WRITE_TOKEN
    const useDraftPerspective =
      previewRequested &&
      process.env.NODE_ENV !== 'production' &&
      Boolean(previewToken)

    const sanityClient = client.withConfig({
      useCdn: false,
      perspective: useDraftPerspective ? 'drafts' : 'published',
      ...(useDraftPerspective
        ? {token: previewToken}
        : {}),
    })

    const payload = await sanityClient.fetch(
      LIBRARY_WORLD_QUERY,
      {},
      {cache: 'no-store'},
    )
    const world = mergeLibraryWorldConfig(payload)
    world.syncMode = useDraftPerspective
      ? 'drafts'
      : 'published'

    return NextResponse.json(world, {
      headers: {
        'cache-control': 'no-store, max-age=0',
        'x-oniria-sanity-perspective':
          world.syncMode ?? 'published',
      },
    })
  } catch (error) {
    console.error('Could not load Sanity library world config', error)
    return NextResponse.json(
      {
        ...DEFAULT_LIBRARY_WORLD_CONFIG,
        source: 'fallback',
        syncMode: 'local',
      },
      {
        headers: {'cache-control': 'no-store, max-age=0'},
      },
    )
  }
}
