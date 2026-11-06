# PatoBarato — Guías de compra con precio por tienda

Fecha: 2026-11-06. Estado: pendiente de aprobación del usuario.
Antecedentes: `2026-11-06-patobarato-web-rediseno-design.md` (web v3) y `2026-11-06-patobarato-multitienda-design.md` (tiendas, fuentes por API, cupones de Awin). Maqueta de referencia: pantalla «Guía» del artefacto de diseño (freidoras de aire).

## 1. Intención

El usuario quiere publicar guías de compra («Las mejores freidoras de aire por menos de 100 €») con una lista corta de productos y, para cada uno, el precio actual en cada tienda donde se vende, el cupón aplicable y el precio final («te queda en»). Los precios se consultan en vivo a las tiendas desde el bot; el contenido vive en Supabase porque más adelante se editará desde un portal de administración (fase siguiente, fuera de esta spec). Hasta entonces las guías se cargan por SQL.

## 2. Objetivos, no objetivos y anti-objetivos

**Objetivos**
- Modelo de datos de guías en Supabase (guía, productos, tiendas por producto, precios) expuesto a la web solo por vistas.
- Lector de precio por tienda en el bot (Amazon por página, AliExpress por API, tiendas Awin por metadatos de página) y un runner periódico que refresca los precios de los productos de las guías publicadas.
- Páginas `/guias` y `/guias/{slug}` fieles a la maqueta: elección rápida, ficha por producto con tabla de tiendas, comparativa, cómo elegir y preguntas frecuentes.
- Cupones con valor estructurado para calcular el precio final.

**No objetivos**
- Portal de administración, autenticación o edición desde la web.
- Alertas de precio (el bloque «Avísame si bajan» de la maqueta queda fuera).
- Histórico de precios propio: no se guarda serie temporal; el «mínimo» se toma de las publicaciones existentes.
- Feeds de producto de Awin y PA-API de Amazon.
- Selección de productos automática: la lista de cada guía la escribe el usuario.

**Anti-objetivos**
- Precios inventados o viejos presentados como actuales: cada precio lleva su fecha de revisión y una fila sin precio reciente no muestra ninguno.
- Descuentos no respaldados: «-N %» solo con precio anterior real de la tienda; «mínimo de 90 días» solo con datos propios.
- Exponer tablas base a la anon key o credenciales en logs.
- Cargar las tiendas: peticiones secuenciales, con retardo y cada pocas horas.

## 3. Restricciones

- Web: Next.js 16, React 19, Tailwind v4 con los tokens de `globals.css`, Lucide únicamente, Vitest + Testing Library, ISR de 60 s en páginas de datos. Texto en español; código y comentarios en inglés.
- Bot: Python 3.12, httpx, pydantic-settings, abstracción `Store`/`StoreRegistry`, `ApiScheduler` con runners `ApiSourceRunner`, repositorio con implementación en memoria para tests.
- Supabase: migraciones en `supabase/migrations/`, aplicadas con la Management API; `revoke` a `anon`/`authenticated` de toda tabla nueva; `scripts/check-views.mjs` vigila que la anon key llega solo a vistas.
- Amazon no ofrece API de precios al usuario; se lee de la página de producto, como ya se hace con la imagen, asumiendo que puede romperse y se degrada.

## 4. Modelo de datos

Migración `supabase/migrations/20261108000000_guides.sql`.

```sql
create table guides (
    id bigint generated always as identity primary key,
    slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
    title text not null,
    subtitle text,
    category text not null,                 -- «Hogar», «Tecnología»…
    intro_md text not null default '',
    how_to_choose_md text not null default '',
    faq jsonb not null default '[]',        -- [{"q": "...", "a_md": "..."}]
    author text not null default 'el Pato',
    reading_minutes int not null default 5,
    status text not null default 'draft' check (status in ('draft', 'published')),
    published_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table guide_items (
    id bigint generated always as identity primary key,
    guide_id bigint not null references guides (id) on delete cascade,
    position int not null,
    name text not null,                     -- «Ninja AF300 Dual Zone 7,6 L»
    award text,                             -- «Mejor en general»
    summary_md text not null default '',
    pros text[] not null default '{}',
    cons text[] not null default '{}',
    specs jsonb not null default '[]',      -- [{"label": "Capacidad", "value": "7,6 L"}]
    image_url text,
    unique (guide_id, position)
);

create table guide_item_stores (
    id bigint generated always as identity primary key,
    guide_item_id bigint not null references guide_items (id) on delete cascade,
    store text not null,
    external_id text not null,              -- ASIN, id numérico de AliExpress, slug de la tienda Awin
    url text not null,                      -- URL canónica del producto en la tienda
    note text,                              -- «desde España», «tienda oficial»
    position int not null default 0,
    unique (guide_item_id, store)
);

create table product_prices (
    product_id bigint primary key references products (id) on delete cascade,
    price numeric(10,2),
    previous_price numeric(10,2),
    currency char(3) not null default 'EUR',
    checked_at timestamptz not null,
    error text                              -- «Tipo: mensaje» del último fallo; null si el último intento fue bien
);

alter table coupons add column discount_amount numeric(10,2);
alter table coupons add column discount_pct numeric(5,2);
alter table coupons add column min_purchase numeric(10,2);

alter table sources drop constraint sources_type_check;
alter table sources add constraint sources_type_check
    check (type in ('telegram_channel', 'aliexpress_api', 'awin_promotions', 'guide_prices'));
insert into sources (type, identifier, country, active, every_minutes) values ('guide_prices', 'guides', 'ES', true, 360);
```

