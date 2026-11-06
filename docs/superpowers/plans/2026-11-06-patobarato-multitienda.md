# PatoBarato — Multitienda y descubrimiento por API: plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el bot reconozca y publique chollos de AliExpress y de las tiendas Awin (PcComponentes, MediaMarkt, El Corte Inglés), descubra chollos y cupones por las APIs de AliExpress y Awin para la web, y que la web tenga páginas y filtros por tienda sin nombrar tiendas sin datos.

**Architecture:** Registro de tiendas compartido en el bot (`patobarato/stores/`, un adaptador por tienda) usado por el extractor, el pipeline y los buscadores de imagen; fuentes API como tipos nuevos de `sources` ejecutados por un planificador dentro del bot que escribe publicaciones `channel='web'` y cupones. La web añade `web_stores`, filtro `store` y rutas `/tiendas`.

**Tech Stack:** Python 3.12 (Telethon, httpx, pydantic-settings, pytest-asyncio), Supabase (Postgres/PostgREST), Next.js 16 + React 19 + Vitest, lucide-react.

**Spec:** `docs/superpowers/specs/2026-11-06-patobarato-multitienda-design.md`

## Global Constraints

- Bot: comandos desde `bot/` con el venv del repo (`.venv`): `python -m pytest -q`, `ruff check .` si está configurado en `pyproject.toml`. Web: desde `web/`: `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`.
- La web lee solo vistas (`web_deals`, `web_hashtags`, `web_coupons`, `web_stores`) con la clave anon. Credenciales de AliExpress y Awin solo en `bot/.env`.
- Nada de afirmaciones falsas: la web nombra una tienda solo si `web_stores` la devuelve con `deals > 0` o `coupons > 0`.
- Lo descubierto por API nunca se publica en Telegram en esta fase (`channel='web'`, estado `published_web`).
- Lucide para iconos; tokens y copy de la spec v3. Español de España.
- Cada tarea termina con tests en verde y un commit `tipo(ámbito): …` (`feat(bot)`, `feat(web)`, `chore(supabase)`).

## Review Focus

1. Un mensaje de Telegram con un enlace de una tienda sin credenciales (p. ej. AliExpress sin `ALIEXPRESS_*`) debe seguir publicándose si también lleva un enlace de Amazon, y el enlace de AliExpress se ignora sin error (test en Tarea 2 con un registro sin esa tienda).
2. Un producto de AliExpress que llega por API y después por Telegram (o al revés) es el mismo producto: `upsert_product` por `(store, country, asin)` y `decide` evitan el duplicado (test en Tarea 7).
3. Si la API de Awin falla, los cupones vigentes no se desactivan en esa ejecución (test en Tarea 8).
4. `/oferta/pccomponentes/{id}` con un id que contiene guiones y `/oferta/amazon/{slug}-{asin}` se resuelven ambos; un id de AliExpress de 16 dígitos no se confunde con un ASIN (tests en Tarea 9).
5. Con solo Amazon en `web_stores`, la portada no muestra el bloque de tiendas, el hero dice «Amazon. Cada oferta…» y el pie no nombra otras tiendas (tests en Tarea 11).

---

### Task 1: Migración `multistore` y comprobación anon

**Files:**
- Create: `supabase/migrations/20261107000000_multistore.sql`
- Modify: `web/scripts/check-views.mjs`

- [ ] **Step 1: Escribir la migración** con el SQL de la spec §4 literal (comentario en `products.asin`, `products.url`, `publications.channel` + ids nulos + check, `offers_status_check` con `published_web`, `sources_type_check` + `config`, `every_minutes`, `hashtags`, `last_run_at`, `last_error`, `coupons.source_id`/`external_id` + índice único parcial, vista `web_stores` + grants).
- [ ] **Step 2: Aplicarla** al proyecto (Management API desde el navegador integrado, como en la fase anterior) y registrarla en `supabase_migrations.schema_migrations`.
- [ ] **Step 3: Verificar** con SQL: `select channel, count(*) from publications group by 1` → todas `telegram`; `select * from web_stores` → una fila `amazon`; con `set role anon`: `select * from web_stores` funciona y `select * from sources` falla.
- [ ] **Step 4: `check-views.mjs`**: añadir `web_stores` (200 y claves `store, deals, coupons`) y que `sources` dé error para anon. Ejecutar en el navegador el equivalente (fetch REST con la clave anon) → OK.
- [ ] **Step 5: Commit** `chore(supabase): multistore schema and web_stores view`

