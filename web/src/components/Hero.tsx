const FOCUS =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-carbon'

export function Hero() {
  return (
    <section className="bg-gradient-to-b from-white to-surface">
      <div className="mx-auto flex max-w-[1280px] flex-col items-center gap-6 px-4 py-10 text-center md:flex-row md:gap-12 md:px-8 md:py-16 md:text-left">
        <img
          src="/pato-heroe.svg"
          alt="Mascota de PatoBarato, un pato superhéroe"
          width={320}
          height={320}
          className="h-28 w-28 shrink-0 object-contain md:h-72 md:w-72"
        />
        <div className="flex flex-col items-center gap-5 md:items-start">
          <span className="text-xs font-bold uppercase tracking-wide text-amber-ink">
            Vigilante de precios • Ofertas que vuelan
          </span>
          <h1 className="text-3xl font-bold leading-tight text-carbon md:text-5xl">
            ¡Cazo los mejores{' '}
            <span className="underline decoration-amber decoration-wavy underline-offset-4">
              chollos
            </span>{' '}
            de Amazon antes de que vuelen!
          </h1>
          <p className="max-w-xl text-base leading-relaxed text-zinc-600">
            Vigilo canales de chollos de Telegram y republico las ofertas de Amazon España con el
            precio, el precio anterior y el cupón.
          </p>
          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
            <a
              href="#chollos"
              className={`rounded-lg bg-carbon px-6 py-3 text-center text-sm font-semibold text-white hover:bg-carbon-soft ${FOCUS}`}
            >
              Ver chollos
            </a>
            <a
              href="https://t.me/patobarato"
              target="_blank"
              rel="noopener noreferrer"
              className={`rounded-lg border border-carbon bg-transparent px-6 py-3 text-center text-sm font-semibold text-carbon hover:bg-zinc-100 ${FOCUS}`}
            >
              Unirme en Telegram
            </a>
          </div>
        </div>
      </div>
    </section>
  )
}
