# PatoBarato Admin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `admin/`, an invite-only web panel to edit deals (syncing their Telegram post), coupons, guides and events, and to copy any of them in WhatsApp format. The bot executes the Telegram, link-processing, invitation and web-revalidation work through a job queue.

**Architecture:**
- The admin (Next.js) talks to Supabase only with the user's session. RLS limits every table it touches to members of `admin_users`.
- Anything that needs a secret is a row in `admin_jobs`. A new loop in the bot claims each job and runs it with code it already has (`format_caption`, `TelegramPublisher`, the `Pipeline`, the service key). That covers editing or publishing a Telegram post, turning a URL into a draft, inviting a user and revalidating the public web.
- After each Telegram job, and on a `revalidate` job, the bot calls a new `POST /api/revalidate` on `web/`.

**Tech Stack:**
- Admin: Next.js 16 App Router, React 19, Tailwind v4, TypeScript, `@supabase/supabase-js` + `@supabase/ssr`, Vitest + Testing Library, oxlint, lucide-react, react-markdown + remark-gfm.
- Bot: Python 3.12, Telethon, supabase-py, httpx, pytest.
- Database: Postgres migrations in `supabase/migrations/`.

**Spec:** `docs/superpowers/specs/2026-11-09-patobarato-admin-design.md`

## Global Constraints

- **Base branch:** the local `main` (has `price_before_coupon`), not `origin/main`.
- **Secrets:** the admin's Vercel project has only `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `NEXT_PUBLIC_WEB_URL`. Never the `service_role` key or the bot token, in Vercel or in the browser.
- **Web project:** the only new variable is `REVALIDATE_SECRET`. The bot's `.env` gets the same value.
- **Copy and code language:** UI copy is in Spanish; code, identifiers and comments are in English.
- **Touch targets:** at least 44 px. Every screen must work on mobile and on desktop.
- **Public views:** the `web_*` views keep their columns. `anon` gains nothing; `web/scripts/check-views.mjs` must still pass.
- **Post format:** Telegram posts are formatted only by the bot (`publishing/format.py`). The admin's TypeScript formatter is for preview only, and is pinned to the bot's output by the shared fixtures in `shared/post-format-cases.json`.
- **Drafts:** they never count for the bot's duplicate check (`get_last_publication`) or for the «mínimo histórico» in the views.
- **Ended post:** the edited post starts with the line `❌ <b>OFERTA TERMINADA</b>` and the current price is struck through. The post is never deleted.
- **Owner-only actions:** only an owner (`admin_users.is_owner`) can enqueue `invite_user`/`revoke_user` or see «Usuarios».
- **Stuck jobs:** a job still `pending` after 60 s shows «El bot no responde».
- **Tooling:** same as `web/`: Node ≥ 22.12, `npm run lint|typecheck|test|build`. Bot: `pytest` from `bot/`.

## Review Focus

1. **Editing a Telegram message whose text did not change.** Telegram raises `MessageNotModifiedError`. The `sync_post` job must end `done`, not `error`. Pinned in Task 4.
2. **A post that is a photo with caption versus a text-only post.** Editing must work for both, with no link preview on text posts and the 1024-character caption limit. Pinned in Task 4 and Task 5.
3. **A pasted URL from an unsupported store, or a product with no price or no affiliate link.** The job ends `error` with a readable Spanish reason, and no draft row is left half-created (no publication). Pinned in Task 6.
4. **A user who is signed in but not in `admin_users`** (registration accidentally left open). They can read and write nothing, and the admin shows «No tienes acceso». Pinned in Task 1 (SQL check script) and Task 9.
5. **The image proxy used as an open proxy.** `/api/imagen` must reject requests with no session and URLs that are not a known product, guide or web image. Pinned in Task 11.

---

## File Structure

```
supabase/migrations/20261112000000_admin.sql        admin_users, admin_jobs, grants, RLS, draft status, view filters
shared/post-format-cases.json                        golden cases: post input → Telegram HTML (bot + admin tests)
bot/src/patobarato/models.py                         + PublicationStatus.DRAFT, AdminJob, PostData
bot/src/patobarato/storage/repository.py             + protocol/in-memory methods for jobs, posts, drafts
bot/src/patobarato/storage/supabase_repo.py          + Supabase implementations
bot/src/patobarato/publishing/format.py              + format_ended_caption
bot/src/patobarato/publishing/telegram_publisher.py  + edit()
bot/src/patobarato/core/pipeline.py                  + create_draft()
bot/src/patobarato/admin/__init__.py
bot/src/patobarato/admin/posts.py                    PostService: publish_draft, sync_post
bot/src/patobarato/admin/revalidate.py               WebRevalidator
bot/src/patobarato/admin/users.py                    UserAdmin: invite, revoke
bot/src/patobarato/admin/jobs.py                     JobRunner: claim → dispatch → finish
bot/src/patobarato/config.py, main.py                settings + wiring into _supervise
web/src/app/api/revalidate/route.ts                  POST, secret header, revalidatePath('/', 'layout')
admin/                                               new Next.js app (layout below)
.github/workflows/admin.yml                          lint, typecheck, test, build
```

```
admin/src/
  proxy.ts                         session refresh + redirect to /login
  lib/supabase/{browser,server}.ts
  lib/{jobs,telegram-format,whatsapp,money,stores,slug,clipboard}.ts
  components/{AppNav,ListPanelLayout,JobStatus,WhatsAppActions,MarkdownField,FaqEditor,StringListEditor}.tsx
  app/login, app/auth/confirm/route.ts, app/cuenta/contrasena, app/recuperar
  app/api/imagen/route.ts
  app/ofertas, app/cupones, app/eventos, app/guias, app/usuarios   (page.tsx + its *Panel.tsx)
```

---

### Task 1: Database migration (admin access, job queue, drafts)

**Files:**
- Create: `supabase/migrations/20261112000000_admin.sql`
- Create: `admin/scripts/check-access.mjs`
- Modify: `web/scripts/check-views.mjs` (add: `admin_users` and `admin_jobs` not readable by anon)

