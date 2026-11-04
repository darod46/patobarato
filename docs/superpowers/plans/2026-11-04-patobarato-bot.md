# PatoBarato Bot — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bot que lee canales de ofertas de Telegram, guarda las ofertas de Amazon España en Supabase y las publica en @patobarato con el tag `patobarato-21`, sin duplicar.

**Architecture:** Un único proceso Python asíncrono:
- Una cuenta de usuario de Telegram (Telethon) escucha los canales de `sources` y convierte cada mensaje en un `SourceMessage`.
- Un pipeline con una cola única extrae las ofertas, las guarda, decide si publicar (función pura) y publica con un cliente bot de Telethon.
- La persistencia va detrás de un `Repository` (Protocol): `SupabaseRepository` en producción e `InMemoryRepository` en los tests.

**Tech Stack:** Python 3.12, Telethon, supabase-py, httpx, pydantic-settings, pytest + pytest-asyncio, Docker / docker compose, Supabase CLI.

**Spec:** `docs/superpowers/specs/2026-11-04-patobarato-bot-design.md`

## Global Constraints

- Enlace publicado siempre: `https://www.amazon.es/dp/{ASIN}?tag=patobarato-21`, sin ningún otro parámetro.
- País en todas las tablas; v1 solo `ES` (mapa de dominios: `amazon.es` → `ES`; el resto de dominios de Amazon se ignora).
- Duplicados: si la última publicación del producto y país tiene **menos de 7 días**, solo se publica si `precio < published_price`. Con **7 días o más**, se publica siempre. Se compara el **precio sin cupón**.
- Sin precio → `skipped_no_price`. Más de **30 min** en cola → `skipped_stale`.
- Estados de oferta: `pending`, `published`, `skipped_duplicate`, `skipped_no_price`, `skipped_stale`, `publish_failed`. Estados de publicación: `active`, `ended`.
- Pie de foto en HTML de Telegram, como máximo **1024** caracteres. Botón inline `🛒 Ver en Amazon`. No se muestra la hora del precio.
- Foto: vista previa de Telegram del mensaje de origen, o si no, `messages.GetWebPagePreviewRequest` del enlace de Amazon. **Nunca** se descargan páginas de amazon.es. Sin foto → mensaje de texto con el botón.
- Solo mensajes nuevos: ni historial ni ediciones.
- Moneda `EUR`. Precios como `Decimal`, nunca `float`.
- Código en `src/patobarato/`, tests en `tests/`. Identificadores en inglés; textos al usuario en español.

## Review Focus

1. Dos canales publican la misma oferta casi a la vez → un solo mensaje en @patobarato (Task 8: `test_same_offer_from_two_sources_publishes_once`).
2. Enlace con el tag de otro afiliado y parámetros de seguimiento (`?tag=otro-21&ref=...&th=1`), o en formato `/gp/product/ASIN` → el enlace final es exactamente el canónico con nuestro tag (Task 2: `test_affiliate_url_replaces_foreign_tag`, `test_asin_from_gp_product_url`).
3. Precios en formatos españoles variados (`1.299,99 €`, `1299€`, `29.99€`, `29,99€`), un "Antes" que no es mayor que el precio, o un texto con un porcentaje y el precio → se lee el precio correcto y se descarta el precio anterior incoherente (Task 3).
4. Acortador que falla, se agota el tiempo o lleva fuera de Amazon → se ignora ese enlace sin tumbar el bot (Task 2: `test_resolve_failure_returns_none`; Task 8: `test_listener_error_does_not_stop_worker`).
5. Título largo o con `<`, `&` o `>` → el pie de foto está escapado y no pasa de 1024 caracteres (Task 6).

---

## Estructura de ficheros

```
pyproject.toml, .gitignore, .env.example, Dockerfile, docker-compose.yml, README.md
supabase/migrations/20261104000000_init.sql
src/patobarato/
  __init__.py
  config.py            # Settings (.env)
  models.py            # dataclasses y enums compartidos
  parsing/links.py     # enlaces, ASIN, país, URL de afiliado, resolver acortadores
  parsing/text.py      # precio, precio anterior, cupón, título, hashtags
  parsing/extract.py   # SourceMessage -> list[ParsedOffer]
  core/decision.py     # decide()
  core/pipeline.py     # cola + orquestación
  publishing/format.py # pie de foto HTML
  publishing/telegram_publisher.py
  storage/repository.py   # Protocol + InMemoryRepository
  storage/supabase_repo.py
  sources/telegram_listener.py
  main.py              # `python -m patobarato run|login`
tests/ (un fichero por módulo, con el mismo nombre test_<módulo>.py)
```

---

### Task 1: Esqueleto del proyecto y configuración

**Files:**
- Create: `pyproject.toml`, `.gitignore`, `.env.example`, `src/patobarato/__init__.py`, `src/patobarato/config.py`, `src/patobarato/models.py`
- Test: `tests/test_config.py`

