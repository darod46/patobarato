# PatoBarato Web v2 (Next.js) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move `web/` from Vite to Next.js (App Router) with server-rendered home, product pages and hashtag pages, a frameless hero, fully clickable cards, and complete technical SEO.

**Architecture:** Next.js App Router in `web/` deployed on Vercel. Server Components read the public Supabase views (`web_deals`, `web_hashtags`) with the anon key and render the first page of every listing plus each product page (ISR). Interactive parts (search, chips, load more, Amazon button behaviour) stay Client Components reusing v1 hooks and components. SEO via the Metadata API, JSON-LD, `sitemap.ts`, `robots.ts` and an Open Graph image.

**Tech Stack:** Next.js (latest stable, App Router), React 19, TypeScript, Tailwind CSS v4 (`@tailwindcss/postcss`), `@supabase/supabase-js`, Vitest + Testing Library (jsdom), oxlint. Versions as resolved by `create-next-app@latest` / `npm install`; commit `package-lock.json`.

**Spec:** `docs/superpowers/specs/2026-11-05-patobarato-web-nextjs-design.md` (v1 background: `docs/superpowers/specs/2026-11-04-patobarato-web-design.md`)

## Global Constraints

- User-facing text in Spanish; code/comments in English.
- No false claims: hero mentions only Amazon; no invented figures.
- Only the anon key; only `web_deals` and `web_hashtags` are read. Never `service_role`.
- Env: code reads `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`; `next.config` fills them from `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` when absent.
- Site URL `https://www.patobarato.com` (`metadataBase`, canonicals, sitemap).
- Routes: `/`, `/oferta/{store}/{slug}-{id}` (id = ASIN lowercase for Amazon), `/chollos/{tag}`, `/go/{ASIN}` (unchanged `public/go.html`, rewrite in `next.config`), `/sitemap.xml`, `/robots.txt`.
- Slug: lowercase, accents stripped, non-alphanumerics → `-`, collapsed, trimmed, at most 8 words; empty slug → `oferta`.
- Wrong slug for an existing product → 308 to the canonical URL. Unknown product → 404 page with links to current deals (HTTP 404).
- Revalidate: listings 60 s, product pages 600 s.
- Hashtags: normalized `[a-z0-9_áéíóúñü]`, URL-encoded; `/chollos/{tag}` with 0 deals → 404; < 3 deals → `noindex`; sitemap includes tags with ≥ 3 deals.
- `noindex`: `/go/`, any URL with `q`, 404 pages. `robots.txt` disallows `/go/`.
- Store table: `amazon` → name `Amazon España`, button `Ver en Amazon`.
- Affiliate button (product page only): href `affiliateUrl`, `rel="sponsored noopener noreferrer"`, keeps v1 `amazonLink` behaviour (Android intent, iOS same tab, desktop new tab). Amazon disclaimer next to it and in the footer (verbatim v1 text).
- Cards: whole card is one link to the product page; no button, no hashtags inside; bottom line `{previous price struck} · {Store} · hace X`.
- Images: plain `<img>` with `width`/`height` (no `next/image`), lazy except product main image and hero mascot.
- Design tokens and AA contrast as in v1 (`web/src/index.css`).
- Avoid hydration mismatches: relative times ("hace X") must render identically on server and client (pass the server `now` to the client or render relative time only after mount).
- Local network: use `NODE_OPTIONS=--use-system-ca` for npm if TLS fails; never commit workarounds.

## Review Focus

1. **Titles with accents, emojis, symbols or only digits** produce valid, stable slugs; the product still resolves by id and a changed title 308-redirects instead of 404. → tests in Task 3.
2. **ASIN case in URLs** (`b0bpzvjjqj` vs `B0BPZVJJQJ`) resolves the same product; canonical is lowercase. → tests in Task 3 / Task 5.
3. **Hashtags with ñ/á** (`/chollos/ni%C3%B1os`) round-trip; unknown tag → 404. → tests in Task 6.
4. **Hydration** of the home/hashtag listings and product page: no React hydration warnings (relative time, platform-dependent button attributes). → checked in Task 5 and Task 8 (Playwright console).
5. **Missing data** (no image, no previous price, no hashtags, no coupon) renders a valid product page and valid JSON-LD (no `null` fields). → tests in Task 5.

