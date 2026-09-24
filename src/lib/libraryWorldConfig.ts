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

export type LibraryContentSource =
  | 'featured'
  | 'latest'
  | 'topics'
  | 'creators'
  | 'search'
  | 'catalog'
  | 'tagged'

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
  sourceMode: LibraryContentSource
  roomSlot: number
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

export type LibrarySlotLifecycle =
  | 'dormant'
  | 'forming'
  | 'active'
  | 'cooling'

export type LibrarySlotHistoryEvent = {
  event:
    | 'seeded'
    | 'materialized'
    | 'activated'
    | 'cooling'
    | 'reactivated'
    | 'archived'
    | 'dissolved'
  topic?: string
  at: string
  vitality?: number
  note?: string
}

export type LibrarySlotStateConfig = {
  id?: string
  slotKey: string
  districtId: string
  roomSlot: number
  slotId: string
  zone?: string
  configured: boolean
  occupantKey?: string
  topic?: string
  lifecycle: LibrarySlotLifecycle
  vitality: number
  signalScore: number
  articleCount: number
  risingChecks: number
  lowChecks: number
  materializedAt?: string
  lastActiveAt?: string
  coolingStartedAt?: string
  updatedAt?: string
  history: LibrarySlotHistoryEvent[]
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
  slotStates: LibrarySlotStateConfig[]
  journeys: ArchiveJourneyConfig[]
}

export const DEFAULT_LIBRARY_DISTRICTS: LibraryDistrictConfig[] = [
  {
    id: 'featured',
    label: 'FEATURED',
    code: 'R-01',
    bay: 1,
    description: 'Popular and curator-picked DEV writing.',
    devTags: [],
    accent: '#3b49df',
    atmosphere: 'dream-archive',
    audioProfile: 'warm',
    landmarkType: 'dev-monument',
    sourceMode: 'featured',
    roomSlot: 0,
    enabled: true,
  },
  {
    id: 'latest',
    label: 'NEW ARRIVALS',
    code: 'R-02',
    bay: 1,
    description: 'Freshly published writing from DEV.',
    devTags: [],
    accent: '#7295ff',
    atmosphere: 'crystalline',
    audioProfile: 'ambient',
    landmarkType: 'index',
    sourceMode: 'latest',
    roomSlot: 1,
    enabled: true,
  },
  {
    id: 'topics',
    label: 'TOPICS',
    code: 'R-03',
    bay: 4,
    description: 'Browse the live collection by DEV tag.',
    devTags: ['webdev', 'javascript', 'typescript', 'react', 'ai', 'linux'],
    accent: '#53d3ff',
    atmosphere: 'crystalline',
    audioProfile: 'crystalline',
    landmarkType: 'neural-lattice',
    sourceMode: 'topics',
    roomSlot: 2,
    enabled: true,
  },
  {
    id: 'creators',
    label: 'CREATORS',
    code: 'R-04',
    bay: 4,
    description: 'Authors and the writing connected to them.',
    devTags: [],
    accent: '#ae7bff',
    atmosphere: 'dream-archive',
    audioProfile: 'warm',
    landmarkType: 'index',
    sourceMode: 'creators',
    roomSlot: 3,
    enabled: true,
  },
  {
    id: 'search',
    label: 'SEARCH',
    code: 'R-05',
    bay: 7,
    description: 'A live card catalogue backed by DEV search.',
    devTags: [],
    accent: '#75b7ff',
    atmosphere: 'industrial',
    audioProfile: 'mechanical',
    landmarkType: 'terminal-wall',
    sourceMode: 'search',
    roomSlot: 4,
    enabled: true,
  },
  {
    id: 'archive',
    label: 'ARCHIVE',
    code: 'R-06',
    bay: 7,
    description: 'A progressively streamed long-tail DEV catalogue.',
    devTags: [],
    accent: '#909bb4',
    atmosphere: 'deep-void',
    audioProfile: 'deep',
    landmarkType: 'archive-tower',
    sourceMode: 'catalog',
    roomSlot: 5,
    enabled: true,
  },
]

export const PACKED_DISTRICT_START_BAY = 1
export const PACKED_DISTRICT_GAP_BAYS = 2.25

/**
 * Sanity controls district identity and ordering, while the renderer keeps the
 * physical archive intentionally dense. We preserve authored bay order, then
 * project that ordered sequence onto compact display bays so Studio edits keep
 * affecting what appears without recreating giant empty stretches.
 */
export function packLibraryDistricts(
  districts: LibraryDistrictConfig[],
): LibraryDistrictConfig[] {
  const ordered = [...districts]
    .filter((district) => district.enabled)
    .map((district) => ({
      ...district,
      bay: Math.max(0, Math.min(72, district.bay)),
    }))
    .sort((a, b) => a.bay - b.bay)

  return ordered.map((district, index) => ({
    ...district,
    bay:
      PACKED_DISTRICT_START_BAY +
      index * PACKED_DISTRICT_GAP_BAYS,
  }))
}

