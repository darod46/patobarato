'use client'

import { useEffect, useRef, useState, type FormEvent } from 'react'
import { enqueueJob, useJob } from '../../lib/jobs'
import { createBrowserSupabase } from '../../lib/supabase/browser'

type Props = { onCreated: (publicationId: string) => void; onClose: () => void }

export function NewOfferDialog({ onCreated, onClose }: Props) {
  const [url, setUrl] = useState('')
  const [jobId, setJobId] = useState<number | null>(null)
  const [enqueueError, setEnqueueError] = useState<string | null>(null)
  const { status, error, result } = useJob(jobId)
  const handled = useRef<number | null>(null)

  useEffect(() => {
    if (jobId === null || status !== 'done' || handled.current === jobId) return
    const publicationId = result?.publication_id
    if (publicationId === undefined || publicationId === null) return
    handled.current = jobId
    onCreated(String(publicationId))
  }, [jobId, status, result, onCreated])

  const pending = jobId !== null && status !== 'error' && status !== 'done'

  async function submit(e: FormEvent) {
    e.preventDefault()
    setEnqueueError(null)
    setJobId(null)
    try {
      setJobId(await enqueueJob(createBrowserSupabase(), 'create_offer_from_url', { url: url.trim() }))
    } catch (err) {
      setEnqueueError(err instanceof Error ? err.message : 'No se pudo encolar el trabajo')
    }
  }

  const message = enqueueError ?? (status === 'error' ? (error ?? 'Error desconocido') : null)

  return (
    <div role="dialog" aria-modal="true" aria-label="Nueva oferta desde enlace" className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
      <form onSubmit={submit} className="w-full max-w-md space-y-3 rounded-lg bg-white p-4 shadow-lg">
        <h2 className="text-lg font-semibold">Nueva oferta desde enlace</h2>
        <label className="block text-sm font-medium">
          Enlace del producto
          <input
            type="url"
            required
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="mt-1 min-h-11 w-full rounded-md border border-neutral-300 px-3"
          />
        </label>
        {pending && <p role="status">Creando borrador…</p>}
        {message && (
          <p role="alert" className="text-sm text-red-700">
            {message}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="min-h-11 rounded-md border border-neutral-300 px-4 text-sm">
            Cancelar
          </button>
          <button type="submit" disabled={pending} className="min-h-11 rounded-md bg-neutral-900 px-4 text-sm font-medium text-white disabled:opacity-50">
            Crear borrador
          </button>
        </div>
      </form>
    </div>
  )
}
