# Fuente Chollometro Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sustituir la lectura de canales de Telegram por una fuente programada que toma chollos de chollometro.com, los filtra (temperatura/descuento), publica como máximo 10 por hora sin duplicados y marca como terminadas las publicaciones que Chollometro caduca o agota.

**Architecture:** Un nuevo `ApiSourceRunner` (`type = "chollometro"`) que corre en el `ApiScheduler` existente. Lee `/nuevos`, guarda el seguimiento de cada hilo en una tabla `chollometro_threads`, y entrega los chollos aptos a un método público nuevo del `Pipeline` (`process_offer`) que reutiliza la deduplicación (`insert_offer` único + `decide()`), el enlace de afiliado, la imagen de la tienda y la publicación. Se elimina el listener de Telegram, la cuenta lectora y la cola del pipeline.

**Tech Stack:** Python 3.12, asyncio, httpx, Telethon (solo el bot publicador), supabase-py, pytest + pytest-asyncio, PostgreSQL (migraciones Supabase).

**Spec:** `docs/superpowers/specs/2026-11-09-chollometro-source-design.md`

## Global Constraints

- Filtro: apto si `temperature > 50` **o** `discount >= 40` (%). Config de la fila: `min_temperature` (50), `min_discount` (40).
- Límite: `max_per_hour` (10) publicaciones en Telegram de esta fuente en una ventana deslizante de 60 min. Prioridad: temperatura desc, desempate descuento desc.
- Ventana de calentamiento: 24 h desde `published_at` del hilo en Chollometro (`warm_hours`, 24).
- Vigilancia de fin: `REPUBLISH_AFTER_DAYS` (7) días desde la publicación.
- Presupuesto: como máximo `max_pages_per_run` (5) páginas individuales de Chollometro por ejecución (`every_minutes` = 5 ⇒ 60/h). `/visit/` también cuenta. El listado `/nuevos` no cuenta.
- `detected_at` de la oferta = momento en que el hilo pasa el filtro (`qualified_at`). Un apto que no consigue hueco antes de `STALE_AFTER_MINUTES` (30) desde `qualified_at` ⇒ `skipped_stale`.
- Dedup: `source_message_id` = id numérico del hilo de Chollometro.
- Imagen: solo de la tienda (`store.find_image` / `PriceQuote.image_url`). Nunca la de Chollometro. Sin imagen ⇒ post sin foto.
- Precio: se publica el de Chollometro con su código de cupón en `ParsedOffer.coupon`. Si la tienda da precio **menor**, se publica el de la tienda. Si la tienda es **mayor** y el hilo no trae cupón ⇒ `skipped_mismatch`. Si la tienda falla, se confía en Chollometro. `previous_price` = el de la tienda si lo da, si no el de Chollometro; solo si es mayor que el precio publicado.
- Hashtags: categoría(s) de Chollometro normalizadas con `publishing.format.normalize_hashtag` + `source.hashtags`.
- 403/429 de Chollometro ⇒ `ChollometroBlocked`; la ejecución termina, el error queda en `last_error`, sin reintentos.
- User-Agent: un UA de navegador estándar en la constante `USER_AGENT` del cliente. Nunca datos personales (email) en cabeceras.
- Fin de oferta: solo cuando Chollometro marca caducado/agotado. Publicación `active → ended` una única vez; edición vía `PostService.sync_post`; luego `WebRevalidator.revalidate()` (sus errores se registran, no paran la fuente).
- Las filas `telegram_channel` se quedan en `sources` con `active = false`. El tipo sigue permitido. No se borra nada de la BD.
- `Pipeline.create_draft` (panel "nuevo desde enlace") sigue funcionando: `parsing/extract.py`, `parsing/links.py`, `parsing/text.py` y `SourceMessage` no se borran.
- Tests sin red; fixtures reales en `bot/tests/fixtures/`. Comando: `cd bot && pytest -q` (instalar con `pip install -e ".[dev]"`).
- Commits con el pie `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Hilo que reaparece en `/nuevos` tras haberse publicado o descartado**: no debe crear otra oferta ni otra publicación. Test en Task 6 (`test_republished_thread_is_not_processed_twice`).
2. **Mismo producto en dos hilos distintos**: el segundo pasa por `decide()` y queda `skipped_duplicate` salvo que baje de precio. Test en Task 6 (`test_same_product_two_threads_dedup_by_decide`).
3. **Reinicio del bot a mitad de la ventana**: el límite horario y los candidatos se calculan desde la BD, no desde memoria. Test en Task 6 (`test_cap_counts_publications_from_repo`).
4. **Hilo cuyo `/visit/` no lleva a una tienda registrada o no tiene id de producto** (enlace a búsqueda, a portada, acortador roto): se marca `skipped` sin gastar más peticiones en él. Test en Task 6 (`test_visit_to_unknown_store_is_skipped_once`).
5. **Chollometro bloquea (403/429) en mitad de la ejecución**: no se pierde el estado ya guardado y no se reintenta en bucle. Test en Task 6 (`test_blocked_stops_run_and_keeps_state`).

---

## File Structure

- Create `bot/src/patobarato/sources/chollometro_parse.py` — HTML/JSON de Chollometro → `ChollometroThread`. Puro, sin red.
- Create `bot/src/patobarato/sources/chollometro_client.py` — peticiones HTTP a Chollometro (`/nuevos`, ficha, `/visit/`).
- Create `bot/src/patobarato/sources/chollometro_rules.py` — reglas puras: filtro, orden, reconciliación de precio.
- Create `bot/src/patobarato/sources/chollometro_source.py` — el runner que orquesta todo.
- Create `supabase/migrations/20261113000000_chollometro.sql`.
- Modify `bot/src/patobarato/models.py` — `ChollometroThread`, `TrackedThread`, `ThreadState`.
- Modify `bot/src/patobarato/storage/repository.py` y `supabase_repo.py` — métodos de seguimiento.
- Modify `bot/src/patobarato/parsing/extract.py` — exponer `resolve_store_link`.
- Modify `bot/src/patobarato/core/pipeline.py` — `process_offer` público, sin cola ni foto de Telegram.
- Modify `bot/src/patobarato/main.py`, `config.py`, `.env.example`, `README.md`.
- Delete `bot/src/patobarato/sources/telegram_listener.py`, `bot/tests/test_telegram_listener.py`, `bot/tests/test_listener_sources.py`.

---

### Task 1: Capturar fixtures reales de Chollometro

La red de la sesión de diseño no llegaba a Chollometro. El RSS (`/rss/nuevos`) **no** trae temperatura, precio anterior, cupón ni estado; por eso se lee el HTML. Las páginas de la plataforma Pepper suelen embeber cada hilo como JSON en un atributo `data-vue3` (`{"name": "ThreadMainListItemNormalizer", "props": {"thread": {...}}}`). Hay que **confirmarlo** con datos reales.

**Files:**
- Create: `bot/tests/fixtures/chollometro_nuevos.html`, `bot/tests/fixtures/chollometro_thread_active.html`, `bot/tests/fixtures/chollometro_thread_expired.html`, `bot/tests/fixtures/chollometro_thread_soldout.html` (si se encuentra uno agotado; si no, documentarlo)
- Create: `bot/tests/fixtures/CHOLLOMETRO.md` — mapa verificado de claves

- [ ] **Step 1: Descargar** (en una máquina con red; si la sesión no la tiene, pedirlo al usuario con `! curl ...`):

```bash
UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36"
curl -sL -A "$UA" https://www.chollometro.com/nuevos -o bot/tests/fixtures/chollometro_nuevos.html
curl -sL -A "$UA" "<url de un hilo activo de Amazon>" -o bot/tests/fixtures/chollometro_thread_active.html
curl -sL -A "$UA" "<url de un hilo caducado>" -o bot/tests/fixtures/chollometro_thread_expired.html
curl -sI -A "$UA" "https://www.chollometro.com/visit/threadmain/<id>"   # ver el Location
```

- [ ] **Step 2: Localizar el JSON** (`grep -o 'data-vue3="[^"]\{0,300\}' ...` o `<script>` con estado). Escribir en `CHOLLOMETRO.md` la ruta verbatim de: id, título, precio, precio anterior (`nextBestPrice`?), % descuento, temperatura, caducado, agotado, tienda, enlace `/visit/`, código de cupón, categoría/grupo, fecha de publicación, URL del hilo. Y la forma de la redirección `/visit/` (302 directo a la tienda, o a un afiliado intermedio).
- [ ] **Step 3: Recortar** los HTML a lo necesario (< 300 KB cada uno) sin cambiar su estructura.
- [ ] **Step 4: Commit** `test(bot): Chollometro fixtures and key map`.

---

### Task 2: Parser de Chollometro

**Files:**
- Create: `bot/src/patobarato/sources/chollometro_parse.py`
- Modify: `bot/src/patobarato/models.py`
- Test: `bot/tests/test_chollometro_parse.py`

**Interfaces:**
- Produces (en `models.py`):

```python
@dataclass(frozen=True)
class ChollometroThread:
    thread_id: int
    title: str
    url: str                    # ficha del hilo en chollometro.com
    visit_url: str | None       # https://www.chollometro.com/visit/...
    merchant: str | None        # nombre que muestra Chollometro ("Amazon")
    price: Decimal | None
    previous_price: Decimal | None
    discount: int | None        # % que da Chollometro, si lo da
    temperature: float
    expired: bool
    sold_out: bool
    coupon: str | None
    categories: list[str]
    published_at: datetime      # aware, UTC
