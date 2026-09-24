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

const LIBRARY_MUSIC_URL =
  '/audio/oniria-library-ambient-loop.ogg'

export function createLibraryAudio(
  listener: THREE.AudioListener,
): LibraryAudioController {
  const context = listener.context as AudioContext

  const master = context.createGain()
  master.gain.value = 0
  master.connect(listener.getInput())

  // The library now uses one authored ambient song as its continuous
  // music bed. The previous generated lofi composition and noise/drone layer
  // are intentionally gone; interaction sounds remain separate.
  const musicGain = context.createGain()
  musicGain.gain.value = .17
  musicGain.connect(master)

  const musicSources = new Set<AudioBufferSourceNode>()
  const musicLoadController = new AbortController()
  let musicBuffer: AudioBuffer | null = null
  let musicStarted = false

  const startMusic = () => {
    if (
      disposed ||
      musicStarted ||
      !musicBuffer
    ) {
      return
    }

    const source = context.createBufferSource()
    source.buffer = musicBuffer
    source.loop = true
    source.loopStart = 0
    source.loopEnd = musicBuffer.duration
    source.connect(musicGain)
    musicSources.add(source)
    musicStarted = true

    source.addEventListener('ended', () => {
      musicSources.delete(source)
    })
    source.start()
  }

  void fetch(LIBRARY_MUSIC_URL, {
    signal: musicLoadController.signal,
    cache: 'force-cache',
  })
    .then((response) => {
      if (!response.ok) {
        throw new Error(
          `Library music request failed: ${response.status}`,
        )
      }
      return response.arrayBuffer()
    })
    .then((encoded) => context.decodeAudioData(encoded))
    .then((decoded) => {
      if (disposed) return
      musicBuffer = decoded
      startMusic()
    })
    .catch((error) => {
      if (
        disposed ||
        musicLoadController.signal.aborted
      ) {
        return
      }
      console.warn(
        '[DEV Library] Ambient music failed to load.',
        error,
      )
    })

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
      currentBay: _currentBay,
      activeAudioProfile: _activeAudioProfile,
      districts: _districts,
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

      musicGain.gain.setTargetAtTime(
        walking
          ? .165 - speedStrength * .025
          : .145,
        now,
        .65,
      )

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

      musicLoadController.abort()
      musicSources.forEach((source) => {
        try {
          source.stop()
        } catch {
          // Source may already have naturally ended during teardown.
        }
        source.disconnect()
      })
      musicSources.clear()
      musicGain.disconnect()
      master.disconnect()
    },
  }
}