**Interfaces:**
- Produces:
  - `Settings` (pydantic-settings, lee `.env`) con los campos `telegram_api_id: int`, `telegram_api_hash: str`, `telegram_session_path: str = "data/reader.session"`, `telegram_bot_token: str`, `target_channel: str = "@patobarato"`, `supabase_url: str`, `supabase_service_key: str`, `affiliate_tag: str = "patobarato-21"`, `default_country: str = "ES"`, `republish_after_days: int = 7`, `stale_after_minutes: int = 30`, `sources_refresh_seconds: int = 300`, `http_timeout_seconds: float = 10.0`. Función `get_settings() -> Settings`.
  - `models.py`:
    - `class OfferStatus(StrEnum)`: los 6 estados de las Global Constraints.
    - `class PublicationStatus(StrEnum)`: `ACTIVE="active"`, `ENDED="ended"`.
    - `@dataclass(frozen=True) class SourceMessage`: `source_id: int`, `message_id: int`, `text: str`, `urls: list[str]`, `hashtags: list[str]`, `received_at: datetime`, `preview_photo: Callable[[], Awaitable[bytes | None]] | None = None`.
    - `@dataclass(frozen=True) class ParsedOffer`: `asin: str`, `country: str`, `store: str` (`"amazon"`), `title: str`, `price: Decimal | None`, `previous_price: Decimal | None`, `coupon: str | None`, `hashtags: list[str]`, `canonical_url: str` (sin tag).
    - `@dataclass(frozen=True) class Source`: `id: int`, `identifier: str`, `country: str`.
    - `@dataclass(frozen=True) class LastPublication`: `published_price: Decimal`, `published_at: datetime`, `status: PublicationStatus`.

- [ ] **Step 1:** Ejecutar `git init` y crear `.gitignore` con `.env`, `data/`, `.superpowers/`, `__pycache__/`, `.venv/`, `*.session`. Crear `pyproject.toml`:
  - Paquete `patobarato` en el layout `src/`.
  - Dependencias: `telethon`, `supabase`, `httpx`, `pydantic-settings`.
  - Dependencias de desarrollo: `pytest`, `pytest-asyncio` (`asyncio_mode = "auto"`).
  - `requires-python = ">=3.12"`.
  - Crear el venv: `python -m venv .venv` y `.venv/Scripts/pip install -e .[dev]`.
- [ ] **Step 2: Escribir el test que falla** `tests/test_config.py::test_settings_defaults_and_env`: con `monkeypatch.setenv` de los campos obligatorios, `Settings()` devuelve `affiliate_tag == "patobarato-21"`, `default_country == "ES"`, `republish_after_days == 7` y `stale_after_minutes == 30`, y `telegram_api_id` es un `int`.
- [ ] **Step 3:** Ejecutar `pytest tests/test_config.py -v` → FAIL (ImportError).
- [ ] **Step 4:** Implementar `config.py` y `models.py` según el bloque Interfaces. Crear `.env.example` con todas las claves, vacías o con su valor por defecto.
- [ ] **Step 5:** Ejecutar `pytest -v` → PASS.
- [ ] **Step 6:** Commit con `chore: project skeleton, settings and models`.

---

### Task 2: Enlaces de Amazon (ASIN, país, afiliado, acortadores)

**Files:**
- Create: `src/patobarato/parsing/__init__.py`, `src/patobarato/parsing/links.py`
- Test: `tests/test_links.py`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `AMAZON_DOMAINS: dict[str, str] = {"amazon.es": "ES"}`.
  - `SHORTENER_HINT_DOMAINS = {"amzn.to", "amzn.eu", "a.co"}`.
  - `is_amazon_url(url: str) -> bool`: el host termina en una clave de `AMAZON_DOMAINS` o en cualquier `amazon.<tld>`.
  - `country_from_url(url: str) -> str | None`: `None` si el dominio de Amazon no está en el mapa (p. ej. `amazon.com`).
  - `asin_from_url(url: str) -> str | None`: acepta `/dp/ASIN`, `/gp/product/ASIN`, `/gp/aw/d/ASIN`, `/exec/obidos/ASIN/...` y `/o/ASIN`. El ASIN son 10 caracteres `[A-Z0-9]`, y se devuelve en mayúsculas.
  - `build_affiliate_url(asin: str, country: str, tag: str) -> str`: con `ES` devuelve `https://www.amazon.es/dp/{asin}?tag={tag}`. Con un país que no está en el mapa, `ValueError`.
  - `canonical_url(asin: str, country: str) -> str`: lo mismo, sin `?tag`.
  - `class UrlResolver`: `__init__(self, client: httpx.AsyncClient)`, `async resolve(self, url: str) -> str | None`.
    - Si el URL ya es de Amazon, lo devuelve sin hacer ninguna petición.
    - Si no, sigue las redirecciones (como máximo 10) con `GET`, pero **sin descargar el cuerpo cuando el destino es de Amazon**. Usa `follow_redirects=False` y recorre las cabeceras `Location` a mano, parándose en cuanto el host sea de Amazon.
    - Devuelve el URL final de Amazon, o `None` si acaba fuera de Amazon, si hay un error de red o si se agota el tiempo.

