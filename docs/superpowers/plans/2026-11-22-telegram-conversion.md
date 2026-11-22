# Conversión a Telegram — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que la web muestre actividad real del canal (chollos de hoy, último mensaje, suscriptores, últimos mensajes), ofrezca «Avísame del próximo» en cada ficha y mida los clics hacia Telegram sin cookies, con resumen en el admin.

**Architecture:** Supabase añade `channel_stats` (escrita por un runner nuevo del bot), dos vistas públicas (`web_channel_stats`, `web_channel_recent`), la tabla `cta_clicks` (solo inserción anónima) y la vista `cta_clicks_daily` para el admin. La web lee las vistas en servidor y las pasa como props; un componente `TelegramCta` envuelve todos los enlaces al canal y envía un beacon a `/api/clic`, que valida, limita por IP e inserta con la clave anon. El admin añade `/clics`.

**Tech Stack:** Next.js 16 (App Router, ISR), React 19, Tailwind v4, Vitest + Testing Library, Supabase JS; Python 3.12, Telethon, pytest.

**Spec:** `docs/superpowers/specs/2026-11-22-telegram-conversion-design.md` (incluida la sección «Decisiones tras la revisión»).

## Global Constraints

- Web: solo clave anon; lecturas solo de vistas `web_*`; única escritura: insert en `cta_clicks`.
- Nada de cifras inventadas: suscriptores solo si `members >= 100`; «chollos hoy» omitido si 0.
- Sin cookies, IP, user-agent ni identificadores en `cta_clicks` (`placement`, `path`, `created_at`).
- Iconos Lucide; copy en español de España, tuteo, sin emojis (salvo la vista previa del canal).
- `CtaPlacement` = `'header' | 'hero' | 'block' | 'recent' | 'deal' | 'footer' | 'contact'`.
- Tests antes del código; suites verdes antes de cada commit (`npm test` en web/admin, `pytest -q` en bot).
- Commits con la misma autoría que el resto del repo (`git log -1 --format='%an <%ae>'`), vía `git -c user.name=... -c user.email=... commit`.
- Migración nueva: `supabase/migrations/20261125000000_telegram.sql`; `sources_type_check` redefine la lista completa vigente más `channel_stats`.

## Review Focus

1. Un visitante con bloqueador que anula `sendBeacon`/`fetch`: el enlace a Telegram debe abrirse igual (Task 5: test de que `TelegramCta` no llama a `preventDefault` y que `trackCtaClick` captura errores).
2. `/api/clic` con JSON inválido, `placement` desconocido o `path` con `?`: 400 y nada insertado (Task 4).
3. Supabase caído durante el insert: 204 igualmente y la navegación no se ve afectada (Task 4).
4. Sin fila en `channel_stats` ni publicaciones: portada y hero sin cifras ni lista, sin errores (Task 6).
5. Chollo cuyos hashtags no están en `CATEGORY_TAGS` (p. ej. `#oferta`): copy genérico, nunca «chollo de oferta» (Task 7).

---

### Task 1: Migración de base de datos

**Files:**
- Create: `supabase/migrations/20261125000000_telegram.sql`
- Modify: `web/scripts/check-views.mjs` (añadir `web_channel_stats`, `web_channel_recent` a la lista de vistas comprobadas)

**Interfaces:**
- Produces: tabla `channel_stats(id smallint pk default 1 check (id = 1), members integer not null, checked_at timestamptz not null)`; vista `web_channel_stats(members integer|null, checked_at timestamptz|null, posted_today integer, last_posted_at timestamptz|null)` de UNA fila siempre; vista `web_channel_recent(product_id bigint, title text, price numeric, message_id bigint, published_at timestamptz)` ≤ 5 filas; tabla `cta_clicks(id, placement, path, created_at)`; vista `cta_clicks_daily(day date, placement text, clicks bigint)`; fila `sources` tipo `channel_stats`.

