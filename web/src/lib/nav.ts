export type NavLink = { label: string; href: string }

/** Main navigation, shared by the header and the mobile menu. */
export const NAV_LINKS: NavLink[] = [
  { label: 'Chollos', href: '/#chollos' },
  { label: 'Cupones', href: '/cupones' },
  { label: 'Cómo funciona', href: '/#como-funciona' },
  { label: 'Telegram', href: '/#telegram' },
]
