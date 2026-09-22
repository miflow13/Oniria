import DreamDetail from './DreamDetail'
import {DEMO_DREAMS} from '@/lib/demoData'
import {hasSanityConfig} from '@/sanity/env'
import type {Dream} from '@/types/dream'

export const revalidate = 15

export default async function DreamPage({
  params,
}: {
  params: Promise<{id: string}>
}) {
  const {id} = await params
  let dream: Dream | null = DEMO_DREAMS.find((item) => item._id === id) ?? null

  if (hasSanityConfig) {
    const [{client}, {DREAM_BY_ID_QUERY}] = await Promise.all([
      import('@/sanity/lib/client'),
      import('@/sanity/lib/queries'),
    ])

    dream = await client.fetch<Dream | null>(DREAM_BY_ID_QUERY, {id})
  }

  return (
    <DreamDetail
      dreamId={id}
      initialDream={dream}
      demoMode={!hasSanityConfig}
    />
  )
}