Reglas:
- `guide_item_stores` enlaza con `products` por `(store, 'ES', external_id)`: el bot hace `upsert_product` al refrescar, así que la fila de `products` existe en cuanto el runner pasa una vez; la vista hace `left join` y mientras tanto la tienda aparece sin precio.
- `product_prices` guarda solo el último estado. Un refresco que falla deja el `price` anterior y rellena `error` y `checked_at`; la web considera «reciente» un precio sin `error` con `checked_at` en las últimas 48 h.
- Cupón aplicable a una fila = cupón vigente (`web_coupons`) de la misma `store`. Si hay varios, el de mayor ahorro sobre el precio; empate, el que caduca antes.

Vistas (solo lectura para anon/authenticated):

- `web_guides`: guías `published` con `slug, title, subtitle, category, author, reading_minutes, published_at, updated_at, items` (recuento) y `prices_checked_at` (máximo `checked_at` sin error entre sus productos, o null).
- `web_guide_items`: una fila por producto-tienda de guías publicadas: `guide_slug, item_id, position, name, award, summary_md, pros, cons, specs, image_url` (el del item o el de `products`), `store, external_id, url, note, store_position, product_id, price, previous_price, currency, checked_at, price_error` (booleano), `previous_min_price` (mínimo de `publications.published_price` de ese producto, como en `web_deals`), más `coupon_code, coupon_title, coupon_expires_at, discount_amount, discount_pct, min_purchase` del cupón aplicable.
- `web_guides_by_product`: `(product_id, guide_slug, guide_title)` para el enlace desde `/oferta/...`.
- `web_coupons` incorpora las tres columnas nuevas.

Seed: la migración `20261108000001_guides_seed.sql` inserta la guía de freidoras de la maqueta en `draft` con los cuatro productos; los ids por tienda (`[ASIN]`, `[ID_ALIEXPRESS]`, `[SLUG_PCCOMPONENTES]`…) y los textos que falten van en `[CORCHETES]` para que el usuario los complete antes de pasarla a `published`.

## 5. Bot: lectores de precio

`models.py`:

```python
@dataclass(frozen=True)
class PriceQuote:
    price: Decimal
    previous_price: Decimal | None
    currency: str = "EUR"
    image_url: str | None = None   # Amazon and Awin get it from the same page; None elsewhere
```

`stores/base.py`: `Store` gana `async fetch_price(self, product_id: str, canonical_url: str) -> PriceQuote | None`; `BaseStore` devuelve `None` (tienda sin lector).

- **Amazon** (`stores/amazon.py` + `sources/amazon_page.py`): `fetch_product_page(asin, country)` descarga una vez la página con el cliente y cabeceras actuales; `extract_image_url` y la nueva `extract_price(page) -> PriceQuote | None` leen de la misma respuesta. El precio se toma del primer `.a-price` del bloque de compra (`a-offscreen`, «1.234,56 €» → `Decimal`), y `previous_price` del precio tachado (`basisPrice` / «Precio recomendado») si existe. Página con captcha o sin bloque de precio → `None`, con el mismo registro que hoy para la imagen. `find_image` pasa a usar `fetch_product_page` para no duplicar la descarga cuando se piden ambos en el mismo refresco.
- **AliExpress** (`stores/aliexpress_client.py` + `stores/aliexpress.py`): `AliExpressClient.product_detail(product_id) -> AliProduct | None` llama a `aliexpress.affiliate.productdetail.get` (`product_ids`, `target_currency=EUR`, `target_language=ES`, `tracking_id`); `fetch_price` devuelve `PriceQuote(price=sale_price, previous_price=original_price)`.
- **Awin y genérico** (`sources/generic_page.py` + `stores/awin.py`): `product_meta(page) -> ProductMeta(image_url, price, previous_price, currency)` lee JSON-LD `Product`→`offers` (`price`, `priceCurrency`, `lowPrice`) y, si no hay, `product:price:amount` / `product:price:currency`. `AwinStore.fetch_price` descarga la URL canónica con el cliente genérico y aplica `product_meta`. Fixtures reales recortadas de PcComponentes, MediaMarkt y El Corte Inglés en `tests/fixtures/`.

