'use client'

import Link from 'next/link'
import {useCallback, useEffect, useMemo, useRef, useState, type CSSProperties} from 'react'
import type {Dream, DreamSymbol, SymbolCategory} from '@/types/dream'
import styles from './map.module.css'
import DreamWorld3D from './DreamWorld3D'
import type {DreamQuality} from './dreamworld/quality'

const STORAGE_KEY = 'oniria-demo-dreams'

type PositionedSymbol = DreamSymbol & {
  x: number
  y: number
  frequency: number
  dreamIds: string[]
}

type Edge = {
  id: string
  source: string
  target: string
  weight: number
}

type Pan = {
  x: number
  y: number
}

type DragState = {
  pointerId: number
  startX: number
  startY: number
  panX: number
  panY: number
}

type AmbientAudio = {
  gain: GainNode
  oscillators: OscillatorNode[]
  lfo: OscillatorNode
}

type MotionPoint = {
  x: number
  y: number
  vx: number
  vy: number
  anchorX: number
  anchorY: number
}

const CATEGORY_META: Record<SymbolCategory, {label: string; color: string; glow: string}> = {
  person: {label: 'Person', color: '#d9a7ff', glow: 'rgba(217, 167, 255, .42)'},
  place: {label: 'Place', color: '#84dfd7', glow: 'rgba(132, 223, 215, .42)'},
  object: {label: 'Object', color: '#82b8ff', glow: 'rgba(130, 184, 255, .42)'},
  feeling: {label: 'Feeling', color: '#f0a4c7', glow: 'rgba(240, 164, 199, .42)'},
  action: {label: 'Action', color: '#c9a8ff', glow: 'rgba(201, 168, 255, .42)'},
}

const CATEGORY_ANCHORS: Record<SymbolCategory, {x: number; y: number}> = {
  object: {x: 28, y: 37},
  action: {x: 50, y: 29},
  person: {x: 66, y: 42},
  place: {x: 70, y: 68},
  feeling: {x: 42, y: 70},
}

function readLocalDreams(): Dream[] {
  if (typeof window === 'undefined') return []

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as Dream[]) : []
  } catch {
    return []
  }
}

function hashString(value: string) {
  let hash = 2166136261
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function seededUnit(seed: number, salt: number) {
  const x = Math.sin(seed * 12.9898 + salt * 78.233) * 43758.5453
  return x - Math.floor(x)
}

function formatShortDate(date: string) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(date))
}

function formatTimelineDate(date: string) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    year: 'numeric',
  }).format(new Date(date))
}

function formatDreamTime(date: string) {
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(date))
}

function moodName(value: number) {
  return ['Heavy', 'Uneasy', 'Neutral', 'Pleasant', 'Euphoric'][
    Math.max(0, Math.min(4, value - 1))
  ]
}

function buildGraph(dreams: Dream[]) {
  const symbolMap = new Map<string, {symbol: DreamSymbol; dreamIds: Set<string>; frequency: number}>()
  const edgeMap = new Map<string, Edge>()

  for (const dream of dreams) {
    const uniqueSymbols = Array.from(
      new Map<string, DreamSymbol>(
        (dream.symbols ?? []).map((symbol) => [symbol._id, symbol] as const),
      ).values(),
    )

    for (const symbol of uniqueSymbols) {
      const existing = symbolMap.get(symbol._id)
      if (existing) {
        existing.frequency += 1
        existing.dreamIds.add(dream._id)
      } else {
        symbolMap.set(symbol._id, {
          symbol,
          frequency: 1,
          dreamIds: new Set([dream._id]),
        })
      }
    }

    for (let i = 0; i < uniqueSymbols.length; i += 1) {
      for (let j = i + 1; j < uniqueSymbols.length; j += 1) {
        const pair = [uniqueSymbols[i]._id, uniqueSymbols[j]._id].sort()
        const id = `${pair[0]}::${pair[1]}`
        const current = edgeMap.get(id)

        if (current) {
          current.weight += 1
        } else {
          edgeMap.set(id, {
            id,
            source: pair[0],
            target: pair[1],
            weight: 1,
          })
        }
      }
    }
  }

  const categoryIndexes = new Map<SymbolCategory, number>()

  const nodes: PositionedSymbol[] = Array.from(symbolMap.values()).map(({symbol, dreamIds, frequency}) => {
    const category = symbol.category
    const anchor = CATEGORY_ANCHORS[category]
    const index = categoryIndexes.get(category) ?? 0
    categoryIndexes.set(category, index + 1)

    const seed = hashString(symbol._id)
    const angle = seededUnit(seed, 1) * Math.PI * 2 + index * 1.7
    const radius = 5 + seededUnit(seed, 2) * 10 + Math.min(index, 3) * 1.4
    const jitterX = Math.cos(angle) * radius
    const jitterY = Math.sin(angle) * radius * 0.78

    return {
      ...symbol,
      x: Math.max(9, Math.min(91, anchor.x + jitterX)),
      y: Math.max(11, Math.min(89, anchor.y + jitterY)),
      frequency,
      dreamIds: Array.from(dreamIds),
    }
  })

  return {nodes, edges: Array.from(edgeMap.values())}
}

function StarField() {
  const stars = useMemo(
    () =>
      Array.from({length: 78}, (_, index) => {
        const seed = index + 13
        return {
          x: 2 + seededUnit(seed, 4) * 96,
          y: 2 + seededUnit(seed, 7) * 96,
          r: 0.08 + seededUnit(seed, 9) * 0.18,
          opacity: 0.18 + seededUnit(seed, 11) * 0.58,
        }
      }),
    [],
  )

  return (
    <g aria-hidden="true">
      {stars.map((star, index) => (
        <circle
          key={index}
          cx={`${star.x}%`}
          cy={`${star.y}%`}
          r={`${star.r}%`}
          fill="white"
          opacity={star.opacity}
          className={styles.star}
          style={{animationDelay: `-${index * 0.31}s`}}
        />
      ))}
    </g>
  )
}

