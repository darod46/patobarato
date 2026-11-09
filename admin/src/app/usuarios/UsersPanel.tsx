'use client'

import { useEffect, useRef, useState } from 'react'
import { JobStatus } from '../../components/JobStatus'
import { isoToMadridLocal } from '../../lib/dates'
import { enqueueJob, useJob } from '../../lib/jobs'
import { createBrowserSupabase } from '../../lib/supabase/browser'

type AdminUser = { userId: string; email: string; isOwner: boolean; createdAt: string }
type Action = { kind: 'invite'; email: string } | { kind: 'revoke'; email: string }

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function formatDate(iso: string): string {
  const [y, m, d] = isoToMadridLocal(iso).slice(0, 10).split('-')
  return d ? `${d}/${m}/${y}` : ''
}

export function UsersPanel({ currentEmail }: { currentEmail: string }) {
  const [users, setUsers] = useState<AdminUser[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [email, setEmail] = useState('')
  const [emailError, setEmailError] = useState<string | null>(null)
  const [jobId, setJobId] = useState<number | null>(null)
  const [action, setAction] = useState<Action | null>(null)
  const [enqueueError, setEnqueueError] = useState<string | null>(null)
  const client = useRef<ReturnType<typeof createBrowserSupabase> | null>(null)
  const job = useJob(jobId)
  // The bot inserts/deletes the admin_users row; reload once the job is done.
  const doneJobId = job.status === 'done' ? jobId : null
  const busy = jobId !== null && (job.status === null || job.status === 'pending' || job.status === 'running')

  useEffect(() => {
    let cancelled = false
    client.current ??= createBrowserSupabase()
    void (async () => {
      const { data, error } = await client.current!
        .from('admin_users')
        .select('user_id, email, is_owner, created_at')
        .order('created_at', { ascending: true })
      if (cancelled) return
      if (error) {
        setLoadError(error.message)
        return
      }
      setLoadError(null)
      setUsers(
        (data ?? []).map((r) => ({
          userId: r.user_id as string,
          email: r.email as string,
          isOwner: Boolean(r.is_owner),
          createdAt: r.created_at as string,
        })),
      )
    })()
    return () => {
      cancelled = true
    }
  }, [doneJobId])


  async function run(next: Action, type: 'invite_user' | 'revoke_user', payload: Record<string, unknown>) {
    setEnqueueError(null)
    setAction(next)
    try {
      client.current ??= createBrowserSupabase()
      setJobId(await enqueueJob(client.current, type, payload))
    } catch (e) {
      setEnqueueError(e instanceof Error ? e.message : 'No se pudo encolar el trabajo')
    }
  }

  function invite(e: React.FormEvent) {
    e.preventDefault()
    const value = email.trim()
    if (!EMAIL_RE.test(value)) {
      setEmailError('Email no válido')
      return
    }
    setEmailError(null)
    void run({ kind: 'invite', email: value }, 'invite_user', { email: value })
  }

  function revoke(u: AdminUser) {
    if (!window.confirm(`¿Quitar el acceso a ${u.email}?`)) return
    void run({ kind: 'revoke', email: u.email }, 'revoke_user', { user_id: u.userId })
  }

  function retry() {
    if (!action) return
    if (action.kind === 'invite') void run(action, 'invite_user', { email: action.email })
    else {
      const u = users?.find((x) => x.email === action.email)
      if (u) void run(action, 'revoke_user', { user_id: u.userId })
    }
  }

  return (
    <section className="space-y-4">
      <h1 className="text-xl font-semibold">Usuarios</h1>

      <form onSubmit={invite} noValidate className="space-y-2">
        <label className="block text-sm font-medium" htmlFor="invite-email">
          Email
        </label>
        <div className="flex flex-wrap gap-2">
          <input
            id="invite-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="min-h-11 min-w-0 flex-1 rounded-md border border-neutral-300 px-3"
          />
          <button type="submit" disabled={busy} className="min-h-11 rounded-md bg-neutral-900 px-4 text-sm font-medium text-white disabled:opacity-50">
            Invitar
          </button>
        </div>
        {emailError && <p role="alert" className="text-sm text-red-700">{emailError}</p>}
      </form>

      {enqueueError && <p role="alert" className="text-sm text-red-700">{enqueueError}</p>}
      <JobStatus jobId={jobId} onRetry={retry} />
      {job.status === 'done' && action?.kind === 'invite' && <p role="status">Invitación enviada a {action.email}</p>}

      {loadError && <p role="alert" className="text-sm text-red-700">{loadError}</p>}
      {users === null && !loadError && <p role="status">Cargando…</p>}
      <ul className="divide-y divide-neutral-200">
        {users?.map((u) => (
          <li key={u.userId} className="flex min-h-11 flex-wrap items-center justify-between gap-2 py-2">
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium">{u.email}</span>
              <span className="block text-xs text-neutral-600">
                {u.isOwner && <span className="mr-2 font-medium">Propietario</span>}
                <span>{formatDate(u.createdAt)}</span>
              </span>
            </span>
            {u.email !== currentEmail && (
              <button
                type="button"
                disabled={busy}
                onClick={() => revoke(u)}
                className="min-h-11 rounded-md border border-red-700 px-3 text-sm text-red-700 disabled:opacity-50"
              >
                Quitar acceso
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
