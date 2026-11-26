import { Send } from 'lucide-react'
import type { ReactNode } from 'react'
import type { CtaPlacement } from '../lib/telegram'
import { TelegramCta } from './TelegramCta'

/**
 * `primary`: blue pill (header, deal pages).
 * `light`: white pill with a blue icon, for light backgrounds next to a primary button (hero).
 * `inverse`: white pill on dark backgrounds (Telegram block).
 */
type Variant = 'primary' | 'light' | 'inverse'
type Size = 'md' | 'lg'

type Props = {
  placement: CtaPlacement
  children: ReactNode
  variant?: Variant
  size?: Size
  /**
   * Classes for the label, e.g. to hide it on some breakpoints and leave the icon alone. When set, the
   * caller also passes the matching right padding in `className` (`md` has none of its own then).
   */
  labelClassName?: string
  className?: string
  'aria-label'?: string
}

const VARIANTS: Record<Variant, { button: string; icon: string; focus: string }> = {
  primary: {
    button: 'bg-primary text-white shadow-sm shadow-primary/30 hover:bg-primary-hover',
    icon: 'bg-white/15 text-white',
    focus: 'focus-visible:outline-primary',
  },
  light: {
    button: 'border border-[#d7dae0] bg-white text-ink hover:border-primary/40 hover:bg-primary-soft/40',
    icon: 'bg-primary text-white',
    focus: 'focus-visible:outline-primary',
  },
  inverse: {
    button: 'bg-white text-primary shadow-sm hover:bg-primary-soft',
    icon: 'bg-primary text-white',
    focus: 'focus-visible:outline-white',
  },
}

const SIZES: Record<Size, { button: string; icon: string; iconSize: number }> = {
  md: { button: 'h-11 p-1 text-sm', icon: 'size-9', iconSize: 17 },
  lg: { button: 'h-14 p-1.5 pr-6 text-base', icon: 'size-11', iconSize: 20 },
}

/** The channel button: a pill with the paper plane in its own circle, used wherever we invite to join the Telegram channel. */
export function ChannelButton({
  placement,
  children,
  variant = 'primary',
  size = 'md',
  labelClassName = '',
  className = '',
  'aria-label': ariaLabel,
}: Props) {
  const v = VARIANTS[variant]
  const s = SIZES[size]
  const padEnd = size === 'md' && labelClassName === '' ? 'pr-4' : ''
  return (
    <TelegramCta
      placement={placement}
      aria-label={ariaLabel}
      className={`group inline-flex shrink-0 items-center gap-2.5 whitespace-nowrap rounded-full font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 ${v.button} ${v.focus} ${s.button} ${padEnd} ${className}`}
    >
      <span
        className={`flex shrink-0 items-center justify-center rounded-full transition-transform group-hover:translate-x-px group-hover:-translate-y-px ${v.icon} ${s.icon}`}
      >
        <Send size={s.iconSize} aria-hidden="true" className="-translate-x-px translate-y-px" />
      </span>
      <span className={labelClassName}>{children}</span>
    </TelegramCta>
  )
}
