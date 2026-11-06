# PatoBarato web v3 — Rediseño y cupones: plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aplicar el rediseño visual de la maqueta a patobarato.com sobre los datos existentes y añadir cupones (tabla, vista, bloque en portada y página `/cupones`).

**Architecture:** Evolución en sitio de la web v2: se mantienen las páginas servidor con ISR y el feed cliente; se cambian tokens y componentes uno a uno y se añaden componentes, rutas y dos migraciones. Durante la transición los tokens antiguos (`carbon`, `amber`…) quedan como alias de los nuevos para que ningún componente se rompa a medias; la última tarea los elimina.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, Tailwind v4, Vitest + Testing Library, Supabase (Postgres, PostgREST, clave anon), @fontsource.

**Spec:** `docs/superpowers/specs/2026-11-06-patobarato-web-rediseno-design.md`

## Global Constraints

- Node >= 22.12; comandos desde `web/` (`npm test`, `npm run typecheck`, `npm run lint`, `npm run build`). En red corporativa: `NODE_OPTIONS=--use-system-ca` solo en el entorno, nunca en el repo.
- La web lee únicamente las vistas `web_deals`, `web_hashtags` y `web_coupons` con la clave anon. Nunca `service_role`.
- Nada de afirmaciones falsas: ninguna tienda distinta de Amazon en hero, títulos o metadatos salvo que tenga cupones vigentes; «Mínimo histórico» solo con `is_lowest = true`; sin cifras inventadas.
- Textos en español de España. Copy fijado por la spec (§5) se copia literal.
- Accesibilidad AA: contraste ≥ 4.5:1, foco visible, objetivos ≥ 44 px, `aria-label` en botones solo-icono, botones y enlaces reales.
- Tokens (spec §4): `ink #14161A`, `muted #5B6470`, `line #E6E8EC`, `surface #F6F7F9`, `primary #1F4FD1`, `primary-hover #163EA8`, `primary-soft #E8EEFC`, `accent #FFD24D`, `accent-ink #3D2E00`, `danger #B42318`, `success #14633A`, `success-soft #E3F6EA`, `warm #FFFBE8`, `warm-line #F3E4A6`. Fuentes: Inter (cuerpo), Space Grotesk (titulares y precios).
- No se rompe: búsqueda, `?q=`/`?tag=`, «Cargar más», `/oferta/...`, `/chollos/{tag}`, `/go/{ASIN}`, sitemap, aviso de afiliado.
- Cada tarea termina con tests en verde y un commit en `main` con mensaje `tipo(web): …` como los existentes.

## Review Focus

1. Un producto con una sola publicación nunca muestra «Mínimo histórico» aunque su precio sea el más bajo visto (test en Tarea 2: `is_lowest` falso → sin etiqueta; y SQL de la vista con `previous_min_price` null).
2. `?orden=` con un valor desconocido (`?orden=xyz`) debe tratarse como «recientes», sin error ni petición rara a Supabase (test en Tarea 6).
3. Cupón caducado o futuro insertado en `coupons` no aparece en `/cupones` ni en portada (verificación SQL en Tarea 4 y test de `fetchCoupons` en Tarea 3 que solo mapea; el filtro vive en la vista).
4. Sin cupones, la portada no menciona otras tiendas ni «cupones» en los metadatos, y `/cupones` es `noindex` con estado vacío (tests en Tarea 10).
5. Sin evento en 45 días, la barra de anuncio no se muestra y nada se rompe en el calendario (test en Tarea 5 y Tarea 8).

---

### Task 1: Tokens, fuentes y logo

**Files:**
- Modify: `web/src/app/globals.css`, `web/package.json`
- Create: `recursos/patobarato-logo-vector.svg` (copia del SVG generado en la sesión de diseño, paleta nueva)
- Modify: `web/public/logo.svg` (mismo contenido), `prototipo/DESIGN.md`
- Test: `web/src/app/globals.test.ts`

