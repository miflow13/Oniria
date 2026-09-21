export const apiVersion = '2026-09-01'

// Sanity is optional during local UI testing.
// If these values are missing, the app automatically falls back to browser-local demo mode.
export const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID ?? 'oniria-demo'
export const dataset = process.env.NEXT_PUBLIC_SANITY_DATASET ?? 'production'

export const hasSanityConfig = Boolean(
  process.env.NEXT_PUBLIC_SANITY_PROJECT_ID && process.env.NEXT_PUBLIC_SANITY_DATASET,
)
