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