**Interfaces:**
- Produces:
  - Tables:
    - `admin_users(user_id uuid pk references auth.users on delete cascade, email text not null, is_owner boolean not null default false, created_at timestamptz default now())`
    - `admin_jobs(id bigint identity pk, type text check in ('create_offer_from_url','publish_draft','sync_post','invite_user','revoke_user','revalidate'), payload jsonb not null default '{}', status text not null default 'pending' check in ('pending','running','done','error'), result jsonb, error text, created_by uuid default auth.uid(), created_at timestamptz default now(), updated_at timestamptz default now())`
  - Functions: `is_admin() returns boolean` and `is_owner() returns boolean`. Both are `security definer stable` with `search_path = public`, and test `auth.uid()` against `admin_users`.
  - `publications.status` accepts `draft`. The check `publications_telegram_ids` becomes `channel <> 'telegram' or status = 'draft' or (chat_id is not null and message_id is not null)`.
  - A `sources` row `(type 'manual', identifier 'admin', country 'ES', active false)`. Extend `sources_type_check` with `'manual'`.

- [ ] **Step 1: Write the migration**
  - **Grants.** Grant `select, insert, update, delete` to `authenticated` on `products, offers, publications, coupons, guides, guide_items, guide_item_stores, events`. Grant `select` on `product_prices, event_promos, sources, admin_users`, and `select, insert` on `admin_jobs`.
  - **Policies.** For each granted table and operation, add a policy `using (is_admin())` / `with check (is_admin())`. Exception: inserts into `admin_jobs` use `with check (is_admin() and (type not in ('invite_user','revoke_user') or is_owner()))`.
  - **Views.** Recreate `web_deals` and `web_guide_items` exactly as they are today (latest definitions: `20261111000000_price_before_coupon.sql`, `20261108010000_guides_followup.sql`). Add `and p2.status <> 'draft'` to every `from publications p2` lateral. Re-apply their `revoke`/`grant` lines.
  - **Last line:** `notify pgrst, 'reload schema';`

- [ ] **Step 2: Write `admin/scripts/check-access.mjs`**
  - It reads the URL and anon key the same way `check-views.mjs` does, plus `CHECK_EMAIL`/`CHECK_PASSWORD` of a signed-in user who is **not** in `admin_users`.
  - It asserts that `coupons`, `publications` and `admin_jobs` return 0 rows or 401/403 for that user.
  - It asserts that inserting into `admin_jobs` is rejected.

- [ ] **Step 3: Apply and verify**
  - Apply the migration through the Supabase Management API (same as earlier migrations).
  - Run `node web/scripts/check-views.mjs`. Expected: `OK`.
  - Run `node admin/scripts/check-access.mjs`. Expected: `OK`.

- [ ] **Step 4: Commit**
  - Run `git add supabase/migrations/20261112000000_admin.sql admin/scripts/check-access.mjs web/scripts/check-views.mjs`
  - Commit with `feat(db): admin access, job queue and draft publications`.

---

### Task 2: Bot models and repository for drafts, posts and jobs

**Files:**
- Modify: `bot/src/patobarato/models.py`, `bot/src/patobarato/storage/repository.py`, `bot/src/patobarato/storage/supabase_repo.py`
- Test: `bot/tests/test_repository.py`, `bot/tests/test_supabase_repo_rows.py`

**Interfaces:**
- Produces, in `models.py`:
  - `PublicationStatus.DRAFT = "draft"`
  - `AdminJob(id: int, type: str, payload: dict)`, frozen dataclass.
  - `PostData`, frozen dataclass with these fields:
    - `publication_id: int`, `offer_id: int`, `product_id: int`, `status: PublicationStatus`
    - `chat_id: int | None`, `message_id: int | None`
    - `title: str`, `price: Decimal`, `previous_price: Decimal | None`, `coupon: str | None`, `hashtags: list[str]`, `price_before_coupon: bool`
    - `affiliate_url: str`, `store: str`, `country: str`, `image_url: str | None`
- Produces, on `Repository` (Protocol, `InMemoryRepository` and `SupabaseRepository`):
  - `insert_publication(..., status: PublicationStatus = PublicationStatus.ACTIVE)`: new keyword.
  - `get_last_publication(...)`: never returns a `draft` row.
  - `get_post(publication_id: int) -> PostData | None`: joins publication + offer + product.
  - `mark_post_published(publication_id: int, chat_id: int, message_id: int, published_at: datetime) -> None`: sets ids, `published_at`, `status='active'`, offer status `published`.
  - `manual_source_id() -> int`: the `sources` row `type='manual'`.
  - `claim_jobs(limit: int) -> list[AdminJob]`: oldest `pending` first. It sets them to `running` with a conditional update (`status = 'pending'`), so a job is never claimed twice.
  - `finish_job(job_id: int, *, result: dict | None = None, error: str | None = None) -> None`: `status` is `done` when `error` is None, else `error`.
  - `add_admin_user(user_id: str, email: str) -> None`

- [ ] **Step 1: Write failing tests** (in-memory repository)

```python
async def test_last_publication_ignores_drafts(repo):  # draft inserted after an active one
    assert (await repo.get_last_publication(pid, "ES", channel="telegram")).status == PublicationStatus.ACTIVE

async def test_get_post_joins_offer_and_product(repo):
    post = await repo.get_post(pub_id)
    assert (post.title, post.coupon, post.price, post.status) == ("Robot S20", "XIAO20", Decimal("149"), PublicationStatus.DRAFT)

async def test_mark_post_published_sets_ids_and_active(repo): ...
async def test_claim_jobs_claims_once(repo):
    assert [j.id for j in await repo.claim_jobs(10)] == [1, 2]
    assert await repo.claim_jobs(10) == []
async def test_finish_job_error_sets_status_error(repo): ...
```

  For `SupabaseRepository`, add row-shape tests in the style of `test_supabase_repo_rows.py`: the dict sent for `insert_publication(status=DRAFT)` includes `"status": "draft"` and omits `chat_id` and `message_id`.

- [ ] **Step 2: Run** `pytest tests/test_repository.py tests/test_supabase_repo_rows.py -q`. Expected: the new tests FAIL.

