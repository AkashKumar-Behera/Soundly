import { useCallback, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { api } from '../../api/client'

export function formatBytes(n: number): string {
  if (!n) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(1024)))
  const v = n / 1024 ** i
  return `${v >= 100 || i === 0 ? v.toFixed(0) : v.toFixed(1)} ${units[i]}`
}

/** "2026-10-23 01:08:02" (UTC, from SQLite) to a short relative time. */
export function timeAgo(sql: string | null | undefined): string {
  if (!sql) return 'never'
  const t = new Date(sql.replace(' ', 'T') + 'Z').getTime()
  const s = Math.max(0, Math.round((Date.now() - t) / 1000))
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)} min ago`
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`
  if (s < 86400 * 30) return `${Math.floor(s / 86400)} d ago`
  return new Date(t).toLocaleDateString()
}

/** Loads an admin endpoint and exposes `reload`; a stale response never overwrites a newer one. */
export function useAdminData<T>(path: string, pollMs = 0) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    try {
      setData(await api<T>(path))
      setError(null)
    } catch (e) {
      setError((e as { code?: string }).code ?? 'error')
    }
  }, [path])

  useEffect(() => {
    let live = true
    void api<T>(path)
      .then((d) => {
        if (live) {
          setData(d)
          setError(null)
        }
      })
      .catch((e) => live && setError((e as { code?: string }).code ?? 'error'))
    const timer = pollMs ? setInterval(() => !document.hidden && void reload(), Math.max(pollMs * 2.5, 4000)) : undefined
    return () => {
      live = false
      if (timer) clearInterval(timer)
    }
  }, [path, pollMs, reload])

  return { data, error, reload }
}

export function Stat({ label, value, sub, progress, tone }: { label: string; value: ReactNode; sub?: ReactNode; progress?: number; tone?: 'ok' | 'warn' | 'bad' }) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className={`stat-value ${tone ?? ''}`}>{value}</div>
      {progress !== undefined && (
        <div className="meter" aria-hidden="true">
          <i style={{ width: `${Math.min(100, Math.max(0, progress))}%` }} className={progress > 85 ? 'bad' : progress > 65 ? 'warn' : ''} />
        </div>
      )}
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  )
}

export interface Bar {
  label: string
  value: number
  title: string
}

/** Small dependency-free bar chart. */
export function BarChart({ data, height = 150 }: { data: Bar[]; height?: number }) {
  const max = Math.max(1, ...data.map((d) => d.value))
  const w = 100
  const gap = 0.6
  const bw = w / data.length - gap
  return (
    <div className="chart">
      <svg viewBox={`0 0 ${w} ${height / 3}`} preserveAspectRatio="none" role="img" aria-label="Bar chart" style={{ height }}>
        {data.map((d, i) => {
          const h = (d.value / max) * (height / 3 - 2)
          return (
            <rect key={d.label} x={i * (bw + gap)} y={height / 3 - h} width={Math.max(bw, 0.4)} height={Math.max(h, d.value ? 0.6 : 0.25)} rx="0.6" className={d.value ? 'bar' : 'bar zero'}>
              <title>{d.title}</title>
            </rect>
          )
        })}
      </svg>
      <div className="chart-axis">
        <span>{data[0]?.label}</span>
        <span>peak {max}</span>
        <span>{data[data.length - 1]?.label}</span>
      </div>
    </div>
  )
}

export function ConfirmDialog({
  title,
  body,
  confirmLabel,
  danger,
  onConfirm,
  onCancel,
}: {
  title: string
  body: ReactNode
  confirmLabel: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCancel()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  return (
    <div className="modal-back" onClick={onCancel}>
      <div className="modal" role="alertdialog" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <h3>{title}</h3>
        <div className="modal-body">{body}</div>
        <div className="modal-actions">
          <button className="btn-pill" onClick={onCancel}>
            Cancel
          </button>
          <button className={`btn-pill ${danger ? 'danger' : 'primary'}`} onClick={onConfirm} autoFocus>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

export const EMPTY = <p className="muted empty">Nothing here yet.</p>
