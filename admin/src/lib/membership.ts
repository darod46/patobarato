import type { SupabaseClient } from '@supabase/supabase-js'

export type Membership = { email: string; isOwner: boolean }

/** The caller's admin_users row, or null when signed out or not invited. */
export async function getMembership(client: SupabaseClient): Promise<Membership | null> {
  const { data } = await client.auth.getUser()
  const user = data.user
  if (!user) return null
  const { data: row } = await client
    .from('admin_users')
    .select('email, is_owner')
    .eq('user_id', user.id)
    .maybeSingle()
  if (!row) return null
  return { email: row.email as string, isOwner: Boolean(row.is_owner) }
}