- [ ] **Step 3: Implement**
  - Add the models and the methods listed under Interfaces.
  - `get_last_publication` adds `.neq("status", "draft")`.
  - `claim_jobs` in Supabase: select `id` where `pending` order by `id` limit n, then `update status='running' where id=? and status='pending'` row by row, keeping the rows the update returned.

- [ ] **Step 4: Run** `pytest -q`. Expected: all PASS.

- [ ] **Step 5: Commit** with `feat(bot): drafts, post lookup and admin job storage`.

---

### Task 3: Ended-post format and shared format fixtures

**Files:**
- Create: `shared/post-format-cases.json`
- Modify: `bot/src/patobarato/publishing/format.py`
- Test: `bot/tests/test_format.py`

**Interfaces:**
- Produces:
  - `format_ended_caption(offer: ParsedOffer, link: str, store_name: str = "Amazon", max_len: int = 1024) -> str` in `format.py`.
  - The fixture file is an array of `{ "name": str, "input": { "title", "price", "previous_price", "coupon", "hashtags", "link", "store_name", "price_before_coupon", "ended" }, "expected": str }`. Prices are strings like `"149.00"`. `expected` is the exact HTML.

- [ ] **Step 1: Write `shared/post-format-cases.json`** with at least these cases:
  - Full Amazon offer.
  - No previous price.
  - Coupon present.
  - `price_before_coupon` true («Precio sin cupón»).
  - Hashtags needing normalisation (`"Black Friday"` → `#blackfriday`).
  - A title with `<` and `&`.
  - A 1200-character title (trimmed with `…`).
  - Two `ended: true` variants.

  An ended `expected` is the active caption with `❌ <b>OFERTA TERMINADA</b>` prepended as its own first line, and the price value wrapped in `<s>…</s>`, e.g. `✅ Precio: <s>149,00 €</s>`.

- [ ] **Step 2: Write the failing test.** `test_shared_cases` loads `../shared/post-format-cases.json` relative to the repo root, builds a `ParsedOffer` per case, calls `format_ended_caption` if `ended` else `format_caption`, and asserts the result equals `expected`.

- [ ] **Step 3: Run** `pytest tests/test_format.py -q`. Expected: FAIL on the ended cases (`format_ended_caption` undefined).

- [ ] **Step 4: Implement `format_ended_caption`.**
  - Reuse `_build` with an `ended` flag rather than post-processing a string.
  - Trim the title exactly as `format_caption` does, so the 1024 limit still holds with the extra line.

- [ ] **Step 5: Run** `pytest -q`. Expected: PASS.

- [ ] **Step 6: Commit** with `feat(bot): ended-offer caption and shared format fixtures`.

---

### Task 4: Editing a Telegram post

**Files:**
- Modify: `bot/src/patobarato/publishing/telegram_publisher.py`
- Test: `bot/tests/test_telegram_publisher.py`

**Interfaces:**
- Produces: `TelegramPublisher.edit(chat_id: int, message_id: int, caption: str) -> None`.
  - It calls `client.edit_message(chat_id, message_id, caption, parse_mode="html", link_preview=False)`. For a photo post, Telethon edits the caption.
  - Retries and flood-waits work the same as `publish()`.
  - `MessageNotModifiedError` is swallowed (returns normally).
  - Any other error is raised.

- [ ] **Step 1: Write failing tests** with the fake client pattern already in `test_telegram_publisher.py`:
  - `test_edit_calls_edit_message_with_html_and_no_preview`
  - `test_edit_ignores_message_not_modified`
  - `test_edit_retries_flood_wait`
  - `test_edit_raises_bad_request`

- [ ] **Step 2: Run** `pytest tests/test_telegram_publisher.py -q`. Expected: FAIL.

- [ ] **Step 3: Implement.** Extract the retry loop of `publish` into a private `_with_retries(fn)` that both methods use.

- [ ] **Step 4: Run** `pytest -q`. Expected: PASS.

- [ ] **Step 5: Commit** with `feat(bot): edit published Telegram posts`.

---

### Task 5: PostService (publish a draft, sync a post)

**Files:**
- Create: `bot/src/patobarato/admin/__init__.py`, `bot/src/patobarato/admin/posts.py`
- Test: `bot/tests/test_admin_posts.py`

**Interfaces:**
- Consumes:
  - From Task 2: `Repository.get_post`, `mark_post_published`, `PostData`.
  - From Task 3: `format_caption`, `format_ended_caption`.
  - From Task 4: `TelegramPublisher.edit`.
  - Existing: `publish(caption, photo) -> (chat_id, message_id)`.
- Produces:
  - `class PostError(Exception)`. Its message is Spanish and shown to the user.
  - `PostService(repo, publisher, registry: StoreRegistry, image_downloader: ImageDownloader, clock)`
  - `async publish_draft(publication_id: int) -> dict` returns `{"chat_id": int, "message_id": int}`.
  - `async sync_post(publication_id: int) -> dict` returns `{"edited": bool}`.
  - `caption_for(post: PostData) -> str` (module function): builds a `ParsedOffer` from `PostData` and picks the active or ended formatter. The store name is `registry.get(post.store).name`, falling back to `post.store.capitalize()`.

- [ ] **Step 1: Write failing tests** (InMemoryRepository plus a fake publisher recording calls)

```python
async def test_publish_draft_posts_photo_and_marks_active(): ...      # downloader returns bytes → publish(caption, bytes); post becomes active with ids
async def test_publish_draft_retries_without_photo_when_rejected(): ... # PhotoInvalidDimensionsError → second publish(caption, None)
async def test_publish_draft_rejects_non_draft():
    with pytest.raises(PostError, match="no es un borrador"): ...
async def test_sync_post_edits_with_active_caption(): ...
async def test_sync_post_ended_uses_ended_caption(): ...               # caption starts with "❌ <b>OFERTA TERMINADA</b>"
async def test_sync_post_web_only_publication_is_noop():
    assert await service.sync_post(pid) == {"edited": False}
async def test_sync_post_missing_publication_raises(): ...             # PostError("La oferta no existe")
```

- [ ] **Step 2: Run** `pytest tests/test_admin_posts.py -q`. Expected: FAIL.

