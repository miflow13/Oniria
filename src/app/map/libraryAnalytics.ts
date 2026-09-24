export type LibraryAnalyticsEvent =
  | 'library_enter'
  | 'room_enter'
  | 'shelf_focus'
  | 'book_focus'
  | 'book_open'
  | 'article_open'
  | 'article_scroll_50'
  | 'article_complete'
  | 'article_close'
  | 'return_to_shelf'
  | 'search_started'
  | 'search_result_selected'

export type LibraryAnalyticsDetail = Record<
  string,
  string | number | boolean | null | undefined
>

export function emitLibraryEvent(
  name: LibraryAnalyticsEvent,
  detail: LibraryAnalyticsDetail = {},
) {
  if (typeof window === 'undefined') return

  const payload = {
    name,
    detail,
    timestamp: new Date().toISOString(),
  }

  window.dispatchEvent(
    new CustomEvent('oniria:library-analytics', {
      detail: payload,
    }),
  )

  if (process.env.NODE_ENV !== 'production') {
    console.debug('[DEV Library analytics]', payload)
  }
}
