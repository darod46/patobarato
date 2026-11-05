'use client'

import { Header } from '../components/Header'
import { SearchForm } from '../components/SearchForm'

const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-carbon'

// `retry` re-fetches the server data and re-renders; `reset` alone would show the same failed render.
export default function ErrorPage({ retry }: { error: unknown; retry: () => void }) {
  return (
    <div className="min-h-screen bg-surface font-sans text-carbon">
      <Header search={<SearchForm />} />
      <main className="mx-auto max-w-[1280px] px-4 pt-32 pb-16 md:px-8 md:pt-24">
        <div className="flex flex-col items-center gap-4 py-8 text-center">
          <img src="/pato-placeholder.svg" alt="" width={120} height={120} className="h-28 w-28" />
          <h1 className="text-2xl font-extrabold md:text-3xl">Algo ha fallado al cargar los chollos</h1>
          <p className="text-zinc-600">Puede ser algo pasajero. Vuelve a intentarlo en un momento.</p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={() => retry()}
              className={`rounded-xl bg-amber px-6 py-3 font-extrabold text-carbon hover:bg-amber/90 ${FOCUS}`}
            >
              Reintentar
            </button>
            <a
              href="/"
              className={`rounded-xl border border-carbon px-6 py-3 font-extrabold text-carbon hover:bg-zinc-100 ${FOCUS}`}
            >
              Volver al inicio
            </a>
          </div>
        </div>
      </main>
    </div>
  )
}
