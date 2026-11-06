# Guías de compra — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish buying guides whose products show the current price in every store that sells them, the applicable coupon and the final price, with prices refreshed by the bot.

**Architecture:** Guide content lives in four new Supabase tables exposed to the web only through `web_guides*` views. The bot gains a `fetch_price` reader per store (Amazon page, AliExpress API, Awin page metadata) and a `GuidePriceRefresher` runner driven by the existing `ApiScheduler`, which writes one `product_prices` row per product. The web renders `/guias` and `/guias/{slug}` from the views with pure helpers for "te queda en", best offer and freshness.

**Tech Stack:** Python 3.12 / httpx / pydantic-settings / pytest (bot); Next.js 16 / React 19 / Tailwind v4 / Vitest + Testing Library / react-markdown + remark-gfm (web); Supabase SQL views (RLS: base tables revoked from anon).

**Spec:** `docs/superpowers/specs/2026-11-06-patobarato-guias-design.md`

## Global Constraints

- Web: Lucide icons only (`src/icons.test.ts` enforces); design tokens from `web/src/app/globals.css`; tap targets ≥ 44 px; Spanish UI copy, English code and comments; `revalidate = 60` on data pages; `npm test && npm run typecheck && npm run lint && npm run build` stay green.
- Bot: Python 3.12; errors logged as `Type: message` without URLs or secrets, never `exc_info`; no reader raises — every failure returns `None`; sequential requests with a delay (default `1.5` s, `GUIDE_PRICE_DELAY_SECONDS`); suite via `bot/.venv-linux/bin/python -m pytest -q` stays green.
- Supabase: every new table gets `revoke all on <table> from anon, authenticated;`; the web reads only `web_*` views; migrations are applied through the Management API and registered in `supabase_migrations.schema_migrations`.
- Honesty: no price shown without a recent (`< 48 h`, no error) check; `-N %` only when `previous_price > price`; «Mínimo de los últimos 90 días» only when `price <= previous_min_price` from own publications; no negative final prices.
- Out of scope: admin portal, alerts, price history, Awin feeds, PA-API.

## Review Focus

1. Amazon page with a price in «1.234,56 €» format and a struck "Precio recomendado" — `extract_price` must parse the thousands separator and return `previous_price`; a page without a buy box must return `None`, never a wrong number (Task 3).
2. A coupon whose `min_purchase` exceeds the price, or a `discount_pct` that would push the price below zero — `finalPrice` returns `null` / never negative (Task 9).
3. A guide published with every reader failing — the page renders, shows «Precios no disponibles», is `noindex`, and the sitemap still lists it (Task 12, Task 13).
4. The refresher hitting an exception in one product (repo failure) — the loop continues, the delay is still honoured, the source's `last_error` is set only by the scheduler (Task 6).
5. A product listed in two published guides — refreshed once per pass (`list_guide_products` dedupes), and the `/oferta` link lists both guides (Task 2, Task 12).

---

### Task 1: Migration: guides, prices, coupon values, views, seed

**Files:**
- Create: `supabase/migrations/20261108000000_guides.sql`, `supabase/migrations/20261108000001_guides_seed.sql`
- Modify: `web/scripts/check-views.mjs`

**Interfaces:**
- Produces: tables `guides`, `guide_items`, `guide_item_stores`, `product_prices` and columns `coupons.discount_amount/discount_pct/min_purchase` exactly as in spec §4; `sources.type` check gains `'guide_prices'` and a row `('guide_prices', 'guides', 'ES', true, every_minutes 360)`; views `web_guides`, `web_guide_items`, `web_guides_by_product` with the columns listed in spec §4; `web_coupons` recreated with the three new columns.