- [ ] **Step 1: Escribir los tests que fallan** en `tests/test_links.py`:
  - `test_asin_from_dp_url`: `asin_from_url("https://www.amazon.es/Sony-WH-1000XM5/dp/B09XS7JWHH/ref=sr_1_1?th=1") == "B09XS7JWHH"`.
  - `test_asin_from_gp_product_url`: `asin_from_url("https://amazon.es/gp/product/b09xs7jwhh?psc=1") == "B09XS7JWHH"`.
  - `test_asin_none_for_search_url`: `asin_from_url("https://www.amazon.es/s?k=auriculares") is None`.
  - `test_country_es_and_unknown`: `country_from_url("https://www.amazon.es/dp/X") == "ES"` y `country_from_url("https://www.amazon.com/dp/X") is None`.
  - `test_affiliate_url_replaces_foreign_tag`: el ASIN de `"https://www.amazon.es/dp/B09XS7JWHH?tag=otro-21&ref=abc&th=1"` pasado por `build_affiliate_url(..., "ES", "patobarato-21")` da `"https://www.amazon.es/dp/B09XS7JWHH?tag=patobarato-21"`.
  - `test_resolve_follows_shortener`: con `httpx.MockTransport`, `https://amzn.to/abc` responde 301 → `https://www.amazon.es/dp/B09XS7JWHH?tag=x-21`, y `resolve` devuelve ese URL. Hay que comprobar que **no** se pidió ningún URL de amazon.es al transporte.
  - `test_resolve_bitly_to_non_amazon_returns_none`: `bit.ly/x` → 302 → `https://example.com/` → 200 da `None`.
  - `test_resolve_failure_returns_none`: si el transporte lanza `httpx.ConnectTimeout`, da `None`.
- [ ] **Step 2:** Ejecutar `pytest tests/test_links.py -v` → FAIL.
- [ ] **Step 3:** Implementar `links.py` según el bloque Interfaces.
- [ ] **Step 4:** Ejecutar `pytest tests/test_links.py -v` → PASS.
- [ ] **Step 5:** Commit con `feat: amazon link parsing, affiliate urls and shortener resolver`.

---

### Task 3: Análisis de texto (precio, anterior, cupón, título, hashtags)

**Files:**
- Create: `src/patobarato/parsing/text.py`
- Test: `tests/test_text.py`

**Interfaces:**
- Produces:
  - `@dataclass(frozen=True) class PriceInfo`: `price: Decimal | None`, `previous_price: Decimal | None`, `coupon: str | None`.
  - `parse_amount(raw: str) -> Decimal | None`. Reglas:
    - `"1.299,99"` → `1299.99`; `"1299"` → `1299`; `"29.99"` → `29.99`; `"29,99"` → `29.99`; `"1.299"` → `1299`.
    - Un punto seguido de exactamente 3 dígitos y sin coma es separador de miles.
  - `parse_prices(text: str) -> PriceInfo`:
    - **Precio anterior:** el importe en una línea o fragmento que contenga `antes`, `pvp`, `precio anterior`, `precio habitual`, `era` o `~~...~~` (sin distinguir mayúsculas ni tildes).
    - **Precio:** el primer importe con `€` o `EUR` que no sea el precio anterior. Si hay `precio`, `ahora` u `oferta` delante de un importe, ese tiene prioridad.
    - Si `previous_price <= price`, entonces `previous_price = None`.
    - Los importes que van seguidos de `%` no son precios.
    - **Cupón:** tras `cupón` o `cupon` (sin distinguir mayúsculas), lo siguiente:
      - un código (`[A-Z0-9]{4,}`) entre `:` y fin de palabra, o entre backticks;
      - o, si no hay código, el texto descriptivo corto (p. ej. `"5 € de descuento"` o `"marca la casilla"`), recortado a 60 caracteres.
  - `parse_title(text: str) -> str`: la primera línea no vacía después de quitar URLs, importes con €, emojis al principio y fórmulas tipo `🔥 OFERTA:`. Recortada a 200 caracteres. Si queda vacía, devuelve `""`.
  - `parse_hashtags(text: str) -> list[str]`: los `#palabra` del texto, sin `#`, en minúsculas y sin repetir, en orden de aparición.

