'use client'

import Link from 'next/link'
import {FormEvent, useEffect, useMemo, useState} from 'react'
import {useRouter} from 'next/navigation'
import {DEMO_SYMBOLS} from '@/lib/demoData'
import type {Dream, DreamSymbol, SymbolCategory} from '@/types/dream'
import styles from './studio.module.css'

const DREAMS_KEY = 'oniria-demo-dreams'
const SYMBOLS_KEY = 'oniria-demo-symbols'

function loadSymbols(): DreamSymbol[] {
  if (typeof window === 'undefined') return DEMO_SYMBOLS

  try {
    const raw = window.localStorage.getItem(SYMBOLS_KEY)
    const saved = raw ? (JSON.parse(raw) as DreamSymbol[]) : []
    const byId = new Map([...DEMO_SYMBOLS, ...saved].map((symbol) => [symbol._id, symbol]))
    return Array.from(byId.values())
  } catch {
    return DEMO_SYMBOLS
  }
}

export default function DemoEntryForm() {
  const router = useRouter()
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 16))
  const [mood, setMood] = useState(3)
  const [lucid, setLucid] = useState(false)
  const [symbols, setSymbols] = useState<DreamSymbol[]>(DEMO_SYMBOLS)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [showNewSymbol, setShowNewSymbol] = useState(false)
  const [symbolName, setSymbolName] = useState('')
  const [symbolIcon, setSymbolIcon] = useState('✦')
  const [symbolCategory, setSymbolCategory] = useState<SymbolCategory>('object')

  useEffect(() => {
    setSymbols(loadSymbols())
  }, [])

  const selectedSymbols = useMemo(
    () => symbols.filter((symbol) => selectedIds.includes(symbol._id)),
    [selectedIds, symbols],
  )

  function toggleSymbol(id: string) {
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    )
  }

  function createSymbol() {
    const cleanName = symbolName.trim()
    if (!cleanName) return

    const newSymbol: DreamSymbol = {
      _id: `local-symbol-${Date.now()}`,
      name: cleanName,
      category: symbolCategory,
      icon: symbolIcon.trim() || undefined,
    }

    const nextSymbols = [...symbols, newSymbol]
    setSymbols(nextSymbols)
    setSelectedIds((current) => [...current, newSymbol._id])
    window.localStorage.setItem(
      SYMBOLS_KEY,
      JSON.stringify(nextSymbols.filter((symbol) => symbol._id.startsWith('local-symbol-'))),
    )
    setSymbolName('')
    setSymbolIcon('✦')
    setShowNewSymbol(false)
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!body.trim()) return

    const dream: Dream = {
      _id: `local-dream-${Date.now()}`,
      date: new Date(date).toISOString(),
      title: title.trim() || undefined,
      body: body.trim(),
      mood,
      lucid,
      symbols: selectedSymbols,
    }

    let saved: Dream[] = []
    try {
      const raw = window.localStorage.getItem(DREAMS_KEY)
      saved = raw ? (JSON.parse(raw) as Dream[]) : []
    } catch {
      saved = []
    }

    window.localStorage.setItem(DREAMS_KEY, JSON.stringify([dream, ...saved]))
    router.push('/')
    router.refresh()
  }

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.header}>
          <div>
            <p className={styles.eyebrow}>Local test mode</p>
            <h1>Record a dream</h1>
            <p>No Sanity project needed yet. This entry stays in your browser.</p>
          </div>
          <div className={styles.headerLinks}>
            <Link href="/" className={styles.back}>← Journal</Link>
            <Link href="/map" className={styles.back}>Map</Link>
          </div>
        </header>

        <form className={styles.form} onSubmit={submit}>
          <label>
            <span>Dream date</span>
            <input type="datetime-local" value={date} onChange={(event) => setDate(event.target.value)} required />
          </label>

          <label>
            <span>Title <em>optional</em></span>
            <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="The infinite library" />
          </label>

          <label>
            <span>Dream</span>
            <textarea value={body} onChange={(event) => setBody(event.target.value)} rows={10} placeholder="I was standing somewhere I almost recognized…" required />
          </label>

          <fieldset>
            <legend>Mood</legend>
            <div className={styles.moodRow}>
              {[1, 2, 3, 4, 5].map((value) => (
                <button
                  key={value}
                  type="button"
                  className={mood === value ? styles.moodActive : styles.moodButton}
                  onClick={() => setMood(value)}
                >
                  {value}
                </button>
              ))}
            </div>
          </fieldset>

          <label className={styles.toggleRow}>
            <span>Lucid dream</span>
            <input type="checkbox" checked={lucid} onChange={(event) => setLucid(event.target.checked)} />
          </label>

          <fieldset>
            <legend>Symbols</legend>
            <div className={styles.symbolGrid}>
              {symbols.map((symbol) => (
                <button
                  key={symbol._id}
                  type="button"
                  className={selectedIds.includes(symbol._id) ? styles.symbolSelected : styles.symbolButton}
                  onClick={() => toggleSymbol(symbol._id)}
                >
                  <span>{symbol.icon || '✦'}</span>
                  {symbol.name}
                </button>
              ))}
            </div>

            {!showNewSymbol ? (
              <button type="button" className={styles.addSymbol} onClick={() => setShowNewSymbol(true)}>
                + Create symbol
              </button>
            ) : (
              <div className={styles.newSymbolBox}>
                <input value={symbolIcon} onChange={(event) => setSymbolIcon(event.target.value)} aria-label="Symbol icon" className={styles.iconInput} maxLength={8} />
                <input value={symbolName} onChange={(event) => setSymbolName(event.target.value)} placeholder="Symbol name" />
                <select value={symbolCategory} onChange={(event) => setSymbolCategory(event.target.value as SymbolCategory)}>
                  <option value="person">Person</option>
                  <option value="place">Place</option>
                  <option value="object">Object</option>
                  <option value="feeling">Feeling</option>
                  <option value="action">Action</option>
                </select>
                <button type="button" onClick={createSymbol}>Add</button>
              </div>
            )}
          </fieldset>

          <button className={styles.submit} type="submit">Save dream</button>
        </form>
      </div>
    </main>
  )
}
