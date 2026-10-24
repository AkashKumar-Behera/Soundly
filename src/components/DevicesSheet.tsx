import { Laptop, Pause, Pencil, Play, SkipBack, SkipForward, Smartphone, Tablet, X } from 'lucide-react'
import { useState } from 'react'
import { useConnect } from '../store/connect'
import type { Device } from '../store/connect'
import { useCurrent, usePlayer } from '../store/player'
import { useUi } from '../store/ui'

const icon = (kind: string) => (kind === 'computer' ? <Laptop size={22} /> : kind === 'tablet' ? <Tablet size={22} /> : <Smartphone size={22} />)

function Row({ d }: { d: Device }) {
  const playOn = useConnect((s) => s.playOn)
  const playHere = useConnect((s) => s.playHere)
  const control = useConnect((s) => s.control)
  const st = d.state
  // A state older than a minute while "playing" means that device went away without saying so.
  const live = !!st && (!st.playing || Date.now() - st.at < 60000)
  return (
    <div className={`dev-row ${live && st?.playing ? 'on' : ''}`}>
      <div className="dev-ico">{icon(d.kind)}</div>
      <div className="min0 grow">
        <div className="truncate strong">{d.name}</div>
        <div className="truncate muted">{st && live ? `${st.playing ? 'Playing' : 'Paused'} · ${st.title}` : 'Ready'}</div>
      </div>
      {st && live && st.playing ? (
        <div className="dev-ctrl">
          <button className="icon-btn" aria-label="Previous" onClick={() => control(d.id, 'prev')}>
            <SkipBack size={18} fill="currentColor" />
          </button>
          <button className="icon-btn" aria-label="Pause" onClick={() => control(d.id, 'toggle')}>
            <Pause size={20} fill="currentColor" />
          </button>
          <button className="icon-btn" aria-label="Next" onClick={() => control(d.id, 'next')}>
            <SkipForward size={18} fill="currentColor" />
          </button>
        </div>
      ) : st && live ? (
        <button className="icon-btn" aria-label="Resume" onClick={() => control(d.id, 'toggle')}>
          <Play size={20} fill="currentColor" />
        </button>
      ) : null}
      <div className="dev-actions">
        {st && live && st.playing && (
          <button className="btn-pill" onClick={() => playHere(d.id)}>
            Play here
          </button>
        )}
        <button className="btn-pill ghost" onClick={() => playOn(d.id)}>
          Play on this
        </button>
      </div>
    </div>
  )
}

/** Pick another of your devices to play on, or bring the music back here. */
export function DevicesSheet() {
  const open = useUi((s) => s.devicesOpen)
  const setOpen = useUi((s) => s.setDevicesOpen)
  const devices = useConnect((s) => s.devices)
  const name = useConnect((s) => s.name)
  const setName = useConnect((s) => s.setName)
  const current = useCurrent()
  const playing = usePlayer((s) => s.playing)
  const [editing, setEditing] = useState<string | null>(null)
  if (!open) return null

  return (
    <div className="modal-back" onClick={() => setOpen(false)}>
      <div className="modal dev-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="room-head">
          <h3>Connect to a device</h3>
          <button className="icon-btn dark" aria-label="Close" onClick={() => setOpen(false)}>
            <X size={20} />
          </button>
        </div>

        <div className={`dev-row ${playing ? 'on' : ''}`}>
          <div className="dev-ico">{icon(useConnect.getState().kind)}</div>
          <div className="min0 grow">
            {editing !== null ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  setName(editing)
                  setEditing(null)
                }}
              >
                <input autoFocus className="modal-input" value={editing} maxLength={40} onChange={(e) => setEditing(e.target.value)} onBlur={() => setEditing(null)} />
              </form>
            ) : (
              <div className="truncate strong">
                {name} <span className="muted">(this device)</span>
              </div>
            )}
            <div className="truncate muted">{current ? `${playing ? 'Playing' : 'Paused'} · ${current.title}` : 'Nothing playing'}</div>
          </div>
          <button className="icon-btn" aria-label="Rename this device" onClick={() => setEditing(name)}>
            <Pencil size={16} />
          </button>
        </div>

        {devices.length === 0 ? (
          <p className="muted empty">No other devices yet. Open Soundly on your phone, tablet or laptop with the same account and it shows up here.</p>
        ) : (
          devices.map((d) => <Row key={d.id} d={d} />)
        )}
      </div>
    </div>
  )
}