export default function DreamMap({
  initialDreams,
  demoMode,
  initialDreamId,
}: {
  initialDreams: Dream[]
  demoMode: boolean
  initialDreamId: string | null
}) {
  const [localDreams, setLocalDreams] = useState<Dream[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [focusedDreamId, setFocusedDreamId] = useState<string | null>(initialDreamId)
  const [timelineIndex, setTimelineIndex] = useState(-1)
  const [isPlaying, setIsPlaying] = useState(false)
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState<Pan>({x: 0, y: 0})
  const [isDragging, setIsDragging] = useState(false)
  const [soundEnabled, setSoundEnabled] = useState(false)
  const [quality, setQuality] = useState<DreamQuality>('high')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [introStage, setIntroStage] = useState(0)
  const [diveActive, setDiveActive] = useState(false)
  const [diveTitle, setDiveTitle] = useState<string | null>(null)
  const [diveDepth, setDiveDepth] = useState(0)
  const [diveTimelineProgress, setDiveTimelineProgress] = useState(1)
  const [diveExitRequest, setDiveExitRequest] = useState(0)
  const [diveBackRequest, setDiveBackRequest] = useState(0)
  const [observatoryMode, setObservatoryMode] = useState(false)
  const [flightMode, setFlightMode] = useState(false)
  const [closingJournal, setClosingJournal] = useState(false)
  const [motionPositions, setMotionPositions] = useState<Record<string, {x: number; y: number}>>({})
  const [enteringNodeId, setEnteringNodeId] = useState<string | null>(null)
  const [enteringDreamTitle, setEnteringDreamTitle] = useState<string | null>(null)
  const [openDreamId, setOpenDreamId] = useState<string | null>(null)
  const [selectedProjection, setSelectedProjection] = useState<{
    x: number
    y: number
    visible: boolean
  } | null>(null)

  const dragRef = useRef<DragState | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const audioMasterRef = useRef<GainNode | null>(null)
  const ambientRef = useRef<AmbientAudio | null>(null)
  const lastHoverToneRef = useRef<{id: string; time: number} | null>(null)
  const physicsRef = useRef<Map<string, MotionPoint>>(new Map())
  const cameraFrameRef = useRef<number | null>(null)
  const enterTimerRef = useRef<number | null>(null)
  const closeTimerRef = useRef<number | null>(null)

  const stopAmbient = useCallback(() => {
    const ambient = ambientRef.current
    if (!ambient) return

    const context = audioContextRef.current
    const now = context?.currentTime ?? 0

    try {
      ambient.gain.gain.cancelScheduledValues(now)
      ambient.gain.gain.setValueAtTime(
        Math.max(ambient.gain.gain.value, 0.0001),
        now,
      )
      ambient.gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.8)
    } catch {
      // Audio may already be shutting down.
    }

    window.setTimeout(() => {
      for (const oscillator of ambient.oscillators) {
        try {
          oscillator.stop()
          oscillator.disconnect()
        } catch {
          // Already stopped.
        }
      }

      try {
        ambient.lfo.stop()
        ambient.lfo.disconnect()
        ambient.gain.disconnect()
      } catch {
        // Already disconnected.
      }
    }, 850)

    ambientRef.current = null
  }, [])

  const ensureAudio = useCallback(async () => {
    let context = audioContextRef.current
    let master = audioMasterRef.current

    if (!context || context.state === 'closed') {
      context = new AudioContext()
      master = context.createGain()
      master.gain.value = 0.52
      master.connect(context.destination)
      audioContextRef.current = context
      audioMasterRef.current = master
    }

    if (context.state === 'suspended') {
      await context.resume()
    }

    return {context, master: master!}
  }, [])

  const startAmbient = useCallback(async () => {
    if (ambientRef.current) return

    const {context, master} = await ensureAudio()
    const now = context.currentTime

    const ambientGain = context.createGain()
    ambientGain.gain.setValueAtTime(0.0001, now)
    ambientGain.gain.exponentialRampToValueAtTime(0.032, now + 2.4)

    const filter = context.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = 420
    filter.Q.value = 0.45

    const lfo = context.createOscillator()
    const lfoGain = context.createGain()
    lfo.frequency.value = 0.045
    lfoGain.gain.value = 0.012
    lfo.connect(lfoGain)
    lfoGain.connect(ambientGain.gain)

    const frequencies = [55, 82.5, 110]
    const oscillators = frequencies.map((frequency, index) => {
      const oscillator = context.createOscillator()
      const voiceGain = context.createGain()
      oscillator.type = index === 1 ? 'triangle' : 'sine'
      oscillator.frequency.value = frequency
      oscillator.detune.value = index === 2 ? 7 : index === 1 ? -5 : 0
      voiceGain.gain.value = index === 0 ? 0.48 : index === 1 ? 0.24 : 0.12
      oscillator.connect(voiceGain)
      voiceGain.connect(filter)
      oscillator.start(now + index * 0.08)
      return oscillator
    })

    filter.connect(ambientGain)
    ambientGain.connect(master)
    lfo.start(now)

    ambientRef.current = {
      gain: ambientGain,
      oscillators,
      lfo,
    }
  }, [ensureAudio])

  const toggleSound = useCallback(async () => {
    if (soundEnabled) {
      setSoundEnabled(false)
      stopAmbient()
      return
    }

    try {
      await startAmbient()
      setSoundEnabled(true)
    } catch {
      setSoundEnabled(false)
    }
  }, [soundEnabled, startAmbient, stopAmbient])

  const playNodeTone = useCallback(
    async (node: PositionedSymbol) => {
      if (!soundEnabled) return

      const nowMs = performance.now()
      const last = lastHoverToneRef.current
      if (last?.id === node._id && nowMs - last.time < 500) return
      lastHoverToneRef.current = {id: node._id, time: nowMs}

      const {context, master} = await ensureAudio()
      const now = context.currentTime
      const scale = [0, 2, 4, 7, 9]
      const degree = scale[hashString(node._id) % scale.length]
      const octave = node.frequency > 2 ? 5 : 4
      const midi = 12 * (octave + 1) + degree
      const frequency = 440 * Math.pow(2, (midi - 69) / 12)

      const oscillator = context.createOscillator()
      const shimmer = context.createOscillator()
      const gain = context.createGain()
      const filter = context.createBiquadFilter()
      const delay = context.createDelay(1)
      const feedback = context.createGain()
      const wet = context.createGain()

      oscillator.type = 'sine'
      shimmer.type = 'triangle'
      oscillator.frequency.setValueAtTime(frequency, now)
      shimmer.frequency.setValueAtTime(frequency * 2.01, now)
      filter.type = 'bandpass'
      filter.frequency.value = Math.min(4200, frequency * 3.2)
      filter.Q.value = 1.1
      delay.delayTime.value = 0.23
      feedback.gain.value = 0.22
      wet.gain.value = 0.28

      gain.gain.setValueAtTime(0.0001, now)
      gain.gain.exponentialRampToValueAtTime(0.045, now + 0.025)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.72)

      oscillator.connect(filter)
      shimmer.connect(filter)
      filter.connect(gain)
      gain.connect(master)
      gain.connect(delay)
      delay.connect(feedback)
      feedback.connect(delay)
      delay.connect(wet)
      wet.connect(master)

      oscillator.start(now)
      shimmer.start(now)
      oscillator.stop(now + 0.76)
      shimmer.stop(now + 0.76)

      window.setTimeout(() => {
        try {
          oscillator.disconnect()
          shimmer.disconnect()
          filter.disconnect()
          gain.disconnect()
          delay.disconnect()
          feedback.disconnect()
          wet.disconnect()
        } catch {
          // The short-lived voice has already been released.
        }
      }, 1500)
    },
    [ensureAudio, soundEnabled],
  )

  const playTimelineBloom = useCallback(
    async (dream: Dream) => {
      if (!soundEnabled) return

      const {context, master} = await ensureAudio()
      const now = context.currentTime
      const oscillator = context.createOscillator()
      const overtone = context.createOscillator()
      const gain = context.createGain()
      const filter = context.createBiquadFilter()
      const baseFrequency = 96 + dream.mood * 12

      oscillator.type = 'sine'
      overtone.type = 'sine'
      oscillator.frequency.setValueAtTime(baseFrequency, now)
      oscillator.frequency.exponentialRampToValueAtTime(baseFrequency * 1.5, now + 1.3)
      overtone.frequency.setValueAtTime(baseFrequency * 2.01, now)

      filter.type = 'lowpass'
      filter.frequency.setValueAtTime(620, now)
      filter.frequency.exponentialRampToValueAtTime(1800, now + 1.1)
      filter.Q.value = 0.7

      gain.gain.setValueAtTime(0.0001, now)
      gain.gain.exponentialRampToValueAtTime(0.018, now + 0.16)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.55)

      oscillator.connect(filter)
      overtone.connect(filter)
      filter.connect(gain)
      gain.connect(master)

      oscillator.start(now)
      overtone.start(now)
      oscillator.stop(now + 1.6)
      overtone.stop(now + 1.6)
    },
    [ensureAudio, soundEnabled],
  )

  const playEnterSound = useCallback(async () => {
    if (!soundEnabled) return

    const {context, master} = await ensureAudio()
    const now = context.currentTime
    const gain = context.createGain()
    const low = context.createOscillator()
    const high = context.createOscillator()
    const filter = context.createBiquadFilter()

    low.type = 'sine'
    high.type = 'triangle'
    low.frequency.setValueAtTime(92, now)
    low.frequency.exponentialRampToValueAtTime(210, now + 0.9)
    high.frequency.setValueAtTime(360, now)
    high.frequency.exponentialRampToValueAtTime(920, now + 0.82)

    filter.type = 'lowpass'
    filter.frequency.setValueAtTime(900, now)
    filter.frequency.exponentialRampToValueAtTime(3600, now + 0.72)

    gain.gain.setValueAtTime(0.0001, now)
    gain.gain.exponentialRampToValueAtTime(0.075, now + 0.08)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.02)

    low.connect(filter)
    high.connect(filter)
    filter.connect(gain)
    gain.connect(master)

    low.start(now)
    high.start(now)
    low.stop(now + 1.05)
    high.stop(now + 1.05)
  }, [ensureAudio, soundEnabled])

  const resetCamera = useCallback(() => {
    setZoom(1)
    setPan({x: 0, y: 0})
  }, [])

  const changeZoom = useCallback((nextZoom: number) => {
    setZoom(Math.min(2.6, Math.max(0.72, nextZoom)))
  }, [])

  const animateCameraTo = useCallback(
    (targetZoom: number, targetPan: Pan, duration = 820) => {
      if (cameraFrameRef.current !== null) {
        cancelAnimationFrame(cameraFrameRef.current)
      }

      const startZoom = zoom
      const startPan = pan
      const start = performance.now()

      const tick = (now: number) => {
        const raw = Math.min(1, (now - start) / duration)
        const eased = 1 - Math.pow(1 - raw, 3)

        setZoom(startZoom + (targetZoom - startZoom) * eased)
        setPan({
          x: startPan.x + (targetPan.x - startPan.x) * eased,
          y: startPan.y + (targetPan.y - startPan.y) * eased,
        })

        if (raw < 1) {
          cameraFrameRef.current = requestAnimationFrame(tick)
        } else {
          cameraFrameRef.current = null
        }
      }

      cameraFrameRef.current = requestAnimationFrame(tick)
    },
    [pan, zoom],
  )

  function beginPan(event: React.PointerEvent<SVGSVGElement>) {
    const target = event.target as SVGElement
    if (target.closest('[data-node="true"]')) return

    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      panX: pan.x,
      panY: pan.y,
    }
    setIsDragging(true)
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function movePan(event: React.PointerEvent<SVGSVGElement>) {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return

    const rect = event.currentTarget.getBoundingClientRect()
    const dx = ((event.clientX - drag.startX) / rect.width) * 1000
    const dy = ((event.clientY - drag.startY) / rect.height) * 700

    setPan({
      x: drag.panX + dx / zoom,
      y: drag.panY + dy / zoom,
    })
  }

  function endPan(event: React.PointerEvent<SVGSVGElement>) {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return

    dragRef.current = null
    setIsDragging(false)

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  useEffect(() => {
    if (demoMode) setLocalDreams(readLocalDreams())

    try {
      const introSeen = window.sessionStorage.getItem('oniria-map-intro-seen')
      if (introSeen === 'yes') setIntroStage(4)

      const stored = window.localStorage.getItem('oniria-dream-quality')
      const storedSidebar = window.localStorage.getItem('oniria-map-sidebar')
      if (storedSidebar === 'collapsed') setSidebarCollapsed(true)

      if (
        stored === 'low' ||
        stored === 'medium' ||
        stored === 'high' ||
        stored === 'cinematic'
      ) {
        setQuality(stored)
      }
    } catch {
      // Ignore storage failures.
    }
  }, [demoMode])

  useEffect(() => {
    try {
      window.localStorage.setItem('oniria-dream-quality', quality)
    } catch {
      // Ignore storage failures.
    }
  }, [quality])

  useEffect(() => {
    const context = audioContextRef.current
    const ambient = ambientRef.current
    if (!context || !ambient || context.state === 'closed') return

    const now = context.currentTime
    const target = diveActive ? 0.009 : 0.032

    try {
      ambient.gain.gain.cancelScheduledValues(now)
      ambient.gain.gain.setValueAtTime(
        Math.max(0.0001, ambient.gain.gain.value),
        now,
      )
      ambient.gain.gain.exponentialRampToValueAtTime(target, now + 0.8)
    } catch {
      // Audio may be transitioning between contexts.
    }
  }, [diveActive])

  useEffect(() => {
    try {
      window.localStorage.setItem(
        'oniria-map-sidebar',
        sidebarCollapsed ? 'collapsed' : 'expanded',
      )
    } catch {
      // Ignore storage failures.
    }
  }, [sidebarCollapsed])

  useEffect(() => {
    try {
      if (window.sessionStorage.getItem('oniria-map-intro-seen') === 'yes') {
        setIntroStage(4)
        return
      }
    } catch {
      // Continue with the intro when session storage is unavailable.
    }

    const schedule = [
      window.setTimeout(() => setIntroStage(1), 450),
      window.setTimeout(() => setIntroStage(2), 1650),
      window.setTimeout(() => setIntroStage(3), 3100),
      window.setTimeout(() => {
        setIntroStage(4)
        try {
          window.sessionStorage.setItem('oniria-map-intro-seen', 'yes')
        } catch {
          // Ignore storage failures.
        }
      }, 5200),
    ]

    return () => schedule.forEach((timer) => window.clearTimeout(timer))
  }, [])

  function skipIntro() {
    setIntroStage(4)
    try {
      window.sessionStorage.setItem('oniria-map-intro-seen', 'yes')
    } catch {
      // Ignore storage failures.
    }
  }

  useEffect(() => {
    return () => {
      stopAmbient()
      const context = audioContextRef.current
      if (context && context.state !== 'closed') {
        void context.close()
      }
      if (cameraFrameRef.current !== null) {
        cancelAnimationFrame(cameraFrameRef.current)
      }
      if (enterTimerRef.current !== null) {
        window.clearTimeout(enterTimerRef.current)
      }
      if (closeTimerRef.current !== null) {
        window.clearTimeout(closeTimerRef.current)
      }
    }
  }, [stopAmbient])

  const dreams = useMemo(() => {
    const combined = demoMode ? [...localDreams, ...initialDreams] : initialDreams
    return combined.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  }, [demoMode, initialDreams, localDreams])

  const timelineDreams = useMemo(
    () =>
      [...dreams].sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
      ),
    [dreams],
  )

  const maxTimelineIndex = Math.max(0, timelineDreams.length - 1)
  const currentTimelineIndex =
    timelineIndex < 0
      ? maxTimelineIndex
      : Math.min(timelineIndex, maxTimelineIndex)

  const visibleDreams = useMemo(
    () => timelineDreams.slice(0, currentTimelineIndex + 1),
    [currentTimelineIndex, timelineDreams],
  )

  const visibleDreamsRecent = useMemo(
    () =>
      [...visibleDreams].sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
      ),
    [visibleDreams],
  )

  const currentTimelineDream = timelineDreams[currentTimelineIndex] ?? null
  const atLatestPoint =
    timelineDreams.length === 0 ||
    currentTimelineIndex === maxTimelineIndex

  useEffect(() => {
    if (!soundEnabled || !currentTimelineDream) return

    const timeout = window.setTimeout(() => {
      void playTimelineBloom(currentTimelineDream)
    }, 100)

    return () => window.clearTimeout(timeout)
  }, [currentTimelineDream, currentTimelineIndex, playTimelineBloom, soundEnabled])

  useEffect(() => {
    if (!isPlaying || timelineDreams.length <= 1) return

    const timer = window.setInterval(() => {
      setTimelineIndex((current) => {
        const resolved = current < 0 ? maxTimelineIndex : current

        if (resolved >= maxTimelineIndex) {
          setIsPlaying(false)
          return maxTimelineIndex
        }

        return resolved + 1
      })
    }, 1800)

    return () => window.clearInterval(timer)
  }, [isPlaying, maxTimelineIndex, timelineDreams.length])

  useEffect(() => {
    if (!focusedDreamId) return

    const stillVisible = visibleDreams.some(
      (dream) => dream._id === focusedDreamId,
    )

    if (!stillVisible) {
      setFocusedDreamId(null)
      setSelectedId(null)
      setOpenDreamId(null)
      window.history.replaceState(null, '', '/map')
    }
  }, [focusedDreamId, visibleDreams])

  const {nodes, edges} = useMemo(
    () => buildGraph(visibleDreams),
    [visibleDreams],
  )

  useEffect(() => {
    const liveIds = new Set(nodes.map((node) => node._id))

    for (const node of nodes) {
      const anchorX = node.x * 10
      const anchorY = node.y * 7
      const existing = physicsRef.current.get(node._id)

      if (existing) {
        existing.anchorX = anchorX
        existing.anchorY = anchorY
      } else {
        physicsRef.current.set(node._id, {
          x: anchorX,
          y: anchorY,
          vx: 0,
          vy: 0,
          anchorX,
          anchorY,
        })
      }
    }

    for (const id of Array.from(physicsRef.current.keys())) {
      if (!liveIds.has(id)) physicsRef.current.delete(id)
    }

    setMotionPositions(
      Object.fromEntries(
        Array.from(physicsRef.current.entries()).map(([id, point]) => [
          id,
          {x: point.x, y: point.y},
        ]),
      ),
    )
  }, [nodes])

  useEffect(() => {
    if (nodes.length === 0) return
    if (enteringNodeId) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    let frame = 0
    let last = performance.now()

    const step = (now: number) => {
      frame = requestAnimationFrame(step)
      if (now - last < 34) return
      last = now

      const points = physicsRef.current
      const activeNodes = nodes.slice(0, 70)

      for (let i = 0; i < activeNodes.length; i += 1) {
        const a = points.get(activeNodes[i]._id)
        if (!a) continue

        for (let j = i + 1; j < activeNodes.length; j += 1) {
          const b = points.get(activeNodes[j]._id)
          if (!b) continue

          const dx = b.x - a.x
          const dy = b.y - a.y
          const distanceSq = Math.max(900, dx * dx + dy * dy)
          const distance = Math.sqrt(distanceSq)
          const force = Math.min(0.055, 48 / distanceSq)
          const fx = (dx / distance) * force
          const fy = (dy / distance) * force

          a.vx -= fx
          a.vy -= fy
          b.vx += fx
          b.vy += fy
        }
      }

      for (const edge of edges) {
        const a = points.get(edge.source)
        const b = points.get(edge.target)
        if (!a || !b) continue

        const dx = b.x - a.x
        const dy = b.y - a.y
        const distance = Math.max(1, Math.sqrt(dx * dx + dy * dy))
        const target = Math.max(112, 178 - edge.weight * 14)
        const stretch = (distance - target) * 0.0005
        const fx = (dx / distance) * stretch
        const fy = (dy / distance) * stretch

        a.vx += fx
        a.vy += fy
        b.vx -= fx
        b.vy -= fy
      }

      for (const node of activeNodes) {
        const point = points.get(node._id)
        if (!point) continue

        const seed = hashString(node._id)
        const driftX = Math.sin(now / 7200 + seed * 0.00011) * 0.006
        const driftY = Math.cos(now / 8600 + seed * 0.00017) * 0.006

        point.vx += (point.anchorX - point.x) * 0.00016 + driftX
        point.vy += (point.anchorY - point.y) * 0.00016 + driftY

        point.vx *= 0.945
        point.vy *= 0.945

        const speed = Math.sqrt(point.vx * point.vx + point.vy * point.vy)
        if (speed > 0.36) {
          point.vx = (point.vx / speed) * 0.36
          point.vy = (point.vy / speed) * 0.36
        }

        point.x = Math.max(72, Math.min(928, point.x + point.vx))
        point.y = Math.max(72, Math.min(612, point.y + point.vy))
      }

      setMotionPositions(
        Object.fromEntries(
          activeNodes.map((node) => {
            const point = points.get(node._id)
            return [
              node._id,
              point
                ? {x: point.x, y: point.y}
                : {x: node.x * 10, y: node.y * 7},
            ]
          }),
        ),
      )
    }

    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
  }, [edges, enteringNodeId, nodes])

  const nodePosition = useCallback(
    (node: PositionedSymbol) =>
      motionPositions[node._id] ?? {x: node.x * 10, y: node.y * 7},
    [motionPositions],
  )

  const nodeById = useMemo(() => new Map(nodes.map((node) => [node._id, node])), [nodes])
  const activeId = hoveredId ?? selectedId
  const selectedNode = selectedId ? nodeById.get(selectedId) ?? null : null
  const focusedDream = focusedDreamId
    ? visibleDreams.find((dream) => dream._id === focusedDreamId) ?? null
    : null

  const focusedSymbolIds = useMemo(
    () => new Set((focusedDream?.symbols ?? []).map((symbol) => symbol._id)),
    [focusedDream],
  )

  const focusedEdgeIds = useMemo(() => {
    if (!focusedDream) return new Set<string>()
    return new Set(
      edges
        .filter(
          (edge) =>
            focusedSymbolIds.has(edge.source) &&
            focusedSymbolIds.has(edge.target),
        )
        .map((edge) => edge.id),
    )
  }, [edges, focusedDream, focusedSymbolIds])

  const relatedEdgeIds = useMemo(() => {
    if (!activeId) return new Set<string>()
    return new Set(
      edges
        .filter((edge) => edge.source === activeId || edge.target === activeId)
        .map((edge) => edge.id),
    )
  }, [activeId, edges])

  const selectedDreams = selectedNode
    ? visibleDreams.filter((dream) => selectedNode.dreamIds.includes(dream._id))
    : []

  const openDream =
    (openDreamId
      ? visibleDreams.find((dream) => dream._id === openDreamId)
      : null) ??
    selectedDreams.at(-1) ??
    null

  const selectedConnections = useMemo(() => {
    if (!selectedNode) return []

    return edges
      .filter(
        (edge) =>
          edge.source === selectedNode._id ||
          edge.target === selectedNode._id,
      )
      .map((edge) => {
        const otherId =
          edge.source === selectedNode._id ? edge.target : edge.source
        const node = nodeById.get(otherId)
        return node ? {node, weight: edge.weight} : null
      })
      .filter(
        (connection): connection is {node: PositionedSymbol; weight: number} =>
          connection !== null,
      )
      .sort((a, b) => b.weight - a.weight || b.node.frequency - a.node.frequency)
      .slice(0, 4)
  }, [edges, nodeById, selectedNode])

  function enterNode(node: PositionedSymbol) {
    const matchingDreams = visibleDreams.filter((dream) =>
      node.dreamIds.includes(dream._id),
    )
    const targetDream = matchingDreams.at(-1)

    if (!targetDream) {
      setSelectedId(node._id)
      return
    }

    const position = nodePosition(node)
    const targetZoom = 1.82
    const desiredX = position.x > 590 ? 660 : 340
    const targetPan = {
      x: (desiredX - position.x) * targetZoom,
      y: (330 - position.y) * targetZoom,
    }

    setClosingJournal(false)
    setSelectedId(node._id)
    setOpenDreamId(targetDream._id)
    setFocusedDreamId(targetDream._id)
    setHoveredId(null)
    setEnteringNodeId(node._id)
    setEnteringDreamTitle(targetDream.title?.trim() || 'Untitled dream')
    setIsPlaying(false)
    void playEnterSound()
    animateCameraTo(targetZoom, targetPan, 760)

    window.history.replaceState(
      null,
      '',
      `/map?dream=${encodeURIComponent(targetDream._id)}`,
    )

    if (enterTimerRef.current !== null) {
      window.clearTimeout(enterTimerRef.current)
    }

    enterTimerRef.current = window.setTimeout(() => {
      setEnteringNodeId(null)
    }, 760)
  }

  function closeDreamNote() {
    if (closingJournal) return

    setClosingJournal(true)

    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current)
    }

    closeTimerRef.current = window.setTimeout(() => {
      setEnteringNodeId(null)
      setEnteringDreamTitle(null)
      setOpenDreamId(null)
      setSelectedProjection(null)
      setSelectedId(null)
      setHoveredId(null)
      setFocusedDreamId(null)
      setClosingJournal(false)
      animateCameraTo(1, {x: 0, y: 0}, 680)
      window.history.replaceState(null, '', '/map')
    }, 520)
  }

  function focusDream(dreamId: string | null) {
    setFocusedDreamId(dreamId)
    setSelectedId(null)
    setHoveredId(null)

    const nextUrl = dreamId
      ? `/map?dream=${encodeURIComponent(dreamId)}`
      : '/map'

    window.history.replaceState(null, '', nextUrl)
  }

  function changeTimeline(nextIndex: number) {
    setIsPlaying(false)
    setTimelineIndex(nextIndex)
  }

  const selectedMeta = selectedNode
    ? CATEGORY_META[selectedNode.category]
    : null
  const noteAnchor =
    selectedProjection?.visible
      ? {
          x: Math.max(10, Math.min(90, selectedProjection.x)),
          y: Math.max(15, Math.min(78, selectedProjection.y)),
        }
      : null
  const noteSide = noteAnchor && noteAnchor.x > 58 ? 'left' : 'right'
  const noteStyle =
    noteAnchor && selectedMeta
      ? ({
          left: `${noteAnchor.x}%`,
          top: `${noteAnchor.y}%`,
          '--node-accent': selectedMeta.color,
          '--node-glow': selectedMeta.glow,
        } as CSSProperties)
      : undefined

  function toggleTimelinePlayback() {
    if (timelineDreams.length <= 1) return

    if (isPlaying) {
      setIsPlaying(false)
      return
    }

    if (atLatestPoint) {
      setTimelineIndex(0)
    }

    setFocusedDreamId(null)
    setSelectedId(null)
    setOpenDreamId(null)
    setHoveredId(null)
    window.history.replaceState(null, '', '/map')
    setIsPlaying(true)
  }

  return (
    <main
      className={`${styles.page} ${
        sidebarCollapsed ? styles.pageSidebarCollapsed : ''
      } ${selectedNode ? styles.pageFocusMode : ''} ${
        diveActive ? styles.pageDiveMode : ''
      } ${introStage < 4 ? styles.pageIntroMode : ''} ${
        flightMode ? styles.pageFlightMode : ''
      }`}
    >
      <header className={styles.topbar}>
        <Link href="/" className={styles.brand} aria-label="Oniria journal">
          <span className={styles.brandMark}>◌</span>
          <span>Oniria</span>
        </Link>

        <nav className={styles.nav} aria-label="Primary navigation">
          <Link href="/">Journal</Link>
          <Link href="/map" className={styles.navActive}>Map</Link>
        </nav>

        <Link href="/studio" className={styles.recordButton}>+ Record dream</Link>
      </header>

      <div className={styles.workspace}>
        <aside
          className={`${styles.sidebar} ${
            sidebarCollapsed ? styles.sidebarCollapsed : ''
          }`}
        >
          <div className={styles.sidebarHeader}>
            <div className={styles.sidebarHeading}>
              <p>Recent fragments</p>
              <span>{visibleDreams.length}</span>
            </div>
            <button
              type="button"
              className={styles.sidebarToggle}
              onClick={() => setSidebarCollapsed((current) => !current)}
              aria-label={sidebarCollapsed ? 'Expand dream panel' : 'Collapse dream panel'}
              title={sidebarCollapsed ? 'Expand dream panel' : 'Collapse dream panel'}
            >
              {sidebarCollapsed ? '›' : '‹'}
            </button>
          </div>

          <div className={styles.dreamList}>
            {visibleDreamsRecent.slice(0, 7).map((dream) => (
              <button
                key={dream._id}
                type="button"
                className={`${styles.dreamRow} ${
                  focusedDreamId === dream._id ? styles.dreamRowActive : ''
                }`}
                onClick={() => focusDream(dream._id)}
                aria-pressed={focusedDreamId === dream._id}
              >
                <span className={styles.dreamThumb} aria-hidden="true">
                  {dream.symbols?.[0]?.icon ?? '✦'}
                </span>
                <span className={styles.dreamMeta}>
                  <strong>{dream.title?.trim() || 'Untitled dream'}</strong>
                  <span>{formatShortDate(dream.date)}</span>
                </span>
              </button>
            ))}
          </div>

          <div className={styles.legend}>
            <p>Symbol types</p>
            {(Object.keys(CATEGORY_META) as SymbolCategory[]).map((category) => (
              <div key={category}>
                <i style={{background: CATEGORY_META[category].color}} />
                <span>{CATEGORY_META[category].label}</span>
              </div>
            ))}
          </div>
        </aside>

        <section className={styles.mapSection}>
          <div className={styles.mapHeader}>
            <div>
              <p className={styles.eyebrow}>Dream map</p>
              <h1>Your dream universe.</h1>
            </div>
            {demoMode && <span className={styles.demoPill}>Local demo data</span>}
          </div>

          <div className={styles.mapFrame}>
            <div className={styles.voidDepth} aria-hidden="true" />
            <div className={styles.nebula} aria-hidden="true" />
            <div className={styles.aurora} aria-hidden="true" />
            <div className={styles.particleField} aria-hidden="true" />
            <div className={styles.dreamFog} aria-hidden="true" />

            {introStage < 4 && (
              <div
                className={`${styles.introSequence} ${
                  introStage === 0
                    ? styles.introStage0
                    : introStage === 1
                      ? styles.introStage1
                      : introStage === 2
                        ? styles.introStage2
                        : styles.introStage3
                }`}
                aria-live="polite"
              >
                <div className={styles.introStars} aria-hidden="true">
                  <i />
                  <i />
                  <i />
                  <i />
                  <i />
                </div>
                <div className={styles.introCopy}>
                  <span>{introStage < 2 ? 'between waking and memory' : 'dream field online'}</span>
                  <strong>{introStage < 3 ? 'Oniria' : 'Your memories are connected.'}</strong>
                  <small>
                    {introStage < 2
                      ? 'A memory is waking.'
                      : introStage < 3
                        ? 'Connections are surfacing.'
                        : 'Enter whenever you are ready.'}
                  </small>
                </div>
                <button type="button" onClick={skipIntro} className={styles.introSkip}>
                  Skip
                </button>
              </div>
            )}

            {diveActive && (
              <div className={styles.diveHud} aria-live="polite">
                <div className={styles.diveIdentity}>
                  <span>
                    Dream Dive · layer {diveDepth + 1}/3
                  </span>
                  <strong>{diveTitle || openDream?.title || 'Dream'}</strong>
                  <small>
                    Look with the pointer · click a live doorway or memory orb to travel deeper
                  </small>
                </div>

                <div className={styles.diveTime}>
                  <span>Memory time</span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={Math.round(diveTimelineProgress * 100)}
                    onChange={(event) =>
                      setDiveTimelineProgress(
                        Number(event.target.value) / 100,
                      )
                    }
                    aria-label="Reconstruct or age this dream"
                  />
                  <small>
                    {diveTimelineProgress < .34
                      ? 'reconstructing'
                      : diveTimelineProgress < .7
                        ? 'remembering'
                        : 'present memory'}
                  </small>
                </div>

                <div className={styles.diveActions}>
                  {diveDepth > 0 && (
                    <button
                      type="button"
                      onClick={() => setDiveBackRequest((value) => value + 1)}
                      className={styles.diveBack}
                    >
                      ← Previous dream
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setDiveExitRequest((value) => value + 1)}
                    className={styles.diveReturn}
                  >
                    Return to Dream Map
                  </button>
                </div>
              </div>
            )}

            <div className={styles.mapControls}>
              <button
                type="button"
                className={soundEnabled ? styles.soundButtonActive : styles.soundButton}
                onClick={() => void toggleSound()}
                aria-pressed={soundEnabled}
                title={soundEnabled ? 'Mute dream soundscape' : 'Enable dream soundscape'}
              >
                <span aria-hidden="true">{soundEnabled ? '◉' : '○'}</span>
                {soundEnabled ? 'Soundscape' : 'Sound off'}
              </button>

              <button
                type="button"
                className={
                  observatoryMode
                    ? styles.observatoryButtonActive
                    : styles.observatoryButton
                }
                onClick={() => {
                  setObservatoryMode((current) => !current)
                  setSelectedId(null)
                  setHoveredId(null)
                  setOpenDreamId(null)
                  setFocusedDreamId(null)
                  window.history.replaceState(null, '', '/map')
                }}
                aria-pressed={observatoryMode}
                title="Pull back to the Observatory"
              >
                <span aria-hidden="true">◎</span>
                {observatoryMode ? 'Observatory' : 'Observe'}
              </button>

              <button
                type="button"
                className={
                  flightMode
                    ? styles.flightButtonActive
                    : styles.flightButton
                }
                onClick={() => {
                  const next = !flightMode
                  setFlightMode(next)
                  if (next) {
                    setObservatoryMode(false)
                    setSelectedId(null)
                    setHoveredId(null)
                    setOpenDreamId(null)
                    setFocusedDreamId(null)
                    setPan({x: 0, y: 0})
                    window.history.replaceState(null, '', '/map')
                  }
                }}
                aria-pressed={flightMode}
                title="Travel through the constellation in first person"
              >
                <span aria-hidden="true">⌁</span>
                {flightMode ? 'Flying' : 'First person'}
              </button>

              <label className={styles.qualityControl}>
                <span>Dream quality</span>
                <select
                  value={quality}
                  onChange={(event) =>
                    setQuality(event.target.value as DreamQuality)
                  }
                  aria-label="Dream graphics quality"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="cinematic">Cinematic</option>
                </select>
              </label>

              <div className={styles.zoomControls} aria-label="Map zoom controls">
                <button
                  type="button"
                  onClick={() => changeZoom(zoom - 0.18)}
                  aria-label="Zoom out"
                >
                  −
                </button>
                <span>{Math.round(zoom * 100)}%</span>
                <button
                  type="button"
                  onClick={() => changeZoom(zoom + 0.18)}
                  aria-label="Zoom in"
                >
                  +
                </button>
                <button
                  type="button"
                  onClick={resetCamera}
                  className={styles.resetZoom}
                  disabled={zoom === 1 && pan.x === 0 && pan.y === 0}
                >
                  Reset
                </button>
              </div>
            </div>

            {flightMode && !diveActive && (
              <div className={styles.flightHud} aria-live="polite">
                <div className={styles.flightReticle} aria-hidden="true">
                  <i />
                  <i />
                </div>
                <div className={styles.flightInstructions}>
                  <span>First-person travel</span>
                  <strong>WASD · mouse · Shift to boost</strong>
                  <small>
                    Click to capture pointer · E or center-click to inspect a memory · Esc to leave
                  </small>
                </div>
              </div>
            )}

            {enteringNodeId && (
              <div className={styles.enterDreamOverlay} aria-live="polite">
                <div className={styles.enterDreamPulse} />
                <span>Entering dream</span>
                <strong>{enteringDreamTitle}</strong>
              </div>
            )}

            {focusedDream && !selectedNode && (
              <div className={styles.focusBanner}>
                <div>
                  <span>Focused dream</span>
                  <strong>{focusedDream.title?.trim() || 'Untitled dream'}</strong>
                  <small>
                    {formatShortDate(focusedDream.date)} · {focusedDream.symbols?.length ?? 0}{' '}
                    symbol{(focusedDream.symbols?.length ?? 0) === 1 ? '' : 's'}
                  </small>
                </div>
                <div className={styles.focusActions}>
                  <Link href={`/dream/${encodeURIComponent(focusedDream._id)}`}>
                    Read dream
                  </Link>
                  <button type="button" onClick={() => focusDream(null)}>
                    Show all
                  </button>
                </div>
              </div>
            )}

            {nodes.length === 0 ? (
              <div className={styles.emptyState}>
                <span>✦</span>
                <h2>No symbols to map yet.</h2>
                <p>
                  {visibleDreams.length === 0
                    ? 'Move the timeline forward to reveal your first constellation.'
                    : 'Record a dream and tag a few symbols to make the first constellation.'}
                </p>
              </div>
            ) : (
              <DreamWorld3D
                nodes={nodes}
                edges={edges}
                positions={motionPositions}
                dreams={visibleDreams}
                selectedDreamId={openDream?._id ?? focusedDreamId}
                selectedId={selectedId}
                activeId={activeId}
                focusedIds={focusedSymbolIds}
                relatedEdgeIds={relatedEdgeIds}
                zoom={zoom}
                pan={pan}
                quality={quality}
                soundEnabled={soundEnabled}
                introStage={introStage}
                diveExitRequest={diveExitRequest}
                diveBackRequest={diveBackRequest}
                diveTimelineProgress={diveTimelineProgress}
                observatoryMode={observatoryMode}
                flightMode={flightMode}
                onZoomChange={changeZoom}
                onPanChange={setPan}
                onNodeHover={(node) => {
                  setHoveredId(node?._id ?? null)
                  if (node) void playNodeTone(node)
                }}
                onNodeSelect={(node) => {
                  setObservatoryMode(false)
                  if (flightMode) setFlightMode(false)
                  enterNode(node)
                }}
                onBackgroundClick={() => {
                  if (selectedNode) closeDreamNote()
                }}
                onProjectionChange={setSelectedProjection}
                onDiveStateChange={(active, title) => {
                  setDiveActive(active)
                  setDiveTitle(
                    active
                      ? title ?? openDream?.title ?? 'Dream'
                      : null,
                  )
                  if (active) {
                    setObservatoryMode(false)
                    setFlightMode(false)
                    setEnteringNodeId(null)
                    setClosingJournal(false)
                    setDiveTimelineProgress(1)
                  } else {
                    setDiveDepth(0)
                    setDiveTimelineProgress(1)
                    window.history.replaceState(
                      null,
                      '',
                      openDream
                        ? `/map?dream=${encodeURIComponent(openDream._id)}`
                        : '/map',
                    )
                  }
                }}
                onFlightModeChange={setFlightMode}
                onDiveDreamChange={(dreamId, title, depth) => {
                  setDiveTitle(title)
                  setDiveDepth(depth)
                  window.history.replaceState(
                    null,
                    '',
                    `/map?dream=${encodeURIComponent(dreamId)}&dive=${depth}`,
                  )
                }}
              />
            )}

            {timelineDreams.length > 0 && (
              <section className={styles.timeline} aria-label="Dream history timeline">
                <button
                  type="button"
                  className={styles.timelinePlay}
                  onClick={toggleTimelinePlayback}
                  disabled={timelineDreams.length <= 1}
                  aria-label={isPlaying ? 'Pause timeline' : 'Play timeline'}
                >
                  {isPlaying ? 'Ⅱ' : '▶'}
                </button>

                <div className={styles.timelineBody}>
                  <div className={styles.timelineMeta}>
                    <div>
                      <span>Dream history</span>
                      <strong>
                        {currentTimelineDream
                          ? formatTimelineDate(currentTimelineDream.date)
                          : 'No dreams yet'}
                      </strong>
                    </div>
                    <small>
                      {visibleDreams.length} / {timelineDreams.length} dreams ·{' '}
                      {nodes.length} symbols · {edges.length} connections
                    </small>
                  </div>

                  <div className={styles.timelineTrack}>
                    <input
                      type="range"
                      min={0}
                      max={maxTimelineIndex}
                      step={1}
                      value={currentTimelineIndex}
                      onChange={(event) => changeTimeline(Number(event.target.value))}
                      aria-label="Dream history cutoff"
                    />
                    <div className={styles.timelineTicks} aria-hidden="true">
                      {timelineDreams.map((dream, index) => (
                        <i
                          key={dream._id}
                          className={
                            index <= currentTimelineIndex
                              ? styles.timelineTickActive
                              : styles.timelineTick
                          }
                          style={{
                            left:
                              timelineDreams.length <= 1
                                ? '0%'
                                : `${(index / maxTimelineIndex) * 100}%`,
                          }}
                        />
                      ))}
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  className={styles.timelineLatest}
                  onClick={() => {
                    setIsPlaying(false)
                    setTimelineIndex(-1)
                  }}
                  disabled={atLatestPoint}
                >
                  Latest
                </button>
              </section>
            )}

            <div className={styles.mapHint}>
              {focusedDream
                ? 'Focused constellation · select a symbol to inspect it'
                : flightMode
                  ? 'First-person travel · WASD to move · mouse to look · Shift to boost · E to inspect'
                  : observatoryMode
                    ? 'Observatory · recurring concepts become stellar bodies · click any memory to descend'
                    : 'Hover to hear · click to inspect · double-click or hold a selected orb to enter the dream'}
            </div>

            {selectedNode &&
              openDream &&
              selectedMeta &&
              noteStyle &&
              !enteringNodeId &&
              !diveActive && (
                <div
                  key={`${selectedNode._id}:${openDream._id}`}
                  className={`${styles.noteCluster} ${
                    noteSide === 'left'
                      ? styles.noteClusterLeft
                      : styles.noteClusterRight
                  } ${closingJournal ? styles.noteClusterClosing : ''}`}
                  style={noteStyle}
                  aria-live="polite"
                >
                  <span className={styles.noteAnchorPulse} aria-hidden="true" />
                  <span className={styles.noteAnchorBeam} aria-hidden="true" />
                  <span className={styles.journalParticles} aria-hidden="true">
                    {Array.from({length: 12}).map((_, index) => (
                      <i key={index} />
                    ))}
                  </span>

                  <div className={styles.noteStage}>
                    <button
                      type="button"
                      className={styles.noteClose}
                      onClick={closeDreamNote}
                      aria-label="Close dream journal"
                    >
                      ×
                    </button>

                    <article className={`${styles.noteBlob} ${styles.noteBlobPrimary}`}>
                      <div className={styles.blobSheen} aria-hidden="true" />
                      <header className={styles.noteHeader}>
                        <div>
                          <p>{selectedMeta.label} memory</p>
                          <h2>{openDream.title?.trim() || 'Untitled dream'}</h2>
                          <span>
                            {formatShortDate(openDream.date)} · {formatDreamTime(openDream.date)}
                          </span>
                        </div>
                        <div className={styles.noteOrb} aria-hidden="true">
                          {selectedNode.icon || '✦'}
                        </div>
                      </header>

                      <p className={styles.noteBody}>{openDream.body}</p>

                      <div className={styles.noteTags}>
                        {(openDream.symbols ?? []).slice(0, 6).map((symbol) => (
                          <span key={symbol._id}>
                            <b aria-hidden="true">{symbol.icon || '✦'}</b>
                            {symbol.name}
                          </span>
                        ))}
                      </div>
                    </article>

                    <aside className={`${styles.noteBlob} ${styles.noteBlobStats}`}>
                      <div className={styles.blobSheen} aria-hidden="true" />
                      <p className={styles.blobLabel}>Dream details</p>

                      <div className={styles.statRows}>
                        <div>
                          <span>Mood</span>
                          <strong>{moodName(openDream.mood)}</strong>
                        </div>
                        <div>
                          <span>Lucid</span>
                          <strong>{openDream.lucid ? 'Yes' : 'No'}</strong>
                        </div>
                        <div>
                          <span>Recurrence</span>
                          <strong>{selectedNode.frequency}×</strong>
                        </div>
                        <div>
                          <span>Vividness</span>
                          <span className={styles.vividDots} aria-label={`${openDream.mood} of 5`}>
                            {Array.from({length: 5}).map((_, index) => (
                              <i
                                key={index}
                                className={
                                  index < openDream.mood
                                    ? styles.vividDotActive
                                    : styles.vividDot
                                }
                              />
                            ))}
                          </span>
                        </div>
                      </div>
                    </aside>

                    <aside className={`${styles.noteBlob} ${styles.noteBlobLinks}`}>
                      <div className={styles.blobSheen} aria-hidden="true" />
                      <p className={styles.blobLabel}>Related symbols</p>

                      <div className={styles.relatedMini}>
                        {selectedConnections.slice(0, 4).map(({node, weight}) => (
                          <button
                            type="button"
                            key={node._id}
                            onClick={() => enterNode(node)}
                          >
                            <span aria-hidden="true">{node.icon || '✦'}</span>
                            <strong>{node.name}</strong>
                            <em>×{weight}</em>
                          </button>
                        ))}
                      </div>

                      <p className={styles.blobLabel}>Dream trail</p>
                      <div className={styles.dreamTrailMini}>
                        {[...selectedDreams]
                          .slice(-3)
                          .reverse()
                          .map((dream) => (
                            <button
                              type="button"
                              key={dream._id}
                              onClick={() => {
                                setOpenDreamId(dream._id)
                                setFocusedDreamId(dream._id)
                                window.history.replaceState(
                                  null,
                                  '',
                                  `/map?dream=${encodeURIComponent(dream._id)}`,
                                )
                              }}
                            >
                              <span>{formatShortDate(dream.date)}</span>
                              <strong>{dream.title?.trim() || 'Untitled dream'}</strong>
                            </button>
                          ))}
                      </div>
                    </aside>
                  </div>
                </div>
              )}
          </div>
        </section>
      </div>
    </main>
  )
}
