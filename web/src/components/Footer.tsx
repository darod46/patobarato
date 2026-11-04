import { useState } from 'react'

export function Footer() {
  const [year] = useState(() => new Date().getFullYear())
  return (
    <footer className="border-t border-zinc-200 bg-white py-10">
      <div className="mx-auto flex max-w-[1280px] flex-col gap-4 px-4 text-sm text-zinc-500 md:px-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <img src="/logo.svg" alt="PatoBarato" className="h-8 w-auto" />
          <a
            href="https://t.me/patobarato"
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-carbon underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-carbon"
          >
            Canal de Telegram
          </a>
        </div>
        <p>
          En calidad de Afiliado de Amazon, PatoBarato obtiene ingresos por las compras adscritas
          que cumplen los requisitos aplicables.
        </p>
        <p>Los precios y la disponibilidad pueden cambiar.</p>
        <p>© {year} PatoBarato</p>
      </div>
    </footer>
  )
}