```

- Produces (en `chollometro_parse.py`): `parse_listing(html: str) -> list[ChollometroThread]`, `parse_thread_page(html: str) -> ChollometroThread | None`, `parse_euros(text: str | float | int | None) -> Decimal | None`.

- [ ] **Step 1: Tests** (valores concretos sacados de las fixtures de la Task 1):
  - `test_listing_parses_all_threads`: `len(parse_listing(nuevos)) == <n hilos de la fixture>`; los anuncios "Patrocinado" no aparecen.
  - `test_listing_thread_fields`: para el primer hilo, `thread_id`, `title`, `merchant`, `price`, `temperature`, `visit_url` iguales a los de la fixture; `published_at.tzinfo is not None`.
  - `test_thread_page_expired`: `parse_thread_page(expired).expired is True`; `parse_thread_page(active).expired is False`.
  - `test_thread_page_sold_out` (si hay fixture).
  - `test_parse_euros`: `"7,79€" → Decimal("7.79")`, `"1.299,00 €" → Decimal("1299.00")`, `"669€" → Decimal("669")`, `12.5 → Decimal("12.5")`, `None/""/"Gratis" → None`.
  - `test_garbage_html_returns_empty`: `parse_listing("<html></html>") == []`, `parse_thread_page("") is None`.
- [ ] **Step 2:** `cd bot && pytest tests/test_chollometro_parse.py -q`. Debe fallar con ImportError.
- [ ] **Step 3: Implementar** con `html.parser` de la biblioteca estándar (no añadir dependencias) más `json.loads` del JSON embebido. Un hilo con JSON malformado se omite con `logger.warning`, sin romper el resto.
- [ ] **Step 4:** Los tests pasan.
- [ ] **Step 5: Commit** `feat(bot): parse Chollometro threads`.

---

### Task 3: Cliente HTTP de Chollometro y resolución a tienda

**Files:**
- Create: `bot/src/patobarato/sources/chollometro_client.py`
- Modify: `bot/src/patobarato/parsing/extract.py`
- Test: `bot/tests/test_chollometro_client.py`, `bot/tests/test_extract.py` (añadir)

**Interfaces:**
- Consumes: `parse_listing`, `parse_thread_page` (Task 2); `UrlResolver.resolve(url, is_final=...)` (existente).
- Produces:

```python
class ChollometroBlocked(Exception): ...          # 403 o 429

