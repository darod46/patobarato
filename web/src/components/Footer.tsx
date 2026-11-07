import { storeNames } from '../lib/stores'
import { joinNames } from '../lib/text'

const FOCUS = 'rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary'

type Column = { title: string; links: { label: string; href: string; external?: boolean }[] }

const COLUMNS: Column[] = [
  {
    title: 'Chollos',
    links: [
      { label: 'Por categoría', href: '/chollos' },
      { label: 'Cupones', href: '/cupones' },
      { label: 'Calendario', href: '/#eventos' },
    ],
  },
  {
    title: 'Contenido',
    links: [
      { label: 'Cómo funciona', href: '/#como-funciona' },
      { label: 'Quiénes somos', href: '/#sobre' },
      { label: 'Canal de Telegram', href: 'https://t.me/patobarato', external: true },
    ],
  },
  {
    title: 'Legal',
    links: [
      { label: 'Contacto', href: '/contacto' },
      { label: 'Aviso legal', href: '/aviso-legal' },
      { label: 'Privacidad', href: '/privacidad' },
      { label: 'Cookies', href: '/cookies' },
      { label: 'Política de afiliación', href: '/afiliados' },
    ],
  },
]

type Props = {
  /** Server render year, so server and client HTML always match. */
  year: number
  /** Store ids with deals or coupons; stores other than Amazon are named in the affiliate notice. */
  stores?: string[]
}

export function Footer({ year, stores = [] }: Props) {
  const others = storeNames(stores.filter((s) => s !== 'amazon'))
  return (
    <footer className="border-t border-line bg-white py-12">
      <div className="mx-auto flex max-w-[1200px] flex-col gap-8 px-4 md:px-8">
        <div className="grid gap-8 md:grid-cols-[2fr_repeat(3,minmax(0,1fr))]">
          <div className="flex max-w-sm flex-col gap-3">
            <img src="/logo.svg" alt="PatoBarato" className="h-8 w-auto self-start" />
            <p className="text-sm leading-relaxed text-muted">
              En calidad de Afiliado de Amazon, PatoBarato obtiene ingresos por las compras adscritas
              que cumplen los requisitos aplicables.
              {others.length > 0 && ` Algunos enlaces a ${joinNames(others)} pueden ser de afiliado.`}
            </p>
            <p className="text-sm text-muted">Los precios y la disponibilidad pueden cambiar.</p>
          </div>
          {COLUMNS.map((col) => (
            <nav key={col.title} aria-label={col.title} className="flex flex-col gap-2.5 text-sm">
              <span className="font-semibold text-ink">{col.title}</span>
              {col.links.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  className={`text-muted hover:text-ink ${FOCUS}`}
                  {...(link.external && { target: '_blank', rel: 'noopener noreferrer' })}
                >
                  {link.label}
                </a>
              ))}
            </nav>
          ))}
        </div>
        <p className="border-t border-line pt-5 text-[13px] text-muted">© {year} PatoBarato</p>
      </div>
    </footer>
  )
}