- [ ] **Step 1: Write `20261108000000_guides.sql`** with the DDL from spec §4 verbatim, then the views:
  - `web_guides`: `select g.slug, g.title, g.subtitle, g.category, g.author, g.reading_minutes, g.published_at, g.updated_at, g.intro_md, g.how_to_choose_md, g.faq, (select count(*)::int from guide_items i where i.guide_id = g.id) as items, (select max(pp.checked_at) from guide_items i join guide_item_stores s on s.guide_item_id = i.id join products p on p.store = s.store and p.country = 'ES' and p.asin = s.external_id join product_prices pp on pp.product_id = p.id where i.guide_id = g.id and pp.error is null) as prices_checked_at from guides g where g.status = 'published'`.
  - `web_guide_items`: one row per `guide_item_stores` of published guides, `left join products` on `(store, 'ES', external_id)`, `left join product_prices`, `previous_min_price` as a lateral `min(published_price)` over `publications` of that product (copy the subquery shape from `20261106000000_web_deals_v3.sql`), and the applicable coupon as a lateral `select … from coupons c where c.active and c.store = s.store and c.starts_at <= now() and (c.expires_at is null or c.expires_at > now()) order by (case when c.discount_amount is not null and (c.min_purchase is null or pp.price >= c.min_purchase) then c.discount_amount when c.discount_pct is not null then pp.price * c.discount_pct / 100 else 0 end) desc, c.expires_at nulls last limit 1`. Columns exactly: `guide_slug, item_id, position, name, award, summary_md, pros, cons, specs, image_url` (`coalesce(i.image_url, p.image_url)`), `store, external_id, url, note, store_position, product_id, price, previous_price, currency, checked_at, price_error` (`pp.error is not null`), `previous_min_price, coupon_code, coupon_title, coupon_expires_at, discount_amount, discount_pct, min_purchase`.
  - `web_guides_by_product`: `select distinct p.id as product_id, g.slug as guide_slug, g.title as guide_title from guides g join guide_items i … join guide_item_stores s … join products p … where g.status = 'published'`.
  - `create or replace view web_coupons` adding `discount_amount, discount_pct, min_purchase`.
  - Grants: `revoke all on guides, guide_items, guide_item_stores, product_prices from anon, authenticated;` and `grant select on web_guides, web_guide_items, web_guides_by_product to anon, authenticated;` (after a `revoke all` on each view, as the previous migrations do).
- [ ] **Step 2: Write `20261108000001_guides_seed.sql`**: one `guides` row (`slug 'freidoras-de-aire-menos-100'`, `title 'Las mejores freidoras de aire por menos de 100 €'`, `subtitle` and `intro_md` from the mockup copy, `category 'Hogar'`, `status 'draft'`, `reading_minutes 8`, two FAQ entries with `[CORCHETES]` answers), four `guide_items` (Ninja AF300 Dual Zone 7,6 L «Mejor en general»; Cosori Lite 3,8 L «Mejor calidad-precio»; Cecotec Cecofry Full Inox 5,5 L «Más barata»; Ufesa Delicious 5,5 L «También buena») with the mockup's pros/cons/specs, and `guide_item_stores` rows with `external_id` placeholders `[ASIN]`, `[SLUG_PCCOMPONENTES]`, `[SLUG_MEDIAMARKT]`, `[ID_ALIEXPRESS]` and `url` placeholders `[URL]`. Use `with g as (insert … returning id)` CTEs so the file runs in one statement batch.
- [ ] **Step 3: Extend `web/scripts/check-views.mjs`**: expect HTTP 200 for `web_guides`, `web_guide_items`, `web_guides_by_product` and 401/403 for `guides`, `guide_items`, `guide_item_stores`, `product_prices`, following the existing pattern.
- [ ] **Step 4: Apply both migrations through the Management API** (built-in browser tab on `api.supabase.com`, as in previous phases), register them in `supabase_migrations.schema_migrations`, and verify with the anon key: `GET /rest/v1/web_guides` → 200 `[]` (seed is draft), `GET /rest/v1/guides` → 401.
- [ ] **Step 5: Commit** `chore(supabase): guides schema, product prices, coupon values and views`