class ChollometroClient:
    def __init__(self, http: httpx.AsyncClient, base_url: str = "https://www.chollometro.com") -> None: ...
    async def fetch_new(self) -> list[ChollometroThread]: ...            # GET /nuevos
    async def fetch_thread(self, url: str) -> ChollometroThread | None: ...

# parsing/extract.py (refactor de _store_links, que pasa a usarla)
@dataclass(frozen=True)
class StoreLink:
    store: Store
    product_id: str
    country: str
    canonical: str
async def resolve_store_link(url: str, resolver: UrlResolver, registry: StoreRegistry) -> StoreLink | None: ...
```

- [ ] **Step 1: Tests** con `httpx.MockTransport`:
  - `test_fetch_new_parses_fixture`: responde la fixture ⇒ misma lista que `parse_listing`; la petición lleva `User-Agent == USER_AGENT`.
  - `test_blocked_status_raises` parametrizado con 403 y 429 ⇒ `ChollometroBlocked`, en `fetch_new` y en `fetch_thread`.
  - `test_fetch_thread_404_returns_none`.
  - `test_resolve_store_link_from_visit` (en `test_extract.py`): `/visit/threadmain/1` → 302 → `https://www.amazon.es/dp/B0TEST1234?tag=otro-21` ⇒ `StoreLink(store=amazon, product_id="B0TEST1234", country="ES", canonical="https://www.amazon.es/dp/B0TEST1234")`.
  - `test_resolve_store_link_unknown_store_none`: redirige a `https://www.ejemplo.com/x` ⇒ `None`.
