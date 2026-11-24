# Ofertas caducadas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un comando manual `check-deals` que termina las ofertas de Amazon cuyo precio ha subido, y una ficha web que sigue existiendo (e indexada 30 días) cuando la oferta ha caducado.

**Architecture:** Vista nueva `web_deal_pages` (activas + terminadas) que solo leen la ficha y el sitemap; el resto sigue en `web_deals`. En el bot, `DealChecker` reutiliza `AmazonStore.fetch_price`, `PostService.sync_post` y `WebRevalidator`; el comando arranca solo el bot publicador.

**Tech Stack:** PostgreSQL/Supabase (vistas, RLS), Python 3.12 + httpx + Telethon + pytest, Next.js 16 + Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-11-24-ofertas-caducadas-design.md`

## Global Constraints

- Web solo con clave anon y vistas `web_*`; bot con service key; admin con `is_admin()`.
- Iconos Lucide; español de España, tuteo, sin emojis; copy honesto; nunca URLs de afiliado ni cuerpos de respuesta en el registro.
- TDD: Vitest en `web/` (`npm test`, `npm run typecheck`, `npm run lint`), pytest en `bot/` (`.venv-linux/bin/python -m pytest -q`).
- Commits como David: `git -c user.name=David -c user.email=$(git log -1 --format=%ae) commit`.
- Solo `store = 'amazon'`, `channel = 'telegram'`, ofertas sin cupón; ventana 30 días; recomprobación 48 h; tope 600 comprobaciones y 100 ediciones por ejecución; indexable hasta 30 días después de `ended_at`.
- No se cambia `web_deals` ni ninguno de sus consumidores.

## Review Focus

1. Producto republicado con una activa y una terminada: `web_deal_pages` debe dar la activa (Task 1, test SQL mental en `check-views` no basta: test de orden en Task 6 con filas falsas).
2. Caducada hace exactamente 30 días: indexable hasta el instante `ended_at + 30 d` inclusive, `noindex` después (Task 6, `isDealIndexable` en el límite).
3. Amazon bloquea a mitad: nada marcado como comprobado por fallo de red; parada tras dos bloqueos seguidos (Task 4).
4. `sync_post` lanza `PostError` (post sin canal): la oferta queda terminada igualmente y cuenta en `edit_failed` (Task 4).
5. Barra fija de móvil con oferta caducada: no debe renderizarse (Task 8).

---

### Task 1: Migración `web_deal_pages` + columnas

**Files:**
- Create: `supabase/migrations/20261126000000_deal_pages.sql`
- Modify: `web/scripts/check-views.mjs`

**Interfaces:**
- Produces: tabla `publications` + `checked_at timestamptz`, `post_synced_at timestamptz`; vista `web_deal_pages` con las columnas de `web_deals` (misma lista y orden que `20261106000000_web_deals_v3.sql`, más las que añadió `20261111000000_price_before_coupon.sql`) y al final `status text`, `ended_at timestamptz`.

- [ ] **Step 1:** Copiar la `select` vigente de `web_deals` (buscar el último `create or replace view web_deals` en `supabase/migrations/`) y escribir `create view web_deal_pages as select distinct on (p.product_id) <mismas columnas>, p.status, p.ended_at from … where p.status <> 'draft' order by p.product_id, (p.status = 'active') desc, p.published_at desc, p.id desc;` seguido de `revoke all on web_deal_pages from anon, authenticated; grant select on web_deal_pages to anon, authenticated;`, las dos `alter table publications add column …`, y `notify pgrst, 'reload schema';`.
- [ ] **Step 2:** En `check-views.mjs`, tras el bloque de `web_events`, añadir: `web_deal_pages?select=*&limit=1` → 200 y, si hay fila, contiene `status` y `ended_at`.
- [ ] **Step 3:** `node --check web/scripts/check-views.mjs`. Commit `feat(db): web_deal_pages view and publication check columns`.

### Task 2: Repositorio: selección, expiración y marcado

**Files:**
- Modify: `bot/src/patobarato/models.py`, `bot/src/patobarato/storage/repository.py` (Protocol + `InMemoryRepository`), `bot/src/patobarato/storage/supabase_repo.py`, `bot/src/patobarato/admin/posts.py`
- Test: `bot/tests/test_repository.py`, `bot/tests/test_supabase_repo_rows.py`, `bot/tests/test_admin_posts.py`

**Interfaces:**
- Produces, en `models.py`: `@dataclass(frozen=True) class DealToCheck: publication_id: int; product_id: int; asin: str; url: str; published_price: Decimal`.
- Produces, en `Repository`:
  - `async def list_deals_to_check(self, now: datetime, max_age_days: int, recheck_hours: int, limit: int) -> list[DealToCheck]` — activas, telegram, Amazon, `offers.coupon is null`, `published_at > now - max_age_days`, `checked_at is null or < now - recheck_hours`; orden `checked_at asc nulls first, published_at desc`; `limit`.
  - `async def list_stale_deals(self, now: datetime, max_age_days: int) -> list[int]` — ids de activas, telegram, Amazon, `published_at <= now - max_age_days`.
  - `async def end_stale_deals(self, now: datetime, max_age_days: int) -> list[int]` — las mismas → `status='ended', ended_at=now`; devuelve ids.
  - `async def end_publication(self, publication_id: int, now: datetime) -> None` — `status='ended', ended_at=now, checked_at=now`.
  - `async def mark_checked(self, publication_id: int, now: datetime) -> None`.
  - `async def list_ended_posts_to_edit(self, limit: int) -> list[int]` — `status='ended'`, `message_id not null`, `post_synced_at is null`, `ended_at desc`.
  - `async def mark_post_synced(self, publication_id: int, now: datetime) -> None`.
- `PostService.sync_post` llama a `repo.mark_post_synced(publication_id, self._clock())` tras editar con éxito (solo cuando `status == ENDED`).
- `InMemoryRepository.add_publication(...)` acepta `checked_at`, `post_synced_at`, `ended_at` opcionales (por defecto `None`); los productos recuerdan `url` (ya hay `product_urls`) y la oferta `coupon`.

- [ ] **Step 1:** Tests en `test_repository.py` (repo en memoria): `list_deals_to_check` excluye terminada, AliExpress, con cupón, >30 días, comprobada hace 10 h; incluye nunca comprobada y comprobada hace 50 h; orden nulls-first luego `published_at desc`; respeta `limit`. `list_stale_deals`/`end_stale_deals` devuelven solo las activas Amazon de >30 días; la segunda las termina. `end_publication`/`mark_checked`/`mark_post_synced` escriben los campos. `list_ended_posts_to_edit` devuelve solo terminadas con `message_id` y sin `post_synced_at`.
- [ ] **Step 2:** Correr; deben fallar.
- [ ] **Step 3:** Implementar en Protocol + InMemory. En Supabase: `list_deals_to_check` con `.select("id, product_id, published_price::text, offers!inner(coupon), products!inner(asin, url, store)")`, `.eq("status","active").eq("channel","telegram").eq("products.store","amazon").is_("offers.coupon","null").gt("published_at", …).or_(f"checked_at.is.null,checked_at.lt.{iso}")`, orden `checked_at` (nullsfirst) y `published_at desc`, `.limit(limit)`. `list_stale_deals`: `select id` con `products!inner(store)` y los filtros; `end_stale_deals` = `list_stale_deals` + `update({...}).in_("id", ids)` (PostgREST no filtra un `update` por una tabla unida). Resto con `update().eq("id", …)`.
- [ ] **Step 4:** Tests de filas en `test_supabase_repo_rows.py` siguiendo el patrón existente (cliente falso que registra las llamadas): parámetros y orden correctos. Test en `test_admin_posts.py`: `sync_post` de un post `ENDED` llama a `mark_post_synced`; de un post `ACTIVE` no.
- [ ] **Step 5:** `pytest -q` verde. Commit `feat(bot): repository support for deal checks`.

### Task 3: `last_failure` en el lector de Amazon

**Files:**
- Modify: `bot/src/patobarato/sources/amazon_page.py`, `bot/src/patobarato/stores/base.py`, `bot/src/patobarato/stores/amazon.py`
- Test: `bot/tests/test_amazon_page.py`, `bot/tests/test_amazon_store.py` (o donde se prueba `AmazonStore.fetch_price`)

**Interfaces:**
- `AmazonPageFetcher.last_failure: str | None` — se pone a `None` al empezar cada `fetch` y al motivo (`"captcha"`, `"HTTP 503"`, `"network error (…)"`, `"blocked page …"`) en `fail(reason)`.
- `BaseStore.last_failure: str | None` propiedad con valor `None` por defecto; `AmazonStore.last_failure` devuelve `self._prices.last_failure if self._prices else None`. Un `fetch_price` que devuelve `None` por «no price in buy box» deja `last_failure = "no price in buy box (…)"`.
- Produces, en `amazon_page.py`: `BLOCK_REASONS = ("captcha", "blocked page", "HTTP 503")` y `def is_block(reason: str | None) -> bool` (prefijo).

- [ ] **Step 1:** Tests: tras captcha, `last_failure == "captcha"`; tras página buena, `None`; `is_block("HTTP 503")` True, `is_block("no price in buy box (…)")` False, `is_block(None)` False.
- [ ] **Step 2:** Fallar → implementar → pasar. Commit `feat(bot): expose the Amazon reader's last failure`.

