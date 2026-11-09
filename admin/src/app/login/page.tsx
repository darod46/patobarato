'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useState, type FormEvent } from 'react'
import { createBrowserSupabase } from '../../lib/supabase/browser'

const input = 'min-h-11 w-full rounded-md border border-line bg-white px-3'

function LoginForm() {
  const router = useRouter()
  const linkError = useSearchParams().get('error') === 'enlace'
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    setBusy(true)
    setError(null)
    const { error } = await createBrowserSupabase().auth.signInWithPassword({
      email: String(form.get('email')),
      password: String(form.get('password')),
    })
    setBusy(false)
    if (error) {
      setError('Email o contraseña incorrectos')
      return
    }
    router.replace('/')
    router.refresh()
  }

  return (
    <form onSubmit={onSubmit} className="mx-auto flex max-w-sm flex-col gap-4">
      <h1 className="font-display text-2xl font-bold">Entrar</h1>
      {linkError && (
        <p role="alert" className="text-danger">
          El enlace no es válido o ha caducado. Pide uno nuevo.
        </p>
      )}
      <label className="flex flex-col gap-1 text-sm font-medium">
        Email
        <input name="email" type="email" required autoComplete="email" className={input} />
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium">
        Contraseña
        <input name="password" type="password" required autoComplete="current-password" className={input} />
      </label>
      {error && (
        <p role="alert" className="text-danger">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={busy}
        className="min-h-11 rounded-md bg-primary px-4 font-semibold text-white hover:bg-primary-hover disabled:opacity-60"
      >
        Entrar
      </button>
      <Link href="/recuperar" className="flex min-h-11 items-center text-sm text-primary underline">
        He olvidado mi contraseña
      </Link>
    </form>
  )
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  )
}