---

### Task 1: Extend `web_deals` with store and product id

**Files:** Create `supabase/migrations/20261105100000_web_deals_store.sql`

- [ ] **Step 1:** Write the migration (columns appended at the end so `create or replace view` is valid; `web_hashtags` keeps working):

```sql
create or replace view web_deals as
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
    p.country,
    pr.store,
    pr.id             as product_id
from publications p
join offers o   on o.id = p.offer_id
join products pr on pr.id = p.product_id
where p.status = 'active'
order by p.product_id, p.published_at desc, p.id desc;

revoke all on web_deals from anon, authenticated;
grant select on web_deals to anon, authenticated;
```

- [ ] **Step 2:** Commit `feat(db): expose store and product_id in web_deals`.
- [ ] **Step 3 (controller):** apply to production via Management API, record in `supabase_migrations.schema_migrations`, verify anon `GET /rest/v1/web_deals?select=store,product_id&limit=1` → 200 and v1 site still loads.

### Task 2: Next.js scaffold and port of the v1 home

**Files:** Replace Vite setup in `web/` (remove `vite.config.ts`, `index.html`, `src/main.tsx`, `vite-env.d.ts`, Vite deps); create `web/next.config.ts`, `web/postcss.config.mjs`, `web/vitest.config.ts`, `web/src/app/layout.tsx`, `web/src/app/page.tsx`, `web/src/app/globals.css` (from `src/index.css`); move/keep `src/components`, `src/hooks`, `src/lib`; update `.github/workflows/web.yml`, `web/.env.example`, `web/README.md` dev commands.

**Interfaces:**
- Produces: `getSupabase()` reading `process.env.NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` (same error message as v1); `next.config` env fallback from `VITE_*`; rewrite `/go/:asin([A-Za-z0-9]{10})` → `/go.html`; root layout with `lang="es"`, Plus Jakarta Sans (fontsource), `metadataBase`.
- Scripts unchanged in name: `dev` (next dev), `build` (next build), `test` (vitest run), `lint` (oxlint), `typecheck` (tsc --noEmit).

- [ ] **Step 1:** Scaffold (in a temp dir with `create-next-app@latest --ts --app --src-dir --no-tailwind --eslint false --use-npm` or by hand) and merge into `web/`; add Tailwind v4 via `@tailwindcss/postcss`.
- [ ] **Step 2:** Port `App.tsx` into `src/app/page.tsx` as-is behaviour: page is a Server Component wrapper rendering a Client Component `HomeClient` with the v1 UI (Header+SearchBox, Hero, DealFeed, TelegramBlock, Footer). Keep v1 tests green, adapting imports and `App.test.tsx` to `HomeClient`.
- [ ] **Step 3:** CI: env names `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY` dummies; steps lint, typecheck, test, build.
- [ ] **Step 4:** Verify `npm run lint && npm run typecheck && npm test && npm run build` green; `npm run dev` with `web/.env.local` renders the home (controller checks with Playwright).
- [ ] **Step 5:** Commit `refactor(web): migrate from Vite to Next.js App Router`.

### Task 3: Data and URL helpers

**Files:** Modify `web/src/lib/types.ts`, `web/src/lib/deals.ts`; create `web/src/lib/urls.ts`, `web/src/lib/stores.ts`; tests `web/src/lib/urls.test.ts`, `web/src/lib/deals.test.ts` (extend).

