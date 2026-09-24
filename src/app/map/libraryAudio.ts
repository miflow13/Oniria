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
const AUDIO_CUE_EVENT = 'oniria:library-audio-cue'

export type LibraryAudioCue =
  | 'room-enter'
  | 'book-open'
  | 'article-open'
  | 'article-close'
  | 'locate'

export function emitLibraryAudioCue(cue: LibraryAudioCue) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(
    new CustomEvent(AUDIO_CUE_EVENT, {
      detail: {cue},
    }),
  )
}

const ROOM_TONE_PROFILES: Record<
  LibraryAudioProfile,
  {frequency: number; cutoff: number; gain: number}
> = {
  ambient: {frequency: 108, cutoff: 620, gain: .006},
  crystalline: {frequency: 214, cutoff: 1180, gain: .0048},
  mechanical: {frequency: 72, cutoff: 430, gain: .0065},
  warm: {frequency: 142, cutoff: 760, gain: .0056},
  deep: {frequency: 54, cutoff: 310, gain: .0072},
}

const LIBRARY_MUSIC_URL =
  '/audio/solarflex-ambient-ambient-music-569592.mp3'

export function createLibraryAudio(
  listener: THREE.AudioListener,
): LibraryAudioController {
  const context = listener.context as AudioContext

  const master = context.createGain()
  master.gain.value = 0
  master.connect(listener.getInput())

  // Stream the authored SolarFLEX track instead of decoding the full
  // five-minute file into an AudioBuffer. This keeps the continuous music bed
  // lightweight while footsteps and shelf interaction sounds stay in Web Audio.
  const musicElement = new Audio(LIBRARY_MUSIC_URL)
  musicElement.loop = true
  musicElement.preload = 'metadata'
  musicElement.volume = 0

  let soundRequested = false
  let musicVolume = 0
  let musicPlayPending = false
  let disposed = false

  const ensureMusicPlaying = async () => {
    if (
      disposed ||
      !soundRequested ||
      !musicElement.paused ||
      musicPlayPending
    ) {
      return
    }

    musicPlayPending = true
    try {
      await musicElement.play()
    } catch (error) {
      if (!disposed) {
        console.warn(
          '[DEV Library] Ambient music could not start.',
          error,
        )
      }
    } finally {
      musicPlayPending = false
    }
  }

  let nextFootstepAt = 0
  let roomOscillator: OscillatorNode | null = null
  let roomGain: GainNode | null = null
  let roomFilter: BiquadFilterNode | null = null

  const noiseBuffer = context.createBuffer(
    1,
    Math.max(1, Math.floor(context.sampleRate * .18)),
    context.sampleRate,
  )
  const noiseChannel = noiseBuffer.getChannelData(0)
  for (let index = 0; index < noiseChannel.length; index += 1) {
    const envelope = 1 - index / noiseChannel.length
    noiseChannel[index] =
      (Math.random() * 2 - 1) * envelope
  }

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

  const playFootstep = (strength: number) => {
    createTone(
      82 + strength * 12,
      .008 + strength * .008,
      .095,
      'triangle',
    )
  }

  const ensureRoomTone = () => {
    if (roomOscillator || disposed) return

    roomOscillator = context.createOscillator()
    roomGain = context.createGain()
    roomFilter = context.createBiquadFilter()

    roomOscillator.type = 'sine'
    roomOscillator.frequency.value = 108
    roomFilter.type = 'lowpass'
    roomFilter.frequency.value = 620
    roomFilter.Q.value = .55
    roomGain.gain.value = .0001

    roomOscillator.connect(roomFilter)
    roomFilter.connect(roomGain)
    roomGain.connect(master)
    roomOscillator.start()
  }

  const playNoiseBurst = (
    volume: number,
    duration: number,
    cutoff: number,
  ) => {
    if (disposed || context.state !== 'running') return

    const now = context.currentTime
    const source = context.createBufferSource()
    const filter = context.createBiquadFilter()
    const gain = context.createGain()

    source.buffer = noiseBuffer
    filter.type = 'lowpass'
    filter.frequency.setValueAtTime(cutoff, now)
    filter.Q.setValueAtTime(.45, now)
    gain.gain.setValueAtTime(.0001, now)
    gain.gain.exponentialRampToValueAtTime(
      Math.max(.0002, volume),
      now + .008,
    )
    gain.gain.exponentialRampToValueAtTime(
      .0001,
      now + duration,
    )

    source.connect(filter)
    filter.connect(gain)
    gain.connect(master)
    source.start(now)
    source.stop(now + duration + .02)
  }

  const playCue = (cue: LibraryAudioCue) => {
    if (!soundRequested || context.state !== 'running') return

    switch (cue) {
      case 'book-open':
        createTone(236, .014, .18, 'triangle')
        playNoiseBurst(.009, .13, 1450)
        break
      case 'article-open':
        createTone(420, .008, .2)
        createTone(630, .0045, .27)
        break
      case 'article-close':
        createTone(310, .007, .18)
        playNoiseBurst(.0048, .1, 980)
        break
      case 'locate':
        createTone(620, .006, .14)
        createTone(880, .004, .22)
        break
      case 'room-enter':
        createTone(168, .0048, .3)
        createTone(252, .003, .42)
        break
    }
  }

  const handleCue = (event: Event) => {
    const cue = (
      event as CustomEvent<{cue?: LibraryAudioCue}>
    ).detail?.cue
    if (!cue) return
    playCue(cue)
  }

  const startRequestedAudio = () => {
    if (disposed || !soundRequested) return

    void context.resume()
    void musicElement.play().catch((error) => {
      if (!disposed) {
        console.warn(
          '[DEV Library] Ambient music could not start.',
          error,
        )
      }
    })
  }

  const handleUnlock = () => {
    if (disposed) return
    soundRequested = true
    startRequestedAudio()
  }

  const handleFirstGesture = () => {
    startRequestedAudio()
  }

  window.addEventListener(AUDIO_ENABLE_EVENT, handleUnlock)
  window.addEventListener(AUDIO_CUE_EVENT, handleCue as EventListener)
  window.addEventListener('pointerdown', handleFirstGesture, {
    capture: true,
  })
  window.addEventListener('keydown', handleFirstGesture, {
    capture: true,
  })

  return {
    update({
      enabled,
      movementMode,
      speed,
      elapsed,
      activeAudioProfile = 'ambient',
    }) {
      if (disposed) return

      soundRequested = enabled
      const now = context.currentTime
      const audible = enabled && context.state === 'running'

      if (audible) {
        ensureRoomTone()
      }

      const roomProfile =
        ROOM_TONE_PROFILES[activeAudioProfile]
      if (roomOscillator && roomGain && roomFilter) {
        roomOscillator.frequency.setTargetAtTime(
          roomProfile.frequency,
          now,
          .7,
        )
        roomFilter.frequency.setTargetAtTime(
          roomProfile.cutoff,
          now,
          .85,
        )
        roomGain.gain.setTargetAtTime(
          audible ? roomProfile.gain : .0001,
          now,
          audible ? .9 : .16,
        )
      }

      master.gain.setTargetAtTime(
        audible ? .74 : 0,
        now,
        audible ? .18 : .06,
      )

      const walking = movementMode === 'walk'
      const speedStrength = THREE.MathUtils.clamp(
        speed / 4.25,
        0,
        1,
      )

      const targetMusicVolume = audible
        ? walking
          ? .122 - speedStrength * .018
          : .108
        : 0
      musicVolume = THREE.MathUtils.lerp(
        musicVolume,
        targetMusicVolume,
        audible ? .08 : .18,
      )
      musicElement.volume = THREE.MathUtils.clamp(
        musicVolume,
        0,
        1,
      )

      if (audible) {
        void ensureMusicPlaying()
      } else if (!enabled && !musicElement.paused) {
        musicElement.pause()
      }

      if (!audible) return

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

    updateShelfFocus() {
      // Shelf proximity is intentionally silent. Ambient room tone,
      // footsteps and deliberate book-open cues provide enough feedback
      // without chiming every time the visitor passes a case.
    },

    dispose() {
      if (disposed) return
      disposed = true

      window.removeEventListener(AUDIO_ENABLE_EVENT, handleUnlock)
      window.removeEventListener(
        AUDIO_CUE_EVENT,
        handleCue as EventListener,
      )
      window.removeEventListener(
        'pointerdown',
        handleFirstGesture,
        {capture: true},
      )
      window.removeEventListener(
        'keydown',
        handleFirstGesture,
        {capture: true},
      )

      musicElement.pause()
      musicElement.removeAttribute('src')
      musicElement.load()

      if (roomOscillator) {
        try {
          roomOscillator.stop()
        } catch {
          // Oscillator may already be stopped during hot-reload teardown.
        }
        roomOscillator.disconnect()
      }
      roomFilter?.disconnect()
      roomGain?.disconnect()
      master.disconnect()
    },
  }
}
