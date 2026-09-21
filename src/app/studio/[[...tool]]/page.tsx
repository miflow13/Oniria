import {hasSanityConfig} from '@/sanity/env'
import DemoEntryForm from './DemoEntryForm'
import StudioClient from './StudioClient'

export default function StudioPage() {
  if (!hasSanityConfig) return <DemoEntryForm />
  return <StudioClient />
}
