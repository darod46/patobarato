# PatoBarato — Buscador global: chollos, AliExpress y catálogo de tiendas

Fecha: 2026-11-07. Estado: pendiente de aprobación del usuario.
Antecedentes: `2026-11-06-patobarato-multitienda-design.md` (tiendas, Awin, AliExpress), `2026-11-06-patobarato-guias-design.md` (lectores de precio, `product_prices`). Estado actual del buscador: campo en la cabecera que filtra el listado de `/chollos?q=` (reescrito a `/buscar`), con búsqueda «dentro de» en las páginas de hashtag y de tienda.

## 1. Intención

El usuario quiere que buscar en PatoBarato devuelva, además de sus chollos, productos de AliExpress (en vivo, con enlace de afiliado) y de las tiendas de Awin (PcComponentes, MediaMarkt, El Corte Inglés… cuando acepten su solicitud), y que la búsqueda tenga un sitio claro: hoy la cabecera y la página de resultados no le resultan naturales. Amazon se añadirá cuando tenga acceso a la Creators API (exige 10 ventas en 30 días), fuera de esta spec.

Hechos que condicionan el diseño: la API de afiliados de AliExpress permite buscar por palabra clave en vivo (`aliexpress.affiliate.product.query`); la API de publisher de Awin **no** tiene búsqueda, solo descarga de feeds de producto por anunciante (JSONL, máximo 5 peticiones por minuto), así que el catálogo de tiendas se indexa en Supabase y se busca ahí.

## 2. Objetivos, no objetivos y anti-objetivos

**Objetivos**
- Una página de búsqueda propia, `/buscar`, con campo grande y resultados por origen: chollos propios, AliExpress en vivo y catálogo de tiendas.
- Cabecera con un disparador de búsqueda siempre visible que lleva a `/buscar`; sin campo ni franja desplegable.
- Índice de catálogo en Supabase alimentado por el bot con los feeds de Awin, con búsqueda de texto en español tolerante a erratas.
- Reutilizar el catálogo para los precios de las guías cuando exista (sin scraping).

**No objetivos**
- Búsqueda en Amazon (Creators API) y cualquier origen sin cuenta de afiliado.
- Búsqueda «dentro de» un hashtag o una tienda (se elimina).
- Indexar AliExpress en Supabase; AliExpress se consulta en vivo.
- Autocompletado, historial o sugerencias personalizadas.

**Anti-objetivos**
- Presentar catálogo como chollo: los bloques de AliExpress y tiendas se titulan como catálogo y no muestran descuentos ni mínimos que los datos no respalden.
- Exponer claves: las credenciales de AliExpress viven solo en el servidor de la web (Vercel, variables sin prefijo público); la anon key de Supabase solo llega a la función de búsqueda, nunca a la tabla.
- Abusar de las APIs: caché por consulta, límite de ritmo y feeds secuenciales.

## 3. Restricciones

- Web: Next.js 16 App Router, React 19, Tailwind v4 con los tokens de `globals.css`, Lucide únicamente, Vitest + Testing Library. Texto en español; código y comentarios en inglés. Objetivos táctiles ≥ 44 px.
- Bot: Python 3.12, httpx, `ApiScheduler`/`ApiSourceRunner`, `AwinClient` (`sources/awin_source.py`), repositorio con versión en memoria, parser estricto de precios de `generic_page`.
- Supabase: migraciones en `supabase/migrations/` aplicadas por la Management API; tablas nuevas revocadas a `anon`/`authenticated`; `scripts/check-views.mjs` vigila lo que la anon key puede leer.
- Vercel: la ruta de servidor corre en Node; las variables `ALIEXPRESS_APP_KEY`, `ALIEXPRESS_APP_SECRET`, `ALIEXPRESS_TRACKING_ID` se definen para Production (y Preview si se quiere probar) sin `NEXT_PUBLIC_`.

## 4. Modelo de datos e índice

Migración `supabase/migrations/20261109000000_catalog.sql`.

