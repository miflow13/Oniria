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
  syncMode?: 'drafts' | 'published' | 'local'
  sanityRevision?: string
  sanityPreviewAvailable?: boolean
  sanitySyncIssue?: 'missing-preview-token' | 'fetch-failed'
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
  syncMode: 'local',
  sanityRevision: '',
  sanityPreviewAvailable: false,
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
  let bestDistrict: LibraryDistrictConfig | null = null
  let bestScore = 0

  for (const district of districts) {
    if (!district.enabled || district.devTags.length === 0) continue
    const score = district.devTags.reduce(
      (total, tag) =>
        total + (normalized.has(normalizeDevTag(tag)) ? 1 : 0),
      0,
    )
    if (score > bestScore) {
      bestDistrict = district
      bestScore = score
    }
  }

  return bestDistrict
}


type SanityLibraryWorldPayload = {
  config?: Partial<Omit<LibraryWorldConfig, 'source' | 'districts' | 'curatedArticles' | 'journeys'>>
  districts?: Array<Partial<LibraryDistrictConfig>>
  curatedArticles?: Array<Partial<CuratedDevArticleConfig>>
  journeys?: Array<Partial<ArchiveJourneyConfig>>
}

const atmosphereValues = new Set<LibraryAtmosphere>([
  'dream-archive',
  'crystalline',
  'industrial',
  'deep-void',
])

const audioProfileValues = new Set<LibraryAudioProfile>([
  'ambient',
  'crystalline',
  'mechanical',
  'warm',
  'deep',
])

const landmarkValues = new Set<LibraryLandmarkType>([
  'index',
  'neural-lattice',
  'terminal-wall',
  'syntax-tree',
  'dev-monument',
  'archive-tower',
])

function clamp01(value: unknown, fallback: number) {
  return typeof value === 'number'
    ? Math.max(0, Math.min(1, value))
    : fallback
}

function validHex(value: unknown, fallback: string) {
  return typeof value === 'string' &&
    /^#[0-9a-fA-F]{6}$/.test(value)
    ? value
    : fallback
}

function sanitizeDistrict(
  district: Partial<LibraryDistrictConfig> & {title?: unknown},
  fallback?: LibraryDistrictConfig,
): LibraryDistrictConfig | null {
  const resolvedLabel =
    typeof district.label === 'string'
      ? district.label
      : typeof district.title === 'string'
        ? district.title
        : ''

  if (
    typeof district.id !== 'string' ||
    district.id.trim().length === 0 ||
    resolvedLabel.trim().length === 0 ||
    typeof district.code !== 'string' ||
    typeof district.bay !== 'number'
  ) {
    return null
  }

  return {
    id: district.id,
    label: resolvedLabel,
    code: district.code,
    bay: Math.max(0, Math.min(72, district.bay)),
    description:
      typeof district.description === 'string'
        ? district.description
        : fallback?.description,
    devTags: Array.isArray(district.devTags)
      ? district.devTags.filter(
          (tag): tag is string => typeof tag === 'string',
        )
      : fallback?.devTags ?? [],
    accent: validHex(district.accent, fallback?.accent ?? '#8c7cff'),
    atmosphere:
      typeof district.atmosphere === 'string' &&
      atmosphereValues.has(district.atmosphere as LibraryAtmosphere)
        ? (district.atmosphere as LibraryAtmosphere)
        : fallback?.atmosphere ?? 'dream-archive',
    audioProfile:
      typeof district.audioProfile === 'string' &&
      audioProfileValues.has(
        district.audioProfile as LibraryAudioProfile,
      )
        ? (district.audioProfile as LibraryAudioProfile)
        : fallback?.audioProfile ?? 'ambient',
    landmarkType:
      typeof district.landmarkType === 'string' &&
      landmarkValues.has(
        district.landmarkType as LibraryLandmarkType,
      )
        ? (district.landmarkType as LibraryLandmarkType)
        : fallback?.landmarkType ?? 'index',
    enabled: district.enabled !== false,
  }
}

const MAX_DISTRICT_GAP_BAYS = 4

function compactDistrictRoute(
  districts: LibraryDistrictConfig[],
): LibraryDistrictConfig[] {
  if (districts.length < 2) return districts

  const sorted = [...districts].sort((a, b) => a.bay - b.bay)
  let previousBay = sorted[0]?.bay ?? 0

  return sorted.map((district, index) => {
    if (index === 0) {
      previousBay = district.bay
      return district
    }

    const compactedBay = Math.min(
      district.bay,
      previousBay + MAX_DISTRICT_GAP_BAYS,
    )
    previousBay = compactedBay
    return compactedBay === district.bay
      ? district
      : {...district, bay: compactedBay}
  })
}

