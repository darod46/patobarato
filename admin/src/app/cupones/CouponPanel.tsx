'use client'

import { useEffect, useRef, useState } from 'react'
import { JobStatus } from '../../components/JobStatus'
import { WhatsAppActions } from '../../components/WhatsAppActions'
import { getCoupon, listEvents, saveCoupon, type CouponDetail, type EventOption } from '../../lib/coupons'
import { isoToMadridLocal, madridLocalToIso } from '../../lib/dates'
import { enqueueJob, useJob } from '../../lib/jobs'
import { parseMoney } from '../../lib/money'
import { STORE_IDS, storeName } from '../../lib/stores'
import { createBrowserSupabase } from '../../lib/supabase/browser'
import { whatsappCoupon } from '../../lib/whatsapp'

const PRIMARY = 'min-h-11 rounded-md bg-neutral-900 px-4 text-sm font-medium text-white disabled:opacity-50'
const INPUT = 'mt-1 min-h-11 w-full rounded-md border border-neutral-300 px-3'

const moneyText = (n: number | null) => (n === null ? '' : String(n).replace('.', ','))

type Props = { id: string; onChanged: () => void; onSaved: (id: number) => void }
type Loaded = { id: string; detail: CouponDetail | null; events: EventOption[] }

export function CouponPanel({ id, onChanged, onSaved }: Props) {
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [failed, setFailed] = useState<{ id: string; message: string } | null>(null)

  useEffect(() => {
    let cancelled = false
    const client = createBrowserSupabase()
    Promise.all([id === 'new' ? Promise.resolve(null) : getCoupon(client, id), listEvents(client).catch(() => [])])
      .then(([detail, events]) => {
        if (cancelled) return
        setLoaded({ id, detail, events })
        setFailed(null)
      })
      .catch((e: unknown) => {
        if (!cancelled) setFailed({ id, message: e instanceof Error ? e.message : 'No se pudo cargar el cupón' })
      })
    return () => {
      cancelled = true
    }
  }, [id])

  if (failed?.id === id) return <p role="alert">{failed.message}</p>
  if (!loaded || loaded.id !== id) return <p role="status">Cargando…</p>
  return <CouponForm key={id} detail={loaded.detail} events={loaded.events} onChanged={onChanged} onSaved={onSaved} />
}

type FormProps = {
  detail: CouponDetail | null
  events: EventOption[]
  onChanged: () => void
  onSaved: (id: number) => void
}

