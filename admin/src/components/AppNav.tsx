'use client'

import { LogOut, Menu, X } from 'lucide-react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState } from 'react'
import { createBrowserSupabase } from '../lib/supabase/browser'

const LINKS = [
  { href: '/ofertas', label: 'Ofertas' },
  { href: '/cupones', label: 'Cupones' },
  { href: '/guias', label: 'Guías' },
  { href: '/eventos', label: 'Eventos' },
]

export function AppNav({ isOwner }: { isOwner: boolean }) {
  const pathname = usePathname()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const links = isOwner ? [...LINKS, { href: '/usuarios', label: 'Usuarios' }] : LINKS

  async function signOut() {
    await createBrowserSupabase().auth.signOut()
    router.replace('/login')
    router.refresh()
  }

  return (
    <header className="border-b border-line bg-white">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-2 px-4">
        <Link href="/ofertas" className="font-display text-lg font-bold text-ink">
          PatoBarato <span className="text-sm font-medium text-muted">Admin</span>
        </Link>
        <button
          type="button"
          className="flex min-h-11 min-w-11 items-center justify-center rounded-md md:hidden"
          aria-label="Menú"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
        >
          {open ? <X aria-hidden size={22} /> : <Menu aria-hidden size={22} />}
        </button>
        <nav
          aria-label="Principal"
          className={`${open ? 'flex' : 'hidden'} absolute left-0 right-0 top-14 z-10 flex-col border-b border-line bg-white px-4 pb-2 md:static md:flex md:flex-row md:items-center md:border-0 md:p-0`}
        >
          {links.map(({ href, label }) => {
            const active = pathname === href || pathname.startsWith(`${href}/`)
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setOpen(false)}
                aria-current={active ? 'page' : undefined}
                className={`flex min-h-11 items-center px-3 text-sm font-medium ${active ? 'text-primary' : 'text-ink hover:text-primary'}`}
              >
                {label}
              </Link>
            )
          })}
          <button
            type="button"
            onClick={signOut}
            className="flex min-h-11 items-center gap-2 px-3 text-sm font-medium text-muted hover:text-ink"
          >
            <LogOut aria-hidden size={16} />
            Salir
          </button>
        </nav>
      </div>
    </header>
  )
}