- [ ] **Step 1: Escribir la migración** con, en este orden:
  1. `create table channel_stats (...)` como en Interfaces; `alter table channel_stats enable row level security; revoke all on channel_stats from anon, authenticated;`.
  2. `create view web_channel_stats as ...`: una fila SIEMPRE (p. ej. `from (select 1) one left join channel_stats s on s.id = 1`), con `posted_today` = nº de `publications` con `channel = 'telegram' and message_id is not null and status <> 'draft' and published_at >= (date_trunc('day', now() at time zone 'Europe/Madrid') at time zone 'Europe/Madrid')`; `last_posted_at` = `max(published_at)` con los mismos filtros salvo el de fecha.
  3. `create view web_channel_recent as select * from (select distinct on (pu.product_id) pu.product_id, pr.title, pu.published_price as price, pu.message_id, pu.published_at from publications pu join products pr on pr.id = pu.product_id where pu.channel = 'telegram' and pu.message_id is not null and pu.status <> 'draft' order by pu.product_id, pu.published_at desc) r order by r.published_at desc limit 5;`
  4. `revoke all on web_channel_stats, web_channel_recent from anon, authenticated; grant select on web_channel_stats, web_channel_recent to anon, authenticated;`
  5. `create table cta_clicks (id bigint generated always as identity primary key, placement text not null check (placement in ('header','hero','block','recent','deal','footer','contact')), path text not null check (char_length(path) <= 200 and path like '/%'), created_at timestamptz not null default now()); create index cta_clicks_created_idx on cta_clicks (created_at);` RLS on; `revoke all on cta_clicks from anon, authenticated; grant insert on cta_clicks to anon; grant select on cta_clicks to authenticated;` políticas `cta_clicks_anon_insert for insert to anon with check (true)` y `cta_clicks_admin_select for select to authenticated using (is_admin())`.
  6. `create view cta_clicks_daily with (security_invoker = true) as select (created_at at time zone 'Europe/Madrid')::date as day, placement, count(*) as clicks from cta_clicks where created_at >= now() - interval '60 days' group by 1, 2;` `revoke all on cta_clicks_daily from anon, authenticated; grant select on cta_clicks_daily to authenticated;`
  7. `alter table sources drop constraint sources_type_check; alter table sources add constraint sources_type_check check (type in ('telegram_channel','aliexpress_api','awin_promotions','guide_prices','awin_feeds','event_promos','manual','chollometro','channel_stats'));` `insert into sources (type, identifier, country, active, every_minutes) values ('channel_stats','patobarato','ES',true,60) on conflict (type, identifier) do nothing;`
  8. `notify pgrst, 'reload schema';`
- [ ] **Step 2: Añadir las dos vistas a `check-views.mjs`** (misma forma que las existentes).
- [ ] **Step 3: Revisar con `grep -n "security_invoker\|is_admin" supabase/migrations/*.sql`** que la sintaxis coincide con migraciones anteriores (`20261112000000_admin.sql`).
- [ ] **Step 4: Commit** `feat(db): channel stats, recent posts and cta clicks for Telegram conversion`.

### Task 2: Bot — `channel_stats` runner

**Files:**
- Create: `bot/src/patobarato/sources/channel_stats.py`, `bot/tests/test_channel_stats.py`
- Modify: `bot/src/patobarato/storage/repository.py` (abstracta + `MemoryRepository`), `bot/src/patobarato/storage/supabase_repo.py`, `bot/src/patobarato/main.py` (`build_runners`, `run`), `bot/tests/test_repository.py`, `bot/tests/test_supabase_repo_rows.py`

**Interfaces:**
- Consumes: `ApiSourceRunner` protocol (`type: str`, `async run(source: ApiSource)`), `Settings.target_channel`, Telethon `TelegramClient`.
- Produces: `Repository.upsert_channel_stats(members: int, checked_at: datetime) -> None`; `MemoryRepository.channel_stats: dict | None`; `ChannelStatsSource(client, repo, target: str, clock)` con `type = "channel_stats"`; `build_runners(..., bot: TelegramClient | None = None)`.