**Interfaces (produces):**
- `Deal` gains `store: string` and `productId: number` (mapped from `store`, `product_id`).
- `slugify(title: string): string`; `productPath(deal: Pick<Deal,'store'|'asin'|'title'>): string` → `/oferta/{store}/{slug}-{asin lowercase}`; `parseProductSlug(param: string): { slug: string; id: string } | null` (id = last `-` segment, 10 alnum chars, else null); `tagPath(tag: string): string` → `/chollos/{encodeURIComponent(tag)}`; `SITE_URL = 'https://www.patobarato.com'`.
- `STORES: Record<string, { name: string; cta: string }>` with `amazon`; `storeInfo(store: string)` falls back to `{ name: store, cta: 'Ver oferta' }`.
- `fetchDealByProduct(client, store, id): Promise<Deal | null>` (ASIN compared uppercase); `fetchRelatedDeals(client, deal, limit = 10): Promise<Deal[]>` (same first hashtag, excluding itself; fallback latest); `fetchAllDealRefs(client): Promise<Pick<Deal,'store'|'asin'|'title'|'publishedAt'>[]>` paginating by 1000; `fetchHashtagCounts(client): Promise<HashtagCount[]>` (all, for sitemap/noindex).

- [ ] **Step 1: Failing tests:** `slugify('Cecotec Accesorios Freidora de aire ✨') === 'cecotec-accesorios-freidora-de-aire'`; `slugify('Niños: ¡Pañales Dodot T2, 88 uds!') === 'ninos-panales-dodot-t2-88-uds'`; 8-word cap; `slugify('✨✨') === 'oferta'`; `productPath({store:'amazon',asin:'B0BPZVJJQJ',title:'Cecotec Accesorios Freidora de aire'}) === '/oferta/amazon/cecotec-accesorios-freidora-de-aire-b0bpzvjjqj'`; `parseProductSlug('cecotec-x-b0bpzvjjqj')` → `{slug:'cecotec-x', id:'b0bpzvjjqj'}`; `parseProductSlug('b0bpzvjjqj')` → `{slug:'', id:'b0bpzvjjqj'}`; `parseProductSlug('foo')` → null; `tagPath('niños') === '/chollos/ni%C3%B1os'`; `fetchDealByProduct` queries `web_deals` with `eq('store','amazon')`, `eq('asin','B0BPZVJJQJ')` for id `b0bpzvjjqj`; `fetchAllDealRefs` requests ranges 0–999, 1000–1999 until a short page.
- [ ] **Step 2:** RED, implement, GREEN; full web checks. **Step 3:** Commit `feat(web): product URLs, store table and data helpers`.

### Task 4: Frameless hero and clickable cards

**Files:** Modify `web/src/components/Hero.tsx`, `DealCard.tsx`, `DealFeed.tsx` (remove `onTagClick` wiring from cards), tests.

- [ ] **Step 1: Failing tests:** DealCard renders a single `<a>` whose href is `productPath(deal)` and whose accessible name contains the title; no "Ver en Amazon" text; no hashtag buttons; shows `Amazon España`/`Amazon` store label and `hace X`. Hero: no figures (`36.2K` etc.), H1 contains `Amazon`, no element with the old frame classes (`shadow-xl`, `rounded-3xl`), mascot image precedes the H1 in DOM order.
- [ ] **Step 2:** Implement per spec §4.2–4.3 and approved mockups (`.superpowers/brainstorm/11190-1793879845/content/hero-opciones.html` option A with image on the left; `producto-opciones.html` card). Hover: shadow + title underline; focus-visible outline.
- [ ] **Step 3:** GREEN + checks. **Step 4:** Commit `feat(web): frameless hero and fully clickable deal cards`.

### Task 5: Product page

**Files:** Create `web/src/app/oferta/[store]/[slug]/page.tsx`, `web/src/app/oferta/[store]/[slug]/not-found.tsx` (or shared `src/app/not-found.tsx`), `web/src/components/ProductView.tsx`, `web/src/components/AmazonButton.tsx` (client; v1 amazonLink behaviour), `web/src/lib/seo.ts` (`productMetadata(deal)`, `productJsonLd(deal, url)`, `breadcrumbJsonLd(items)`); tests for `seo.ts` and `ProductView`.