- [ ] **Step 1: Escribir los tests que fallan** (fixtures inventadas hasta tener mensajes reales, ver la Task 11):
  - `test_parse_amount_formats`: parametrizado con los 5 casos de arriba.
  - `test_price_and_previous`: `"🔥 Sony WH-1000XM5\n✅ Ahora: 249,99€\n❌ Antes: 419,99€\nhttps://amzn.to/x"` → `PriceInfo(Decimal("249.99"), Decimal("419.99"), None)`.
  - `test_pvp_thousands`: `"Portátil Lenovo 1.099€ (PVP 1.299,00 €)"` → precio `1099` y anterior `1299.00`.
  - `test_percentage_not_price`: `"-40% Auriculares a 29,99 €"` → precio `29.99`.
  - `test_incoherent_previous_dropped`: `"Precio: 30€ Antes: 25€"` → `previous_price is None`.
  - `test_no_price`: `"Mirad esta maravilla https://amzn.to/x"` → `price is None`.
  - `test_coupon_code`: `"Cupón: SONY10"` → `coupon == "SONY10"`.
  - `test_coupon_description`: `"Aplica el cupón de 5 € en la página"` → `coupon` contiene `"5 €"`.
  - `test_title_strips_noise`: `"🔥🔥 Auriculares Sony WH-1000XM5 a 249,99€ https://amzn.to/x\nmás texto"` → `"Auriculares Sony WH-1000XM5 a"` o una variante sin el precio ni el URL. La aserción es `"Sony WH-1000XM5" in title and "€" not in title and "http" not in title`.
  - `test_hashtags`: `"#Auriculares #sony #auriculares"` → `["auriculares", "sony"]`.
- [ ] **Step 2:** Ejecutar `pytest tests/test_text.py -v` → FAIL.
- [ ] **Step 3:** Implementar `text.py`. Normalizar las tildes con `unicodedata` para buscar las palabras clave.
- [ ] **Step 4:** Ejecutar `pytest tests/test_text.py -v` → PASS.
- [ ] **Step 5:** Commit con `feat: price, coupon, title and hashtag parsing`.

---

### Task 4: Extracción de ofertas de un mensaje

**Files:**
- Create: `src/patobarato/parsing/extract.py`
- Test: `tests/test_extract.py`

**Interfaces:**
- Consumes: `SourceMessage`, `ParsedOffer` (Task 1); `UrlResolver`, `asin_from_url`, `country_from_url`, `canonical_url` (Task 2); `parse_prices`, `parse_title`, `parse_hashtags` (Task 3).
- Produces: `async extract_offers(msg: SourceMessage, resolver: UrlResolver) -> list[ParsedOffer]`.
  1. Resuelve cada URL de `msg.urls`, se queda con los de Amazon con un ASIN y un país conocido, y quita los ASIN repetidos manteniendo el orden.
  2. Si hay 0 → `[]`.
  3. Si hay 1 → una oferta analizando el texto completo. Los hashtags son `msg.hashtags` más `parse_hashtags(text)`, sin repetir.
  4. Si hay N > 1:
     - Parte el texto en bloques separados por líneas en blanco.
     - Si hay exactamente N bloques con un enlace cada uno y cada bloque tiene precio, sale una oferta por bloque.
     - Si no, sale solo la primera oferta, con el texto completo.
     - Para asociar URL y bloque: el URL (o su forma acortada original) aparece en el texto del bloque.

- [ ] **Step 1: Escribir los tests que fallan** con un `UrlResolver` sobre `MockTransport`:
  - `test_single_offer`: texto con un `amzn.to` que resuelve a `B09XS7JWHH` → 1 oferta con `asin="B09XS7JWHH"`, `country="ES"`, `price=Decimal("249.99")`, `canonical_url="https://www.amazon.es/dp/B09XS7JWHH"`.
  - `test_non_amazon_message_ignored`: solo `https://example.com` → `[]`.
  - `test_amazon_com_ignored`: `https://www.amazon.com/dp/B09XS7JWHH` → `[]`.
  - `test_multi_product_split`: dos bloques separados por una línea en blanco, cada uno con su enlace y su precio → 2 ofertas, cada una con su propio precio.
  - `test_multi_product_unsplittable_takes_first`: dos enlaces en un solo bloque → 1 oferta con el primer ASIN.
  - `test_url_from_button_only`: `text` sin URL y `urls=["https://amzn.to/b"]` → 1 oferta.
- [ ] **Step 2:** Ejecutar `pytest tests/test_extract.py -v` → FAIL.
- [ ] **Step 3:** Implementar `extract.py`.
- [ ] **Step 4:** Ejecutar `pytest tests/test_extract.py -v` → PASS.
- [ ] **Step 5:** Commit con `feat: extract offers from source messages`.

---

### Task 5: Decisión de publicar

**Files:**
- Create: `src/patobarato/core/__init__.py`, `src/patobarato/core/decision.py`
- Test: `tests/test_decision.py`

**Interfaces:**
- Consumes: `OfferStatus`, `LastPublication`, `PublicationStatus` (Task 1).
- Produces: `decide(price: Decimal | None, detected_at: datetime, last: LastPublication | None, now: datetime, republish_after: timedelta, stale_after: timedelta) -> OfferStatus`. Devuelve `PUBLISHED` cuando hay que publicar, o el estado `skipped_*` correspondiente. Orden de evaluación:
  1. Sin precio → `SKIPPED_NO_PRICE`.
  2. `now - detected_at > stale_after` → `SKIPPED_STALE`.
  3. `last is None` o `last.status == ENDED` → `PUBLISHED`.
  4. `now - last.published_at >= republish_after` → `PUBLISHED`.
  5. `price < last.published_price` → `PUBLISHED`.
  6. En cualquier otro caso → `SKIPPED_DUPLICATE`.