- [ ] **Step 1: Tests fallando** en `test_channel_stats.py`: (a) `test_run_stores_participant_count`: cliente falso cuyo `__call__` de `GetFullChannelRequest` devuelve un objeto con `.full_chat.participants_count = 1234` → `repo.channel_stats == {"members": 1234, "checked_at": clock()}`; (b) `test_run_logs_and_swallows_errors`: cliente que lanza `RuntimeError("boom")` → no excepción, `repo.channel_stats is None`, `caplog` contiene `ChannelStats` a nivel WARNING. En `test_repository.py`: `test_upsert_channel_stats_replaces_row`. En `test_supabase_repo_rows.py`: `test_upsert_channel_stats_upserts_id_1` (tabla `channel_stats`, `upsert({"id": 1, "members": ..., "checked_at": iso})`).
- [ ] **Step 2: Ejecutar** `python -m pytest bot/tests/test_channel_stats.py -q` → falla por import.
- [ ] **Step 3: Implementar** `upsert_channel_stats` en los tres repos; `ChannelStatsSource.run`: `full = await self._client(functions.channels.GetFullChannelRequest(channel=self._target))`; `members = full.full_chat.participants_count`; `await self._repo.upsert_channel_stats(members, self._clock())`; `logger.info("ChannelStats: %d members", members)`; `except Exception as e: logger.warning("ChannelStats: failed: %s: %s", type(e).__name__, e)`. En `build_runners` añadir parámetro `bot: TelegramClient | None = None` y `if bot is not None: runners.append(ChannelStatsSource(bot, repo, settings.target_channel, clock))`; en `run()` pasar `bot=bot`.
- [ ] **Step 4: Ejecutar** `python -m pytest -q` → todo verde.
- [ ] **Step 5: Commit** `feat(bot): hourly channel member count for the web`.

### Task 3: Web — `lib/telegram.ts` y `RequestLimiter`

**Files:**
- Create: `web/src/lib/telegram.ts`, `web/src/lib/telegram.test.ts`
- Modify: `web/src/lib/rate-limit.ts`, `web/src/lib/rate-limit.test.ts`

**Interfaces:**
- Produces:
  - `TELEGRAM_URL = 'https://t.me/patobarato'`; `messageUrl(messageId: number): string`.
  - `type CtaPlacement = 'header' | 'hero' | 'block' | 'recent' | 'deal' | 'footer' | 'contact'`; `CTA_PLACEMENTS: readonly CtaPlacement[]`; `isCtaPlacement(v: unknown): v is CtaPlacement`.
  - `type ChannelStats = { members: number | null; checkedAt: string | null; postedToday: number; lastPostedAt: string | null }`; `type ChannelPost = { productId: number; title: string; price: number; messageId: number; publishedAt: string }`; `type ChannelLive = { stats: ChannelStats; posts: ChannelPost[] }`.
  - `fetchChannelStats(client: SupabaseClient): Promise<ChannelStats>` (lee `web_channel_stats`, `.single()`), `fetchChannelRecent(client: SupabaseClient, limit = 3): Promise<ChannelPost[]>`.
  - `formatMembers(n: number | null): string | null` → `null` si `n === null || n < 100`; si no `new Intl.NumberFormat('es-ES').format(n)`.
  - `CATEGORY_TAGS: Record<string, string>` = `{ tecnologia: 'tecnología', hogar: 'hogar', belleza: 'belleza', juguetes: 'juguetes', alimentacion: 'alimentación', deporte: 'deporte', moda: 'moda', bricolaje: 'bricolaje' }`; `categoryLabel(hashtags: string[]): string | null` → etiqueta del primer hashtag (sin `#`, minúsculas) presente en `CATEGORY_TAGS`.
  - `RequestLimiter(max = 20, windowMs = 60_000, now = Date.now)` con `allow(key: string): boolean`: cuenta peticiones por clave en ventana fija; la petición `max + 1` de la misma clave en la ventana devuelve `false`.

