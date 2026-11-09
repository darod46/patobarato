'use client'

import type { SupabaseClient } from '@supabase/supabase-js'
import { useEffect, useRef, useState } from 'react'
import { createBrowserSupabase } from './supabase/browser'

export type JobType =
  | 'create_offer_from_url'
  | 'publish_draft'
  | 'sync_post'
  | 'invite_user'
  | 'revoke_user'
  | 'revalidate'

export type JobStatusValue = 'pending' | 'running' | 'done' | 'error'

const POLL_MS = 2000
const STUCK_MS = 60_000

/** Queues a job for the bot (RLS lets admins insert) and returns its id. */
export async function enqueueJob(
  client: SupabaseClient,
  type: JobType,
  payload: Record<string, unknown>,
): Promise<number> {
  const { data, error } = await client.from('admin_jobs').insert({ type, payload }).select('id').single()
  if (error || !data) throw new Error(error?.message ?? 'No se pudo encolar el trabajo')
  return data.id as number
}

type JobState = {
  status: JobStatusValue | null
  error: string | null
  // oxlint-disable-next-line no-explicit-any
  result: any
  stuck: boolean
}

const EMPTY: JobState = { status: null, error: null, result: null, stuck: false }

/** Polls the job every 2 s until it is done or failed. `stuck`: still pending 60 s after creation. */
export function useJob(jobId: number | null): JobState {
  const [tracked, setTracked] = useState<{ jobId: number; state: JobState } | null>(null)
  const clientRef = useRef<SupabaseClient | null>(null)

  useEffect(() => {
    if (jobId === null) return
    const id: number = jobId
    clientRef.current ??= createBrowserSupabase()
    const client = clientRef.current
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined

    async function poll() {
      let finished = false
      try {
        const { data } = await client.from('admin_jobs').select('status, error, result, created_at').eq('id', id).single()
        if (cancelled) return
        if (data) {
          const status = data.status as JobStatusValue
          const createdAt = data.created_at ? new Date(data.created_at as string).getTime() : Date.now()
          setTracked({
            jobId: id,
            state: {
              status,
              error: (data.error as string | null) ?? null,
              result: data.result ?? null,
              stuck: status === 'pending' && Date.now() - createdAt >= STUCK_MS,
            },
          })
          finished = status === 'done' || status === 'error'
        }
      } catch {
        // Transient network error: keep polling.
      }
      if (cancelled || finished) return
      timer = setTimeout(poll, POLL_MS)
    }

    void poll()
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [jobId])

  // The state of a previous job id is never shown for the current one.
  return tracked && tracked.jobId === jobId ? tracked.state : EMPTY
}
