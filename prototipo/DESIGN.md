---
name: Precision Bargain Architecture
colors:
  surface: '#fbf8ff'
  surface-dim: '#dad9e3'
  surface-bright: '#fbf8ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f4f2fd'
  surface-container: '#eeedf7'
  surface-container-high: '#e8e7f1'
  surface-container-highest: '#e3e1ec'
  on-surface: '#1a1b22'
  on-surface-variant: '#47464a'
  inverse-surface: '#2f3038'
  inverse-on-surface: '#f1effa'
  outline: '#78767b'
  outline-variant: '#c8c5ca'
  surface-tint: '#5f5e60'
  primary: '#000000'
  on-primary: '#ffffff'
  primary-container: '#1c1b1d'
  on-primary-container: '#858386'
  inverse-primary: '#c8c6c8'
  secondary: '#855300'
  on-secondary: '#ffffff'
  secondary-container: '#fea619'
  on-secondary-container: '#684000'
  tertiary: '#000000'
  on-tertiary: '#ffffff'
  tertiary-container: '#002113'
  on-tertiary-container: '#009668'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#e5e1e4'
  primary-fixed-dim: '#c8c6c8'
  on-primary-fixed: '#1c1b1d'
  on-primary-fixed-variant: '#474649'
  secondary-fixed: '#ffddb8'
  secondary-fixed-dim: '#ffb95f'
  on-secondary-fixed: '#2a1700'
  on-secondary-fixed-variant: '#653e00'
  tertiary-fixed: '#6ffbbe'
  tertiary-fixed-dim: '#4edea3'
  on-tertiary-fixed: '#002113'
  on-tertiary-fixed-variant: '#005236'
  background: '#fbf8ff'
  on-background: '#1a1b22'
  surface-variant: '#e3e1ec'
typography:
  display-hero:
    fontFamily: Plus Jakarta Sans
    fontSize: 48px
    fontWeight: '700'
    lineHeight: 56px
    letterSpacing: -0.03em
  display-hero-mobile:
    fontFamily: Plus Jakarta Sans
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 38px
    letterSpacing: -0.025em
  headline-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-lg-mobile:
    fontFamily: Plus Jakarta Sans
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 30px
    letterSpacing: -0.015em
  headline-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 22px
    fontWeight: '600'
    lineHeight: 28px
    letterSpacing: -0.015em
  headline-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 24px
    letterSpacing: -0.01em
  body-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 26px
    letterSpacing: -0.005em
  body-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 22px
    letterSpacing: 0em
  body-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 18px
    letterSpacing: 0em
  label-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 13px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.01em
  label-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 11px
    fontWeight: '600'
    lineHeight: 14px
    letterSpacing: 0.04em
  price-numeral:
    fontFamily: Plus Jakarta Sans
    fontSize: 20px
    fontWeight: '700'
    lineHeight: 24px
    letterSpacing: -0.02em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  gutter: 1rem
  gutter-lg: 1.5rem
  margin: 1rem
  margin-md: 2rem
  margin-lg: 3rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 0.875rem
  space-lg: 1.25rem
  space-xl: 2rem
---

## Brand & Style

This design system establishes a high-performance, ultra-clean deal intelligence aesthetic. Rather than mimicking noisy, discount-driven coupon portals saturated with flashing banners and chaotic countdown timers, the interface treats deal discovery with the quiet rigor of modern fintech and elite developer tooling.

The brand balances razor-sharp utility with controlled charisma. The mascot identity—a stylized duck hero—is rendered as a sleek, geometric vector mark and micro-accent rather than an intrusive comic illustration. Clean geometry, disciplined data density, generous negative space, and crisp micro-borders create an elevated editorial standard. Users should feel empowered, efficient, and sophisticated, navigating bargains through the lens of calculated value rather than impulse hype.

## Colors

The palette employs a high-contrast monochrome foundation grounded in deep carbon (`#09090b`) and slate zinc gradations, punctuated by a surgical application of warm amber gold (`#F59E0B`).

- **Primary (`#09090b`):** Anchors high-priority actions, dominant typography, and solid primary interaction targets.
- **Secondary Accent (`#F59E0B`):** Reserved exclusively for discount ratios, lightning-deal indicators, hot coupon badges, and subtle mascot accents. Never applied across massive surface fills; its power comes from high-contrast restraint.
- **Tertiary Utility (`#10B981`):** Applied strictly to validated status states, verified coupon confirmations, and active price-drop delta indicators.
- **Neutrals & Surfaces:** Pure white (`#ffffff`) serves as the base light surface, surrounded by crisp cool zinc containers (`#f4f4f5`, `#e4e4e7`) and structural boundary borders (`#e4e4e7` in light mode, `#27272a` in dark mode). Secondary text rests at `#71717a`, securing balanced legibility without visual drag.

## Typography

Plus Jakarta Sans is utilized uniformly across headline, body, and label roles to preserve contemporary neo-grotesque continuity. The typeface's wide geometric apertures and sharp joins reinforce a technical, ultra-clean character.