**Interfaces:**
- Produces: clases Tailwind `bg-ink`, `text-muted`, `border-line`, `bg-surface`, `bg-primary`, `hover:bg-primary-hover`, `bg-primary-soft`, `bg-accent`, `text-accent-ink`, `bg-danger`, `text-success`, `bg-success-soft`, `bg-warm`, `border-warm-line`, `font-sans` (Inter), `font-display` (Space Grotesk). Alias temporales: `carbon`→ink, `carbon-soft`→`#2B3039`, `amber`→accent, `amber-ink`→accent-ink, `mint`→success, `zinc-*` se mantienen hasta la Tarea 13.

- [ ] **Step 1: Test que fija los tokens**

```ts
// web/src/app/globals.test.ts
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
const css = readFileSync(new URL('./globals.css', import.meta.url), 'utf8')
describe('design tokens', () => {
  it.each([
    ['--color-ink', '#14161a'], ['--color-muted', '#5b6470'], ['--color-primary', '#1f4fd1'],
    ['--color-accent', '#ffd24d'], ['--color-danger', '#b42318'], ['--color-success', '#14633a'],
  ])('defines %s = %s', (name, value) => {
    expect(css.toLowerCase()).toContain(`${name}: ${value}`)
  })
  it('uses Inter and Space Grotesk', () => {
    expect(css).toMatch(/--font-sans:\s*"Inter"/)
    expect(css).toMatch(/--font-display:\s*"Space Grotesk"/)
    expect(css).not.toContain('plus-jakarta-sans')
  })
})
```

- [ ] **Step 2: Ejecutar `npx vitest run src/app/globals.test.ts`** — Expected: FAIL (tokens ausentes).
- [ ] **Step 3: `npm uninstall @fontsource/plus-jakarta-sans && npm install @fontsource/inter @fontsource/space-grotesk`**; en `globals.css` importar Inter 400/500/600/700 y Space Grotesk 500/600/700, definir en `@theme` todos los tokens de Global Constraints con los nombres `--color-<token>`, más `--font-sans: "Inter", system-ui, sans-serif` y `--font-display: "Space Grotesk", "Inter", sans-serif`, y los alias temporales del bloque Interfaces. Mantener `@utility price`.
- [ ] **Step 4: Copiar el logo**: `recursos/patobarato-logo-vector.svg` (lo entrega el usuario desde la sesión de diseño; es el de 6 trazos con `#D9342B`/`#FFD24D`) y el mismo fichero a `web/public/logo.svg`. Comprobar con `grep -c "<path" web/public/logo.svg` → `6`.
- [ ] **Step 5: Actualizar `prototipo/DESIGN.md`**: sustituir la sección `colors` por los tokens nuevos y `typography` por Inter/Space Grotesk con los tamaños de la spec (H1 60/36 px, H2 32/24 px, precio tarjeta 24 px).
- [ ] **Step 6: `npx vitest run src/app/globals.test.ts && npm run build`** — Expected: PASS y build OK (los alias mantienen las clases antiguas).
- [ ] **Step 7: Commit** `feat(web): new design tokens, fonts and vector logo`

### Task 2: Vista `web_deals` v3 y capa de datos de chollos

**Files:**
- Create: `supabase/migrations/20261106000000_web_deals_v3.sql`
- Modify: `web/src/lib/types.ts`, `web/src/lib/deals.ts`
- Test: `web/src/lib/deals.test.ts`

**Interfaces:**
- Produces: `Deal` gana `discountPct: number | null`, `previousMinPrice: number | null`, `isLowest: boolean`. `export type DealSort = 'recientes' | 'descuento' | 'minimo'`; `export const DEAL_SORTS: readonly DealSort[]`; `export function parseDealSort(raw: string | null | undefined): DealSort` (desconocido → `'recientes'`). `fetchDeals(client, { q?, tag?, sort?, page })`.

- [ ] **Step 1: Tests**

