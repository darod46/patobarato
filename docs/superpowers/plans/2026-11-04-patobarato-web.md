# PatoBarato Web Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the bot to `bot/`, make it store hashtags and product photos in Supabase, expose a read-only public view of published deals, and build the patobarato.com web (listing with photo, price, button, search and hashtag filters) for Vercel.

**Architecture:** Supabase stays the single source of truth. The bot (Python) writes `offers.hashtags` and uploads photos to a public Storage bucket. Two SQL views (`web_deals`, `web_hashtags`) are the only things the `anon` key can read. The web is a static Vite + React + TypeScript + Tailwind v4 single page that queries those views with `@supabase/supabase-js`.

**Tech Stack:** Python 3.12, Telethon, supabase-py, pytest (bot). Node ≥ 20, Vite, React 19, TypeScript, Tailwind CSS v4 (`@tailwindcss/vite`), `@supabase/supabase-js`, Vitest, Testing Library, ESLint (web). Versions: whatever `npm create vite@latest` / `npm install` resolve today; commit `package-lock.json`.

**Spec:** `docs/superpowers/specs/2026-11-04-patobarato-web-design.md` (bot background: `docs/superpowers/specs/2026-11-04-patobarato-bot-design.md`)

## Global Constraints

- User-facing text in Spanish. Code, identifiers and comments in English.
- No invented figures or claims on the web (no member counts, "0% estafas", "Keepa", "180 días", ping, etc.).
- The web only ever uses the Supabase **anon** key and only reads `web_deals` and `web_hashtags`. Never `service_role` in `web/`.
- Affiliate button: `href = affiliate_url` from the view, `target="_blank"`, `rel="sponsored noopener noreferrer"`, text `Ver en Amazon`.
- Amazon disclaimer in the footer, verbatim: `En calidad de Afiliado de Amazon, PatoBarato obtiene ingresos por las compras adscritas que cumplen los requisitos aplicables.`
- Telegram channel URL: `https://t.me/patobarato`.
- Price format `1.299,90 €` (es-ES, 2 decimals, NBSP or space before €); discount `-N%` with N = round-half-up of `(previous - price) / previous * 100`, same as `bot/src/patobarato/publishing/format.py::discount_percent`.
- Page size 24; chips = top 12 from `web_hashtags`; search debounce 300 ms; URL params `q` and `tag`.
- Storage bucket `product-images` (public), object path `{country}/{asin}.jpg`, `content-type: image/jpeg`, upsert.
- A photo upload failure never prevents or delays a Telegram publication beyond the upload attempt itself; it is logged.
- Design tokens from `prototipo/DESIGN.md`: Plus Jakarta Sans; carbon `#09090b`; amber `#F59E0B` (text `#D97706` on `rgba(245,158,11,.12)` for discount pills); green `#10B981`; zinc `#f4f4f5`/`#e4e4e7`/`#71717a`/`#a1a1aa`; card radius 12px, buttons 8px, pills full; card hover shadow `0 4px 20px -2px rgba(0,0,0,.05)`; max width 1280px.
- Network note (developer machine only): corporate TLS interception. If `npm install` fails with `SELF_SIGNED_CERT_IN_CHAIN`, run it with `NODE_OPTIONS=--use-system-ca`. Do not commit any workaround.
- The production bot keeps running from `ghcr.io/darod46/patobarato:latest`; nothing here changes the server's `docker-compose.yml`.

## Review Focus

1. **Search text with `%`, `_`, `,`, `(` or `)`** (e.g. `50% dto`, `usb-c (2m)`): the query must not break PostgREST filter syntax nor act as wildcards; the user sees matching results or the empty state, never an error. → test in Task 6.
2. **Deal with no photo, no previous price, no coupon and no hashtags** (all old deals): the card renders the duck placeholder and only price + title + button, with no empty pills or "-0%". → test in Task 7.
3. **Loading more while the search changes** (slow first page arrives after a new query): stale responses must not be appended to the new results. → test in Task 8.
4. **Hashtag in the URL that is not among the 12 chips** (shared link `?tag=lego`): the filter still applies and the tag appears as an active chip. → test in Task 8.
5. **Photo upload failure** (Storage down, bucket missing): the deal is still published and stored, the failure is logged, `image_url` untouched. → test in Task 4.

---

