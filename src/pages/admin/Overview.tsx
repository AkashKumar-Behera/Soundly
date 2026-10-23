import { useState } from 'react'
import { BarChart, Stat, formatBytes, timeAgo, useAdminData } from './ui'

interface Stats {
  users: { count: number; max: number }
  songs: { count: number; storageBytes: number; freeLimitBytes: number }
  jobs: Record<string, number>
  playsLast7Days: number
  agent: { id: string; online: boolean; onHomeWifi: boolean; lastSeenAt: string; version: string | null; currentJobId: string | null } | null
}

interface Analytics {
  days: number
  series: { day: string; plays: number; listeners: number; minutes: number; requests: number }[]
  totals: { plays: number; minutes: number; activeListeners7d: number }
  topSongs: { id: string; title: string; artist: string | null; plays: number; seconds: number }[]
  topListeners: { id: string; name: string; plays: number; seconds: number }[]
}

export function Overview({ goTo }: { goTo: (tab: string) => void }) {
  const [days, setDays] = useState(30)
  const stats = useAdminData<Stats>('/admin/stats', 10000)
  const analytics = useAdminData<Analytics>(`/admin/analytics?days=${days}`)
  const s = stats.data
  const a = analytics.data

  const pending = s?.jobs.pending_approval ?? 0
  const working = (s?.jobs.queued ?? 0) + (s?.jobs.downloading ?? 0) + (s?.jobs.uploading ?? 0)
  const agent = s?.agent
  const storagePct = s ? (s.songs.storageBytes / s.songs.freeLimitBytes) * 100 : 0

  return (
    <>
      <div className="stats">
        <Stat label="Users" value={s ? `${s.users.count} / ${s.users.max}` : '…'} progress={s ? (s.users.count / s.users.max) * 100 : 0} sub="seats used" />
        <Stat label="Songs" value={s?.songs.count ?? '…'} sub="in the library" />
        <Stat
          label="Storage"
          value={s ? formatBytes(s.songs.storageBytes) : '…'}
          progress={storagePct}
          sub={s ? `of ${formatBytes(s.songs.freeLimitBytes)} free (songs only)` : ''}
        />
        <Stat label="Waiting for you" value={pending} tone={pending ? 'warn' : undefined} sub={<button className="link-btn" onClick={() => goTo('queue')}>Open queue</button>} />
        <Stat label="In the pipeline" value={working} sub="queued or downloading" />
        <Stat
          label="Laptop agent"
          value={!agent ? 'Never seen' : agent.online ? (agent.onHomeWifi ? 'Online' : 'Paused') : 'Offline'}
          tone={!agent ? 'bad' : agent.online && agent.onHomeWifi ? 'ok' : 'warn'}
          sub={agent ? `${agent.online ? (agent.onHomeWifi ? 'working' : 'not on home wifi') : 'last seen ' + timeAgo(agent.lastSeenAt)}${agent.version ? ' · v' + agent.version : ''}` : 'start agent.py on the laptop'}
        />
      </div>

      <div className="panel">
        <div className="panel-head">
          <h2>Listening</h2>
          <div className="seg-small">
            {[7, 30, 90].map((d) => (
              <button key={d} className={days === d ? 'on' : ''} onClick={() => setDays(d)}>
                {d}d
              </button>
            ))}
          </div>
        </div>
        <div className="stats mini">
          <Stat label={`Plays (${days}d)`} value={a?.totals.plays ?? '…'} />
          <Stat label="Minutes listened" value={a?.totals.minutes ?? '…'} />
          <Stat label="Active listeners (7d)" value={a?.totals.activeListeners7d ?? '…'} />
        </div>
        {a && <BarChart data={a.series.map((d) => ({ label: d.day.slice(5), value: d.plays, title: `${d.day}: ${d.plays} plays, ${d.listeners} listeners, ${d.minutes} min` }))} />}
      </div>

      <div className="panel">
        <div className="panel-head">
          <h2>Requests per day</h2>
        </div>
        {a && <BarChart height={90} data={a.series.map((d) => ({ label: d.day.slice(5), value: d.requests, title: `${d.day}: ${d.requests} requests` }))} />}
      </div>

      <div className="two-col">
        <div className="panel">
          <div className="panel-head">
            <h2>Top songs</h2>
          </div>
          {a?.topSongs.length ? (
            <ol className="rank">
              {a.topSongs.map((t) => (
                <li key={t.id}>
                  <span className="truncate">
                    {t.title} <span className="muted">· {t.artist ?? 'Unknown'}</span>
                  </span>
                  <b>{t.plays}</b>
                </li>
              ))}
            </ol>
          ) : (
            <p className="muted">No plays in this period.</p>
          )}
        </div>
        <div className="panel">
          <div className="panel-head">
            <h2>Top listeners</h2>
          </div>
          {a?.topListeners.length ? (
            <ol className="rank">
              {a.topListeners.map((t) => (
                <li key={t.id}>
                  <span className="truncate">{t.name}</span>
                  <b>
                    {t.plays} <span className="muted">· {Math.round(t.seconds / 60)} min</span>
                  </b>
                </li>
              ))}
            </ol>
          ) : (
            <p className="muted">No plays in this period.</p>
          )}
        </div>
      </div>
    </>
  )
}
