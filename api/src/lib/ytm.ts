// YouTube Music's own web API (InnerTube), the same one the music.youtube.com site uses. It needs no key and has no
// quota, but it is unofficial: Google can change it at any time, so callers fall back to the official Data API.

const BASE = 'https://music.youtube.com/youtubei/v1/'
const HEADERS = {
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0',
  'content-type': 'application/json',
  origin: 'https://music.youtube.com',
  cookie: 'CONSENT=YES+1',
}
/** Search filter: songs only, with YouTube's spelling correction left on. */
const SONGS_FILTER = 'EgWKAQIIAWoMEA4QChADEAQQCRAF'

export interface YtmTrack {
  youtubeId: string
  title: string
  channel: string
  durationSec: number
  category: string
  thumbnail: string
}

type Json = any // eslint-disable-line @typescript-eslint/no-explicit-any

async function call(path: string, body: Record<string, unknown>): Promise<Json> {
  const clientVersion = `1.${new Date().toISOString().slice(0, 10).replaceAll('-', '')}.01.00`
  const res = await fetch(`${BASE}${path}?prettyPrint=false`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify({ context: { client: { clientName: 'WEB_REMIX', clientVersion, hl: 'en' }, user: {} }, ...body }),
  })
  if (!res.ok) throw new Error(`ytm ${path} ${res.status}`)
  return res.json()
}

const parseClock = (t: string | undefined): number => {
  if (!t || !/^\d+(:\d{1,2}){1,2}$/.test(t)) return 0
  return t.split(':').reduce((acc, n) => acc * 60 + Number(n), 0)
}

/** Googleusercontent art URLs take a size suffix; ask for a big square one. */
export const bigArt = (url: string | undefined, size = 544): string => (url ? url.replace(/=w\d+-h\d+.*$/, `=w${size}-h${size}-l90-rj`) : '')

export async function ytmSearch(q: string): Promise<YtmTrack[]> {
  const data = await call('search', { query: q, params: SONGS_FILTER })
  const sections: Json[] = data.contents?.tabbedSearchResultsRenderer?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer?.contents ?? []
  const items: Json[] = sections.flatMap((s) => s.musicShelfRenderer?.contents ?? [])
  const out: YtmTrack[] = []
  for (const it of items) {
    const r = it.musicResponsiveListItemRenderer
    if (!r) continue
    const youtubeId: string | undefined = r.playlistItemData?.videoId ?? r.overlay?.musicItemThumbnailOverlayRenderer?.content?.musicPlayButtonRenderer?.playNavigationEndpoint?.watchEndpoint?.videoId
    if (!youtubeId) continue
    const col = (i: number): string[] => (r.flexColumns?.[i]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs ?? []).map((x: Json) => x.text as string)
    const title = col(0).join('')
    const meta = col(1).filter((t) => t.trim() !== '•') // "Song • Artist • Album • 3:06" or "Artist • Album • 3:06"
    if (meta[0]?.toLowerCase() === 'song') meta.shift()
    const durationSec = parseClock(meta.at(-1))
    const thumb = r.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails?.at(-1)?.url as string | undefined
    out.push({ youtubeId, title, channel: meta[0] ?? '', durationSec, category: 'Music', thumbnail: bigArt(thumb, 226) })
  }
  return out
}

export async function ytmSuggest(q: string): Promise<string[]> {
  const data = await call('music/get_search_suggestions', { input: q })
  const rows: Json[] = data.contents?.[0]?.searchSuggestionsSectionRenderer?.contents ?? []
  return rows
    .map((r) => r.searchSuggestionRenderer?.navigationEndpoint?.searchEndpoint?.query as string | undefined)
    .filter((s): s is string => !!s)
    .slice(0, 8)
}