- [ ] **Step 1: Escribir los tests que fallan** (`R=timedelta(days=7)`, `S=timedelta(minutes=30)`):
  - `test_no_price`
  - `test_first_time`
  - `test_same_price_within_window_is_duplicate`: hace 6 días y 23 horas, mismo precio → `SKIPPED_DUPLICATE`.
  - `test_higher_price_within_window_is_duplicate`
  - `test_lower_by_one_cent_publishes`
  - `test_exactly_seven_days_publishes`: misma fecha menos 7 días exactos y mismo precio → `PUBLISHED`.
  - `test_after_window_higher_price_publishes`
  - `test_ended_publishes`
  - `test_stale_31_minutes`: `SKIPPED_STALE`; con 30 minutos exactos → no está caducada.
  - `test_no_price_wins_over_stale`
- [ ] **Step 2:** Ejecutar `pytest tests/test_decision.py -v` → FAIL.
- [ ] **Step 3:** Implementar `decide`.
- [ ] **Step 4:** Ejecutar `pytest tests/test_decision.py -v` → PASS.
- [ ] **Step 5:** Commit con `feat: publish decision rules`.

---

### Task 6: Formato del mensaje

**Files:**
- Create: `src/patobarato/publishing/__init__.py`, `src/patobarato/publishing/format.py`
- Test: `tests/test_format.py`

**Interfaces:**
- Consumes: `ParsedOffer` (Task 1).
- Produces:
  - `format_price(value: Decimal) -> str`: formato español, `Decimal("1299.9")` → `"1.299,90"`.
  - `discount_percent(price: Decimal, previous: Decimal) -> int`: redondeo al entero más cercano.
  - `format_caption(offer: ParsedOffer, max_len: int = 1024) -> str`. Texto exacto, una línea por elemento y omitiendo las líneas opcionales:
    ```
    🦆 <b>{título}</b>
    ✅ Precio: <b>{precio} €</b>
    ❌ Antes: <s>{anterior} €</s> (-{dto}%)
    🎟️ Cupón: <code>{cupón}</code>

    #{tag1} #{tag2}
    ```
    - Hay una línea en blanco antes de los hashtags solo si los hay.
    - Todo el texto variable se escapa con `html.escape`.
    - Si el resultado pasa de `max_len`, se recorta **solo el título** (por la versión sin escapar, añadiendo `…`) hasta que quepa.
    - Los hashtags se normalizan a `[a-z0-9_áéíóúñü]`.
  - `BUTTON_TEXT = "🛒 Ver en Amazon"`.

- [ ] **Step 1: Escribir los tests que fallan:**
  - `test_full_caption`: oferta con título `"Sony WH-1000XM5"`, precio `249.99`, anterior `419.99`, cupón `"SONY10"` y hashtags `["auriculares","sony"]` → igual a la cadena esperada exacta, con `(-40%)`.
  - `test_minimal_caption`: sin anterior, sin cupón y sin hashtags → exactamente 2 líneas.
  - `test_html_escaped`: título `"Cable <USB> & más"` → contiene `"Cable &lt;USB&gt; &amp; más"`.
  - `test_long_title_trimmed`: título de 2000 caracteres → `len(caption) <= 1024`, la línea de precio sigue completa y el título termina en `…`.
  - `test_format_price_thousands`: `format_price(Decimal("1299.9")) == "1.299,90"`.
- [ ] **Step 2:** Ejecutar `pytest tests/test_format.py -v` → FAIL.
- [ ] **Step 3:** Implementar `format.py`.
- [ ] **Step 4:** Ejecutar `pytest tests/test_format.py -v` → PASS.
- [ ] **Step 5:** Commit con `feat: telegram caption formatting`.

---

### Task 7: Esquema de Supabase y repositorios

**Files:**
- Create: `supabase/migrations/20261104000000_init.sql`, `src/patobarato/storage/__init__.py`, `src/patobarato/storage/repository.py`, `src/patobarato/storage/supabase_repo.py`
- Test: `tests/test_repository.py`, `tests/test_supabase_repo.py` (integración; se omite si no está definido `SUPABASE_TEST_URL`)

