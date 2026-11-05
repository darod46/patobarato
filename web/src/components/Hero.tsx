const FOCUS =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-carbon'

export function Hero() {
  return (
    <section className="bg-gradient-to-b from-white to-surface">
      {/* Mobile: mascot and heading share the first row so the deals start above the fold.
          From md the text block is one column to the right of the large mascot. */}
      <div className="mx-auto grid max-w-[1280px] grid-cols-[4rem_1fr] items-center gap-x-3 gap-y-4 px-4 py-6 md:flex md:flex-row md:gap-12 md:px-8 md:py-16">
        <img
          src="/pato-heroe.svg"
          alt="Mascota de PatoBarato, un pato superhéroe"
          width={320}
          height={320}
          className="h-16 w-16 shrink-0 object-contain md:h-72 md:w-72"
        />
        <div className="contents md:flex md:flex-col md:items-start md:gap-5">
          <div className="flex flex-col gap-1 md:gap-5">
            <span className="text-xs font-bold uppercase tracking-wide text-amber-ink">
              Vigilante de precios • Ofertas que vuelan
            </span>
            <h1 className="text-2xl font-bold leading-tight text-carbon md:text-5xl">
              ¡Cazo los mejores{' '}
              <span className="underline decoration-amber decoration-wavy underline-offset-4">
                chollos
              </span>{' '}
              de Amazon antes de que vuelen!
            </h1>
          </div>
          <p className="col-span-2 max-w-xl text-sm leading-relaxed text-zinc-600 md:text-base">
            Vigilo canales de chollos de Telegram y republico las ofertas de Amazon España con el
            precio, el precio anterior y el cupón.
          </p>
          <div className="col-span-2 flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:gap-3">
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