### Task 2: Registro de tiendas y adaptador Amazon

**Files:**
- Create: `bot/src/patobarato/stores/__init__.py`, `stores/base.py`, `stores/registry.py`, `stores/amazon.py`
- Modify: `bot/src/patobarato/models.py`, `bot/src/patobarato/parsing/links.py`, `bot/src/patobarato/parsing/extract.py`
- Test: `bot/tests/test_stores_amazon.py`, `bot/tests/test_extract.py`

**Interfaces:**
- Produces: `class Store(Protocol)` (spec §5: `id`, `name`, `matches(url) -> bool`, `product_id(url) -> str | None`, `canonical_url(product_id, country) -> str`, `canonical_for(url, country) -> str` (por defecto `canonical_url(product_id(url), country)`; las tiendas Awin la redefinen), `async affiliate_url(canonical_url, product_id) -> str`, `async find_image(product_id, canonical_url) -> str | None`). `class StoreRegistry(stores: list[Store])` con `store_for(url) -> Store | None`, `get(store_id) -> Store | None`, `ids -> list[str]`. `AmazonStore(affiliate_tag: str, http: httpx.AsyncClient)` (`find_image` = `AmazonImageFinder` + `PrecioRealImageFinder` como hoy). `ParsedOffer` gana `product_url: str` (= canónica salvo que la tienda la guarde completa), `image_url: str | None = None`, `affiliate_url: str | None = None` (enlace ya generado por una API). `UrlResolver.resolve(url, is_final: Callable[[str], bool])`; `extract_offers(msg, resolver, registry)`.

- [ ] **Step 1: Tests** (`test_stores_amazon.py`): `AmazonStore.matches('https://www.amazon.es/dp/B09XS7JWHH')` True, `matches('https://es.aliexpress.com/item/1.html')` False; `product_id` → `'B09XS7JWHH'`; `canonical_url('B09XS7JWHH','ES')` → `https://www.amazon.es/dp/B09XS7JWHH`; `await affiliate_url(...)` → `…?tag=patobarato-21`. `StoreRegistry([amazon]).store_for(url)` y `None` para desconocida. En `test_extract.py`: adaptar al nuevo `extract_offers(msg, resolver, registry)`; nuevo test: mensaje con enlace Amazon + enlace AliExpress con registro solo-Amazon → una oferta, sin excepción.
- [ ] **Step 2: Ejecutar** `python -m pytest tests/test_stores_amazon.py tests/test_extract.py -q` — FAIL (import).
- [ ] **Step 3: Implementar** `base.py`, `registry.py`, `amazon.py` (reutilizando `links.py`/`amazon_page.py`), ampliar `ParsedOffer`, cambiar `UrlResolver.resolve` para recibir `is_final` (por defecto `is_amazon_url` para no romper llamadas existentes) y `extract_offers` para iterar `registry.store_for` por URL (un producto por `(store, product_id)`), rellenando `store`, `product_url`, `canonical_url`.
- [ ] **Step 4: `python -m pytest -q`** — PASS (ajustar `test_pipeline.py`/`test_main.py` si construyen `extract_offers` o `ParsedOffer` directamente: añadir `product_url`).
- [ ] **Step 5: Commit** `feat(bot): store registry and Amazon adapter`

### Task 3: Cliente y adaptador de AliExpress

