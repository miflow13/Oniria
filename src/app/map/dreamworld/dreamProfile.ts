import type {Dream, DreamSymbol, SymbolCategory} from '@/types/dream'

export type DreamSecret =
  | 'eclipse'
  | 'black-monolith'
  | 'impossible-door'
  | 'constellation-animal'
  | null

export type DreamMotifs = {
  water: boolean
  house: boolean
  eye: boolean
  flying: boolean
  library: boolean
  forest: boolean
  moon: boolean
  door: boolean
  stairs: boolean
  corridor: boolean
  falling: boolean
  person: boolean
  object: boolean
}

export type DreamProfile = {
  dreamId: string
  title: string
  body: string
  mood: number
  lucid: boolean
  ageDays: number
  recurrence: number
  symbols: DreamSymbol[]
  symbolNames: string[]
  categories: Record<SymbolCategory, number>
  motifs: DreamMotifs
  secret: DreamSecret
  fogDensity: number
  wind: number
  stability: number
  decay: number
  warmth: number
}

const emptyCategories = (): Record<SymbolCategory, number> => ({
  person: 0,
  place: 0,
  object: 0,
  feeling: 0,
  action: 0,
})

function includesAny(text: string, values: string[]) {
  return values.some((value) => text.includes(value))
}

export function createDreamProfile(
  dream: Dream,
  recurrence = 1,
  now = Date.now(),
): DreamProfile {
  const symbols = dream.symbols ?? []
  const categories = emptyCategories()

  for (const symbol of symbols) {
    categories[symbol.category] += 1
  }

  const text = `${dream.title ?? ''} ${dream.body} ${symbols
    .map((symbol) => symbol.name)
    .join(' ')}`.toLowerCase()

  const motifs: DreamMotifs = {
    water: includesAny(text, ['water', 'ocean', 'sea', 'rain', 'flood', 'river', 'lake']),
    house: includesAny(text, ['house', 'home', 'room', 'bedroom', 'building']),
    eye: includesAny(text, ['eye', 'watching', 'watched', 'staring', 'gaze']),
    flying: includesAny(text, ['flying', 'fly', 'floating', 'airborne', 'sky']),
    library: includesAny(text, ['library', 'book', 'books', 'shelf', 'shelves']),
    forest: includesAny(text, ['forest', 'tree', 'trees', 'woods']),
    moon: includesAny(text, ['moon', 'lunar', 'night sky']),
    door: includesAny(text, ['door', 'doorway', 'entrance', 'portal']),
    stairs: includesAny(text, ['stairs', 'staircase', 'steps']),
    corridor: includesAny(text, ['corridor', 'hallway', 'hall', 'passage', 'tunnel']),
    falling: includesAny(text, ['falling', 'fall', 'dropped', 'plummet']),
    person: categories.person > 0 || includesAny(text, ['person', 'friend', 'stranger', 'face']),
    object: categories.object > 0,
  }

  const ageMs = Math.max(0, now - new Date(dream.date).getTime())
  const ageDays = Math.max(0, ageMs / 86_400_000)
  const decay = Math.min(1, Math.log2(ageDays + 1) / 8)
  const stability = Math.max(
    0.15,
    Math.min(1, (dream.lucid ? 0.88 : 0.46) + Math.min(recurrence, 5) * 0.065 - decay * 0.18),
  )

  const moodNormalized = Math.max(0, Math.min(1, (dream.mood - 1) / 4))
  const warmth = (moodNormalized - 0.5) * 2
  const wind = 0.16 + (1 - stability) * 0.44 + Math.abs(warmth) * 0.08
  const fogDensity =
    0.045 +
    (1 - stability) * 0.055 +
    (dream.mood <= 2 ? 0.025 : 0) -
    (dream.lucid ? 0.025 : 0)

  let secret: DreamSecret = null
  if (motifs.water && motifs.eye) secret = 'eclipse'
  else if (dream.lucid && recurrence >= 3) secret = 'black-monolith'
  else if (motifs.door && (motifs.falling || motifs.stairs)) secret = 'impossible-door'
  else if (motifs.moon && motifs.person && recurrence >= 2) secret = 'constellation-animal'

  return {
    dreamId: dream._id,
    title: dream.title?.trim() || 'Untitled dream',
    body: dream.body,
    mood: dream.mood,
    lucid: dream.lucid,
    ageDays,
    recurrence,
    symbols,
    symbolNames: symbols.map((symbol) => symbol.name),
    categories,
    motifs,
    secret,
    fogDensity: Math.max(0.018, Math.min(0.13, fogDensity)),
    wind,
    stability,
    decay,
    warmth,
  }
}

export function profileAccent(profile: DreamProfile) {
  if (profile.lucid) return 0x9eeef1
  if (profile.warmth > 0.45) return 0xf0b7d0
  if (profile.warmth < -0.45) return 0x7188c8
  return 0x9b8dd2
}
