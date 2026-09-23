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
    _id: 'libraryDistrict.front-page',
    _type: 'libraryDistrict',
    title: 'FRONT PAGE',
    slug: {_type: 'slug', current: 'front-page'},
    code: 'A-01',
    description: 'The current pulse of the DEV Community.',
    devTags: ['devcommunity', 'career', 'productivity'],
    routeBay: 1,
    order: 10,
    accent: '#8c7cff',
    atmosphere: 'dream-archive',
    audioProfile: 'warm',
    landmarkType: 'dev-monument',
    enabled: true,
  },
  {
    _id: 'libraryDistrict.web-dev',
    _type: 'libraryDistrict',
    title: 'WEB DEV',
    slug: {_type: 'slug', current: 'web-dev'},
    code: 'A-08',
    description: 'Frontend, backend, CSS, React, and the open web.',
    devTags: ['webdev', 'frontend', 'backend', 'react', 'css', 'html'],
    routeBay: 6,
    order: 20,
    accent: '#65d4df',
    atmosphere: 'crystalline',
    audioProfile: 'ambient',
    landmarkType: 'index',
    enabled: true,
  },
  {
    _id: 'libraryDistrict.ai',
    _type: 'libraryDistrict',
    title: 'AI',
    slug: {_type: 'slug', current: 'ai'},
    code: 'A-18',
    description: 'Machine learning, LLMs, agents, and generative systems.',
    devTags: ['ai', 'machinelearning', 'llm', 'agents', 'openai'],
    routeBay: 11,
    order: 30,
    accent: '#b48cff',
    atmosphere: 'crystalline',
    audioProfile: 'crystalline',
    landmarkType: 'neural-lattice',
    enabled: true,
  },
  {
    _id: 'libraryDistrict.linux',
    _type: 'libraryDistrict',
    title: 'LINUX',
    slug: {_type: 'slug', current: 'linux'},
    code: 'A-28',
    description: 'Linux desktops, distros, terminals, kernels, and tooling.',
    devTags: ['linux', 'fedora', 'ubuntu', 'archlinux', 'opensource'],
    routeBay: 16,
    order: 40,
    accent: '#72d9c8',
    atmosphere: 'industrial',
    audioProfile: 'mechanical',
    landmarkType: 'terminal-wall',
    enabled: true,
  },
  {
    _id: 'libraryDistrict.javascript',
    _type: 'libraryDistrict',
    title: 'JAVASCRIPT',
    slug: {_type: 'slug', current: 'javascript'},
    code: 'A-38',
    description: 'JavaScript, TypeScript, Node, runtimes, and frameworks.',
    devTags: ['javascript', 'typescript', 'node', 'nextjs', 'react'],
    routeBay: 21,
    order: 50,
    accent: '#f0c96f',
    atmosphere: 'dream-archive',
    audioProfile: 'ambient',
    landmarkType: 'syntax-tree',
    enabled: true,
  },
  {
    _id: 'libraryDistrict.archive-2026',
    _type: 'libraryDistrict',
    title: 'ARCHIVE 2026',
    slug: {_type: 'slug', current: 'archive-2026'},
    code: 'A-48',
    description: 'The current year preserved as a navigable archive.',
    devTags: [],
    routeBay: 26,
    order: 60,
    accent: '#9aa7cf',
    atmosphere: 'dream-archive',
    audioProfile: 'ambient',
    landmarkType: 'archive-tower',
    enabled: true,
  },
  {
    _id: 'libraryDistrict.community',
    _type: 'libraryDistrict',
    title: 'COMMUNITY',
    slug: {_type: 'slug', current: 'community'},
    code: 'A-58',
    description: 'People, careers, learning, collaboration, and community.',
    devTags: ['career', 'beginners', 'learning', 'discuss', 'community'],
    routeBay: 31,
    order: 70,
    accent: '#e6a8cf',
    atmosphere: 'dream-archive',
    audioProfile: 'warm',
    landmarkType: 'index',
    enabled: true,
  },
  {
    _id: 'libraryDistrict.deep-stacks',
    _type: 'libraryDistrict',
    title: 'DEEP STACKS',
    slug: {_type: 'slug', current: 'deep-stacks'},
    code: 'A-68',
    description: 'Long-tail and uncategorized writing deeper in the corpus.',
    devTags: [],
    routeBay: 36,
    order: 80,
    accent: '#786da8',
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
  welcomeSubtitle: 'An explorable archive of DEV Community writing',
  welcomeBody:
    'Walk the archive, browse shelves, inspect books, and open real DEV posts.',
  archiveStatus: 'LIVE ARCHIVE',
  defaultMovement: 'walk',
  atmosphere: 'dream-archive',
  hazeIntensity: .7,
  liveDevUpdates: true,
  deepStacksEnabled: true,
  featuredDistrict: {
    _type: 'reference',
    _ref: 'libraryDistrict.front-page',
  },
}

const journey = {
  _id: 'archiveJourney.first-descent',
  _type: 'archiveJourney',
  title: 'First Descent',
  slug: {_type: 'slug', current: 'first-descent'},
  description:
    'A guided path from the public face of DEV into the deeper archive.',
  enabled: true,
  stops: [
    {
      _key: 'front-page',
      _type: 'journeyStop',
      district: {
        _type: 'reference',
        _ref: 'libraryDistrict.front-page',
      },
      caption: 'Start with the current pulse of the community.',
    },
    {
      _key: 'ai',
      _type: 'journeyStop',
      district: {_type: 'reference', _ref: 'libraryDistrict.ai'},
      caption: 'Move into a rapidly changing knowledge district.',
    },
    {
      _key: 'linux',
      _type: 'journeyStop',
      district: {_type: 'reference', _ref: 'libraryDistrict.linux'},
      caption: 'Cross into the mechanical open-source stacks.',
    },
    {
      _key: 'deep-stacks',
      _type: 'journeyStop',
      district: {
        _type: 'reference',
        _ref: 'libraryDistrict.deep-stacks',
      },
      caption: 'End where the long tail of the archive disappears into fog.',
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
  `Seeded Oniria Library Control + ${districts.length} districts + First Descent journey into "${dataset}".`,
)