**Files:**
- Create: `bot/src/patobarato/stores/aliexpress_client.py`, `stores/aliexpress.py`, `bot/tests/fixtures/aliexpress_link_generate.json`, `fixtures/aliexpress_productdetail.json`, `fixtures/aliexpress_hotproduct.json`
- Test: `bot/tests/test_aliexpress_client.py`, `bot/tests/test_stores_aliexpress.py`

**Interfaces:**
- Produces: `AliExpressClient(http, app_key, app_secret, tracking_id, endpoint='https://api-sg.aliexpress.com/sync', clock=time.time)` con `sign(params: dict[str, str]) -> str` (HMAC-SHA256 hex en mayúsculas de la concatenación `key+value` ordenada por clave, clave `app_secret`), `async call(method: str, **params) -> dict` (POST form, añade `app_key`, `timestamp` ms, `sign_method='sha256'`, `method`, `v='2.0'`, `format='json'`; lanza `AliExpressError(code, msg)` si la respuesta trae `error_response` o `resp_code != 200`), `async link_generate(url) -> str`, `async product_detail(product_id) -> AliProduct | None`, `async hot_products(category_ids, keywords, page_size, page_no) -> list[AliProduct]`. `@dataclass AliProduct(product_id: str, title: str, price: Decimal, original_price: Decimal | None, discount: int | None, image_url: str | None, url: str, promotion_link: str | None)`. `AliExpressStore(client)` con `id='aliexpress'`, `name='AliExpress'`; hosts `aliexpress.com` (cualquier subdominio), `aliexpress.us`; acortadores `s.click.aliexpress.com`, `a.aliexpress.com` (no `matches` directo: se resuelven en `extract_offers` vía `resolver` con `is_final=registry.store_for(u) is not None`); `product_id` = `(?:/item/|/i/)(\d+)\.html`; canónica `https://es.aliexpress.com/item/{id}.html`.

- [ ] **Step 1: Tests**: `sign({'method':'x','app_key':'k','timestamp':'1'})` igual al valor calculado con `hmac` en el propio test (vector fijo); `call` con `httpx.MockTransport` comprueba `sign_method` y que `error_response` → `AliExpressError`; `link_generate` y `product_detail` mapean las fixtures (`aliexpress_affiliate_link_generate_response.resp_result.result.promotion_links[0].promotion_link`; `…productdetail_get_response.resp_result.result.products.product[0]` → `AliProduct` con `target_sale_price`, `target_original_price`, `discount` «42%» → 42, `product_main_image_url`); `AliExpressStore.product_id('https://es.aliexpress.com/item/1005006123456789.html?spm=x')` → `'1005006123456789'`; `matches` para `www.aliexpress.com` y `aliexpress.us`.
- [ ] **Step 2: FAIL.**
- [ ] **Step 3: Implementar.** Fixtures: JSON mínimos con la forma real de la API (los nombres de campo citados arriba).
- [ ] **Step 4: PASS.**
- [ ] **Step 5: Commit** `feat(bot): AliExpress Portals client and store adapter`

### Task 4: Adaptador Awin y buscador de imagen genérico

**Files:**
- Create: `bot/src/patobarato/stores/awin.py`, `bot/src/patobarato/sources/generic_page.py`
- Test: `bot/tests/test_stores_awin.py`, `bot/tests/test_generic_page.py`

**Interfaces:**
- Produces: `AwinStore(id, name, hosts: list[str], merchant_id: int | None, publisher_id: str | None, http)`: `matches` por host (y `www.`); `product_id` = último segmento de la ruta sin query, barra final ni `.html`; `canonical_for(url, country)` = la URL sin parámetros `utm_*`, `awc`, `gclid` ni fragmento (`canonical_url(product_id, country)` no puede reconstruir la ruta completa y devuelve `https://{host}/{product_id}` solo como último recurso; `extract_offers` usa siempre `canonical_for`). `affiliate_url(canonical, product_id)` = deep-link Awin con `ued=quote(canonical, safe='')` si `merchant_id` y `publisher_id`; si no, devuelve `canonical` y registra `affiliate=missing`. `find_image` = `og_image(http, url)`. `generic_page.og_image(http, url) -> str | None` (`<meta property="og:image" content="…">`, cabeceras `BROWSER_HEADERS`, cualquier fallo → None). `AWIN_HOSTS = {'pccomponentes': ['pccomponentes.com'], 'mediamarkt': ['mediamarkt.es'], 'elcorteingles': ['elcorteingles.es']}` y `AWIN_NAMES`.