- [ ] **Step 3: Implement.** Reuse `can_retry_without_photo` from `telegram_publisher`.

- [ ] **Step 4: Run** `pytest -q`. Expected: PASS.

- [ ] **Step 5: Commit** with `feat(bot): publish drafts and sync edited posts`.

---

### Task 6: Draft from a pasted URL (pipeline)

**Files:**
- Modify: `bot/src/patobarato/core/pipeline.py`
- Test: `bot/tests/test_pipeline.py`

**Interfaces:**
- Consumes:
  - From Task 2: `insert_publication(status=DRAFT)`, `manual_source_id()`.
- Produces:
  - `Pipeline.create_draft(url: str, job_id: int) -> int`, which returns the new `publication_id`.
  - Raises `DraftError(Exception)` (defined in `pipeline.py`) with these exact messages:
    - `"No reconozco la tienda de ese enlace"`: no offer extracted.
    - `"No he encontrado el precio en la tienda"`: no price after `_with_store_price`.
    - `"No se pudo generar el enlace de afiliado"`: `_affiliate_url` is None.

- [ ] **Step 1: Write failing tests** with the fakes already in `test_pipeline.py`:
  - `test_create_draft_stores_draft_without_publishing`: publisher not called; publication `status == DRAFT` with the affiliate URL; product image stored.
  - `test_create_draft_ignores_duplicate_rule`: product published 1 day ago, and a draft is still created.
  - `test_create_draft_unknown_store_raises`.
  - `test_create_draft_no_price_raises_and_leaves_no_publication`.
  - `test_create_draft_no_affiliate_raises`.

- [ ] **Step 2: Run** `pytest tests/test_pipeline.py -q -k create_draft`. Expected: FAIL.

- [ ] **Step 3: Implement.**
  - Build `SourceMessage(source_id=await repo.manual_source_id(), message_id=job_id, text=url, urls=[url], hashtags=[], received_at=clock())`.
  - Take the first offer from `extract_offers`, then call `_with_store_price` if it has no price.
  - Do **not** call `decide()`.
  - Resolve the affiliate URL **before** writing anything.
  - Then call `upsert_product`, `insert_offer`, `insert_publication(..., chat_id=None, message_id=None, status=PublicationStatus.DRAFT, price_before_coupon=...)` and `set_offer_status(PENDING)`, and store the image via `_find_image`.
  - The worker queue is not involved (no publishing happens here).

- [ ] **Step 4: Run** `pytest -q`. Expected: PASS.

- [ ] **Step 5: Commit** with `feat(bot): create draft offers from a pasted link`.

---

### Task 7: Job runner, user admin, web revalidation, and wiring

**Files:**
- Create: `bot/src/patobarato/admin/revalidate.py`, `bot/src/patobarato/admin/users.py`, `bot/src/patobarato/admin/jobs.py`
- Modify: `bot/src/patobarato/config.py`, `bot/src/patobarato/main.py`, `bot/.env.example`, `bot/README.md`
- Test: `bot/tests/test_admin_jobs.py`, `bot/tests/test_admin_revalidate.py`, `bot/tests/test_admin_users.py`, `bot/tests/test_config.py`

**Interfaces:**
- Consumes:
  - From Task 2: `claim_jobs`, `finish_job`, `add_admin_user`.
  - From Task 5: `PostService`, `PostError`.
  - From Task 6: `Pipeline.create_draft`, `DraftError`.
- Produces, in `Settings`:
  - `admin_url: str | None = None`: invite redirect base.
  - `web_revalidate_url: str | None = None`, e.g. `https://patobarato.es/api/revalidate`.
  - `revalidate_secret: str | None = None`
  - `admin_jobs_poll_seconds: float = 3.0`
- Produces, in `revalidate.py`:
  - `WebRevalidator(http, url: str | None, secret: str | None)` with `async revalidate() -> None`.
  - It POSTs with header `x-revalidate-secret` and does nothing when unconfigured.
  - It raises `RevalidateError` on a non-2xx response. The message carries no secret.
- Produces, in `users.py`:
  - `UserAdmin(client, repo, admin_url)`
  - `async invite(email: str) -> dict`: calls `auth.admin.invite_user_by_email(email, {"redirect_to": f"{admin_url}/auth/confirm"})` through `asyncio.to_thread`, then `repo.add_admin_user`. Returns `{"user_id": ...}`.
  - `async revoke(user_id: str) -> dict`: calls `auth.admin.delete_user` (the `admin_users` row cascades). It refuses when the target is the last owner, with `UserError("No puedes quitar al último propietario")`.
- Produces, in `jobs.py`:
  - `JobRunner(repo, posts, pipeline, users, revalidator, poll_seconds, sleep=asyncio.sleep)` with `async run() -> None` (loops forever) and `async run_once() -> int` (jobs handled).
  - Dispatch:
    - `create_offer_from_url {url}` → `pipeline.create_draft(url, job.id)` → result `{"publication_id"}`.
    - `publish_draft {publication_id}` → `posts.publish_draft`, then `revalidate()`.
    - `sync_post {publication_id}` → `posts.sync_post`, then `revalidate()`.
    - `invite_user {email}`, `revoke_user {user_id}` → `users`.
    - `revalidate {}` → `revalidator.revalidate()`.
  - Error handling:
    - `PostError`, `DraftError`, `UserError` and `RevalidateError` → `finish_job(error=str(exc))`.
    - Any other exception → `finish_job(error="Error interno del bot")` and `logger.exception`.
    - An unknown type → `finish_job(error="Tipo de trabajo desconocido")`.
    - A failed revalidation after a successful Telegram job → `finish_job(result={..., "revalidate_error": msg})`, not `error`, because the post is already right.

- [ ] **Step 1: Write failing tests:**
  - `test_run_once_dispatches_each_type` (fakes for every collaborator)
  - `test_post_error_finishes_job_with_message`
  - `test_unexpected_error_is_generic`
  - `test_unknown_type`
  - `test_revalidate_failure_after_sync_keeps_done`
  - `test_revalidator_noop_when_unconfigured`
  - `test_revalidator_sends_secret_header` (httpx `MockTransport`)
  - `test_revoke_last_owner_refused`
  - `test_settings_admin_defaults`