- [ ] **Step 1: Tests fallando** (`telegram.test.ts`): `messageUrl(123) === 'https://t.me/patobarato/123'`; `formatMembers(null) === null`, `formatMembers(99) === null`, `formatMembers(100) === '100'`, `formatMembers(1240)` cumple `/^1\.?240$/`; `categoryLabel(['#oferta', '#Tecnologia']) === 'tecnología'`, `categoryLabel(['#oferta']) === null`; `isCtaPlacement('deal') === true`, `isCtaPlacement('x') === false`; `fetchChannelStats` con cliente falso mapea snake→camel; `fetchChannelRecent` pasa `limit`. (`rate-limit.test.ts`): `RequestLimiter(2, 1000)` permite 2 de la misma clave, rechaza la 3.ª, vuelve a permitir tras avanzar `now` 1000 ms, y claves distintas no se afectan.
- [ ] **Step 2: Ejecutar** `npx vitest run src/lib/telegram.test.ts src/lib/rate-limit.test.ts` → fallan.
- [ ] **Step 3: Implementar** según Interfaces (patrón de `fetchEvents` en `lib/events-data.ts` para el cliente falso y el mapeo).
- [ ] **Step 4: Ejecutar** → pasan. **Step 5: Commit** `feat(web): telegram helpers and per-key request limiter`.

### Task 4: Web — `/api/clic` y `trackCtaClick`

**Files:**
- Create: `web/src/app/api/clic/route.ts`, `web/src/app/api/clic/route.test.ts`, `web/src/lib/cta.ts`, `web/src/lib/cta.test.ts`

**Interfaces:**
- Consumes: `isCtaPlacement`, `RequestLimiter`, `getSupabase`.
- Produces: `POST /api/clic` (body JSON `{ placement, path }`) → 204 | 400 | 429; `trackCtaClick(placement: CtaPlacement, path = location.pathname): void` (cliente).

- [ ] **Step 1: Tests fallando** (`route.test.ts`, mock de `getSupabase` devolviendo `{ from: () => ({ insert: vi.fn().mockResolvedValue({ error: null }) }) }`): 204 e `insert` llamado con `{ placement: 'hero', path: '/' }`; 400 con JSON inválido, con `placement: 'x'`, con `path: 'oferta'` (sin `/`), con `path: '/a?b=1'`, con `path` de 201 caracteres; 429 a la 21.ª petición desde la misma `x-forwarded-for` en la ventana; 204 cuando `insert` devuelve `{ error: {...} }` o lanza; cabecera `Cache-Control: no-store`. (`cta.test.ts`): llama a `navigator.sendBeacon('/api/clic', Blob)` cuando existe; usa `fetch(..., { method: 'POST', keepalive: true })` si no; nunca lanza aunque ambos fallen.
- [ ] **Step 2: Ejecutar** → fallan. **Step 3: Implementar**: `export const runtime = 'nodejs'`, `export const dynamic = 'force-dynamic'`; limitador a nivel de módulo (`new RequestLimiter()`), clave = primer valor de `x-forwarded-for` o `'unknown'`; `path` válido = string, empieza por `/`, ≤ 200, sin `?` ni `#`; insert con `getSupabase().from('cta_clicks').insert({ placement, path })`; en error `console.error('clic: insert failed')` sin más datos. `trackCtaClick` construye `new Blob([JSON.stringify({ placement, path })], { type: 'application/json' })`.
- [ ] **Step 4: Ejecutar** → pasan. **Step 5: Commit** `feat(web): count Telegram CTA clicks without cookies`.

### Task 5: Web — `TelegramCta` en todos los enlaces

**Files:**
- Create: `web/src/components/TelegramCta.tsx`, `web/src/components/TelegramCta.test.tsx`
- Modify: `web/src/components/Header.tsx`, `Hero.tsx`, `Footer.tsx`, `TelegramBlock.tsx`, `web/src/app/contacto/page.tsx` (+ sus tests si comprueban `href`)