- [ ] **Step 1: Tests**: `product_id('https://www.pccomponentes.com/ninja-af300-freidora-de-aire?utm_source=x')` → `'ninja-af300-freidora-de-aire'`; `canonical_for` quita `utm_*`/`awc` y conserva otros parámetros; `affiliate_url` con `merchant_id=1234, publisher_id='5678'` → `https://www.awin1.com/cread.php?awinmid=1234&awinaffid=5678&ued=https%3A%2F%2Fwww.pccomponentes.com%2Fninja-af300-freidora-de-aire`; sin `merchant_id` → la canónica; `og_image` extrae la URL de una página fixture y devuelve None con 403.
- [ ] **Step 2: FAIL.** **Step 3: Implementar.** **Step 4: PASS.**
- [ ] **Step 5: Commit** `feat(bot): Awin store adapter and og:image finder`

### Task 5: Pipeline, caption, configuración y arranque multitienda

**Files:**
- Modify: `bot/src/patobarato/config.py`, `core/pipeline.py`, `publishing/format.py`, `main.py`, `sources/amazon_page.py` (ChainImageFinder → delega en el store), `bot/.env.example`
- Test: `bot/tests/test_config.py`, `test_format.py`, `test_pipeline.py`, `test_main.py`

**Interfaces:**
- Consumes: Tareas 2–4.
- Produces: `Settings` gana `aliexpress_app_key: str | None = None`, `aliexpress_app_secret: str | None = None`, `aliexpress_tracking_id: str | None = None`, `awin_publisher_id: str | None = None`, `awin_api_token: str | None = None`, `awin_merchants: dict[str, int | None] = {"pccomponentes": None, "mediamarkt": None, "elcorteingles": None}` (JSON en env). `build_registry(settings, http, amazon_http) -> StoreRegistry` en `stores/registry.py`: Amazon siempre; AliExpress solo con las tres credenciales; una `AwinStore` por entrada de `awin_merchants` (con o sin `mid`); registra en el log las tiendas activas y las desactivadas. `Pipeline(..., registry: StoreRegistry)` sustituye `image_finder`; `_publish` usa `offer.affiliate_url or await store.affiliate_url(offer.canonical_url, offer.asin)` (fallo → canónica + log) y `store.find_image`. `format_caption(offer, link, store_name)` → línea `🛒 Ver en {store_name}:`.

- [ ] **Step 1: Tests**: `Settings` parsea `AWIN_MERCHANTS='{"pccomponentes": 1234}'` y por defecto tiene las tres claves a `None`; `format_caption` con `store_name='AliExpress'` contiene `🛒 Ver en AliExpress:`; `test_pipeline`: oferta de una tienda falsa `FakeStore` cuyo `affiliate_url` lanza → se publica con la canónica; oferta con `affiliate_url` ya informado → se usa tal cual; `build_registry` sin credenciales de AliExpress → `'aliexpress' not in registry.ids`.
- [ ] **Step 2: FAIL.** **Step 3: Implementar** (en `main.run`: `registry = build_registry(settings, http, amazon_http)`; `Pipeline(..., registry=registry)`; `extract_offers(msg, resolver, registry)` dentro de `Pipeline.process`). **Step 4: `python -m pytest -q`** PASS.
- [ ] **Step 5: Commit** `feat(bot): multistore pipeline, caption and configuration`

