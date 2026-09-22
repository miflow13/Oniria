import {NextResponse} from 'next/server'
import {writeFile} from 'node:fs/promises'
import path from 'node:path'
import type {SurfLayoutConfig} from '@/app/surf/surfLayout'

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isValidLayout(value: unknown): value is SurfLayoutConfig {
  if (!value || typeof value !== 'object') return false
  const candidate = value as {
    version?: unknown
    shelves?: unknown
  }
  if (candidate.version !== 1) return false
  if (!candidate.shelves || typeof candidate.shelves !== 'object') return false

  return Object.values(candidate.shelves).every((entry) => {
    if (!entry || typeof entry !== 'object') return false
    const transform = entry as {
      x?: unknown
      z?: unknown
      rotationY?: unknown
    }
    return (
      isFiniteNumber(transform.x) &&
      isFiniteNumber(transform.z) &&
      isFiniteNumber(transform.rotationY)
    )
  })
}

export async function POST(request: Request) {
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json(
      {error: 'Layout writes are only available in development.'},
      {status: 403},
    )
  }

  const body: unknown = await request.json()
  if (!isValidLayout(body)) {
    return NextResponse.json(
      {error: 'Invalid layout payload.'},
      {status: 400},
    )
  }

  const target = path.join(
    process.cwd(),
    'src',
    'app',
    'surf',
    'layout.json',
  )
  await writeFile(target, JSON.stringify(body, null, 2) + '\n', 'utf8')

  return NextResponse.json({ok: true})
}