- [ ] **Step 2:** Los tests fallan.
- [ ] **Step 3: Implementar.** `USER_AGENT` es una constante con un UA de navegador estándar. El cliente no sigue redirecciones de `/visit/`: eso lo hace `UrlResolver`, que necesita la misma cabecera. Si el resolver no permite pasarla, añadir un parámetro `headers` opcional a `UrlResolver.__init__`. `_store_links` pasa a usar `resolve_store_link` sin cambiar su comportamiento: los tests existentes de `test_extract.py` siguen pasando.
- [ ] **Step 4:** `pytest tests/test_chollometro_client.py tests/test_extract.py tests/test_links.py -q` pasa.
- [ ] **Step 5: Commit** `feat(bot): Chollometro HTTP client and store link resolution`.

---

### Task 4: Migración y repositorio de seguimiento

**Files:**
- Create: `supabase/migrations/20261113000000_chollometro.sql`
- Modify: `bot/src/patobarato/models.py`, `bot/src/patobarato/storage/repository.py`, `bot/src/patobarato/storage/supabase_repo.py`
- Test: `bot/tests/test_repository.py`, `bot/tests/test_supabase_repo_rows.py` (añadir)

**Interfaces:**
- Produces:

```python
class ThreadState(StrEnum):
    WATCHING = "watching"     # aún no apto, se re-evalúa durante warm_hours
    QUALIFIED = "qualified"   # apto, esperando hueco (qualified_at fijado)
    PUBLISHED = "published"   # publicado; se vigila su fin
    ENDED = "ended"           # publicación marcada terminada
    SKIPPED = "skipped"       # descartado definitivamente (tienda desconocida, stale, mismatch, duplicado, sin afiliado)

@dataclass(frozen=True)
class TrackedThread:
    source_id: int
    thread_id: int
    url: str
    state: ThreadState
    temperature: float
    discount: int | None
    first_seen_at: datetime
    published_at: datetime          # de Chollometro
    qualified_at: datetime | None
    store_url: str | None           # resultado de /visit/ (se resuelve una sola vez)
    publication_id: int | None
    last_checked_at: datetime | None
    skip_reason: str | None = None
```

- Repository (Protocol + InMemory + Supabase):
  - `async def get_tracked_threads(self, source_id: int, thread_ids: list[int]) -> dict[int, TrackedThread]`
  - `async def save_tracked_thread(self, t: TrackedThread) -> None` (upsert por `(source_id, thread_id)`)
  - `async def list_tracked_threads(self, source_id: int, states: list[ThreadState]) -> list[TrackedThread]`
  - `async def count_publications_since(self, source_id: int, since: datetime, channel: PublicationChannel = "telegram") -> int` (publicaciones no draft cuyo `offer.source_id = source_id` y `published_at >= since`)
  - `async def set_publication_status(self, publication_id: int, status: PublicationStatus) -> None`

- Migración:
  - `create table chollometro_threads` con las columnas de `TrackedThread`, `primary key (source_id, thread_id)`, `source_id` FK a `sources`, `state` con check de los 5 valores, índice `(source_id, state)`, RLS activada y `revoke all ... from anon, authenticated`, como en `20261110010000_events.sql`.
  - `sources_type_check` = lista actual de `20261112000000_admin.sql` + `'chollometro'`.
  - `insert into sources (type, identifier, country, active, every_minutes, config, hashtags) values ('chollometro', 'chollometro-nuevos', 'ES', true, 5, '{"min_temperature": 50, "min_discount": 40, "max_per_hour": 10, "warm_hours": 24, "max_pages_per_run": 5}', '{}');`
  - `update sources set active = false where type = 'telegram_channel';`