```sql
create extension if not exists pg_trgm;

create table catalog_products (
    id bigint generated always as identity primary key,
    store text not null,                      -- pccomponentes, mediamarkt, elcorteingles…
    external_id text not null,                -- id del producto en el feed de Awin
    title text not null,
    description text,                         -- recortada a 500 caracteres
    brand text,
    gtin text,
    category text,
    price numeric(10,2) not null,
    sale_price numeric(10,2),                 -- null sin rebaja; siempre < price
    currency char(3) not null default 'EUR',
    in_stock boolean not null default true,
    image_url text,
    url text not null,                        -- página del producto (link)
    affiliate_url text not null,              -- aw_deep_link
    feed_updated_at timestamptz,
    updated_at timestamptz not null default now(),
    tsv tsvector generated always as (
        setweight(to_tsvector('spanish', coalesce(title, '')), 'A') ||
        setweight(to_tsvector('spanish', coalesce(brand, '')), 'B') ||
        setweight(to_tsvector('spanish', coalesce(description, '')), 'C')) stored,
    unique (store, external_id)
);
create index catalog_products_tsv on catalog_products using gin (tsv);
create index catalog_products_title_trgm on catalog_products using gin (title gin_trgm_ops);
create index catalog_products_store_url on catalog_products (store, url);

create table catalog_feeds (
    store text not null,
    advertiser_id int not null,
    last_run_at timestamptz,
    products int not null default 0,
    last_error text,
    primary key (store, advertiser_id)
);

alter table sources drop constraint sources_type_check;
alter table sources add constraint sources_type_check check (type in
    ('telegram_channel', 'aliexpress_api', 'awin_promotions', 'guide_prices', 'awin_feeds'));
insert into sources (type, identifier, country, active, every_minutes)
values ('awin_feeds', 'awin-feeds', 'ES', true, 1440);

alter table catalog_products enable row level security;
alter table catalog_feeds enable row level security;
revoke all on catalog_products, catalog_feeds from anon, authenticated;
```

Función de búsqueda (la única puerta para la anon key):

```sql
create function web_catalog_search(q text, max int default 24)
returns table (store text, external_id text, title text, brand text, price numeric,
               sale_price numeric, currency char(3), image_url text, url text,
               affiliate_url text, updated_at timestamptz)
language sql stable security definer set search_path = public as $$
    with query as (select websearch_to_tsquery('spanish', q) as tsq, lower(q) as raw)
    select p.store, p.external_id, p.title, p.brand, p.price, p.sale_price, p.currency,
           p.image_url, p.url, p.affiliate_url, p.updated_at
    from catalog_products p, query
    where length(btrim(q)) >= 2 and p.in_stock
      and (p.tsv @@ query.tsq or similarity(lower(p.title), query.raw) > 0.3)
    order by ts_rank(p.tsv, query.tsq) desc, similarity(lower(p.title), query.raw) desc, p.id
    limit greatest(1, least(max, 48));
$$;
revoke all on function web_catalog_search(text, int) from public;
grant execute on function web_catalog_search(text, int) to anon, authenticated;
```

`check-views.mjs` comprueba que `catalog_products` devuelve 401 y que `rpc/web_catalog_search` con `{"q":"xx"}` devuelve 200.

Guías: `web_guide_items` no cambia; el refresco del bot (sección 6) escribe `product_prices` desde el catálogo cuando hay fila.

## 5. Bot: feeds de Awin

`sources/awin_source.py`:

- `@dataclass(frozen=True) AwinFeedProduct(external_id, title, description, brand, gtin, category, price: Decimal, sale_price: Decimal | None, in_stock: bool, image_url, url, affiliate_url)`.
- `AwinClient.download_feed(advertiser_id: int, locale: str = 'es_ES') -> AsyncIterator[AwinFeedProduct]`: `GET https://api.awin.com/publishers/{publisher_id}/awinfeeds/download/{advertiser_id}-retail-{locale}.jsonl` con `Authorization: Bearer`, `stream=True`, `aiter_lines()`; cada línea es un JSON de producto; una línea con `error`/`message` y sin `id` se trata como fallo (`AwinFeedError`) y aborta el feed. Campos: `id`, `title`, `description` (recortada a 500), `brand`, `gtin`, `google_product_category` o `product_type` → `category`, `price`, `sale_price`, `availability` (`in stock` → true), `image_link`, `link`, `aw_deep_link`. Precios por `_to_price` del lector genérico (estricto; precio inválido → producto descartado con contador); `sale_price` solo si menor que `price`. Cualquier otro campo se ignora. Tope de seguridad: 200 000 líneas por feed; al superarlo se corta y se avisa.
- `AwinFeedsSource(client, repo, settings, clock, sleep)` (`type = 'awin_feeds'`): merchants con `mid` (de `settings.awin_merchants` o `source.config['merchants']`); por cada uno, secuencialmente y con `await sleep(15)` entre feeds (5 peticiones/minuto es el límite de Awin; 15 s deja margen), descarga y vuelca por lotes de 500 con `repo.upsert_catalog_products(rows)`; al terminar un feed sin error, `repo.mark_catalog_out_of_stock(store, seen_ids)` para los no incluidos; `repo.record_feed_run(store, advertiser_id, ran_at, products, error)`. Un feed que falla no toca sus productos ni impide los siguientes. Sin credenciales o sin merchants: aviso y retorno, como `AwinPromotionsSource`. Registro `INFO` con totales por tienda; nada de URLs ni tokens.
- `build_runners` añade el runner con las mismas condiciones que `AwinPromotionsSource`.

