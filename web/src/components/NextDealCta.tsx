import { Bell } from 'lucide-react'
import { categoryLabel } from '../lib/telegram'
import { ChannelButton } from './ChannelButton'

/** Card on deal pages inviting visitors who missed the offer to follow the Telegram channel. */
export function NextDealCta({ hashtags }: { hashtags: string[] }) {
  const category = categoryLabel(hashtags)
  const subject = category ? `El próximo chollo de ${category}` : 'El próximo chollo como este'
  return (
    <section className="mt-8 flex flex-col items-start gap-3 rounded-2xl border border-line bg-surface p-5">
      <Bell size={24} aria-hidden="true" className="text-primary" />
      <h2 className="font-display text-xl font-bold tracking-[-0.02em]">¿Se te ha escapado?</h2>
      <p className="text-sm text-muted">{`${subject} también saldrá en el canal, con su precio y su cupón.`}</p>
      <ChannelButton placement="deal" size="lg">
        Avísame del próximo
      </ChannelButton>
    </section>
  )
}
