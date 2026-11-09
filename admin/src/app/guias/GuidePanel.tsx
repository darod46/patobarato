'use client'

import { useEffect, useRef, useState } from 'react'
import { FaqEditor } from '../../components/FaqEditor'
import { JobStatus } from '../../components/JobStatus'
import { MarkdownField } from '../../components/MarkdownField'
import { WhatsAppActions } from '../../components/WhatsAppActions'
import { getGuide, saveGuide, saveGuideItems, type GuideDetail, type GuideItemInput } from '../../lib/guides'
import { enqueueJob, useJob } from '../../lib/jobs'
import { slugify } from '../../lib/slug'
import { createBrowserSupabase } from '../../lib/supabase/browser'
import { whatsappGuide } from '../../lib/whatsapp'
import { GuideDataFields, type DataFields } from './GuideDataFields'
import { GuideItemsEditor } from './GuideItemsEditor'

const PRIMARY = 'min-h-11 rounded-md bg-neutral-900 px-4 text-sm font-medium text-white disabled:opacity-50'
const SLUG_RE = /^[a-z0-9-]+$/
const REVALIDATE_FAILED = 'Guardado, pero no se pudo actualizar la web. Reinténtalo.'

const TABS = ['Datos', 'Contenido', 'FAQ', 'Productos'] as const
type Tab = (typeof TABS)[number]

type Props = { id: string; onChanged: () => void; onSaved: (id: number) => void }
type Loaded = { id: string; detail: GuideDetail | null }

