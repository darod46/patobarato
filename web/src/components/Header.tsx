import type { ReactNode } from 'react'
import { MobileNav } from './MobileNav'

import { NAV_LINKS } from '../lib/nav'

const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary'

const TELEGRAM = 'https://t.me/patobarato'

/** Fixed header: logo, main navigation (collapsed into a menu on small screens), search and the channel button. */
export function Header({ search }: { search: ReactNode }) {
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
        {search !== null && search !== undefined && (
          <div className="order-last w-full md:order-none md:max-w-xs md:flex-1">{search}</div>
        )}
        <div className="flex items-center gap-2">
          <a
            href={TELEGRAM}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Unirme al canal"
            className={`inline-flex h-11 items-center gap-2 rounded-xl bg-primary px-3 text-sm font-semibold text-white hover:bg-primary-hover sm:px-4 ${FOCUS}`}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M22 3 2 11l7 3 3 7 10-18Z" />
              <path d="m9 14 13-11" />
            </svg>
            <span className="hidden sm:inline">Unirme al canal</span>
          </a>
          <MobileNav links={NAV_LINKS} />
        </div>
      </div>
    </header>
  )
}
