import { Send } from 'lucide-react'
import { MobileNav } from './MobileNav'
import { SearchTrigger } from './SearchTrigger'

import { NAV_LINKS } from '../lib/nav'

const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary'

const TELEGRAM = 'https://t.me/patobarato'

type Props = {
  /** Show the link to `/buscar`; the search page itself hides it. */
  searchTrigger?: boolean
}

/** Fixed header: logo, main navigation (collapsed into a menu on small screens), the search entry and the channel button. */
export function Header({ searchTrigger = true }: Props) {
  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-line bg-white/80 backdrop-blur">
      <div className="mx-auto flex max-w-[1200px] items-center justify-between gap-x-6 px-4 py-2 md:px-8 md:py-3">
        <a href="/" className={`shrink-0 rounded-md ${FOCUS}`}>
          <img src="/logo.svg" alt="PatoBarato" className="h-8 w-auto md:h-11" />
        </a>
        <nav aria-label="Principal" className="hidden items-center gap-6 text-[15px] font-medium lg:flex">
          {NAV_LINKS.map((link) => (
            <a key={link.href} href={link.href} className={`rounded-md text-ink hover:text-primary ${FOCUS}`}>
              {link.label}
            </a>
          ))}
        </nav>
        <div className="flex min-w-0 items-center gap-1 sm:gap-2">
          {searchTrigger && <SearchTrigger />}
          <a
            href={TELEGRAM}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Unirme al canal"
            className={`inline-flex h-11 items-center gap-2 rounded-xl bg-primary px-3 text-sm font-semibold text-white hover:bg-primary-hover sm:px-4 ${FOCUS}`}
          >
            <Send size={18} aria-hidden="true" />
            <span className="hidden sm:inline">Unirme al canal</span>
          </a>
          <MobileNav links={NAV_LINKS} />
        </div>
      </div>
    </header>
  )
}
