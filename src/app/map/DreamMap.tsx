'use client'

import Link from 'next/link'
import {useEffect, useMemo, useState} from 'react'
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

  useEffect(() => {
    if (demoMode) setLocalDreams(readLocalDreams())
  }, [demoMode])

  const dreams = useMemo(() => {
    const combined = demoMode ? [...localDreams, ...initialDreams] : initialDreams
    return combined.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  }, [demoMode, initialDreams, localDreams])

  const {nodes, edges} = useMemo(() => buildGraph(dreams), [dreams])

  const nodeById = useMemo(() => new Map(nodes.map((node) => [node._id, node])), [nodes])
  const activeId = hoveredId ?? selectedId
  const selectedNode = selectedId ? nodeById.get(selectedId) ?? null : null
  const focusedDream = focusedDreamId
    ? dreams.find((dream) => dream._id === focusedDreamId) ?? null
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
    ? dreams.filter((dream) => selectedNode.dreamIds.includes(dream._id))
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

  function focusDream(dreamId: string | null) {
    setFocusedDreamId(dreamId)
    setSelectedId(null)
    setHoveredId(null)

    const nextUrl = dreamId
      ? `/map?dream=${encodeURIComponent(dreamId)}`
      : '/map'

    window.history.replaceState(null, '', nextUrl)
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
            <span>{dreams.length}</span>
          </div>

          <div className={styles.dreamList}>
            {dreams.slice(0, 7).map((dream) => (
              <button
                key={dream._id}
                type="button"
                className={`${styles.dreamRow} ${
                  focusedDreamId === dream._id ? styles.dreamRowActive : ''
                }`}
                onClick={() => focusDream(dream._id)}
                aria-pressed={focusedDreamId === dream._id}
              >
                <div className={styles.dreamThumb} aria-hidden="true">
                  {dream.symbols?.[0]?.icon ?? '✦'}
                </div>
                <div>
                  <strong>{dream.title?.trim() || 'Untitled dream'}</strong>
                  <span>{formatShortDate(dream.date)}</span>
                </div>
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
                <button type="button" onClick={() => focusDream(null)}>
                  Show all
                </button>
              </div>
            )}

            {nodes.length === 0 ? (
              <div className={styles.emptyState}>
                <span>✦</span>
                <h2>No symbols to map yet.</h2>
                <p>Record a dream and tag a few symbols to make the first constellation.</p>
              </div>
            ) : (
              <svg
                className={styles.mapSvg}
                viewBox="0 0 1000 700"
                role="img"
                aria-label="Interactive map of recurring dream symbols"
                onClick={() => setSelectedId(null)}
              >
                <defs>
                  <filter id="edgeGlow" x="-40%" y="-40%" width="180%" height="180%">
                    <feGaussianBlur stdDeviation="3" result="blur" />
                    <feMerge>
                      <feMergeNode in="blur" />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>
                </defs>

                <StarField />

                <g className={styles.edges}>
                  {edges.map((edge) => {
                    const source = nodeById.get(edge.source)
                    const target = nodeById.get(edge.target)
                    if (!source || !target) return null

                    const inFocusedDream =
                      !focusedDream || focusedEdgeIds.has(edge.id)
                    const relatedToActiveSymbol =
                      !activeId || relatedEdgeIds.has(edge.id)
                    const highlighted = inFocusedDream && relatedToActiveSymbol

                    return (
                      <line
                        key={edge.id}
                        x1={source.x * 10}
                        y1={source.y * 7}
                        x2={target.x * 10}
                        y2={target.y * 7}
                        className={highlighted ? styles.edgeActive : styles.edgeMuted}
                        strokeWidth={Math.min(3.4, 0.7 + edge.weight * 0.62)}
                        opacity={
                          highlighted
                            ? Math.min(0.72, 0.2 + edge.weight * 0.13)
                            : 0.06
                        }
                        filter={highlighted && (activeId || focusedDream) ? 'url(#edgeGlow)' : undefined}
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

                    return (
                      <g
                        key={node._id}
                        className={connected ? styles.nodeGroup : styles.nodeGroupMuted}
                        transform={`translate(${node.x * 10} ${node.y * 7})`}
                        tabIndex={0}
                        role="button"
                        aria-label={`${node.name}, ${node.frequency} dream${node.frequency === 1 ? '' : 's'}`}
                        onClick={(event) => {
                          event.stopPropagation()
                          setSelectedId((current) => (current === node._id ? null : node._id))
                        }}
                        onMouseEnter={() => setHoveredId(node._id)}
                        onMouseLeave={() => setHoveredId(null)}
                        onFocus={() => setHoveredId(node._id)}
                        onBlur={() => setHoveredId(null)}
                      >
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
                      </g>
                    )
                  })}
                </g>
              </svg>
            )}

            <div className={styles.mapHint}>
              {focusedDream
                ? 'Focused constellation · select a symbol to inspect it'
                : 'Click a dream or symbol to trace its relationships'}
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
