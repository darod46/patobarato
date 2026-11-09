'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { JobStatus } from '../../components/JobStatus'
import { WhatsAppActions } from '../../components/WhatsAppActions'
import { enqueueJob, useJob, type JobType } from '../../lib/jobs'
import { parseMoney } from '../../lib/money'
import {
  getOffer,
  recentTelegramPublication,
  saveOffer,
  setOfferStatus,
  type OfferDetail,
  type OfferPatch,
} from '../../lib/offers'
import { storeName } from '../../lib/stores'
import { createBrowserSupabase } from '../../lib/supabase/browser'
import { cleanHashtags, telegramCaption, type PostInput } from '../../lib/telegram-format'
import { whatsappOffer } from '../../lib/whatsapp'

const BTN = 'min-h-11 rounded-md border border-neutral-300 px-4 text-sm font-medium hover:bg-neutral-100 disabled:opacity-50'
const PRIMARY = 'min-h-11 rounded-md bg-neutral-900 px-4 text-sm font-medium text-white disabled:opacity-50'
const INPUT = 'mt-1 min-h-11 w-full rounded-md border border-neutral-300 px-3'

const madridDate = new Intl.DateTimeFormat('es-ES', {
  timeZone: 'Europe/Madrid',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
})

function parseHashtags(text: string): string[] {
  const tags = cleanHashtags(text.split(/[\s,]+/).map((t) => t.replace(/^#+/, '')))
  return [...new Set(tags)]
}

function stateLine(d: OfferDetail): string {
  if (d.status === 'draft') return 'Borrador'
  const base = d.channel === 'web' ? 'Solo web' : 'Telegram ✔'
  return d.status === 'ended' ? `${base} · Terminada` : base
}

function daysAgoText(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
  if (days <= 0) return 'hoy'
  return days === 1 ? 'hace 1 día' : `hace ${days} días`
}

type Props = { id: string; onChanged: () => void }

export function OfferPanel({ id, onChanged }: Props) {
  const [loaded, setLoaded] = useState<{ id: string; detail: OfferDetail } | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const clientRef = useRef<ReturnType<typeof createBrowserSupabase> | null>(null)

  const load = useCallback(async () => {
    clientRef.current ??= createBrowserSupabase()
    try {
      const detail = await getOffer(clientRef.current, id)
      setLoaded({ id, detail })
      setLoadError(null)
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'No se pudo cargar la oferta')
    }
  }, [id])

  useEffect(() => {
    // oxlint-disable-next-line react-hooks/set-state-in-effect -- loads the panel data when the id changes
    void load()
  }, [load])

  if (loadError) return <p role="alert">{loadError}</p>
  if (!loaded || loaded.id !== id) return <p role="status">Cargando…</p>
  return (
    <OfferForm
      key={id}
      detail={loaded.detail}
      onRefresh={async () => {
        await load()
        onChanged()
      }}
    />
  )
}

function OfferForm({ detail, onRefresh }: { detail: OfferDetail; onRefresh: () => Promise<void> }) {
  const [title, setTitle] = useState(detail.title)
  const [price, setPrice] = useState(String(detail.price).replace('.', ','))
  const [previous, setPrevious] = useState(detail.previousPrice === null ? '' : String(detail.previousPrice).replace('.', ','))
  const [coupon, setCoupon] = useState(detail.coupon ?? '')
  const [beforeCoupon, setBeforeCoupon] = useState(detail.priceBeforeCoupon)
  const [hashtags, setHashtags] = useState(detail.hashtags.join(' '))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [jobId, setJobId] = useState<number | null>(null)
  const lastJob = useRef<{ type: JobType; payload: Record<string, unknown> } | null>(null)
  const handled = useRef<number | null>(null)
  const job = useJob(jobId)
  const client = useRef<ReturnType<typeof createBrowserSupabase> | null>(null)
  const db = () => (client.current ??= createBrowserSupabase())

  useEffect(() => {
    if (jobId === null || job.status !== 'done' || handled.current === jobId) return
    handled.current = jobId
    void onRefresh()
  }, [jobId, job.status, onRefresh])

  const priceNum = parseMoney(price)
  const previousNum = parseMoney(previous)
  const draft = detail.status === 'draft'
  const syncsTelegram = detail.channel === 'telegram' && detail.messageId !== null
  const payload = { publication_id: detail.id }

  const input: PostInput = {
    title,
    price: priceNum ?? 0,
    previousPrice: previousNum !== null && priceNum !== null && previousNum > priceNum ? previousNum : null,
    coupon: coupon.trim() || null,
    hashtags: parseHashtags(hashtags),
    link: detail.affiliateUrl,
    storeName: storeName(detail.store),
    priceBeforeCoupon: beforeCoupon,
    ended: detail.status === 'ended',
  }

  function validate(): OfferPatch | null {
    if (!title.trim()) return fail('El título no puede estar vacío')
    if (priceNum === null || priceNum <= 0) return fail('El precio debe ser mayor que 0')
    if (previous.trim() && previousNum === null) return fail('El precio anterior no es un número válido')
    if (previousNum !== null && previousNum <= priceNum) return fail('El precio anterior debe ser mayor que el precio')
    return {
      title: title.trim(),
      price: priceNum,
      previousPrice: previousNum,
      coupon: coupon.trim() || null,
      priceBeforeCoupon: beforeCoupon,
      hashtags: parseHashtags(hashtags),
    }
  }
  function fail(message: string): null {
    setError(message)
    return null
  }

  async function enqueue(type: JobType, p: Record<string, unknown>) {
    lastJob.current = { type, payload: p }
    setJobId(await enqueueJob(db(), type, p))
  }

  async function run(action: () => Promise<void>) {
    setError(null)
    setBusy(true)
    try {
      await action()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Algo ha fallado')
    } finally {
      setBusy(false)
    }
  }

  const syncJob = () => (syncsTelegram ? enqueue('sync_post', payload) : enqueue('revalidate', {}))

  const onSave = () =>
    run(async () => {
      const patch = validate()
      if (!patch) return
      await saveOffer(db(), detail.id, patch)
      await syncJob()
    })

  const onToggleEnded = (next: 'ended' | 'active') =>
    run(async () => {
      if (next === 'ended' && !window.confirm('¿Terminar esta oferta? El post de Telegram quedará marcado como terminado.')) return
      await setOfferStatus(db(), detail.id, next)
      await syncJob()
    })

  const onPublish = () =>
    run(async () => {
      const patch = validate()
      if (!patch) return
      await saveOffer(db(), detail.id, patch)
      const recent = await recentTelegramPublication(db(), detail.productId)
      if (recent && !window.confirm(`Ya se publicó ${daysAgoText(recent)}. ¿Publicar de todas formas?`)) return
      await enqueue('publish_draft', payload)
    })

  const imageUrl = detail.imageUrl ? `/api/imagen?url=${encodeURIComponent(detail.imageUrl)}` : null

  return (
    <div className="space-y-4">
      <p className="text-sm font-semibold">{stateLine(detail)}</p>
      {draft && detail.botPublishedAt && (
        <p role="note" className="rounded-md bg-amber-100 p-3 text-sm">
          El bot ya la publicó {madridDate.format(new Date(detail.botPublishedAt))}
        </p>
      )}

      <div className="space-y-3">
        <label className="block text-sm font-medium">
          Título
          <input value={title} onChange={(e) => setTitle(e.target.value)} className={INPUT} />
        </label>
        <label className="block text-sm font-medium">
          Precio (€)
          <input inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} className={INPUT} />
        </label>
        <label className="block text-sm font-medium">
          Precio anterior (€)
          <input inputMode="decimal" value={previous} onChange={(e) => setPrevious(e.target.value)} className={INPUT} />
        </label>
        <label className="block text-sm font-medium">
          Cupón
          <input value={coupon} onChange={(e) => setCoupon(e.target.value)} className={INPUT} />
        </label>
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input type="checkbox" checked={beforeCoupon} onChange={(e) => setBeforeCoupon(e.target.checked)} className="size-5" />
          El precio es sin aplicar el cupón
        </label>
        <label className="block text-sm font-medium">
          Hashtags
          <input value={hashtags} onChange={(e) => setHashtags(e.target.value)} className={INPUT} />
        </label>
      </div>

      <section>
        <h3 className="text-sm font-semibold">Vista previa de Telegram</h3>
        {priceNum === null || priceNum <= 0 ? (
          <p className="text-sm text-neutral-600">Escribe un precio válido para ver la vista previa.</p>
        ) : (
          <div
            data-testid="preview"
            className="mt-1 whitespace-pre-wrap break-words rounded-md bg-neutral-100 p-3 text-sm"
            // The caption escapes all user text; only <b>, <s> and <code> are markup.
            dangerouslySetInnerHTML={{ __html: telegramCaption(input) }}
          />
        )}
      </section>

      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {draft ? (
          <>
            <button type="button" className={BTN} disabled={busy} onClick={onSave}>
              Guardar
            </button>
            <button type="button" className={PRIMARY} disabled={busy} onClick={onPublish}>
              Publicar en Telegram
            </button>
          </>
        ) : (
          <>
            <button type="button" className={PRIMARY} disabled={busy} onClick={onSave}>
              {syncsTelegram ? 'Guardar y actualizar Telegram' : 'Guardar'}
            </button>
            {detail.status === 'ended' ? (
              <button type="button" className={BTN} disabled={busy} onClick={() => onToggleEnded('active')}>
                Reactivar
              </button>
            ) : (
              <button type="button" className={BTN} disabled={busy} onClick={() => onToggleEnded('ended')}>
                Terminar oferta
              </button>
            )}
          </>
        )}
      </div>

      <JobStatus
        jobId={jobId}
        onRetry={() => {
          const last = lastJob.current
          if (last) void run(() => enqueue(last.type, last.payload))
        }}
      />

      <WhatsAppActions text={whatsappOffer(input)} imageUrl={imageUrl} />
    </div>
  )
}