### Task 1: Move the bot to `bot/`

**Files:**
- Move (git mv): `src/`, `tests/`, `pyproject.toml`, `Dockerfile`, `docker-compose.yml`, `.env.example`, `.dockerignore`, `README.md` → `bot/…`
- Move (untracked, plain mv): `.env`, `data/` → `bot/.env`, `bot/data/`
- Modify: `.gitignore`, `.github/workflows/docker.yml`
- Create: `README.md` (root)

**Interfaces:**
- Produces: bot package at `bot/src/patobarato`, tests at `bot/tests`, run from `bot/` with `pytest`.

- [ ] **Step 1: Move files** with `git mv` (tracked) and `mv` (`.env`, `data/`). `supabase/`, `docs/`, `prototipo/`, `recursos/`, `.github/`, `.venv/` stay at the root.
- [ ] **Step 2: Update `.gitignore`** so it ignores `bot/.env`, `bot/data/`, `.venv/`, `__pycache__/`, `.pytest_cache/`, `supabase/.temp/`, `web/node_modules/`, `web/dist/`, `web/.env*` except `web/.env.example`, `.superpowers/`. Verify with `git status --short --ignored` that `bot/.env` and `bot/data/` are ignored.
- [ ] **Step 3: Reinstall the venv package**: `.venv/Scripts/python -m pip install -e "bot[dev]"`.
- [ ] **Step 4: Run tests**: `cd bot && ../.venv/Scripts/python -m pytest -q` → `173 passed, 4 skipped`.
- [ ] **Step 5: Update `.github/workflows/docker.yml`**: trigger `on.push.paths: ["bot/**", ".github/workflows/docker.yml"]` (keep `workflow_dispatch`); test job `defaults.run.working-directory: bot`; build `context: bot`. Image name unchanged.
- [ ] **Step 6: Root `README.md`** (Spanish, short): what `bot/`, `web/`, `supabase/`, `docs/` contain and links to `bot/README.md` and `web/README.md`. In `bot/README.md`, fix paths that moved (e.g. `supabase/migrations` is now `../supabase/migrations`).
- [ ] **Step 7: Commit** `refactor: move the bot into bot/`.

### Task 2: Database migration for the web

**Files:**
- Create: `supabase/migrations/20261105000000_web.sql`

**Interfaces:**
- Produces: `offers.hashtags text[]`; bucket `product-images`; views `public.web_deals(publication_id bigint, published_at timestamptz, price numeric, previous_price numeric, coupon text, hashtags text[], affiliate_url text, title text, image_url text, asin text, country char(2))` and `public.web_hashtags(tag text, count int)`.

- [ ] **Step 1: Write the migration** with exactly this content:

```sql
-- Hashtags of each offer, lowercase, without '#'.
alter table offers add column hashtags text[] not null default '{}';

-- Backfill from the original text (same rule as the parser: #word, lowercase).
update offers o
set hashtags = coalesce((
    select array_agg(distinct lower(m[1]))
    from regexp_matches(o.raw_text, '(?:^|[^[:alnum:]_])#([[:alnum:]_]+)', 'g') as m
), '{}');

-- Public bucket for product photos uploaded by the bot.
insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do update set public = true;

-- One row per product: its latest active publication.
-- Owned by postgres, so it reads the RLS-protected tables; anon gets only this view.
create view web_deals as
select distinct on (p.product_id)
    p.id              as publication_id,
    p.published_at,
    p.published_price as price,
    o.previous_price,
    o.coupon,
    o.hashtags,
    p.affiliate_url,
    pr.title,
    pr.image_url,
    pr.asin,
    p.country
from publications p
join offers o   on o.id = p.offer_id
join products pr on pr.id = p.product_id
where p.status = 'active'
order by p.product_id, p.published_at desc, p.id desc;

create view web_hashtags as
select tag, count(*)::int as count
from web_deals, unnest(hashtags) as tag
where published_at > now() - interval '30 days'
group by tag
order by count desc, tag;

revoke all on web_deals, web_hashtags from anon, authenticated;
grant select on web_deals, web_hashtags to anon, authenticated;
```

