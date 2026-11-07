import type { ReactNode } from 'react'
import { Footer } from './Footer'
import { Header } from './Header'

type Props = { title: string; updated: string; year: number; children: ReactNode }

/** Static text pages: header without search, a prose column and the footer. */
export function LegalLayout({ title, updated, year, children }: Props) {
  return (
    <div className="min-h-screen bg-white font-sans text-ink">
      <Header />
      <main className="mx-auto max-w-[1200px] px-4 pt-24 pb-16 md:px-8 md:pt-32">
        <h1 className="font-display text-4xl font-bold tracking-[-0.03em] md:text-5xl">{title}</h1>
        <p className="mt-3 text-sm text-muted">Última actualización: {updated}</p>
        <div className="prose-legal mt-8 flex max-w-prose flex-col gap-4 text-[15px] leading-relaxed text-ink md:text-base [&_h2]:mt-4 [&_h2]:font-display [&_h2]:text-xl [&_h2]:font-bold [&_a]:font-semibold [&_a]:text-primary [&_ul]:list-disc [&_ul]:pl-5">
          {children}
        </div>
      </main>
      <Footer year={year} />
    </div>
  )
}
