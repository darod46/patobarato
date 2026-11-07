import { Send } from 'lucide-react'
import type { ReactNode } from 'react'
import { HeaderSearch } from './HeaderSearch'
import { HeaderSearchToggle } from './HeaderSearchToggle'
import { MobileNav } from './MobileNav'

import { NAV_LINKS } from '../lib/nav'

const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary'

const TELEGRAM = 'https://t.me/patobarato'

type Props = {
  /** The search field; defaults to a plain GET form to /chollos. Listing pages pass a live one. */
  search?: ReactNode
  /** Open the search strip from the start (a listing page with a query in the URL). */
  searchOpen?: boolean
}

/** Fixed header: logo, main navigation (collapsed into a menu on small screens), a magnifier that drops a search strip, and the channel button. */
export function Header({ search = <HeaderSearch />, searchOpen = false }: Props) {
  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-line bg-white/80 backdrop-blur">
      <div className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-between gap-x-6 gap-y-3 px-4 py-2 md:flex-nowrap md:px-8 md:py-3">
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
        <div className="flex items-center gap-1 sm:gap-2">
          <HeaderSearchToggle initiallyOpen={searchOpen}>{search}</HeaderSearchToggle>
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