- [ ] **Step 2: Commit** `feat(db): hashtags, product-images bucket and public web views`.
- [ ] **Step 3 (controller, not the implementer): apply and verify** on project `hijafeeyheztkggsoezs` through the Management API (`POST /v1/projects/{ref}/database/query`, same as the initial migration), inside `begin … commit`, plus `insert into supabase_migrations.schema_migrations(version,name) values ('20261105000000','web')`. Then, with the **anon** key over REST: `GET /rest/v1/web_deals?select=*&limit=1` → 200; `GET /rest/v1/web_hashtags?select=*` → 200; `GET /rest/v1/offers?select=id&limit=1` → `[]` or 401/permission error (never rows); `GET /rest/v1/publications?select=id&limit=1` → no rows. Record results in the ledger.

### Task 3: Bot stores hashtags

**Files:**
- Modify: `bot/src/patobarato/publishing/format.py` (rename `_normalize_hashtag` → public `normalize_hashtag`), `bot/src/patobarato/storage/repository.py`, `bot/src/patobarato/storage/supabase_repo.py`
- Test: `bot/tests/test_repository.py`, `bot/tests/test_supabase_repo.py`, `bot/tests/test_format.py` (only if it references the old name)

**Interfaces:**
- Consumes: `ParsedOffer.hashtags: list[str]`.
- Produces: `normalize_hashtag(tag: str) -> str` in `patobarato.publishing.format`; `InMemoryRepository.offer_hashtags(offer_id: int) -> list[str]` (test helper). `insert_offer` signature unchanged.

- [ ] **Step 1: Failing tests**

```python
# bot/tests/test_repository.py
async def test_insert_offer_stores_normalized_unique_hashtags():
    repo = InMemoryRepository()
    source = repo.add_source("@canal")
    product_id = await repo.upsert_product(make_offer())
    offer = dataclasses.replace(make_offer(), hashtags=["Sony", "sony", "Auri-culares", "#"])
    offer_id = await repo.insert_offer(product_id, source.id, 1, offer, "raw", NOW)
    assert repo.offer_hashtags(offer_id) == ["sony", "auriculares"]
```

```python
# bot/tests/test_supabase_repo.py (integration, skipped without env)
async def test_insert_offer_stores_hashtags(repo, client, source, asin):
    product_id = await repo.upsert_product(make_offer(asin))
    offer = dataclasses.replace(make_offer(asin), hashtags=["Sony", "auriculares"])
    offer_id = await repo.insert_offer(product_id, source["id"], 7, offer, "raw", NOW)
    row = client.table("offers").select("hashtags").eq("id", offer_id).execute().data[0]
    assert row["hashtags"] == ["sony", "auriculares"]
```

- [ ] **Step 2: Run** `cd bot && ../.venv/Scripts/python -m pytest -q tests/test_repository.py` → FAIL (`offer_hashtags` missing).
- [ ] **Step 3: Implement**: both repositories store `hashtags = list(dict.fromkeys(t for t in map(normalize_hashtag, offer.hashtags) if t))`; Supabase row key `"hashtags"`.
- [ ] **Step 4: Run** the full bot suite → all pass.
- [ ] **Step 5: Commit** `feat(bot): store offer hashtags`.

### Task 4: Bot uploads product photos

**Files:**
- Create: `bot/src/patobarato/storage/images.py`
- Modify: `bot/src/patobarato/storage/repository.py`, `bot/src/patobarato/storage/supabase_repo.py`, `bot/src/patobarato/core/pipeline.py`, `bot/src/patobarato/main.py`
- Test: `bot/tests/test_images.py`, `bot/tests/test_pipeline.py`, `bot/tests/test_repository.py`

**Interfaces:**
- Consumes: `Pipeline._publish` (photo bytes from `PhotoProvider`).
- Produces:
  - `class ImageStore(Protocol): async def upload(self, country: str, asin: str, data: bytes) -> str` (returns public URL).
  - `class SupabaseImageStore(ImageStore)`: `__init__(self, client: supabase.Client, bucket: str = "product-images")`; uploads to `f"{country}/{asin}.jpg"` with `{"content-type": "image/jpeg", "upsert": "true"}` via `asyncio.to_thread`, returns `client.storage.from_(bucket).get_public_url(path)`.
  - `Repository.set_product_image(product_id: int, image_url: str) -> None` (+ InMemory: `product_images: dict[int, str]`; Supabase: update `products.image_url` and `updated_at = now`).
  - `Pipeline(..., image_store: ImageStore | None = None)` keyword argument.

