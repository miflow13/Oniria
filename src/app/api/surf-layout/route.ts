import {NextResponse} from 'next/server'
import {writeFile} from 'node:fs/promises'
import path from 'node:path'
import type {SurfLayoutConfig} from '@/app/surf/surfLayout'

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isShelfTransform(value: unknown) {
  if (!value || typeof value !== 'object') return false
  const transform = value as {
    x?: unknown
    z?: unknown
    rotationY?: unknown
  }
  return (
    isFiniteNumber(transform.x) &&
    isFiniteNumber(transform.z) &&
    isFiniteNumber(transform.rotationY)
  )
}

function isSceneTransform(value: unknown) {
  if (!value || typeof value !== 'object') return false
  const transform = value as {
    x?: unknown
    y?: unknown
    z?: unknown
    rotationX?: unknown
    rotationY?: unknown
    rotationZ?: unknown
  }
  return (
    isFiniteNumber(transform.x) &&
    isFiniteNumber(transform.y) &&
    isFiniteNumber(transform.z) &&
    isFiniteNumber(transform.rotationX) &&
    isFiniteNumber(transform.rotationY) &&
    isFiniteNumber(transform.rotationZ)
  )
}

function isValidLayout(value: unknown): value is SurfLayoutConfig {
  if (!value || typeof value !== 'object') return false
  const candidate = value as {
    version?: unknown
    shelves?: unknown
    objects?: unknown
  }
  if (candidate.version !== 2) return false
  if (!candidate.shelves || typeof candidate.shelves !== 'object') {
    return false
  }
  if (!candidate.objects || typeof candidate.objects !== 'object') {
    return false
  }

  return (
    Object.values(candidate.shelves).every(isShelfTransform) &&
    Object.values(candidate.objects).every(isSceneTransform)
  )
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
