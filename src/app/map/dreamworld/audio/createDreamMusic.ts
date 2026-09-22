import * as THREE from 'three'
import type {DreamProfile} from '../dreamProfile'

export type DreamMusic = {
  audio: THREE.Audio
  ensurePlaying: () => Promise<void>
  setIntensity: (intensity: number) => void
  dispose: () => void
}

const SCALE_MAJOR = [0, 2, 4, 7, 9]
const SCALE_MINOR = [0, 2, 3, 7, 8]
const SCALE_DREAM = [0, 3, 5, 7, 10]

function hashString(value: string) {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function hzFromMidi(midi: number) {
  return 440 * Math.pow(2, (midi - 69) / 12)
}

export function createDreamMusic(
  listener: THREE.AudioListener,
  profile: DreamProfile,
  seed: number,
  options: {relationshipStrength?: number} = {},
): DreamMusic {
  const context = listener.context
  const sampleRate = context.sampleRate
  const bars = 8
  const bpm = 54 + profile.mood * 5 + Math.min(profile.recurrence, 5) * 2
  const secondsPerBeat = 60 / bpm
  const beats = bars * 4
  const duration = beats * secondsPerBeat
  const frameCount = Math.max(1, Math.floor(sampleRate * duration))
  const buffer = context.createBuffer(1, frameCount, sampleRate)
  const data = buffer.getChannelData(0)

  const scale = profile.lucid
    ? SCALE_MAJOR
    : profile.mood <= 2
      ? SCALE_MINOR
      : SCALE_DREAM

  const rootMidi =
    42 +
    (seed % 8) +
    (profile.categories.place > 0 ? -5 : 0) +
    (profile.categories.action > 0 ? 2 : 0)

  const relationshipStrength = Math.max(
    0,
    Math.min(8, options.relationshipStrength ?? 0),
  )
  const relationInterval =
    relationshipStrength >= 5 ? 7 : relationshipStrength >= 3 ? 5 : 3

  const symbols = profile.symbolNames.length ? profile.symbolNames : ['dream']
  const voices = symbols.slice(0, 6).map((symbol, index) => {
    const symbolSeed = hashString(symbol.toLowerCase()) + seed + index * 97
    const degree = scale[symbolSeed % scale.length]
    const octave = index >= 4 ? 12 : index >= 2 ? 7 : 0
    const relationLift =
      index === 1 || index === 4 ? relationInterval : 0
    return hzFromMidi(rootMidi + degree + octave + relationLift)
  })

  const bass = hzFromMidi(rootMidi - 12)
  const consonance = profile.lucid ? 0.995 : 0.985 - (1 - profile.stability) * 0.01

  for (let frame = 0; frame < frameCount; frame += 1) {
    const t = frame / sampleRate
    const beat = t / secondsPerBeat
    const beatPhase = beat - Math.floor(beat)
    const pulse = Math.exp(-beatPhase * (profile.lucid ? 4.8 : 3.1))

    let sample = Math.sin(Math.PI * 2 * bass * t) * 0.055
    sample += Math.sin(Math.PI * 2 * bass * 0.5 * t + 0.4) * 0.025

    voices.forEach((frequency, index) => {
      const step = Math.floor(beat + index * 0.75)
      const active = (step + index + seed) % (2 + (index % 3)) === 0
      if (!active) return

      const detune = 1 + Math.sin(t * (0.09 + index * 0.013)) * (1 - consonance)
      const envelope = pulse * (0.035 + index * 0.006)
      sample +=
        Math.sin(Math.PI * 2 * frequency * detune * t + index * 0.55) *
        envelope
      sample +=
        Math.sin(Math.PI * 2 * frequency * 2.01 * t + index) *
        envelope *
        0.18
    })

    const shimmer =
      Math.sin(Math.PI * 2 * hzFromMidi(rootMidi + 24) * t + Math.sin(t * 0.27)) *
      (profile.lucid ? 0.012 : 0.006)

    data[frame] = Math.max(-0.42, Math.min(0.42, sample + shimmer))
  }

  const audio = new THREE.Audio(listener)
  audio.setBuffer(buffer)
  audio.setLoop(true)
  audio.setVolume(0.025)

  const filter = context.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.value = profile.lucid ? 3200 : profile.mood <= 2 ? 1450 : 2200
  filter.Q.value = 0.6
  audio.setFilter(filter)

  return {
    audio,
    ensurePlaying: async () => {
      if (context.state === 'suspended') await context.resume()
      if (!audio.isPlaying) audio.play()
    },
    setIntensity: (intensity) => {
      const clamped = Math.max(0, Math.min(1, intensity))
      audio.setVolume(0.012 + clamped * 0.035)
      filter.frequency.setTargetAtTime(
        (profile.lucid ? 2600 : 1300) + clamped * 2100,
        context.currentTime,
        0.12,
      )
    },
    dispose: () => {
      if (audio.isPlaying) audio.stop()
      audio.disconnect()
      filter.disconnect()
    },
  }
}
