export type DevUser = {
  type_of?: string
  id: number
  username: string
  name: string
  summary?: string
  twitter_username?: string | null
  github_username?: string | null
  website_url?: string | null
  location?: string | null
  joined_at?: string
  profile_image?: string
}

export type DevArticleSummary = {
  type_of?: string
  id: number
  title: string
  description: string
  readable_publish_date?: string
  cover_image?: string | null
  social_image?: string | null
  tag_list: string[]
  tags?: string
  slug: string
  path: string
  url: string
  canonical_url?: string
  comments_count?: number
  public_reactions_count?: number
  positive_reactions_count?: number
  reading_time_minutes?: number
  published_at?: string
  published_timestamp?: string
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

export type LibrarySection =
  | 'atrium'
  | 'featured'
  | 'latest'
  | 'topics'
  | 'creators'
  | 'search'
  | 'archive'

export type SurfNodeKind =
  | 'home'
  | 'section'
  | 'profile'
  | 'article'
  | 'tag'
  | 'search'

export type SurfNode = {
  id: string
  kind: SurfNodeKind
  title: string
  subtitle: string
  href?: string
  username?: string
  articleId?: number
  tag?: string
  section?: LibrarySection
  position: [number, number, number]
  rotationY?: number
  shelfKey?: string
  shelfLevel?: number
  shelfSlot?: number
  shelfOrder?: number
  importance: number
  accent: string
  payload?: DevArticleSummary
}

export type SurfEdge = {
  id: string
  source: string
  target: string
  weight: number
  kind: 'feed' | 'author' | 'tag' | 'search' | 'corridor'
}