```ts
// añadir a deals.test.ts (ampliar `row` con discount_pct: 40, previous_min_price: '34.99', is_lowest: true)
it('maps the v3 columns and defaults them when absent', async () => {
  const { client } = fakeClient({ data: [{ ...row(1), discount_pct: null, previous_min_price: null, is_lowest: null }], error: null })
  const { deals } = await fetchDeals(client, { page: 0 })
  expect(deals[0]).toMatchObject({ discountPct: null, previousMinPrice: null, isLowest: false })
})
it('orders by discount for sort=descuento', async () => {
  const { client, calls } = fakeClient({ data: [], error: null })
  await fetchDeals(client, { page: 0, sort: 'descuento' })
  expect(calls).toContainEqual(['order', ['discount_pct', { ascending: false, nullsFirst: false }]])
  expect(calls).toContainEqual(['order', ['published_at', { ascending: false }]])
})
it('filters is_lowest for sort=minimo', async () => {
  const { client, calls } = fakeClient({ data: [], error: null })
  await fetchDeals(client, { page: 0, sort: 'minimo' })
  expect(calls).toContainEqual(['eq', ['is_lowest', true]])
})
it('parseDealSort falls back to recientes', () => {
  expect(parseDealSort('xyz')).toBe('recientes'); expect(parseDealSort(undefined)).toBe('recientes'); expect(parseDealSort('minimo')).toBe('minimo')
})
```

- [ ] **Step 2: `npx vitest run src/lib/deals.test.ts`** — Expected: FAIL.
- [ ] **Step 3: Escribir la migración** `create or replace view web_deals` con las columnas actuales más `discount_pct integer` (`case when previous_price > price and price > 0 then round((previous_price - price) / previous_price * 100)::int end`), `previous_min_price numeric` (subconsulta lateral: `min(published_price)` de `publications` del mismo `product_id` y `country` con `published_at < p.published_at`), `is_lowest boolean` (`previous_min_price is not null and price <= previous_min_price`). Misma cláusula `distinct on`/`order`. `revoke all` + `grant select` a `anon, authenticated`.
- [ ] **Step 4: Implementar** `DealRow`/`toDeal` con las tres columnas (null → `null`/`false`), `DealSort`, `DEAL_SORTS`, `parseDealSort`, y en `fetchDeals` aplicar `sort` antes de `range`: `descuento` → `.order('discount_pct', { ascending: false, nullsFirst: false })` + fecha + id; `minimo` → `.eq('is_lowest', true)` + fecha + id; `recientes` → como hoy. Ampliar `fakeClient` con `'eq'` ya existente; actualizar las expectativas de orden de los tests existentes si cambia la secuencia.
- [ ] **Step 5: `npx vitest run src/lib/deals.test.ts && npm run typecheck`** — Expected: PASS.
- [ ] **Step 6: Commit** `feat(web): web_deals v3 columns and deal sorting`

### Task 3: Tabla `coupons`, vista `web_coupons`, `lib/coupons.ts` y tiendas

**Files:**
- Create: `supabase/migrations/20261106010000_coupons.sql`, `web/src/lib/coupons.ts`, `web/src/lib/coupons.test.ts`
- Modify: `web/src/lib/types.ts`, `web/src/lib/stores.ts`

**Interfaces:**
- Produces: `export type Coupon = { id: number; store: string; code: string; title: string; conditions: string | null; url: string | null; startsAt: string; expiresAt: string | null }`; `fetchCoupons(client: SupabaseClient, limit?: number): Promise<Coupon[]>`; `STORES` con `aliexpress`, `pccomponentes`, `mediamarkt`, `elcorteingles`, `decathlon` (`name`, `short`, `cta` «Ir a {short}»); `export function storeNames(stores: string[]): string[]` (nombres cortos únicos en orden de aparición, Amazon primero).

- [ ] **Step 1: Tests** en `coupons.test.ts` (mismo `fakeClient` que `deals.test.ts`, extraído a `web/src/test-utils/fakeClient.ts` y reutilizado por ambos):

```ts
it('reads web_coupons ordered by store and expiry', async () => {
  const { client, calls } = fakeClient({ data: [{ id: 1, store: 'aliexpress', code: 'PATO6', title: '−6 € en 40 €', conditions: null, url: null, starts_at: '2026-11-01T00:00:00Z', expires_at: null }], error: null })
  const coupons = await fetchCoupons(client, 4)
  expect(calls).toEqual([['from', ['web_coupons']], ['select', ['*']], ['order', ['store', { ascending: true }]], ['order', ['expires_at', { ascending: true, nullsFirst: false }]], ['limit', [4]]])
  expect(coupons[0]).toEqual({ id: 1, store: 'aliexpress', code: 'PATO6', title: '−6 € en 40 €', conditions: null, url: null, startsAt: '2026-11-01T00:00:00Z', expiresAt: null })
})
it('storeNames keeps Amazon first and dedupes', () => {
  expect(storeNames(['pccomponentes', 'amazon', 'pccomponentes', 'aliexpress'])).toEqual(['Amazon', 'PcComponentes', 'AliExpress'])
})
```

