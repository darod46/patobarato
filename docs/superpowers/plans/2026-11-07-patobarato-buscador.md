# Buscador global — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A dedicated `/buscar` page that searches PatoBarato's deals, AliExpress (live) and an Awin-fed store catalogue, reached from a header trigger; `/chollos` becomes a pure listing.

**Architecture:** The bot downloads Awin product feeds daily into `catalog_products` (Postgres full-text + trigram, exposed to the web only through `web_catalog_search`). The web adds a Node route handler that proxies and caches AliExpress keyword search with server-only credentials, a `SearchClient` page assembling three independent result blocks, and a header `SearchTrigger` linking to `/buscar`. `/chollos` reads its filters server-side; old `?q=` links redirect.

**Tech Stack:** Python 3.12 / httpx streaming / pytest (bot); Next.js 16 route handlers + `unstable_cache`, React 19, Tailwind v4, Vitest (web); PostgreSQL `pg_trgm`, `tsvector`, `security definer` function (Supabase).

**Spec:** `docs/superpowers/specs/2026-11-07-patobarato-buscador-design.md`

## Global Constraints

- Web: Lucide icons only (`src/icons.test.ts`); tokens from `web/src/app/globals.css`; tap targets ≥ 44 px; Spanish UI copy, English code/comments; `npm test && npm run typecheck && npm run lint && npm run build` stay green.
- Bot: errors logged as `Type: message` without URLs or tokens, never `exc_info`; feeds downloaded sequentially with `await sleep(15)` between them; 200 000-line cap per feed; `bot/.venv-linux/bin/python -m pytest -q` stays green.
- Supabase: `catalog_products`/`catalog_feeds` revoked from `anon`/`authenticated`; only `web_catalog_search(text, int)` is granted; migrations applied through the Management API and registered.
- Secrets: `ALIEXPRESS_APP_KEY`, `ALIEXPRESS_APP_SECRET`, `ALIEXPRESS_TRACKING_ID` are server-only (no `NEXT_PUBLIC_`), read only inside the route handler; the query string is never logged.
- Honesty: catalogue blocks are titled «En AliExpress» / «En tiendas», show `-N %`/previous price only when the origin provides a higher original price, and never a «mínimo».
- AliExpress route: `q` 2–80 chars → else 400; no credentials → 204; per-query cache 900 s; max 30 distinct queries/minute → 429 `Retry-After: 30`; upstream failure → 502.

## Review Focus

1. A feed line whose `price` is "1.234" or whose `sale_price` ≥ `price` — the product is kept with `sale_price = null` (or dropped when `price` is invalid), never a wrong number (Task 2).
2. A feed that fails after 300 products — those 300 are upserted but nothing is marked out of stock and `catalog_feeds.last_error` is set (Task 3).
3. `web_catalog_search` with `q` containing quotes, `&`, `:` or an `OR` — `websearch_to_tsquery` must not throw; 1-character `q` returns nothing (Task 1).
4. The AliExpress route called with `q` of 81 chars, with `q` = `"  "`, and 31 distinct queries in a minute — 400, 400, 429 (Task 6).
5. `/buscar?q=` typed quickly («fre» → «freidora») — a late response for «fre» must not overwrite «freidora» results (Task 8, `AbortController` + sequence check).

---

### Task 1: Migration: catalogue tables, search function, source row

**Files:**
- Create: `supabase/migrations/20261109000000_catalog.sql`
- Modify: `web/scripts/check-views.mjs`

**Interfaces:**
- Produces: tables, indexes, `sources_type_check` with `'awin_feeds'`, source row `('awin_feeds', 'awin-feeds', 'ES', true, 1440)`, function `web_catalog_search(q text, max int default 24)` returning `(store, external_id, title, brand, price, sale_price, currency, image_url, url, affiliate_url, updated_at)` — all exactly as spec §4.

