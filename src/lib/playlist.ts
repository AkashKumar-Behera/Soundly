import { useLibrary } from '../store/library'
import { usePlayer } from '../store/player'

/** Loads a playlist (or "liked") and starts it from the first song. */
export async function playPlaylist(id: string, startAt = 0) {
  const data = await useLibrary.getState().getPlaylist(id)
  if (data?.songs.length) usePlayer.getState().playQueue(data.songs, startAt, id)
}