export function GuidePanel({ id, onChanged, onSaved }: Props) {
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [failed, setFailed] = useState<{ id: string; message: string } | null>(null)
  // The revalidate job lives here, above the keyed form, so switching to the new id after a save keeps it visible.
  const [tracked, setTracked] = useState<{ jobId: number; forId: string } | null>(null)
  const [notice, setNotice] = useState<{ forId: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const handled = useRef<number | null>(null)
  const jobId = tracked?.forId === id ? tracked.jobId : null
  const job = useJob(jobId)
  const jobActive = jobId !== null && (job.status === null || job.status === 'pending' || job.status === 'running')
  const client = useRef<ReturnType<typeof createBrowserSupabase> | null>(null)
  const db = () => (client.current ??= createBrowserSupabase())

  useEffect(() => {
    let cancelled = false
    const c = createBrowserSupabase()
    ;(id === 'new' ? Promise.resolve(null) : getGuide(c, id))
      .then((detail) => {
        if (cancelled) return
        setLoaded({ id, detail })
        setFailed(null)
      })
      .catch((e: unknown) => {
        if (!cancelled) setFailed({ id, message: e instanceof Error ? e.message : 'No se pudo cargar la guía' })
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
      <GuideForm
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
  detail: GuideDetail | null
  disabled: boolean
  setBusy: (b: boolean) => void
  db: () => ReturnType<typeof createBrowserSupabase>
  onSaved: (id: number) => Promise<void>
}

function GuideForm({ detail, disabled, setBusy, db, onSaved }: FormProps) {
  const [tab, setTab] = useState<Tab>('Datos')
  const [data, setData] = useState<DataFields>({
    title: detail?.title ?? '',
    slug: detail?.slug ?? '',
    subtitle: detail?.subtitle ?? '',
    category: detail?.category ?? '',
    author: detail?.author ?? 'el Pato',
    readingMinutes: String(detail?.readingMinutes ?? 5),
    status: detail?.status ?? 'draft',
  })
  const [slugTouched, setSlugTouched] = useState(Boolean(detail))
  const [introMd, setIntroMd] = useState(detail?.introMd ?? '')
  const [howToChooseMd, setHowToChooseMd] = useState(detail?.howToChooseMd ?? '')
  const [faq, setFaq] = useState(detail?.faq ?? [])
  const [items, setItems] = useState<GuideItemInput[]>(detail?.items ?? [])
  const [publishedAt, setPublishedAt] = useState(detail?.publishedAt ?? null)
  // Set once the guide row exists, so a retry after a failed items save updates it instead of inserting again.
  const [guideId, setGuideId] = useState<number | null>(detail?.id ?? null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const patch = (p: Partial<DataFields>) => setData((d) => ({ ...d, ...p }))

  function validate(): string | null {
    if (!data.title.trim() || !data.slug.trim() || !data.category.trim()) return 'Título, slug y categoría son obligatorios'
    if (!SLUG_RE.test(data.slug.trim())) return 'El slug solo puede tener minúsculas, números y guiones'
    const minutes = Number(data.readingMinutes)
    if (!Number.isInteger(minutes) || minutes < 1) return 'Los minutos de lectura deben ser un número entero mayor que 0'
    for (const [i, it] of items.entries()) {
      if (!it.name.trim()) return `El producto ${i + 1} necesita un nombre`
      for (const s of it.stores) {
        if (!s.store.trim() || !s.externalId.trim() || !s.url.trim()) return `Las tiendas del producto ${i + 1} necesitan tienda, ID externo y URL`
      }
    }
    return null
  }

  async function onSave() {
    setError(null)
    const invalid = validate()
    if (invalid) {
      setError(invalid)
      return
    }
    setSaving(true)
    setBusy(true)
    try {
      const savedId = await saveGuide(db(), {
        ...(guideId !== null ? { id: guideId } : {}),
        slug: data.slug.trim(),
        title: data.title.trim(),
        subtitle: data.subtitle.trim(),
        category: data.category.trim(),
        introMd,
        howToChooseMd,
        faq,
        author: data.author.trim(),
        readingMinutes: Number(data.readingMinutes),
        status: data.status,
        publishedAt,
      })
      setGuideId(savedId)
      await saveGuideItems(
        db(),
        savedId,
        items.map((it) => ({ ...it, name: it.name.trim() })),
      )
      if (detail) {
        // Reload so new items and store links get their ids (a second save must update them, not insert them again).
        const fresh = await getGuide(db(), savedId)
        setItems(fresh.items)
        setPublishedAt(fresh.publishedAt)
      }
      await onSaved(savedId)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar la guía')
    } finally {
      setSaving(false)
      setBusy(false)
    }
  }

  const webUrl = process.env.NEXT_PUBLIC_WEB_URL ?? ''
  const text = whatsappGuide({ title: data.title.trim(), subtitle: data.subtitle.trim(), slug: data.slug.trim() }, webUrl)
  const image = items[0]?.imageUrl.trim() || (webUrl ? `${webUrl}/og.png` : null)
  const off = disabled || saving

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">{detail ? 'Editar guía' : 'Nueva guía'}</h2>

      <div role="tablist" aria-label="Secciones" className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`min-h-11 rounded-md border px-4 text-sm ${tab === t ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-300'}`}
          >
            {t}
          </button>
        ))}
      </div>

      <div role="tabpanel" aria-label={tab} className="space-y-3">
        {tab === 'Datos' && (
          <GuideDataFields
            value={data}
            onTitle={(title) => patch({ title, ...(slugTouched ? {} : { slug: slugify(title) }) })}
            onSlug={(slug) => {
              setSlugTouched(true)
              patch({ slug })
            }}
            onChange={patch}
          />
        )}
        {tab === 'Contenido' && (
          <>
            <MarkdownField label="Introducción" value={introMd} onChange={setIntroMd} />
            <MarkdownField label="Cómo elegir" value={howToChooseMd} onChange={setHowToChooseMd} />
          </>
        )}
        {tab === 'FAQ' && <FaqEditor value={faq} onChange={setFaq} />}
        {tab === 'Productos' && (
          <>
            <GuideItemsEditor value={items} onChange={setItems} />
            <p className="text-sm text-neutral-600">Los precios los actualiza el bot en su próxima revisión de precios de guías.</p>
          </>
        )}
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <button type="button" className={PRIMARY} disabled={off} onClick={() => void onSave()}>
          Guardar
        </button>
        {detail?.status === 'published' && (
          <a
            href={`${webUrl}/guias/${detail.slug}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-11 items-center rounded-md border border-neutral-300 px-4 text-sm font-medium"
          >
            Ver en la web
          </a>
        )}
      </div>

      <WhatsAppActions text={text} imageUrl={image} />
    </div>
  )
}