### Task 2: Bot models and repository: guide products and prices

**Files:**
- Modify: `bot/src/patobarato/models.py`, `storage/repository.py`, `storage/supabase_repo.py`
- Test: `bot/tests/test_repository.py`, `bot/tests/test_supabase_repo_rows.py`

**Interfaces:**
- Produces: `@dataclass(frozen=True) PriceQuote(price: Decimal, previous_price: Decimal | None, currency: str = 'EUR', image_url: str | None = None)`; `@dataclass(frozen=True) GuideProduct(store: str, external_id: str, url: str, name: str, image_url: str | None)`; `Repository.list_guide_products() -> list[GuideProduct]` (published guides only, deduplicated by `(store, external_id)`, ordered by store then external_id); `Repository.upsert_product_price(product_id: int, *, checked_at: datetime, price: Decimal | None = None, previous_price: Decimal | None = None, currency: str = 'EUR', error: str | None = None) -> None` (with `error` set, `price`/`previous_price` of an existing row are kept). `InMemoryRepository` gains `add_guide_product(product: GuideProduct, published: bool = True)` and `prices: dict[int, dict]` for inspection.

- [ ] **Step 1: Write failing tests** in `test_repository.py`: `test_list_guide_products_dedupes_and_skips_drafts` (two published guides sharing an item → one entry; a draft entry absent); `test_upsert_product_price_keeps_price_on_error` (price 99.90 written, then `error='captcha'` → price still 99.90, `error` set, `checked_at` updated); `test_upsert_product_price_clears_error_on_success`. In `test_supabase_repo_rows.py` (recording fake client): `list_guide_products` selects from `guide_item_stores` with the join and `status eq published` filter the implementation uses, and `upsert_product_price` sends `{'product_id', 'checked_at', 'error'}` only on error and the full row on success (`.upsert(..., on_conflict='product_id')` — `product_id` is the primary key, so PostgREST upsert works here).
- [ ] **Step 2: Run** `.venv-linux/bin/python -m pytest tests/test_repository.py tests/test_supabase_repo_rows.py -q` → FAIL (missing names).
- [ ] **Step 3: Implement** the dataclasses in `models.py`, the protocol methods, the in-memory versions and the Supabase versions. Supabase `list_guide_products`: `select('store, external_id, url, guide_items!inner(name, image_url, guides!inner(status))').eq('guide_items.guides.status', 'published')` then dedupe in Python. On error, `upsert_product_price` must not overwrite `price`: read the existing row first (`select price, previous_price, currency`) and resend it with the error.
- [ ] **Step 4: Run** the two files, then the full suite → PASS.
- [ ] **Step 5: Commit** `feat(bot): guide products and product price repository support`

### Task 3: Amazon price reader

**Files:**
- Modify: `bot/src/patobarato/sources/amazon_page.py`, `bot/src/patobarato/stores/amazon.py`, `bot/src/patobarato/stores/base.py`
- Create: `bot/tests/fixtures/amazon_price.html`, `bot/tests/fixtures/amazon_no_price.html` (trimmed real pages; the captcha fixture already exists if `test_amazon_page.py` has one, otherwise add `amazon_captcha.html`)
- Test: `bot/tests/test_amazon_page.py`, `bot/tests/test_stores_amazon.py`

**Interfaces:**
- Consumes: `PriceQuote` (Task 2).
- Produces: `Store.fetch_price(self, product_id: str, canonical_url: str) -> PriceQuote | None` on the protocol, `BaseStore.fetch_price` returning `None`; `extract_price(page: str) -> PriceQuote | None` in `amazon_page.py`; `AmazonPageFetcher(client).fetch(asin, country) -> str | None` (one GET with `BROWSER_HEADERS`, `None` on network error, non-200 or captcha, with the same counters/log lines `AmazonImageFinder` uses today); `AmazonImageFinder` refactored to use the fetcher; `AmazonStore.fetch_price` returns `PriceQuote(..., image_url=resize_image_url(extract_image_url(page)))` when the page has an image.

