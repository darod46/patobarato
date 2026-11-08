# PatoBarato Event Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Indexable, evergreen event pages (`/eventos`, `/eventos/{slug}`) driven by an `events` table, with deals, coupons and AliExpress featured-promo products as dynamic blocks, and a bot runner that syncs the promo products.

**Architecture:** Supabase holds `events` (editorial + dates) and `event_promos` (AliExpress products per event); the web reads only `web_events`/`web_event_promos` and renders ISR pages with three date-driven phases. The bot gains `featured_promos`/`featured_promo_products` on `AliExpressClient`, an `EventPromosSource` runner that replaces an event's rows only on full success, and a `promos` CLI command. The static calendar `web/src/content/events.ts` is deleted; the home reads events from Supabase.

**Tech Stack:** Next.js 16 App Router, React 19, Tailwind v4, Vitest + Testing Library, lucide-react, react-markdown; Python 3.12, httpx, pytest; PostgreSQL 17 (Supabase) migrations applied through the Management API.

**Spec:** `docs/superpowers/specs/2026-11-07-patobarato-eventos-design.md`

## Global Constraints

- Web copy in Spanish; code, comments and commit messages in English. Lucide icons only (no emojis, no hand-written SVG).
- Honest copy: no discount claims the data does not back; empty blocks are omitted, never rendered as "0 resultados".
- Web reads Supabase only through `web_*` views with the anon key; `events` and `event_promos` tables get RLS + `revoke all` from `anon, authenticated`.
- Never log secrets, affiliate URLs, signed request URLs or AliExpress response bodies (log `type(e).__name__` and the message only, no traceback).
- Dates are calendar days in `Europe/Madrid` (as in `web/src/lib/events.ts`); `starts_on`/`ends_on` are inclusive `date`s.
- Tests: `cd web && npm test --silent && npm run typecheck && npm run lint`; `cd bot && .venv-linux/bin/python -m pytest -q`. Every task leaves both green.
- No new Vercel env vars. The runner is added to `build_runners` only when AliExpress credentials exist.
- Touch targets ≥ 44 px; Tailwind tokens from `globals.css` (`text-ink`, `text-muted`, `bg-ink`, `text-accent`, `font-display`).

## Review Focus

