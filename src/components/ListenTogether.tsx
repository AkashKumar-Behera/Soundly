import { Link2, LogOut, Users, X } from 'lucide-react'
import { useState } from 'react'
import { useRoom } from '../store/room'
import { useUi } from '../store/ui'

/** Start, join or leave a listening room. Everyone in a room controls the same shared music. */
export function ListenTogether() {
  const open = useUi((s) => s.roomModal)
  const setOpen = useUi((s) => s.setRoomModal)
  const showToast = useUi((s) => s.showToast)
  const { code, members, status, create, join, leave } = useRoom()
  const [entry, setEntry] = useState('')
  const [busy, setBusy] = useState(false)

  if (!open) return null
  const link = code ? `${window.location.origin}/room/${code}` : ''

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link)
      showToast('Invite link copied')
    } catch {
      showToast(link)
    }
  }

  return (
    <div className="modal-back" onClick={() => setOpen(false)}>
      <div className="modal room-modal" role="dialog" aria-label="Listen together" onClick={(e) => e.stopPropagation()}>
        <div className="room-head">
          <h3>
            <Users size={20} /> Listen together
          </h3>
          <button className="icon-btn" aria-label="Close" onClick={() => setOpen(false)}>
            <X size={20} />
          </button>
        </div>

        {!code ? (
          <>
            <p className="muted">Everyone in a room hears the same music at the same time, and anyone can play, pause, skip or add songs.</p>
            <button
              className="btn-pill primary"
              disabled={busy}
              onClick={async () => {
                setBusy(true)
                await create()
                setBusy(false)
              }}
            >
              Start a room
            </button>
            <div className="room-or">or join one</div>
            <form
              className="room-join"
              onSubmit={(e) => {
                e.preventDefault()
                join(entry)
              }}
            >
              <input value={entry} onChange={(e) => setEntry(e.target.value.toUpperCase())} placeholder="ROOM CODE" maxLength={6} spellCheck={false} autoComplete="off" aria-label="Room code" />
              <button className="btn-pill" type="submit" disabled={entry.trim().length !== 6}>
                Join
              </button>
            </form>
          </>
        ) : (
          <>
            <div className="room-code" aria-label={`Room code ${code}`}>
              {code}
            </div>
            <p className="muted">{status === 'connected' ? 'Connected. Invite friends with the link.' : status === 'reconnecting' ? 'Reconnecting…' : 'Connecting…'}</p>
            <button className="btn-pill" onClick={() => void copy()}>
              <Link2 size={16} /> Copy invite link
            </button>
            <div className="room-members">
              {members.map((m) => (
                <div key={m.id} className="room-member">
                  <span className="avatar">{m.name.slice(0, 1).toUpperCase()}</span>
                  <span className="truncate">{m.name}</span>
                </div>
              ))}
              {!members.length && <span className="muted">Waiting for others…</span>}
            </div>
            <button
              className="btn-pill danger"
              onClick={() => {
                leave()
                setOpen(false)
              }}
            >
              <LogOut size={16} /> Leave room
            </button>
          </>
        )}
      </div>
    </div>
  )
}

/** Small status pill shown everywhere while in a room. */
export function RoomPill() {
  const { code, members, status, needsTap, tapToPlay } = useRoom()
  const setOpen = useUi((s) => s.setRoomModal)
  if (!code) return null
  return (
    <div className="room-pill">
      <button className="room-pill-main" onClick={() => setOpen(true)} aria-label="Open room">
        <i className={status === 'connected' ? 'live' : ''} />
        Room {code} · {members.length || 1} listening
      </button>
      {needsTap && (
        <button className="room-pill-tap" onClick={tapToPlay}>
          Tap to start the music
        </button>
      )}
    </div>
  )
}
