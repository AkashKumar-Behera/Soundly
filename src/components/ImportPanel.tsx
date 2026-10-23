import { ListPlus } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { formatTime } from '../lib/format'
import { hueFromId, useLibrary } from '../store/library'
import type { PlaylistPreview, YoutubeResult } from '../store/library'
import { useUi } from '../store/ui'
import { Cover } from './Cover'
import { LONG_SECONDS } from './YoutubeRow'

const errors: Record<string, string> = {
  not_found: 'That playlist was not found. It may be private.',
  forbidden: 'Listeners cannot import playlists.',
  youtube_not_configured: 'YouTube is not set up on this server yet.',
  search_limit: 'You have used today’s YouTube lookups.',
  search_quota: 'YouTube is busy today, try again tomorrow.',
  import_limit: 'You can import 2 playlists a day.',
  demo_unavailable: 'Playlist import needs the live server.',
  youtube_error: 'YouTube did not answer, try again.',
  network: 'Could not reach the server.',
  nothing_selected: 'Pick at least one song.',
}

const flagged = (v: YoutubeResult) => v.category !== 'Music' || v.durationSec > LONG_SECONDS

/** Pasted YouTube playlist link: preview, pick songs, import as a Soundly playlist. */
export function ImportPanel({ listId }: { listId: string }) {
  const navigate = useNavigate()
  const previewPlaylist = useLibrary((s) => s.previewPlaylist)
  const importPlaylist = useLibrary((s) => s.importPlaylist)
  const showToast = useUi((s) => s.showToast)
  const [state, setState] = useState<{ phase: 'loading' } | { phase: 'error'; error: string } | { phase: 'ready'; preview: PlaylistPreview }>({ phase: 'loading' })
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let live = true
    setState({ phase: 'loading' })
    void previewPlaylist(listId).then((r) => {
      if (!live) return
      if (!r.ok) return setState({ phase: 'error', error: r.error })
      setState({ phase: 'ready', preview: r.preview })
      setName(r.preview.title)
      // Songs that look like real music start selected; non-music and very long ones are opt-in.
      setPicked(new Set(r.preview.items.filter((i) => !flagged(i)).map((i) => i.youtubeId)))
    })
    return () => {
      live = false
    }
  }, [listId, previewPlaylist])

  const counts = useMemo(() => {
    if (state.phase !== 'ready') return { lib: 0, toGet: 0 }
    const sel = state.preview.items.filter((i) => picked.has(i.youtubeId))
    return { lib: sel.filter((i) => i.songId).length, toGet: sel.filter((i) => !i.songId).length }
  }, [state, picked])

  if (state.phase === 'loading') return <p className="muted empty">Reading the playlist…</p>
  if (state.phase === 'error') return <p className="muted empty">{errors[state.error] ?? 'Could not read that playlist.'}</p>

  const { preview } = state
  const toggle = (id: string) =>
    setPicked((cur) => {
      const next = new Set(cur)
      if (!next.delete(id)) next.add(id)
      return next
    })

  const run = async () => {
    setBusy(true)
    const r = await importPlaylist(listId, [...picked], name.trim() || preview.title)
    setBusy(false)
    if (!r.ok) return showToast(errors[r.error] ?? 'Import failed')
    const x = r.result
    const parts = [
      x.inLibrary && `${x.inLibrary} already in the library`,
      x.queued && `${x.queued} downloading`,
      x.pendingApproval && `${x.pendingApproval} waiting for approval`,
      x.alreadyRequested && `${x.alreadyRequested} already requested`,
    ].filter(Boolean)
    showToast(`Playlist created${parts.length ? ': ' + parts.join(', ') : ''}`)
    navigate(`/playlist/${x.playlistId}`)
  }

  return (
    <>
      <div className="import-head">
        <div className="min0">
          <div className="eyebrow">YouTube playlist</div>
          <h2 className="section-title truncate">{preview.title}</h2>
          <p className="muted">
            {preview.channel} · {preview.total} videos
            {preview.total > preview.shown ? ` (showing the first ${preview.shown}, the import limit)` : ''}
          </p>
        </div>
      </div>

      <div className="toolbar wrap">
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Playlist name" maxLength={80} aria-label="Playlist name" />
        <button className="btn-pill" onClick={() => setPicked(new Set(preview.items.map((i) => i.youtubeId)))}>
          Select all
        </button>
        <button className="btn-pill" onClick={() => setPicked(new Set())}>
          None
        </button>
      </div>

      <div className="yt-list">
        {preview.items.map((v) => (
          <label key={v.youtubeId} className="yt-item pick">
            <input type="checkbox" checked={picked.has(v.youtubeId)} onChange={() => toggle(v.youtubeId)} />
            {v.thumbnail ? (
              <div className="yt-thumb">
                <img src={v.thumbnail} alt="" loading="lazy" referrerPolicy="no-referrer" />
              </div>
            ) : (
              <Cover hue={hueFromId(v.youtubeId)} size={56} className="r8" />
            )}
            <div className="min0 grow">
              <div className="truncate yt-t">{v.title}</div>
              <div className="truncate muted">
                {v.channel} · {formatTime(v.durationSec)}
                {v.category !== 'Music' && <span className="flag">{v.category}</span>}
                {v.durationSec > LONG_SECONDS && <span className="flag">Very long</span>}
              </div>
            </div>
            {v.songId ? <span className="status done">In library</span> : v.requestStatus ? <span className="status queued">Requested</span> : null}
          </label>
        ))}
      </div>

      <div className="import-bar">
        <span className="muted">
          {picked.size} selected{counts.lib ? ` · ${counts.lib} already here` : ''}
          {counts.toGet ? ` · ${counts.toGet} to download` : ''}
        </span>
        <button className="btn-pill primary" disabled={!picked.size || busy} onClick={() => void run()}>
          <ListPlus size={16} /> {busy ? 'Importing…' : `Import ${picked.size} song${picked.size === 1 ? '' : 's'}`}
        </button>
      </div>
    </>
  )
}
