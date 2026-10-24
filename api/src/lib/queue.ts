import { memo } from '../util'

export interface QueueInfo {
  /** job id -> number of jobs that will be processed before it (including the one running now) */
  ahead: Map<string, number>
  /** Average seconds one job takes, from recent finished jobs (a sensible default when there is no history). */
  avgSec: number
}

/** Where each waiting job stands, so the UI can say "2 ahead, about 1.5 min". */
export async function queueInfo(db: D1Database): Promise<QueueInfo> {
  const [queued, running, avg] = await Promise.all([
    db.prepare("SELECT id FROM download_jobs WHERE status = 'queued' ORDER BY created_at").all<{ id: string }>(),
    db.prepare("SELECT COUNT(*) AS n FROM download_jobs WHERE status IN ('downloading', 'uploading')").first<{ n: number }>(),
    memo('queue-avg', 60000, () =>
      db
        .prepare(
          `SELECT AVG(strftime('%s', updated_at) - strftime('%s', claimed_at)) AS sec FROM
             (SELECT updated_at, claimed_at FROM download_jobs WHERE status = 'done' AND claimed_at IS NOT NULL ORDER BY updated_at DESC LIMIT 20)`,
        )
        .first<{ sec: number | null }>(),
      { shared: true },
    ),
  ])
  const base = running?.n ?? 0
  return {
    ahead: new Map(queued.results.map((r, i) => [r.id, base + i])),
    avgSec: Math.max(10, Math.round(avg?.sec ?? 45)),
  }
}