- [ ] **Step 2: `npx vitest run src/lib/coupons.test.ts`** — Expected: FAIL.
- [ ] **Step 3: Migración** con el SQL de la spec §6.2 literal.
- [ ] **Step 4: Implementar** `Coupon`, `fetchCoupons` (sin `limit` → sin `.limit`), `STORES` ampliado y `storeNames`.
- [ ] **Step 5: `npx vitest run src/lib && npm run typecheck`** — Expected: PASS.
- [ ] **Step 6: Commit** `feat(web): coupons table, public view and data helpers`

### Task 4: Aplicar las migraciones al proyecto de Supabase

**Files:**
- Create: `web/scripts/check-views.mjs` (comprobación con la clave anon; no se ejecuta en CI)

- [ ] **Step 1: Pedir al usuario** el token de acceso personal de Supabase (Management API) o la contraseña de la base de datos. No se guarda en el repo.
- [ ] **Step 2: Aplicar** `20261106000000_web_deals_v3.sql` y `20261106010000_coupons.sql` en ese orden (Management API `POST /v1/projects/{ref}/database/query`, o `npx supabase db push` con la contraseña) y registrarlas en `supabase_migrations.schema_migrations` si se usa la API.
- [ ] **Step 3: Script** `check-views.mjs`: con `NEXT_PUBLIC_SUPABASE_URL`/`ANON_KEY` de `.env.local`, hace `select('*').limit(1)` sobre `web_deals` (espera las claves `discount_pct`, `previous_min_price`, `is_lowest`), `web_coupons` (espera `[]` o filas) y `coupons` (espera **error**: sin permiso). Imprime `OK` o la discrepancia y sale con código 1.
- [ ] **Step 4: `node web/scripts/check-views.mjs`** — Expected: `OK`.
- [ ] **Step 5: Insertar un cupón de prueba caducado** (`expires_at = now() - interval '1 day'`) vía SQL y confirmar que `web_coupons` no lo devuelve; borrarlo después.
- [ ] **Step 6: Commit** `chore(supabase): apply v3 migrations and add anon view check`

### Task 5: Calendario de eventos

**Files:**
- Create: `web/src/content/events.ts`, `web/src/lib/events.ts`, `web/src/lib/events.test.ts`

**Interfaces:**
- Produces: `export type SiteEvent = { id: string; name: string; date: string /* YYYY-MM-DD */; stores: string[]; approximate?: boolean }`; `EVENTS: SiteEvent[]` (11.11 AliExpress 2026-11-11 `['aliexpress']`; Black Friday 2026-11-27 `['amazon','pccomponentes','mediamarkt']`; Cyber Monday 2026-11-30 `['amazon','pccomponentes']`; Rebajas de enero 2027-01-07 `[]`; Prime Day 2027-07-01 `['amazon']` `approximate: true`); `daysUntil(event, now: Date): number` (días naturales en Europe/Madrid, 0 = hoy); `nextEvent(now, events = EVENTS): SiteEvent | null` (primero con `daysUntil >= 0`); `upcomingEvents(now, n, events = EVENTS): SiteEvent[]`; `eventDateLabel(event): string` («11 nov», o «julio» si `approximate`).

- [ ] **Step 1: Tests**

```ts
const now = new Date('2026-11-06T10:00:00Z')
it('nextEvent is the first future event', () => expect(nextEvent(now)?.id).toBe('aliexpress-1111'))
it('daysUntil counts calendar days', () => expect(daysUntil(EVENTS[0], now)).toBe(5))
it('today counts as 0 and yesterday is skipped', () => {
  const e = [{ id: 'a', name: 'A', date: '2026-11-05', stores: [] }, { id: 'b', name: 'B', date: '2026-11-06', stores: [] }]
  expect(nextEvent(now, e)?.id).toBe('b'); expect(daysUntil(e[1], now)).toBe(0)
})
it('upcomingEvents limits and skips past', () => expect(upcomingEvents(now, 2).map((e) => e.id)).toEqual(['aliexpress-1111', 'black-friday']))
it('labels approximate dates by month', () => expect(eventDateLabel(EVENTS[4])).toBe('julio'))
it('returns null with no future event', () => expect(nextEvent(new Date('2030-01-01'), EVENTS)).toBeNull())
```