- [ ] **Step 1: Failing tests** in `bot/tests/test_pipeline.py` (use the existing fakes):
  - `test_published_photo_is_uploaded_and_stored`: photo provider returns `b"jpg"`; after `process`, the fake store got `("ES", asin, b"jpg")` and `repo.product_images[product_id] == "https://img/ES/<asin>.jpg"`.
  - `test_photo_upload_failure_still_publishes`: fake store raises `RuntimeError`; offer status is `published`, one publication row, `product_images` empty, an ERROR log from `patobarato.pipeline` mentions the ASIN.
  - `test_no_upload_without_photo`: provider returns `None` → store never called.
  - `test_no_upload_when_publish_fails`: publisher raises → store never called.
  - In `bot/tests/test_images.py`: `SupabaseImageStore` with a fake client records `upload(path="ES/B000000001.jpg", file=b"x", file_options={"content-type": "image/jpeg", "upsert": "true"})` and returns the fake public URL.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.** In `_publish`, after the publication and status writes, if `photo` and `image_store`: `url = await image_store.upload(offer.country, offer.asin, photo)` then `await repo.set_product_image(product_id, url)`; any exception → `logger.error("Photo upload failed for %s", offer.asin, exc_info=True)`. Wire `SupabaseImageStore(client)` in `main.py` reusing the same Supabase client as the repository.
- [ ] **Step 4: Run** full bot suite → all pass. Integration test (skipped without env): upload `b"\xff\xd8test"` for a random ASIN, assert the returned URL ends with `/product-images/ES/<asin>.jpg`, then remove the object.
- [ ] **Step 5: Commit** `feat(bot): upload product photos to Supabase Storage`.

### Task 5: Web scaffold

**Files:**
- Create: `web/` from `npm create vite@latest web -- --template react-ts`; `web/vite.config.ts`, `web/src/index.css`, `web/.env.example`, `web/src/lib/supabase.ts`, `web/public/` assets, `web/vercel.json`
- Modify: `.github/workflows/docker.yml` → add a separate workflow `.github/workflows/web.yml`

**Interfaces:**
- Produces: `supabase` client export from `web/src/lib/supabase.ts` (reads `import.meta.env.VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`, throws a clear Spanish error if missing); Tailwind theme tokens (below); npm scripts `dev`, `build`, `test` (`vitest run`), `lint`, `typecheck` (`tsc -b --noEmit` or equivalent).

