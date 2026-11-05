import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import './globals.css'

export const metadata: Metadata = {
  metadataBase: new URL('https://www.patobarato.com'),
  title: 'PatoBarato · Chollos de Amazon',
  description: 'Los mejores chollos de Amazon, seleccionados cada día por PatoBarato.',
  icons: { icon: '/favicon.ico' },
  openGraph: {
    type: 'website',
    siteName: 'PatoBarato',
    locale: 'es_ES',
    images: [{ url: '/og.png', width: 1200, height: 630, alt: 'PatoBarato · Chollos de Amazon' }],
  },
  twitter: { card: 'summary_large_image', images: ['/og.png'] },
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  )
}
