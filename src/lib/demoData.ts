import type {Dream, DreamSymbol} from '@/types/dream'

export const DEMO_SYMBOLS: DreamSymbol[] = [
  {_id: 'symbol-water', name: 'Water', category: 'object', icon: '💧'},
  {_id: 'symbol-flight', name: 'Flying', category: 'action', icon: '🪶'},
  {_id: 'symbol-house', name: 'House', category: 'place', icon: '⌂'},
  {_id: 'symbol-eye', name: 'Watchful eye', category: 'object', icon: '◉'},
  {_id: 'symbol-forest', name: 'Forest', category: 'place', icon: '🌲'},
  {_id: 'symbol-familiar', name: 'Familiar face', category: 'person', icon: '✦'},
]

export const DEMO_DREAMS: Dream[] = [
  {
    _id: 'dream-infinite-library',
    date: '2026-09-20T07:42:00.000Z',
    title: 'The Infinite Library',
    body: 'I was floating through an infinite library. The books had no titles, only soft light streaming from within the pages. Every aisle seemed to bend toward somewhere I almost remembered.',
    mood: 4,
    lucid: true,
    symbols: [DEMO_SYMBOLS[1], DEMO_SYMBOLS[5]],
  },
  {
    _id: 'dream-silent-house',
    date: '2026-09-16T03:18:00.000Z',
    title: 'The Silent House',
    body: 'A house sat at the edge of a black lake with every window lit. I knew there were people inside, but each time I reached the porch the front door moved farther away.',
    mood: 2,
    lucid: false,
    symbols: [DEMO_SYMBOLS[2], DEMO_SYMBOLS[0], DEMO_SYMBOLS[3]],
  },
  {
    _id: 'dream-water-room',
    date: '2026-09-11T09:05:00.000Z',
    title: 'Water Room',
    body: 'The room was completely dry, but water moved across the ceiling like an upside-down ocean. Small blue lights followed me whenever I looked away.',
    mood: 3,
    lucid: false,
    symbols: [DEMO_SYMBOLS[0], DEMO_SYMBOLS[3]],
  },
]
