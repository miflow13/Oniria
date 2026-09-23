import {createClient} from 'next-sanity'

const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID
const dataset = process.env.NEXT_PUBLIC_SANITY_DATASET || 'production'
const token = process.env.SANITY_API_WRITE_TOKEN

if (!projectId) {
  throw new Error('NEXT_PUBLIC_SANITY_PROJECT_ID is required')
}

if (!token) {
  throw new Error(
    'SANITY_API_WRITE_TOKEN is required to seed the library world',
  )
}

const client = createClient({
  projectId,
  dataset,
  apiVersion: '2026-09-01',
  token,
  useCdn: false,
})

const districts = [
  {
    _id: 'libraryDistrict.featured',
    _type: 'libraryDistrict',
    title: 'FEATURED',
    slug: {_type: 'slug', current: 'featured'},
    code: 'R-01',
    description: 'Popular and curator-picked DEV writing.',
    devTags: [],
    routeBay: 1,
    roomSlot: 0,
    sourceMode: 'featured',
    order: 10,
    accent: '#3b49df',
    atmosphere: 'dream-archive',
    audioProfile: 'warm',
    landmarkType: 'dev-monument',
    enabled: true,
  },
  {
    _id: 'libraryDistrict.latest',
    _type: 'libraryDistrict',
    title: 'NEW ARRIVALS',
    slug: {_type: 'slug', current: 'latest'},
    code: 'R-02',
    description: 'Freshly published writing from DEV.',
    devTags: [],
    routeBay: 1,
    roomSlot: 1,
    sourceMode: 'latest',
    order: 20,
    accent: '#7295ff',
    atmosphere: 'crystalline',
    audioProfile: 'ambient',
    landmarkType: 'index',
    enabled: true,
  },
  {
    _id: 'libraryDistrict.topics',
    _type: 'libraryDistrict',
    title: 'TOPICS',
    slug: {_type: 'slug', current: 'topics'},
    code: 'R-03',
    description: 'Browse the live collection by DEV tag.',
    devTags: ['webdev', 'javascript', 'typescript', 'react', 'ai', 'linux'],
    routeBay: 4,
    roomSlot: 2,
    sourceMode: 'topics',
    order: 30,
    accent: '#53d3ff',
    atmosphere: 'crystalline',
    audioProfile: 'crystalline',
    landmarkType: 'neural-lattice',
    enabled: true,
  },
  {
    _id: 'libraryDistrict.creators',
    _type: 'libraryDistrict',
    title: 'CREATORS',
    slug: {_type: 'slug', current: 'creators'},
    code: 'R-04',
    description: 'Authors and the writing connected to them.',
    devTags: [],
    routeBay: 4,
    roomSlot: 3,
    sourceMode: 'creators',
    order: 40,
    accent: '#ae7bff',
    atmosphere: 'dream-archive',
    audioProfile: 'warm',
    landmarkType: 'index',
    enabled: true,
  },
  {
    _id: 'libraryDistrict.search',
    _type: 'libraryDistrict',
    title: 'SEARCH',
    slug: {_type: 'slug', current: 'search'},
    code: 'R-05',
    description: 'A live card catalogue backed by DEV search.',
    devTags: [],
    routeBay: 7,
    roomSlot: 4,
    sourceMode: 'search',
    order: 50,
    accent: '#75b7ff',
    atmosphere: 'industrial',
    audioProfile: 'mechanical',
    landmarkType: 'terminal-wall',
    enabled: true,
  },
  {
    _id: 'libraryDistrict.archive',
    _type: 'libraryDistrict',
    title: 'ARCHIVE',
    slug: {_type: 'slug', current: 'archive'},
    code: 'R-06',
    description: 'A progressively streamed long-tail DEV catalogue.',
    devTags: [],
    routeBay: 7,
    roomSlot: 5,
    sourceMode: 'catalog',
    order: 60,
    accent: '#909bb4',
    atmosphere: 'deep-void',
    audioProfile: 'deep',
    landmarkType: 'archive-tower',
    enabled: true,
  },
]

const config = {
  _id: 'libraryConfig',
  _type: 'libraryConfig',
  welcomeTitle: 'DEV LIBRARY',
  welcomeSubtitle: 'Six rooms. One live DEV collection.',
  welcomeBody:
    'Walk the building, browse real DEV shelves, inspect books, and open the original writing.',
  archiveStatus: 'LIVE ARCHIVE',
  defaultMovement: 'walk',
  atmosphere: 'dream-archive',
  hazeIntensity: .45,
  liveDevUpdates: true,
  deepStacksEnabled: true,
  featuredDistrict: {
    _type: 'reference',
    _ref: 'libraryDistrict.featured',
  },
}

const journey = {
  _id: 'archiveJourney.first-descent',
  _type: 'archiveJourney',
  title: 'Library Tour',
  slug: {_type: 'slug', current: 'library-tour'},
  description:
    'A short path through the six-room DEV Library.',
  enabled: true,
  stops: [
    {
      _key: 'featured',
      _type: 'journeyStop',
      district: {
        _type: 'reference',
        _ref: 'libraryDistrict.featured',
      },
      caption: 'Start with what the DEV community is reading now.',
    },
    {
      _key: 'topics',
      _type: 'journeyStop',
      district: {
        _type: 'reference',
        _ref: 'libraryDistrict.topics',
      },
      caption: 'Move from popularity into subject-driven exploration.',
    },
    {
      _key: 'archive',
      _type: 'journeyStop',
      district: {
        _type: 'reference',
        _ref: 'libraryDistrict.archive',
      },
      caption: 'Finish in the continuously streamed archive.',
    },
  ],
}

let transaction = client.transaction()
for (const district of districts) {
  transaction = transaction.createOrReplace(district)
}
transaction = transaction.createOrReplace(config)
transaction = transaction.createOrReplace(journey)

await transaction.commit()

console.log(
  `Seeded Oniria Library Control + ${districts.length} rooms + Library Tour into "${dataset}".`,
)