export function mergeLibraryWorldConfig(
  payload: SanityLibraryWorldPayload | null | undefined,
): LibraryWorldConfig {
  if (!payload) return DEFAULT_LIBRARY_WORLD_CONFIG

  const config = payload.config ?? {}
  const configuredDistricts = (payload.districts ?? [])
    .map((district) => {
      const fallback = DEFAULT_LIBRARY_DISTRICTS.find(
        (item) => item.id === district.id,
      )
      return sanitizeDistrict(district, fallback)
    })
    .filter(
      (district): district is LibraryDistrictConfig =>
        Boolean(district?.enabled),
    )
    .sort((a, b) => a.bay - b.bay)

  const districts = compactDistrictRoute(
    configuredDistricts.length > 0
      ? configuredDistricts
      : DEFAULT_LIBRARY_DISTRICTS,
  )

  const curatedArticles = (payload.curatedArticles ?? [])
    .filter(
      (item) =>
        typeof item.devArticleId === 'number' &&
        Number.isInteger(item.devArticleId) &&
        item.devArticleId > 0,
    )
    .map((item) => ({
      devArticleId: item.devArticleId as number,
      label:
        typeof item.label === 'string' ? item.label : undefined,
      districtId:
        typeof item.districtId === 'string'
          ? item.districtId
          : undefined,
      featured: item.featured !== false,
      priority:
        typeof item.priority === 'number'
          ? Math.max(0, Math.min(100, item.priority))
          : 50,
      curatorNote:
        typeof item.curatorNote === 'string'
          ? item.curatorNote
          : undefined,
    }))

  const journeys = (payload.journeys ?? [])
    .filter(
      (journey) =>
        typeof journey.id === 'string' &&
        typeof journey.title === 'string' &&
        Array.isArray(journey.stops),
    )
    .map((journey) => ({
      id: journey.id as string,
      title: journey.title as string,
      description:
        typeof journey.description === 'string'
          ? journey.description
          : undefined,
      stops: (journey.stops ?? []).filter(
        (
          stop,
        ): stop is ArchiveJourneyStopConfig =>
          Boolean(
            stop &&
              typeof stop.districtId === 'string',
          ),
      ),
    }))

  return {
    source: 'sanity',
    welcomeTitle:
      typeof config.welcomeTitle === 'string'
        ? config.welcomeTitle
        : DEFAULT_LIBRARY_WORLD_CONFIG.welcomeTitle,
    welcomeSubtitle:
      typeof config.welcomeSubtitle === 'string'
        ? config.welcomeSubtitle
        : DEFAULT_LIBRARY_WORLD_CONFIG.welcomeSubtitle,
    welcomeBody:
      typeof config.welcomeBody === 'string'
        ? config.welcomeBody
        : DEFAULT_LIBRARY_WORLD_CONFIG.welcomeBody,
    archiveStatus:
      typeof config.archiveStatus === 'string'
        ? config.archiveStatus
        : DEFAULT_LIBRARY_WORLD_CONFIG.archiveStatus,
    defaultMovement:
      config.defaultMovement === 'fly' ? 'fly' : 'walk',
    atmosphere:
      typeof config.atmosphere === 'string' &&
      atmosphereValues.has(config.atmosphere as LibraryAtmosphere)
        ? (config.atmosphere as LibraryAtmosphere)
        : DEFAULT_LIBRARY_WORLD_CONFIG.atmosphere,
    hazeIntensity: clamp01(
      config.hazeIntensity,
      DEFAULT_LIBRARY_WORLD_CONFIG.hazeIntensity,
    ),
    liveDevUpdates: config.liveDevUpdates !== false,
    deepStacksEnabled: config.deepStacksEnabled !== false,
    featuredDistrictId:
      typeof config.featuredDistrictId === 'string'
        ? config.featuredDistrictId
        : DEFAULT_LIBRARY_WORLD_CONFIG.featuredDistrictId,
    districts: config.deepStacksEnabled === false
      ? districts.filter((district) => district.id !== 'deep-stacks')
      : districts,
    curatedArticles,
    journeys,
  }
}
