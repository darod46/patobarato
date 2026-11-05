import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import './globals.css'

export const metadata: Metadata = {
  metadataBase: new URL('https://www.patobarato.com'),
  title: 'PatoBarato · Chollos de Amazon',
  description: 'Los mejores chollos de Amazon, seleccionados cada día por PatoBarato.',
  icons: { icon: '/favicon.ico' },
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  )
}