### Task 4: `DealChecker`

**Files:**
- Create: `bot/src/patobarato/sources/deal_check.py`
- Test: `bot/tests/test_deal_check.py`

**Interfaces:**
- Consumes: Task 2 (`DealToCheck`, métodos del repo), Task 3 (`store.last_failure`, `is_block`), `PostService.sync_post(publication_id) -> dict` (lanza `PostError`), `StoreRegistry.get("amazon")`.
- Produces: `@dataclass class CheckSummary: checked=0, ended=0, kept=0, unknown=0, failed=0, stale_ended=0, posts_edited=0, edit_failed=0, posts_pending=0, stopped_blocked=False, dry_run=False` y `def format(self) -> str` (texto del resumen de la spec, números con separador de miles en español).
- Produces: `class DealChecker: __init__(self, registry, repo, posts, clock=utcnow, sleep=asyncio.sleep, delay_seconds=1.5, max_age_days=30, recheck_hours=48, limit=600, edit_limit=100)`; `async def run(self, dry_run: bool = False) -> CheckSummary`.

Comportamiento de `run`: (1) `stale = repo.end_stale_deals(now, max_age_days)` (en dry-run, `repo.list_stale_deals(...)` y no se escribe); (2) por cada `DealToCheck`: pausa entre peticiones de red, `quote = store.fetch_price(asin, canonical_for(url))`; `quote.price > published_price` → `end_publication` + `sync_post` (PostError o excepción → `edit_failed += 1`, se sigue); `<=` → `mark_checked`; `None` y `is_block(store.last_failure)` → `failed += 1`, `blocked_streak += 1`, parar si llega a 2 (`stopped_blocked=True`); `None` y otro `last_failure` de red/HTTP → `failed += 1`; `None` sin `last_failure` de bloqueo pero «no price…» → `mark_checked` + `unknown`; cualquier `quote` reinicia `blocked_streak`; (3) editar hasta `edit_limit` posts de `list_ended_posts_to_edit` (incluye los recién terminados que fallaron y los de antigüedad), `posts_pending` = los que quedan; (4) devolver el resumen. Dry-run: no escribe ni edita; `ended`/`kept`/`unknown` se cuentan igual. Registro por producto: `DealCheck: amazon %s published %s now %s -> %s`.

