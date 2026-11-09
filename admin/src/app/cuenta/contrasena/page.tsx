'use client'

import { useRouter } from 'next/navigation'
import { useState, type FormEvent } from 'react'
import { createBrowserSupabase } from '../../../lib/supabase/browser'

const input = 'min-h-11 w-full rounded-md border border-line bg-white px-3'

export default function ContrasenaPage() {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    const password = String(form.get('password'))
    if (password.length < 8) return setError('La contraseña debe tener al menos 8 caracteres')
    if (password !== String(form.get('confirm'))) return setError('Las contraseñas no coinciden')
    setError(null)
    const { error } = await createBrowserSupabase().auth.updateUser({ password })
    if (error) return setError('No se pudo guardar la contraseña. Inténtalo de nuevo.')
    router.replace('/')
    router.refresh()
  }

  return (
    <form onSubmit={onSubmit} className="mx-auto flex max-w-sm flex-col gap-4">
      <h1 className="font-display text-2xl font-bold">Crea tu contraseña</h1>
      <label className="flex flex-col gap-1 text-sm font-medium">
        Contraseña nueva
        <input name="password" type="password" required minLength={8} autoComplete="new-password" className={input} />
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium">
        Repite la contraseña
        <input name="confirm" type="password" required minLength={8} autoComplete="new-password" className={input} />
      </label>
      {error && (
        <p role="alert" className="text-danger">
          {error}
        </p>
      )}
      <button type="submit" className="min-h-11 rounded-md bg-primary px-4 font-semibold text-white hover:bg-primary-hover">
        Guardar contraseña
      </button>
    </form>
  )
}