export const DEFAULT_LIBRARY_WORLD_CONFIG: LibraryWorldConfig = {
  source: 'fallback',
  syncMode: 'local',
  sanityRevision: '',
  sanityPreviewAvailable: false,
  welcomeTitle: 'DEV LIBRARY',
  welcomeSubtitle: 'Six rooms. One live DEV collection.',
  welcomeBody:
    'Walk the building, browse shelves, inspect books, and open real DEV posts.',
  archiveStatus: 'LIVE ARCHIVE',
  defaultMovement: 'walk',
  atmosphere: 'dream-archive',
  hazeIntensity: .45,
  liveDevUpdates: true,
  deepStacksEnabled: true,
  featuredDistrictId: 'featured',
  districts: DEFAULT_LIBRARY_DISTRICTS,
  curatedArticles: [],
  slotStates: [],
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
  slotStates?: Array<Partial<LibrarySlotStateConfig>>
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

const contentSourceValues = new Set<LibraryContentSource>([
  'featured',
  'latest',
  'topics',
  'creators',
  'search',
  'catalog',
  'tagged',
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

  // Legacy cinematic-district documents predate the six-room model. Until
  // the migration seed is run, ignore those documents instead of collapsing
  // all of them into room slot 0.
  if (
    !fallback &&
    typeof district.sourceMode !== 'string' &&
    typeof district.roomSlot !== 'number'
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
    sourceMode:
      typeof district.sourceMode === 'string' &&
      contentSourceValues.has(
        district.sourceMode as LibraryContentSource,
      )
        ? (district.sourceMode as LibraryContentSource)
        : fallback?.sourceMode ?? 'tagged',
    roomSlot:
      typeof district.roomSlot === 'number'
        ? Math.max(0, Math.min(5, Math.round(district.roomSlot)))
        : fallback?.roomSlot ?? 0,
    enabled: district.enabled !== false,
  }
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

  // The physical building always owns six room slots. During Sanity
  // migration, merge any authored room document over its matching fallback
  // instead of allowing a partially-published dataset to remove rooms.
  const configuredById = new Map(
    configuredDistricts.map((district) => [district.id, district]),
  )
  const districts = DEFAULT_LIBRARY_DISTRICTS.map(
    (fallback) => configuredById.get(fallback.id) ?? fallback,
  ).sort((a, b) => a.roomSlot - b.roomSlot)

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

  const lifecycleValues = new Set<LibrarySlotLifecycle>([
    'dormant',
    'forming',
    'active',
    'cooling',
  ])

  const slotStates = (payload.slotStates ?? [])
    .filter(
      (slot) =>
        typeof slot.slotKey === 'string' &&
        typeof slot.districtId === 'string' &&
        typeof slot.roomSlot === 'number' &&
        typeof slot.slotId === 'string',
    )
    .map((slot) => ({
      id:
        typeof slot.id === 'string'
          ? slot.id
          : undefined,
      slotKey: slot.slotKey as string,
      districtId: slot.districtId as string,
      roomSlot: Math.max(
        0,
        Math.min(5, Math.round(slot.roomSlot as number)),
      ),
      slotId: slot.slotId as string,
      zone:
        typeof slot.zone === 'string'
          ? slot.zone
          : undefined,
      configured: slot.configured === true,
      occupantKey:
        typeof slot.occupantKey === 'string' &&
        slot.occupantKey.length > 0
          ? slot.occupantKey
          : undefined,
      topic:
        typeof slot.topic === 'string' &&
        slot.topic.length > 0
          ? slot.topic
          : undefined,
      lifecycle:
        typeof slot.lifecycle === 'string' &&
        lifecycleValues.has(slot.lifecycle as LibrarySlotLifecycle)
          ? (slot.lifecycle as LibrarySlotLifecycle)
          : 'dormant',
      vitality: clamp01(slot.vitality, 0),
      signalScore:
        typeof slot.signalScore === 'number' &&
        Number.isFinite(slot.signalScore)
          ? Math.max(0, slot.signalScore)
          : 0,
      articleCount:
        typeof slot.articleCount === 'number'
          ? Math.max(0, Math.round(slot.articleCount))
          : 0,
      risingChecks:
        typeof slot.risingChecks === 'number'
          ? Math.max(0, Math.round(slot.risingChecks))
          : 0,
      lowChecks:
        typeof slot.lowChecks === 'number'
          ? Math.max(0, Math.round(slot.lowChecks))
          : 0,
      materializedAt:
        typeof slot.materializedAt === 'string'
          ? slot.materializedAt
          : undefined,
      lastActiveAt:
        typeof slot.lastActiveAt === 'string'
          ? slot.lastActiveAt
          : undefined,
      coolingStartedAt:
        typeof slot.coolingStartedAt === 'string'
          ? slot.coolingStartedAt
          : undefined,
      updatedAt:
        typeof slot.updatedAt === 'string'
          ? slot.updatedAt
          : undefined,
      history: Array.isArray(slot.history)
        ? slot.history
            .filter(
              (
                event,
              ): event is LibrarySlotHistoryEvent =>
                Boolean(
                  event &&
                    typeof event.event === 'string' &&
                    typeof event.at === 'string',
                ),
            )
            .slice(-40)
        : [],
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
      typeof config.featuredDistrictId === 'string' &&
      districts.some(
        (district) => district.id === config.featuredDistrictId,
      )
        ? config.featuredDistrictId
        : DEFAULT_LIBRARY_WORLD_CONFIG.featuredDistrictId,
    districts,
    curatedArticles,
    slotStates,
    journeys,
  }
}
