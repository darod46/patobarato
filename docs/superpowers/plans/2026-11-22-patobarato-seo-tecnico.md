# PatoBarato Technical SEO Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Listing pages (categories, stores, coupons, guides, events, `/chollos`) are always indexable with editorial copy from a new `page_copy` table, titles carry the target query and live counts, a read failure never produces `noindex`, plus hreflang, a sitemap index, an about page, image attributes and a health endpoint.

**Architecture:** A `page_copy` table (kind/slug) with view `web_page_copy` feeds `lib/page-copy.ts` (fetch, marker rendering, default titles). A shared `PageIntro` component renders `h1`, next-event line, intro markdown and FAQ (with `FAQPage` JSON-LD) inside every listing page. `lib/seo.ts` gains one `listingMetadata()` that replaces the per-page metadata helpers and applies the new indexing rules; primary reads throw on failure instead of degrading to `noindex`. `/sitemap.xml` becomes a sitemap index served by route handlers.

**Tech Stack:** Next.js 16 App Router, React 19, Tailwind v4, Vitest + Testing Library, lucide-react, react-markdown; PostgreSQL 17 (Supabase) migration applied via Management API.

**Spec:** `docs/superpowers/specs/2026-11-22-patobarato-seo-tecnico-design.md`

## Global Constraints

- Web copy in Spanish; code, comments and commit messages in English. Lucide icons only.
- Honest copy: no figure that is not computed (`{deals}` marker sentences are dropped when the number is unavailable; never render a literal `{deals}`).
- Web reads Supabase only through `web_*` views with the anon key; `page_copy` gets RLS, `revoke all` from `anon, authenticated`, admin policies via `is_admin()` (exists since `20261112000000_admin.sql`).
- A failed primary read on a listing page throws (Next keeps the last ISR version); `optional()` only for secondary blocks. `noindex` only when the DB answered and the page is thin per spec §6.
- Existing URLs and canonicals unchanged; `/sitemap.xml` keeps its URL.
- No new Vercel env vars; `/api/salud` never exposes URLs, keys or full error messages.
- Tests: `cd web && npm test --silent && npm run typecheck && npm run lint` green after every task; `npm run build` green at the end.
- Touch targets ≥ 44 px; Tailwind tokens from `globals.css`.
- Commit as `git -c user.name=David -c user.email=davidr@gco.com commit -m "..."`.

## Review Focus

1. A category whose `web_hashtags` count query fails while `fetchDeals` succeeds must stay indexable (count falls back to loaded length) — Task 5 pins it.
2. `renderCopy` with `{deals}` undefined must drop the whole sentence, including when the sentence is the first of a paragraph or ends with `!`/`?` — Task 2 pins it.
3. A store in `lib/stores.ts` with no deals and no copy (e.g. `decathlon`) must render, be `noindex`, and not appear in the pages sitemap — Tasks 6 and 8 pin it.
4. `/sitemap.xml` must still be a valid XML document Google accepts (index with absolute `<loc>` URLs) and each child must escape `&` in URLs — Task 8 pins it.
5. `/api/salud` with `getSupabase()` throwing synchronously (missing env) must return 200 `{ ok: false, checks: { supabase: 'error', errorName: 'Error' } }`, not a 500 — Task 9 pins it.

---

### Task 1: Migration `page_copy`, seed copy and anon check

**Files:**
- Create: `supabase/migrations/20261123000000_page_copy.sql`
- Modify: `web/scripts/check-views.mjs`

**Interfaces:**
- Produces: table `page_copy(kind, slug, title, h1, intro_md, faq, status, updated_at, …)`, view `web_page_copy(kind, slug, title, h1, intro_md, faq, updated_at)` of published rows.

