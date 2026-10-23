import { useState } from 'react'
import { hueFromId } from '../store/library'
import { Cover } from './Cover'

/** YouTube's public thumbnail for a video, with the generated cover as a fallback if it cannot load. */
export function YtThumb({ youtubeId, size = 56 }: { youtubeId: string; size?: number }) {
  const [failed, setFailed] = useState(false)
  if (failed) return <Cover hue={hueFromId(youtubeId)} size={size} className="r8" />
  return (
    <div className="yt-thumb" style={{ width: Math.round((size * 16) / 9), height: size }}>
      <img src={`https://i.ytimg.com/vi/${youtubeId}/mqdefault.jpg`} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
    </div>
  )
}

export function formatEta(sec: number): string {
  const s = Math.max(1, Math.round(sec))
  if (s < 60) return `${s}s`
  if (s < 3600) return `${Math.floor(s / 60)} min${s % 60 ? ` ${s % 60}s` : ''}`
  return `${Math.floor(s / 3600)} h ${Math.floor((s % 3600) / 60)} min`
}

const formatSpeed = (bps: number) => (bps >= 1024 * 1024 ? `${(bps / 1048576).toFixed(1)} MB/s` : `${Math.round(bps / 1024)} KB/s`)

export interface ProgressInfo {
  status: string
  stage: string | null
  progress: number | null
  etaSec: number | null
  speedBps: number | null
  ahead: number | null
  waitSec: number | null
}

const STAGE: Record<string, string> = {
  starting: 'Starting',
  downloading: 'Downloading',
  converting: 'Converting to MP3',
  uploading: 'Uploading to cloud',
  saving: 'Saving',
}

/** A live bar with the stage and a time estimate for jobs in progress, or the queue position for waiting ones. */
export function RequestProgress({ job }: { job: ProgressInfo }) {
  if (job.status === 'queued') {
    const next = (job.ahead ?? 0) === 0
    return (
      <div className="rq-note">
        {next ? 'Next in line' : `${job.ahead} ahead of this`}
        {job.waitSec ? ` · about ${formatEta(job.waitSec)}` : ''}
      </div>
    )
  }
  if (job.status !== 'downloading' && job.status !== 'uploading') return null

  const stage = job.stage ?? 'starting'
  const pct = Math.round((job.progress ?? 0) * 100)
  const indeterminate = stage === 'converting' || stage === 'saving'
  return (
    <div className="rq-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
      <div className={`rq-bar ${indeterminate ? 'busy' : ''}`}>
        <i style={{ width: `${Math.max(3, pct)}%` }} />
      </div>
      <div className="rq-text">
        <span>
          {STAGE[stage] ?? stage} · {pct}%
        </span>
        <span>
          {job.etaSec != null && !indeterminate ? `about ${formatEta(job.etaSec)} left` : ''}
          {job.speedBps && stage === 'downloading' ? ` · ${formatSpeed(job.speedBps)}` : ''}
        </span>
      </div>
    </div>
  )
}
