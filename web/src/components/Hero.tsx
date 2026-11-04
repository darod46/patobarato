const FOCUS =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-carbon'

export function Hero() {
  return (
    <section className="mx-auto max-w-[1280px] px-4 pt-6 md:px-8">
      <div className="grid items-center gap-8 rounded-3xl border border-zinc-200 bg-white p-6 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.05)] md:grid-cols-2 md:p-12">
        <div className="flex flex-col items-start gap-6">
          <span className="rounded-full bg-amber/12 px-3 py-1 text-xs font-bold uppercase tracking-wide text-amber-ink">
            Vigilante de precios • Ofertas que vuelan
          </span>
          <h1 className="text-4xl font-bold leading-tight text-carbon md:text-5xl">
            ¡Cazo los mejores{' '}
            <span className="underline decoration-amber decoration-wavy underline-offset-4">
              chollos
            </span>{' '}
            antes de que vuelen!
          </h1>
          <p className="text-base leading-relaxed text-zinc-500">
            Vigilo canales de chollos de Telegram y republico las ofertas de Amazon España con el
            precio, el precio anterior y el cupón.
          </p>
          <div className="flex flex-wrap gap-3">
            <a
              href="#chollos"
              className={`rounded-lg bg-carbon px-6 py-3 text-sm font-semibold text-white hover:bg-carbon-soft ${FOCUS}`}
            >
              Ver chollos
            </a>
            <a
              href="https://t.me/patobarato"
              target="_blank"
              rel="noopener noreferrer"
              className={`rounded-lg border border-zinc-200 bg-zinc-50 px-6 py-3 text-sm font-semibold text-carbon hover:bg-zinc-100 ${FOCUS}`}
            >
              Unirse en Telegram
            </a>
          </div>
        </div>
        <div className="mx-auto flex h-64 w-64 items-center justify-center rounded-full bg-amber/20 md:h-80 md:w-80">
          <img
            src="/pato-heroe.svg"
            alt="Mascota de PatoBarato, un pato superhéroe"
            className="h-5/6 w-5/6 object-contain"
          />
        </div>
      </div>
    </section>
  )
}