- [ ] **Step 1: Write the DDL** exactly as spec §5 (table, trigger `guides_touch_updated_at()`, RLS, revokes, four `is_admin()` policies, view + grants).
- [ ] **Step 2: Write the seed** (`status = 'published'`), one `insert` per kind with `$md$`/`$json$` dollar quoting, honest Spanish copy of 150–300 words and 3 FAQ (`[{"q","a_md"}]`) each, for: categories `hogar`, `belleza`, `tecnologia`, `juguetes`, `alimentacion`, `deporte`, `moda`, `bricolaje`; stores `amazon`, `aliexpress`; static `chollos`, `tiendas`, `cupones`, `guias`, `eventos`, `sobre-nosotros`. `title` without the ` · PatoBarato` suffix; `h1` phrased for the query (e.g. category `tecnologia`: title `Chollos de tecnología hoy: ofertas en Amazon y AliExpress`, h1 `Chollos de tecnología`). Use the markers in their own sentence: `Ahora mismo seguimos {deals} chollos activos en esta categoría.` / `Hoy hay {deals} chollos activos en {stores}.` Facts allowed: the bot reads deal channels and store APIs, each deal shows current price, previous price when known and «Mínimo histórico», coupons are verified before publishing, affiliate links are declared (`/afiliados`). `sobre-nosotros`: intro = «PatoBarato es un proyecto independiente hecho en España por un desarrollador aficionado a cazar chollos; no pertenece a ninguna tienda» (the owner can edit this row later), sections as markdown headings `## Cómo elegimos los chollos` (criteria from spec §7: price checked at the store, real previous price, recorded historical minimum, verified coupon, declared affiliate links) and `## Cómo ganamos dinero` (affiliate commissions from Amazon, AliExpress and Awin stores; stores never pay to appear; the price is the same for the reader). End the file with `notify pgrst, 'reload schema';`.
- [ ] **Step 3: Extend `check-views.mjs`**: `web_page_copy?select=kind,slug&limit=1` must be 200 array; `page_copy?select=*&limit=1` must not be 200.
- [ ] **Step 4: Sanity check**: `python3 -c` that the file's `$md$` and `$json$` counts are even and every `$json$…$json$` block parses as JSON with 3 items having `q` and `a_md`; `node --check web/scripts/check-views.mjs`.
- [ ] **Step 5: Commit** — `feat(db): page_copy table, view and seeded editorial copy`.

---

### Task 2: `lib/page-copy.ts`

**Files:**
- Create: `web/src/lib/page-copy.ts`, `web/src/lib/page-copy.test.ts`
- Modify: `web/src/lib/types.ts`

**Interfaces:**
- Produces (in `types.ts`): `export type PageCopyKind = 'category' | 'store' | 'static'`; `export type PageCopy = { kind: PageCopyKind; slug: string; title: string; h1: string; introMd: string; faq: { q: string; aMd: string }[]; updatedAt: string }`.
- Produces (in `page-copy.ts`):
  - `fetchPageCopy(client, kind, slug): Promise<PageCopy | null>` — `web_page_copy` `.eq('kind').eq('slug').limit(1)`; faq via `jsonList` from `lib/guides-data` (`a_md` → `aMd`).
  - `fetchPageCopies(client, kind): Promise<PageCopy[]>`.
  - `type CopyValues = { deals?: number | null; stores?: string[] }` (store ids).
  - `renderCopy(introMd: string, values: CopyValues): string` — replaces `{deals}` with the number (`toLocaleString('es-ES')`) and `{stores}` with `joinNames(storeNames(stores))`; any sentence (split on `.`, `!`, `?` followed by space/newline/end) containing a marker whose value is `null`/`undefined`/empty array is removed entirely; markdown structure (paragraphs, lists, headings) otherwise preserved.
  - `defaultTitle(kind, slug, values): string` and `defaultH1(kind, slug): string` per spec §5 (`storeInfo(slug).name` for stores; `Chollos de {tag}`; number segment only when `deals` is a number > 0).
  - `pageTitle(copy: PageCopy | null, kind, slug, values): string` = `(copy?.title ?? defaultTitle(...)) + ' · PatoBarato'`.

- [ ] **Step 1: Write the failing tests**

