'use client'

import Link from 'next/link'
import {useEffect, useMemo, useState} from 'react'
import type {Dream} from '@/types/dream'
import styles from './dream.module.css'

const STORAGE_KEY = 'oniria-demo-dreams'

function formatDate(date: string) {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(date))
}

function formatTime(date: string) {
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(date))
}

function readLocalDream(dreamId: string): Dream | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null

    const dreams = JSON.parse(raw) as Dream[]
    return dreams.find((dream) => dream._id === dreamId) ?? null
  } catch {
    return null
  }
}

function Mood({value}: {value: number}) {
  const safeValue = Math.min(5, Math.max(1, value || 1))

  return (
    <div className={styles.mood} aria-label={`Mood ${safeValue} out of 5`}>
      <span>Mood</span>
      <div className={styles.moodDots} aria-hidden="true">
        {Array.from({length: 5}).map((_, index) => (
          <i
            key={index}
            className={index < safeValue ? styles.moodDotActive : styles.moodDot}
          />
        ))}
      </div>
    </div>
  )
}

export default function DreamDetail({
  dreamId,
  initialDream,
  demoMode,
}: {
  dreamId: string
  initialDream: Dream | null
  demoMode: boolean
}) {
  const [dream, setDream] = useState<Dream | null>(initialDream)
  const [hydrated, setHydrated] = useState(!demoMode || Boolean(initialDream))

  useEffect(() => {
    if (!demoMode) return

    const localDream = readLocalDream(dreamId)
    if (localDream) setDream(localDream)
    setHydrated(true)
  }, [demoMode, dreamId])

  const symbolCount = useMemo(() => dream?.symbols?.length ?? 0, [dream])

  if (!hydrated) {
    return (
      <main className={styles.page}>
        <div className={styles.loading}>Finding that fragment…</div>
      </main>
    )
  }

  if (!dream) {
    return (
      <main className={styles.page}>
        <section className={styles.missing}>
          <span>✦</span>
          <h1>This dream drifted out of reach.</h1>
          <p>The entry may have been removed, or it only existed in another browser.</p>
          <Link href="/">Return to journal</Link>
        </section>
      </main>
    )
  }

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.topbar}>
          <Link href="/" className={styles.brand}>
            <span className={styles.brandMark}>◌</span>
            <span>Oniria</span>
          </Link>

          <nav className={styles.nav}>
            <Link href="/">Journal</Link>
            <Link href="/map">Map</Link>
          </nav>

          <Link href="/studio" className={styles.recordButton}>
            + Record dream
          </Link>
        </header>

        <div className={styles.backRow}>
          <Link href="/">← Back to journal</Link>
          {demoMode && <span>Local demo data</span>}
        </div>

        <article className={styles.dream}>
          <div className={styles.atmosphere} aria-hidden="true" />

          <header className={styles.dreamHeader}>
            <div>
              <p className={styles.date}>{formatDate(dream.date)}</p>
              <h1>{dream.title?.trim() || 'Untitled dream'}</h1>
              <p className={styles.time}>Recorded around {formatTime(dream.date)}</p>
            </div>

            <div className={styles.status}>
              {dream.lucid && <span className={styles.lucid}>◉ Lucid</span>}
              <Mood value={dream.mood} />
            </div>
          </header>

          <div className={styles.divider} />

          <div className={styles.body}>
            {dream.body
              .split(/\n{2,}/)
              .filter(Boolean)
              .map((paragraph, index) => (
                <p key={index}>{paragraph}</p>
              ))}
          </div>

          {symbolCount > 0 && (
            <section className={styles.symbolSection}>
              <div className={styles.sectionHeading}>
                <span>Symbols</span>
                <small>{symbolCount}</small>
              </div>

              <div className={styles.symbols}>
                {dream.symbols?.map((symbol) => (
                  <span key={symbol._id} className={styles.symbol}>
                    <b aria-hidden="true">{symbol.icon || '✦'}</b>
                    <span>{symbol.name}</span>
                    <small>{symbol.category}</small>
                  </span>
                ))}
              </div>
            </section>
          )}

          <footer className={styles.footer}>
            <div>
              <span>Dream fragment</span>
              <small>
                {dream.lucid ? 'Lucid' : 'Non-lucid'} · Mood {dream.mood}/5
              </small>
            </div>

            <Link
              href={`/map?dream=${encodeURIComponent(dream._id)}`}
              className={styles.mapButton}
            >
              View this dream in the map <span aria-hidden="true">→</span>
            </Link>
          </footer>
        </article>
      </div>
    </main>
  )
}
