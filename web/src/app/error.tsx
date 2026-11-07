'use client'

import { Header } from '../components/Header'

const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary'

// `retry` re-fetches the server data and re-renders; `reset` alone would show the same failed render.
export default function ErrorPage({ retry }: { error: unknown; retry: () => void }) {
  return (
    <div className="min-h-screen bg-white font-sans text-ink">
      <Header />
      <main className="mx-auto max-w-[1200px] px-4 pt-32 pb-16 md:px-8 md:pt-24">
        <div className="flex flex-col items-center gap-4 py-8 text-center">
          <img src="/pato-placeholder.svg" alt="" width={120} height={120} className="h-28 w-28" />
          <h1 className="font-display text-2xl font-bold tracking-[-0.02em] md:text-3xl">Algo ha fallado al cargar los chollos</h1>
          <p className="text-muted">Puede ser algo pasajero. Vuelve a intentarlo en un momento.</p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={() => retry()}
              className={`h-12 rounded-xl bg-primary px-6 text-[15px] font-semibold text-white hover:bg-primary-hover ${FOCUS}`}
            >
              Reintentar
            </button>
            <a
              href="/"
              className={`inline-flex h-12 items-center rounded-xl border border-[#d7dae0] bg-white px-6 text-[15px] font-semibold text-ink hover:bg-surface ${FOCUS}`}
            >
              Volver al inicio
            </a>
          </div>
        </div>
      </main>
    </div>
  )
}
