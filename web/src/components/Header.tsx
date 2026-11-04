import type { ReactNode } from 'react'

const FOCUS =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber'

export function Header({ search }: { search: ReactNode }) {
  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-zinc-200 bg-white/80 backdrop-blur">
      {/* One search box: a full-width second row on mobile, centered in the first row from md. */}
      <div className="mx-auto flex max-w-[1280px] flex-wrap items-center justify-between gap-x-6 gap-y-3 px-4 py-3 md:flex-nowrap md:px-8">
        <a href="/" className={`shrink-0 ${FOCUS}`}>
          <img src="/logo.svg" alt="PatoBarato" className="h-9 w-auto" />
        </a>
        <div className="order-last w-full md:order-none md:max-w-md md:flex-1">{search}</div>
        <a
          href="https://t.me/patobarato"
          target="_blank"
          rel="noopener noreferrer"
          className={`rounded-lg bg-carbon px-4 py-2 text-sm font-semibold text-white hover:bg-carbon-soft ${FOCUS}`}
        >
          Telegram
        </a>
      </div>
    </header>
  )
}