- [ ] **Step 1: Write the migration** from spec §4 verbatim (extension, tables, indexes, constraint, source row, RLS + revokes, function with `security definer set search_path = public`, `revoke all on function … from public; grant execute … to anon, authenticated`).
- [ ] **Step 2: Validate on a local PostgreSQL** (scratch cluster as in the guides phase; `create extension pg_trgm` must be allowed): run all migrations in order, insert three products (`'Freidora de aire Ninja AF300'`, `'Cosori Lite 3,8 L'`, `'Cable HDMI 2 m'`), then assert: `select count(*) from web_catalog_search('freidora')` = 1; `('freidor')` = 1 (trigram); `('ninja OR cosori')` = 2; `('"freidora de aire"')` = 1; `('x')` = 0; `('a & b : c')` does not raise; an `in_stock=false` row is excluded; `set role anon; select * from catalog_products` → permission denied; `select * from web_catalog_search('ninja')` works as anon.
- [ ] **Step 3: `check-views.mjs`**: expect 401/403 for `catalog_products` and `catalog_feeds`, and 200 for `POST rest/v1/rpc/web_catalog_search` with body `{"q":"xx"}`.
- [ ] **Step 4: Apply through the Management API** (controller), register `20261109000000`, verify with the anon key.
- [ ] **Step 5: Commit** `chore(supabase): store catalogue tables and full-text search function`

### Task 2: Bot: Awin feed client

**Files:**
- Modify: `bot/src/patobarato/sources/awin_source.py`, `bot/src/patobarato/models.py`
- Create: `bot/tests/fixtures/awin_feed.jsonl`
- Test: `bot/tests/test_awin_feed.py`

**Interfaces:**
- Produces: `@dataclass(frozen=True) AwinFeedProduct(external_id: str, title: str, description: str | None, brand: str | None, gtin: str | None, category: str | None, price: Decimal, sale_price: Decimal | None, in_stock: bool, image_url: str | None, url: str, affiliate_url: str)`; `class AwinFeedError(Exception)`; `AwinClient.download_feed(advertiser_id: int, locale: str = 'es_ES') -> AsyncIterator[AwinFeedProduct]`; `AwinClient.feed_url(advertiser_id, locale) -> str` = `https://api.awin.com/publishers/{publisher_id}/awinfeeds/download/{advertiser_id}-retail-{locale}.jsonl`; `MAX_FEED_LINES = 200_000`; `parse_feed_line(line: str) -> AwinFeedProduct | None` (pure; `None` for an unusable product, logged at DEBUG with a reason counter).

- [ ] **Step 1: Fixture** `awin_feed.jsonl`: 10 lines — 7 valid products (one with `sale_price` lower than `price`, one with `availability: "out of stock"`, one with `description` longer than 500 chars), one with `price: "1.234"` (invalid → dropped), one with `sale_price` ≥ `price` (kept, `sale_price` None), one without `aw_deep_link` (dropped), and a final line `{"error": "Feed not found", "message": "…"}`.
- [ ] **Step 2: Failing tests**: `test_parse_feed_line_maps_fields` (all fields, description trimmed to 500, `in_stock` from `availability`), `test_parse_feed_line_drops_invalid_price`, `test_parse_feed_line_ignores_sale_price_not_lower`, `test_parse_feed_line_drops_without_affiliate_link`, `test_download_feed_streams_products_and_raises_on_error_line` (httpx `MockTransport` serving the fixture → 7 products yielded, then `AwinFeedError`), `test_download_feed_stops_at_line_cap` (`MAX_FEED_LINES` monkeypatched to 3 → 3 products and a WARNING), `test_feed_url_shape`, `test_download_feed_http_error_raises_feed_error` (401 → `AwinFeedError` with status, no URL in message).
- [ ] **Step 3: Run** → FAIL. **Step 4: Implement** with `self._http.stream('GET', url, headers={'Authorization': f'Bearer {token}'})` and `aiter_lines()`; prices through `patobarato.sources.generic_page._to_price` (import the strict parser; make it public as `parse_price` if it is private). **Step 5: Run** → PASS.
- [ ] **Step 6: Commit** `feat(bot): Awin product feed client`

### Task 3: Bot: catalogue repository and `AwinFeedsSource`

