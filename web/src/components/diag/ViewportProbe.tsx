'use client'

import { useEffect, useState } from 'react'

/**
 * Temporary diagnostics for in-app browsers (Telegram on iOS): what the page sees of its viewport and the
 * browser's own toolbars. A red fixed bar at the top and a blue one at the bottom, each with a lighter block
 * extending off screen, show what the browser draws over or under its chrome.
 */
export function ViewportProbe({ cover }: { cover: boolean }) {
  const [rows, setRows] = useState<[string, string][]>([])

  useEffect(() => {
    function measure() {
      const probe = document.getElementById('safe-probe')
      const cs = probe ? getComputedStyle(probe) : null
      const w = window as unknown as Record<string, unknown>
      const vv = window.visualViewport
      setRows([
        ['viewport-fit', cover ? 'cover' : 'auto'],
        ['userAgent', navigator.userAgent],
        ['inner', `${window.innerWidth} × ${window.innerHeight}`],
        ['outer', `${window.outerWidth} × ${window.outerHeight}`],
        ['screen', `${window.screen.width} × ${window.screen.height}`],
        ['clientHeight', String(document.documentElement.clientHeight)],
        ['visualViewport', vv ? `${Math.round(vv.width)} × ${Math.round(vv.height)} @ top ${Math.round(vv.offsetTop)}` : '—'],
        ['scrollY', String(Math.round(window.scrollY))],
        [
          'safe-area (t r b l)',
          cs ? [cs.paddingTop, cs.paddingRight, cs.paddingBottom, cs.paddingLeft].join(' ') : '—',
        ],
        ['TelegramWebviewProxy', String('TelegramWebviewProxy' in w)],
        ['TelegramWebview', String('TelegramWebview' in w)],
        ['Telegram', String('Telegram' in w)],
        ['standalone', String(window.matchMedia('(display-mode: standalone)').matches)],
      ])
    }
    measure()
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, { passive: true })
    window.visualViewport?.addEventListener('resize', measure)
    return () => {
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure)
      window.visualViewport?.removeEventListener('resize', measure)
    }
  }, [cover])

  return (
    <div className="font-sans text-ink">
      <div
        id="safe-probe"
        aria-hidden="true"
        className="pointer-events-none fixed top-0 left-0 size-0"
        style={{
          paddingTop: 'env(safe-area-inset-top)',
          paddingRight: 'env(safe-area-inset-right)',
          paddingBottom: 'env(safe-area-inset-bottom)',
          paddingLeft: 'env(safe-area-inset-left)',
        }}
      />
      <div className="fixed inset-x-0 top-0 z-50 flex h-14 items-center justify-center bg-red-600 font-bold text-white before:absolute before:inset-x-0 before:bottom-full before:h-40 before:bg-red-300">
        ARRIBA (top: 0)
      </div>
      <main className="px-4 pt-20 pb-24">
        <h1 className="font-display text-2xl font-bold">Diagnóstico de pantalla</h1>
        <p className="mt-2 text-sm text-muted">Haz una captura arriba del todo y otra tras bajar un poco.</p>
        <dl className="mt-4 flex flex-col gap-2 text-sm">
          {rows.map(([k, v]) => (
            <div key={k} className="rounded-lg border border-line bg-white p-2">
              <dt className="font-semibold">{k}</dt>
              <dd className="break-all text-muted">{v}</dd>
            </div>
          ))}
        </dl>
        <ol className="mt-6 flex flex-col gap-2">
          {Array.from({ length: 40 }, (_, i) => (
            <li key={i} className="rounded-lg bg-amber-200 p-3 text-sm font-semibold">{`Línea ${i + 1}`}</li>
          ))}
        </ol>
      </main>
      <div className="fixed inset-x-0 bottom-0 z-50 flex h-16 items-center justify-center bg-blue-600 font-bold text-white after:absolute after:inset-x-0 after:top-full after:h-40 after:bg-blue-300">
        ABAJO (bottom: 0)
      </div>
    </div>
  )
}