```ts
it('replaces markers', () => expect(renderCopy('Hoy hay {deals} chollos en {stores}.', { deals: 1234, stores: ['amazon','aliexpress'] })).toBe('Hoy hay 1234 chollos en Amazon y AliExpress.'))
it('drops the sentence when a marker has no value', () => expect(renderCopy('Primera. Hoy hay {deals} chollos. Última.', { deals: null })).toBe('Primera. Última.'))
it('drops a first sentence ending in ! and keeps the paragraph', ...)   // '¡Hay {deals} chollos! Sigue.\n\n- lista' → 'Sigue.\n\n- lista'
it('never leaves a literal marker', () => expect(renderCopy('{deals} {stores}', {})).not.toMatch(/\{deals\}|\{stores\}/))
it('default titles', () => { expect(defaultTitle('category','tecnologia',{deals:23})).toBe('Chollos de tecnologia: 23 ofertas hoy'); expect(defaultTitle('category','tecnologia',{})).toBe('Chollos de tecnologia'); expect(defaultTitle('store','amazon',{deals:0})).toBe('Chollos de Amazon hoy'); expect(defaultTitle('static','chollos',{deals:315, stores:['amazon','aliexpress']})).toBe('Chollos de hoy: 315 ofertas en Amazon y AliExpress'); expect(defaultTitle('static','sobre-nosotros',{})).toBe('Quiénes somos y cómo elegimos los chollos') })
it('fetchPageCopy maps a row and returns null when absent', ...)   // fake client as in guides-data.test.ts
```

- [ ] **Step 2: Run** `cd web && npx vitest run src/lib/page-copy` → FAIL (module missing).
- [ ] **Step 3: Implement.** (`es-ES` locale for 1234 → `1234`; thousands separator appears only ≥ 10 000 in es-ES — assert on `1234`.)
- [ ] **Step 4: Verify** full suite + typecheck + lint.
- [ ] **Step 5: Commit** — `feat(web): page copy loader, marker rendering and default titles`.

---

### Task 3: `listingMetadata`, hreflang and layout

**Files:**
- Modify: `web/src/lib/seo.ts`, `web/src/lib/seo.test.ts`, `web/src/app/layout.tsx`
- Test: `web/src/app/layout.test.tsx` (create if absent)

**Interfaces:**
- Consumes: Task 2 `PageCopy`, `pageTitle`, `renderCopy`, `CopyValues`.
- Produces in `seo.ts`:
  - `withHreflang(path: string): NonNullable<Metadata['alternates']>` → `{ canonical: path, languages: { 'es-ES': path, 'x-default': path } }`.
  - `type ListingMeta = { kind: PageCopyKind; slug: string; path: string; copy: PageCopy | null; values: CopyValues; indexable: boolean }`.
  - `listingMetadata(m: ListingMeta): Metadata` — title via `pageTitle`; description = `truncate(firstSentence(stripMarkdown(renderCopy(copy.introMd, values))), MAX_DESCRIPTION)` or, without copy, the existing per-kind description text; `alternates = withHreflang(path)`; OG/Twitter as today; `robots: NOINDEX` only when `indexable === false`.
  - `aboutJsonLd(url: string): Record<string, unknown>[]` → `AboutPage` + `Organization` (name PatoBarato, url SITE_URL, sameAs `https://t.me/patobarato`).
  - `productMetadata`, `guideMetadata`, `eventMetadata`, `searchMetadata`, `legalMetadata`, `homeMetadata` keep their behaviour but use `withHreflang(path)` for `alternates`.
  - Remove `dealsMetadata`, `hashtagMetadata`, `storeMetadata`, `storesMetadata`, `couponsMetadata`, `guidesMetadata`, `eventsMetadata` (their callers are rewired in Tasks 5–6; this task updates their tests to `listingMetadata`).
- `app/layout.tsx`: root `metadata.alternates = { canonical: '/', languages: { 'es-ES': '/', 'x-default': '/' } }`; `other: { 'geo.region': 'ES' }`.

- [ ] **Step 1: Failing tests**: `listingMetadata` title with copy / without copy (default + suffix); description from first rendered sentence; `robots` undefined when indexable, `{ index: false, follow: true }` when not; `alternates.languages['es-ES'] === path`; `withHreflang('/chollos/hogar')`; `aboutJsonLd` types; every remaining metadata helper has `alternates.languages`.
- [ ] **Step 2: Run** `npx vitest run src/lib/seo src/app/layout` → FAIL.
- [ ] **Step 3: Implement**; leave the pages compiling by keeping thin deprecated wrappers ONLY if the typecheck needs them until Tasks 5–6 (delete them in Task 6).
- [ ] **Step 4: Verify** full suite + typecheck + lint.
- [ ] **Step 5: Commit** — `feat(web): listing metadata with page copy, hreflang and about JSON-LD`.

