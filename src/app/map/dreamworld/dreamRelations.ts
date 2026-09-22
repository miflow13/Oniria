import type {Dream} from '@/types/dream'

export type DreamRelation = {
  dream: Dream
  sharedSymbols: string[]
  sharedIds: string[]
  score: number
}

function normalizedNames(dream: Dream) {
  return new Map(
    (dream.symbols ?? []).map((symbol) => [
      symbol.name.trim().toLowerCase(),
      symbol.name,
    ]),
  )
}

export function getDreamRelations(
  current: Dream,
  dreams: Dream[],
  limit = 4,
): DreamRelation[] {
  const currentIds = new Set((current.symbols ?? []).map((symbol) => symbol._id))
  const currentNames = normalizedNames(current)

  return dreams
    .filter((dream) => dream._id !== current._id)
    .map((dream) => {
      const otherNames = normalizedNames(dream)
      const sharedIds = (dream.symbols ?? [])
        .filter((symbol) => currentIds.has(symbol._id))
        .map((symbol) => symbol._id)

      const sharedSymbols = [...otherNames.keys()]
        .filter((name) => currentNames.has(name))
        .map((name) => currentNames.get(name) ?? name)

      const lucidAffinity = current.lucid === dream.lucid ? 0.3 : 0
      const moodAffinity = Math.max(0, 1 - Math.abs(current.mood - dream.mood) / 4) * 0.45
      const sharedScore = Math.max(sharedIds.length, sharedSymbols.length) * 2.2
      const timeDistanceDays =
        Math.abs(new Date(current.date).getTime() - new Date(dream.date).getTime()) /
        86_400_000
      const temporalAffinity = Math.max(0, 1 - timeDistanceDays / 45) * 0.5

      return {
        dream,
        sharedSymbols,
        sharedIds,
        score: sharedScore + lucidAffinity + moodAffinity + temporalAffinity,
      }
    })
    .filter((relation) => relation.score >= 2)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
}

export function dreamRecurrence(dream: Dream, dreams: Dream[]) {
  const names = new Set(
    (dream.symbols ?? []).map((symbol) => symbol.name.trim().toLowerCase()),
  )

  if (!names.size) return 1

  return Math.max(
    1,
    dreams.filter((candidate) =>
      (candidate.symbols ?? []).some((symbol) =>
        names.has(symbol.name.trim().toLowerCase()),
      ),
    ).length,
  )
}

export type DreamMutation =
  | 'watcher'
  | 'wandering-door'
  | 'memory-fusion'
  | 'echo-room'
  | null

export function chooseDreamMutation(
  dream: Dream,
  relation: DreamRelation | null,
  recurrence: number,
): DreamMutation {
  const text = `${dream.title ?? ''} ${dream.body} ${(dream.symbols ?? [])
    .map((symbol) => symbol.name)
    .join(' ')}`.toLowerCase()

  if (
    recurrence >= 2 &&
    ['eye', 'watch', 'stare', 'gaze'].some((term) => text.includes(term))
  ) {
    return 'watcher'
  }

  if (
    ['door', 'doorway', 'portal', 'entrance'].some((term) => text.includes(term)) &&
    dream.mood <= 3
  ) {
    return 'wandering-door'
  }

  if (relation && relation.score >= 4.4) return 'memory-fusion'
  if (dream.lucid && recurrence >= 2) return 'echo-room'
  return null
}