- [ ] **Step 1: Write failing tests**: `test_extract_price_parses_thousands_and_previous` (fixture with `<span class="a-offscreen">1.234,56 €</span>` in the buy box and a `basisPrice` «1.499,00 €» → `Decimal('1234.56')`, previous `Decimal('1499.00')`); `test_extract_price_without_buybox_is_none`; `test_extract_price_ignores_prices_outside_buybox` (a related-products price before the buy box is not picked: anchor on `#corePriceDisplay_desktop_feature_div` / `#corePrice_feature_div`, falling back to `#apex_desktop`); `test_amazon_store_fetch_price_returns_quote_with_image` (httpx `MockTransport` serving the fixture); `test_amazon_store_fetch_price_captcha_is_none`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.** Price text → `Decimal`: strip `€`, spaces and NBSP, remove `.` thousands separators, replace `,` with `.`. `previous_price` only when greater than `price`.
- [ ] **Step 4: Run** `tests/test_amazon_page.py tests/test_stores_amazon.py` and the full suite → PASS (existing image tests unchanged).
- [ ] **Step 5: Commit** `feat(bot): Amazon price reader sharing the product page fetch`

### Task 4: AliExpress price reader

**Files:**
- Modify: `bot/src/patobarato/stores/aliexpress.py`, `bot/src/patobarato/stores/aliexpress_client.py` (only if `product_detail` lacks `original_price`/`image_url` mapping — verify)
- Test: `bot/tests/test_stores_aliexpress.py`, `bot/tests/test_aliexpress_client.py`

**Interfaces:**
- Consumes: `AliExpressClient.product_detail(product_id) -> AliProduct | None` (exists: fields `price`, `original_price`, `image_url`).
- Produces: `AliExpressStore.fetch_price(product_id, canonical_url) -> PriceQuote | None` → `PriceQuote(price=p.price, previous_price=p.original_price if > price else None, image_url=p.image_url)`; `None` (WARNING `Type: msg`) on `AliExpressError`/`httpx.HTTPError` or when the API returns no product.

- [ ] **Step 1: Write failing tests**: `test_fetch_price_maps_product_detail` (fake client returning an `AliProduct` with price 89.99, original 119.99 → quote with previous 119.99); `test_fetch_price_without_original_has_no_previous`; `test_fetch_price_api_error_is_none_and_logged` (caplog has `AliExpressError` name, no URL).
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** both files + suite → PASS.
- [ ] **Step 5: Commit** `feat(bot): AliExpress price reader`

### Task 5: Generic product metadata and Awin price reader

**Files:**
- Modify: `bot/src/patobarato/sources/generic_page.py`, `bot/src/patobarato/stores/awin.py`
- Create: `bot/tests/fixtures/pccomponentes_product.html`, `mediamarkt_product.html`, `elcorteingles_product.html` (trimmed real product pages: `<head>` with JSON-LD / meta tags only)
- Test: `bot/tests/test_generic_page.py`, `bot/tests/test_stores_awin.py`

**Interfaces:**
- Produces: `@dataclass(frozen=True) ProductMeta(image_url: str | None, price: Decimal | None, previous_price: Decimal | None, currency: str | None)`; `product_meta(page: str) -> ProductMeta` (pure; JSON-LD `Product` → `offers` (`Offer` or `AggregateOffer`: `price`/`lowPrice`, `priceCurrency`), else `product:price:amount`/`product:price:currency`; `og:image` as today); `fetch_product_meta(http, url) -> ProductMeta | None` (GET, `None` on error/non-200); `og_image` kept as a thin wrapper; `AwinStore.fetch_price` → `PriceQuote` from `fetch_product_meta` when `price` is present (currency defaults to `EUR`).