Ninguna implementación lanza: errores de red, parseo o captcha se registran como `WARNING` con `Tipo: mensaje` (sin URL) y devuelven `None`.

## 6. Bot: refresco de precios de guías

`sources/guide_prices.py`: `GuidePriceRefresher(registry, repo, clock, sleep, delay_seconds)` implementa `ApiSourceRunner` con `type = 'guide_prices'` y se registra en `build_runners` siempre (no necesita credenciales).

`run(source)`:
1. `repo.list_guide_products()` → `[GuideProduct(store, external_id, url, name, image_url)]` de guías `published`, sin duplicados por `(store, external_id)`.
2. Por cada uno, en orden y con `await sleep(delay_seconds)` entre peticiones (por defecto 1,5 s; `GUIDE_PRICE_DELAY_SECONDS` en `Settings`):
   - `store = registry.get(store_id)`; si no existe, `upsert_product_price(error='store_disabled')` sobre el producto si ya existe en `products`, y sigue.
   - `product_id = repo.upsert_product(ParsedOffer(...))` con el nombre de la guía como título si el producto es nuevo (si ya existía, se conserva su título) y `product_url=url`.
   - `quote = await store.fetch_price(external_id, store.canonical_for(url) or url)`; con `quote` → `upsert_product_price(product_id, price, previous_price, currency, checked_at=now, error=None)`; sin ella → `upsert_product_price(product_id, checked_at=now, error=<motivo>)` conservando el precio anterior.
   - Si el producto no tiene imagen y la tienda devuelve una (Amazon y Awin la obtienen de la misma página; se expone como `quote.image_url` opcional), `set_product_image`.
   - Cualquier excepción se registra con el `(store, external_id)` y `Tipo: mensaje`, y el bucle continúa.
3. Registra `INFO` con totales (`ok`, `failed`, `skipped`). El `ApiScheduler` marca `last_run_at`/`last_error` como con el resto de fuentes.

Repositorio (`Repository`, en memoria y Supabase): `list_guide_products()`, `upsert_product_price(product_id, *, price, previous_price, currency, checked_at, error)` (una fila por producto; `price`/`previous_price` sin tocar cuando hay `error`).

## 7. Web

**Datos** (`lib/guides-data.ts`): `fetchGuides(client) -> GuideSummary[]` (`web_guides`), `fetchGuide(client, slug) -> Guide | null` (cabecera de `web_guides` + filas de `web_guide_items` agrupadas en `items[].stores[]`), `fetchGuidesByProduct(client, productId)`; `lib/coupons.ts` incorpora `discountAmount`, `discountPct`, `minPurchase`.

**Lógica pura** (`lib/guides.ts`, testada sin DOM):
- `finalPrice(price, coupon)`: `price - discount_amount` si `price >= min_purchase` (o sin mínimo); si no, `price * (1 - discount_pct/100)`; cupón sin valor estructurado, caducado o precio ausente → `null` (se muestra el código sin «te queda en»).
- `bestOffer(stores)`: la tienda con menor `finalPrice ?? price` entre las que tienen precio reciente; devuelve tienda, precio final y si aplica cupón. Sin precios recientes → `null`.
- `freshnessLabel(checkedAt, now)`: «Precios revisados hace 2 h» (< 48 h), «Precios de hace 3 días» (≥ 48 h), «Precios no disponibles» (null).
- `discountPct(price, previousPrice)` solo con `previous_price > price`.
- `isLowest(price, previousMinPrice)` → «Mínimo de los últimos 90 días» cuando `previous_min_price` existe y `price <= previous_min_price`.