- [ ] **Step 2: `npx vitest run src/lib/events.test.ts`** — FAIL.
- [ ] **Step 3: Implementar** (para «días naturales» comparar las fechas `YYYY-MM-DD` de `now` en `Europe/Madrid` vía `Intl.DateTimeFormat('en-CA', { timeZone })` con la del evento).
- [ ] **Step 4: Tests PASS.**
- [ ] **Step 5: Commit** `feat(web): static events calendar and helpers`

### Task 6: Orden en la URL (`?orden=`)

**Files:**
- Modify: `web/src/hooks/useUrlFilters.ts`, `web/src/hooks/useDeals.ts`, `web/src/components/DealFeed.tsx` (solo paso del parámetro), `web/src/components/HomeClient.tsx`, `web/next.config.ts`, `web/src/app/buscar/page.tsx`
- Test: `web/src/hooks/useUrlFilters.test.tsx`, `web/src/hooks/useDeals.test.tsx`

**Interfaces:**
- Consumes: `DealSort`, `parseDealSort` (Tarea 2).
- Produces: `useUrlFilters()` devuelve además `sort: DealSort` y `setSort(sort: DealSort)` (`recientes` borra el parámetro; cambio con `push`); `DealsFetcher` y `useDeals` aceptan `sort` en `Filters` (parte de la clave de filtros, reinicia a página 0); `InitialDeals` incluye `sort`.

- [ ] **Step 1: Tests**: en `useUrlFilters.test.tsx`, `?orden=descuento` → `sort === 'descuento'`; `?orden=xyz` → `'recientes'`; `setSort('minimo')` escribe `orden=minimo`; `setSort('recientes')` elimina el parámetro. En `useDeals.test.tsx`, cambiar `sort` vuelve a pedir página 0 con `sort` en los parámetros del fetcher.
- [ ] **Step 2: Ejecutar ambos** — FAIL.
- [ ] **Step 3: Implementar**; en `next.config.ts` añadir la reescritura `{ source: '/', has: [{ type: 'query', key: 'orden' }], destination: '/buscar' }` y en `buscar/page.tsx` nada nuevo salvo pasar el estado inicial (sigue `noindex`). `HomeClient` pasa `sort` al `DealFeed` y `initialDeals` lleva `sort: 'recientes'`.
- [ ] **Step 4: `npm test && npm run typecheck`** — PASS.
- [ ] **Step 5: Commit** `feat(web): deal sort in the URL`

### Task 7: Cabecera, menú móvil y pie

**Files:**
- Create: `web/src/components/MobileNav.tsx`, `web/src/components/MobileNav.test.tsx`, `web/src/components/Footer.test.tsx`
- Modify: `web/src/components/Header.tsx`, `web/src/components/Footer.tsx`
- Test: `web/src/components/Header.test.tsx` (crear)

**Interfaces:**
- Produces: `NAV_LINKS: { label: string; href: string }[]` exportado desde `Header.tsx` = Chollos `/#chollos`, Cupones `/cupones`, Cómo funciona `/#como-funciona`, Telegram `/#telegram`. `Header({ search })` sin cambios de firma. `MobileNav({ links })`: botón `aria-label="Abrir menú"` con `aria-expanded`, panel con los enlaces, se cierra al pulsar un enlace o Escape. `Footer({ year, couponStores }: { year: number; couponStores?: string[] })`: aviso de afiliado de Amazon siempre; frase «También participamos en los programas de afiliados de {tiendas}.» solo si `couponStores` tiene tiendas distintas de Amazon.