### Task 6: Repositorio: fuentes API, publicaciones web y cupones

**Files:**
- Modify: `bot/src/patobarato/models.py`, `storage/repository.py`, `storage/supabase_repo.py`
- Test: `bot/tests/test_repository.py`, `bot/tests/test_supabase_repo.py`

**Interfaces:**
- Produces: `OfferStatus.PUBLISHED_WEB = 'published_web'`; `PublicationChannel = Literal['telegram','web']`; `@dataclass ApiSource(id, type: str, identifier, country, config: dict, every_minutes: int, hashtags: list[str], last_run_at: datetime | None)`; `@dataclass CouponUpsert(source_id, external_id, store, code, title, conditions, url, starts_at, expires_at)`. `Repository`: `insert_publication(..., chat_id: int | None, message_id: int | None, ..., channel: PublicationChannel = 'telegram')`; `list_api_sources() -> list[ApiSource]` (activas, tipo ≠ `telegram_channel`); `mark_source_run(source_id, ran_at, error: str | None)`; `upsert_coupon(c: CouponUpsert) -> int`; `deactivate_coupons_not_in(source_id, external_ids: set[str]) -> int`. `InMemoryRepository` implementa todo (con `add_api_source(...)` y `coupons` para inspección).

- [ ] **Step 1: Tests** (`test_repository.py`, con `InMemoryRepository`): `insert_publication(channel='web', chat_id=None, message_id=None)` guarda y `get_last_publication` la devuelve; `upsert_coupon` dos veces con el mismo `(source_id, external_id)` deja una fila actualizada; `deactivate_coupons_not_in(1, {'a'})` desactiva `b` y devuelve 1; `list_api_sources` excluye canales de Telegram e inactivas; `mark_source_run` guarda fecha y error. En `test_supabase_repo.py` (skip sin `SUPABASE_TEST_URL`): los mismos casos contra Supabase real.
- [ ] **Step 2: FAIL.** **Step 3: Implementar** (`supabase_repo`: `upsert(..., on_conflict='source_id,external_id')`, `update({'active': False}).eq('source_id', id).not_.in_('external_id', ids)`). **Step 4: PASS.**
- [ ] **Step 5: Commit** `feat(bot): repository support for API sources, web publications and coupons`

### Task 7: Fuente AliExpress y planificador

**Files:**
- Create: `bot/src/patobarato/sources/api_scheduler.py`, `sources/aliexpress_source.py`
- Modify: `bot/src/patobarato/main.py`
- Test: `bot/tests/test_api_scheduler.py`, `bot/tests/test_aliexpress_source.py`

**Interfaces:**
- Consumes: `AliExpressClient.hot_products`, `AliProduct`, `Repository` (Tarea 6), `decide`.
- Produces: `class ApiSourceRunner(Protocol)`: `type: str`, `async run(source: ApiSource) -> None`. `ApiScheduler(repo, runners: list[ApiSourceRunner], clock=utcnow, sleep=asyncio.sleep, tick_seconds=60)` con `async run()` (bucle) y `async tick()` (una pasada: ejecuta las vencidas, `mark_source_run` con `None` o `f"{type(e).__name__}: {e}"`, nunca propaga). `AliExpressSource(client, repo, settings, clock)` (`type='aliexpress_api'`): lee `config` (`query='hot'|'search'`, `keywords`, `category_ids`, `min_discount=30`, `max_results=20`, `min_price`, `max_price`), filtra, y por cada producto: `ParsedOffer(store='aliexpress', asin=product_id, country='ES', title, price, previous_price, coupon=None, hashtags=source.hashtags+['aliexpress'], canonical_url, product_url, image_url, affiliate_url=promotion_link)` → `upsert_product`, `insert_offer(product_id, source.id, source_message_id=int(product_id), offer, raw_text=json del producto, detected_at=now)`, `decide(...)`; si `PUBLISHED` → `insert_publication(channel='web', chat_id=None, message_id=None, affiliate_url=promotion_link)`, `set_product_image` si hay imagen, estado `PUBLISHED_WEB`; si no, el estado de `decide`.