- [ ] **Step 1: Write failing tests**: `test_product_meta_json_ld_offer` (PcComponentes fixture), `test_product_meta_aggregate_offer_low_price` (MediaMarkt fixture), `test_product_meta_meta_tags_fallback` (El Corte Inglés fixture), `test_product_meta_without_price` (only og:image → price None), `test_product_meta_json_ld_in_graph` (`@graph` array containing the Product); `test_awin_store_fetch_price` (MockTransport) and `test_awin_store_fetch_price_http_error_is_none`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** (JSON-LD parsed with `json.loads` per `<script type="application/ld+json">`, tolerant to invalid JSON blocks → skip). **Step 4: Run** → PASS (existing `og_image` tests unchanged).
- [ ] **Step 5: Commit** `feat(bot): product metadata reader and Awin prices`

### Task 6: GuidePriceRefresher runner and wiring

**Files:**
- Create: `bot/src/patobarato/sources/guide_prices.py`
- Modify: `bot/src/patobarato/main.py` (`build_runners`), `bot/src/patobarato/config.py`, `bot/.env.example`, `bot/README.md`
- Test: `bot/tests/test_guide_prices.py`, `bot/tests/test_main.py`

**Interfaces:**
- Consumes: `StoreRegistry.get(store_id) -> Store | None`, `Store.fetch_price`, `Store.canonical_for(url, country)`, `Repository.list_guide_products / upsert_product / upsert_product_price / set_product_image / get_products_without_image` (Task 2), `ApiSourceRunner` protocol, `ParsedOffer`.
- Produces: `GuidePriceRefresher(registry, repo, clock=utcnow, sleep=asyncio.sleep, delay_seconds=1.5)` with `type = 'guide_prices'` and `async run(source: ApiSource) -> None`; `Settings.guide_price_delay_seconds: float = 1.5`; `build_runners` always appends it.

- [ ] **Step 1: Write failing tests** (in-memory repo, `FakeStore(BaseStore)` with scripted `fetch_price` results, recorded `sleep` calls): `test_refresh_writes_price_and_image` (quote with image → `prices[product_id]` has price, `error None`, product image set); `test_refresh_records_error_and_keeps_old_price` (first pass price, second pass `None` → error `'no price'`, price kept); `test_refresh_unknown_store_marks_store_disabled` (store not in registry → `error='store_disabled'` if the product already exists, otherwise skipped without insert); `test_refresh_isolates_repo_exception` (repo raising on the first product → second product still refreshed; caplog has `Type: msg` without URL); `test_refresh_sleeps_between_products` (N products → N-1 sleeps of `delay_seconds`); `test_refresh_existing_title_is_kept` (`upsert_product` with an existing product keeps its title — verify how `InMemoryRepository.upsert_product` behaves and assert accordingly; if it overwrites, pass the existing title through `ParsedOffer`); `test_build_runners_always_includes_guide_prices` in `test_main.py`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** per spec §6 (`ParsedOffer(asin=external_id, country='ES', store=store, title=name, price=None, previous_price=None, coupon=None, hashtags=[], canonical_url=canonical, product_url=url, image_url=image_url)`); totals logged at INFO. Document `GUIDE_PRICE_DELAY_SECONDS` in `.env.example` and the runner + «cómo dar de alta una guía por SQL» (pointing at the seed file) in `README.md`.
- [ ] **Step 4: Run** `tests/test_guide_prices.py tests/test_main.py` + full suite → PASS.
- [ ] **Step 5: Commit** `feat(bot): guide price refresher`

### Task 7: Web data layer: guides and coupon values

**Files:**
- Create: `web/src/lib/guides-data.ts`, `web/src/lib/guides-data.test.ts`
- Modify: `web/src/lib/coupons.ts`, `web/src/lib/coupons.test.ts`, `web/src/lib/types.ts`