- [ ] **Step 1: Tests**: Header muestra el logo (`alt="PatoBarato"`), los cuatro enlaces en un `nav` con `aria-label="Principal"` y el botón «Unirme al canal» a `https://t.me/patobarato`. MobileNav: `aria-expanded` pasa a `true` al pulsar, Escape lo cierra. Footer: con `couponStores={['aliexpress']}` aparece «AliExpress» en el texto de afiliados; sin prop no aparece; enlaces a `/aviso-legal`, `/privacidad`, `/cookies`, `/afiliados`, `/contacto`, `/cupones`.
- [ ] **Step 2: FAIL.**
- [ ] **Step 3: Implementar** con los tokens nuevos (cabecera blanca fija, logo `h-11 md:h-11` / `h-8` en móvil, botón `bg-primary`; pie con tres columnas de la spec §5.10 y el copy literal).
- [ ] **Step 4: PASS**, `npm run typecheck`.
- [ ] **Step 5: Commit** `feat(web): new header, mobile nav and footer`

### Task 8: Hero y barra de anuncio

**Files:**
- Create: `web/src/components/AnnouncementBar.tsx` + test
- Modify: `web/src/components/Hero.tsx`, `web/src/components/Hero.test.tsx`

**Interfaces:**
- Consumes: `SiteEvent`, `daysUntil` (Tarea 5); `timeAgo` (`lib/format`).
- Produces: `Hero({ highlights }: { highlights: HeroHighlights })` con `export type HeroHighlights = { topDiscountPct: number | null; topDiscountTitle: string | null; latestCouponTitle: string | null; hasLowest: boolean }`. `AnnouncementBar({ event, latestPublishedAt, now }: { event: SiteEvent | null; latestPublishedAt: string | null; now: Date })` → `null` si `event` es null.

- [ ] **Step 1: Tests**: Hero con `highlights` completos muestra tres etiquetas (`-42%` + título, «Cupón» + título, «Mínimo histórico»); con todo nulo/falso no hay ninguna etiqueta (`queryByTestId('hero-badge')` → null); H1 y los dos botones (`/#chollos`, Telegram) presentes; imagen `alt="Mascota de PatoBarato, un pato superhéroe"`. AnnouncementBar: con evento a 5 días y última oferta hace 12 min → texto «11.11 AliExpress en 5 días · Última oferta publicada hace 12 min»; evento hoy → «hoy»; sin evento → no renderiza; sin `latestPublishedAt` → sin la segunda parte.
- [ ] **Step 2: FAIL.**
- [ ] **Step 3: Implementar** según spec §5.1 y §5.3 (copy literal del H1, frase, garantías y botones; pato `src="/pato-heroe.svg"` 360 px / 200 px móvil sobre dos círculos `bg-accent` con `opacity-35`/`opacity-55`).
- [ ] **Step 4: PASS.**
- [ ] **Step 5: Commit** `feat(web): hero with real highlights and announcement bar`

### Task 9: Tarjeta, selector de orden, chips, feed y ficha de producto

**Files:**
- Create: `web/src/components/SortSelector.tsx` + test
- Modify: `web/src/components/DealCard.tsx` (+ test), `HashtagChips.tsx`, `DealFeed.tsx` (+ test), `ProductView.tsx` (+ test)

**Interfaces:**
- Consumes: `Deal.discountPct/isLowest/coupon`, `DealSort`, `DEAL_SORTS`.
- Produces: `SortSelector({ value, onChange }: { value: DealSort; onChange: (s: DealSort) => void })` como grupo de botones `role="group" aria-label="Ordenar"` con `aria-pressed`; etiquetas «Más recientes», «Mayor descuento», «Mínimo histórico». `DealFeed` gana props `sort` y `onSort?`; sin `onSort` no pinta el selector (así `HashtagClient` y `/chollos/{tag}` siguen solo con «recientes»).

- [ ] **Step 1: Tests**: DealCard muestra badge `-40%` desde `discountPct` (no recalcula), chip «Cupón» si `coupon`, etiqueta «Mínimo histórico» si `isLowest`, ninguna de las tres en el `minimal`, sigue siendo un único enlace; SortSelector marca `aria-pressed` y llama a `onChange`; DealFeed renderiza el selector y propaga; ProductView muestra «Mínimo histórico» junto al precio cuando `isLowest`.
- [ ] **Step 2: FAIL.**
- [ ] **Step 3: Implementar** con el diseño de la spec §5.4 (tokens: badge `bg-danger text-white`, chip `bg-accent text-accent-ink`, etiqueta `bg-success-soft text-success`, pie «Ver chollo →» `bg-primary-soft text-primary`; chips `bg-ink` activo / `bg-surface` resto; subtítulo «Se actualiza automáticamente»).
- [ ] **Step 4: PASS.**
- [ ] **Step 5: Commit** `feat(web): redesigned deal cards, sort selector and product badges`

