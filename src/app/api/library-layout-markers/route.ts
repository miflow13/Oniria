import {NextRequest, NextResponse} from 'next/server'
import {hasSanityConfig} from '@/sanity/env'

export const dynamic = 'force-dynamic'
export const revalidate = 0

type MarkerPayload = {
  id?: string
  label?: string
  roomSlot?: number
  districtId?: string
  x?: number
  y?: number
  z?: number
  yaw?: number
  width?: number
  depth?: number
  createdAt?: string
}

const MARKER_QUERY = `*[
  _type == "libraryLayoutMarker"
] | order(roomSlot asc, createdAt asc) {
  "id": _id,
  label,
  roomSlot,
  districtId,
  x,
  y,
  z,
  yaw,
  width,
  depth,
  createdAt
}`

function authorizeWrite(request: NextRequest) {
  const configuredKey =
    process.env.LIBRARY_LAYOUT_AUTHORING_KEY?.trim()
  const suppliedKey =
    request.headers.get('x-oniria-layout-key')?.trim()

  if (configuredKey && suppliedKey !== configuredKey) {
    return false
  }

  // A production deployment without an explicit authoring key remains
  // read-only even if a Sanity write token is present.
  if (
    process.env.VERCEL_ENV === 'production' &&
    !configuredKey
  ) {
    return false
  }

  return true
}

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

export async function GET() {
  if (!hasSanityConfig) {
    return NextResponse.json(
      {markers: [], persistence: 'local-only'},
      {headers: {'cache-control': 'no-store'}},
    )
  }

  try {
    const [{client}] = await Promise.all([
      import('@/sanity/lib/client'),
    ])
    const token =
      process.env.SANITY_API_READ_TOKEN ??
      process.env.SANITY_API_WRITE_TOKEN

    const markers = await client
      .withConfig({
        useCdn: false,
        perspective: 'published',
        token,
      })
      .fetch(MARKER_QUERY, {}, {cache: 'no-store'})

    return NextResponse.json(
      {markers, persistence: 'sanity'},
      {headers: {'cache-control': 'no-store'}},
    )
  } catch (error) {
    console.error('Could not read library layout markers', error)
    return NextResponse.json(
      {markers: [], persistence: 'unavailable'},
      {status: 500, headers: {'cache-control': 'no-store'}},
    )
  }
}

export async function POST(request: NextRequest) {
  if (!authorizeWrite(request)) {
    return NextResponse.json(
      {error: 'layout-authoring-not-authorized'},
      {status: 403},
    )
  }

  const token = process.env.SANITY_API_WRITE_TOKEN
  if (!hasSanityConfig || !token) {
    return NextResponse.json(
      {error: 'sanity-write-unavailable'},
      {status: 503},
    )
  }

  let payload: MarkerPayload
  try {
    payload = (await request.json()) as MarkerPayload
  } catch {
    return NextResponse.json(
      {error: 'invalid-json'},
      {status: 400},
    )
  }

  if (
    typeof payload.label !== 'string' ||
    !Number.isInteger(payload.roomSlot) ||
    (payload.roomSlot ?? -1) < 0 ||
    (payload.roomSlot ?? 99) > 5 ||
    typeof payload.districtId !== 'string' ||
    !finite(payload.x) ||
    !finite(payload.z) ||
    !finite(payload.yaw)
  ) {
    return NextResponse.json(
      {error: 'invalid-marker'},
      {status: 400},
    )
  }

  const markerId =
    payload.id?.replace(/[^a-zA-Z0-9._-]/g, '-') ||
    `libraryLayoutMarker.${crypto.randomUUID()}`

  const document = {
    _id: markerId,
    _type: 'libraryLayoutMarker',
    label: payload.label.slice(0, 80),
    roomSlot: payload.roomSlot,
    districtId: payload.districtId.slice(0, 100),
    x: payload.x,
    y: finite(payload.y) ? payload.y : 0,
    z: payload.z,
    yaw: payload.yaw,
    width: finite(payload.width) ? payload.width : 4.5,
    depth: finite(payload.depth) ? payload.depth : .72,
    createdAt:
      typeof payload.createdAt === 'string'
        ? payload.createdAt
        : new Date().toISOString(),
  }

  try {
    const [{client}] = await Promise.all([
      import('@/sanity/lib/client'),
    ])
    const saved = await client
      .withConfig({
        useCdn: false,
        token,
        perspective: 'published',
      })
      .create(document)

    return NextResponse.json({
      marker: {
        id: saved._id,
        ...document,
      },
      persistence: 'sanity',
    })
  } catch (error) {
    console.error('Could not save library layout marker', error)
    return NextResponse.json(
      {error: 'save-failed'},
      {status: 500},
    )
  }
}

export async function DELETE(request: NextRequest) {
  if (!authorizeWrite(request)) {
    return NextResponse.json(
      {error: 'layout-authoring-not-authorized'},
      {status: 403},
    )
  }

  const token = process.env.SANITY_API_WRITE_TOKEN
  if (!hasSanityConfig || !token) {
    return NextResponse.json(
      {error: 'sanity-write-unavailable'},
      {status: 503},
    )
  }

  const id = request.nextUrl.searchParams.get('id')
  if (!id || !id.startsWith('libraryLayoutMarker.')) {
    return NextResponse.json(
      {error: 'invalid-marker-id'},
      {status: 400},
    )
  }

  try {
    const [{client}] = await Promise.all([
      import('@/sanity/lib/client'),
    ])
    await client
      .withConfig({
        useCdn: false,
        token,
        perspective: 'published',
      })
      .delete(id)

    return NextResponse.json({deleted: id})
  } catch (error) {
    console.error('Could not delete library layout marker', error)
    return NextResponse.json(
      {error: 'delete-failed'},
      {status: 500},
    )
  }
}