Repositorio (`Repository`, memoria y Supabase): `upsert_catalog_products(rows: list[CatalogRow]) -> None` (`on_conflict='store,external_id'`), `mark_catalog_out_of_stock(store, seen_ids: set[str]) -> int` (por lotes de 1 000 ids con `not_.in_`; con conjunto vacío no hace nada y avisa), `record_feed_run(...)`, `find_catalog_product(store, url) -> CatalogRow | None`.

## 6. Guías: precio desde el catálogo

`GuidePriceRefresher`: antes de `fetch_price`, `row = await repo.find_catalog_product(store, canonical_url)`; si existe y `row.updated_at` tiene menos de 36 h, se escribe `upsert_product_price(price=row.sale_price or row.price, previous_price=row.price if row.sale_price else None, affiliate_url=row.affiliate_url, error=None)` y `set_product_image` si procede, sin tocar la tienda. Si no, el flujo actual. La correspondencia es por URL canónica (`canonical_for`), que es la `link` del feed sin parámetros de seguimiento; `find_catalog_product` compara tras `canonical_for` en ambos lados.

## 7. Web: cabecera y página de búsqueda

**Cabecera** (`Header.tsx`): se eliminan `HeaderSearch`/`HeaderSearchToggle`. Nuevo `SearchTrigger`: en `md+`, un enlace con aspecto de campo (píldora `bg-surface`, borde `#d7dae0`, lupa `muted` y texto «Buscar chollos…» en `muted`, 44 px de alto, ancho máximo 320 px) a `/buscar`; por debajo de `md`, solo la lupa (botón redondo de 44 px, `aria-label="Buscar"`), también enlace. En `/buscar` el disparador no se muestra. La cabecera vuelve a una sola fila en todas las pantallas; `pt` de las páginas: 60 px móvil / 72 px escritorio.

**`/buscar`** (`app/buscar/page.tsx`, servidor, dinámico por `searchParams`; `SearchClient` cliente):
- Campo grande (`h-14`, lupa, X para limpiar, `autoFocus` solo cuando no hay `q`), dentro de un `form` GET a `/buscar` (sin JavaScript sigue funcionando). Con JavaScript, el valor escrito actualiza `?q=` con `replaceState` tras 300 ms y los bloques se refrescan; Enter aplica al instante.
- Con `q` (≥ 2 caracteres): H1 «Resultados para “{q}”» y tres bloques, cada uno con su propio estado y sin bloquear a los demás:
  1. **Chollos** — `DealFeed` con `q` fijo, orden `recientes`, sin selector ni chips, con «cargar más»; vacío → «Ningún chollo coincide con “{q}”».
  2. **En AliExpress** — `CatalogBlock` alimentado por `fetch('/api/buscar/aliexpress?q=')`; nota bajo el título «Precio en AliExpress ahora mismo; puede variar con envío y aduanas».
  3. **En tiendas** — `CatalogBlock` alimentado por `rpc('web_catalog_search', { q, max: 12 })`; se oculta por completo cuando no devuelve nada (hoy no hay programas aceptados y un bloque vacío solo estorba).
- Sin `q`: H1 «Buscar», el campo, y atajos: «Búsquedas habituales» con los 12 hashtags más usados (`web_hashtags`) como chips enlace a `/chollos/{tag}`, y «Tiendas» con las que tienen datos (`web_stores`) enlazando a `/tiendas/{slug}`.
- `CatalogCard`: imagen cuadrada, chip de tienda (`storeInfo(store).short` o «AliExpress»), título a dos líneas, precio en `price-card`; precio anterior tachado y `-N %` solo cuando el origen trae un precio original mayor (AliExpress `original_price`, Awin `price` con `sale_price`); botón `BuyButton` (`target=_blank`, `rel="sponsored noopener noreferrer"`) con `affiliate_url`. Al pie de cada bloque, «Enlaces de afiliado».
- `CatalogBlock({ title, note, items, state })`: `loading` (6 esqueletos), `error` («Ahora mismo no podemos buscar en {origen}»), `empty`, `ready` (máximo 12 tarjetas). Hook `useCatalogSearch(q, fetcher)` con `AbortController` y descarte de respuestas antiguas.