- [ ] **Step 1: Tests**: `ApiScheduler.tick()` ejecuta solo las fuentes con `last_run_at` nulo o vencido, llama a `mark_source_run` con `None` tras éxito y con el mensaje tras una excepción del runner, y sigue con la siguiente fuente. `AliExpressSource.run` con un cliente falso que devuelve 3 productos (descuentos 50, 25, 40) y `min_discount=30` → 2 publicaciones `web` y estados `published_web`; segunda ejecución con los mismos productos → `skipped_duplicate` (Review Focus 2); `max_results=1` → solo el primero.
- [ ] **Step 2: FAIL.** **Step 3: Implementar**; en `main.run` añadir `scheduler=ApiScheduler(repo, runners).run()` a `_supervise` (runners según credenciales disponibles). **Step 4: PASS.**
- [ ] **Step 5: Commit** `feat(bot): API scheduler and AliExpress hot deals source`

### Task 8: Fuente de promociones Awin y documentación del bot

**Files:**
- Create: `bot/src/patobarato/sources/awin_source.py`, `bot/tests/fixtures/awin_promotions.json`
- Modify: `bot/README.md`, `bot/.env.example`
- Test: `bot/tests/test_awin_source.py`

**Interfaces:**
- Produces: `AwinClient(http, publisher_id, api_token)` con `async promotions(advertiser_ids: list[int]) -> list[AwinPromotion]` (`GET https://api.awin.com/publishers/{id}/promotions/`, cabecera `Authorization: Bearer`, parámetros `advertiserIds`, `regionCodes=ES`, `type=voucher`, `membership=joined`; paginado por `page`/`pageSize=200`); `@dataclass AwinPromotion(promotion_id: str, advertiser_id: int, title: str, description: str | None, terms: str | None, code: str | None, url_tracking: str, start: datetime, end: datetime | None)`. `AwinPromotionsSource(client, repo, merchants: dict[str, int | None])` (`type='awin_promotions'`): `advertiser_ids` = `mid` no nulos; mapa `mid → store id`; por voucher con código → `upsert_coupon(CouponUpsert(...))`; al final `deactivate_coupons_not_in(source.id, ids)`; si la API falla, propaga la excepción **antes** de desactivar nada.

- [ ] **Step 1: Tests**: fixture con 3 promociones (2 vouchers con código, 1 promoción sin código) → 2 `upsert_coupon`, `deactivate_coupons_not_in` con esos 2 ids; cliente que lanza `httpx.HTTPStatusError` → excepción y **ningún** `deactivate` (Review Focus 3); mapeo de fechas y `urlTracking`.
- [ ] **Step 2: FAIL.** **Step 3: Implementar**; `README.md`: variables nuevas, tiendas soportadas, cómo dar de alta una fuente API (`insert into sources …` de ejemplo para `aliexpress_api` y `awin_promotions`), qué pasa sin credenciales. **Step 4: `python -m pytest -q`** PASS.
- [ ] **Step 5: Commit** `feat(bot): Awin promotions source and docs`

### Task 9: Web: tiendas, filtro por tienda y URLs de producto por tienda

**Files:**
- Modify: `web/src/lib/stores.ts`, `lib/deals.ts`, `lib/urls.ts`, `lib/types.ts`, `hooks/useUrlFilters.ts`, `hooks/useDeals.ts`, `next.config.ts`
- Create: `web/src/lib/stores-data.ts`
- Test: `lib/stores.test.ts` (crear), `lib/deals.test.ts`, `lib/urls.test.ts`, `hooks/useUrlFilters.test.tsx`

