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


export const LIBRARY_WORLD_QUERY = defineQuery(`
{
  "config": *[_type == "libraryConfig"][0] {
    welcomeTitle,
    welcomeSubtitle,
    welcomeBody,
    archiveStatus,
    defaultMovement,
    atmosphere,
    hazeIntensity,
    liveDevUpdates,
    deepStacksEnabled,
    "featuredDistrictId": featuredDistrict->slug.current
  },
  "districts": *[
    _type == "libraryDistrict" &&
    coalesce(enabled, true)
  ]
  | order(order asc, routeBay asc) {
    _id,
    "label": title,
    "id": slug.current,
    code,
    description,
    devTags,
    "bay": routeBay,
    accent,
    atmosphere,
    audioProfile,
    landmarkType,
    sourceMode,
    roomSlot,
    enabled
  },
  "curatedArticles": *[
    _type == "curatedArticle" &&
    coalesce(enabled, true)
  ]
  | order(priority desc) {
    devArticleId,
    label,
    "districtId": district->slug.current,
    featured,
    priority,
    curatorNote
  },
  "journeys": *[
    _type == "archiveJourney" &&
    coalesce(enabled, true)
  ] {
    "id": slug.current,
    title,
    description,
    "stops": stops[] {
      "districtId": district->slug.current,
      devArticleId,
      caption
    }
  }
}
`)


export const LIBRARY_WORLD_RAW_QUERY = defineQuery(`
{
  "configDocs": *[_type == "libraryConfig"] {
    _id,
    _rev,
    _updatedAt,
    welcomeTitle,
    welcomeSubtitle,
    welcomeBody,
    archiveStatus,
    defaultMovement,
    atmosphere,
    hazeIntensity,
    liveDevUpdates,
    deepStacksEnabled,
    "featuredDistrictRef": featuredDistrict._ref
  },
  "districtDocs": *[_type == "libraryDistrict"] {
    _id,
    _rev,
    _updatedAt,
    "label": title,
    "id": slug.current,
    code,
    description,
    devTags,
    "bay": routeBay,
    accent,
    atmosphere,
    audioProfile,
    landmarkType,
    sourceMode,
    roomSlot,
    enabled
  },
  "curatedArticleDocs": *[_type == "curatedArticle"] {
    _id,
    _rev,
    _updatedAt,
    devArticleId,
    label,
    "districtRef": district._ref,
    featured,
    priority,
    curatorNote,
    enabled
  },
  "journeyDocs": *[_type == "archiveJourney"] {
    _id,
    _rev,
    _updatedAt,
    "id": slug.current,
    title,
    description,
    enabled,
    "stops": stops[] {
      "districtRef": district._ref,
      devArticleId,
      caption
    }
  }
}
`)