- [ ] **Step 1: Failing tests:** `productJsonLd` for a full deal has `@type Product`, `name`, `image`, `sku`, `offers.price` (string or number), `priceCurrency 'EUR'`, `availability 'https://schema.org/InStock'`, `url`, `seller.name 'Amazon España'`; for a deal without image omits `image` (no null anywhere — assert via JSON.stringify not containing `null`). `productMetadata` title `{title} por 13,90 € (-39%) · PatoBarato` (no "(-N%)" without previous price), description ≤ 160 chars, canonical = `productPath`, openGraph image = imageUrl. `ProductView`: H1 = title, price, `<s>` previous, `Ahorras 9,00 €`, coupon when present, button `🛒 Ver en Amazon` with rel tokens, hashtag links to `tagPath`, disclaimer text, related deals section heading `Más chollos de #tag`.
- [ ] **Step 2:** Implement page: `generateMetadata`, `revalidate = 600`, parse param, fetch deal; not found → `notFound()`; slug ≠ `slugify(title)` or uppercase id → `permanentRedirect(productPath(deal))`; render ProductView + JSON-LD `<script type="application/ld+json">` (Product + BreadcrumbList); related deals grid using DealCard. Layout: desktop two columns; mobile one column with a fixed bottom bar containing the AmazonButton.
- [ ] **Step 3:** GREEN + checks; controller verifies with Playwright (desktop/mobile, no hydration warnings, 308 for wrong slug, 404 for unknown id). **Step 4:** Commit `feat(web): product pages with SEO metadata and JSON-LD`.

### Task 6: Hashtag pages and home SSR first page

**Files:** Create `web/src/app/chollos/[tag]/page.tsx`; modify `src/app/page.tsx`, `DealFeed.tsx`, `useDeals.ts` (accept `initialDeals`/`initialHasMore`), `HashtagChips.tsx` (link mode: chips are `<a href>` to `tagPath`/`/`); tests.

- [ ] **Step 1: Failing tests:** `useDeals` with initial data renders it without fetching page 0 and fetches page 1 on loadMore; when filters change it fetches fresh. HashtagChips link mode renders `<a href="/chollos/hogar">#hogar</a>` and `Todos` → `/`. Page helpers: `hashtagMetadata('hogar', count)` → title `Chollos de hogar · PatoBarato`, `robots.index false` when count < 3, canonical `/chollos/hogar`.
- [ ] **Step 2:** Home: server fetches first page (+ chips) and passes as initial data; `/?tag=x` gets canonical `/chollos/x`; `/?q=` gets `noindex`. Hashtag page: decode param, 404 if no deals, fixed tag, search + load more work within the tag, `revalidate = 60`.
- [ ] **Step 3:** GREEN + checks. **Step 4:** Commit `feat(web): server-rendered listings and hashtag pages`.

### Task 7: Sitemap, robots, site JSON-LD and Open Graph image

**Files:** Create `web/src/app/sitemap.ts`, `web/src/app/robots.ts`, `web/src/app/opengraph-image.tsx` (or static `public/og.png` from `recursos/`), modify `src/app/page.tsx` (WebSite + Organization JSON-LD), `layout.tsx` default metadata; tests for sitemap/robots builders (pure functions fed with fake data).

- [ ] **Step 1: Failing tests:** sitemap contains `https://www.patobarato.com/`, each deal `productPath` absolute with `lastModified = publishedAt`, only tags with count ≥ 3; robots disallows `/go/` and lists the sitemap URL; home JSON-LD has `WebSite` with `potentialAction.target` containing `?q={search_term_string}` and `Organization` logo URL.
- [ ] **Step 2:** Implement; OG image 1200×630 with logo + duck. **Step 3:** GREEN + checks. **Step 4:** Commit `feat(web): sitemap, robots, site JSON-LD and Open Graph image`.

### Task 8: Verification and docs

- [ ] **Step 1:** `web/README.md`: Next.js commands, env vars (NEXT_PUBLIC_*, VITE_* fallback), routes, SEO notes, Search Console tip (submit `/sitemap.xml`).
- [ ] **Step 2 (controller):** Playwright against `next start` with real anon key: home, a product page, a hashtag page at 390/1440 px; no console errors/hydration warnings; JSON-LD parses; `curl` checks of `/sitemap.xml`, `/robots.txt`, 308/404 behaviour, `/go/{ASIN}` still redirects.
- [ ] **Step 3:** Commit `docs(web): Next.js setup, routes and SEO`.