**Interfaces:**
- Produces: `TelegramCta({ placement, className, children, href = TELEGRAM_URL, ...rest }: { placement: CtaPlacement; className?: string; children: ReactNode; href?: string } & AnchorHTMLAttributes)` → `<a target="_blank" rel="noopener noreferrer" onClick={track} onAuxClick={track}>`; `'use client'`.

- [ ] **Step 1: Tests fallando**: renderiza `href`, `target`, `rel`; al hacer clic llama a `trackCtaClick('hero')` (mock de `../lib/cta`) y NO llama a `preventDefault`; `auxClick` también cuenta; `href` personalizado (para `recent`) se respeta.
- [ ] **Step 2: Implementar y sustituir** cada `<a href="https://t.me/patobarato">` por `<TelegramCta placement=...>` conservando clases, iconos y textos: Header `header` (el menú móvil hereda), Hero `hero`, Footer `footer` (si `Footer` genera los enlaces desde un array, tratar el externo de Telegram como caso especial), TelegramBlock `block`, contacto `contact`. `grep -rn "t.me/patobarato" web/src --include=*.tsx --include=*.ts | grep -v test` debe devolver solo `TelegramCta.tsx`/`lib/telegram.ts` y `lib/seo.ts`.
- [ ] **Step 3: `npm test`, `npm run typecheck`, `npm run lint`** verdes. **Step 4: Commit** `feat(web): route every Telegram link through TelegramCta`.

### Task 6: Web — datos en vivo en portada y hero

**Files:**
- Modify: `web/src/app/page.tsx`, `web/src/components/HomeClient.tsx` (+ test), `web/src/components/TelegramBlock.tsx` (+ crear `TelegramBlock.test.tsx` si no existe), `web/src/components/Hero.tsx` (+ test)

**Interfaces:**
- Consumes: `fetchChannelStats`, `fetchChannelRecent`, `formatMembers`, `messageUrl`, `timeAgo(iso, now)` de `lib/format.ts`, `useClock`.
- Produces: `HomeClient` prop `live?: ChannelLive | null`; `TelegramBlock({ fetchLatestDeal, live, now }: { ...; live?: ChannelLive | null; now: Date })`; `Hero` prop `members?: string | null`.

- [ ] **Step 1: Tests fallando** (`TelegramBlock.test.tsx`): con `live = { stats: { members: 1240, postedToday: 7, lastPostedAt: now-12min, ... }, posts: [3] }` muestra «7 chollos hoy», «Último chollo hace 12 min», un texto que contiene `formatMembers(1240)` + «suscriptores», y 3 enlaces con `href = messageUrl(id)` y `placement` `recent`; con `postedToday: 0` no aparece «chollos hoy»; con `members: 40` no aparece «suscriptores»; con `live = null` el bloque renderiza como hoy (título, botón) sin la fila. (`Hero.test.tsx`): con `members = '1.240'` aparece «1.240 suscriptores · gratis» bajo el botón; con `null` no.
- [ ] **Step 2: Implementar**: en `page.tsx` añadir al `Promise.all` `optional('home-channel', async () => ({ stats: await fetchChannelStats(getSupabase()), posts: await fetchChannelRecent(getSupabase(), 3) }))` y pasar `live={live ?? null}`; `HomeClient` pasa `live` y `now={clock}` a `TelegramBlock` y `members={formatMembers(live?.stats.members ?? null)}` a `Hero`. En `TelegramBlock`, fila de datos (`ul` con hasta tres `li`, iconos Lucide `Flame`, `Clock`, `Users`) sobre el botón; bajo la vista previa, «Últimos en el canal» con `TelegramCta placement="recent" href={messageUrl(p.messageId)}` por post (título `line-clamp-2`, `formatPrice(price)`, `timeAgo`). Si `live === null` o `posts.length === 0`, la lista no se renderiza.
- [ ] **Step 3: `npm test`, typecheck, lint** verdes. **Step 4: Commit** `feat(web): live channel activity in the Telegram block and hero`.

