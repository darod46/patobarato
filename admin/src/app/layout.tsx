import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { AppNav } from '../components/AppNav'
import { getMembership } from '../lib/membership'
import { createServerSupabase } from '../lib/supabase/server'
import './globals.css'

export const metadata: Metadata = {
  title: 'PatoBarato Admin',
  robots: { index: false, follow: false },
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const membership = await getMembership(await createServerSupabase())
  return (
    <html lang="es">
      <body className="min-h-screen bg-surface font-sans text-ink">
        {membership && <AppNav isOwner={membership.isOwner} />}
        <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
      </body>
    </html>
  )
}