- [ ] **Step 1: Tests** de InMemory:
  - guardar, leer y actualizar un `TrackedThread` (el upsert no duplica);
  - `list_tracked_threads` filtra por estado y por fuente;
  - `count_publications_since` cuenta solo las de esa fuente, ese canal y desde `since`, sin drafts;
  - `set_publication_status` hace que `get_last_publication(...).status == ENDED`.
  - Tests de filas Supabase en el estilo de `test_supabase_repo_rows.py`: datetimes en ISO y `state` como string.
- [ ] **Step 2:** Los tests fallan.
- [ ] **Step 3: Implementar.** `count_publications_since` en Supabase hace un join embebido: `publications.select("id, offers!inner(source_id)")...eq("offers.source_id", source_id).gte("published_at", ...)` con `count="exact"`.
- [ ] **Step 4:** Los tests pasan. Revisar el SQL a mano contra el esquema de `20261104000000_init.sql`.
- [ ] **Step 5: Commit** `feat(db): Chollometro thread tracking`.

---

### Task 5: `Pipeline.process_offer` público y sin Telegram

**Files:**
- Modify: `bot/src/patobarato/core/pipeline.py`, `bot/src/patobarato/models.py` (quitar `preview_photo`, `preview_url` y `attached_photo` de `SourceMessage`)
- Test: `bot/tests/test_pipeline.py`

**Interfaces:**
- Produces:

```python
@dataclass(frozen=True)
class OfferResult:
    status: OfferStatus
    offer_id: int | None
    publication_id: int | None

class Pipeline:
    def __init__(self, repo, resolver, publisher, settings, clock=..., sleep=..., monotonic=...,
                 publish_interval_seconds=..., *, registry, image_downloader=None,
                 price_fetch_timeout_seconds=...) -> None   # sin photo_provider
    async def process_offer(self, source_id: int, external_id: int, offer: ParsedOffer,
                            raw_text: str, detected_at: datetime) -> OfferResult
    async def create_draft(self, url: str, job_id: int) -> int   # sin cambios de comportamiento
```

- `process_offer` hace lo mismo que hoy `_process_offer`: `upsert_product`, `insert_offer` (si devuelve `None`, `OfferResult(SKIPPED_DUPLICATE, None, None)` sin escribir nada), comprobación de título, `decide()` con `channel="telegram"` y `_publish`. La foto sale solo de la tienda: `offer.image_url`, luego `store.find_image`, luego `image_downloader`. `_publish` devuelve también el id de la publicación (`insert_publication`).
- Se eliminan `submit`, `run`, `process`, `_queue`, `PhotoProvider`, `_get_photo` y el bloque `attached_photo`.

- [ ] **Step 1: Adaptar tests.** Los de `test_pipeline.py` que usaban `process(msg)` pasan a `process_offer(...)` con un `ParsedOffer` construido a mano. Borrar los de fotos de Telegram (preview/attached). Añadir:
  - `test_process_offer_returns_publication_id`: estado `PUBLISHED` y `publication_id` igual al de `repo.publications()[0]["id"]`.
  - `test_process_offer_same_external_id_twice`: la segunda llamada da `SKIPPED_DUPLICATE`, `offer_id is None` y no añade publicaciones.
  - `test_photo_comes_from_store_image`: el publicador recibe los bytes del `image_downloader` para `store.find_image`.
- [ ] **Step 2:** Los tests fallan.
- [ ] **Step 3: Implementar.**
- [ ] **Step 4:** `pytest -q` completo. `test_admin_jobs.py` y `test_admin_posts.py`, que usan `create_draft`, siguen pasando.
- [ ] **Step 5: Commit** `refactor(bot): public Pipeline.process_offer without Telegram photos`.

---

### Task 6: Reglas y runner `ChollometroSource`

**Files:**
- Create: `bot/src/patobarato/sources/chollometro_rules.py`, `bot/src/patobarato/sources/chollometro_source.py`
- Test: `bot/tests/test_chollometro_rules.py`, `bot/tests/test_chollometro_source.py`