**Interfaces:**
- Consumes: `Source`, `ParsedOffer`, `OfferStatus`, `LastPublication`, `PublicationStatus` (Task 1).
- Produces, `class Repository(Protocol)`, todo `async`:
  - `get_active_sources() -> list[Source]`
  - `upsert_product(offer: ParsedOffer) -> int`: hace upsert por `(store, country, asin)`, actualiza el título y `updated_at`, y devuelve `products.id`.
  - `insert_offer(product_id: int, source_id: int, source_message_id: int, offer: ParsedOffer, raw_text: str, detected_at: datetime) -> int | None`: inserta con `status='pending'`. Devuelve `None` si choca con la clave única `(source_id, source_message_id, product_id)`.
  - `set_offer_status(offer_id: int, status: OfferStatus) -> None`
  - `get_last_publication(product_id: int, country: str) -> LastPublication | None`: la de `published_at` más reciente.
  - `insert_publication(offer_id: int, product_id: int, country: str, chat_id: int, message_id: int, published_price: Decimal, affiliate_url: str, published_at: datetime) -> int`
- `InMemoryRepository(Repository)` para tests, en `repository.py`, con `add_source(identifier, country="ES") -> Source`.
- `SupabaseRepository(client: supabase.Client)` en `supabase_repo.py`. Llama al cliente síncrono con `asyncio.to_thread`. La colisión de unicidad se detecta por el código `23505`.
- SQL según la sección 6 del spec:
  - Tablas `sources`, `products`, `offers` y `publications`, con `bigint generated always as identity`.
  - `country char(2) not null default 'ES'` en todas.
  - `numeric(10,2)` para los precios y `timestamptz default now()`.
  - Restricciones `check` con los estados.
  - Índice `publications(product_id, country, published_at desc)`.
  - `alter table ... enable row level security` en las 4 tablas, sin políticas.
  - Columna `sources.invite_link text null`.

- [ ] **Step 1: Escribir los tests que fallan** en `tests/test_repository.py`, contra `InMemoryRepository`:
  - `test_upsert_product_idempotent`: dos upserts con el mismo ASIN y país → mismo id.
  - `test_insert_offer_duplicate_returns_none`
  - `test_last_publication_is_most_recent`
  - `test_inactive_sources_excluded`
- [ ] **Step 2:** Ejecutar `pytest tests/test_repository.py -v` → FAIL.
- [ ] **Step 3:** Implementar el Protocol, `InMemoryRepository`, el SQL de la migración y `SupabaseRepository`. Escribir `tests/test_supabase_repo.py` con los mismos 4 casos contra Supabase real, marcados con `pytest.mark.skipif(not os.getenv("SUPABASE_TEST_URL"))`.
- [ ] **Step 4:** Ejecutar `pytest -v` → PASS (el de integración sale como omitido).
- [ ] **Step 5:** Commit con `feat: database schema and repositories`.

---

### Task 8: Pipeline (cola y orquestación)

**Files:**
- Create: `src/patobarato/core/pipeline.py`
- Test: `tests/test_pipeline.py`

**Interfaces:**
- Consumes: `extract_offers` (Task 4), `decide` (Task 5), `format_caption` (Task 6), `Repository` (Task 7), `build_affiliate_url` (Task 2), `Settings` (Task 1).
- Produces:
  - `class Publisher(Protocol)`: `async publish(caption: str, button_url: str, photo: bytes | None) -> tuple[int, int]` devuelve `(chat_id, message_id)` y lanza una excepción si falla del todo.
  - `PhotoProvider = Callable[[SourceMessage, str], Awaitable[bytes | None]]`: recibe el mensaje y el URL canónico de Amazon.
  - `class Pipeline`:
    - `__init__(self, repo, resolver, publisher, photo_provider, settings, clock: Callable[[], datetime] = utcnow)`.
    - `async submit(self, msg: SourceMessage) -> None`: lo encola.
    - `async run(self) -> None`: worker único que no termina nunca.
    - `async process(self, msg: SourceMessage) -> list[OfferStatus]`: procesa un mensaje, lo usan los tests y el worker.
  - `process`, por cada `ParsedOffer`:
    1. `upsert_product`.
    2. `insert_offer`; si devuelve `None`, se salta.
    3. `decide(...)` con `detected_at=msg.received_at`.
    4. Si sale `PUBLISHED`: foto (`photo_provider`, cuya excepción cuenta como `None`) → `publish` → `insert_publication` → `set_offer_status(PUBLISHED)`.
    5. Si `publish` lanza una excepción, la oferta queda como `PUBLISH_FAILED` y se escribe en el log.
    6. Si sale otro estado, `set_offer_status`.
  - En `run`, una excepción en `process` se registra en el log y el worker sigue.

- [ ] **Step 1: Escribir los tests que fallan**, con `InMemoryRepository`, un `FakePublisher` que guarda las llamadas, un resolver sobre `MockTransport` y un reloj fijo:
  - `test_new_offer_published_with_affiliate_url`: `button_url == "https://www.amazon.es/dp/B09XS7JWHH?tag=patobarato-21"`, se crea la publicación y el estado queda `published`.
  - `test_same_offer_from_two_sources_publishes_once`: dos `SourceMessage` de fuentes distintas, mismo ASIN y precio, enviados con `submit` seguidos y procesados por `run` → 1 llamada a `publish`; la segunda oferta queda `skipped_duplicate`.
  - `test_cheaper_republishes`
  - `test_no_price_not_published`
  - `test_stale_not_published`: `received_at` hace 31 minutos.
  - `test_publish_failure_marks_failed`
  - `test_photo_provider_error_publishes_without_photo`
  - `test_listener_error_does_not_stop_worker`: el primer mensaje hace fallar `extract` (el resolver lanza una excepción) y el segundo se publica igualmente.