### Task 10: Cupones en portada y página `/cupones`

**Files:**
- Create: `web/src/components/CouponCard.tsx` (+ test), `web/src/components/CouponsBlock.tsx` (+ test), `web/src/app/cupones/page.tsx`, `web/src/lib/seo.test.ts` (ampliar)
- Modify: `web/src/lib/seo.ts`, `web/src/lib/sitemap.ts` (+ test), `web/src/app/sitemap.ts`

**Interfaces:**
- Consumes: `Coupon`, `fetchCoupons`, `storeInfo`, `storeNames`.
- Produces: `CouponCard({ coupon }: { coupon: Coupon })` (cliente: botón «Copiar» → `navigator.clipboard.writeText(code)`, estado «Copiado» 2 s; si `clipboard` no existe, selecciona el texto del código); `CouponsBlock({ coupons }: { coupons: Coupon[] })` → `null` si vacío, H2 «Cupones de {storeNames}», hasta 4 tarjetas, enlace «Todos los cupones →». `couponsMetadata(count: number): Metadata` (título «Cupones vigentes · PatoBarato», `noindex` si `count === 0`). `homeMetadata` acepta `{ couponStores?: string[] }` y, si hay tiendas, pone `title` «PatoBarato · Chollos y cupones de Amazon» + « y otras tiendas» cuando alguna no es Amazon. `buildSitemap(deals, tags, siteUrl, extra: { coupons: boolean })` añade `/cupones` si `coupons` y siempre las cinco páginas legales.

- [ ] **Step 1: Tests**: CouponCard copia al portapapeles (mock `navigator.clipboard`) y muestra «Copiado»; sin clipboard no lanza error; muestra «Caduca 11 nov» desde `expiresAt`; `url` → enlace «Ir a AliExpress». CouponsBlock vacío → null; con dos tiendas → H2 «Cupones de AliExpress y PcComponentes». `homeMetadata({})` sin título; `homeMetadata({ couponStores: ['aliexpress'] }).title` contiene «y otras tiendas». `buildSitemap` incluye `/cupones` solo con `coupons: true` y siempre `/aviso-legal`…
- [ ] **Step 2: FAIL.**
- [ ] **Step 3: Implementar** componentes, `app/cupones/page.tsx` (`revalidate = 600`, agrupa por tienda, estado vacío «Ahora mismo no hay cupones vigentes. Los publicamos en el canal en cuanto salen.»), metadatos y sitemap.
- [ ] **Step 4: PASS.**
- [ ] **Step 5: Commit** `feat(web): coupons block and /cupones page`

### Task 11: Bloques de contenido y montaje de la portada

**Files:**
- Create: `web/src/components/HowItWorks.tsx`, `EventsBlock.tsx` (+ test), `AboutBlock.tsx`
- Modify: `web/src/components/TelegramBlock.tsx`, `HomeClient.tsx` (+ test), `web/src/app/page.tsx`

**Interfaces:**
- Consumes: todo lo anterior.
- Produces: `page.tsx` carga en paralelo (cada parte `optional`) página 0 de chollos, hashtags, `fetchCoupons(client, 4)` y `fetchLatestDeal`; calcula `highlights` (`topDiscountPct/Title` = mayor `discountPct` de la página 0; `latestCouponTitle` = `coupons[0]?.title`; `hasLowest` = alguna `isLowest`), `event = nextEvent(now)`, `upcoming = upcomingEvents(now, 4)` y `couponStores` (pasado también a `Footer`). `HomeClient` gana props `highlights`, `coupons`, `event`, `upcoming`, `latestPublishedAt`, `couponStores` y monta las secciones en el orden de la spec §5 con los ids `chollos`, `cupones`, `como-funciona`, `eventos`, `sobre`, `telegram`. `EventsBlock({ next, upcoming, now })`: «Próximo gran evento», «Faltan N días» («Es hoy» si 0), lista de `upcoming` con `eventDateLabel`.

