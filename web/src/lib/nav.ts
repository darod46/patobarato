export type NavLink = { label: string; href: string }

/** Main navigation, shared by the header and the mobile menu. Telegram has its own header button. */
export const NAV_LINKS: NavLink[] = [
  { label: 'Chollos', href: '/chollos' },
  { label: 'Cupones', href: '/cupones' },
  { label: 'Tiendas', href: '/tiendas' },
  { label: 'Guías', href: '/guias' },
]
