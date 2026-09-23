import * as THREE from 'three'
import type {
  LibraryAudioProfile,
  LibraryDistrictConfig,
} from '@/lib/libraryWorldConfig'

export type LibraryAudioMovementMode = 'walk' | 'fly'

type LibraryAudioUpdate = {
  enabled: boolean
  movementMode: LibraryAudioMovementMode
  speed: number
  elapsed: number
  currentBay: number
  activeAudioProfile?: LibraryAudioProfile
  districts: Pick<
    LibraryDistrictConfig,
    'bay' | 'audioProfile'
  >[]
}

type LibraryShelfFocusUpdate = {
  enabled: boolean
  shelfId: string | null
  focusStrength: number
}

export type LibraryAudioController = {
  update: (state: LibraryAudioUpdate) => void
  updateShelfFocus: (state: LibraryShelfFocusUpdate) => void
  dispose: () => void
}

const AUDIO_ENABLE_EVENT = 'oniria:library-audio-enable'

const PROFILE_FREQUENCIES: Record<
  LibraryAudioProfile,
  {drone: number; tone: number}
> = {
  ambient: {drone: 92, tone: 184},
  crystalline: {drone: 146, tone: 292},
  mechanical: {drone: 72, tone: 144},
  warm: {drone: 98, tone: 196},
  deep: {drone: 58, tone: 116},
}

