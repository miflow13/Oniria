import * as THREE from 'three'
import type {SymbolCategory} from '@/types/dream'

export type SpatialDreamAudio = {
  audio: THREE.PositionalAudio
  ensurePlaying: () => Promise<void>
  setFocus: (focus: number) => void
  dispose: () => void
}

export type SpatialDreamAudioOptions = {
  mood?: number
  lucid?: boolean
  recurrence?: number
  mode?: 'cell' | 'cluster' | 'dive'
}

const CATEGORY_ROOT: Record<SymbolCategory, number> = {
  person: 196,
  place: 110,
  object: 164.81,
  feeling: 146.83,
  action: 220,
}

function seededNoise(index: number, seed: number) {
  return Math.sin(index * 12.9898 + seed * 78.233) * 43758.5453 % 1
}

export function createSpatialDreamAudio(
  listener: THREE.AudioListener,
  category: SymbolCategory,
  seed: number,
  options: SpatialDreamAudioOptions = {},
): SpatialDreamAudio {
  const audio = new THREE.PositionalAudio(listener)
  const context = listener.context
  const sampleRate = context.sampleRate
  const duration = 4
  const frameCount = Math.floor(sampleRate * duration)
  const buffer = context.createBuffer(1, frameCount, sampleRate)
  const data = buffer.getChannelData(0)
  const mood = Math.max(1, Math.min(5, options.mood ?? 3))
  const recurrence = Math.max(1, options.recurrence ?? 1)
  const lucid = Boolean(options.lucid)
  const mode = options.mode ?? 'cell'

  const emotionalPitch =
    mood >= 4 ? 1.045 : mood <= 2 ? 0.94 : 1
  const recurrenceDrop = 1 - Math.min(0.14, (recurrence - 1) * 0.026)
  const root = CATEGORY_ROOT[category] * emotionalPitch * recurrenceDrop
  const fifth = root * (lucid ? 1.498 : 1.5)
  const octave = root * 2

  for (let index = 0; index < frameCount; index += 1) {
    const t = index / sampleRate
    const breathRate =
      mode === 'cluster' ? 0.24 : mode === 'dive' ? 0.34 : 0.42
    const breath =
      0.58 +
      Math.sin(t * Math.PI * breathRate) *
        (lucid ? 0.1 : 0.18)
    const wobble =
      1 +
      Math.sin(t * (lucid ? 0.42 : 0.71) + seed * 0.001) *
        (lucid ? 0.0018 : 0.004)
    const fundamental = Math.sin(Math.PI * 2 * root * wobble * t) * 0.42
    const overtone = Math.sin(Math.PI * 2 * fifth * t + 0.8) * 0.18
    const shimmer = Math.sin(Math.PI * 2 * octave * t + Math.sin(t * 0.9)) * 0.08
    const noise = seededNoise(index, seed) * 0.018
    data[index] = (fundamental + overtone + shimmer + noise) * breath
  }

  audio.setBuffer(buffer)
  const baseVolume =
    mode === 'cluster' ? 0.008 : mode === 'dive' ? 0.045 : 0.03

  audio.setLoop(true)
  audio.setVolume(baseVolume)
  audio.setRefDistance(mode === 'cluster' ? 2.5 : 1.8)
  audio.setRolloffFactor(mode === 'cluster' ? 1.05 : 1.35)
  audio.setDistanceModel('exponential')
  audio.setMaxDistance(mode === 'cluster' ? 28 : 18)

  const filter = context.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.value = lucid ? 1850 : mood <= 2 ? 880 : 1250
  filter.Q.value = 0.45
  audio.setFilter(filter)

  return {
    audio,
    ensurePlaying: async () => {
      if (context.state === 'suspended') {
        await context.resume()
      }
      if (!audio.isPlaying) audio.play()
    },
    setFocus: (focus) => {
      const focusedVolume =
        mode === 'cluster'
          ? baseVolume + focus * 0.012
          : mode === 'dive'
            ? baseVolume + focus * 0.035
            : baseVolume + focus * 0.04

      audio.setVolume(focusedVolume)
      filter.frequency.setTargetAtTime(
        (lucid ? 1500 : mood <= 2 ? 780 : 1050) +
          focus * (lucid ? 1900 : 1450),
        context.currentTime,
        0.08,
      )
    },
    dispose: () => {
      if (audio.isPlaying) audio.stop()
      audio.disconnect()
      filter.disconnect()
    },
  }
}
