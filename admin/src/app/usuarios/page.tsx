import { redirect } from 'next/navigation'
import { getMembership } from '../../lib/membership'
import { createServerSupabase } from '../../lib/supabase/server'
import { UsersPanel } from './UsersPanel'

export default async function UsuariosPage() {
  const membership = await getMembership(await createServerSupabase())
  if (!membership?.isOwner) redirect('/ofertas')
  return <UsersPanel currentEmail={membership.email} />
}