- [ ] **Step 2:** Ejecutar `pytest tests/test_pipeline.py -v` → FAIL.
- [ ] **Step 3:** Implementar `pipeline.py` con una `asyncio.Queue`.
- [ ] **Step 4:** Ejecutar `pytest -v` → PASS.
- [ ] **Step 5:** Commit con `feat: offer processing pipeline`.

---

### Task 9: Publicador de Telegram (bot)

**Files:**
- Create: `src/patobarato/publishing/telegram_publisher.py`
- Test: `tests/test_telegram_publisher.py`

**Interfaces:**
- Consumes: `Publisher` (Task 8), `BUTTON_TEXT` (Task 6).
- Produces: `class TelegramPublisher(Publisher)`.
  - `__init__(self, client: TelegramClient, target: str, max_retries: int = 3, base_delay: float = 2.0)`: el cliente ya ha iniciado sesión como bot.
  - `publish` llama a `client.send_file(target, photo_bytes, caption=..., parse_mode="html", buttons=[Button.url(BUTTON_TEXT, url)])` si hay foto. Si no, a `client.send_message(target, caption, parse_mode="html", buttons=..., link_preview=False)`.
  - Devuelve `(utils.get_peer_id(msg.peer_id), msg.id)`.
  - Con `FloodWaitError` espera `e.seconds` y reintenta. Con otros errores de red, espera `base_delay * 2**n`. Al superar `max_retries`, relanza la excepción.

- [ ] **Step 1: Escribir los tests que fallan** con un cliente falso (un objeto con `send_file`/`send_message` async) y `asyncio.sleep` parcheado:
  - `test_publish_with_photo_uses_send_file_and_button`
  - `test_publish_without_photo_uses_send_message`
  - `test_flood_wait_retries_then_succeeds`
  - `test_gives_up_after_max_retries`
- [ ] **Step 2:** Ejecutar `pytest tests/test_telegram_publisher.py -v` → FAIL.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** Ejecutar `pytest tests/test_telegram_publisher.py -v` → PASS.
- [ ] **Step 5:** Commit con `feat: telegram bot publisher`.

---

### Task 10: Listener de Telegram, foto de vista previa y punto de entrada

**Files:**
- Create: `src/patobarato/sources/__init__.py`, `src/patobarato/sources/telegram_listener.py`, `src/patobarato/main.py`, `src/patobarato/__main__.py`
- Test: `tests/test_telegram_listener.py`

**Interfaces:**
- Consumes: `SourceMessage`, `Source` (Task 1), `Repository` (Task 7), `Pipeline`, `PhotoProvider` (Task 8), `TelegramPublisher` (Task 9).
- Produces:
  - `to_source_message(message, source_id: int, now: datetime, preview_photo) -> SourceMessage`: función pura sobre el mensaje de Telethon. Los URL salen de:
    - las entidades `MessageEntityUrl` (el texto) y `MessageEntityTextUrl` (`.url`);
    - los botones `message.reply_markup.rows[*].buttons[*].url`;
    - `message.media.webpage.url` si `media` es `MessageMediaWebPage`.
    
    Los hashtags salen de `MessageEntityHashtag`. `preview_photo` se pasa ya construido.
  - `class TelegramListener`:
    - `__init__(self, client, repo, pipeline, refresh_seconds, clock)`.
    - `async start(self)`: registra un `events.NewMessage()` sin filtro de chats y filtra en el handler por el mapa `chat_id → Source`.
    - `async refresh_sources(self)`:
      - Lee las fuentes activas y resuelve cada `identifier` con `get_entity`, usando `invite_link` y `ImportChatInviteRequest` si el canal es privado.
      - Se une con `JoinChannelRequest` si hace falta, esperando 30 s entre uniones y respetando `FloodWait`.
      - Reconstruye el mapa.
      - Una fuente que no se puede resolver se registra en el log y se salta.
    - `async run_refresh_loop(self)`.
  - `make_photo_provider(reader_client) -> PhotoProvider`:
    1. Si el mensaje de origen tiene `media.webpage.photo` y el URL de la vista previa (resuelto) apunta al mismo ASIN, descarga esa foto con `reader_client.download_media(..., bytes)`.
    2. Si no, llama a `functions.messages.GetWebPagePreviewRequest(message=canonical_url)` y descarga `webpage.photo` si existe.
    3. Si tampoco, `None`.
    
    Para implementarlo, `SourceMessage.preview_photo` se crea en el listener como un cierre que conoce el mensaje.
  - `main.py`:
    - `python -m patobarato login`: inicio de sesión interactivo de la cuenta lectora con `client.start()`, guardando la sesión en `telegram_session_path`.
    - `python -m patobarato run`:
      1. Arranca el cliente lector (sin pedir datos; si no hay sesión, termina con el mensaje `"Ejecuta primero: docker compose run --rm bot login"`).
      2. Arranca el cliente bot (`start(bot_token=...)`, sesión `data/bot.session`).
      3. Crea `httpx.AsyncClient(timeout=settings.http_timeout_seconds)`, el `UrlResolver`, el `SupabaseRepository`, `TelegramPublisher` y `Pipeline`.
      4. Ejecuta con `asyncio.gather` el `pipeline.run()`, `listener.run_refresh_loop()` y `reader.run_until_disconnected()`.
    - Log en `INFO` a stdout.

