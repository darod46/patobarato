'use client'

import { useEffect, useRef, useState } from 'react'
import { FaqEditor } from '../../components/FaqEditor'
import { JobStatus } from '../../components/JobStatus'
import { MarkdownField } from '../../components/MarkdownField'
import { StringListEditor } from '../../components/StringListEditor'
import { WhatsAppActions } from '../../components/WhatsAppActions'
import { getEvent, saveEvent, type EventDetail, type EventStatus } from '../../lib/events'
import { enqueueJob, useJob } from '../../lib/jobs'
import { slugify } from '../../lib/slug'
import { STORE_IDS } from '../../lib/stores'
import { createBrowserSupabase } from '../../lib/supabase/browser'
import { whatsappEvent } from '../../lib/whatsapp'

const PRIMARY = 'min-h-11 rounded-md bg-neutral-900 px-4 text-sm font-medium text-white disabled:opacity-50'
const SECONDARY = 'min-h-11 rounded-md border border-neutral-300 px-4 text-sm font-medium disabled:opacity-50'
const INPUT = 'mt-1 min-h-11 w-full rounded-md border border-neutral-300 px-3'
const SLUG_RE = /^[a-z0-9-]+$/
const REVALIDATE_FAILED = 'Guardado, pero no se pudo actualizar la web. Reinténtalo.'

type Props = { id: string; onChanged: () => void; onSaved: (id: number) => void }
type Loaded = { id: string; detail: EventDetail | null }

export function EventPanel({ id, onChanged, onSaved }: Props) {
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [failed, setFailed] = useState<{ id: string; message: string } | null>(null)
  // The revalidate job lives here, above the keyed form, so switching to the new id after a save keeps it visible.
  const [tracked, setTracked] = useState<{ jobId: number; forId: string } | null>(null)
  const [busy, setBusy] = useState(false)
  // Held here too: a save of a new event switches the id and remounts the form, which would lose the message.
  const [notice, setNotice] = useState<{ forId: string } | null>(null)
  const handled = useRef<number | null>(null)
  const jobId = tracked?.forId === id ? tracked.jobId : null
  const job = useJob(jobId)
  const jobActive = jobId !== null && (job.status === null || job.status === 'pending' || job.status === 'running')
  const client = useRef<ReturnType<typeof createBrowserSupabase> | null>(null)
  const db = () => (client.current ??= createBrowserSupabase())

  useEffect(() => {
    let cancelled = false
    const c = createBrowserSupabase()
    ;(id === 'new' ? Promise.resolve(null) : getEvent(c, id))
      .then((detail) => {
        if (cancelled) return
        setLoaded({ id, detail })
        setFailed(null)
      })
      .catch((e: unknown) => {
        if (!cancelled) setFailed({ id, message: e instanceof Error ? e.message : 'No se pudo cargar el evento' })
      })
    return () => {
      cancelled = true
    }
  }, [id])

  useEffect(() => {
    if (jobId === null || job.status !== 'done' || handled.current === jobId) return
    handled.current = jobId
    onChanged()
  }, [jobId, job.status, onChanged])

  async function revalidate(forId: string) {
    setTracked({ jobId: await enqueueJob(db(), 'revalidate', {}), forId })
  }

  if (failed?.id === id) return <p role="alert">{failed.message}</p>
  if (!loaded || loaded.id !== id) return <p role="status">Cargando…</p>
  return (
    <div className="space-y-4">
      <EventForm
        key={id}
        detail={loaded.detail}
        disabled={busy || jobActive}
        setBusy={(b) => {
          if (b) setNotice(null)
          setBusy(b)
        }}
        db={db}
        onSaved={async (savedId) => {
          try {
            await revalidate(String(savedId))
          } catch {
            // The save itself succeeded: only the web refresh failed.
            setNotice({ forId: String(savedId) })
          } finally {
            onChanged()
            if (!loaded.detail) onSaved(savedId)
          }
        }}
      />
      {notice?.forId === id && (
        <p role="alert" className="text-sm text-red-700">
          {REVALIDATE_FAILED}
        </p>
      )}
      <JobStatus
        jobId={jobId}
        onRetry={() => {
          setBusy(true)
          revalidate(id)
            .catch(() => {})
            .finally(() => setBusy(false))
        }}
      />
    </div>
  )
}

type FormProps = {
  detail: EventDetail | null
  disabled: boolean
  setBusy: (b: boolean) => void
  db: () => ReturnType<typeof createBrowserSupabase>
  onSaved: (id: number) => Promise<void>
}