- [ ] **Step 1: Scaffold** and install: `react`, `react-dom`, `@supabase/supabase-js`, `@fontsource/plus-jakarta-sans`; dev: `tailwindcss`, `@tailwindcss/vite`, `vitest`, `jsdom`, `@testing-library/react`, `@testing-library/jest-dom`, `@testing-library/user-event`. Vitest config: `environment: "jsdom"`, setup file importing `@testing-library/jest-dom/vitest`.
- [ ] **Step 2: Tokens** in `web/src/index.css` with `@import "tailwindcss";` and `@theme` defining: `--font-sans: "Plus Jakarta Sans", system-ui, sans-serif`; colors `carbon #09090b`, `carbon-soft #27272a`, `amber #F59E0B`, `amber-ink #D97706`, `mint #10B981`, `zinc-50 #fafafa`, `zinc-100 #f4f4f5`, `zinc-200 #e4e4e7`, `zinc-400 #a1a1aa`, `zinc-500 #71717a`, `surface #fbf8ff`. Import font weights 400/500/600/700. `font-variant-numeric: tabular-nums` utility for prices.
- [ ] **Step 3: Assets**: copy `recursos/patobarato-logo-cabecera.svg` → `web/public/logo.svg`, `recursos/pato-2-heroe.svg` → `web/public/pato-heroe.svg`, `recursos/pato-3-etiqueta.svg` → `web/public/pato-placeholder.svg`, `recursos/favicon_v2.ico` → `web/public/favicon.ico`. `index.html`: `lang="es"`, title `PatoBarato · Chollos de Amazon`, meta description, favicon.
- [ ] **Step 4: `web/.env.example`** with `VITE_SUPABASE_URL=` and `VITE_SUPABASE_ANON_KEY=`; `web/vercel.json` `{ "framework": "vite" }` only if needed for SPA (single route → may be omitted; decide and note).
- [ ] **Step 5: CI** `.github/workflows/web.yml`: on push/PR touching `web/**` or the workflow; `working-directory: web`; Node 22; `npm ci`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` (with dummy `VITE_SUPABASE_*` env so build succeeds).
- [ ] **Step 6: Verify** `cd web && npm run lint && npm run typecheck && npm test && npm run build` all succeed (a trivial smoke test may exist).
- [ ] **Step 7: Commit** `feat(web): scaffold Vite + React + TS + Tailwind`.

### Task 6: Web data and formatting library

**Files:**
- Create: `web/src/lib/format.ts`, `web/src/lib/deals.ts`, `web/src/lib/types.ts`
- Test: `web/src/lib/format.test.ts`, `web/src/lib/deals.test.ts`

**Interfaces:**
- Produces:
  - `type Deal = { publicationId: number; publishedAt: string; price: number; previousPrice: number | null; coupon: string | null; hashtags: string[]; affiliateUrl: string; title: string; imageUrl: string | null; asin: string; country: string }`
  - `type HashtagCount = { tag: string; count: number }`
  - `formatPrice(value: number): string` → `"1.299,90 €"`
  - `discountPercent(price: number, previous: number): number | null` → null when `previous <= price`
  - `timeAgo(iso: string, now: Date): string` → `"hace 5 min"`, `"hace 3 h"`, `"hace 2 días"`, `"hace 1 día"`, `"ahora"` (< 1 min)
  - `escapeIlike(text: string): string`
  - `fetchDeals(client: SupabaseClient, params: { q?: string; tag?: string; page: number }): Promise<{ deals: Deal[]; hasMore: boolean }>` — queries `web_deals`, `order("published_at", desc)` then `order("publication_id", desc)`, `range(page*24, page*24+24)` (fetch 25 to know `hasMore`, return 24), `ilike("title", "%" + escapeIlike(q.trim()) + "%")` when q non-empty, `contains("hashtags", [tag])` when tag; maps snake_case → `Deal`, numeric strings → numbers; throws on error.
  - `fetchHashtags(client, limit = 12): Promise<HashtagCount[]>`
  - `fetchLatestDeal(client): Promise<Deal | null>`
  - `PAGE_SIZE = 24`

- [ ] **Step 1: Failing tests** (`format.test.ts`):
  - `formatPrice(1299.9) === "1.299,90 €"`, `formatPrice(9.99) === "9,99 €"`, `formatPrice(1000) === "1.000,00 €"` (normalize NBSP in assertion or define output with a regular space — pick one and test it).
  - `discountPercent(29.99, 49.99) === 40`; `discountPercent(50, 100) === 50`; `discountPercent(10, 10) === null`; half-up: `discountPercent(87.5, 100) === 13` and `discountPercent(66.5, 100) === 34`.
  - `timeAgo` cases above with a fixed `now`.
  - `escapeIlike("50% a_b\\c") === "50\\% a\\_b\\\\c"`.
- [ ] **Step 2: Failing tests** (`deals.test.ts`) with a fake chainable client recording calls:
  - default page 0 → `from("web_deals")`, select, both orders, `range(0, 24)`, no ilike/contains; 25 rows → `hasMore: true` and 24 deals; numeric strings converted.
  - `q: "  usb-c (2m) 50%  "` → `ilike("title", "%usb-c (2m) 50\\%%")`.
  - `tag: "lego"` → `contains("hashtags", ["lego"])`.
  - error result → promise rejects.
- [ ] **Step 3: Run** `npm test` → FAIL.
- [ ] **Step 4: Implement**; for half-up use integer cents: `Math.floor(((prevC - priceC) * 100) / prevC + 0.5)` with `prevC = Math.round(previous*100)`.
- [ ] **Step 5: Run** `npm test && npm run typecheck` → pass.
- [ ] **Step 6: Commit** `feat(web): deals data layer and formatting`.

### Task 7: Deal card and listing states

**Files:**
- Create: `web/src/components/DealCard.tsx`, `web/src/components/DealCardSkeleton.tsx`, `web/src/components/EmptyState.tsx`, `web/src/components/ErrorState.tsx`
- Test: `web/src/components/DealCard.test.tsx`, `web/src/components/states.test.tsx`

**Interfaces:**
- Consumes: `Deal`, `formatPrice`, `discountPercent`, `timeAgo`.
- Produces: `DealCard({ deal, now, onTagClick }: { deal: Deal; now: Date; onTagClick: (tag: string) => void })`; `DealCardSkeleton()`; `EmptyState({ onClear }: { onClear: () => void })`; `ErrorState({ onRetry }: { onRetry: () => void })`.

- [ ] **Step 1: Failing tests:**
  - full deal → shows title, `29,99 €`, previous `49,99 €` inside `<s>`, `-40%`, coupon text, `#sony` button, `hace 5 min`; link "Ver en Amazon" has `href` = affiliateUrl, `target="_blank"`, `rel` containing `sponsored`, `noopener`, `noreferrer`; img `src` = imageUrl and non-empty `alt` = title.
  - minimal deal (no image, previous, coupon, hashtags) → img src `/pato-placeholder.svg`; no `%` text; no coupon element; no hashtag buttons.
  - clicking `#sony` calls `onTagClick("sony")`.
  - EmptyState text `No hay chollos que coincidan` and button `Quitar filtros` calls onClear; ErrorState button `Reintentar` calls onRetry.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** following `prototipo/code.html` card look (white, 1px zinc-200 border, 12px radius, image on `#fafafa` square with `object-contain`, title `line-clamp-2`, amber pill, carbon full-width button with external-link icon). Image `loading="lazy"`; on image error fall back to the placeholder.
