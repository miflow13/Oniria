import {defineQuery} from 'next-sanity'

export const DREAMS_QUERY = defineQuery(`
  *[_type == "dream"]
  | order(date desc) {
    _id,
    date,
    title,
    body,
    mood,
    lucid,
    "symbols": symbols[]->{
      _id,
      name,
      category,
      icon
    }
  }
`)

export const SYMBOLS_QUERY = defineQuery(`
  *[_type == "symbol"]
  | order(name asc) {
    _id,
    name,
    category,
    icon,
    "frequency": count(
      *[
        _type == "dream" &&
        references(^._id)
      ]
    )
  }
`)


export const DREAM_BY_ID_QUERY = defineQuery(`
  *[_type == "dream" && _id == $id][0] {
    _id,
    date,
    title,
    body,
    mood,
    lucid,
    "symbols": symbols[]->{
      _id,
      name,
      category,
      icon
    }
  }
`)
