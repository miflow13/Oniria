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

const PROFILE_MUSIC_FILTER: Record<
  LibraryAudioProfile,
  number
> = {
  ambient: 3600,
  crystalline: 5200,
  mechanical: 2850,
  warm: 3300,
  deep: 2350,
}

const LIBRARY_MUSIC_BPM = 62
const LIBRARY_MUSIC_BARS = 16
const LIBRARY_MUSIC_ROOT_MIDI = 50 // D3

const LIBRARY_CHORDS = [
  [0, 3, 7, 10, 14], // Dm9
  [-4, 0, 3, 7], // Bbmaj7
  [3, 7, 10, 14], // Fmaj7
  [-2, 0, 2, 5, 10], // Cadd9
  [5, 8, 12, 15], // Gm7
  [-4, 0, 3, 7], // Bbmaj7
  [3, 7, 10, 14], // Fmaj7
  [-2, 0, 5, 10], // Csus2/add9
] as const

const LIBRARY_MELODY = [
  14,
  10,
  7,
  12,
  10,
  7,
  3,
  7,
  14,
  15,
  10,
  7,
  12,
  10,
  7,
  3,
] as const

function midiToHz(midi: number) {
  return 440 * Math.pow(2, (midi - 69) / 12)
}

function createLibraryMusicBuffer(context: AudioContext) {
  const secondsPerBeat = 60 / LIBRARY_MUSIC_BPM
  const secondsPerBar = secondsPerBeat * 4
  const duration = LIBRARY_MUSIC_BARS * secondsPerBar
  const sampleRate = context.sampleRate
  const frameCount = Math.ceil(duration * sampleRate)
  const buffer = context.createBuffer(
    2,
    frameCount,
    sampleRate,
  )
  const left = buffer.getChannelData(0)
  const right = buffer.getChannelData(1)

  const addVoice = (
    start: number,
    noteDuration: number,
    midi: number,
    amplitude: number,
    pan: number,
    character: 'felt' | 'bell' | 'low' = 'felt',
  ) => {
    const startFrame = Math.max(
      0,
      Math.floor(start * sampleRate),
    )
    const endFrame = Math.min(
      frameCount,
      Math.ceil((start + noteDuration) * sampleRate),
    )
    const frequency = midiToHz(midi)
    const leftGain = Math.cos(
      ((pan + 1) * Math.PI) / 4,
    )
    const rightGain = Math.sin(
      ((pan + 1) * Math.PI) / 4,
    )

    for (let frame = startFrame; frame < endFrame; frame += 1) {
      const t = frame / sampleRate - start
      const progress = THREE.MathUtils.clamp(
        t / noteDuration,
        0,
        1,
      )
      const attackTime =
        character === 'bell'
          ? .018
          : character === 'low'
            ? .09
            : .065
      const attack = Math.min(1, t / attackTime)
      const decay =
        character === 'bell'
          ? Math.exp(-progress * 5.2)
          : character === 'low'
            ? Math.exp(-progress * 2.2)
            : Math.exp(-progress * 2.9)
      const release =
        progress > .82
          ? Math.cos(
              ((progress - .82) / .18) *
                (Math.PI / 2),
            )
          : 1
      const envelope =
        attack * decay * Math.max(0, release)

      const fundamental =
        Math.sin(Math.PI * 2 * frequency * t)
      const second =
        Math.sin(
          Math.PI * 2 * frequency * 2.002 * t + .22,
        )
      const third =
        Math.sin(
          Math.PI * 2 * frequency * 3.004 * t + .53,
        )
      const sample =
        character === 'bell'
          ? fundamental * .72 +
            second * .22 +
            third * .06
          : character === 'low'
            ? fundamental * .9 + second * .1
            : fundamental * .82 +
              second * .14 +
              third * .04
      const value = sample * envelope * amplitude

      left[frame] += value * leftGain
      right[frame] += value * rightGain
    }
  }

  for (let bar = 0; bar < LIBRARY_MUSIC_BARS; bar += 1) {
    const barStart = bar * secondsPerBar
    const chord =
      LIBRARY_CHORDS[bar % LIBRARY_CHORDS.length]

    chord.forEach((offset, voiceIndex) => {
      const octaveLift =
        voiceIndex >= 3 ? 12 : voiceIndex === 0 ? -12 : 0
      addVoice(
        barStart + voiceIndex * .045,
        secondsPerBar * .92,
        LIBRARY_MUSIC_ROOT_MIDI + offset + octaveLift,
        voiceIndex === 0 ? .018 : .022,
        THREE.MathUtils.clamp(
          (voiceIndex - 2) * .28,
          -.7,
          .7,
        ),
        voiceIndex === 0 ? 'low' : 'felt',
      )
    })

    const melodyMidi =
      LIBRARY_MUSIC_ROOT_MIDI +
      LIBRARY_MELODY[bar] +
      12
    addVoice(
      barStart + secondsPerBeat * 1.55,
      secondsPerBeat * 1.2,
      melodyMidi,
      .024,
      bar % 2 === 0 ? -.38 : .38,
      'bell',
    )

    if (bar % 2 === 1) {
      addVoice(
        barStart + secondsPerBeat * 3.05,
        secondsPerBeat * .72,
        melodyMidi - (bar % 4 === 1 ? 4 : 7),
        .014,
        bar % 4 === 1 ? .52 : -.52,
        'bell',
      )
    }
  }

  // Gentle saturation keeps overlapping chord tails musical without a hard
  // limiter. The composition ends in silence before wrapping, so the loop
  // point stays clean.
  for (let frame = 0; frame < frameCount; frame += 1) {
    left[frame] = Math.tanh(left[frame] * 1.35) * .72
    right[frame] = Math.tanh(right[frame] * 1.35) * .72
  }

  return buffer
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

  // A real musical loop replaces the old continuous drone/tone pair.
  // The one-minute phrase uses felt-piano-like chords and sparse bell notes,
  // with a clean silent tail so it can repeat for long reading sessions.
  const musicSource = context.createBufferSource()
  musicSource.buffer = createLibraryMusicBuffer(context)
  musicSource.loop = true
  musicSource.loopStart = 0
  musicSource.loopEnd = musicSource.buffer.duration

  const musicFilter = context.createBiquadFilter()
  musicFilter.type = 'lowpass'
  musicFilter.frequency.value = PROFILE_MUSIC_FILTER.ambient
  musicFilter.Q.value = .32

  const musicGain = context.createGain()
  musicGain.gain.value = .17

  musicSource
    .connect(musicFilter)
    .connect(musicGain)
    .connect(master)
  musicSource.start()

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
      musicGain.gain.setTargetAtTime(
        walking
          ? .165 - speedStrength * .025
          : .145,
        now,
        .65,
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

        // Rooms shade the same composition through timbre instead of changing
        // key or restarting the song, so walking the library never breaks the
        // musical phrase.
        musicFilter.frequency.setTargetAtTime(
          PROFILE_MUSIC_FILTER[profile],
          now,
          1.2,
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
      musicSource.stop()

      noiseSource.disconnect()
      floorOscillator.disconnect()
      musicSource.disconnect()
      floorFilter.disconnect()
      musicFilter.disconnect()
      windFilter.disconnect()
      floorGain.disconnect()
      musicGain.disconnect()
      windGain.disconnect()
      master.disconnect()
    },
  }
}
