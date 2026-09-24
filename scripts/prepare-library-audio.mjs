import {mkdir, stat, writeFile} from 'node:fs/promises'
import {dirname, resolve} from 'node:path'

const SOURCE_PAGE =
  'https://pixabay.com/music/ambient-ambient-ambient-music-569592/'
const TARGET = resolve(
  process.cwd(),
  'public/audio/solarflex-ambient-ambient-music-569592.mp3',
)
const MIN_BYTES = 1_000_000

async function existingAssetIsUsable() {
  try {
    const info = await stat(TARGET)
    return info.isFile() && info.size >= MIN_BYTES
  } catch {
    return false
  }
}

function unescapeCandidate(value) {
  return value
    .replaceAll('\\u002F', '/')
    .replaceAll('\\u0026', '&')
    .replaceAll('\\/', '/')
    .replaceAll('&amp;', '&')
}

function mediaCandidates(html) {
  const matches = new Set()
  const patterns = [
    /https:\\/\\/cdn\.pixabay\.com\\/download\\/audio\\/[^"'<>\\s]+/g,
    /https:\/\/cdn\.pixabay\.com\/download\/audio\/[^"'<>\s]+/g,
  ]

  for (const pattern of patterns) {
    for (const match of html.matchAll(pattern)) {
      matches.add(unescapeCandidate(match[0]))
    }
  }

  return [...matches].sort((a, b) => {
    const aExact = a.includes('569592') ? 1 : 0
    const bExact = b.includes('569592') ? 1 : 0
    return bExact - aExact
  })
}

async function main() {
  if (await existingAssetIsUsable()) {
    console.log('[library audio] ambient track already present')
    return
  }

  console.log('[library audio] fetching SolarFLEX ambient track metadata')
  const pageResponse = await fetch(SOURCE_PAGE, {
    headers: {
      'user-agent':
        'Mozilla/5.0 OniriaLibrary/1.0 (+https://github.com/miflow13/Oniria)',
      accept: 'text/html,application/xhtml+xml',
    },
    redirect: 'follow',
  })

  if (!pageResponse.ok) {
    throw new Error(
      `Pixabay page request failed: ${pageResponse.status}`,
    )
  }

  const html = await pageResponse.text()
  const candidates = mediaCandidates(html)

  if (candidates.length === 0) {
    throw new Error(
      'Could not locate the Pixabay audio CDN URL for track 569592.',
    )
  }

  let lastError = null
  for (const candidate of candidates) {
    try {
      const response = await fetch(candidate, {
        headers: {
          'user-agent':
            'Mozilla/5.0 OniriaLibrary/1.0 (+https://github.com/miflow13/Oniria)',
          referer: SOURCE_PAGE,
        },
        redirect: 'follow',
      })
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      const bytes = Buffer.from(await response.arrayBuffer())
      if (bytes.length < MIN_BYTES) {
        throw new Error(
          `download too small (${bytes.length} bytes)`,
        )
      }

      await mkdir(dirname(TARGET), {recursive: true})
      await writeFile(TARGET, bytes)
      console.log(
        `[library audio] wrote ${bytes.length} bytes to public/audio`,
      )
      return
    } catch (error) {
      lastError = error
    }
  }

  throw new Error(
    'Unable to download track 569592 from Pixabay: ' +
      (lastError instanceof Error
        ? lastError.message
        : String(lastError)),
  )
}

main().catch((error) => {
  console.error('[library audio]', error)
  process.exitCode = 1
})