- [ ] **Step 4: Run** `npm test && npm run lint && npm run typecheck` → pass.
- [ ] **Step 5: Commit** `feat(web): deal card and listing states`.

### Task 8: Feed with search, hashtag chips, URL state and load more

**Files:**
- Create: `web/src/hooks/useUrlFilters.ts`, `web/src/hooks/useDeals.ts`, `web/src/components/SearchBox.tsx`, `web/src/components/HashtagChips.tsx`, `web/src/components/DealFeed.tsx`
- Test: `web/src/hooks/useUrlFilters.test.tsx`, `web/src/hooks/useDeals.test.tsx`, `web/src/components/DealFeed.test.tsx`

**Interfaces:**
- Consumes: `fetchDeals`, `fetchHashtags`, Task 7 components.
- Produces:
  - `useUrlFilters(): { q: string; tag: string | null; setQ(q: string): void; setTag(tag: string | null): void; clear(): void }` — reads/writes `?q=&tag=` with `history.pushState` for tag/clear and `replaceState` for typing; listens to `popstate`.
  - `useDeals(fetcher: typeof fetchDeals bound to client, filters: { q: string; tag: string | null }): { deals: Deal[]; status: "loading" | "ready" | "error"; hasMore: boolean; loadingMore: boolean; loadMore(): void; retry(): void }` — resets to page 0 when filters change; ignores responses from superseded requests (request id counter).
  - `SearchBox({ value, onChange }: { value: string; onChange: (q: string) => void })` — local input state, calls `onChange` 300 ms after typing stops; placeholder `Buscar chollos…`; `aria-label="Buscar chollos"`.
  - `HashtagChips({ tags, active, onSelect }: { tags: string[]; active: string | null; onSelect: (tag: string | null) => void })` — first chip `Todos`; when `active` is not in `tags`, it is prepended as an extra active chip.
  - `DealFeed({ q, tag, onTag, onClear, fetchDeals, fetchHashtags, now })`.

- [ ] **Step 1: Failing tests:**
  - `useUrlFilters`: initial `?q=lego&tag=juguetes` parsed; `setTag("sony")` updates `location.search` to include `tag=sony`; `clear()` removes both.
  - `useDeals`: first page loads; `loadMore` appends page 1; **stale response**: start query A with a deferred promise, change filters to B, resolve B then A → only B's deals shown.
  - `SearchBox` (fake timers): typing `sony` calls `onChange` once with `sony` after 300 ms.
  - `HashtagChips`: `active="lego"` not in tags → a pressed chip `#lego` rendered; clicking `Todos` → `onSelect(null)`.
  - `DealFeed`: shows skeletons while loading; renders cards; `Cargar más` hidden when `hasMore` false; empty → EmptyState; fetch error → ErrorState and `Reintentar` refetches.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** Chips use `aria-pressed`. Grid: `grid-cols-[repeat(auto-fill,minmax(280px,1fr))]`, gap 1rem (1.5rem ≥ lg).
