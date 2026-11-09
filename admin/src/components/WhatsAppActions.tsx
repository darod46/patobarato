'use client'

import { useEffect, useState, useSyncExternalStore } from 'react'
import { copyImage, copyText, loadPng } from '../lib/clipboard'

type Props = { text: string; imageUrl: string | null }

const BTN =
  'min-h-11 rounded-md border border-neutral-300 px-4 text-sm font-medium hover:bg-neutral-100 disabled:opacity-50'

const subscribeNever = () => () => {}

function canShareFiles(): boolean {
  if (typeof navigator === 'undefined' || typeof navigator.share !== 'function' || typeof navigator.canShare !== 'function') {
    return false
  }
  try {
    return navigator.canShare({ files: [new File([''], 'patobarato.png', { type: 'image/png' })] })
  } catch {
    return false
  }
}

export function WhatsAppActions({ text, imageUrl }: Props) {
  const [draft, setDraft] = useState(text)
  const [done, setDone] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const canShare = useSyncExternalStore(subscribeNever, canShareFiles, () => false)
  const [prevText, setPrevText] = useState(text)
  if (prevText !== text) {
    setPrevText(text)
    setDraft(text)
  }

  // Preload the PNG so Compartir needs no network or decoding after the click (user activation expires).
  const [preloaded, setPreloaded] = useState<{ url: string; file: File } | null>(null)
  useEffect(() => {
    if (!canShare || !imageUrl) return
    let cancelled = false
    loadPng(imageUrl)
      .then((png) => {
        if (!cancelled) setPreloaded({ url: imageUrl, file: new File([png], 'patobarato.png', { type: 'image/png' }) })
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [canShare, imageUrl])
  const shareFile = preloaded && preloaded.url === imageUrl ? preloaded.file : null

  useEffect(() => {
    if (!done) return
    const t = setTimeout(() => setDone(null), 2000)
    return () => clearTimeout(t)
  }, [done])

  async function run(label: string, action: () => Promise<void>) {
    setError(null)
    setDone(null)
    setBusy(true)
    try {
      await action()
      setDone(label)
    } catch (e) {
      // The user dismissing the share sheet is not an error.
      if (e instanceof DOMException && e.name === 'AbortError') {
        // dismissed
      } else if (e instanceof DOMException && e.name === 'NotAllowedError') {
        setError('Pulsa de nuevo Compartir')
      } else {
        setError('No se pudo copiar o compartir. Inténtalo de nuevo.')
      }
    } finally {
      setBusy(false)
    }
  }

  // Called straight from the click handler: the clipboard needs the user gesture, so the
  // PNG is handed over as a promise instead of being awaited first.
  const onCopyImage = () => run('Copiado', () => copyImage(loadPng(imageUrl!)))
  const onCopyText = () => run('Copiado', () => copyText(draft))
  const onShare = () =>
    run('Compartido', async () => {
      await copyText(draft)
      // Never start the image load after the click: without a preloaded image, share text only.
      await navigator.share(shareFile ? { files: [shareFile], text: draft } : { text: draft })
    })

  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold">WhatsApp</h3>
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        rows={8}
        aria-label="Texto para WhatsApp"
        className="w-full rounded-md border border-neutral-300 p-2 text-sm"
      />
      <div className="flex flex-wrap items-center gap-2">
        {imageUrl && (
          <button type="button" className={BTN} disabled={busy} onClick={onCopyImage}>
            Copiar imagen
          </button>
        )}
        <button type="button" className={BTN} disabled={busy} onClick={onCopyText}>
          Copiar texto
        </button>
        {canShare && (
          <button type="button" className={BTN} disabled={busy} onClick={onShare}>
            Compartir
          </button>
        )}
        {done && <span role="status" className="text-sm text-green-700">{done}</span>}
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
    </section>
  )
}