- [ ] **Step 1:** Tests con `InMemoryRepository`, `FakeStore` (como `test_guide_prices.py`, con `last_failure` configurable) y un `FakePosts` que registra `sync_post` y puede lanzar `PostError`: sube → ended + sync; igual → kept; baja → kept; sin precio (last_failure «no price…») → unknown + checked_at; red → failed, `checked_at` sigue null; dos bloqueos seguidos → para, `stopped_blocked`; bloqueo, éxito, bloqueo → no para; `PostError` → ended + `edit_failed`; antigüedad → `stale_ended` y posts editados hasta `edit_limit`, `posts_pending` correcto; dry-run no escribe; `format()` contiene «Comprobadas», «caducadas», «Caducadas por antigüedad».
- [ ] **Step 2:** Fallar → implementar → pasar. Commit `feat(bot): DealChecker ends deals whose price went up`.

### Task 5: Comando `check-deals`

**Files:**
- Modify: `bot/src/patobarato/config.py` (`check_deals_limit: int = 600`, `check_deals_edit_limit: int = 100`), `bot/src/patobarato/main.py`, `bot/README.md`
- Test: `bot/tests/test_main.py`

**Interfaces:**
- `async def check_deals(settings: Settings, dry_run: bool = False) -> int`: `bot = _client(BOT_SESSION_PATH, settings)`; `bot.start(bot_token=…)` (fallo → mensaje `BOT_START_FAILED_MESSAGE`, return 1); clientes httpx como en `guide_prices` (Amazon con `http2=True`); `repo`, `registry`, `TelegramPublisher(bot, settings.target_channel)`, `PostService(repo, publisher, registry, lambda url: download_photo(http, url), utcnow)`, `WebRevalidator(http, settings.web_revalidate_url, settings.revalidate_secret)`; `summary = await DealChecker(...).run(dry_run)`; si `summary.ended + summary.stale_ended > 0` y no dry-run → `revalidate()` (si faltan variables, imprimir «Sin WEB_REVALIDATE_URL/REVALIDATE_SECRET: revalida la web a mano»); `print(summary.format())`; `bot.disconnect()` en `finally`; return 0.
- `main`: `choices` + `"check-deals"`; `parser.add_argument("--dry-run", action="store_true")`.