**Interfaces:**
- Consumes: Tasks 2–5; `PostService.sync_post(publication_id)` y `WebRevalidator.revalidate()` (existentes, en `admin/`).
- Produces:

```python
# chollometro_rules.py
def discount_of(t: ChollometroThread) -> int | None            # t.discount o redondeo de (prev-price)/prev*100
def qualifies(t: ChollometroThread, min_temperature: float, min_discount: int) -> bool  # temp > min_temperature or discount >= min_discount
def rank_key(temperature: float, discount: int | None) -> tuple  # para sorted(): temp desc, discount desc (None = 0)
def reconcile_price(thread_price: Decimal, coupon: str | None, quote: PriceQuote | None
                    ) -> tuple[Decimal, Decimal | None] | None
    # (precio_a_publicar, previous_price_tienda) o None si hay que descartar (mismatch)

# chollometro_source.py
class ChollometroSource:
    type = "chollometro"
    def __init__(self, client: ChollometroClient, resolver: UrlResolver, registry: StoreRegistry,
                 repo: Repository, pipeline: Pipeline, posts: PostService, revalidator: WebRevalidator,
                 settings: Settings, clock: Callable[[], datetime]) -> None
    async def run(self, source: ApiSource) -> None
```

- **Orden de una ejecución** (`run`). El presupuesto `max_pages_per_run` se comparte entre los pasos 3–5:
  1. `fetch_new()`. Hilos de un comercio que no se parezca a ninguna tienda registrada (comparando `merchant` sin mayúsculas ni acentos con `store.name`/`store.id`) se ignoran sin guardar nada. El resto se cruza con `get_tracked_threads`. Un hilo nuevo se guarda como `WATCHING`. Se actualizan temperatura y descuento de los que siguen en `WATCHING`. Los de estado `QUALIFIED`, `PUBLISHED`, `ENDED` o `SKIPPED` no se reprocesan (Review Focus 1).
  2. Si un hilo publicado aparece en el listado con `expired`/`sold_out`, se termina (paso 6) sin gastar presupuesto.
  3. Se vigilan las publicaciones: `PUBLISHED` con `last_checked_at` más antiguo primero, solo dentro de `REPUBLISH_AFTER_DAYS` desde la publicación. Las que salen de esa ventana pasan a `ENDED` sin tocar el post. `fetch_thread` y, si está caducado/agotado, al paso 6.
  4. Se recalientan los `WATCHING` que ya no salen en el listado, dentro de `warm_hours`, más calientes primero, con `fetch_thread`. Los que salen de la ventana pasan a `SKIPPED` con `skip_reason="cold"`.
  5. Cada `WATCHING` que pasa `qualifies()` se resuelve: `resolve_store_link(visit_url)` una sola vez, guardando `store_url`. Si da `None`, pasa a `SKIPPED` con `"unknown_store"` (Review Focus 4). Si funciona, pasa a `QUALIFIED` con `qualified_at = now`.
  6. **Fin de oferta:** `set_publication_status(pid, ENDED)`, luego `posts.sync_post(pid)` y `revalidator.revalidate()`. Los errores de estas dos llamadas se registran pero no paran. El hilo pasa a `ENDED`.
  7. **Publicar:** `huecos = max_per_hour - count_publications_since(source.id, now - 60 min)`. Los `QUALIFIED` cuyo `qualified_at` es anterior a `now - stale_after_minutes` pasan a `SKIPPED` con `"stale"`. El resto se ordena con `rank_key` y se procesan hasta que no queden huecos:
     - Construir `ParsedOffer` con `asin=product_id`, el precio de `reconcile_price` (usando `store.fetch_price` con timeout de 5 s; si falla, `quote=None`), `coupon`, hashtags (categorías normalizadas + `source.hashtags`), y `canonical_url`/`product_url` de la `StoreLink`.
     - Llamar a `pipeline.process_offer(source.id, thread_id, offer, raw_text=json del hilo, detected_at=qualified_at)`.
     - `PUBLISHED` ⇒ el hilo pasa a `PUBLISHED` con su `publication_id` y se gasta un hueco. Cualquier otro estado ⇒ `SKIPPED` con `skip_reason=status.value`.
  - `ChollometroBlocked` en cualquier punto: se deja de pedir a Chollometro, se terminan los pasos 6–7 con lo ya guardado y se relanza la excepción al final, para que el scheduler la anote en `last_error` (Review Focus 5).
  - Config leída de `source.config` con los valores por defecto de Global Constraints.