- [ ] **Step 4: Run** `npm test && npm run lint && npm run typecheck` → pass.
- [ ] **Step 5: Commit** `feat(web): searchable, filterable deal feed`.

### Task 9: Page sections and app assembly

**Files:**
- Create: `web/src/components/Header.tsx`, `web/src/components/Hero.tsx`, `web/src/components/TelegramBlock.tsx`, `web/src/components/TelegramPreview.tsx`, `web/src/components/Footer.tsx`
- Modify: `web/src/App.tsx`, `web/src/main.tsx`
- Test: `web/src/components/TelegramPreview.test.tsx`, `web/src/App.test.tsx`

**Interfaces:**
- Consumes: everything above; `supabase` client.
- Produces: `TelegramPreview({ deal }: { deal: Deal })` reproducing the bot caption lines: `🦆 {title}` (bold), `✅ Precio: {price}` (bold price), `❌ Antes: {previous} (-N%)` only with previous price, `🎟️ Cupón: {coupon}` only with coupon, blank line + `#tag …` only with hashtags, and a button `🛒 Ver en Amazon` linking to affiliateUrl (same rel/target rules).

- [ ] **Step 1: Failing tests:**
  - `TelegramPreview` full deal shows the five line types in order and the button; minimal deal shows only title, price and button.
  - `App` with injected fake fetchers: header has logo `alt="PatoBarato"`, search box, link `Telegram` to `https://t.me/patobarato`; hero heading contains `chollos`; footer contains the Amazon disclaimer verbatim; page text contains none of `36.2K`, `Keepa`, `0% Estafas`, `180 Días`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** following `prototipo/code.html` / `screen.png`:
  - Header: fixed, `bg-white/80 backdrop-blur`, logo left, search center (hidden < md; a second full-width row below on mobile), Telegram button right.
  - Hero: rounded card, amber eyebrow `Vigilante de precios • Ofertas que vuelan`, H1 `¡Cazo los mejores chollos antes de que vuelen!` (amber wavy underline on "chollos"), honest paragraph (bot watches Telegram deal channels and republishes Amazon España deals with the price, previous price and coupon), buttons `Ver chollos` (anchor `#chollos`) and `Unirse en Telegram`, mascot `pato-heroe.svg` in amber circle. No stats row, no badges.
  - Feed section `id="chollos"`, title `Chollos`.
  - TelegramBlock: dark section, title `Recibe los chollos al momento en Telegram`, short text, amber button `Unirme al canal`; right side `TelegramPreview` of `fetchLatestDeal()` (omitted when null or on error).
  - Footer: logo, channel link, disclaimer verbatim, `Los precios y la disponibilidad pueden cambiar.`, `© {current year} PatoBarato`.
  - `App` accepts optional injected fetchers (default: real ones bound to `supabase`) for tests.
- [ ] **Step 4: Run** `npm test && npm run lint && npm run typecheck && npm run build` → pass. Run `npm run dev` with real `VITE_SUPABASE_*` in `web/.env.local` and check the page renders (if the corporate network blocks Supabase from the browser, note it in the report rather than working around it).
- [ ] **Step 5: Commit** `feat(web): landing page sections`.

### Task 10: Deployment docs and wrap-up

**Files:**
- Create: `web/README.md`
- Modify: root `README.md`

- [ ] **Step 1: `web/README.md`** (Spanish): local dev (`npm install`, `.env.local` from `.env.example`, `npm run dev`), tests, and **Vercel**: import repo `darod46/patobarato`, Root Directory `web`, framework Vite, env vars `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (anon/public key from Supabase → Settings → API; never service_role), custom domain `patobarato.com` (add in Vercel → Domains, then set the DNS records Vercel shows).
- [ ] **Step 2: Root README** links updated.
- [ ] **Step 3: Verify** full bot suite (`cd bot && ../.venv/Scripts/python -m pytest -q`) and web (`cd web && npm run lint && npm run typecheck && npm test && npm run build`) green.
- [ ] **Step 4: Commit** `docs: web deployment on Vercel`.
- [ ] **Step 5 (controller + user):** push; check both workflows; user creates the Vercel project and pulls the new bot image on the server **after** Task 2 is applied.