- [ ] **Step 1:** Tests en `test_main.py` (patrón de `test_guide_prices_runs_refresher_once_without_telegram`): `check_deals` construye `DealChecker` con los límites de `Settings`, llama a `run(dry_run)`, revalida solo cuando hay terminadas y no es dry-run; `main(["check-deals","--dry-run"])` pasa `dry_run=True`.
- [ ] **Step 2:** Implementar; `pytest -q`. README: subsección «Comprobar ofertas caducadas» (cómo lanzarlo, `--dry-run`, qué significa cada cifra del resumen, por qué los posts antiguos se editan a 100 por ejecución, variables `CHECK_DEALS_LIMIT`/`CHECK_DEALS_EDIT_LIMIT`). Commit `feat(bot): check-deals command`.

### Task 6: Web: datos de la ficha

**Files:**
- Modify: `web/src/lib/types.ts`, `web/src/lib/deals.ts`
- Test: `web/src/lib/deals.test.ts`

**Interfaces:**
- `Deal` + `status: 'active' | 'ended'`, `endedAt: string | null`. `DealRow` + `status?: string`, `ended_at?: string | null`; `toDeal` pone `status: row.status === 'ended' ? 'ended' : 'active'`, `endedAt: row.ended_at ?? null`.
- `export const ENDED_INDEXABLE_DAYS = 30`; `export function isDealIndexable(deal: Pick<Deal,'status'|'endedAt'>, now: Date): boolean` — activa, o `endedAt` y `now - endedAt <= 30 d`.
- `fetchDealByProduct` lee `web_deal_pages` (mismo filtro y orden). `fetchAllDealRefs(client, now: Date)` lee `web_deal_pages` con `.or(\`status.eq.active,ended_at.gt.${iso(now - 30 d)}\`)` y devuelve también `status`, `endedAt`.
- `fetchDeals`, `fetchLatestDeal`, `fetchOthers` no cambian.

- [ ] **Step 1:** Tests: `fetchDealByProduct` consulta `web_deal_pages`; `toDeal` sin columnas → `active`/`null`; `fetchAllDealRefs` aplica el `or` con la fecha; `isDealIndexable` activa → true, terminada hace 29 d → true, hace 30 d exactos → true, hace 30 d + 1 s → false. Actualizar los tests y fixtures que construyen `Deal` (buscar `publicationId:` en `web/src`): añadir `status: 'active', endedAt: null`.
- [ ] **Step 2:** Fallar → implementar → `npm test`, `typecheck`, `lint`. Commit `feat(web): deal pages read ended publications`.