**Interfaces:**
- Produces (in `lib/types.ts`): `Coupon` gains `discountAmount: number | null`, `discountPct: number | null`, `minPurchase: number | null`; `GuideSummary { slug, title, subtitle, category, author, readingMinutes, publishedAt, updatedAt, items: number, pricesCheckedAt: string | null }`; `GuideStoreOffer { store, externalId, url, note, productId: number | null, price: number | null, previousPrice: number | null, currency, checkedAt: string | null, priceError: boolean, previousMinPrice: number | null, coupon: GuideCoupon | null }` with `GuideCoupon { code, title, expiresAt, discountAmount, discountPct, minPurchase }`; `GuideItem { id, position, name, award, summaryMd, pros: string[], cons: string[], specs: { label: string; value: string }[], imageUrl: string | null, stores: GuideStoreOffer[] }`; `Guide extends GuideSummary { introMd, howToChooseMd, faq: { q: string; aMd: string }[], items: GuideItem[] }`. Functions: `fetchGuides(client) -> Promise<GuideSummary[]>` (`web_guides`, ordered by `published_at desc`), `fetchGuide(client, slug) -> Promise<Guide | null>` (`web_guides` row by slug plus `web_guide_items` by `guide_slug` ordered by `position, store_position`, grouped by `item_id`), `fetchGuidesByProduct(client, productId) -> Promise<{ slug: string; title: string }[]>`.

- [ ] **Step 1: Write failing tests** with the existing fake query-builder pattern: `fetchGuides` maps rows; `fetchGuide` groups store rows into items in order and returns `null` for no row; `fetchGuidesByProduct` filters `eq product_id`; `fetchCoupons` maps the three new columns (null-safe).
- [ ] **Step 2: Run** `npm test -- guides-data coupons` → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS, `npm run typecheck` clean.
- [ ] **Step 5: Commit** `feat(web): guide data access and coupon values`

### Task 8: Markdown component

**Files:**
- Create: `web/src/components/Markdown.tsx`, `web/src/components/Markdown.test.tsx`
- Modify: `web/package.json` (add `react-markdown`, `remark-gfm` — pinned exact versions current at install time)

**Interfaces:**
- Produces: `Markdown({ source, className }: { source: string; className?: string })` rendering GFM, `skipHtml`, external links `rel="nofollow noopener noreferrer" target="_blank"`, internal (`/…` or same host) links plain; typography classes consistent with `LegalLayout` prose.

- [ ] **Step 1: Write failing tests**: raw `<script>` is dropped; a GFM table renders `<table>`; external link has `rel` and `target`; internal link has neither.
- [ ] **Step 2: Run** → FAIL. **Step 3: `npm install react-markdown@<exact> remark-gfm@<exact>`, implement.** **Step 4: Run** → PASS; `npm run build` still works (ESM-only packages are fine in Next 16).
- [ ] **Step 5: Commit** `feat(web): markdown renderer for guide content`

### Task 9: Guide logic helpers

**Files:**
- Create: `web/src/lib/guides.ts`, `web/src/lib/guides.test.ts`

**Interfaces:**
- Consumes: types from Task 7.
- Produces: `finalPrice(price: number | null, coupon: GuideCoupon | null, now: Date) -> number | null`; `isRecent(offer: GuideStoreOffer, now: Date) -> boolean` (`checkedAt` within 48 h and `!priceError` and `price !== null`); `bestOffer(stores: GuideStoreOffer[], now: Date) -> { store: string; price: number; withCoupon: boolean } | null`; `freshnessLabel(checkedAt: string | null, now: Date) -> string` («Precios revisados hace 2 h» / «Precios revisados hace 1 día»… using the existing relative-time helper in `lib/` if one exists, else `Intl.RelativeTimeFormat('es')`; «Precios de hace N días» from 48 h; «Precios no disponibles» for null); `discountPct(price, previousPrice) -> number | null`; `isLowest(price, previousMinPrice) -> boolean`; `guidePath(slug) -> '/guias/{slug}'`.