- **Numerics & Price Tiers:** Prices utilize `price-numeral` with tabular figures (`tnum`) enabled via font-variant features, avoiding horizontal jitter during dynamic price filtering or live voucher validation.
- **Hierarchy Rules:** Deal titles must never exceed `headline-sm` in card grids to preserve compact scanning velocity. Sub-labels, expiry timestamps, and community verification votes rely on uppercase `label-sm` with slight positive tracking (+0.04em) to project systematic, dashboard-like clarity.

## Layout & Spacing

The structural layout uses a flexible 12-column grid bound to a strict max-width container of `1280px` for desktop environments. Negative space is treated as an active organizational tool rather than passive emptiness.

- **Breakpoints & Containers:**
  - Mobile (`< 768px`): 4-column layout, outer screen margin `margin` (`1rem`), card gutters `gutter` (`1rem`).
  - Tablet (`768px - 1024px`): 8-column layout, outer screen margin `margin-md` (`2rem`).
  - Desktop (`> 1024px`): 12-column layout, max width `1280px`, outer screen margin `margin-lg` (`3rem`), card gutters `gutter-lg` (`1.5rem`).
- **Rhythm & Alignments:** Deal feeds organize items using dense CSS Grid auto-fills with a minimum card width of `280px`. Vertical spacing within elements stays strictly within multiples of `0.25rem`, enforcing balanced horizontal scanning without information collision.

## Elevation & Depth

Visual hierarchy abandons heavy, diffuse drop-shadows in favor of structural micro-borders, surface layering, and translucent glassmorphism.

- **Micro-Borders:** Primary separation relies on crisp 1px borders using `rgba(9, 9, 11, 0.08)` on light surfaces and `rgba(244, 244, 245, 0.12)` in dark contexts.
- **Glassmorphism:** Sticky navigation headers, deal filter rails, and floating coupon toast bars utilize semi-transparent backing (`rgba(255, 255, 255, 0.82)` in light mode, `rgba(9, 9, 11, 0.82)` in dark mode) paired with a `12px` backdrop blur (`backdrop-filter: blur(12px)`).
- **Subtle Elevation:** Cards rest completely flat on default presentation. On desktop hover, cards elevate through a single, refined micro-shadow: `0 4px 20px -2px rgba(0, 0, 0, 0.05)`, accompanied by a subtle border shift to `rgba(9, 9, 11, 0.16)`.

## Shapes

The interface balances sharp industrial lines with calibrated roundedness (`roundedness: 2`).

- **Cards and Dialogs:** Standard interactive surfaces feature `0.75rem` (`12px`) corner radii, retaining structure without looking blunt.
- **Badges and Filters:** Category chips, price delta tags, coupon codes, and mascot avatar frames utilize full pill geometry (`9999px`), creating immediate functional contrast against rectangular content cards.
- **Inputs and Action Buttons:** Form elements and primary buttons use standard `0.5rem` (`8px`) radii to maintain precise alignment with grid boundaries.

## Components

### Buttons
- **Primary:** Solid carbon (`#09090b`), text pure white, height `40px`, padding `0 18px`, `border-radius: 8px`. Hover state lightens subtly to `#27272a`.
- **Secondary / Ghost:** Transparent background with 1px border (`#e4e4e7`), carbon text, transitions to `#f4f4f5` surface fill on pointer focus.
- **Deal Claim CTA:** Compact, high-intent action button featuring an amber accent border (`#F59E0B`), dark zinc background, and clean arrow icon affix.

### Deal Cards
- Base surface pure white (`#ffffff`) wrapped in a 1px `#e4e4e7` micro-border. No initial shadow.
- Interior architecture: 
  - Top bar houses retail source icon, mascot-verified tick, and discount pill badge.
  - Center area hosts high-fidelity product imagery on clean neutral backing (`#fafafa`) with consistent inset margins.
  - Base level showcases the dual price cluster: bold discounted price (`#09090b`), crossed-out retail price (`#a1a1aa`), and amber savings badge (`#F59E0B` text on `rgba(245, 158, 11, 0.1)` fill).

### Badges & Pill Tags
- **Percentage Drop Badge:** Pill format, font size `11px`, bold weight, amber accent fill (`rgba(245, 158, 11, 0.12)`), solid amber text (`#D97706`).
- **Store / Platform Badges:** Cool zinc subtle background (`#f4f4f5`), dark charcoal text, minimal 1px border.

### Filter Chips
- Pill geometry (`rounded-full`), height `32px`, padding `0 14px`.
- Inactive state: white background, `#e4e4e7` outline, `#71717a` text.
- Active state: `#09090b` background, `#ffffff` text, borderless.

### Input Fields & Search Bars
- Global search uses an elongated pill or soft-rounded shape, height `44px`, background `#f4f4f5`, crisp 1px border `transparent` expanding to `#09090b` on focus. Prefixed with a muted monochrome search glyph and a keyboard shortcut tag (`⌘K`).

### Mascot Integration
- The duck mascot appears strictly as a monochrome or gold-accented vector icon: inside verified deal seals, system empty states with minimalist line art, and as a stylized header mark. It never features comic dialogue bubbles or saturated novelty art.