- [ ] **Step 2: Run** `pytest tests/test_admin_jobs.py tests/test_admin_revalidate.py tests/test_admin_users.py tests/test_config.py -q`. Expected: FAIL.

- [ ] **Step 3: Implement**
  - Build the classes listed under Interfaces.
  - In `main.run`, construct `PostService` with the existing `publisher`, `registry` and `download_photo`. Construct `UserAdmin` with the existing supabase client, and `WebRevalidator` with the `http` client.
  - Add `admin_jobs=runner.run()` to `_supervise(...)`.
  - Document the three new env vars in `.env.example` and the README.

- [ ] **Step 4: Run** `pytest -q`. Expected: all PASS.

- [ ] **Step 5: Commit** with `feat(bot): admin job runner with invitations and web revalidation`.

---

### Task 8: Web revalidation endpoint

**Files:**
- Create: `web/src/app/api/revalidate/route.ts`, `web/src/app/api/revalidate/route.test.ts`
- Modify: `web/README.md`, `web/.env.example`

**Interfaces:**
- Produces: `POST /api/revalidate`.
  - Header `x-revalidate-secret` must equal `process.env.REVALIDATE_SECRET`. The comparison is constant-time, and it fails when the variable is unset.
  - On success it calls `revalidatePath('/', 'layout')` (the whole site: deals appear on most pages) and returns `{ revalidated: true }`.
  - Otherwise it returns 401 with no body detail.

- [ ] **Step 1: Write failing tests:**
  - `rejects missing secret (401)`
  - `rejects wrong secret (401)`
  - `rejects when REVALIDATE_SECRET unset (401)`
  - `revalidates the whole layout with the right secret`: mock `next/cache` and assert `revalidatePath` was called with `('/', 'layout')`.

- [ ] **Step 2: Run** `cd web && npx vitest run src/app/api/revalidate`. Expected: FAIL.