/** YouTube Music's "radio" for a song: what it would play next. The first entry is the song itself. */
export async function ytmRadio(videoId: string, limit = 25): Promise<YtmTrack[]> {
  const data = await call('next', {
    videoId,
    playlistId: `RDAMVM${videoId}`,
    isAudioOnly: true,
    tunerSettingValue: 'AUTOMIX_SETTING_NORMAL',
    enablePersistentPlaylistPanel: true,
    watchEndpointMusicSupportedConfigs: { watchEndpointMusicConfig: { hasPersistentPlaylistPanel: true, musicVideoType: 'MUSIC_VIDEO_TYPE_ATV' } },
  })
  const tabs: Json[] = data.contents?.singleColumnMusicWatchNextResultsRenderer?.tabbedRenderer?.watchNextTabbedResultsRenderer?.tabs ?? []
  const rows: Json[] = tabs[0]?.tabRenderer?.content?.musicQueueRenderer?.content?.playlistPanelRenderer?.contents ?? []
  const out: YtmTrack[] = []
  for (const row of rows) {
    const v = row.playlistPanelVideoRenderer
    if (!v?.videoId || v.videoId === videoId) continue
    out.push({
      youtubeId: v.videoId,
      title: (v.title?.runs ?? []).map((x: Json) => x.text).join(''),
      channel: v.longBylineText?.runs?.[0]?.text ?? '',
      durationSec: parseClock(v.lengthText?.runs?.[0]?.text),
      category: 'Music',
      thumbnail: bigArt(v.thumbnail?.thumbnails?.at(-1)?.url, 226),
    })
    if (out.length >= limit) break
  }
  return out
}

export interface YtmArtist {
  browseId: string
  name: string
  subtitle: string
  thumbnail: string
}

const ARTISTS_FILTER = 'EgWKAQIgAWoMEA4QChADEAQQCRAF'

export async function ytmArtists(q: string): Promise<YtmArtist[]> {
  const data = await call('search', { query: q, params: ARTISTS_FILTER })
  const sections: Json[] = data.contents?.tabbedSearchResultsRenderer?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer?.contents ?? []
  const out: YtmArtist[] = []
  for (const it of sections.flatMap((s) => s.musicShelfRenderer?.contents ?? [])) {
    const r = it.musicResponsiveListItemRenderer
    const browseId: string | undefined = r?.navigationEndpoint?.browseEndpoint?.browseId
    if (!browseId?.startsWith('UC')) continue
    const col = (i: number): string => (r.flexColumns?.[i]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs ?? []).map((x: Json) => x.text).join('')
    out.push({ browseId, name: col(0), subtitle: col(1).replace(/^Artist\s*•\s*/, ''), thumbnail: bigArt(r.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails?.at(-1)?.url, 226) })
  }
  return out.slice(0, 6)
}

function rowToTrack(r: Json): YtmTrack | null {
  const youtubeId: string | undefined = r?.playlistItemData?.videoId
  if (!youtubeId) return null
  const text = (i: number): string => (r.flexColumns?.[i]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs ?? []).map((x: Json) => x.text).join('')
  return {
    youtubeId,
    title: text(0),
    channel: text(1),
    durationSec: parseClock(r.fixedColumns?.[0]?.musicResponsiveListItemFixedColumnRenderer?.text?.runs?.[0]?.text),
    category: 'Music',
    thumbnail: bigArt(r.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails?.at(-1)?.url, 226),
  }
}

/** Every song of an artist: the artist page's "Songs" list, followed through its continuation pages. */
export async function ytmArtistSongs(browseId: string, max = 300): Promise<YtmTrack[]> {
  const page = await call('browse', { browseId })
  const shelves: Json[] = page.contents?.singleColumnBrowseResultsRenderer?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer?.contents ?? []
  const songs = shelves.find((s) => s.musicShelfRenderer)?.musicShelfRenderer
  const more = songs?.title?.runs?.[0]?.navigationEndpoint?.browseEndpoint ?? songs?.bottomEndpoint?.browseEndpoint

  const out: YtmTrack[] = []
  const seen = new Set<string>()
  const take = (rows: Json[]) => {
    for (const row of rows) {
      const t = rowToTrack(row.musicResponsiveListItemRenderer)
      if (t && !seen.has(t.youtubeId)) {
        seen.add(t.youtubeId)
        out.push(t)
      }
    }
  }

  if (!more) {
    take(songs?.contents ?? [])
    return out.slice(0, max)
  }

  const first = await call('browse', { browseId: more.browseId, params: more.params })
  const shelf = first.contents?.singleColumnBrowseResultsRenderer?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer?.contents?.[0]?.musicPlaylistShelfRenderer
  take(shelf?.contents ?? [])
  let token: string | undefined = shelf?.continuations?.[0]?.nextContinuationData?.continuation
  for (let i = 0; token && out.length < max && i < 12; i++) {
    const next = await call('browse', { continuation: token })
    const cont = next.continuationContents?.musicPlaylistShelfContinuation
    take(cont?.contents ?? [])
    token = cont?.continuations?.[0]?.nextContinuationData?.continuation
  }
  return out.slice(0, max)
}
