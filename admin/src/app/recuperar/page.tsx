'use client'

import Link from 'next/link'
import { useState, type FormEvent } from 'react'
import { createBrowserSupabase } from '../../lib/supabase/browser'

export default function RecuperarPage() {
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const email = String(new FormData(e.currentTarget).get('email'))
    setError(null)
    const { error } = await createBrowserSupabase().auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/confirm`,
    })
    if (error) setError('No se pudo enviar el email. Inténtalo de nuevo.')
    else setSent(true)
  }

  return (
    <div className="mx-auto flex max-w-sm flex-col gap-4">
      <h1 className="font-display text-2xl font-bold">Recuperar contraseña</h1>
      {sent ? (
        <p>Si el email existe, te hemos enviado un enlace para crear una contraseña nueva.</p>
      ) : (
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1 text-sm font-medium">
            Email
            <input name="email" type="email" required autoComplete="email" className="min-h-11 w-full rounded-md border border-line bg-white px-3" />
          </label>
          {error && (
            <p role="alert" className="text-danger">
              {error}
            </p>
          )}
          <button type="submit" className="min-h-11 rounded-md bg-primary px-4 font-semibold text-white hover:bg-primary-hover">
            Enviar enlace
          </button>
        </form>
      )}
      <Link href="/login" className="flex min-h-11 items-center text-sm text-primary underline">
        Volver a entrar
      </Link>
    </div>
  )
}