- [ ] **Step 3: Implement the route.** Add `REVALIDATE_SECRET` to `.env.example` and README (set it in Vercel and in the bot's `.env`).

- [ ] **Step 4: Run** `cd web && npm run lint && npm run typecheck && npm test`. Expected: PASS.

- [ ] **Step 5: Commit** with `feat(web): on-demand revalidation endpoint for the bot`.

---

### Task 9: Admin app scaffold, auth and navigation

**Files:**
- Create:
  - Project files: `admin/package.json` (same versions and scripts as `web/package.json`, plus `@supabase/ssr`), `admin/tsconfig.json`, `admin/next.config.ts`, `admin/postcss.config.mjs`, `admin/vitest.config.ts`, `admin/src/test-setup.ts`, `admin/.env.example`, `admin/.gitignore`, `admin/README.md`, `admin/vercel.json`
  - `admin/src/app/globals.css`: copy the `web/src/app/globals.css` theme tokens and fonts.
  - Library: `admin/src/lib/supabase/browser.ts`, `admin/src/lib/supabase/server.ts`
  - `admin/src/proxy.ts`
  - Pages and routes: `admin/src/app/layout.tsx`, `admin/src/app/page.tsx` (redirects to `/ofertas`), `admin/src/app/login/page.tsx`, `admin/src/app/recuperar/page.tsx`, `admin/src/app/cuenta/contrasena/page.tsx`, `admin/src/app/auth/confirm/route.ts`, `admin/src/app/sin-acceso/page.tsx`
  - `admin/src/components/AppNav.tsx`
  - `.github/workflows/admin.yml`
- Test: `admin/src/components/AppNav.test.tsx`, `admin/src/app/login/page.test.tsx`, `admin/src/app/auth/confirm/route.test.ts`, `admin/src/proxy.test.ts`

**Interfaces:**
- Produces:
  - `createBrowserSupabase(): SupabaseClient` and `createServerSupabase(): Promise<SupabaseClient>` (cookies from `next/headers`).
  - `getMembership(client): Promise<{ email: string; isOwner: boolean } | null>`: reads the caller's `admin_users` row.
  - `<AppNav isOwner: boolean />` links to Ofertas, Cupones, Guías, Eventos, and Usuarios (owner only), plus «Salir».
- `proxy.ts`:
  - Refreshes the session.
  - Unauthenticated requests to anything but `/login`, `/recuperar` and `/auth/*` go to `/login`.
  - An authenticated user with no membership goes to `/sin-acceso` («No tienes acceso. Pide una invitación al propietario.»).
- `/auth/confirm`:
  - Takes `token_hash` and `type` (`invite` | `recovery`) and calls `verifyOtp`.
  - Then redirects to `/cuenta/contrasena`, which calls `updateUser({ password })` and requires at least 8 characters with a confirm field.
- `/login`: email and password, an error «Email o contraseña incorrectos», and a link «He olvidado mi contraseña» to `/recuperar` (which uses `resetPasswordForEmail` with `redirectTo` `/auth/confirm`).

- [ ] **Step 1: Write failing tests:**
  - `AppNav hides Usuarios for non-owners`
  - `login shows Spanish error on bad credentials` (mock client)
  - `auth/confirm verifies otp and redirects to /cuenta/contrasena`
  - `auth/confirm with bad token redirects to /login?error=enlace`
  - `proxy redirects anonymous to /login`
  - `proxy sends non-members to /sin-acceso`

- [ ] **Step 2: Run** `cd admin && npm install && npm test`. Expected: FAIL.

- [ ] **Step 3: Implement**
  - Build the pages and modules listed under Interfaces.
  - `admin/README.md` documents the manual Supabase steps:
    - Disable «Allow new users to sign up».
    - Add `<admin-url>/auth/confirm` to Redirect URLs.
    - Change the Invite and Reset Password email templates to `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite` (or `recovery`), with Site URL = the admin URL.
    - Insert the first owner: `insert into admin_users (user_id, email, is_owner) select id, email, true from auth.users where email = '<owner>';` after inviting yourself from the Supabase dashboard.
    - Create the Vercel project with Root Directory `admin` and the three `NEXT_PUBLIC_*` variables.
  - `admin.yml` mirrors `web.yml` with `working-directory: admin`.

- [ ] **Step 4: Run** `cd admin && npm run lint && npm run typecheck && npm test && npm run build`. Expected: PASS.

- [ ] **Step 5: Commit** with `feat(admin): scaffold with Supabase auth by invitation`.

---

### Task 10: Admin shared logic (jobs, formatters, WhatsApp text)

**Files:**
- Create: `admin/src/lib/jobs.ts`, `admin/src/lib/money.ts`, `admin/src/lib/stores.ts`, `admin/src/lib/slug.ts`, `admin/src/lib/telegram-format.ts`, `admin/src/lib/whatsapp.ts`, `admin/src/components/JobStatus.tsx`
- Test: `admin/src/lib/telegram-format.test.ts`, `admin/src/lib/whatsapp.test.ts`, `admin/src/lib/jobs.test.ts`, `admin/src/lib/slug.test.ts`, `admin/src/components/JobStatus.test.tsx`

**Interfaces:**
- Produces:
  - Jobs:
    - `type JobType = 'create_offer_from_url' | 'publish_draft' | 'sync_post' | 'invite_user' | 'revoke_user' | 'revalidate'`
    - `enqueueJob(client, type: JobType, payload: Record<string, unknown>): Promise<number>`
    - `useJob(jobId: number | null): { status: 'pending'|'running'|'done'|'error'|null; error: string | null; result: any; stuck: boolean }`: polls every 2 s until done or error. `stuck` is true when still `pending` 60 s after `created_at`.
  - `<JobStatus jobId onRetry />`: «Enviando…», «Hecho», «Error: {error}» with a «Reintentar» button, «El bot no responde».
  - Money and stores:
    - `formatPrice(n: number): string`, e.g. `1299.9 → "1.299,90"`, same as Python `format_price`.
    - `discountPercent(price, previous): number` (round half up).
    - `storeName(id: string): string`: copy the display names used by `web/src/lib/stores.ts`.
  - `slugify(title: string): string`: lowercase ASCII, `-`-separated, matching `^[a-z0-9-]+$`.
  - `PostInput`: `{ title, price, previousPrice, coupon, hashtags, link, storeName, priceBeforeCoupon, ended }`
  - `telegramCaption(p: PostInput): string`: port of `format_caption`/`format_ended_caption`, including URL stripping in the title and coupon, and the 1024 trim.
  - WhatsApp text:
    - `whatsappOffer(p: PostInput): string`, with the same lines and order as Telegram:
      - Title in `*bold*` and the price in `*…*`.
      - Previous price as `~X €~ (-N%)`.
      - Coupon as `` `CODE` ``.
      - The link line, then the hashtags.
      - The ended version starts with `❌ *OFERTA TERMINADA*` and strikes the price.
    - `whatsappCoupon(c: { store, title, code, conditions, expiresAt, url }): string`: `expiresAt` is shown as «Caduca el dd/mm/aaaa» in Europe/Madrid.
    - `whatsappGuide(g: { title, subtitle, slug }, webUrl): string` (link `${webUrl}/guias/${slug}`).
    - `whatsappEvent(e: { name, introMd, slug }, webUrl): string`, with the intro reduced to its first paragraph as plain text and the link `${webUrl}/eventos/${slug}`.

- [ ] **Step 1: Write failing tests:**
  - `telegram-format matches every case in ../shared/post-format-cases.json` (import the JSON, map `input` to `PostInput`, expect equal to `expected`).
  - WhatsApp cases for offer, ended offer, coupon without expiry, guide, and event (multi-paragraph intro with Markdown stripped).
  - `useJob marks stuck after 60s pending` (fake timers).
  - `slugify("Freidoras de aire: guía 2026") === "freidoras-de-aire-guia-2026"`.

- [ ] **Step 2: Run** `cd admin && npm test`. Expected: FAIL.

- [ ] **Step 3: Implement.**

- [ ] **Step 4: Run** `cd admin && npm test`. Expected: PASS.

- [ ] **Step 5: Commit** with `feat(admin): job hooks, post preview formatter and WhatsApp text`.

---

### Task 11: List + side panel layout, WhatsApp actions, image proxy

**Files:**
- Create: `admin/src/components/ListPanelLayout.tsx`, `admin/src/components/WhatsAppActions.tsx`, `admin/src/lib/clipboard.ts`, `admin/src/app/api/imagen/route.ts`
- Test: `admin/src/components/ListPanelLayout.test.tsx`, `admin/src/components/WhatsAppActions.test.tsx`, `admin/src/app/api/imagen/route.test.ts`

**Interfaces:**
- Produces:
  - `<ListPanelLayout list: ReactNode panel: ReactNode | null onClose />`
    - Desktop (≥ 1024 px): two columns, with the panel on the right.
    - Below that: the panel is full-screen with a «←» back button.
    - The open item is held in the URL `?id=` via `useSearchParams`.
  - `<WhatsAppActions text: string imageUrl: string | null />`
    - Shows an editable textarea preview (not saved).
    - Desktop: «Copiar imagen» and «Copiar texto».
    - Where `navigator.canShare({ files })` is true: «Compartir» copies the text to the clipboard first, then calls `navigator.share({ files: [png], text })`.
  - `clipboard.ts`:
    - `loadPng(imageUrl): Promise<Blob>`: fetches `/api/imagen?url=…` and converts to PNG through a canvas.
    - `copyImage(blob)` and `copyText(text)`.
  - `GET /api/imagen?url=`
    - Returns 401 without a session.
    - Returns 403 unless the URL equals a `products.image_url` or `guide_items.image_url` (looked up with the user's session), or starts with `NEXT_PUBLIC_WEB_URL`.
    - Otherwise it streams the image with its content type. 502 on upstream failure.

- [ ] **Step 1: Write failing tests:**
  - `panel opens from ?id and closes to the list`
  - `shows Compartir only when canShare files`
  - `Compartir copies text before sharing`
  - `Copiar texto copies the edited textarea content`
  - `imagen: 401 without session`
  - `imagen: 403 for unknown host/url`
  - `imagen: streams known product image`

- [ ] **Step 2: Run** `cd admin && npm test`. Expected: FAIL.

- [ ] **Step 3: Implement.**

- [ ] **Step 4: Run** `cd admin && npm test`. Expected: PASS.

- [ ] **Step 5: Commit** with `feat(admin): list/panel layout, WhatsApp copy and share, image proxy`.

---

### Task 12: Ofertas

**Files:**
- Create: `admin/src/app/ofertas/page.tsx`, `admin/src/app/ofertas/OfferPanel.tsx`, `admin/src/app/ofertas/NewOfferDialog.tsx`, `admin/src/lib/offers.ts`
- Test: `admin/src/lib/offers.test.ts`, `admin/src/app/ofertas/OfferPanel.test.tsx`, `admin/src/app/ofertas/NewOfferDialog.test.tsx`

**Interfaces:**
- Consumes: Tasks 9–11 (`createBrowserSupabase`, `enqueueJob`, `JobStatus`, `telegramCaption`, `whatsappOffer`, `ListPanelLayout`, `WhatsAppActions`).
- Produces, in `offers.ts`:
  - `listOffers(client, { filter: 'active'|'draft'|'ended', q }): Promise<OfferRow[]>`: latest 200 publications of that status, newest first, with offer and product joined; `q` matches `products.title` with `ilike`.
  - `getOffer(client, publicationId): Promise<OfferDetail>`
  - `saveOffer(client, id, patch: { title, price, previousPrice, coupon, priceBeforeCoupon, hashtags }): Promise<void>`: writes `products.title`, `publications.published_price` + `price_before_coupon`, and `offers.previous_price` + `coupon` + `hashtags`.
  - `setOfferStatus(client, id, status: 'active'|'ended'): Promise<void>`: `ended_at = now()` when ended, null when reactivated.
  - `recentTelegramPublication(client, productId, days = 7): Promise<string | null>`: the `published_at` of an active or ended Telegram publication of the same product within `days`.
- Behaviour:
  - **List.** Filters «Activas · Borradores · Terminadas», search, and the button «+ Nueva desde enlace».
  - **Panel.** Shows the state line («Telegram ✔», «Solo web» or «Borrador»), the fields, and a live `telegramCaption` preview.
  - **Save.** «Guardar y actualizar Telegram» (only «Guardar» for `channel = 'web'`) calls `saveOffer`, then `enqueueJob('sync_post')` when the post has a `message_id`, else `enqueueJob('revalidate')`.
  - **End and reactivate.** «Terminar oferta» asks for confirmation, then calls `setOfferStatus('ended')` and enqueues `sync_post`. «Reactivar» does the reverse.
  - **Drafts.** «Publicar en Telegram» first saves. If `recentTelegramPublication` returns a date, it confirms with «Ya se publicó hace N días. ¿Publicar de todas formas?». Then it enqueues `publish_draft`.
  - **Duplicate warning.** A draft whose product the bot auto-published after the draft's `created_at` shows the banner «El bot ya la publicó {fecha}».
  - **New from link.** The URL field enqueues `create_offer_from_url`. On `done` the panel opens `?id={result.publication_id}`; on `error` it shows the message.
  - **WhatsApp.** `WhatsAppActions` with `whatsappOffer(...)` and the product image.

- [ ] **Step 1: Write failing tests:**
  - `saveOffer writes the three tables` (mock client recording calls)
  - `save enqueues sync_post for telegram posts and revalidate for web-only`
  - `terminar confirms, sets ended and enqueues sync_post`
  - `publish draft warns when published 2 days ago`
  - `preview updates as price changes`
  - `new offer dialog opens the draft on job done`
  - `new offer dialog shows job error text`

- [ ] **Step 2: Run** `cd admin && npm test`. Expected: FAIL.

- [ ] **Step 3: Implement.**

- [ ] **Step 4: Run** `cd admin && npm run lint && npm run typecheck && npm test`. Expected: PASS.

- [ ] **Step 5: Commit** with `feat(admin): offers list, edit, end, drafts and new-from-link`.

---

### Task 13: Cupones

**Files:**
- Create: `admin/src/app/cupones/page.tsx`, `admin/src/app/cupones/CouponPanel.tsx`, `admin/src/lib/coupons.ts`
- Test: `admin/src/app/cupones/CouponPanel.test.tsx`, `admin/src/lib/coupons.test.ts`

**Interfaces:**
- Produces, in `coupons.ts`:
  - `listCoupons(client, { filter: 'active'|'expired'|'all', q })`
  - `saveCoupon(client, coupon: CouponInput & { id?: number }): Promise<number>`, upsert.
  - `CouponInput` fields: `store, code, title, conditions, url, startsAt, expiresAt, active, discountAmount, discountPct, minPurchase, eventId`.
- Behaviour:
  - Create and edit every field. The event is picked from a select of `events`.
  - When `source_id` is set, a warning reads «Este cupón lo sincroniza el bot: la próxima sincronización puede sobrescribir tus cambios.»
  - After saving, it enqueues `revalidate`.
  - WhatsApp uses `whatsappCoupon` and `${NEXT_PUBLIC_WEB_URL}/og.png` as the image.
  - Validation: store, code and title are required, and `expiresAt` must be after `startsAt`.

- [ ] **Step 1: Write failing tests:**
  - `new coupon saves and enqueues revalidate`
  - `bot coupon shows overwrite warning`
  - `rejects expiry before start`

- [ ] **Step 2: Run** `cd admin && npm test`. Expected: FAIL.

- [ ] **Step 3: Implement.**

- [ ] **Step 4: Run** `cd admin && npm test`. Expected: PASS.

- [ ] **Step 5: Commit** with `feat(admin): coupons`.

---

### Task 14: Eventos (with shared Markdown and FAQ editors)

**Files:**
- Create: `admin/src/components/MarkdownField.tsx`, `admin/src/components/FaqEditor.tsx`, `admin/src/components/StringListEditor.tsx`, `admin/src/app/eventos/page.tsx`, `admin/src/app/eventos/EventPanel.tsx`, `admin/src/lib/events.ts`
- Test: `admin/src/components/FaqEditor.test.tsx`, `admin/src/components/StringListEditor.test.tsx`, `admin/src/app/eventos/EventPanel.test.tsx`

**Interfaces:**
- Produces:
  - `<MarkdownField label value onChange />`: textarea with an «Editar | Vista previa» toggle (react-markdown + remark-gfm).
  - `<FaqEditor value: { q: string; a_md: string }[] onChange />`: add, remove, move up and down.
  - `<StringListEditor value: string[] onChange />`: used for `stores`, `hashtags`, `pros`, `cons`.
  - `events.ts`: `listEvents`, `getEvent`, and `saveEvent(client, e: EventInput & { id?: number }): Promise<number>`.
  - `EventInput` fields: `slug, name, stores, startsOn, endsOn, approximate, hashtags, aliexpressPromo, introMd, tipsMd, faq, status`.
- Behaviour:
  - **Slug.** Defaults to `slugify(name)` for new events and stays editable. A unique-violation error shows «Ese slug ya existe».
  - **Status.** «Guardar borrador» or «Publicar».
  - **Read-only data.** `event_promos` appears as a read-only count with its last `synced_at`.
  - **Links and revalidation.** «Ver en la web» opens `${NEXT_PUBLIC_WEB_URL}/eventos/{slug}`. Every save enqueues `revalidate`.
  - **WhatsApp.** `whatsappEvent` with the `og.png` image.

- [ ] **Step 1: Write failing tests:**
  - `faq editor adds, removes and reorders`
  - `new event slug follows name until edited`
  - `duplicate slug shows Ese slug ya existe`
  - `saving enqueues revalidate`

- [ ] **Step 2: Run** `cd admin && npm test`. Expected: FAIL.

- [ ] **Step 3: Implement.**

- [ ] **Step 4: Run** `cd admin && npm test`. Expected: PASS.

- [ ] **Step 5: Commit** with `feat(admin): events with markdown and FAQ editors`.

---

### Task 15: Guías

**Files:**
- Create: `admin/src/app/guias/page.tsx`, `admin/src/app/guias/GuidePanel.tsx`, `admin/src/app/guias/GuideItemsEditor.tsx`, `admin/src/lib/guides.ts`
- Test: `admin/src/app/guias/GuideItemsEditor.test.tsx`, `admin/src/lib/guides.test.ts`

**Interfaces:**
- Consumes: from Task 14, `MarkdownField`, `FaqEditor` and `StringListEditor`.
- Produces, in `guides.ts`:
  - `listGuides` and `getGuide(client, id): Promise<GuideDetail>` (guide + items + item stores + latest `product_prices` per store link via `products(store, asin = external_id)`).
  - `saveGuide(client, g: GuideInput & { id?: number }): Promise<number>`
  - `saveGuideItems(client, guideId, items: GuideItemInput[]): Promise<void>`
    - It replaces the guide's items: delete the rows that were removed, upsert the rest by `id`, then renumber `position` 1..n.
    - Write the positions in two passes (offset, then final) to avoid `unique(guide_id, position)` clashes.
  - `GuideItemInput`: `{ id?, name, award, summaryMd, pros, cons, specs: {label, value}[], imageUrl, stores: { id?, store, externalId, url, note }[] }`
- Behaviour:
  - **Tabs:** «Datos · Contenido · FAQ · Productos».
  - **Datos:** slug (auto from the title), title, subtitle, category, author, reading minutes, status. `published_at` is set on the first publish.
  - **Productos:**
    - Items can be reordered, added and removed.
    - Each store link shows its last price read-only, or «sin precio todavía» when there is none.
    - The prices come from the bot after it next refreshes guide prices.
  - **Links and revalidation:** «Ver en la web» opens `/guias/{slug}`. Every save enqueues `revalidate`.
  - **WhatsApp:** `whatsappGuide`, with the first item's image (or `og.png`).

- [ ] **Step 1: Write failing tests:**
  - `saveGuideItems renumbers positions without clashing`
  - `removing an item deletes it`
  - `store link shows sin precio todavía when no price`

- [ ] **Step 2: Run** `cd admin && npm test`. Expected: FAIL.

- [ ] **Step 3: Implement.**

- [ ] **Step 4: Run** `cd admin && npm test`. Expected: PASS.

- [ ] **Step 5: Commit** with `feat(admin): guides with items, store links and FAQ`.

---

### Task 16: Usuarios, and end-to-end check

**Files:**
- Create: `admin/src/app/usuarios/page.tsx`, `admin/src/app/usuarios/UsersPanel.tsx`
- Test: `admin/src/app/usuarios/UsersPanel.test.tsx`
- Modify: `README.md` (root: describe `admin/` and the job flow)

**Interfaces:**
- Consumes: `getMembership`, `enqueueJob('invite_user', { email })`, `enqueueJob('revoke_user', { user_id })`, `JobStatus`.
- Behaviour:
  - The page is owner-only. Non-owners get a redirect to `/ofertas`.
  - It lists `admin_users` with email, «Propietario» and the creation date.
  - «Invitar» takes an email field (validated) and shows the job status. On `done` it shows «Invitación enviada a {email}».
  - «Quitar acceso» asks for confirmation and is hidden for your own row.

- [ ] **Step 1: Write failing tests:**
  - `non-owner is redirected`
  - `invite enqueues invite_user with the email`
  - `cannot revoke yourself`

- [ ] **Step 2: Run** `cd admin && npm test`. Expected: FAIL.

- [ ] **Step 3: Implement.**

- [ ] **Step 4: Run the full suites**
  - `cd admin && npm run lint && npm run typecheck && npm test && npm run build`
  - `cd web && npm test`
  - `cd bot && pytest -q`
  - Expected: all PASS.

- [ ] **Step 5: Manual end-to-end** against the real project, with the bot running and a test channel as `TARGET_CHANNEL`:
  - Invite a second email and accept it.
  - Paste an Amazon link, review the draft and publish it.
  - Change the price, then check the Telegram post and the web page after reloading.
  - End the offer, then check the post header and that the deal is gone from the web.
  - Copy the WhatsApp image and text on desktop, and share from a phone.
  - Record the results in the commit message.

- [ ] **Step 6: Commit** with `feat(admin): users and invitations`.