function EventForm({ detail, disabled, setBusy, db, onSaved }: FormProps) {
  const [name, setName] = useState(detail?.name ?? '')
  const [slug, setSlug] = useState(detail?.slug ?? '')
  const [slugTouched, setSlugTouched] = useState(Boolean(detail))
  const [stores, setStores] = useState(detail?.stores ?? [])
  const [startsOn, setStartsOn] = useState(detail?.startsOn ?? '')
  const [endsOn, setEndsOn] = useState(detail?.endsOn ?? '')
  const [approximate, setApproximate] = useState(detail?.approximate ?? false)
  const [hashtags, setHashtags] = useState(detail?.hashtags ?? [])
  const [aliexpressPromo, setAliexpressPromo] = useState(detail?.aliexpressPromo ?? '')
  const [introMd, setIntroMd] = useState(detail?.introMd ?? '')
  const [tipsMd, setTipsMd] = useState(detail?.tipsMd ?? '')
  const [faq, setFaq] = useState(detail?.faq ?? [])
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function onSave(status: EventStatus) {
    setError(null)
    const s = slug.trim()
    if (!name.trim() || !s || !startsOn || !endsOn) {
      setError('Nombre, slug y fechas son obligatorios')
      return
    }
    if (!SLUG_RE.test(s)) {
      setError('El slug solo puede tener minúsculas, números y guiones')
      return
    }
    if (endsOn < startsOn) {
      setError('La fecha de fin debe ser igual o posterior al inicio')
      return
    }
    setSaving(true)
    setBusy(true)
    try {
      const savedId = await saveEvent(db(), {
        ...(detail ? { id: detail.id } : {}),
        slug: s,
        name: name.trim(),
        stores,
        startsOn,
        endsOn,
        approximate,
        hashtags,
        aliexpressPromo: aliexpressPromo.trim() || null,
        introMd,
        tipsMd,
        faq,
        status,
      })
      await onSaved(savedId)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar el evento')
    } finally {
      setSaving(false)
      setBusy(false)
    }
  }

  const webUrl = process.env.NEXT_PUBLIC_WEB_URL ?? ''
  const text = whatsappEvent({ name: name.trim(), introMd, slug: slug.trim() }, webUrl)
  const off = disabled || saving

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">{detail ? 'Editar evento' : 'Nuevo evento'}</h2>

      <div className="space-y-3">
        <label className="block text-sm font-medium">
          Nombre
          <input
            value={name}
            onChange={(e) => {
              setName(e.target.value)
              if (!slugTouched) setSlug(slugify(e.target.value))
            }}
            className={INPUT}
          />
        </label>
        <label className="block text-sm font-medium">
          Slug
          <input
            value={slug}
            onChange={(e) => {
              setSlug(e.target.value)
              setSlugTouched(true)
            }}
            className={INPUT}
          />
        </label>
        <label className="block text-sm font-medium">
          Empieza
          <input type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} className={INPUT} />
        </label>
        <label className="block text-sm font-medium">
          Termina
          <input type="date" value={endsOn} onChange={(e) => setEndsOn(e.target.value)} className={INPUT} />
        </label>
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input type="checkbox" checked={approximate} onChange={(e) => setApproximate(e.target.checked)} className="size-5" />
          Fechas aproximadas
        </label>
        <StringListEditor label="Tiendas" value={stores} onChange={setStores} suggestions={STORE_IDS} />
        <StringListEditor label="Hashtags" value={hashtags} onChange={setHashtags} stripHash />
        <label className="block text-sm font-medium">
          Promo de AliExpress
          <input value={aliexpressPromo} onChange={(e) => setAliexpressPromo(e.target.value)} className={INPUT} />
        </label>
        <MarkdownField label="Introducción" value={introMd} onChange={setIntroMd} />
        <MarkdownField label="Consejos" value={tipsMd} onChange={setTipsMd} />
        <FaqEditor value={faq} onChange={setFaq} />
      </div>

      {detail && (
        <p className="text-sm text-neutral-600">
          {detail.promoCount} ofertas sincronizadas
          {detail.lastSyncedAt ? ` · última sincronización ${detail.lastSyncedAt.slice(0, 16).replace('T', ' ')} UTC` : ''}
        </p>
      )}

      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <button type="button" className={SECONDARY} disabled={off} onClick={() => void onSave('draft')}>
          Guardar borrador
        </button>
        <button type="button" className={PRIMARY} disabled={off} onClick={() => void onSave('published')}>
          Publicar
        </button>
        {detail?.status === 'published' && (
          <a
            href={`${webUrl}/eventos/${detail.slug}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-11 items-center rounded-md border border-neutral-300 px-4 text-sm font-medium"
          >
            Ver en la web
          </a>
        )}
      </div>

      <WhatsAppActions text={text} imageUrl={webUrl ? `${webUrl}/og.png` : null} />
    </div>
  )
}
