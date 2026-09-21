'use client'

import Link from 'next/link'
import {useRouter} from 'next/navigation'
import {useCallback, useEffect, useMemo, useRef, useState} from 'react'
import type {Dream, DreamSymbol, SymbolCategory} from '@/types/dream'
import styles from './map.module.css'

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
  const router = useRouter()
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
  const [motionPositions, setMotionPositions] = useState<Record<string, {x: number; y: number}>>({})
  const [enteringNodeId, setEnteringNodeId] = useState<string | null>(null)
  const [enteringDreamTitle, setEnteringDreamTitle] = useState<string | null>(null)

  const dragRef = useRef<DragState | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const audioMasterRef = useRef<GainNode | null>(null)
  const ambientRef = useRef<AmbientAudio | null>(null)
  const lastHoverToneRef = useRef<{id: string; time: number} | null>(null)
  const physicsRef = useRef<Map<string, MotionPoint>>(new Map())
  const cameraFrameRef = useRef<number | null>(null)
  const enterTimerRef = useRef<number | null>(null)

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
  }, [demoMode])

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
    const targetZoom = 2.18
    const targetPan = {
      x: (500 - position.x) * targetZoom,
      y: (350 - position.y) * targetZoom,
    }

    setSelectedId(node._id)
    setHoveredId(null)
    setEnteringNodeId(node._id)
    setEnteringDreamTitle(targetDream.title?.trim() || 'Untitled dream')
    setIsPlaying(false)
    void playEnterSound()
    animateCameraTo(targetZoom, targetPan)

    if (enterTimerRef.current !== null) {
      window.clearTimeout(enterTimerRef.current)
    }

    enterTimerRef.current = window.setTimeout(() => {
      router.push(`/dream/${encodeURIComponent(targetDream._id)}`)
    }, 980)
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
    setHoveredId(null)
    window.history.replaceState(null, '', '/map')
    setIsPlaying(true)
  }

  return (
    <main className={styles.page}>
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
        <aside className={styles.sidebar}>
          <div className={styles.sidebarHeader}>
            <p>Recent fragments</p>
            <span>{visibleDreams.length}</span>
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
              <h1>Your recurring symbols, connected.</h1>
            </div>
            {demoMode && <span className={styles.demoPill}>Local demo data</span>}
          </div>

          <div className={styles.mapFrame}>
            <div className={styles.nebula} aria-hidden="true" />
            <div className={styles.dreamFog} aria-hidden="true" />

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

            {enteringNodeId && (
              <div className={styles.enterDreamOverlay} aria-live="polite">
                <div className={styles.enterDreamPulse} />
                <span>Entering dream</span>
                <strong>{enteringDreamTitle}</strong>
              </div>
            )}

            {focusedDream && (
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
              <svg
                className={`${styles.mapSvg} ${isDragging ? styles.mapDragging : ''}`}
                viewBox="0 0 1000 700"
                role="img"
                aria-label="Interactive map of recurring dream symbols"
                onClick={() => setSelectedId(null)}
                onDoubleClick={resetCamera}
                onWheel={(event) => {
                  event.preventDefault()
                  changeZoom(zoom + (event.deltaY < 0 ? 0.12 : -0.12))
                }}
                onPointerDown={beginPan}
                onPointerMove={movePan}
                onPointerUp={endPan}
                onPointerCancel={endPan}
              >
                <defs>
                  <filter id="edgeGlow" x="-40%" y="-40%" width="180%" height="180%">
                    <feGaussianBlur stdDeviation="3" result="blur" />
                    <feMerge>
                      <feMergeNode in="blur" />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>

                  <filter id="organicBlob" x="-60%" y="-60%" width="220%" height="220%">
                    <feTurbulence
                      type="fractalNoise"
                      baseFrequency="0.012 0.018"
                      numOctaves="2"
                      seed="7"
                      result="noise"
                    >
                      <animate
                        attributeName="baseFrequency"
                        dur="10s"
                        values="0.012 0.018;0.018 0.012;0.014 0.02;0.012 0.018"
                        repeatCount="indefinite"
                      />
                    </feTurbulence>
                    <feDisplacementMap
                      in="SourceGraphic"
                      in2="noise"
                      scale="8"
                      xChannelSelector="R"
                      yChannelSelector="B"
                    />
                  </filter>
                </defs>

                <StarField />

                <g
                  className={styles.world}
                  style={{
                    transform: `translate(${pan.x}px, ${pan.y}px) translate(500px, 350px) scale(${zoom}) translate(-500px, -350px)`,
                  }}
                >
                <g className={styles.edges}>
                  {edges.map((edge) => {
                    const source = nodeById.get(edge.source)
                    const target = nodeById.get(edge.target)
                    if (!source || !target) return null
                    const sourcePosition = nodePosition(source)
                    const targetPosition = nodePosition(target)

                    const inFocusedDream =
                      !focusedDream || focusedEdgeIds.has(edge.id)
                    const relatedToActiveSymbol =
                      !activeId || relatedEdgeIds.has(edge.id)
                    const highlighted = inFocusedDream && relatedToActiveSymbol

                    return (
                      <line
                        key={edge.id}
                        x1={sourcePosition.x}
                        y1={sourcePosition.y}
                        x2={targetPosition.x}
                        y2={targetPosition.y}
                        className={highlighted ? styles.edgeActive : styles.edgeMuted}
                        strokeWidth={Math.min(3.4, 0.7 + edge.weight * 0.62)}
                        opacity={
                          highlighted
                            ? Math.min(0.72, 0.2 + edge.weight * 0.13)
                            : 0.06
                        }
                        filter={highlighted && (activeId || focusedDream) ? 'url(#edgeGlow)' : undefined}
                        pathLength={1}
                      />
                    )
                  })}
                </g>

                <g>
                  {nodes.map((node) => {
                    const meta = CATEGORY_META[node.category]
                    const selected = selectedId === node._id
                    const hovered = hoveredId === node._id
                    const connectedToActiveSymbol =
                      !activeId ||
                      activeId === node._id ||
                      edges.some(
                        (edge) =>
                          relatedEdgeIds.has(edge.id) &&
                          (edge.source === node._id || edge.target === node._id),
                      )
                    const inFocusedDream =
                      !focusedDream || focusedSymbolIds.has(node._id)
                    const connected = connectedToActiveSymbol && inFocusedDream
                    const radius = 29 + Math.min(node.frequency - 1, 4) * 5
                    const position = nodePosition(node)
                    const entering = enteringNodeId === node._id

                    return (
                      <g
                        key={node._id}
                        data-node="true"
                        className={`${connected ? styles.nodeGroup : styles.nodeGroupMuted} ${
                          entering ? styles.nodeEntering : ''
                        }`}
                        transform={`translate(${position.x} ${position.y})`}
                        tabIndex={0}
                        role="button"
                        aria-label={`${node.name}, ${node.frequency} dream${node.frequency === 1 ? '' : 's'}`}
                        onClick={(event) => {
                          event.stopPropagation()
                          enterNode(node)
                        }}
                        onMouseEnter={() => {
                          setHoveredId(node._id)
                          void playNodeTone(node)
                        }}
                        onMouseLeave={() => setHoveredId(null)}
                        onFocus={() => {
                          setHoveredId(node._id)
                          void playNodeTone(node)
                        }}
                        onBlur={() => setHoveredId(null)}
                        onPointerDown={(event) => event.stopPropagation()}
                        onDoubleClick={(event) => event.stopPropagation()}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault()
                            enterNode(node)
                          }
                        }}
                      >
                        <circle
                          r={radius + 8}
                          fill={meta.color}
                          opacity={selected || hovered ? 0.11 : 0.045}
                          className={styles.blobSkin}
                          filter="url(#organicBlob)"
                        />
                        <circle
                          r={radius + 19}
                          fill="none"
                          stroke={meta.color}
                          strokeWidth="0.8"
                          opacity={selected || hovered ? 0.34 : 0}
                          className={styles.orbitRing}
                        />
                        <circle
                          r={radius + 13}
                          fill={meta.glow}
                          opacity={selected || hovered ? 0.24 : 0.1}
                          className={styles.nodeHalo}
                        />
                        <circle
                          r={radius}
                          fill="rgba(18, 26, 49, .94)"
                          stroke={meta.color}
                          strokeWidth={selected || hovered ? 2.4 : 1.35}
                          className={styles.nodeCircle}
                          style={{filter: `drop-shadow(0 0 ${selected || hovered ? 14 : 8}px ${meta.glow})`}}
                        />
                        <text
                          className={styles.nodeIcon}
                          textAnchor="middle"
                          dominantBaseline="central"
                          y="-1"
                        >
                          {node.icon || '✦'}
                        </text>
                        <text
                          className={styles.nodeLabel}
                          textAnchor="middle"
                          y={radius + 24}
                        >
                          {node.name}
                        </text>
                        {node.frequency > 1 && (
                          <g transform={`translate(${radius - 2} ${-radius + 3})`}>
                            <circle r="11" fill={meta.color} />
                            <text className={styles.frequencyText} textAnchor="middle" dominantBaseline="central">
                              {node.frequency}
                            </text>
                          </g>
                        )}

                        {(hovered || selected) && !entering && (
                          <g className={styles.nodePrompt} transform={`translate(0 ${radius + 43})`}>
                            <rect x="-45" y="-11" width="90" height="22" rx="11" />
                            <text textAnchor="middle" dominantBaseline="central">
                              enter dream
                            </text>
                          </g>
                        )}
                      </g>
                    )
                  })}
                </g>
                </g>
              </svg>
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
                : 'Hover symbols to hear them · drag to drift · scroll to zoom'}
            </div>

            {selectedNode && (
              <aside className={styles.detailCard} aria-live="polite">
                <button
                  className={styles.closeDetail}
                  onClick={() => setSelectedId(null)}
                  aria-label="Close symbol details"
                >
                  ×
                </button>

                <div
                  className={styles.detailIcon}
                  style={{
                    borderColor: CATEGORY_META[selectedNode.category].color,
                    boxShadow: `0 0 28px ${CATEGORY_META[selectedNode.category].glow}`,
                  }}
                >
                  {selectedNode.icon || '✦'}
                </div>

                <p className={styles.detailCategory}>{CATEGORY_META[selectedNode.category].label}</p>
                <h2>{selectedNode.name}</h2>
                <p className={styles.frequencyLabel}>
                  Appears in {selectedNode.frequency} dream{selectedNode.frequency === 1 ? '' : 's'}
                </p>

                {selectedConnections.length > 0 && (
                  <section className={styles.connectionSection}>
                    <p>Strongest connections</p>
                    <div className={styles.connectionList}>
                      {selectedConnections.map(({node, weight}) => (
                        <button
                          key={node._id}
                          type="button"
                          onClick={() => setSelectedId(node._id)}
                        >
                          <span aria-hidden="true">{node.icon || '✦'}</span>
                          <strong>{node.name}</strong>
                          <em>×{weight}</em>
                        </button>
                      ))}
                    </div>
                  </section>
                )}

                <section className={styles.trailSection}>
                  <p>Dream trail</p>
                  <div className={styles.trail}>
                    {selectedDreams.slice(0, 4).map((dream) => (
                      <button
                        key={dream._id}
                        type="button"
                        onClick={() => focusDream(dream._id)}
                      >
                        <span>{formatShortDate(dream.date)}</span>
                        <strong>{dream.title?.trim() || 'Untitled dream'}</strong>
                      </button>
                    ))}
                  </div>
                </section>
              </aside>
            )}
          </div>
        </section>
      </div>
    </main>
  )
}