**Interfaces:**
- Produces: `StoreInfo` gana `slug: string`; `storeFromSlug(slug) -> string | null`; `export type StoreStats = { store: string; deals: number; coupons: number }`; `fetchStores(client): Promise<StoreStats[]>` (vista `web_stores`, `deals > 0 or coupons > 0`). `fetchDeals` acepta `store?: string` (`.eq('store', store)`). `productPath(deal)` y `parseProductSlug(store: string, param: string) -> { slug: string; id: string } | null` por tienda (spec §7: amazon `[A-Za-z0-9]{10}`, aliexpress `\d{8,20}` tras el último `-`, resto: `param` entero es el id, `slug=''`). `useUrlFilters` devuelve `store: string | null` y `setStore`; `clear` también lo quita; `useDeals` incluye `store` en la clave de filtros. Reescritura `/?tienda=` → `/buscar`.

- [ ] **Step 1: Tests**: `productPath` → `/oferta/aliexpress/smart-tv-xiaomi-55-1005006123456789`, `/oferta/pccomponentes/ninja-af300-freidora-de-aire`; `parseProductSlug('amazon','auriculares-sony-b000000001')` → id `b000000001`; `parseProductSlug('aliexpress','smart-tv-1005006123456789')` → `1005006123456789`; `parseProductSlug('pccomponentes','ninja-af300-freidora-de-aire')` → id completo (Review Focus 4); `fetchDeals({ store: 'aliexpress' })` → `['eq', ['store', 'aliexpress']]`; `fetchStores` mapea y filtra ceros; `?tienda=aliexpress` en `useUrlFilters`.
- [ ] **Step 2: FAIL.** **Step 3: Implementar.** **Step 4: `npm test && npm run typecheck`** PASS.
- [ ] **Step 5: Commit** `feat(web): store data, store filter and per-store product URLs`

### Task 10: Web: botón de compra por tienda y ficha de producto

**Files:**
- Rename: `web/src/components/AmazonButton.tsx` → `BuyButton.tsx`
- Modify: `components/ProductView.tsx`, `app/oferta/[store]/[slug]/page.tsx`
- Test: `components/BuyButton.test.tsx` (crear), `components/ProductView.test.tsx`, `app/oferta/[store]/[slug]/page.test.tsx`

**Interfaces:**
- Produces: `BuyButton({ url, store, className })`: para `store === 'amazon'` mantiene el comportamiento actual (`/go/{ASIN}`, plataforma); para el resto `href={url}`, `target="_blank"`, `rel="sponsored noopener noreferrer"`, texto `storeInfo(store).cta`, icono `ShoppingCart`. La página de producto usa `parseProductSlug(store, param)` y redirige 308 solo cuando la tienda tiene slug (amazon, aliexpress) y no coincide.

- [ ] **Step 1: Tests**: `BuyButton` con `store='aliexpress'` abre `url` en pestaña nueva con `rel` sponsored y texto «Ir a AliExpress»; con `amazon` conserva el test actual. Página: `/oferta/pccomponentes/ninja-af300-freidora-de-aire` resuelve sin redirección; `/oferta/aliexpress/x-1005006123456789` con slug distinto → 308 a la canónica.
- [ ] **Step 2: FAIL.** **Step 3: Implementar.** **Step 4: PASS.**
- [ ] **Step 5: Commit** `feat(web): per-store buy button and product URLs`

### Task 11: Web: bloque de tiendas, hero dinámico, chips y metadatos

**Files:**
- Create: `web/src/components/StoresBlock.tsx` (+ test), `components/StoreChips.tsx` (+ test)
- Modify: `components/Hero.tsx` (+ test), `components/HomeClient.tsx` (+ test), `components/DealFeed.tsx`, `components/Footer.tsx` (+ test), `lib/seo.ts` (+ test), `app/page.tsx`, `app/buscar/page.tsx`