**Páginas**
- `/guias` (servidor, `revalidate = 60`): listado en tarjetas (eyebrow con la categoría, título, subtítulo, «N productos · actualizada el {fecha}»); `guidesMetadata(count)` con `noindex` si `count === 0`; estado vacío «Todavía no hay guías publicadas». Enlace «Guías» en `NAV_LINKS` tras «Tiendas».
- `/guias/{slug}` (servidor, 60 s): `notFound()` si no existe o no está publicada. Estructura de la maqueta sin el bloque de alertas: breadcrumbs (Inicio › Guías › {categoría}), eyebrow «Guía de compra · {categoría}», título, subtítulo, autor, «Actualizado el {fecha}», «{n} min de lectura», `freshnessLabel`; índice «En esta guía» con anclas (en escritorio fijo a la izquierda, en móvil desplegable); «Nuestra elección rápida» con los tres primeros productos y su `bestOffer`; aviso de afiliados; por producto (`GuideItem`): imagen, premio, nombre, «Mejor precio hoy» con `bestOffer` (precio, tienda y «con cupón» si procede), `-N %` y «Mínimo de los últimos 90 días» cuando apliquen, chips de `specs`, tabla de tiendas (`StoreRow`: tienda y nota, precio con anterior tachado, cupón con código y valor, «te queda en», `BuyButton`); una fila sin precio reciente muestra solo tienda y botón «Ver en {tienda}»; `summary_md`, «Lo mejor» / «Lo peor»; «Comparativa» (tabla `specs` × productos; en móvil, scroll horizontal); «Cómo elegir» (`how_to_choose_md`); «Preguntas frecuentes» (acordeón nativo `<details>`); aviso final de afiliados.
- `/oferta/{store}/{slug}`: bajo el botón de compra, «Esta oferta aparece en la guía: {título}» con enlace cuando `web_guides_by_product` devuelve alguna.

**Markdown**: `react-markdown` + `remark-gfm`, sin HTML en bruto (`skipHtml`), enlaces con `rel="nofollow noopener"` salvo los internos; componente `Markdown` compartido con estilos de la tipografía del sitio.

**SEO**: `guideMetadata(guide)` (título «{title} · Guías PatoBarato», descripción del subtítulo, canonical `/guias/{slug}`, OG), JSON-LD `Article` (autor «PatoBarato», fechas), `ItemList` con los productos y `FAQPage` con las preguntas; `noindex` cuando la guía publicada no tiene ningún precio reciente. Sitemap: `/guias` (si hay alguna) y cada guía publicada con `lastmod = updated_at`.

**Diseño**: tokens actuales (`warm` para la elección rápida, `success` para mínimo, `danger` para `-N %`, `accent` para el chip de cupón), Lucide (`Trophy`, `ThumbsUp`, `ThumbsDown`, `Tag`, `Store`, `ChevronDown`), objetivos ≥ 44 px, contenedor de 1200 px con columna de lectura de 720 px.

## 8. Errores y degradación

- Lector que falla: fila con `error`; la web muestra «Ver en {tienda}» y nada más. Todos fallan: la guía se publica con «Precios no disponibles» y `noindex`.
- Tienda sin credenciales (AliExpress sin claves): `error='store_disabled'`; mismo tratamiento.
- Captcha de Amazon: `None` y aviso, se reintenta en la pasada siguiente; nunca se reintenta dentro de la misma pasada.
- Supabase caído en la web: `/guias` muestra el estado vacío; `/guias/{slug}` responde 404 (no hay contenido que cachear); `/oferta` omite el enlace a guías.
- Datos incoherentes (cupón con `min_purchase` mayor que el precio, `previous_price` menor que `price`): no se aplica el cupón / no se muestra descuento; nunca un número negativo.

## 9. Pruebas

- Bot: `extract_price` con fixture de Amazon con precio y anterior, sin precio y con captcha; `product_detail` con JSON de ejemplo y firma; `product_meta` con fixtures de las tres tiendas Awin (JSON-LD y meta); `GuidePriceRefresher` con repo en memoria (precio escrito, error por producto sin abortar, `store_disabled`, retardo llamado entre productos, imagen rellenada); repositorio en memoria y filas de Supabase con el cliente falso grabador; `build_runners` incluye `guide_prices` siempre.
- Web: `lib/guides.ts` (todas las funciones con casos límite), `guides-data` con el cliente falso, componentes `GuideItem`/`StoreRow`/`QuickPicks`/`Markdown`, páginas (`notFound`, `noindex` sin precios, metadata, JSON-LD, estado vacío de `/guias`), sitemap, `icons.test.ts`, `check-views.mjs` con las vistas nuevas.
- Verificación final: suites, typecheck, lint, build; una pasada real del runner contra la guía seed en `draft` pasada temporalmente a `published` en un entorno de prueba, o con `SUPABASE_TEST_URL`.

## 10. Despliegue

1. Migraciones `20261108000000_guides.sql` y `20261108000001_guides_seed.sql` por la Management API; registro en `schema_migrations`; `check-views.mjs` → OK.
2. Bot: desplegar; `GUIDE_PRICE_DELAY_SECONDS` opcional en `.env.example`; README con el runner y cómo dar de alta una guía por SQL.
3. Web: desplegar; README con rutas y vistas nuevas.
4. Usuario: completar los `[CORCHETES]` de la guía seed, pasarla a `published`; a las 6 h (o forzando `last_run_at = null`) los precios aparecen.