- [ ] **Step 1: Write failing tests** (Review Focus 2 included): amount coupon with `minPurchase` above price → `null`; pct coupon → rounded to cents; coupon expired → `null`; result never below 0 (amount 20 on price 15 → `null`); `bestOffer` ignores stale and errored rows and prefers the coupon-adjusted price; `freshnessLabel` for 2 h, 3 days, null; `discountPct` `null` when previous ≤ price; `isLowest` false when `previousMinPrice` is null.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(web): guide pricing helpers`

### Task 10: Guide components

**Files:**
- Create: `web/src/components/guides/QuickPicks.tsx`, `GuideItemCard.tsx`, `StoreRow.tsx`, `GuideToc.tsx`, `ComparisonTable.tsx`, `GuideFaq.tsx`, `AffiliateNotice.tsx`, each with a `.test.tsx`
- Modify: `web/src/lib/seo.ts` (`guideMetadata(guide: Guide, indexable: boolean)`, `guidesMetadata(count: number)`, `guideJsonLd(guide, url) -> object[]` returning `Article`, `ItemList`, `FAQPage`), `web/src/lib/seo.test.ts`

**Interfaces:**
- Consumes: Task 7 types, Task 8 `Markdown`, Task 9 helpers, `BuyButton`, `storeInfo`, `countLabel`, `formatPrice` (check `lib/format.ts` or wherever `DealCard` formats prices and reuse it).
- Produces: `QuickPicks({ items, now })` (first three items, award + name + `bestOffer` price or «Sin precio ahora mismo»); `GuideItemCard({ item, index, now })` (section with `id="producto-{position}"`, image, award, title «{index}. {name}», «Mejor precio hoy» block, `-N %` badge, «Mínimo de los últimos 90 días» tag, specs chips, `StoreRow` list, `Markdown` summary, «Lo mejor»/«Lo peor» with `ThumbsUp`/`ThumbsDown`); `StoreRow({ offer, now })` (store short name + note, price with previous struck, coupon chip with code and value text («−10 €», «−5 %», «−15 € en 100 €»), «Te queda en {final}», `BuyButton`; a non-recent offer renders only the store and «Ver en {store}»); `GuideToc({ items })` (anchors to `#eleccion-rapida`, each product, `#comparativa`, `#como-elegir`, `#faq`); `ComparisonTable({ items })` (union of spec labels × items, `overflow-x-auto`); `GuideFaq({ faq })` (`<details>` per question); `AffiliateNotice()` (the mockup sentence).

- [ ] **Step 1: Write failing tests** per component: `StoreRow` shows «Te queda en 89,90 €» with an amount coupon, only «Ver en PcComponentes» when stale, `-N %` absent without previous price; `QuickPicks` renders three names and the best price with «en Amazon con cupón»; `ComparisonTable` has one row per distinct spec label; `GuideFaq` has one `<details>` per entry; `guideMetadata` `robots` noindex when `indexable === false`; `guideJsonLd` has `FAQPage` with `mainEntity` length = faq length.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** with tokens (`warm` quick picks, `success`/`success-soft` lowest tag, `danger` badge, `accent` coupon chip), Lucide only, ≥ 44 px targets. **Step 4: Run** `npm test` + `src/icons.test.ts` → PASS.
- [ ] **Step 5: Commit** `feat(web): guide components and metadata`

### Task 11: `/guias` index page and nav

**Files:**
- Create: `web/src/app/guias/page.tsx`, `web/src/app/guias/page.test.tsx`, `web/src/components/GuideCard.tsx`
- Modify: `web/src/lib/nav.ts` (`{ label: 'Guías', href: '/guias' }` after «Tiendas»), `web/src/components/Header.test.tsx`

**Interfaces:**
- Consumes: `fetchGuides`, `guidesMetadata`, `Header`/`Footer`/`SearchBox` shell as in `app/tiendas/page.tsx`, `fetchStores` for the footer.

