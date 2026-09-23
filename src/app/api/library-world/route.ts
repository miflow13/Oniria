import {NextRequest, NextResponse} from 'next/server'
import {
  DEFAULT_LIBRARY_WORLD_CONFIG,
  mergeLibraryWorldConfig,
} from '@/lib/libraryWorldConfig'
import {hasSanityConfig} from '@/sanity/env'

export const dynamic = 'force-dynamic'
export const revalidate = 0

type RawDoc = {
  _id?: string
  _rev?: string
  _updatedAt?: string
  [key: string]: unknown
}

function logicalId(id: string | undefined) {
  return (id ?? '').replace(/^drafts\./, '')
}

function preferDrafts<T extends RawDoc>(docs: T[] | undefined) {
  const selected = new Map<string, T>()

  for (const doc of docs ?? []) {
    const key = logicalId(doc._id)
    if (!key) continue
    if (!selected.has(key)) selected.set(key, doc)
  }

  for (const doc of docs ?? []) {
    if (!doc._id?.startsWith('drafts.')) continue
    const key = logicalId(doc._id)
    if (key) selected.set(key, doc)
  }

  return [...selected.values()]
}

export async function GET(request: NextRequest) {
  if (!hasSanityConfig) {
    return NextResponse.json(DEFAULT_LIBRARY_WORLD_CONFIG, {
      headers: {'cache-control': 'no-store, max-age=0'},
    })
  }

  try {
    const [{client}, queries] = await Promise.all([
      import('@/sanity/lib/client'),
      import('@/sanity/lib/queries'),
    ])

    const previewRequested =
      request.nextUrl.searchParams.get('preview') === '1'
    const previewToken =
      process.env.SANITY_API_READ_TOKEN ??
      process.env.SANITY_API_WRITE_TOKEN

    let payload: unknown
    let syncMode: 'drafts' | 'published' = 'published'
    let revision = ''

    if (
      previewRequested &&
      previewToken
    ) {
      const raw = (await client
        .withConfig({
          useCdn: false,
          perspective: 'raw',
          token: previewToken,
        })
        .fetch(
          queries.LIBRARY_WORLD_RAW_QUERY,
          {},
          {cache: 'no-store'},
        )) as {
        configDocs?: RawDoc[]
        districtDocs?: RawDoc[]
        curatedArticleDocs?: RawDoc[]
        journeyDocs?: RawDoc[]
      }

      const configDocs = preferDrafts(raw.configDocs)
      const districtDocs = preferDrafts(raw.districtDocs)
      const curatedDocs = preferDrafts(raw.curatedArticleDocs).filter(
        (doc) => doc.enabled !== false,
      )
      const journeyDocs = preferDrafts(raw.journeyDocs).filter(
        (doc) => doc.enabled !== false,
      )

      const districtSlugById = new Map<string, string>()
      for (const district of districtDocs) {
        if (typeof district.id === 'string') {
          districtSlugById.set(
            logicalId(district._id),
            district.id,
          )
        }
      }

      const config = configDocs[0]
        ? {
            ...configDocs[0],
            featuredDistrictId:
              typeof configDocs[0].featuredDistrictRef === 'string'
                ? districtSlugById.get(
                    logicalId(
                      configDocs[0].featuredDistrictRef as string,
                    ),
                  )
                : undefined,
          }
        : undefined

      payload = {
        config,
        districts: districtDocs.filter(
          (doc) => doc.enabled !== false,
        ),
        curatedArticles: curatedDocs.map((doc) => ({
          ...doc,
          districtId:
            typeof doc.districtRef === 'string'
              ? districtSlugById.get(
                  logicalId(doc.districtRef as string),
                )
              : undefined,
        })),
        journeys: journeyDocs.map((doc) => ({
          ...doc,
          stops: Array.isArray(doc.stops)
            ? (doc.stops as Array<Record<string, unknown>>).map(
                (stop) => ({
                  ...stop,
                  districtId:
                    typeof stop.districtRef === 'string'
                      ? districtSlugById.get(
                          logicalId(stop.districtRef),
                        )
                      : undefined,
                }),
              )
            : [],
        })),
      }

      const updated = [
        ...configDocs,
        ...districtDocs,
        ...curatedDocs,
        ...journeyDocs,
      ]
        .map((doc) =>
          typeof doc._updatedAt === 'string'
            ? doc._updatedAt
            : '',
        )
        .sort()
        .at(-1)

      revision = updated ?? ''
      syncMode = 'drafts'
    } else {
      const published = (await client
        .withConfig({
          useCdn: false,
          perspective: 'published',
        })
        .fetch(
          queries.LIBRARY_WORLD_QUERY,
          {},
          {cache: 'no-store'},
        )) as {
        revision?: string
        [key: string]: unknown
      }
      payload = published
      revision =
        typeof published.revision === 'string'
          ? published.revision
          : ''
    }

    const world = mergeLibraryWorldConfig(
      payload as Parameters<typeof mergeLibraryWorldConfig>[0],
    )
    world.syncMode = syncMode
    world.sanityRevision = revision
    world.sanityPreviewAvailable = Boolean(previewToken)
    if (previewRequested && !previewToken) {
      world.sanitySyncIssue = 'missing-preview-token'
    } else if (previewRequested && previewToken) {
      // Vercel preview/production builds also run with NODE_ENV=production.
      // A valid server-side Sanity token is the authority for draft preview;
      // NODE_ENV must not silently downgrade the browser to published data.
      world.sanitySyncIssue = undefined
    }

    return NextResponse.json(world, {
      headers: {
        'cache-control':
          'no-store, no-cache, max-age=0, must-revalidate',
        pragma: 'no-cache',
        expires: '0',
        'x-oniria-sanity-perspective': syncMode,
        'x-oniria-sanity-revision': revision,
      },
    })
  } catch (error) {
    console.error('Could not load Sanity library world config', error)
    return NextResponse.json(
      {
        ...DEFAULT_LIBRARY_WORLD_CONFIG,
        source: 'fallback',
        syncMode: 'local',
        sanityPreviewAvailable: false,
        sanitySyncIssue: 'fetch-failed',
      },
      {
        headers: {'cache-control': 'no-store, max-age=0'},
      },
    )
  }
}
