import type {RoomShelfPlacement} from '@/app/map/libraryRoomLayout'
import type {
  LibraryDistrictConfig,
  LibrarySlotHistoryEvent,
  LibrarySlotStateConfig,
} from './libraryWorldConfig'
import {
  normalizeTopicVitality,
  stableTopicHash,
  topicQualifies,
  type TopicSignal,
} from './libraryTopicSignals'

const MAX_DYNAMIC_OCCUPANTS = 4
const FORMING_CONFIRMATION_CHECKS = 2
const FORMING_DISSOLVE_CHECKS = 4
const COOLING_TRIGGER_CHECKS = 6
const ARCHIVE_TRIGGER_CHECKS = 96
const REACTIVATE_VITALITY = .38
const MAX_HISTORY = 40

export type LibraryEvolutionEvent = {
  slotId: string
  event: LibrarySlotHistoryEvent['event']
  topic?: string
  vitality: number
}

export type LibraryEvolutionResult = {
  states: LibrarySlotStateConfig[]
  events: LibraryEvolutionEvent[]
  occupied: number
  dormant: number
}

function normalizeTag(tag: string) {
  return tag.trim().toLowerCase().replace(/^#/, '')
}

function clampCount(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.round(value))
    : 0
}

function slotKey(districtId: string, slotId: string) {
  return `${districtId}:${slotId}`
}

function appendHistory(
  state: LibrarySlotStateConfig,
  event: LibrarySlotHistoryEvent['event'],
  at: string,
  topic: string | undefined,
  vitality: number,
  note?: string,
) {
  const entry: LibrarySlotHistoryEvent = {
    event,
    topic,
    at,
    vitality,
    note,
  }
  state.history = [...(state.history ?? []), entry].slice(-MAX_HISTORY)
}

function baseState(
  district: LibraryDistrictConfig,
  placement: RoomShelfPlacement,
  current?: LibrarySlotStateConfig,
): LibrarySlotStateConfig {
  return {
    id: current?.id,
    slotKey: slotKey(district.id, placement.slotId),
    districtId: district.id,
    roomSlot: district.roomSlot,
    slotId: placement.slotId,
    zone: placement.zone,
    configured: current?.configured ?? false,
    occupantKey: current?.occupantKey,
    topic: current?.topic,
    lifecycle: current?.lifecycle ?? 'dormant',
    vitality: current?.vitality ?? 0,
    signalScore: current?.signalScore ?? 0,
    articleCount: clampCount(current?.articleCount),
    risingChecks: clampCount(current?.risingChecks),
    lowChecks: clampCount(current?.lowChecks),
    materializedAt: current?.materializedAt,
    lastActiveAt: current?.lastActiveAt,
    coolingStartedAt: current?.coolingStartedAt,
    updatedAt: current?.updatedAt,
    history: [...(current?.history ?? [])].slice(-MAX_HISTORY),
  }
}

function clearOccupant(
  state: LibrarySlotStateConfig,
  now: string,
) {
  state.configured = false
  state.occupantKey = undefined
  state.topic = undefined
  state.lifecycle = 'dormant'
  state.vitality = 0
  state.signalScore = 0
  state.articleCount = 0
  state.risingChecks = 0
  state.lowChecks = 0
  state.materializedAt = undefined
  state.lastActiveAt = undefined
  state.coolingStartedAt = undefined
  state.updatedAt = now
}