export function createLibraryAudio(
  listener: THREE.AudioListener,
): LibraryAudioController {
  const context = listener.context as AudioContext

  const master = context.createGain()
  master.gain.value = 0
  master.connect(listener.getInput())

  const floorFilter = context.createBiquadFilter()
  floorFilter.type = 'lowpass'
  floorFilter.frequency.value = 180
  floorFilter.Q.value = .6

  const floorOscillator = context.createOscillator()
  floorOscillator.type = 'sine'
  floorOscillator.frequency.value = 54
  const floorGain = context.createGain()
  floorGain.gain.value = .012
  floorOscillator
    .connect(floorFilter)
    .connect(floorGain)
    .connect(master)
  floorOscillator.start()

  const droneFilter = context.createBiquadFilter()
  droneFilter.type = 'lowpass'
  droneFilter.frequency.value = 420
  droneFilter.Q.value = .8

  const droneOscillator = context.createOscillator()
  droneOscillator.type = 'triangle'
  droneOscillator.frequency.value = 92
  const droneGain = context.createGain()
  droneGain.gain.value = .007
  droneOscillator
    .connect(droneFilter)
    .connect(droneGain)
    .connect(master)
  droneOscillator.start()

  const toneOscillator = context.createOscillator()
  toneOscillator.type = 'sine'
  toneOscillator.frequency.value = 184
  const toneGain = context.createGain()
  toneGain.gain.value = .0022
  toneOscillator
    .connect(toneGain)
    .connect(master)
  toneOscillator.start()

  const noiseBuffer = context.createBuffer(
    1,
    context.sampleRate * 2,
    context.sampleRate,
  )
  const noiseData = noiseBuffer.getChannelData(0)
  for (let index = 0; index < noiseData.length; index += 1) {
    noiseData[index] = Math.random() * 2 - 1
  }

  const noiseSource = context.createBufferSource()
  noiseSource.buffer = noiseBuffer
  noiseSource.loop = true
  const windFilter = context.createBiquadFilter()
  windFilter.type = 'bandpass'
  windFilter.frequency.value = 460
  windFilter.Q.value = .38
  const windGain = context.createGain()
  windGain.gain.value = .002
  noiseSource
    .connect(windFilter)
    .connect(windGain)
    .connect(master)
  noiseSource.start()

  let nextFootstepAt = 0
  let lastShelfId: string | null = null
  let disposed = false

  const createTone = (
    frequency: number,
    volume: number,
    duration: number,
    type: OscillatorType = 'sine',
  ) => {
    if (disposed || context.state !== 'running') return

    const now = context.currentTime
    const oscillator = context.createOscillator()
    const gain = context.createGain()

    oscillator.type = type
    oscillator.frequency.setValueAtTime(frequency, now)
    oscillator.frequency.exponentialRampToValueAtTime(
      Math.max(24, frequency * .72),
      now + duration,
    )

    gain.gain.setValueAtTime(.0001, now)
    gain.gain.exponentialRampToValueAtTime(
      Math.max(.0002, volume),
      now + .012,
    )
    gain.gain.exponentialRampToValueAtTime(
      .0001,
      now + duration,
    )

    oscillator.connect(gain)
    gain.connect(master)
    oscillator.start(now)
    oscillator.stop(now + duration + .025)
  }

  const playShelfWake = () => {
    createTone(520, .013, .22)

    if (disposed || context.state !== 'running') return

    const now = context.currentTime
    const oscillator = context.createOscillator()
    const gain = context.createGain()

    oscillator.type = 'sine'
    oscillator.frequency.setValueAtTime(780, now)
    oscillator.frequency.exponentialRampToValueAtTime(
      620,
      now + .3,
    )

    gain.gain.setValueAtTime(.0001, now)
    gain.gain.exponentialRampToValueAtTime(.008, now + .018)
    gain.gain.exponentialRampToValueAtTime(.0001, now + .3)

    oscillator.connect(gain)
    gain.connect(master)
    oscillator.start(now)
    oscillator.stop(now + .34)
  }

  const playFootstep = (strength: number) => {
    createTone(
      82 + strength * 12,
      .008 + strength * .008,
      .095,
      'triangle',
    )
  }

  const handleUnlock = () => {
    if (disposed) return
    void context.resume()
  }

  window.addEventListener(AUDIO_ENABLE_EVENT, handleUnlock)

  return {
    update({
      enabled,
      movementMode,
      speed,
      elapsed,
      currentBay,
      activeAudioProfile,
      districts,
    }) {
      if (disposed) return

      const now = context.currentTime
      const audible = enabled && context.state === 'running'

      master.gain.setTargetAtTime(
        audible ? .74 : 0,
        now,
        audible ? .18 : .06,
      )

      if (!audible) return

      const walking = movementMode === 'walk'
      const speedStrength = THREE.MathUtils.clamp(
        speed / 4.25,
        0,
        1,
      )

      floorGain.gain.setTargetAtTime(
        walking ? .014 : .006,
        now,
        .18,
      )
      windGain.gain.setTargetAtTime(
        walking
          ? .0015 + speedStrength * .001
          : .008 + speedStrength * .008,
        now,
        .2,
      )
      droneGain.gain.setTargetAtTime(
        .006 + (1 - speedStrength) * .003,
        now,
        .28,
      )

      if (activeAudioProfile || districts.length > 0) {
        const profile =
          activeAudioProfile ??
          districts.reduce(
            (nearest, candidate) =>
              Math.abs(candidate.bay - currentBay) <
              Math.abs(nearest.bay - currentBay)
                ? candidate
                : nearest,
          ).audioProfile
        const frequencies =
          PROFILE_FREQUENCIES[profile]

        droneOscillator.frequency.setTargetAtTime(
          frequencies.drone,
          now,
          .9,
        )
        toneOscillator.frequency.setTargetAtTime(
          frequencies.tone,
          now,
          .9,
        )
      }

      if (
        walking &&
        speedStrength > .18 &&
        elapsed >= nextFootstepAt
      ) {
        playFootstep(speedStrength)
        nextFootstepAt =
          elapsed + THREE.MathUtils.lerp(.58, .38, speedStrength)
      }
    },

    updateShelfFocus({enabled, shelfId, focusStrength}) {
      if (disposed) return

      if (
        enabled &&
        focusStrength > .32 &&
        shelfId &&
        shelfId !== lastShelfId
      ) {
        playShelfWake()
        lastShelfId = shelfId
      } else if (focusStrength < .08) {
        lastShelfId = null
      }
    },

    dispose() {
      if (disposed) return
      disposed = true

      window.removeEventListener(AUDIO_ENABLE_EVENT, handleUnlock)

      noiseSource.stop()
      floorOscillator.stop()
      droneOscillator.stop()
      toneOscillator.stop()

      noiseSource.disconnect()
      floorOscillator.disconnect()
      droneOscillator.disconnect()
      toneOscillator.disconnect()
      floorFilter.disconnect()
      droneFilter.disconnect()
      windFilter.disconnect()
      floorGain.disconnect()
      droneGain.disconnect()
      toneGain.disconnect()
      windGain.disconnect()
      master.disconnect()
    },
  }
}
