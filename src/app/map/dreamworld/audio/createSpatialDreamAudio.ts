import * as THREE from 'three'
import type {SymbolCategory} from '@/types/dream'

export type SpatialDreamAudio = {
  audio: THREE.PositionalAudio
  ensurePlaying: () => Promise<void>
  setFocus: (focus: number) => void
  dispose: () => void
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
): SpatialDreamAudio {
  const audio = new THREE.PositionalAudio(listener)
  const context = listener.context
  const sampleRate = context.sampleRate
  const duration = 4
  const frameCount = Math.floor(sampleRate * duration)
  const buffer = context.createBuffer(1, frameCount, sampleRate)
  const data = buffer.getChannelData(0)
  const root = CATEGORY_ROOT[category]
  const fifth = root * 1.5
  const octave = root * 2

  for (let index = 0; index < frameCount; index += 1) {
    const t = index / sampleRate
    const breath = 0.58 + Math.sin(t * Math.PI * 0.42) * 0.18
    const wobble = 1 + Math.sin(t * 0.71 + seed * 0.001) * 0.004
    const fundamental = Math.sin(Math.PI * 2 * root * wobble * t) * 0.42
    const overtone = Math.sin(Math.PI * 2 * fifth * t + 0.8) * 0.18
    const shimmer = Math.sin(Math.PI * 2 * octave * t + Math.sin(t * 0.9)) * 0.08
    const noise = seededNoise(index, seed) * 0.018
    data[index] = (fundamental + overtone + shimmer + noise) * breath
  }

  audio.setBuffer(buffer)
  audio.setLoop(true)
  audio.setVolume(0.035)
  audio.setRefDistance(1.8)
  audio.setRolloffFactor(1.35)
  audio.setDistanceModel('exponential')
  audio.setMaxDistance(18)

  const filter = context.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.value = 1250
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
      audio.setVolume(0.025 + focus * 0.045)
      filter.frequency.setTargetAtTime(
        1050 + focus * 1450,
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