### Task 7: Web: metadata, JSON-LD y página

**Files:**
- Modify: `web/src/lib/seo.ts`, `web/src/app/oferta/[store]/[slug]/page.tsx`
- Test: `web/src/lib/seo.test.ts`, `web/src/app/oferta/[store]/[slug]/page.test.tsx`

**Interfaces:**
- `productMetadata(deal: Deal, now: Date = new Date())`: caducada → título `${deal.title} · Oferta caducada · PatoBarato`, descripción `Esta oferta de ${storeInfo(deal.store).name} ya ha terminado. Se publicó a ${formatPrice(deal.price)} el ${fecha es-ES d 'de' MMMM}. Mira el precio actual o las ofertas vigentes.`; `robots: NOINDEX` cuando `!isDealIndexable(deal, now)`. Activa: sin cambios.
- `productJsonLd(deal, url)`: caducada → `offers.availability = 'https://schema.org/SoldOut'`, `offers.priceValidUntil = endedAt.slice(0,10)`; activa sin cambios.
- `page.tsx`: `generateMetadata` pasa `now`; nada más cambia (ya pasa `now` a `ProductView`).

- [ ] **Step 1:** Tests: título/descripción/robots en activa, caducada reciente y caducada antigua; JSON-LD `SoldOut` + `priceValidUntil`; `page.test.tsx`: una caducada renderiza (200) y no llama a `notFound`.
- [ ] **Step 2:** Fallar → implementar → verde. Commit `feat(web): ended deal metadata and structured data`.

### Task 8: Web: `ProductView` caducada

**Files:**
- Modify: `web/src/components/ProductView.tsx`, `web/src/components/BuyButton.tsx`
- Test: `web/src/components/ProductView.test.tsx`, `web/src/components/BuyButton.test.tsx`

**Interfaces:**
- `BuyButton` + prop `variant?: 'primary' | 'secondary'` (secundaria: borde `border-line`, texto `text-ink`, fondo blanco; mismo `rel`/`target`/comportamiento Amazon) y `label?: string`.
- `ProductView` con `deal.status === 'ended'`: aviso con `Clock` y texto `Oferta caducada · terminó el ${d MMM}` (helper `formatDayMonth(iso)` en `lib/format.ts`, zona Europe/Madrid) encima del precio; precio en `<s>`; sin «Ahorras», sin precio anterior, sin «mínimo histórico»; en lugar de la barra fija + `BuyButton` primario, un `BuyButton variant="secondary" label="Ver precio actual en Amazon"` inline (sin la `div` fija); `NextDealCta` ya está; el encabezado de relacionados pasa a «Más chollos de <categoría>» si no lo es ya.

- [ ] **Step 1:** Tests: caducada muestra «Oferta caducada», precio tachado, no «Ahorras», no hay elemento con clase `fixed`, el enlace «Ver precio actual en Amazon» apunta a `affiliateUrl`; activa no cambia (los tests existentes siguen verdes).
- [ ] **Step 2:** Fallar → implementar → verde (`npm test`, `typecheck`, `lint`). Commit `feat(web): ended deals keep their page`.

### Task 9: Sitemap, README y build

**Files:**
- Modify: `web/src/lib/sitemap.ts`, `web/src/lib/sitemap-data.ts`, `web/README.md`
- Test: `web/src/lib/sitemap.test.ts`

- [ ] **Step 1:** Test: `dealEntries` usa `endedAt ?? publishedAt` como `lastModified`; `loadSitemapXml('chollos', client, now)` pasa `now` a `fetchAllDealRefs`.
- [ ] **Step 2:** Implementar; README (sección de ofertas: fichas caducadas, 30 días, `web_deal_pages`). `npm run build` offline sin errores. Commit `docs(web): ended deal pages`.

### Task 10: Aplicar y comprobar (controlador)

- Aplicar `20261126000000_deal_pages.sql` en producción (Management API), registrar la versión, `node scripts/check-views.mjs` desde el navegador (anon: `web_deal_pages` 200, `publications` 401).
- Merge a main, bundle a la carpeta de David, informe con: `python -m patobarato check-deals --dry-run` como primera ejecución.
