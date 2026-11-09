'use client'

import { useJob } from '../lib/jobs'

export function JobStatus({ jobId, onRetry }: { jobId: number | null; onRetry: () => void }) {
  const { status, error, stuck } = useJob(jobId)
  if (jobId === null || status === null) return null

  if (status === 'done') return <p role="status">Hecho</p>

  if (status === 'error') {
    return (
      <div role="alert">
        <p>Error: {error}</p>
        <button type="button" onClick={onRetry}>
          Reintentar
        </button>
      </div>
    )
  }

  return (
    <div role="status">
      <p>Enviando…</p>
      {stuck && <p>El bot no responde</p>}
    </div>
  )
}