export function evolveTopicSlots({
  district,
  placements,
  currentStates,
  signals,
  now = new Date().toISOString(),
}: {
  district: LibraryDistrictConfig
  placements: RoomShelfPlacement[]
  currentStates: LibrarySlotStateConfig[]
  signals: TopicSignal[]
  now?: string
}): LibraryEvolutionResult {
  const events: LibraryEvolutionEvent[] = []
  const configuredTags = district.devTags
    .map(normalizeTag)
    .filter(Boolean)
  const configuredSet = new Set(configuredTags)
  const signalByTag = new Map(
    signals.map((signal) => [normalizeTag(signal.tag), signal]),
  )
  const maximumScore = Math.max(
    1,
    ...signals.map((signal) => signal.score),
  )
  const currentBySlot = new Map(
    currentStates
      .filter((state) => state.districtId === district.id)
      .map((state) => [state.slotKey, state]),
  )

  const states = placements.map((placement, index) => {
    const key = slotKey(district.id, placement.slotId)
    const current = currentBySlot.get(key)
    const state = baseState(district, placement, current)
    const configuredTopic = configuredTags[index]

    if (configuredTopic) {
      const signal = signalByTag.get(configuredTopic)
      const vitality = normalizeTopicVitality(
        signal?.score ?? 0,
        maximumScore,
      )
      const newlySeeded =
        !current ||
        current.topic !== configuredTopic ||
        current.configured !== true

      state.configured = true
      state.occupantKey = `topic:${configuredTopic}`
      state.topic = configuredTopic
      state.lifecycle = 'active'
      state.vitality = vitality
      state.signalScore = signal?.score ?? 0
      state.articleCount = signal?.articles.length ?? 0
      state.risingChecks = 0
      state.lowChecks = 0
      state.materializedAt =
        current?.materializedAt ?? now
      state.lastActiveAt = now
      state.coolingStartedAt = undefined
      state.updatedAt = now

      if (newlySeeded) {
        appendHistory(
          state,
          'seeded',
          now,
          configuredTopic,
          vitality,
          'Configured topic anchored to permanent slot.',
        )
        events.push({
          slotId: state.slotId,
          event: 'seeded',
          topic: configuredTopic,
          vitality,
        })
      }
      return state
    }

    if (!state.topic || !state.occupantKey) {
      clearOccupant(state, now)
      return state
    }

    const topic = normalizeTag(state.topic)
    const signal = signalByTag.get(topic)
    const vitality = normalizeTopicVitality(
      signal?.score ?? 0,
      maximumScore,
    )
    const qualifies = topicQualifies(signal)

    state.configured = false
    state.topic = topic
    state.occupantKey = `topic:${topic}`
    state.vitality = vitality
    state.signalScore = signal?.score ?? 0
    state.articleCount = signal?.articles.length ?? 0
    state.updatedAt = now

    if (state.lifecycle === 'forming') {
      if (qualifies) {
        state.risingChecks += 1
        state.lowChecks = 0
        if (
          state.risingChecks >= FORMING_CONFIRMATION_CHECKS
        ) {
          state.lifecycle = 'active'
          state.lastActiveAt = now
          appendHistory(
            state,
            'activated',
            now,
            topic,
            vitality,
            'Topic remained above the emergence threshold.',
          )
          events.push({
            slotId: state.slotId,
            event: 'activated',
            topic,
            vitality,
          })
        }
      } else {
        state.risingChecks = 0
        state.lowChecks += 1
        if (state.lowChecks >= FORMING_DISSOLVE_CHECKS) {
          appendHistory(
            state,
            'dissolved',
            now,
            topic,
            vitality,
            'Emergence signal faded before activation.',
          )
          events.push({
            slotId: state.slotId,
            event: 'dissolved',
            topic,
            vitality,
          })
          clearOccupant(state, now)
        }
      }
      return state
    }

    if (state.lifecycle === 'active') {
      if (qualifies) {
        state.lowChecks = 0
        state.lastActiveAt = now
      } else {
        state.lowChecks += 1
        if (state.lowChecks >= COOLING_TRIGGER_CHECKS) {
          state.lifecycle = 'cooling'
          state.coolingStartedAt = now
          appendHistory(
            state,
            'cooling',
            now,
            topic,
            vitality,
            'Topic activity stayed below the active threshold.',
          )
          events.push({
            slotId: state.slotId,
            event: 'cooling',
            topic,
            vitality,
          })
        }
      }
      return state
    }

    if (state.lifecycle === 'cooling') {
      if (qualifies && vitality >= REACTIVATE_VITALITY) {
        state.lifecycle = 'active'
        state.lowChecks = 0
        state.lastActiveAt = now
        state.coolingStartedAt = undefined
        appendHistory(
          state,
          'reactivated',
          now,
          topic,
          vitality,
          'Topic recovered before archival.',
        )
        events.push({
          slotId: state.slotId,
          event: 'reactivated',
          topic,
          vitality,
        })
      } else {
        state.lowChecks += 1
        if (state.lowChecks >= ARCHIVE_TRIGGER_CHECKS) {
          appendHistory(
            state,
            'archived',
            now,
            topic,
            vitality,
            'Topic retired from the live room; slot returned to latent space.',
          )
          events.push({
            slotId: state.slotId,
            event: 'archived',
            topic,
            vitality,
          })
          clearOccupant(state, now)
        }
      }
      return state
    }

    clearOccupant(state, now)
    return state
  })

  const occupiedTopics = new Set(
    states
      .map((state) => state.topic)
      .filter((topic): topic is string => Boolean(topic)),
  )
  let dynamicOccupants = states.filter(
    (state) =>
      !state.configured &&
      state.lifecycle !== 'dormant' &&
      Boolean(state.topic),
  ).length
  const candidates = signals.filter(
    (signal) =>
      topicQualifies(signal) &&
      !configuredSet.has(normalizeTag(signal.tag)) &&
      !occupiedTopics.has(normalizeTag(signal.tag)),
  )

  const dormantIndices = states
    .map((state, index) => ({state, index}))
    .filter(({state}) => state.lifecycle === 'dormant')
    .map(({index}) => index)

  for (const signal of candidates) {
    if (
      dynamicOccupants >= MAX_DYNAMIC_OCCUPANTS ||
      dormantIndices.length === 0
    ) {
      break
    }

    const topic = normalizeTag(signal.tag)
    const start =
      stableTopicHash(topic) % dormantIndices.length
    const chosenPosition = dormantIndices.splice(start, 1)[0]
    const state = states[chosenPosition]
    const vitality = normalizeTopicVitality(
      signal.score,
      maximumScore,
    )

    state.configured = false
    state.occupantKey = `topic:${topic}`
    state.topic = topic
    state.lifecycle = 'forming'
    state.vitality = vitality
    state.signalScore = signal.score
    state.articleCount = signal.articles.length
    state.risingChecks = 1
    state.lowChecks = 0
    state.materializedAt = now
    state.lastActiveAt = undefined
    state.coolingStartedAt = undefined
    state.updatedAt = now
    appendHistory(
      state,
      'materialized',
      now,
      topic,
      vitality,
      'Live DEV activity claimed previously dormant library space.',
    )
    events.push({
      slotId: state.slotId,
      event: 'materialized',
      topic,
      vitality,
    })
    occupiedTopics.add(topic)
    dynamicOccupants += 1
  }

  return {
    states,
    events,
    occupied: states.filter(
      (state) => state.lifecycle !== 'dormant',
    ).length,
    dormant: states.filter(
      (state) => state.lifecycle === 'dormant',
    ).length,
  }
}