---

### Task 4: `PageIntro` component

**Files:**
- Create: `web/src/components/PageIntro.tsx`, `web/src/components/PageIntro.test.tsx`

**Interfaces:**
- Consumes: `Markdown`, `GuideFaq`, `faqJsonLd`, `jsonLdScript`, `renderCopy`, `eventPath`, `eventRangeLabel`, `eventYear`.
- Produces: `PageIntro({ h1, copy, values, nextEvent, className }: { h1: string; copy: PageCopy | null; values: CopyValues; nextEvent?: SiteEvent | null; className?: string })` — renders `<h1>` (same classes as today's listing `h1`), when `nextEvent` a line `Próximo evento: <Link href={eventPath(slug)}>{name} {year}</Link> ({eventRangeLabel})` with Lucide `CalendarDays`, `min-h-11` link; when `copy`: `<Markdown source={renderCopy(copy.introMd, values)} />` and, if `copy.faq.length > 0`, `<GuideFaq faq={copy.faq} />` plus a `FAQPage` JSON-LD `<script>`; when no copy: only the `h1` (and event line).

- [ ] **Step 1: Failing tests**: h1 text; event line href `/eventos/black-friday` and text `Black Friday 2026 (27 – 29 de noviembre)`; markers rendered; FAQ rendered + JSON-LD `FAQPage` present; no copy → no intro, no JSON-LD; literal `{deals}` never in output.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Verify** suite/typecheck/lint. **Step 5: Commit** — `feat(web): PageIntro with editorial copy, FAQ and next-event link`.

---

### Task 5: `/chollos` and `/chollos/[tag]`

**Files:**
- Modify: `web/src/app/chollos/page.tsx`, `web/src/app/chollos/[tag]/page.tsx`, `web/src/components/DealsClient.tsx`, `web/src/components/HashtagClient.tsx`, their tests.

**Interfaces:**
- Consumes: Tasks 2–4; `fetchHashtagCount`, `fetchStores`, `fetchEvents`, `nextEvent`, `ANNOUNCE_WINDOW_DAYS`.
- `DealsClient` and `HashtagClient` get a new prop `intro: { copy: PageCopy | null; values: CopyValues; nextEvent: SiteEvent | null }` and render `<PageIntro h1=… …/>` in place of their current `<h1>` (h1 text = `copy?.h1 ?? defaultH1(...)`).
- `/chollos`: `values = { deals: sum of web_stores.deals (via fetchStores; null when that read fails), stores: ids with deals > 0 }`; copy `static/chollos` via `optional('chollos', …)`; `indexable: true` always; metadata via `listingMetadata`.
- `/chollos/[tag]`: `loadTag` → `fetchDeals` is the primary read (throws on failure, no `optional`); `fetchHashtagCount(...).catch(() => null)` stays (count fallback = loaded length); copy `category/<tag>` via `optional`; `indexable = copy !== null || count >= 3`; `page.deals.length === 0` → `notFound()`; `nextEvent` from `optional('chollos-tag', () => fetchEvents(...))`.

- [ ] **Step 1: Failing tests**: tag page with copy and 1 deal → no `noindex`; without copy and 2 deals → `noindex`; without copy and 3 → indexable; count query failing + 3 deals loaded → indexable (Review Focus 1); `fetchDeals` rejecting → page and metadata reject (not 404, not `noindex`); `/chollos` metadata title `Chollos de hoy: 315 ofertas en Amazon y AliExpress · PatoBarato` with fake stores, and without stores `Chollos de hoy · PatoBarato`; clients render `PageIntro`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Verify.** **Step 5: Commit** — `feat(web): /chollos and category pages use page copy and the new indexing rules`.

---

### Task 6: `/tiendas`, `/tiendas/[store]`, `/cupones`, `/guias`, `/eventos`

**Files:**
- Modify: `web/src/app/tiendas/page.tsx`, `web/src/app/tiendas/[store]/page.tsx`, `web/src/components/StoreClient.tsx`, `web/src/app/cupones/page.tsx`, `web/src/app/guias/page.tsx`, `web/src/app/eventos/page.tsx`, their tests; `web/src/lib/seo.ts` (delete the deprecated wrappers).

**Interfaces:**
- Consumes: Tasks 2–4.
- `/tiendas/[store]`: `storeFromSlug` null → 404; `fetchDeals` primary (throws); `deals` from `fetchStores` (optional) else loaded length; copy `store/<id>`; `indexable = copy !== null || deals >= 3`; `StoreClient` gets the `intro` prop like Task 5.
- `/tiendas`, `/cupones`, `/guias`, `/eventos`: `indexable: true`; copy `static/<slug>`; list fetch: `/tiendas` and `/eventos` primary (throw), `/cupones` and `/guias` primary too (replace the try/catch → [] in `/cupones`); `values.deals` where meaningful (`/tiendas`: total deals; `/cupones`: coupon count under a `{deals}`-free copy — pass `{}`); empty list → existing honest empty-state copy stays; `PageIntro` replaces each page's `<h1>` + intro paragraph.

- [ ] **Step 1: Failing tests**: store with copy and 0 deals → indexable and renders «ahora mismo no hay chollos activos»; `decathlon` without copy and 0 deals → renders, `noindex` (Review Focus 3); `/tiendas` with empty stores → no `noindex`, h1 from copy; `/cupones` with `fetchCoupons` rejecting → page rejects; `/guias` and `/eventos` metadata have no `robots` with empty lists; `seo.ts` no longer exports the removed helpers (typecheck).
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Verify.** **Step 5: Commit** — `feat(web): stores, coupons, guides and events pages always indexable with page copy`.

---

### Task 7: `/sobre-nosotros` and footer links

**Files:**
- Create: `web/src/app/sobre-nosotros/page.tsx`, `web/src/app/sobre-nosotros/page.test.tsx`
- Modify: `web/src/components/Footer.tsx`, `web/src/components/Footer.test.tsx`, `web/src/lib/sitemap.ts` (`STATIC_PATHS` gains `/sobre-nosotros`)

**Interfaces:**
- Consumes: `fetchPageCopy('static','sobre-nosotros')` (primary, throws), `listingMetadata({ kind:'static', slug:'sobre-nosotros', path:'/sobre-nosotros', indexable:true })`, `aboutJsonLd`, `breadcrumbJsonLd`, `Markdown`, `Header`, `Footer`.
- Page: `revalidate = 3600`; `PageIntro` with the copy (its markdown holds the `## Cómo elegimos los chollos` and `## Cómo ganamos dinero` sections; `Markdown` must render heading ids so `#como-elegimos` works — add `id` slugging to `components/Markdown.tsx` headings via `rehype-slug`-free custom `h2` renderer: id = slugified text).
- Footer: «Quiénes somos» → `/sobre-nosotros`; new «Cómo elegimos los chollos» → `/sobre-nosotros#como-elegimos-los-chollos`; «Cómo funciona» stays.

- [ ] **Step 1: Failing tests**: page renders h1 and both section headings with ids; JSON-LD contains `AboutPage` and `Organization`; metadata canonical `/sobre-nosotros`, no `robots`; footer hrefs.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Verify.** **Step 5: Commit** — `feat(web): about page with how deals are chosen; footer links`.

---

### Task 8: Sitemap index and three sitemaps

**Files:**
- Create: `web/src/app/sitemap.xml/route.ts`, `web/src/app/sitemaps/[name]/route.ts`
- Delete: `web/src/app/sitemap.ts`
- Modify: `web/src/lib/sitemap.ts`, `web/src/lib/sitemap.test.ts`, `web/src/app/robots.ts` (unchanged URL), tests for the routes.

**Interfaces:**
- `lib/sitemap.ts`:
  - `export const SITEMAP_NAMES = ['chollos', 'paginas', 'eventos'] as const; type SitemapName = typeof SITEMAP_NAMES[number]`.
  - `buildSitemapIndex(siteUrl: string, lastmods: Partial<Record<SitemapName, Date>>): string` → `<?xml …?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">` with `<sitemap><loc>${siteUrl}/sitemaps/${name}.xml</loc>[<lastmod>]</sitemap>` per name.
  - `buildSitemapXml(entries: MetadataRoute.Sitemap): string` — `<urlset>` with `loc`, optional `lastmod` (ISO), `changefreq`, `priority`; `&`, `<`, `>` escaped in `loc`.
  - `dealEntries(deals: DealRef[], siteUrl)`, `pageEntries({ siteUrl, tags, stores, guides, copies }: …)` (home, `/chollos`, `/buscar`, `/tiendas`, `/cupones`, `/guias`, `/eventos`, `/sobre-nosotros`, STATIC_PATHS, categories with `count >= 1`, stores indexable per Task 6 rule (copy row or `deals >= 3`), guides with `lastmod = updatedAt`; copies give `lastmod` for listing pages), `eventEntries(events, siteUrl, now)` (existing priorities). `buildSitemap` is removed; `buildRobots` unchanged except `disallow: ['/go/', '/api/']`.
- Routes: `GET /sitemap.xml` → index (`Content-Type: application/xml`, `Cache-Control: public, s-maxage=3600`); `GET /sitemaps/[name].xml` → 404 for unknown names, else the file; both `revalidate = 3600`, reads via `getSupabase()`; on failure during build (`NEXT_PHASE === 'phase-production-build'`) return the minimal file, at runtime throw (as today's `app/sitemap.ts`).

- [ ] **Step 1: Failing tests**: index XML lists the three absolute URLs; `buildSitemapXml` escapes `&` (Review Focus 4) and formats `lastmod`; `pageEntries` excludes `decathlon` without copy/deals and includes `/sobre-nosotros`; route handlers: unknown name → 404, index content type.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** (handle the `.xml` suffix in `[name]` by stripping it; Next dynamic segment receives `chollos.xml`). **Step 4: Verify** incl. `npm run build`. **Step 5: Commit** — `feat(web): sitemap index with deals, pages and events sitemaps`.

---

### Task 9: `/api/salud`

**Files:**
- Create: `web/src/app/api/salud/route.ts`, `web/src/app/api/salud/route.test.ts`

**Interfaces:**
- `GET` → `200 { ok: boolean, at: ISO, checks: { supabase: 'ok' | 'error', errorName?: string, deals: number | null, events: number | null } }`, `Cache-Control: no-store`, `runtime = 'nodejs'`, `dynamic = 'force-dynamic'`. `deals` = `fetchStores` summed, `events` = `fetchEvents().length`; any throw (sync or async) → `supabase: 'error'`, `errorName = error.name` only (never `message`, never env values).

- [ ] **Step 1: Failing tests**: happy path; `getSupabase` throwing synchronously → 200 with `ok:false`, `errorName:'Error'` and body contains no `supabase.co` (Review Focus 5); rejected fetch → `errorName:'TypeError'`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Verify.** **Step 5: Commit** — `feat(web): /api/salud server-side health check`.

---

### Task 10: Image attributes

**Files:**
- Modify: `web/src/components/DealCard.tsx`, `web/src/components/search/CatalogCard.tsx`, `web/src/components/Hero.tsx`, their tests.

- [ ] **Step 1: Failing tests**: `DealCard` img has `width="320" height="320"` and `loading="lazy"` (also the placeholder branch); `CatalogCard` same; `Hero` duck img has `fetchPriority="high"` and no `loading="lazy"`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** (React attribute `fetchPriority`). **Step 4: Verify.** **Step 5: Commit** — `fix(web): image dimensions, lazy loading and hero fetch priority`.

---

### Task 11: Apply migration, docs, end-to-end verification

- [ ] **Step 1:** Controller applies `20261123000000_page_copy.sql` in production via the Management API (registering the version) + `notify pgrst, 'reload schema'`; anon checks from the browser (`web_page_copy` 200, `page_copy` 401).
- [ ] **Step 2:** `web/README.md`: section «Textos editoriales (`page_copy`)» (kinds, markers, defaults, indexing rules table from spec §6, sitemaps, `/api/salud`); `check-views` note.
- [ ] **Step 3:** Mock-Supabase screenshots (as in the events phase) of `/chollos/tecnologia`, `/tiendas/amazon`, `/tiendas/decathlon`, `/cupones` (empty), `/sobre-nosotros`, `/sitemap.xml`, `/sitemaps/paginas.xml` at 390/1280 px; check `robots` meta per rule; no literal markers; commit docs — `docs(web): page copy, indexing rules, sitemaps and health endpoint`.
