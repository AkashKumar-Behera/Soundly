export interface Song {
  id: string
  title: string
  artist: string
  album: string
  hue: number
  hue2: number
  src: string
  duration: number
}

export interface Playlist {
  id: string
  title: string
  description: string
  hue: number
  songIds: string[]
}

export interface Category {
  id: string
  title: string
  hue: number
}

// [title, artist, album, approx duration in seconds]
const raw: [string, string, string, number][] = [
  ['Midnight Drive', 'Neon Harbor', 'After Hours', 372],
  ['Golden Hour', 'Luna Vale', 'Daylight', 345],
  ['Paper Planes', 'Kaito Rise', 'Origami', 361],
  ['Slow Motion', 'Aria Moon', 'Tides', 410],
  ['City Lights', 'Neon Harbor', 'After Hours', 338],
  ['Static Dreams', 'Velvet Static', 'Signal', 389],
  ['Over the Water', 'Mira & The Tides', 'Harbor Songs', 402],
  ['Gravity', 'Orbit Kid', 'Low Orbit', 354],
  ['Sunday Rain', 'Luna Vale', 'Daylight', 367],
  ['Afterglow', 'Sundial', 'Long Shadows', 376],
  ['Wildfire', 'Kaito Rise', 'Origami', 349],
  ['Blue Hour', 'Aria Moon', 'Tides', 421],
  ['Echoes', 'Velvet Static', 'Signal', 358],
  ['Lantern', 'Mira & The Tides', 'Harbor Songs', 395],
  ['Rewind', 'Orbit Kid', 'Low Orbit', 343],
  ['Soft Landing', 'Sundial', 'Long Shadows', 384],
]

// Royalty-free test tracks, replaced by Cloudflare R2 URLs once the backend exists.
export const songs: Song[] = raw.map(([title, artist, album, duration], i) => ({
  id: `s${i + 1}`,
  title,
  artist,
  album,
  duration,
  hue: (i * 47 + 140) % 360,
  hue2: (i * 47 + 200) % 360,
  src: `https://www.soundhelix.com/examples/mp3/SoundHelix-Song-${i + 1}.mp3`,
}))

export const songById = (id: string): Song | undefined => songs.find((s) => s.id === id)

export const playlists: Playlist[] = [
  { id: 'daily-mix', title: 'Daily Mix', description: 'Your day in songs, refreshed every morning.', hue: 150, songIds: ['s1', 's2', 's5', 's9', 's12', 's3'] },
  { id: 'night-drive', title: 'Night Drive', description: 'Neon lights and empty roads.', hue: 255, songIds: ['s1', 's5', 's6', 's13', 's8', 's15'] },
  { id: 'chill-vibes', title: 'Chill Vibes', description: 'Slow it down and breathe.', hue: 190, songIds: ['s4', 's9', 's10', 's12', 's14', 's16'] },
  { id: 'focus-flow', title: 'Focus Flow', description: 'Deep work, no distractions.', hue: 30, songIds: ['s8', 's13', 's6', 's15', 's7'] },
  { id: 'throwbacks', title: 'Throwbacks', description: 'Songs you replayed to death.', hue: 330, songIds: ['s3', 's11', 's2', 's7', 's14'] },
  { id: 'workout', title: 'Workout Fuel', description: 'High energy from first rep to last.', hue: 10, songIds: ['s11', 's3', 's8', 's15', 's6'] },
]

export const categories: Category[] = [
  { id: 'pop', title: 'Pop', hue: 320 },
  { id: 'hiphop', title: 'Hip-Hop', hue: 30 },
  { id: 'chill', title: 'Chill', hue: 190 },
  { id: 'rock', title: 'Rock', hue: 5 },
  { id: 'focus', title: 'Focus', hue: 150 },
  { id: 'party', title: 'Party', hue: 280 },
  { id: 'indie', title: 'Indie', hue: 60 },
  { id: 'workout', title: 'Workout', hue: 15 },
  { id: 'sleep', title: 'Sleep', hue: 240 },
  { id: 'romance', title: 'Romance', hue: 345 },
]

export const lyrics: string[] = [
  'Lights go down on the empty street',
  'Heartbeat keeping time with my feet',
  'Every road leads back to you',
  'And I let the night come through',
  'Hold on, hold on, let the music play',
  'Carry all the noise away',
  'We are only here for a while',
  'So turn it up and stay a while',
  'Colors fade but the sound remains',
  'Echo through the window panes',
  'Take my hand, we will go',
  'Wherever the wild winds blow',
  'One more song before it ends',
  'Close your eyes, begin again',
]
