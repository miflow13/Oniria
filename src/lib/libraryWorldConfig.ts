export type LibraryMovementDefault = 'walk' | 'fly'
export type LibraryAtmosphere =
  | 'dream-archive'
  | 'crystalline'
  | 'industrial'
  | 'deep-void'
export type LibraryAudioProfile =
  | 'ambient'
  | 'crystalline'
  | 'mechanical'
  | 'warm'
  | 'deep'
export type LibraryLandmarkType =
  | 'index'
  | 'neural-lattice'
  | 'terminal-wall'
  | 'syntax-tree'
  | 'dev-monument'
  | 'archive-tower'

export type LibraryDistrictConfig = {
  id: string
  label: string
  code: string
  bay: number
  description?: string
  devTags: string[]
  accent: string
  atmosphere: LibraryAtmosphere
  audioProfile: LibraryAudioProfile
  landmarkType: LibraryLandmarkType
  enabled: boolean
}

export type CuratedDevArticleConfig = {
  devArticleId: number
  label?: string
  districtId?: string
  featured: boolean
  priority: number
  curatorNote?: string
}

export type ArchiveJourneyStopConfig = {
  districtId: string
  devArticleId?: number
  caption?: string
}

export type ArchiveJourneyConfig = {
  id: string
  title: string
  description?: string
  stops: ArchiveJourneyStopConfig[]
}

export type LibraryWorldConfig = {
  source: 'sanity' | 'fallback'
  welcomeTitle: string
  welcomeSubtitle: string
  welcomeBody: string
  archiveStatus: string
  defaultMovement: LibraryMovementDefault
  atmosphere: LibraryAtmosphere
  hazeIntensity: number
  liveDevUpdates: boolean
  deepStacksEnabled: boolean
  featuredDistrictId?: string
  districts: LibraryDistrictConfig[]
  curatedArticles: CuratedDevArticleConfig[]
  journeys: ArchiveJourneyConfig[]
}

export const DEFAULT_LIBRARY_DISTRICTS: LibraryDistrictConfig[] = [
  {
    id: 'front-page',
    label: 'FRONT PAGE',
    code: 'A-01',
    bay: 1,
    description: 'The current pulse of the DEV Community.',
    devTags: ['devcommunity', 'career', 'productivity'],
    accent: '#8c7cff',
    atmosphere: 'dream-archive',
    audioProfile: 'warm',
    landmarkType: 'dev-monument',
    enabled: true,
  },
  {
    id: 'web-dev',
    label: 'WEB DEV',
    code: 'A-08',
    bay: 7.5,
    description: 'Frontend, backend, CSS, React, and the open web.',
    devTags: ['webdev', 'frontend', 'backend', 'react', 'css', 'html'],
    accent: '#65d4df',
    atmosphere: 'crystalline',
    audioProfile: 'ambient',
    landmarkType: 'index',
    enabled: true,
  },
  {
    id: 'ai',
    label: 'AI',
    code: 'A-18',
    bay: 17.5,
    description: 'Machine learning, LLMs, agents, and generative systems.',
    devTags: ['ai', 'machinelearning', 'llm', 'agents', 'openai'],
    accent: '#b48cff',
    atmosphere: 'crystalline',
    audioProfile: 'crystalline',
    landmarkType: 'neural-lattice',
    enabled: true,
  },
  {
    id: 'linux',
    label: 'LINUX',
    code: 'A-28',
    bay: 27.5,
    description: 'Linux desktops, distros, terminals, kernels, and tooling.',
    devTags: ['linux', 'fedora', 'ubuntu', 'archlinux', 'opensource'],
    accent: '#72d9c8',
    atmosphere: 'industrial',
    audioProfile: 'mechanical',
    landmarkType: 'terminal-wall',
    enabled: true,
  },
  {
    id: 'javascript',
    label: 'JAVASCRIPT',
    code: 'A-38',
    bay: 37.5,
    description: 'JavaScript, TypeScript, Node, runtimes, and frameworks.',
    devTags: ['javascript', 'typescript', 'node', 'nextjs', 'react'],
    accent: '#f0c96f',
    atmosphere: 'dream-archive',
    audioProfile: 'ambient',
    landmarkType: 'syntax-tree',
    enabled: true,
  },
  {
    id: 'archive-2026',
    label: 'ARCHIVE 2026',
    code: 'A-48',
    bay: 47.5,
    description: 'The current year preserved as a navigable archive.',
    devTags: [],
    accent: '#9aa7cf',
    atmosphere: 'dream-archive',
    audioProfile: 'ambient',
    landmarkType: 'archive-tower',
    enabled: true,
  },
  {
    id: 'community',
    label: 'COMMUNITY',
    code: 'A-58',
    bay: 57.5,
    description: 'People, careers, learning, collaboration, and community.',
    devTags: ['career', 'beginners', 'learning', 'discuss', 'community'],
    accent: '#e6a8cf',
    atmosphere: 'dream-archive',
    audioProfile: 'warm',
    landmarkType: 'index',
    enabled: true,
  },
  {
    id: 'deep-stacks',
    label: 'DEEP STACKS',
    code: 'A-68',
    bay: 67.5,
    description: 'Long-tail and uncategorized writing deeper in the corpus.',
    devTags: [],
    accent: '#786da8',
    atmosphere: 'deep-void',
    audioProfile: 'deep',
    landmarkType: 'archive-tower',
    enabled: true,
  },
]

export const DEFAULT_LIBRARY_WORLD_CONFIG: LibraryWorldConfig = {
  source: 'fallback',
  welcomeTitle: 'DEV LIBRARY',
  welcomeSubtitle: 'An explorable archive of DEV Community writing',
  welcomeBody:
    'Walk the archive, browse shelves, inspect books, and open real DEV posts.',
  archiveStatus: 'LIVE ARCHIVE',
  defaultMovement: 'walk',
  atmosphere: 'dream-archive',
  hazeIntensity: .7,
  liveDevUpdates: true,
  deepStacksEnabled: true,
  featuredDistrictId: 'front-page',
  districts: DEFAULT_LIBRARY_DISTRICTS,
  curatedArticles: [],
  journeys: [],
}

export function normalizeDevTag(tag: string) {
  return tag.trim().toLowerCase().replace(/^#/, '')
}

export function districtForTags(
  tags: string[],
  districts: LibraryDistrictConfig[],
) {
  const normalized = new Set(tags.map(normalizeDevTag))
  let best: {district: LibraryDistrictConfig; score: number} | null = null

  districts.forEach((district) => {
    if (!district.enabled || district.devTags.length === 0) return
    const score = district.devTags.reduce(
      (total, tag) =>
        total + (normalized.has(normalizeDevTag(tag)) ? 1 : 0),
      0,
    )
    if (score > 0 && (!best || score > best.score)) {
      best = {district, score}
    }
  })

  return best?.district ?? null
}