**Interfaces:**
- Consumes: `StoreStats`, `fetchStores`, `storeNames`.
- Produces: `StoresBlock({ stores: StoreStats[] })` → `null` si `stores.length < 2`; tarjetas con nombre y «N chollos · M cupones» (singular/plural), enlace `/tiendas/{slug}`. `StoreChips({ stores, active, onSelect })` junto a los hashtags, solo con ≥ 2 tiendas. `Hero({ highlights, storeNames: string[] })`: párrafo «{Amazon, AliExpress y PcComponentes}. Cada oferta con su precio, el precio anterior y el cupón si lo hay. Sin registros ni spam.» (`joinNames` de `CouponsBlock` extraído a `lib/text.ts`). `homeMetadata({ stores })` y `Footer({ year, stores })` reciben las tiendas con datos (sustituyen a `couponStores`). `HomeClient` recibe `stores: StoreStats[]`; `page.tsx` y `buscar/page.tsx` cargan `fetchStores` (opcional, `[]` si falla).

- [ ] **Step 1: Tests**: `StoresBlock` con solo Amazon → null; con dos → dos enlaces y recuentos; `Hero` con `storeNames=['Amazon']` → «Amazon. Cada oferta…», con tres → «Amazon, AliExpress y PcComponentes. Cada oferta…» (Review Focus 5); `Footer` nombra otras tiendas solo si están en `stores`; `homeMetadata({ stores: ['amazon'] }).title` sin «otras tiendas»; `HomeClient` sin `#tiendas` con una tienda y con él con dos.
- [ ] **Step 2: FAIL.** **Step 3: Implementar.** **Step 4: PASS.**
- [ ] **Step 5: Commit** `feat(web): stores block, store chips and data-driven store copy`

### Task 12: Web: páginas `/tiendas` y `/tiendas/{tienda}`, sitemap y README

**Files:**
- Create: `web/src/app/tiendas/page.tsx`, `app/tiendas/[store]/page.tsx`, `components/StoreClient.tsx` (+ test), `app/tiendas/page.test.tsx`
- Modify: `lib/seo.ts` (`storeMetadata`, `storesMetadata`), `lib/sitemap.ts` (+ test), `app/sitemap.ts`, `web/README.md`

**Interfaces:**
- Produces: `storeMetadata(store: string, deals: number)` (título «Chollos de {nombre} · PatoBarato», canonical `/tiendas/{slug}`, `noindex` si `deals < 3`); `storesMetadata(count)` (`noindex` si `count < 2`). `StoreClient` = `HashtagClient` con `store` fijo en lugar de `tag`, cabecera con recuentos y `CouponsBlock` de la tienda. `buildSitemap(deals, tags, siteUrl, { coupons, stores: StoreStats[] })` añade `/tiendas` (si ≥ 2) y `/tiendas/{slug}` con `deals >= 3`.

- [ ] **Step 1: Tests**: página de tienda desconocida → `notFound`; `storeMetadata('aliexpress', 2).robots` noindex; `StoreClient` muestra cabecera «AliExpress · 12 chollos · 3 cupones» y el feed con `store`; sitemap con tiendas.
- [ ] **Step 2: FAIL.** **Step 3: Implementar**; README: rutas nuevas, `?tienda=`, vista `web_stores`. **Step 4: `npm test && npm run typecheck && npm run lint && npm run build`** PASS.
- [ ] **Step 5: Commit** `feat(web): store pages and sitemap`

### Task 13: Verificación final

- [ ] **Step 1: Bot**: `python -m pytest -q` en verde; arranque en seco `python -m patobarato --help` (o el comando equivalente) sin credenciales nuevas muestra el aviso de tiendas desactivadas y no falla.
- [ ] **Step 2: Web**: `npm run lint && npm run typecheck && npm test && npm run build`; `node scripts/check-views.mjs` → OK (desde la máquina del usuario).
- [ ] **Step 3: Datos**: con la migración aplicada, `web_stores` devuelve `amazon` y la portada en producción no cambia visiblemente (sin bloque de tiendas) hasta que haya datos de otra tienda.
- [ ] **Step 4: Commit** final si quedó algo (`docs`), y entrega.
