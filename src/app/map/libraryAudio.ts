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

const LIBRARY_MUSIC_URL = '/api/library-music'

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
  let lastShelfId: string | null = null

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
    soundRequested = true
    void musicElement.play().catch((error) => {
      if (!disposed) {
        console.warn(
          '[DEV Library] Ambient music could not start.',
          error,
        )
      }
    })
    void context.resume()
  }

  window.addEventListener(AUDIO_ENABLE_EVENT, handleUnlock)

  return {
    update({
      enabled,
      movementMode,
      speed,
      elapsed,
    }) {
      if (disposed) return

      soundRequested = enabled
      const now = context.currentTime
      const audible = enabled && context.state === 'running'

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

      musicElement.pause()
      musicElement.removeAttribute('src')
      musicElement.load()
      master.disconnect()
    },
  }
}