- [ ] **Step 1: Escribir los tests que fallan** para `to_source_message`, con objetos de Telethon construidos (`types.Message`, `MessageEntityTextUrl`, `ReplyInlineMarkup` y `KeyboardButtonUrl` se pueden instanciar directamente):
  - `test_urls_from_text_entities_buttons_and_webpage`: un mensaje con las 4 fuentes de URL → las 4 en `urls`, sin repetir.
  - `test_hashtags_from_entities`
  - `test_message_without_text`: `text == ""` y no da error.
- [ ] **Step 2:** Ejecutar `pytest tests/test_telegram_listener.py -v` → FAIL.
- [ ] **Step 3:** Implementar `telegram_listener.py`, `main.py` y `__main__.py`.
- [ ] **Step 4:** Ejecutar `pytest -v` → PASS. Ejecutar `python -m patobarato run` sin `.env` → error de configuración claro de pydantic, no un traceback de Telethon.
- [ ] **Step 5:** Commit con `feat: telegram listener, preview photos and entrypoint`.

---

### Task 11: Docker, Supabase y puesta en marcha

**Files:**
- Create: `Dockerfile`, `docker-compose.yml`, `README.md`
- Modify: `.env.example` (si hace falta)

**Interfaces:**
- Consumes: todo lo anterior.

- [ ] **Step 1:** Crear el `Dockerfile` desde `python:3.12-slim`:
  - Ejecuta `pip install .` y usa `WORKDIR /app`.
  - Usa un usuario no root.
  - `ENTRYPOINT ["python","-m","patobarato"]` y `CMD ["run"]`.
- [ ] **Step 2:** Crear `docker-compose.yml`: servicio `bot` con `build: .`, `env_file: .env`, el volumen `./data:/app/data`, `restart: unless-stopped` y `stdin_open`/`tty` para `login`.
- [ ] **Step 3:** Ejecutar `docker compose build` → la imagen se construye sin errores. Si Docker no está disponible en la máquina de desarrollo, apuntarlo y comprobarlo en el servidor del usuario.
- [ ] **Step 4: Crear el proyecto de Supabase.** Pedir al usuario un token personal (`! npx supabase login`, o `SUPABASE_ACCESS_TOKEN`). Después:
  ```
  npx supabase orgs list
  npx supabase projects create patobarato --org-id <id> --region eu-west-3 --db-password <generada>
  npx supabase link --project-ref <ref>
  npx supabase db push
  ```
  La contraseña de la base de datos se genera aleatoriamente y se entrega al usuario; no se guarda en el repositorio. Si no hay token, el usuario crea el proyecto en el panel y se sigue desde `link`.
- [ ] **Step 5:** Comprobar las tablas con `npx supabase db remote commit --dry-run`, o con una consulta `select table_name from information_schema.tables where table_schema='public'` desde el panel. Deben aparecer las 4 tablas. Ejecutar `SUPABASE_TEST_URL=... pytest tests/test_supabase_repo.py -v` → PASS.
- [ ] **Step 6:** Escribir el `README.md` en español:
  - Requisitos.
  - Cómo obtener `api_id`/`api_hash`, crear el bot en BotFather y hacerlo administrador de @patobarato.
  - Rellenar `.env`.
  - `docker compose run --rm bot login`, y después `docker compose up -d`.
  - Cómo añadir canales en la tabla `sources` (y `invite_link` para los privados).
  - Recordatorio de registrar el canal en Amazon Afiliados.
- [ ] **Step 7:** Hacer una prueba completa con el usuario:
  - Insertar en `sources` un canal de pruebas que controle el usuario.
  - Publicar un mensaje con un enlace de Amazon España y un precio.
  - Comprobar que llega a @patobarato (o a un canal de pruebas, poniendo `TARGET_CHANNEL`) con la foto, el botón y el tag.
  - Comprobar que hay filas en `products`, `offers` y `publications` con el `message_id`.
  - Repetir el mismo mensaje y comprobar que no se publica (`skipped_duplicate`).
- [ ] **Step 8:** Cuando el usuario pase mensajes reales de sus canales, añadirlos como fixtures en `tests/fixtures/` y ajustar `text.py` con TDD.
- [ ] **Step 9:** Commit con `chore: docker, supabase provisioning and README`.
