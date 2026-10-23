import { useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useRoom } from '../store/room'
import { useUi } from '../store/ui'

/** /room/ABC123 invite link: join that room, then land on the home screen with the room open. */
export function RoomJoin() {
  const { code = '' } = useParams()
  const navigate = useNavigate()
  const join = useRoom((s) => s.join)

  useEffect(() => {
    join(code)
    useUi.getState().setRoomModal(true)
    navigate('/', { replace: true })
  }, [code, join, navigate])

  return <p className="muted empty">Joining the room…</p>
}
