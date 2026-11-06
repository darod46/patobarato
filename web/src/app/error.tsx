'use client'

import { Header } from '../components/Header'
import { SearchForm } from '../components/SearchForm'

const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary'

// `retry` re-fetches the server data and re-renders; `reset` alone would show the same failed render.
export default function ErrorPage({ retry }: { error: unknown; retry: () => void }) {
  return (
    <div className="min-h-screen bg-surface font-sans text-ink">
      <Header search={<SearchForm />} />
      <main className="mx-auto max-w-[1280px] px-4 pt-32 pb-16 md:px-8 md:pt-24">
        <div className="flex flex-col items-center gap-4 py-8 text-center">
          <img src="/pato-placeholder.svg" alt="" width={120} height={120} className="h-28 w-28" />
          <h1 className="text-2xl font-extrabold md:text-3xl">Algo ha fallado al cargar los chollos</h1>
          <p className="text-muted">Puede ser algo pasajero. Vuelve a intentarlo en un momento.</p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={() => retry()}
              className={`rounded-xl bg-accent px-6 py-3 font-extrabold text-ink hover:bg-accent/90 ${FOCUS}`}
            >
              Reintentar
            </button>
            <a
              href="/"
              className={`rounded-xl border border-ink px-6 py-3 font-extrabold text-ink hover:bg-surface ${FOCUS}`}
            >
              Volver al inicio
            </a>
          </div>
        </div>
      </main>
    </div>
  )
}