### Task 7: Web — `NextDealCta` en la ficha y aviso en /privacidad

**Files:**
- Create: `web/src/components/NextDealCta.tsx`, `web/src/components/NextDealCta.test.tsx`
- Modify: `web/src/components/ProductView.tsx` (+ test), `web/src/app/privacidad/page.tsx` (+ test si comprueba la fecha)

**Interfaces:**
- Consumes: `categoryLabel`, `TelegramCta`.
- Produces: `NextDealCta({ hashtags }: { hashtags: string[] })`.

- [ ] **Step 1: Tests fallando**: con `['#oferta', '#tecnologia']` el texto contiene «El próximo chollo de tecnología también saldrá en el canal» y un enlace «Avísame del próximo» con `placement="deal"`; con `['#oferta']` el texto contiene «El próximo chollo como este también saldrá en el canal»; título «¿Se te ha escapado?». `ProductView.test`: la tarjeta aparece entre el bloque de compra y «Más chollos».
- [ ] **Step 2: Implementar**: tarjeta `rounded-2xl border border-line bg-surface p-5` con icono Lucide `Bell`, h2 «¿Se te ha escapado?», párrafo (texto según categoría + «, con su precio y su cupón.»), `TelegramCta placement="deal"` con estilo de botón primario y texto «Avísame del próximo». Insertar en `ProductView` tras el bloque de compra/guías y antes de la sección «Más chollos». En `/privacidad`: nueva frase «Contamos los clics en los botones de Telegram (botón y página) sin guardar ningún dato que te identifique.» en el apartado de datos tratados, y `updated="25 de noviembre de 2026"`.
- [ ] **Step 3: `npm test`, typecheck, lint** verdes. **Step 4: Commit** `feat(web): "Avísame del próximo" on deal pages`.

### Task 8: Admin — página `/clics`

**Files:**
- Create: `admin/src/lib/clicks.ts`, `admin/src/lib/clicks.test.ts`, `admin/src/app/clics/page.tsx`, `admin/src/app/clics/page.test.tsx`
- Modify: `admin/src/components/AppNav.tsx` (+ test)

**Interfaces:**
- Produces: `type ClickRow = { day: string; placement: string; clicks: number }`; `listClicks(client, days = 14): Promise<ClickRow[]>` (select `day, placement, clicks` de `cta_clicks_daily` con `gte('day', <hoy Madrid − 13 días>)`); `buildClickTable(rows: ClickRow[], days: string[], placements: string[]): { rows: { day: string; cells: number[]; total: number }[]; totals: number[]; grandTotal: number }` con relleno a cero; `PLACEMENTS = ['header','hero','block','recent','deal','footer','contact']` con etiquetas («Cabecera», «Hero», «Bloque portada», «Últimos mensajes», «Ficha de chollo», «Pie», «Contacto»).

- [ ] **Step 1: Tests fallando**: `buildClickTable` rellena ceros, suma filas y columnas; `listClicks` con cliente falso construye la consulta; página renderiza la tabla y el total, y «Sin clics todavía» si no hay filas.
- [ ] **Step 2: Implementar** siguiendo el patrón de `app/eventos/page.tsx` (`'use client'`, `createBrowserSupabase`), tabla accesible (`<table>` con `caption`), y enlace `{ href: '/clics', label: 'Clics' }` en `AppNav`.
- [ ] **Step 3: `npm test`, typecheck, lint** en admin verdes. **Step 4: Commit** `feat(admin): daily Telegram CTA clicks`.

### Task 9: README y comprobación final

**Files:**
- Modify: `web/README.md` (sección «Telegram»: vistas, `/api/clic`, qué se guarda y qué no), `bot/README.md` si existe (runner `channel_stats`).

- [ ] **Step 1: Documentar** en unas 10 líneas. **Step 2:** `npm run build` offline en web → sin errores. **Step 3: Commit** `docs: telegram conversion`.
