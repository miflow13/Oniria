'use client'

import Link from 'next/link'
import {useEffect, useMemo, useState} from 'react'
import styles from './page.module.css'
import type {Dream} from '@/types/dream'

const STORAGE_KEY = 'oniria-demo-dreams'

function formatDate(date: string) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(date))
}

function excerpt(text: string) {
  if (text.length <= 220) return text
  return `${text.slice(0, 220).trim()}…`
}

function Mood({value}: {value: number}) {
  const safeValue = Math.min(5, Math.max(1, value || 1))

  return (
    <div className={styles.mood} aria-label={`Mood ${safeValue} out of 5`}>
      <span>Mood</span>
      <div className={styles.moodDots} aria-hidden="true">
        {Array.from({length: 5}).map((_, index) => (
          <span
            key={index}
            className={index < safeValue ? styles.moodDotActive : styles.moodDot}
          />
        ))}
      </div>
    </div>
  )
}

function readLocalDreams(): Dream[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as Dream[]) : []
  } catch {
    return []
  }
}

export default function DreamList({initialDreams, demoMode}: {initialDreams: Dream[]; demoMode: boolean}) {
  const [localDreams, setLocalDreams] = useState<Dream[]>([])

  useEffect(() => {
    if (demoMode) setLocalDreams(readLocalDreams())
  }, [demoMode])

  const dreams = useMemo(() => {
    const combined = demoMode ? [...localDreams, ...initialDreams] : initialDreams
    return combined.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  }, [demoMode, initialDreams, localDreams])

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.header}>
          <div>
            <p className={styles.eyebrow}>Dream journal</p>
            <h1>Oniria</h1>
            <p className={styles.subtitle}>Fragments from somewhere else.</p>
            {demoMode && (
              <p className={styles.demoNote}>Demo mode · entries are saved only in this browser.</p>
            )}
          </div>

          <div className={styles.headerActions}>
            <Link href="/map" className={styles.mapButton}>
              Dream map
            </Link>
            <Link href="/studio" className={styles.newDreamButton}>
              + New dream
            </Link>
          </div>
        </header>

        {dreams.length === 0 ? (
          <section className={styles.empty}>
            <span className={styles.emptyStar}>✦</span>
            <h2>No dreams recorded yet.</h2>
            <p>Your first fragment is waiting.</p>
            <Link href="/studio">Record a dream</Link>
          </section>
        ) : (
          <section className={styles.dreamList} aria-label="Dream entries">
            {dreams.map((dream) => (
              <article id={`dream-${dream._id}`} key={dream._id} className={styles.dreamCard}>
                <div className={styles.cardHeader}>
                  <time dateTime={dream.date}>{formatDate(dream.date)}</time>
                  {dream.lucid && <span className={styles.lucid}>◉ Lucid</span>}
                </div>

                <h2>{dream.title?.trim() || 'Untitled dream'}</h2>
                <p className={styles.body}>{excerpt(dream.body)}</p>

                {!!dream.symbols?.length && (
                  <div className={styles.symbols} aria-label="Dream symbols">
                    {dream.symbols.map((symbol) => (
                      <span key={symbol._id} className={styles.symbol}>
                        {symbol.icon && <span aria-hidden="true">{symbol.icon}</span>}
                        {symbol.name}
                      </span>
                    ))}
                  </div>
                )}

                <div className={styles.cardFooter}>
                  <Mood value={dream.mood} />
                  <Link
                    href={`/map?dream=${encodeURIComponent(dream._id)}`}
                    className={styles.viewInMap}
                  >
                    View in Dream Map <span aria-hidden="true">→</span>
                  </Link>
                </div>
              </article>
            ))}
          </section>
        )}
      </div>
    </main>
  )
}