function CouponForm({ detail, events, onChanged, onSaved }: FormProps) {
  const [store, setStore] = useState(detail?.store ?? '')
  const [code, setCode] = useState(detail?.code ?? '')
  const [title, setTitle] = useState(detail?.title ?? '')
  const [conditions, setConditions] = useState(detail?.conditions ?? '')
  const [url, setUrl] = useState(detail?.url ?? '')
  const [startsAt, setStartsAt] = useState(isoToMadridLocal(detail?.startsAt))
  const [expiresAt, setExpiresAt] = useState(isoToMadridLocal(detail?.expiresAt))
  const [active, setActive] = useState(detail?.active ?? true)
  const [discountAmount, setDiscountAmount] = useState(moneyText(detail?.discountAmount ?? null))
  const [discountPct, setDiscountPct] = useState(moneyText(detail?.discountPct ?? null))
  const [minPurchase, setMinPurchase] = useState(moneyText(detail?.minPurchase ?? null))
  const [eventId, setEventId] = useState(detail?.eventId === null || detail?.eventId === undefined ? '' : String(detail.eventId))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [jobId, setJobId] = useState<number | null>(null)
  const handled = useRef<number | null>(null)
  const job = useJob(jobId)
  const client = useRef<ReturnType<typeof createBrowserSupabase> | null>(null)
  const db = () => (client.current ??= createBrowserSupabase())

  const jobActive = jobId !== null && (job.status === null || job.status === 'pending' || job.status === 'running')
  const disabled = busy || jobActive

  useEffect(() => {
    if (jobId === null || job.status !== 'done' || handled.current === jobId) return
    handled.current = jobId
    onChanged()
  }, [jobId, job.status, onChanged])

  function parseOptional(text: string, label: string): number | null | undefined {
    if (!text.trim()) return null
    const n = parseMoney(text)
    if (n === null) {
      setError(`${label} no es un número válido`)
      return undefined
    }
    return n
  }

  async function onSave() {
    setError(null)
    if (!store.trim() || !code.trim() || !title.trim()) {
      setError('Tienda, código y título son obligatorios')
      return
    }
    const starts = startsAt ? madridLocalToIso(startsAt) : null
    const expires = expiresAt ? madridLocalToIso(expiresAt) : null
    if ((startsAt && !starts) || (expiresAt && !expires)) {
      setError('Fecha no válida')
      return
    }
    if (starts && expires && new Date(expires) <= new Date(starts)) {
      setError('La fecha de caducidad debe ser posterior al inicio')
      return
    }
    const amount = parseOptional(discountAmount, 'El descuento en €')
    const pct = parseOptional(discountPct, 'El descuento en %')
    const min = parseOptional(minPurchase, 'La compra mínima')
    if (amount === undefined || pct === undefined || min === undefined) return

    setBusy(true)
    try {
      const savedId = await saveCoupon(db(), {
        ...(detail ? { id: detail.id } : {}),
        store: store.trim(),
        code: code.trim(),
        title: title.trim(),
        conditions: conditions.trim() || null,
        url: url.trim() || null,
        startsAt: starts,
        expiresAt: expires,
        active,
        discountAmount: amount,
        discountPct: pct,
        minPurchase: min,
        eventId: eventId ? Number(eventId) : null,
      })
      setJobId(await enqueueJob(db(), 'revalidate', {}))
      onChanged()
      if (!detail) onSaved(savedId)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar el cupón')
    } finally {
      setBusy(false)
    }
  }

  const webUrl = process.env.NEXT_PUBLIC_WEB_URL
  const text = whatsappCoupon({
    store,
    title: title.trim(),
    code: code.trim(),
    conditions: conditions.trim() || null,
    expiresAt: expiresAt ? madridLocalToIso(expiresAt) : null,
    url: url.trim(),
  })

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">{detail ? 'Editar cupón' : 'Nuevo cupón'}</h2>
      {detail?.sourceId !== null && detail?.sourceId !== undefined && (
        <p role="note" className="rounded-md bg-amber-100 p-3 text-sm">
          Este cupón lo sincroniza el bot: la próxima sincronización puede sobrescribir tus cambios.
        </p>
      )}

      <div className="space-y-3">
        <label className="block text-sm font-medium">
          Tienda
          <input list="coupon-stores" value={store} onChange={(e) => setStore(e.target.value)} className={INPUT} />
        </label>
        <datalist id="coupon-stores">
          {STORE_IDS.map((s) => (
            <option key={s} value={s}>
              {storeName(s)}
            </option>
          ))}
        </datalist>
        <label className="block text-sm font-medium">
          Código
          <input value={code} onChange={(e) => setCode(e.target.value)} className={INPUT} />
        </label>
        <label className="block text-sm font-medium">
          Título
          <input value={title} onChange={(e) => setTitle(e.target.value)} className={INPUT} />
        </label>
        <label className="block text-sm font-medium">
          Condiciones
          <textarea value={conditions} onChange={(e) => setConditions(e.target.value)} rows={2} className={`${INPUT} py-2`} />
        </label>
        <label className="block text-sm font-medium">
          Enlace
          <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} className={INPUT} />
        </label>
        <label className="block text-sm font-medium">
          Empieza
          <input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} className={INPUT} />
        </label>
        <label className="block text-sm font-medium">
          Caduca
          <input type="datetime-local" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} className={INPUT} />
        </label>
        <label className="block text-sm font-medium">
          Descuento (€)
          <input inputMode="decimal" value={discountAmount} onChange={(e) => setDiscountAmount(e.target.value)} className={INPUT} />
        </label>
        <label className="block text-sm font-medium">
          Descuento (%)
          <input inputMode="decimal" value={discountPct} onChange={(e) => setDiscountPct(e.target.value)} className={INPUT} />
        </label>
        <label className="block text-sm font-medium">
          Compra mínima (€)
          <input inputMode="decimal" value={minPurchase} onChange={(e) => setMinPurchase(e.target.value)} className={INPUT} />
        </label>
        <label className="block text-sm font-medium">
          Evento
          <select value={eventId} onChange={(e) => setEventId(e.target.value)} className={INPUT}>
            <option value="">Sin evento</option>
            {events.map((ev) => (
              <option key={ev.id} value={ev.id}>
                {ev.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="size-5" />
          Activo
        </label>
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <button type="button" className={PRIMARY} disabled={disabled} onClick={() => void onSave()}>
          Guardar
        </button>
      </div>

      <JobStatus
        jobId={jobId}
        onRetry={() => {
          setError(null)
          setBusy(true)
          enqueueJob(db(), 'revalidate', {})
            .then(setJobId)
            .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Algo ha fallado'))
            .finally(() => setBusy(false))
        }}
      />

      <WhatsAppActions text={text} imageUrl={webUrl ? `${webUrl}/og.png` : null} />
    </div>
  )
}
