export type YoutubeLink = { kind: 'playlist'; listId: string } | { kind: 'video'; id: string }

/** Recognises a pasted YouTube link: a playlist (…list=ID) or a single video (watch?v=, youtu.be/, shorts/). */
export function parseYoutubeLink(input: string): YoutubeLink | null {
  const text = input.trim()
  if (!/^(https?:\/\/)?([\w-]+\.)?(youtube\.com|youtu\.be|music\.youtube\.com)\//i.test(text)) return null
  let url: URL
  try {
    url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`)
  } catch {
    return null
  }

  const list = url.searchParams.get('list')
  // "Mix" and radio lists (RD…) are generated per video and not importable; only real playlists are.
  if (list && /^[\w-]{10,64}$/.test(list) && !list.startsWith('RD')) return { kind: 'playlist', listId: list }

  const host = url.hostname.replace(/^www\./, '')
  const id =
    host === 'youtu.be'
      ? url.pathname.slice(1).split('/')[0]
      : url.searchParams.get('v') ?? (/^\/(shorts|embed|live)\/([\w-]{11})/.exec(url.pathname)?.[2] ?? '')
  return /^[\w-]{11}$/.test(id) ? { kind: 'video', id } : null
}