**Files:**
- Create: `bot/src/patobarato/sources/awin_feeds.py`
- Modify: `bot/src/patobarato/storage/repository.py`, `storage/supabase_repo.py`, `bot/src/patobarato/main.py` (`build_runners`), `bot/README.md`
- Test: `bot/tests/test_awin_feeds.py`, `bot/tests/test_repository.py`, `bot/tests/test_supabase_repo_rows.py`, `bot/tests/test_main.py`

**Interfaces:**
- Consumes: Task 2; `ApiSourceRunner`; `AwinClient` construction as in `build_runners` for `AwinPromotionsSource`.
- Produces: `@dataclass(frozen=True) CatalogRow(store, external_id, title, description, brand, gtin, category, price, sale_price, currency, in_stock, image_url, url, affiliate_url, feed_updated_at: datetime | None, updated_at: datetime | None = None)`; `Repository.upsert_catalog_products(rows: list[CatalogRow]) -> None` (Supabase: `upsert(on_conflict='store,external_id')`, `updated_at = now`); `Repository.mark_catalog_out_of_stock(store: str, seen_ids: set[str]) -> int` (empty set → 0 and WARNING, nothing touched; Supabase: select the `external_id`s with `in_stock = true` for the store (paged by 1 000), compute the complement of `seen_ids` in Python, then `update({'in_stock': False}).eq('store', store).in_('external_id', chunk)` per 1 000-id chunk; returns the number updated); `Repository.record_feed_run(store, advertiser_id, ran_at, products, error) -> None` (`upsert(on_conflict='store,advertiser_id')`); `Repository.find_catalog_product(store, url) -> CatalogRow | None`; `AwinFeedsSource(client, repo, settings, clock=utcnow, sleep=asyncio.sleep, batch_size=500, pause_seconds=15.0)` with `type = 'awin_feeds'`.

- [ ] **Step 1: Failing tests** (in-memory repo, fake client yielding scripted products / raising `AwinFeedError` mid-stream, recorded `sleep`): `test_run_upserts_in_batches` (1 201 products → 3 batches of 500/500/201), `test_run_marks_missing_out_of_stock_after_success` (previous ids a,b,c; feed has a,b → c out of stock, return 1), `test_run_failed_feed_keeps_stock_and_records_error` (Review Focus 2: error after 300 → 300 upserted, no out-of-stock call, `record_feed_run(error='AwinFeedError: …')`), `test_run_sleeps_between_feeds_not_after_last`, `test_run_without_merchants_warns`, `test_run_isolates_one_merchant_failure` (second merchant still processed); repository tests for the four methods (memory + Supabase recording fake incl. the complement logic); `test_build_runners_includes_awin_feeds_with_credentials`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** (merchants from `settings.awin_merchants` or `source.config['merchants']`, mids non-null; totals at INFO per store: `products`, `dropped`, `out_of_stock`). README: runner, limits, `last_run_at = null` to force. **Step 4: Run** → PASS (full suite).
- [ ] **Step 5: Commit** `feat(bot): Awin feeds runner filling the store catalogue`

### Task 4: Bot: guide prices from the catalogue

**Files:**
- Modify: `bot/src/patobarato/sources/guide_prices.py`
- Test: `bot/tests/test_guide_prices.py`

**Interfaces:**
- Consumes: `Repository.find_catalog_product(store, url)` (Task 3), `Store.canonical_for`.
- Produces: `CATALOG_FRESH_HOURS = 36`; the refresher prefers a catalogue row fresher than that: `upsert_product_price(price=sale_price or price, previous_price=price if sale_price else None, currency, affiliate_url, error=None)` and `set_product_image` when the product lacks one and the row has `image_url`; no `fetch_price` call in that case.

- [ ] **Step 1: Failing tests**: `test_refresh_prefers_fresh_catalog_row` (store `fetch_price` not called; price = sale_price; previous = price; affiliate from the row), `test_refresh_ignores_stale_catalog_row` (updated 40 h ago → reader used), `test_refresh_catalog_row_without_sale_has_no_previous`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS. **Step 5: Commit** `feat(bot): guide prices from the store catalogue when fresh`

### Task 5: Web: AliExpress client (server-only)