- [ ] **Step 1: Write failing tests**: renders one `GuideCard` per guide with «{items} productos · actualizada el {fecha}»; empty state «Todavía no hay guías publicadas» when the fetch returns `[]` or fails; `generateMetadata` `noindex` with zero guides; Header test lists «Guías».
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** (`revalidate = 60`, `optional()` loading, breadcrumbs JSON-LD). **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(web): guides index page`

### Task 12: `/guias/{slug}` page and product-page link

**Files:**
- Create: `web/src/app/guias/[slug]/page.tsx`, `web/src/app/guias/[slug]/page.test.tsx`, `web/src/components/GuideView.tsx`, `web/src/components/GuideView.test.tsx`
- Modify: `web/src/app/oferta/[store]/[slug]/page.tsx`, `web/src/components/ProductView.tsx`, `web/src/components/ProductView.test.tsx`

**Interfaces:**
- Consumes: `fetchGuide`, `fetchGuidesByProduct`, Task 10 components, `guideMetadata`, `guideJsonLd`, `breadcrumbJsonLd`, `freshnessLabel`, `Markdown`.
- Produces: `GuideView({ guide, now, stores })` server component assembling the mockup order: breadcrumbs → eyebrow «Guía de compra · {category}» → h1 → subtitle → byline («Por {author} · equipo PatoBarato», «Actualizado el {fecha}», «{n} min de lectura», `freshnessLabel`) → two-column layout (`GuideToc` sticky on `lg`, main column 720 px) → `QuickPicks` (`#eleccion-rapida`) → `AffiliateNotice` → `Markdown intro` → `GuideItemCard` × items → `ComparisonTable` (`#comparativa`) → `Markdown howToChoose` (`#como-elegir`) → `GuideFaq` (`#faq`) → `AffiliateNotice`; `ProductView` gains `guides?: { slug: string; title: string }[]` rendering «Esta oferta aparece en la guía: {title}» links under the buy button.

- [ ] **Step 1: Write failing tests** (Review Focus 3 and 5): unknown slug → `notFound` digest; guide whose offers are all stale → page renders, contains «Precios no disponibles», metadata `robots` noindex; indexable guide → no `robots`, JSON-LD includes `Article` and `FAQPage`; `ProductView` renders two guide links when given two.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** (`revalidate = 60`; `indexable = guide.pricesCheckedAt` within 48 h; `cache()`-shared loader between `generateMetadata` and the page as `tiendas/[store]` does). **Step 4: Run** `npm test && npm run typecheck && npm run lint` → PASS.
- [ ] **Step 5: Commit** `feat(web): guide page and product-to-guide links`

### Task 13: Sitemap, README and verification

**Files:**
- Modify: `web/src/lib/sitemap.ts`, `web/src/lib/sitemap.test.ts`, `web/src/app/sitemap.ts`, `web/README.md`

**Interfaces:**
- Produces: `buildSitemap(deals, tags, siteUrl, { coupons, stores, guides?: GuideSummary[] })` adding `/guias` when `guides.length > 0` and `/guias/{slug}` with `lastModified = updatedAt` for each guide (published guides are listed even without prices — the page is `noindex` on its own); `app/sitemap.ts` loads `fetchGuides(client).catch(() => [])`.

- [ ] **Step 1: Write failing tests**: no guides → no `/guias`; two guides → three entries with `lastModified`; `guides` omitted → unchanged output.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement**; README: routes `/guias`, `/guias/{slug}`, views `web_guides*`, how a guide is published (SQL until the admin portal). **Step 4: Run** `npm test && npm run typecheck && npm run lint && rm -rf .next && npm run build` → PASS; bot `python -m pytest -q` → PASS; `node scripts/check-views.mjs` → OK (from the user's machine).
- [ ] **Step 5: Real refresher pass**: with the user's `.env` (or `SUPABASE_TEST_URL`), publish the seed guide in a test project or temporarily, run the bot once with `last_run_at = null` on the `guide_prices` source, confirm `product_prices` rows for the stores that have readers, revert the status. Report what each reader returned.
- [ ] **Step 6: Commit** `feat(web): guides in sitemap and docs`
