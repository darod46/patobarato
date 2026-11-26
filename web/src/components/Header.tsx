import { MobileNav } from './MobileNav'
import { SearchTrigger } from './SearchTrigger'
import { ChannelButton } from './ChannelButton'

import { NAV_LINKS } from '../lib/nav'
import { FLAGS } from '../lib/flags'

const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary'

type Props = {
  /** Show the search field (header on `md+`, menu panel below); the search page itself hides it. */
  searchTrigger?: boolean
}

/** Fixed header: logo, main navigation (collapsed into a menu on small screens), the search entry and the channel button. */
export function Header({ searchTrigger = true }: Props) {
  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-line bg-white shadow-[0_1px_8px_rgba(20,22,26,0.06)]">
      <div className="mx-auto flex max-w-[1200px] items-center justify-between gap-x-5 px-4 py-2 md:px-8 md:py-3">
        <a href="/" className={`shrink-0 rounded-md ${FOCUS}`}>
          <img src="/logo.svg" alt="PatoBarato" className="h-8 w-auto md:h-11" />
        </a>
        <nav aria-label="Principal" className="hidden shrink-0 items-center gap-1 text-[15px] font-medium lg:flex">
          {NAV_LINKS.map((link) => (
            <a key={link.href} href={link.href} className={`rounded-full px-3 py-2 text-ink transition-colors hover:bg-surface hover:text-primary ${FOCUS}`}>
              {link.label}
            </a>
          ))}
        </nav>
        <div className="flex min-w-0 flex-1 items-center justify-end gap-1 sm:gap-3">
          {searchTrigger && <SearchTrigger />}
          {FLAGS.telegram && (
          <ChannelButton
            placement="header"
            aria-label="Unirme al canal"
            labelClassName="hidden sm:inline lg:hidden xl:inline"
            className="sm:pr-4 lg:pr-1 xl:pr-4"
          >
            Unirme al canal
          </ChannelButton>
          )}
          <MobileNav links={NAV_LINKS} search={searchTrigger} />
        </div>
      </div>
    </header>
  )
}