- [ ] **Step 1: Tests de reglas:**
  - `qualifies`: (51°, sin descuento) ⇒ True; (50°, 39 %) ⇒ False; (5°, 40 %) ⇒ True.
  - `discount_of`: price 60, prev 100 ⇒ 40.
  - `rank_key` ordena (80, 10) > (60, 70) > (60, 40) > (60, None).
  - `reconcile_price`:
    - (20, None, quote 18) ⇒ (18, prev de la tienda)
    - (20, None, quote 25) ⇒ None
    - (20, "CODIGO", quote 25) ⇒ (20, None)
    - (20, None, None) ⇒ (20, None)
- [ ] **Step 2: Tests del runner** con `InMemoryRepository`, un `FakeClient` (listas y fichas programables, contador de peticiones), un `FakeResolver` y un Pipeline real con `FakePublisher` (patrón de `test_pipeline.py`). Reloj inyectado:
  - `test_hot_thread_published_once`: hilo Amazon de 60° ⇒ 1 publicación. El hilo queda en `PUBLISHED`.
  - `test_republished_thread_is_not_processed_twice`: dos `run` seguidos con el mismo listado ⇒ sigue habiendo 1 publicación y `resolve_store_link` se llamó 1 vez.
  - `test_cold_thread_warms_up_later`: 10° en la primera ejecución (sin publicación) y 55° en la segunda ⇒ publicado. `offer.detected_at` = hora de la segunda ejecución.
  - `test_discount_alone_qualifies`: 5° y 45 % ⇒ publicado.
  - `test_unregistered_merchant_ignored`: comercio "Carrefour" ⇒ no se guarda nada y 0 peticiones.
  - `test_cap_ten_per_hour_by_temperature`: 12 hilos aptos ⇒ se publican los 10 más calientes. Los 2 restantes siguen `QUALIFIED`. Si 31 min después no hay hueco, pasan a `SKIPPED` con `"stale"`.
  - `test_cap_counts_publications_from_repo`: 10 publicaciones previas de la fuente en los últimos 60 min, insertadas directamente en el repo ⇒ 0 publicaciones nuevas.
  - `test_same_product_two_threads_dedup_by_decide`: dos hilos al mismo ASIN y al mismo precio ⇒ 1 publicación y el segundo hilo en `SKIPPED` con `"skipped_duplicate"`.
  - `test_visit_to_unknown_store_is_skipped_once`.
  - `test_expired_in_listing_ends_publication`: hilo publicado que aparece `expired` ⇒ publicación `ENDED`, `sync_post` llamado 1 vez, `revalidate` llamado 1 vez, hilo `ENDED`. En la siguiente ejecución no hay más llamadas.
  - `test_expired_via_thread_page`: fuera del listado, la ficha dice `sold_out` ⇒ igual que el anterior.
  - `test_page_budget_respected`: con `max_pages_per_run=5` y 20 hilos por revisar ⇒ como mucho 5 llamadas a `fetch_thread` más resoluciones de `/visit/`.
  - `test_blocked_stops_run_and_keeps_state`: `fetch_thread` lanza `ChollometroBlocked` ⇒ `run` relanza y los hilos nuevos del listado quedan guardados.
  - `test_image_never_from_chollometro`: la foto publicada es la de `store.find_image`, no ninguna URL de `static.chollometro.com`.
  - `test_coupon_and_hashtags_in_offer`: el `ParsedOffer` lleva el cupón y `#electronica`.
- [ ] **Step 3:** Los tests fallan.
- [ ] **Step 4: Implementar** `chollometro_rules.py` y `chollometro_source.py`.
- [ ] **Step 5:** `pytest tests/test_chollometro_rules.py tests/test_chollometro_source.py -q` pasa.
- [ ] **Step 6: Commit** `feat(bot): Chollometro deal source`.

---

### Task 7: Conectar la fuente y retirar la lectura de Telegram

