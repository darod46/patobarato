'use client'

import { fetchLatestDeal } from '../../lib/deals'
import { getSupabase } from '../../lib/supabase'
import { TelegramBlock } from '../TelegramBlock'

// Bound lazily (and async) so a missing-env throw becomes a rejected promise TelegramBlock ignores.
const loadLatestDeal = async () => fetchLatestDeal(getSupabase())

/** Client boundary for the Telegram block, which loads its preview deal in the browser. */
export function EventTelegram() {
  return <TelegramBlock fetchLatestDeal={loadLatestDeal} />
}
