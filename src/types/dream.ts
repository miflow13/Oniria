export type SymbolCategory = 'person' | 'place' | 'object' | 'feeling' | 'action'

export type DreamSymbol = {
  _id: string
  name: string
  category: SymbolCategory
  icon?: string
}

export type Dream = {
  _id: string
  date: string
  title?: string
  body: string
  mood: number
  lucid: boolean
  symbols?: DreamSymbol[]
}