**Files:**
- Modify: `bot/src/patobarato/main.py`, `bot/src/patobarato/config.py`, `bot/.env.example`, `bot/README.md`, `README.md` (raíz, si menciona los canales)
- Delete: `bot/src/patobarato/sources/telegram_listener.py`, `bot/tests/test_telegram_listener.py`, `bot/tests/test_listener_sources.py`
- Modify: `bot/src/patobarato/storage/repository.py` y `supabase_repo.py`. Quitar `sync_sources` y sus tests si ya nadie lo usa.
- Test: `bot/tests/test_main.py`, `bot/tests/test_config.py`

**Interfaces:**
- `build_runners(registry, repo, settings, clock, http, *, pipeline, posts, revalidator, resolver)` añade `ChollometroSource(ChollometroClient(http), resolver, registry, repo, pipeline, posts, revalidator, settings, clock)`. Esta fuente siempre está disponible, porque no necesita credenciales.
- `run(settings)`: solo arranca el cliente **bot** (`BOT_SESSION_PATH`). Desaparecen la cuenta lectora, `TelegramListener`, `refresh`, `reader` y `pipeline.run()` de `_supervise`. Quedan `scheduler`, `admin_jobs` y `bot`.
- CLI: `choices=["run", "backfill-images", "promos"]`. Se elimina `login` y `LOGIN_FIRST_MESSAGE`.
- `Settings`: se eliminan `telegram_session_path` y `sources_refresh_seconds`. Se **mantienen** `telegram_api_id` y `telegram_api_hash`, porque Telethon los necesita también para el bot. Una variable de entorno sobrante no rompe nada (`extra="ignore"`).

- [ ] **Step 1: Tests:**
  - `test_build_runners_includes_chollometro`: entre los `type` de los runners está `"chollometro"`, también sin credenciales de AliExpress ni de Awin.
  - `test_cli_rejects_login`: `main(["login"])` ⇒ `SystemExit` de argparse.
  - Ajustar `test_main.py` a la nueva firma de `build_runners` y borrar los tests de `login`.
- [ ] **Step 2:** Los tests fallan.
- [ ] **Step 3: Implementar.** Un `grep -rn "telethon\|telegram_listener\|reader" bot/src` solo puede encontrar `telegram_publisher.py` y el cliente bot de `main.py`.
- [ ] **Step 4: Documentación.**
  - `bot/README.md`: quitar «Credenciales de Telegram → api_id» solo en lo que toca a la cuenta lectora (`api_id`/`api_hash` siguen siendo necesarios para el bot), «Sesiones y arranque» (login) y la sección 5 «Canales de origen».
  - Añadir la sección «Chollometro»: qué lee, filtro, límite, fin de oferta, cómo cambiar los umbrales (`update sources set config = jsonb_set(config, '{min_temperature}', '60') where type = 'chollometro';`), cómo pausarla, y el aviso de que `robots.txt` prohíbe `/visit/` (riesgo de bloqueo asumido; un 403/429 aparece en `last_error`).
  - `.env.example`: quitar `TELEGRAM_SESSION_PATH` y `SOURCES_REFRESH_SECONDS`.
- [ ] **Step 5:** `cd bot && pytest -q` todo en verde. `python -m patobarato --help` muestra `{run,backfill-images,promos}`.
- [ ] **Step 6: Commit** `feat(bot): replace Telegram channel reader with Chollometro source`.

---

### Task 8: Verificación real (manual)

- [ ] Aplicar la migración en un proyecto de pruebas (`npx supabase db push`) y comprobar que existen `chollometro_threads` y la fila `chollometro-nuevos`, y que las filas `telegram_channel` quedan con `active = false`.
- [ ] Con `TARGET_CHANNEL` apuntando a un canal de pruebas, `docker compose up` (o `python -m patobarato run`) durante unos 30 minutos. En el log tienen que aparecer ejecuciones de `chollometro` sin `last_error`, publicaciones con foto de la tienda y como mucho 10 por hora. En `chollometro_threads` tienen que aparecer filas en los estados esperados.
- [ ] Forzar el fin de una oferta: poner a mano `state = 'published'` en un hilo ya caducado en Chollometro, con su `publication_id`. En la siguiente ejecución el post tiene que mostrar «❌ OFERTA TERMINADA».