**Files:**
- Create: `web/src/lib/aliexpress.ts`, `web/src/lib/aliexpress.test.ts`, `web/src/lib/catalog.ts` (types + `fetchCatalogSearch`), `web/src/lib/catalog.test.ts`

**Interfaces:**
- Produces (`lib/catalog.ts`): `type CatalogProduct = { origin: 'aliexpress' | 'awin'; store: string; externalId: string; title: string; price: number; originalPrice: number | null; discountPct: number | null; currency: string; imageUrl: string | null; affiliateUrl: string }`; `fetchCatalogSearch(client, q, max = 12) -> Promise<CatalogProduct[]>` (`client.rpc('web_catalog_search', { q, max })`, maps rows: `price = sale_price ?? price`, `originalPrice = sale_price ? price : null`, `discountPct` via `discountPercent`, `origin: 'awin'`). (`lib/aliexpress.ts`): `type AliCredentials = { appKey: string; appSecret: string; trackingId: string }`; `signParams(params: Record<string, string>, secret: string) -> string` (HMAC-SHA256 over `key+value` sorted by key, uppercase hex, `sign` excluded — identical to the bot's `AliExpressClient.sign`); `searchAliExpress(q: string, creds: AliCredentials, fetchImpl = fetch, now = Date.now) -> Promise<CatalogProduct[]>` (POST `https://api-sg.aliexpress.com/sync`, form-encoded `app_key, timestamp (ms), sign_method=sha256, method=aliexpress.affiliate.product.query, v=2.0, format=json, keywords, ship_to_country=ES, target_currency=EUR, target_language=ES, page_size=12, page_no=1, sort=LAST_VOLUME_DESC, tracking_id, sign`; throws `AliExpressError` on non-200 or `error_response`); mapping: `product_id, product_title, target_sale_price, target_original_price (null unless > sale), discount ("45%") → number`, `product_main_image_url`, `promotion_link ?? product_detail_url`, `store: 'aliexpress'`.

- [ ] **Step 1: Failing tests**: `signParams` against a vector computed with the Python client (`bot/.venv-linux/bin/python -c "from patobarato.stores.aliexpress_client import AliExpressClient; …"` — put the exact params and expected hex in the test); `searchAliExpress` sends the expected form fields (mock `fetchImpl`), maps a sample payload, drops products with invalid prices, treats `error_response` as `AliExpressError`; `fetchCatalogSearch` calls `rpc` with `{ q, max }` and maps sale/previous correctly.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** (Node `crypto` for HMAC; the module must not be imported by client components). **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(web): AliExpress search client and catalogue search access`

### Task 6: Web: `/api/buscar/aliexpress` route

**Files:**
- Create: `web/src/app/api/buscar/aliexpress/route.ts`, `web/src/app/api/buscar/aliexpress/route.test.ts`, `web/src/lib/rate-limit.ts` (+ test)

**Interfaces:**
- Consumes: Task 5.
- Produces: `GET` handler: `q` from `searchParams`, trimmed; 400 `{ error: 'invalid_query' }` outside 2–80 chars; 204 when any env var is missing; `RateLimiter(max = 30, windowMs = 60_000).allow(key)` on normalised `q` → 429 with `Retry-After: 30`; otherwise `cachedSearch(q)` = `unstable_cache(() => searchAliExpress(...), ['ali-search'], { revalidate: 900 })` keyed by `q.toLowerCase()`; 200 JSON `{ products }` with `Cache-Control: public, s-maxage=900, stale-while-revalidate=3600`; upstream error → 502 `{ error: 'upstream' }`; `console.error` logs only the error type, never `q`.

- [ ] **Step 1: Failing tests** (Review Focus 4): 81-char and blank `q` → 400; missing env → 204; 31 distinct queries → 429 on the 31st with `Retry-After`; success → 200 with the cache header and the mapped products (mock `searchAliExpress`); upstream throw → 502 and no `q` in the logged message. Mock `unstable_cache` to a pass-through in tests.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** (`export const runtime = 'nodejs'`). **Step 4: Run** → PASS; `npm run typecheck`.
- [ ] **Step 5: Commit** `feat(web): AliExpress search route with cache and rate limit`

### Task 7: Web: catalogue components and search hook

**Files:**
- Create: `web/src/components/search/CatalogCard.tsx`, `CatalogBlock.tsx`, `web/src/hooks/useCatalogSearch.ts`, each with a test

**Interfaces:**
- Consumes: `CatalogProduct` (Task 5), `BuyButton`, `storeInfo`, `formatPrice`, `DealCardSkeleton` (check the existing skeleton component name in `DealFeed.tsx`).
- Produces: `CatalogCard({ product })` (image or placeholder, chip «AliExpress»/`storeInfo(store).short`, two-line title, price, struck `originalPrice` + `-N %` only when `originalPrice !== null`, `BuyButton url={affiliateUrl} store={store}` — for AliExpress the button opens the promotion link; **never** `/go/`); `type CatalogState = { status: 'idle' | 'loading' | 'ready' | 'error'; products: CatalogProduct[] }`; `useCatalogSearch(q: string, fetcher: (q: string, signal: AbortSignal) => Promise<CatalogProduct[]>, minLength = 2) -> CatalogState` (debounce 300 ms, `AbortController` per request, sequence number so a late response never overwrites a newer one — Review Focus 5); `CatalogBlock({ title, note, state, maxItems = 12, hideWhenEmpty = false })` → `null` when `hideWhenEmpty && status === 'ready' && products.length === 0`; `loading` → 6 skeletons; `error` → «Ahora mismo no podemos buscar en {title sin «En »}»; `ready` empty → «No hemos encontrado nada en {…}»; footer «Enlaces de afiliado».

- [ ] **Step 1: Failing tests**: `CatalogCard` (badge only with original price; Awin chip text; `rel="sponsored noopener noreferrer"`); `CatalogBlock` (each state, cap at 12, `hideWhenEmpty`); `useCatalogSearch` (fake timers: debounce; abort of the previous request; a resolved stale promise ignored; `q` under `minLength` → `idle`).
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS, `icons.test.ts` green.
- [ ] **Step 5: Commit** `feat(web): catalogue result components and search hook`

### Task 8: Web: `/buscar` page and `SearchClient`

**Files:**
- Create: `web/src/components/SearchClient.tsx` (+ test), `web/src/components/search/SearchField.tsx` (+ test), `web/src/components/search/SearchShortcuts.tsx` (+ test)
- Modify: `web/src/app/buscar/page.tsx` (+ test), `web/src/lib/seo.ts` (`searchMetadata(q: string | null)`), `web/src/lib/seo.test.ts`

**Interfaces:**
- Consumes: Tasks 5–7, `DealFeed` (with `q`, `sort='recientes'`, no `onSort`/`onTag`/`onStore`, `initialDeals` optional), `fetchHashtags`, `fetchStores`, `storeInfo` (shortcuts are plain link chips, not `HashtagChips`).
- Produces: `searchMetadata(q)` → title «Buscar chollos · PatoBarato», canonical `/buscar`, `robots: NOINDEX` when `q` is non-empty, description «Busca un producto y compara…»; `SearchField({ value, onChange, autoFocus })` (`h-14`, Lucide `Search`, clear `X` 44 px, GET form to `/buscar`, Enter applies at once); `SearchShortcuts({ tags, stores })` («Búsquedas habituales» chips → `/chollos/{tag}`; «Tiendas» → `/tiendas/{slug}`); `SearchClient({ now, initialQ, tags, stores, fetchDeals?, fetchAli?, fetchCatalog? })` — reads/writes `?q=` with `replaceState` (debounced 300 ms) via a small `useSearchQuery` hook (do not reuse `useUrlFilters`); with `q.length >= 2` renders H1 «Resultados para “{q}”» and the three blocks (Chollos via `DealFeed`; AliExpress via `useCatalogSearch(q, fetchAli)` where `fetchAli` GETs `/api/buscar/aliexpress?q=` and treats 204 as `[]` with the block hidden; Tiendas via `useCatalogSearch(q, fetchCatalog)` with `hideWhenEmpty`); with 1 char: «Escribe al menos dos letras»; with none: H1 «Buscar» + `SearchShortcuts`. `page.tsx`: dynamic (`searchParams`), loads tags/stores through `optional('buscar', …)`, `Header` with the trigger hidden (`searchTrigger={false}`, Task 9), breadcrumbs JSON-LD Inicio › Buscar.

- [ ] **Step 1: Failing tests**: `SearchClient` without `q` (shortcuts, no blocks), with `q='x'` (hint), with `q='freidora'` (three blocks; AliExpress hidden when fetcher yields 204; Tiendas hidden when empty; a stale response ignored — Review Focus 5 at page level), typing updates the URL (`history.replaceState` spy) after 300 ms; `page.test.tsx` metadata noindex with `q`, indexable without; `SearchField` clear + Enter.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(web): /buscar search page with deals, AliExpress and store catalogue`

### Task 9: Web: header trigger, listing without search, redirects, sitemap, README

**Files:**
- Create: `web/src/components/SearchTrigger.tsx` (+ test)
- Modify: `web/src/components/Header.tsx` (+ test), `HomeClient.tsx`, `DealsClient.tsx`, `HashtagClient.tsx`, `StoreClient.tsx` (+ tests), `web/src/hooks/useUrlFilters.ts` (+ test), `web/src/app/chollos/page.tsx` (+ test), `web/next.config.ts`, `web/src/lib/sitemap.ts` (+ test), `web/src/lib/seo.ts` (`dealsMetadata` without `q`), `web/README.md`; delete `HeaderSearch.tsx`, `HeaderSearchToggle.tsx`, their tests and `test-utils/openSearch.ts`; all page top paddings back to `pt-24` mobile / existing desktop.

**Interfaces:**
- Produces: `SearchTrigger()` — `<a href="/buscar">` with `aria-label="Buscar"`: on `md+` a pill (`h-11 max-w-[320px] bg-surface border-[#d7dae0]`, Lucide `Search`, text «Buscar chollos…» in `muted`), below `md` a 44 px round icon; `Header({ searchTrigger = true })`; `useUrlFilters` returns `{ tag, store, sort, setTag, setStore, setSort, clear }` (no `q`); `/chollos` page reads `searchParams` (`tag`, `orden`, `tienda`) server-side, validates them like `useUrlFilters` does, renders page 0 already filtered and passes `initialDeals` with those filters; `next.config.ts`: `redirects()` with `{ source: '/', has: [{ type: 'query', key: 'q' }], destination: '/buscar?q=:q', permanent: true }` and the same for `/chollos`; all `rewrites()` to `/buscar` removed; `buildSitemap` adds `{ url: `${siteUrl}/buscar` }` after `/chollos`.

- [ ] **Step 1: Failing tests**: `SearchTrigger` href/label; `Header` renders the trigger by default and not with `searchTrigger={false}`; `DealsClient`/`HashtagClient`/`StoreClient` render no search field; `useUrlFilters` has no `q`; `/chollos` page test passes `tag`/`orden`/`tienda` through `searchParams` to the first fetch; `next.config` test asserting the two redirects and no rewrite targets `/buscar`; sitemap includes `/buscar`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement**; README: `/buscar`, the route, env vars, `web_catalog_search`. **Step 4: Run** `npm test && npm run typecheck && npm run lint && rm -rf .next && npm run build` → PASS.
- [ ] **Step 5: Commit** `feat(web): search trigger in the header, pure /chollos listing and redirects`

### Task 10: Verification

- [ ] **Step 1:** bot `python -m pytest -q` green; web gates + build green; `check-views.mjs` from the user's machine.
- [ ] **Step 2:** Controller applies the migration (Task 1 Step 4) if not yet done; user sets `ALIEXPRESS_*` in Vercel; after deploy, search «freidora» on `/buscar` in a preview and confirm the AliExpress block (the sandbox cannot reach the API).
- [ ] **Step 3:** Hand-off notes: Awin feeds start filling once a `mid` is accepted; `/chollos` is now dynamic.