1. Phase boundaries at midnight Madrid: at 23:30 UTC on 26 Nov (already 27 Nov in Madrid) Black Friday must be `during`, not `before` — Task 6 pins it.
2. A promo sync whose page 2 fails must leave the previous rows untouched (the page keeps showing last week's products rather than nothing) — Task 4 pins it.
3. A draft event's slug must 404 and never reach the sitemap, even if someone links it — Tasks 1 (view filter) and 10 pin it.
4. `fetchDeals` with an event whose `hashtags` is empty must filter by date range only and never produce an invalid PostgREST `or()` filter — Task 7 pins it.
5. Approximate dates (Prime Day) must show "previsto para julio" with no countdown and no JSON-LD `Event` — Tasks 6, 8 and 10 pin it.

---

### Task 1: Migration, views, seed and anon check

**Files:**
- Create: `supabase/migrations/20261110010000_events.sql`
- Modify: `web/scripts/check-views.mjs`

**Interfaces:**
- Produces: tables `events`, `event_promos`; column `coupons.event_id`; views `web_events`, `web_event_promos`, `web_coupons` (+`event_id`); `sources` row `type='event_promos'`.

- [ ] **Step 1: Write the migration**

Copy the DDL from spec §4 verbatim (tables, trigger using `guides_touch_updated_at()`, `coupons.event_id`, `sources_type_check` with `'event_promos'`, the `sources` insert with `every_minutes = 1440`). Then:

```sql
alter table events enable row level security;
alter table event_promos enable row level security;
revoke all on events, event_promos from anon, authenticated;

create view web_events as
select id, slug, name, stores, starts_on, ends_on, approximate, hashtags, aliexpress_promo,
       intro_md, tips_md, faq, status, updated_at
from events where status = 'published' order by starts_on, id;

create view web_event_promos as
select p.event_id, e.slug, p.external_id, p.title, p.price, p.original_price, p.currency,
       p.image_url, p.affiliate_url, p.position, p.synced_at
from event_promos p join events e on e.id = p.event_id
where e.status = 'published' order by p.event_id, p.position;

create or replace view web_coupons as
select id, store, code, title, conditions, url, starts_at, expires_at,
       discount_amount, discount_pct, min_purchase, event_id
from coupons
where active and starts_at <= now() and (expires_at is null or expires_at > now())
order by store, expires_at nulls last, id;

revoke all on web_events, web_event_promos from anon, authenticated;
grant select on web_events, web_event_promos to anon, authenticated;
```

Seed (same file) the five events with these exact values. `faq` uses the guides shape `[{"q": "...", "a_md": "..."}]` so `GuideFaq` is reused:

| slug | name | stores | starts_on | ends_on | approximate | hashtags | status |
|---|---|---|---|---|---|---|---|
| `aliexpress-1111` | `11.11 de AliExpress` | `{aliexpress}` | 2026-11-11 | 2026-11-11 | false | `{1111,aliexpress}` | published |
| `black-friday` | `Black Friday` | `{amazon,pccomponentes,mediamarkt}` | 2026-11-27 | 2026-11-29 | false | `{blackfriday}` | published |
| `cyber-monday` | `Cyber Monday` | `{amazon,pccomponentes}` | 2026-11-30 | 2026-11-30 | false | `{cybermonday}` | draft |
| `rebajas-enero` | `Rebajas de enero` | `{}` | 2027-01-07 | 2027-01-31 | false | `{rebajas}` | draft |
| `prime-day` | `Prime Day` | `{amazon}` | 2027-07-01 | 2027-07-02 | true | `{primeday}` | draft |

Published events get real Spanish copy (3–5 short paragraphs `intro_md`, 4–6 bullet `tips_md`, 3 FAQ entries) that only states facts: what the event is, when it runs, which stores PatoBarato tracks, that deals appear in Telegram and on this page as the bot finds them, how to compare with the price history shown on each deal. No percentages, no "miles de ofertas". Drafts get `[INTRO]`, `[CONSEJOS]`, and one FAQ `{"q": "[PREGUNTA]", "a_md": "[RESPUESTA]"}`. `aliexpress_promo` is `null` for all (David fills it with the CLI). End with `notify pgrst, 'reload schema';`.

- [ ] **Step 2: Extend `check-views.mjs`**

Add: `web_events` and `web_event_promos` must answer 200 with an array; `events` and `event_promos` tables must not be 200; `web_coupons` row (when any) must contain `event_id`. Follow the existing `problems.push` pattern.

- [ ] **Step 3: Verify the SQL parses**

Run: `cd /home/claude/patobarato && psql --version >/dev/null 2>&1 && echo has-psql || python3 - <<'EOF'
import re,sys;s=open('supabase/migrations/20261110010000_events.sql').read();assert s.count('$$')%2==0 and 'notify pgrst' in s;print('ok')
EOF`
Expected: `ok` (syntax is applied for real in Task 11).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20261110010000_events.sql web/scripts/check-views.mjs
git commit -m "feat(db): events and event_promos tables, views and seed"
```

---

### Task 2: AliExpress client: featured promos

**Files:**
- Modify: `bot/src/patobarato/stores/aliexpress_client.py`
- Create: `bot/tests/fixtures/aliexpress_featuredpromo_get.json`, `bot/tests/fixtures/aliexpress_featuredpromo_products.json`
- Test: `bot/tests/test_aliexpress_client.py`

**Interfaces:**
- Produces, in `aliexpress_client.py`:
  - `@dataclass class AliPromo: name: str; start: date | None; end: date | None`
  - `@dataclass class AliPromoPage: products: list[AliProduct]; has_more: bool`
  - `AliExpressClient.featured_promos(self) -> list[AliPromo]` → method `aliexpress.affiliate.featuredpromo.get`, payload key `aliexpress_affiliate_featuredpromo_get_response`, items at `result.promos.promo[]` with fields `promo_name`, `promo_desc`, `product_num`; dates parsed from the optional `start_time`/`end_time` strings (`YYYY-MM-DD` prefix; anything else → `None`).
  - `AliExpressClient.featured_promo_products(self, promo_name: str, page_no: int = 1, page_size: int = 50) -> AliPromoPage` → method `aliexpress.affiliate.featuredpromo.products.get` with `promo_name`, `page_no`, `page_size`, `target_currency`, `target_language`, `tracking_id`; payload key `aliexpress_affiliate_featuredpromo_products_get_response`; `has_more = page_no * page_size < int(result.total_record_count)`.
  - Products are parsed with the existing `_products`; a raw item without `product_id`, with a non-positive or unparsable `target_sale_price`, or without `promotion_link` is skipped (new `_strict_products(result) -> tuple[list[AliProduct], int]` returning the skipped count, used only by `featured_promo_products`; the count is logged at INFO as `"featuredpromo %s: skipped %d products without price or link"`).

- [ ] **Step 1: Write fixtures and failing tests**

Fixture `aliexpress_featuredpromo_get.json`: two promos (`"11.11 Big Sale"` with `start_time: "2026-11-11 00:00:00"`, `end_time: "2026-11-13 23:59:59"`; `"Choice Day"` with no dates). Fixture `aliexpress_featuredpromo_products.json`: `total_record_count: 120`, three products: one complete, one with `target_sale_price: "0"`, one without `promotion_link`.

```python
async def test_featured_promos_parses_names_and_dates():
    client = make_client(lambda r: httpx.Response(200, json=fixture("aliexpress_featuredpromo_get.json")))
    promos = await client.featured_promos()
    assert [p.name for p in promos] == ["11.11 Big Sale", "Choice Day"]
    assert promos[0].start == date(2026, 11, 11) and promos[0].end == date(2026, 11, 13)
    assert promos[1].start is None and promos[1].end is None

async def test_featured_promo_products_sends_params_and_skips_invalid():
    seen = {}
    def handler(r):
        seen.update(form(r)); return httpx.Response(200, json=fixture("aliexpress_featuredpromo_products.json"))
    page = await make_client(handler).featured_promo_products("11.11 Big Sale", page_no=2, page_size=50)
    assert seen["method"] == "aliexpress.affiliate.featuredpromo.products.get"
    assert seen["promo_name"] == "11.11 Big Sale" and seen["page_no"] == "2" and seen["page_size"] == "50"
    assert seen["tracking_id"] == "track" and seen["target_currency"] == "EUR"
    assert [p.product_id for p in page.products] == ["1001"]
    assert page.has_more is True   # 2 * 50 < 120

async def test_featured_promo_products_last_page():
    body = fixture("aliexpress_featuredpromo_products.json")
    body["aliexpress_affiliate_featuredpromo_products_get_response"]["resp_result"]["result"]["total_record_count"] = 60
    page = await make_client(lambda r: httpx.Response(200, json=body)).featured_promo_products("x", page_no=2)
    assert page.has_more is False
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd bot && .venv-linux/bin/python -m pytest tests/test_aliexpress_client.py -q -k featured`
Expected: FAIL with `AttributeError: ... has no attribute 'featured_promos'`

- [ ] **Step 3: Implement the dataclasses, `_strict_products`, `featured_promos` and `featured_promo_products`**

- [ ] **Step 4: Run the bot suite**

Run: `cd bot && .venv-linux/bin/python -m pytest -q`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add bot/src/patobarato/stores/aliexpress_client.py bot/tests
git commit -m "feat(bot): AliExpress featured promo campaigns and products"
```

---

### Task 3: Repository: events with promos and promo replacement

**Files:**
- Modify: `bot/src/patobarato/models.py`, `bot/src/patobarato/storage/repository.py`, `bot/src/patobarato/storage/supabase_repo.py`
- Test: `bot/tests/test_repository.py`, `bot/tests/test_supabase_repo.py`

**Interfaces:**
- Produces, in `models.py`:
  - `@dataclass(frozen=True) class EventRef: id: int; slug: str; aliexpress_promo: str`
  - `@dataclass(frozen=True) class EventPromoRow: external_id: str; title: str; price: Decimal; original_price: Decimal | None; image_url: str | None; affiliate_url: str; position: int; currency: str = "EUR"`
- Produces, on `Repository` (Protocol), `InMemoryRepository` and `SupabaseRepository`:
  - `async def list_events_with_promo(self) -> list[EventRef]` — events (any status) with `aliexpress_promo` not null/empty, ordered by id.
  - `async def replace_event_promos(self, event_id: int, rows: list[EventPromoRow]) -> None` — deletes the event's rows then inserts `rows` with `synced_at = now`. Supabase: `delete().eq("event_id", id)` then `insert(payload)` in one `asyncio.to_thread`; money via `_money`.
- `InMemoryRepository` test helpers: `add_event(slug: str, aliexpress_promo: str | None = None, status: str = "published") -> int`, property `event_promos: dict[int, list[EventPromoRow]]`.

- [ ] **Step 1: Write failing tests**

```python
# test_repository.py
async def test_list_events_with_promo_skips_events_without_campaign():
    repo = InMemoryRepository()
    bf = repo.add_event("black-friday")
    ali = repo.add_event("aliexpress-1111", aliexpress_promo="11.11 Big Sale", status="draft")
    assert [e.slug for e in await repo.list_events_with_promo()] == ["aliexpress-1111"]
    assert (await repo.list_events_with_promo())[0] == EventRef(ali, "aliexpress-1111", "11.11 Big Sale")

async def test_replace_event_promos_drops_previous_rows():
    repo = InMemoryRepository(); ev = repo.add_event("x", aliexpress_promo="p")
    await repo.replace_event_promos(ev, [row("1"), row("2")])
    await repo.replace_event_promos(ev, [row("3")])
    assert [r.external_id for r in repo.event_promos[ev]] == ["3"]
```

```python
# test_supabase_repo.py (fake client pattern already used there)
async def test_replace_event_promos_deletes_then_inserts():
    ... assert calls == [("event_promos", "delete", {"event_id": 7}), ("event_promos", "insert", ...)]
    assert payload[0]["price"] == "19.99" and payload[0]["original_price"] is None and payload[0]["position"] == 1
async def test_list_events_with_promo_filters_null():
    ... assert the select on "events" uses .not_.is_("aliexpress_promo", "null") (or .neq) and returns EventRef rows
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd bot && .venv-linux/bin/python -m pytest tests/test_repository.py tests/test_supabase_repo.py -q -k "event"`
Expected: FAIL (`ImportError: EventRef`).

- [ ] **Step 3: Implement models, Protocol methods and both repositories**

- [ ] **Step 4: Run the bot suite**

Run: `cd bot && .venv-linux/bin/python -m pytest -q` — Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add bot/src/patobarato/models.py bot/src/patobarato/storage bot/tests
git commit -m "feat(bot): repository support for event promos"
```

---

### Task 4: `EventPromosSource` runner

**Files:**
- Create: `bot/src/patobarato/sources/event_promos.py`
- Modify: `bot/src/patobarato/main.py:105-130` (`build_runners`)
- Test: `bot/tests/test_event_promos.py`, `bot/tests/test_main.py`

**Interfaces:**
- Consumes: Task 2 `AliExpressClient.featured_promo_products`, `AliPromoPage`; Task 3 `EventRef`, `EventPromoRow`, repository methods.
- Produces: `class EventPromosSource` with `type = "event_promos"`, `__init__(self, client: _PromoClient, repo: Repository, clock: Callable[[], datetime] = utcnow, sleep: Callable[[float], Awaitable[None]] = asyncio.sleep, pause_seconds: float = 1.5, max_pages: int = 3, page_size: int = 50)` and `async def run(self, source: ApiSource) -> None`. `_PromoClient` is a Protocol with only `featured_promo_products`.

Behaviour (spec §5): for each `EventRef`, fetch pages 1..`max_pages` while `has_more`, sleeping `pause_seconds` between calls; map `AliProduct` → `EventPromoRow` (`position` = 1-based index across pages; `original_price` only when `> price`; `affiliate_url = promotion_link`). On success with ≥ 1 product: `replace_event_promos`. If any call raises, or page 1 returns 0 products: keep existing rows and `logger.error("event_promos: %s kept previous rows — %s: %s", slug, type(e).__name__, e)` (for 0 products: `"event_promos: %s returned no products; kept previous rows"`). One failed event does not stop the others; if *every* event failed, raise `RuntimeError("event_promos: all N events failed")` so the scheduler records `last_error`. No events → log INFO and return.

- [ ] **Step 1: Write failing tests**

```python
class FakePromoClient:  # pages: dict[int, AliPromoPage | Exception]
async def test_replaces_rows_after_full_pagination(): ...   # 3 pages, has_more True,True,False → 150 rows, position 1..150, replace called once
async def test_keeps_rows_when_second_page_fails(): ...     # page 2 raises AliExpressError → replace_event_promos not called, no raise (one event of two)
async def test_keeps_rows_on_empty_first_page(): ...
async def test_stops_at_max_pages(): ...                    # has_more always True → exactly 3 calls
async def test_one_failed_event_does_not_block_next(): ...  # event A fails, event B replaced
async def test_all_events_failed_raises(): ...
async def test_original_price_only_when_higher(): ...
async def test_no_runner_without_aliexpress_credentials():   # test_main.py: build_runners types exclude "event_promos" without creds, include with
```

- [ ] **Step 2: Run tests to verify they fail** — `cd bot && .venv-linux/bin/python -m pytest tests/test_event_promos.py tests/test_main.py -q` → FAIL (`ModuleNotFoundError`).

- [ ] **Step 3: Implement `event_promos.py`; in `build_runners`, append `EventPromosSource(ali_store.client, repo, clock)` inside the existing `isinstance(ali_store, AliExpressStore)` branch.**

- [ ] **Step 4: Run the bot suite** — `cd bot && .venv-linux/bin/python -m pytest -q` → all pass.

- [ ] **Step 5: Commit**

```bash
git add bot/src/patobarato/sources/event_promos.py bot/src/patobarato/main.py bot/tests
git commit -m "feat(bot): event_promos runner syncing AliExpress campaign products"
```

---

### Task 5: `promos` CLI command and docs

**Files:**
- Modify: `bot/src/patobarato/main.py` (`main`, new `async def promos(settings: Settings) -> int`), `bot/README.md`, `bot/.env.example` (comment only)
- Test: `bot/tests/test_main.py`

**Interfaces:**
- Consumes: Task 2 `featured_promos`.
- Produces: `python -m patobarato promos` → prints one line per campaign: `f"{p.name:<40} {start or '—':>10}  {end or '—':>10}"` after a header line `Campaña                                  Inicio      Fin`, returns 0. Without the three AliExpress settings: prints `Faltan las credenciales de AliExpress (ALIEXPRESS_APP_KEY, ALIEXPRESS_APP_SECRET, ALIEXPRESS_TRACKING_ID).` to stderr and returns 1. API error: prints `No se pudieron listar las campañas: <ErrorType>: <msg>` to stderr, returns 1.

- [ ] **Step 1: Write failing tests** (`test_main.py`, following the existing `backfill` tests' monkeypatch style): `test_promos_lists_campaigns` (captures stdout, asserts header and `11.11 Big Sale` row with dates), `test_promos_without_credentials_exits_1`, `test_promos_api_error_exits_1`, and that `main(["promos"])` dispatches to it.

- [ ] **Step 2: Run to verify failure** — `cd bot && .venv-linux/bin/python -m pytest tests/test_main.py -q -k promos` → FAIL.

- [ ] **Step 3: Implement `promos()` and add `"promos"` to the `choices`; document the command and the `events.aliexpress_promo` workflow (run `promos`, copy the name into the column, set `sources.last_run_at = null` for `event_promos`) in `bot/README.md`.**

- [ ] **Step 4: Run the bot suite** — all pass.

- [ ] **Step 5: Commit**

```bash
git add bot/src/patobarato/main.py bot/README.md bot/.env.example bot/tests/test_main.py
git commit -m "feat(bot): promos command listing AliExpress campaigns"
```

---

### Task 6: Web events model from Supabase (replaces the static calendar)

**Files:**
- Delete: `web/src/content/events.ts`
- Modify: `web/src/lib/events.ts`, `web/src/lib/types.ts`, `web/src/components/EventsBlock.tsx`, `web/src/components/AnnouncementBar.tsx`, `web/src/components/Hero.tsx`, `web/src/components/HomeClient.tsx`, `web/src/app/page.tsx`
- Create: `web/src/lib/events-data.ts`
- Test: `web/src/lib/events.test.ts`, `web/src/lib/events-data.test.ts`, `web/src/components/Hero.test.tsx`, `web/src/components/EventsBlock.test.tsx`, `web/src/components/AnnouncementBar.test.tsx`, `web/src/components/HomeClient.test.tsx`

**Interfaces:**
- Produces, in `types.ts`:
  ```ts
  export type SiteEvent = {
    id: number; slug: string; name: string; stores: string[]
    startsOn: string; endsOn: string   // YYYY-MM-DD, inclusive
    approximate: boolean; hashtags: string[]; aliexpressPromo: string | null
    introMd: string; tipsMd: string; faq: { q: string; aMd: string }[]; updatedAt: string
  }
  export type EventPhase = 'before' | 'during' | 'after'
  ```
- `lib/events.ts` (pure): keeps `daysUntil(event, now)` (to `startsOn`), `upcomingEvents(now, n, events)` (now **requires** `events`; "upcoming" = `endsOn ≥ today`), `nextEvent(now, events, withinDays?)`, `whenLabel`, `eventDateLabel`, `eventLongDateLabel`, `ANNOUNCE_WINDOW_DAYS = 45`; adds `eventPhase(event, now): EventPhase`, `eventPath(slug): string` (`/eventos/${slug}`), `eventYear(event): number` (from `startsOn`), `eventRangeLabel(event): string` — approximate → month name alone ("julio"); one day → "11 de noviembre"; same month → `"${d1} – ${d2} de ${m}"` ("27 – 29 de noviembre"); different months → `"${d1} de ${m1} – ${d2} de ${m2}"`.
- `lib/events-data.ts`: `fetchEvents(client): Promise<SiteEvent[]>` (all rows of `web_events` ordered by `starts_on`), `fetchEvent(client, slug): Promise<SiteEvent | null>`, `fetchEventPromos(client, slug): Promise<CatalogProduct[]>` (rows of `web_event_promos` by `slug` ordered by `position`, mapped with `origin: 'aliexpress'`, `store: 'aliexpress'`, `externalId`, `price`, `originalPrice`, `discountPct` via `discountPercent`, `currency`, `imageUrl`, `affiliateUrl` — export a `toCatalogProduct`-compatible mapper from `lib/catalog.ts` if `toProduct` is private: make `toProduct` exported as `catalogProductFromRow`). `faq` parsed like guides (`a_md` → `aMd`).
- `HomeClient` props: `event?: SiteEvent | null`, `upcoming?: SiteEvent[]` stay; when both are omitted it renders no bar and no `EventsBlock` (no static fallback). `EventsBlock` and `AnnouncementBar` link the event name to `eventPath(slug)` (`next/link`; the bar's whole text is the link, `min-h-11`).
- `app/page.tsx`: `const events = await optional('home-events', () => fetchEvents(getSupabase()))`; passes `event={events ? nextEvent(now, events, ANNOUNCE_WINDOW_DAYS) : null}`, `upcoming={events ? upcomingEvents(now, 4, events) : []}` and `activeEvent={events ? activeEvent(now, events) : null}`.
- `lib/events.ts` adds `activeEvent(now, events): SiteEvent | null` — the event in phase `during` with the greatest `startsOn`, else null.
- `Hero` gets a new prop `activeEvent?: SiteEvent | null` (default null). When set, the primary button renders `Chollos del ${activeEvent.name}` with the Lucide `Zap` icon (size 18) and `href={eventPath(activeEvent.slug)}` instead of «Ver chollos de hoy» → `/#chollos`; the Telegram button is unchanged. `HomeClient` passes it through.

- [ ] **Step 1: Write failing tests**

```ts
// events.test.ts — fixture ev({ startsOn: '2026-11-27', endsOn: '2026-11-29' })
it('is during from the first to the last day in Madrid', () => {
  expect(eventPhase(bf, new Date('2026-11-26T23:30:00Z'))).toBe('during')   // 00:30 on the 27th in Madrid
  expect(eventPhase(bf, new Date('2026-11-29T22:59:00Z'))).toBe('during')   // 23:59 on the 29th
  expect(eventPhase(bf, new Date('2026-11-29T23:00:00Z'))).toBe('after')
  expect(eventPhase(bf, new Date('2026-11-20T12:00:00Z'))).toBe('before')
})
it('keeps an event upcoming until its last day', ...)         // endsOn today → included
it('labels ranges', () => { expect(eventRangeLabel(bf)).toBe('27 – 29 de noviembre'); expect(eventRangeLabel(oneDay)).toBe('11 de noviembre'); expect(eventRangeLabel(prime)).toBe('julio') })
it('eventPath and eventYear', ...)
// events-data.test.ts — fake supabase client as in guides-data.test.ts
it('maps web_events rows and faq a_md', ...); it('returns null for unknown slug', ...); it('maps promos to CatalogProduct with origin aliexpress', ...)
it('activeEvent picks the latest-started event in progress', ...)   // two overlapping → greater startsOn; none during → null
// Hero test: with activeEvent → link text 'Chollos del Black Friday', href '/eventos/black-friday'; without → 'Ver chollos de hoy', href '/#chollos'
// EventsBlock/AnnouncementBar tests: link href === '/eventos/black-friday'
// HomeClient test: without event/upcoming → no AnnouncementBar text, no "Calendario de chollos"
```

- [ ] **Step 2: Run to verify failure** — `cd web && npx vitest run src/lib/events src/components/EventsBlock src/components/AnnouncementBar src/components/HomeClient` → FAIL.

- [ ] **Step 3: Implement; delete `content/events.ts`; fix every import (`grep -rn "content/events" src` must be empty).**

- [ ] **Step 4: Verify** — `cd web && npm test --silent && npm run typecheck && npm run lint` → all pass.

- [ ] **Step 5: Commit**

```bash
git add -A web/src
git commit -m "feat(web): events come from Supabase; home links each event to its page"
```

---

### Task 7: Deals by event and coupons by event

**Files:**
- Modify: `web/src/lib/deals.ts:54-75`, `web/src/lib/coupons.ts`, `web/src/lib/types.ts` (Coupon)
- Test: `web/src/lib/deals.test.ts`, `web/src/lib/coupons.test.ts`

**Interfaces:**
- `fetchDeals(client, params: { …; event?: { hashtags: string[]; from: string; to: string } })` — `from`/`to` are `YYYY-MM-DD`; the range is `published_at >= from 00:00:00 Europe/Madrid` and `<= to 23:59:59 Europe/Madrid`, converted to ISO UTC with a new pure helper `madridDayBounds(from, to): { start: string; end: string }` in `lib/events.ts` (export; fixed offsets are not acceptable — derive via `Intl.DateTimeFormat` like `localDate`). With hashtags: `query.or(\`hashtags.ov.{${tags}},and(published_at.gte.${start},published_at.lte.${end})\`)`; without: `query.gte('published_at', start).lte('published_at', end)`.
- `Coupon.eventId: number | null`; `fetchCoupons(client, limit?, store?, eventId?)` adds `.eq('event_id', eventId)` when given.

- [ ] **Step 1: Write failing tests**

```ts
it('filters by hashtags or date range', ...)      // asserts the exact or() string built on the fake query
it('filters by range only when hashtags are empty', ...) // asserts gte/lte called and or() never called
it('madridDayBounds handles CET and CEST', () => {
  expect(madridDayBounds('2026-11-27', '2026-11-29')).toEqual({ start: '2026-11-26T23:00:00.000Z', end: '2026-11-29T22:59:59.000Z' })
  expect(madridDayBounds('2027-07-01', '2027-07-01').start).toBe('2027-06-30T22:00:00.000Z')
})
it('fetchCoupons filters by event id and maps eventId', ...)
```

- [ ] **Step 2: Run to verify failure** — `cd web && npx vitest run src/lib/deals src/lib/coupons src/lib/events` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Verify** — full web suite + typecheck + lint pass.
- [ ] **Step 5: Commit** — `git commit -m "feat(web): deals and coupons filtered by event"`.

---

### Task 8: SEO helpers, sitemap and navigation

**Files:**
- Modify: `web/src/lib/seo.ts`, `web/src/lib/sitemap.ts`, `web/src/app/sitemap.ts`, `web/src/lib/nav.ts`
- Test: `web/src/lib/seo.test.ts`, `web/src/lib/sitemap.test.ts`, `web/src/lib/nav.test.ts` (or Header test)

**Interfaces:**
- `eventMetadata(event: SiteEvent): Metadata` — title `` `${event.name} ${eventYear(event)}: chollos, cupones y consejos | PatoBarato` ``, description `truncate(firstSentence(event.introMd), MAX_DESCRIPTION)`, `alternates.canonical = eventPath(slug)`, OpenGraph `type: 'website'` with `OG_IMAGE`, never `NOINDEX`.
- `eventsMetadata(): Metadata` — title `Eventos de compras: Black Friday, 11.11, Cyber Monday | PatoBarato`, canonical `/eventos`.
- `eventJsonLd(event: SiteEvent, url: string): Record<string, unknown> | null` — `null` when `approximate`; otherwise the `Event` object of spec §6.3 (`startDate`/`endDate` as `YYYY-MM-DD`, `eventStatus: 'https://schema.org/EventScheduled'`, `eventAttendanceMode: 'https://schema.org/OnlineEventAttendanceMode'`, `location: { '@type': 'VirtualLocation', url }`, `organizer: { '@type': 'Organization', name: 'PatoBarato', url: SITE_URL }`, `description` = metadata description). Add `FAQPage` reuse: export the existing FAQ builder as `faqJsonLd(faq)` and use it for both guides and events.
- `buildSitemap(..., extra: { …; events?: SiteEvent[]; now?: Date })` — adds `/eventos` (`changeFrequency: 'weekly'`, `priority: 0.7`) when `events.length > 0`, and per event `{ url, lastModified: new Date(updatedAt), changeFrequency: 'weekly', priority }` with `priority = 0.9` when `eventPhase === 'during'` or `0 ≤ daysUntil ≤ 60`, else `0.6`.
- `NAV_LINKS`: insert `{ label: 'Eventos', href: '/eventos' }` after Cupones.

- [ ] **Step 1: Write failing tests** — titles/canonicals above; `eventJsonLd(prime)` is `null`; `eventJsonLd(bf)` has `startDate '2026-11-27'` and `endDate '2026-11-29'`; sitemap priorities 0.9 / 0.6 with `now` fixed; `/eventos` absent with no events; nav contains Eventos in position 2.
- [ ] **Step 2: Run to verify failure.**
- [ ] **Step 3: Implement; `app/sitemap.ts` adds `fetchEvents(client).catch(() => [])` and passes `events` and `now: new Date()`.**
- [ ] **Step 4: Verify** — full web suite + typecheck + lint pass.
- [ ] **Step 5: Commit** — `git commit -m "feat(web): event metadata, JSON-LD, sitemap entries and nav link"`.

---

### Task 9: `/eventos` index page

**Files:**
- Create: `web/src/app/eventos/page.tsx`, `web/src/components/events/EventCard.tsx`
- Test: `web/src/app/eventos/page.test.tsx`, `web/src/components/events/EventCard.test.tsx`

**Interfaces:**
- Consumes: Task 6 `fetchEvents`, `eventPhase`, `eventRangeLabel`, `eventPath`; Task 8 `eventsMetadata`, `breadcrumbJsonLd`.
- `EventCard({ event, now }: { event: SiteEvent; now: Date })` — `<li>` with `Link` to `eventPath`, name (`font-display`), `eventRangeLabel` prefixed by `Previsto para ` when approximate, store names via `storeNames`, and the first line of `introMd` (text before the first `\n`, markdown stripped with the existing `stripMarkdown`). Phase badge text: `En marcha` / `Próximo` / `Pasado` (Lucide `CalendarDays` icon).
- Page: `revalidate = 3600`; `Header`/`Footer` like `/guias`; `h1` «Eventos de compras»; intro paragraph «Las fechas clave del año para comprar más barato: qué son, cuándo caen y los chollos y cupones que encontramos en cada una.»; three `<section>`s with `h2` «En marcha», «Próximos», «Pasados», each rendered only when non-empty; past events sorted by `startsOn` descending. When `fetchEvents` fails (undefined) show `EmptyState` with message «Ahora mismo no podemos cargar el calendario. Vuelve en un rato.». `breadcrumbJsonLd([Inicio, Eventos])`.

- [ ] **Step 1: Write failing tests** — grouping into the three sections with a fixed `now`; card href; «Previsto para julio» for approximate; empty state on failure.
- [ ] **Step 2: Run to verify failure.** — `cd web && npx vitest run src/app/eventos src/components/events`
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Verify** — full web suite + typecheck + lint pass.
- [ ] **Step 5: Commit** — `git commit -m "feat(web): /eventos index page"`.

---

### Task 10: `/eventos/[slug]` event page

**Files:**
- Create: `web/src/app/eventos/[slug]/page.tsx`, `web/src/components/events/EventView.tsx`, `web/src/components/events/EventStatusLine.tsx`
- Test: `web/src/app/eventos/[slug]/page.test.tsx`, `web/src/components/events/EventView.test.tsx`, `web/src/components/events/EventStatusLine.test.tsx`

**Interfaces:**
- Consumes: Task 6 (`fetchEvent`, `fetchEvents`, `fetchEventPromos`, `eventPhase`, `nextEvent`, labels), Task 7 (`fetchDeals` with `event`, `fetchCoupons(..., eventId)`), Task 8 (`eventMetadata`, `eventJsonLd`, `faqJsonLd`, `breadcrumbJsonLd`); existing `DealCarousel`, `CouponsBlock`, `CatalogBlock` (pass `state={{ status: 'ready', products }}` and `onlyWhenResults`), `Markdown`, `GuideFaq`, `TelegramBlock`, `Header`, `Footer`.
- `EventStatusLine({ event, next, now })` → text per spec §6.2: before: `Empieza el ${eventLongDateLabel} (${whenLabel})` or `Previsto para ${month}` when approximate; during: `En marcha hasta el ${endLong}` or `Es hoy` for one-day events; after: `Terminó el ${endLong}. El próximo evento es ${next.name}` (name linked) or `Terminó el ${endLong}. Volverá en ${eventYear + 1}`.
- `EventView({ event, phase, next, deals, coupons, promos, now })` — sections in the order of spec §6.2 (before: status, intro, tips+FAQ, deals, coupons, promos, Telegram; during/after: status, intro, deals, coupons, promos, tips+FAQ, Telegram). Section titles: deals `Chollos del ${event.name}` (during/after) / `Chollos relacionados` (before); promos `Selección de AliExpress para el ${event.name}` with note «Precios del catálogo de AliExpress con enlace de afiliado; no son chollos verificados por PatoBarato.»; tips `Consejos`; FAQ `Preguntas frecuentes`. A section with empty content (empty `tipsMd`, empty `faq`, empty arrays) is omitted. «Ver todos los chollos» link to `/chollos?tag=${hashtags[0]}` only when `hashtags.length > 0 && deals.length > 0`.
- Page: `revalidate = 3600`; `export const dynamicParams = true`; `generateStaticParams` returns `(await fetchEvents(getSupabase()).catch(e => { console.error('events: …'); return [] })).map(e => ({ slug: e.slug }))`; `loadEvent = cache(slug => optional('evento', () => fetchEvent(…)) ?? null)`; unknown slug → `notFound()` in both `generateMetadata` and the page; blocks via `optional('evento/<slug>/chollos' | '/cupones' | '/promos', …)` each defaulting to `[]`; `fetchDeals` called with `{ page: 0, event: { hashtags, from: startsOn, to: endsOn } }` and sliced to 12; `next` = `nextEvent(now, allEvents.filter(e => e.slug !== slug))` only in `after` phase. JSON-LD scripts: breadcrumb (Inicio › Eventos › name), `eventJsonLd` when non-null, `faqJsonLd` when faq non-empty.

- [ ] **Step 1: Write failing tests** — status line for the five cases (incl. approximate and one-day); view omits empty sections and reorders by phase; page: 404 on null, JSON-LD `Event` present for Black Friday and absent for Prime Day, promos block rendered from fixtures, blocks omitted when loaders fail.
- [ ] **Step 2: Run to verify failure.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Verify** — full web suite + typecheck + lint pass; `npm run build` succeeds.
- [ ] **Step 5: Commit** — `git commit -m "feat(web): /eventos/[slug] page with phase-aware blocks and JSON-LD"`.

---

### Task 11: Apply migration, docs and end-to-end verification

**Files:**
- Modify: `web/README.md` (events section: table, phases, how to publish), `docs/` none.

- [ ] **Step 1: Apply `20261110010000_events.sql` in production through the Management API (controller does this from the built-in browser tab `seed`, registering the version in `supabase_migrations.schema_migrations`), then `notify pgrst, 'reload schema'`.** Stop condition per SDD: this is a side effect outside the worktree — the controller performs it, not an implementer.
- [ ] **Step 2: `cd web && node scripts/check-views.mjs`** → prints no problems.
- [ ] **Step 3: Start `next start` on a free port and screenshot `/eventos`, `/eventos/black-friday`, `/eventos/aliexpress-1111` at 390 px and 1280 px with Playwright (deviceScaleFactor 1), check copy and that no empty block title appears.**
- [ ] **Step 4: Document in `web/README.md`; commit** — `git commit -m "docs(web): event pages"`.