**Ruta de servidor** `app/api/buscar/aliexpress/route.ts` (`GET`):
- Valida `q` (2–80 caracteres tras `trim`; si no, 400). Sin las tres variables de entorno → 204.
- `lib/aliexpress.ts`: `searchProducts(q, { appKey, appSecret, trackingId }) -> CatalogProduct[]` llama a `https://api-sg.aliexpress.com/sync` con `method=aliexpress.affiliate.product.query`, `keywords`, `ship_to_country=ES`, `target_currency=EUR`, `target_language=ES`, `page_size=12`, `page_no=1`, `sort=LAST_VOLUME_DESC`, `tracking_id`, `timestamp` (ms), `sign_method=sha256`, `sign` = HMAC-SHA256 del concatenado ordenado de parámetros con el secreto (misma regla que `AliExpressClient.sign` del bot; se verifica contra un vector calculado con el cliente Python). Mapea `product_id`, `product_title`, `target_sale_price`, `target_original_price`, `discount`, `product_main_image_url`, `promotion_link` (si falta, `product_detail_url`).
- Caché: la búsqueda se envuelve en `unstable_cache` con clave `['ali-search', q.toLowerCase()]` y `revalidate: 900`; respuesta con `Cache-Control: public, s-maxage=900, stale-while-revalidate=3600`. Límite: contador en memoria de consultas distintas por minuto (máximo 30); al superarlo 429 con `Retry-After: 30`. Errores de la API → 502 con `{ error: 'upstream' }`; la consulta no se escribe en logs.

**Redirecciones** (`next.config.ts`): `/?q=` y `/chollos?q=` → `redirect 308` a `/buscar?q=` (enlaces antiguos). Se eliminan todas las reescrituras a `/buscar`.

**`/chollos`**: listado sin búsqueda. `DealsClient` deja de leer `q`; `useUrlFilters` pierde `q`/`setQ`. La página lee `searchParams` (`tag`, `orden`, `tienda`) en el servidor y renderiza la primera página ya filtrada, por lo que pasa a ser dinámica (sin ISR; Vercel cachea por URL completa) y desaparecen las reescrituras a `/buscar`. Coste aceptado: una petición al servidor por combinación de filtros en lugar de HTML estático.

**Hashtag y tienda**: `HashtagClient` y `StoreClient` pierden el campo de búsqueda; sus cabeceras llevan el disparador.

**SEO**: `/buscar` sin `q` → indexable, título «Buscar chollos · PatoBarato», en el sitemap; con `q` → `noindex`, canonical `/buscar`. `/chollos` metadata sin `q`. `dealsMetadata` se simplifica.

## 8. Errores y degradación

- Sin claves de AliExpress: 204 y el bloque no se muestra. API caída/429/502: bloque con mensaje de error; el resto de la página intacta.
- Catálogo vacío o función caída: bloque «En tiendas» oculto.
- Feed de Awin con error a medias: no se marca nada agotado; `catalog_feeds.last_error`; el runner sigue con el siguiente merchant.
- `q` de 1 carácter: la página no busca y muestra «Escribe al menos dos letras».
- Supabase caído: el bloque de chollos muestra su error habitual; la página sigue.

## 9. Pruebas

- Bot: parser JSONL (fixture `awin_feed.jsonl` con 10 productos, uno con precio inválido, uno sin `aw_deep_link` → descartado, y una línea de error final), `AwinFeedsSource` (lotes, `mark_catalog_out_of_stock` solo tras éxito, `sleep(15)` entre feeds, tope de líneas, totales), repositorio en memoria y filas Supabase, `GuidePriceRefresher` prefiriendo el catálogo fresco e ignorando el viejo (> 36 h), `build_runners`.
- Web: `lib/aliexpress.ts` (firma contra vector conocido, mapeo, errores), ruta (400/204/200/429/502, cabecera de caché), `lib/catalog.ts` (`rpc` con argumentos), `CatalogCard`/`CatalogBlock`/`SearchClient` (estados, máximo 12, bloques ocultos/visibles, atajos sin `q`, URL con `replaceState`), `SearchTrigger` en `Header`, redirecciones en `next.config` (prueba de la tabla), `DealsClient` sin búsqueda, `HashtagClient`/`StoreClient` sin campo, `icons.test.ts`, sitemap.
- Final: suites, typecheck, lint, build; búsqueda real en AliExpress desde un deploy preview de Vercel con las variables puestas; `check-views.mjs`.

## 10. Despliegue

1. Migración `20261109000000_catalog.sql` por la Management API; registro; `check-views.mjs`.
2. Variables `ALIEXPRESS_*` en Vercel (Production/Preview), redeploy.
3. Bot: desplegar; con `AWIN_PUBLISHER_ID`, `AWIN_API_TOKEN` y algún `mid` en `AWIN_MERCHANTS`, el runner `awin_feeds` descarga los feeds en la primera pasada (o antes con `last_run_at = null`).
4. README del bot (runner, límites) y de la web (`/buscar`, ruta de API, variables, función de catálogo).