- [ ] **Step 1: Tests**: HomeClient renderiza las secciones con sus ids y omite `#cupones` cuando `coupons` está vacío; EventsBlock con `next` null muestra solo la lista; «Faltan 5 días».
- [ ] **Step 2: FAIL.**
- [ ] **Step 3: Implementar** con el copy literal de la spec (§5.6 pasos, §5.8 párrafos, Telegram `bg-ink` + botón blanco).
- [ ] **Step 4: `npm test && npm run typecheck && npm run build`** — PASS.
- [ ] **Step 5: Commit** `feat(web): home sections and assembly`

### Task 12: Páginas legales y contacto

**Files:**
- Create: `web/src/components/LegalLayout.tsx`, `web/src/app/aviso-legal/page.tsx`, `privacidad/page.tsx`, `cookies/page.tsx`, `afiliados/page.tsx`, `contacto/page.tsx`, `web/src/app/legal.test.tsx`

**Interfaces:**
- Produces: `LegalLayout({ title, updated, children })` con `Header` (buscador deshabilitado: `search={null}` admitido por `Header`), H1, fecha «Última actualización: {updated}», cuerpo en prosa (`max-w-prose`), `Footer`. Cada página exporta `metadata` con `title` «{Título} · PatoBarato», canonical y `OG_IMAGE`.

- [ ] **Step 1: Test**: cada página renderiza su H1 («Aviso legal», «Política de privacidad», «Política de cookies», «Política de afiliación», «Contacto») y contiene al menos un `[EMAIL]` o `[TITULAR]`; `/contacto` enlaza a `https://t.me/patobarato`.
- [ ] **Step 2: FAIL.**
- [ ] **Step 3: Redactar** borradores: aviso legal (LSSI: titular `[TITULAR]`, `[NIF]`, `[DIRECCIÓN]`, `[EMAIL]`, objeto, propiedad intelectual, exclusión de responsabilidad sobre precios y enlaces externos); privacidad (RGPD/LOPDGDD: responsable, datos que trata la web —ninguno más allá de registros técnicos del alojamiento—, Telegram como servicio de terceros, derechos); cookies (solo técnicas; Vercel; sin analítica; cómo desactivarlas); afiliación (programa de Afiliados de Amazon EU, enlaces `/go/`, otras tiendas cuando haya cupones, independencia de la selección); contacto (Telegram, `[EMAIL]`, plazo orientativo).
- [ ] **Step 4: PASS.**
- [ ] **Step 5: Commit** `feat(web): legal, affiliate and contact pages`

### Task 13: Imagen Open Graph, documentación, limpieza y verificación final

**Files:**
- Modify: `web/public/og.png`, `web/README.md`, `web/src/app/globals.css` (quitar alias), `web/src/lib/seo.ts` (`OG_IMAGE.alt`)
- Create: `web/scripts/og.html` (plantilla 1200×630 con logo y pato sobre `warm`), `web/scripts/render-og.mjs` (Playwright, captura a 1200×630)

- [ ] **Step 1: Renderizar `og.png`** con `node web/scripts/render-og.mjs` (Playwright ya instalado en el entorno de Claude; si no, en local con `npx playwright`). Comprobar dimensiones con `file web/public/og.png` → `1200 x 630`.
- [ ] **Step 2: Quitar los alias** `carbon`, `carbon-soft`, `amber`, `amber-ink`, `mint`, `zinc-*` de `globals.css`; `grep -rn "carbon\|amber\|mint\|zinc-" web/src` → sin resultados (sustituir restos por tokens nuevos).
- [ ] **Step 3: README**: rutas nuevas (`/cupones`, legales), vista `web_coupons`, parámetro `orden`, scripts `check-views.mjs` y `render-og.mjs`, cómo insertar cupones desde el panel.
- [ ] **Step 4: Verificación completa**: `npm run lint && npm run typecheck && npm test && npm run build` — todo PASS; `node web/scripts/check-views.mjs` → `OK`.
- [ ] **Step 5: Commit** `chore(web): og image, docs and token cleanup` y push a `main`.
