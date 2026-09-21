import DreamList from './DreamList'
import {DEMO_DREAMS} from '@/lib/demoData'
import {hasSanityConfig} from '@/sanity/env'
import type {Dream} from '@/types/dream'

export const revalidate = 15

export default async function Home() {
  let dreams: Dream[] = DEMO_DREAMS

  if (hasSanityConfig) {
    const [{client}, {DREAMS_QUERY}] = await Promise.all([
      import('@/sanity/lib/client'),
      import('@/sanity/lib/queries'),
    ])

    dreams = await client.fetch<Dream[]>(DREAMS_QUERY)
  }

  return <DreamList initialDreams={dreams} demoMode={!hasSanityConfig} />
}
