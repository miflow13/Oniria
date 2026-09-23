export type DevUser = {
  id: number
  username: string
  name: string
  summary?: string
  profile_image?: string
}

export type DevArticleSummary = {
  id: number
  title: string
  description: string
  readable_publish_date?: string
  cover_image?: string | null
  social_image?: string | null
  tag_list: string[]
  slug: string
  path: string
  url: string
  comments_count?: number
  public_reactions_count?: number
  positive_reactions_count?: number
  reading_time_minutes?: number
  published_at?: string
  user: {
    name: string
    username: string
    profile_image?: string
    profile_image_90?: string
  }
}

export type DevArticle = DevArticleSummary & {
  body_markdown?: string
  body_html?: string
}

export type DevTag = {
  id?: number
  name: string
  bg_color_hex?: string | null
  text_color_hex?: string | null
}

export type DevBootstrap = {
  profile: DevUser | null
  profileArticles: DevArticleSummary[]
  feed: DevArticleSummary[]
  latest: DevArticleSummary[]
  tags: DevTag[]
}

export type LibraryShelfKind =
  | 'featured'
  | 'latest'
  | 'mine'
  | 'catalog'
  | 'topics'
  | 'creators'
  | 'search'

export type LibraryShelf = {
  id: string
  title: string
  subtitle: string
  kind: LibraryShelfKind
  accent: string
  world: [number, number, number]
  yaw: number
  endCaps: 'none' | 'left' | 'right'
  floatId: string
  pathBay: number
  districtId: string
  articles: DevArticleSummary[]
}
