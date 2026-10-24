import { api } from '../api/client'
import { toSong, useLibrary } from '../store/library'
import { usePlayer } from '../store/player'
import { useUi } from '../store/ui'

/** Plays a library song from just its id (looks it up if the list on screen does not have it). */
export async function playSongById(id: string): Promise<void> {
  let song = useLibrary.getState().songs.find((s) => s.id === id)
  if (!song) {
    try {
      song = toSong(await api<Parameters<typeof toSong>[0]>(`/songs/${id}`))
    } catch {
      useUi.getState().showToast('Could not play that song')
      return
    }
  }
  usePlayer.getState().playQueue([song], 0)
}
